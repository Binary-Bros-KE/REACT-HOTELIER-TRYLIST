import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuPrinter, LuShare2, LuUserPlus, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import CustomerSelectModal, { type SaleParty } from '@/components/pos/CustomerSelectModal'
import OrderReceipt, { type ReceiptOrder, type ReceiptProfile } from './OrderReceipt'
import { printReceipt } from '@/lib/thermalPrinter'
import { receiptToText, shareReceipt } from '@/lib/receipt'

type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type CheckedInStay = { id: string; reservationNo: string; customer: { firstName: string; lastName: string | null }; room: { number: string } }
type Order = ReceiptOrder & {
  id: string
  notes: string | null
  total: number
  paid: number
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID'
  customer: { id: string; firstName: string; lastName: string | null; balance?: string | number | null } | null
  // Present when the tab was rung up "bill to Room X" — settlement then
  // defaults to charging that folio (staff can still switch to cash).
  reservation: CheckedInStay | null
}

const formatKes = (value: number | string) => `KSh ${Number(value).toLocaleString()}`

// Mirrors the server's RETURN_WINDOW_MS (pos.routes.ts) purely for this
// hint — the real cutoff is enforced server-side regardless of what the
// client thinks, so this can never be a security check, just a label.
const RETURN_WINDOW_MS = 60 * 60 * 1000

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs} h ${mins % 60} min ago`
}

/** The full "view a served order, print/preview the bill, settle it (cash
 * now or charged to a checked-in guest's room), or cancel it before serving"
 * flow — shared by Tables.tsx and the Point of Sale's Active Orders tab so
 * neither has to keep its own copy of this in sync. */
export default function OrderSettlementPanel({ orderId, title, subtitle, profile, paymentMethods, onClose, onChanged }: {
  orderId: string
  title: string
  subtitle?: string
  profile: ReceiptProfile
  paymentMethods: PaymentMethod[]
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function handlePrint() {
    if (!order || printing) return
    setPrinting(true)
    try {
      const result = await printReceipt(order, profile)
      if (result.method === 'thermal') toast.success('Receipt sent to printer')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not print the receipt')
    } finally {
      setPrinting(false)
    }
  }

  async function handleShare() {
    if (!order || sharing) return
    setSharing(true)
    try {
      let shareUrl: string | undefined
      try {
        const r = await api<{ url: string }>(`/pos/orders/${order.id}/share`, { method: 'POST', body: '{}' })
        shareUrl = r.url
      } catch { /* endpoint not available — share text only */ }
      await shareReceipt(receiptToText(order, profile, shareUrl))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not share the receipt')
    } finally {
      setSharing(false)
    }
  }

  const [mode, setMode] = useState<'PAY' | 'ROOM'>('PAY')
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [staySearch, setStaySearch] = useState('')
  const [stays, setStays] = useState<CheckedInStay[]>([])
  const [reservationId, setReservationId] = useState('')
  const [paying, setPaying] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [settling, setSettling] = useState(false)
  const [custModalOpen, setCustModalOpen] = useState(false)
  const [creditReason, setCreditReason] = useState('')
  const [creditExpectedAt, setCreditExpectedAt] = useState('')

  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId)
  const selectedStay = stays.find((s) => s.id === reservationId)
  const remaining = order ? Math.max(0, order.total - order.paid) : 0
  const isComplementary = order?.saleType === 'COMPLIMENTARY'
  const isCreditOverdue = !!order?.creditExpectedAt && remaining > 0.01 && new Date(order.creditExpectedAt).getTime() < Date.now()

  async function loadOrder() {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ order: Order }>(`/pos/orders/${orderId}`)
      setOrder(response.order)
      setAmount(String(Math.max(0, response.order.total - response.order.paid)))
      setCreditReason(response.order.creditReason ?? '')
      setCreditExpectedAt(response.order.creditExpectedAt ? response.order.creditExpectedAt.slice(0, 10) : '')
      if (response.order.reservation) {
        setMode('ROOM')
        setReservationId(response.order.reservation.id)
        setStays([response.order.reservation])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this order')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadOrder() }, [orderId])

  useEffect(() => {
    if (mode !== 'ROOM') return
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ status: 'CHECKED_IN' })
      if (staySearch.trim()) query.set('search', staySearch.trim())
      api<{ reservations: CheckedInStay[] }>(`/reception/reservations?${query}`).then((r) => setStays(r.reservations)).catch(() => setStays([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [mode, staySearch])

  async function completeOrder() {
    if (!order || settling) return
    if (remaining > 0.01) {
      if (!order.customer) { setCustModalOpen(true); return }
      if (!creditReason.trim() || !creditExpectedAt) { const message = 'Give a credit reason and expected payment date'; setError(message); toast.error(message); return }
      const who = `${order.customer.firstName} ${order.customer.lastName ?? ''}`.trim()
      if (!window.confirm(`${formatKes(remaining)} will be added to ${who}'s balance as credit. Complete the order now?`)) return
    }
    setError('')
    setSettling(true)
    try {
      const response = await api<{ order: Order }>(`/pos/orders/${order.id}/settle`, {
        method: 'POST',
        body: JSON.stringify(remaining > 0.01 ? { creditReason: creditReason.trim(), creditExpectedAt } : {}),
      })
      setOrder(response.order)
      toast.success(remaining > 0.01 ? 'Order completed on credit.' : 'Order completed.')
      onChanged()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not complete this order'
      setError(message)
      toast.error(message)
    } finally {
      setSettling(false)
    }
  }

  async function attachCustomer(party: SaleParty) {
    setCustModalOpen(false)
    if (!order || party.kind !== 'CUSTOMER') return
    setError('')
    try {
      const response = await api<{ order: Order }>(`/pos/orders/${order.id}/customer`, { method: 'POST', body: JSON.stringify({ customerId: party.customer.id }) })
      setOrder(response.order)
      toast.success('Customer attached.')
      onChanged()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not attach the customer'
      setError(message)
      toast.error(message)
    }
  }

  async function requestCancellation() {
    if (!order) return
    const reason = cancelReason.trim()
    if (reason.length < 3) { const message = 'Give a reason for the cancellation'; setError(message); toast.error(message); return }
    setError('')
    setCancelling(true)
    try {
      await api(`/pos/orders/${order.id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) })
      toast.success(order.servedAt ? 'Return requested.' : 'Cancellation requested.')
      onChanged()
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not submit the cancellation'
      setError(message)
      toast.error(message)
    } finally {
      setCancelling(false)
    }
  }

  async function settle(event: FormEvent) {
    event.preventDefault()
    if (!order) return
    if (mode === 'PAY' && !paymentMethodId) return
    if (mode === 'ROOM' && !reservationId) { const message = 'Choose a checked-in stay to bill this to'; setError(message); toast.error(message); return }
    if (mode === 'PAY' && selectedMethod?.requiresReference && !reference.trim()) { const message = `${selectedMethod.name} requires a reference number`; setError(message); toast.error(message); return }
    setPaying(true)
    setError('')
    try {
      const response = await api<{ order: Order }>(`/pos/orders/${order.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'PAY'
            ? { method: 'PAY', paymentMethodId, amount: Number(amount) || remaining, reference: reference || undefined }
            : { method: 'ROOM', reservationId, amount: Number(amount) || remaining },
        ),
      })
      setOrder(response.order)
      setAmount(String(Math.max(0, response.order.total - response.order.paid)))
      setReference('')
      toast.success(mode === 'PAY' ? 'Payment recorded.' : 'Charged to room.')
      onChanged()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record this payment'
      setError(message)
      toast.error(message)
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
        <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-secondary">{title}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{order ? `Order #${order.orderNumber}` : 'Loading…'}</h2>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
              <LuCircleAlert />
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-6 flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading order…</div>
          ) : !order ? (
            <p className="mt-6 text-sm text-muted-foreground">This order could not be found.</p>
          ) : (
            <>
              {order.customer && (
                <p className="mt-4 text-sm">
                  <span className="text-muted-foreground">Customer:</span> {order.customer.firstName} {order.customer.lastName ?? ''}
                  {Number(order.customer.balance ?? 0) > 0 && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">Owes {formatKes(order.customer.balance ?? 0)}</span>}
                </p>
              )}
              {order.reservation && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-sm bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary">
                  Rung up to bill Room {order.reservation.room.number}
                </p>
              )}

              {/* The receipt itself — items, tax breakdown, served-by, time
                  placed, payments — shown directly rather than behind a
                  "view receipt" button, since it's already the richest,
                  most useful view of what's happening with this order. */}
              <div className="mt-4 -mx-6 border-y bg-muted/20">
                <OrderReceipt order={order} profile={profile} />
              </div>
              <div className="mt-1 flex items-center gap-2 border-b pb-4">
                <button
                  onClick={() => void handlePrint()}
                  disabled={printing}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {printing ? <LuLoaderCircle className="size-3.5 animate-spin" /> : <LuPrinter className="size-3.5" />} Print
                </button>
                <button
                  onClick={() => void handleShare()}
                  disabled={sharing}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-accent px-3 py-2.5 text-xs font-bold text-accent-foreground disabled:opacity-50"
                >
                  {sharing ? <LuLoaderCircle className="size-3.5 animate-spin" /> : <LuShare2 className="size-3.5" />} Share
                </button>
              </div>

              <div className="mt-4 flex justify-between border-b pb-4 text-base">
                <span className="font-semibold">Balance due</span>
                <span className="flex items-center gap-2">
                  {order.paymentStatus === 'PARTIAL' && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">Part-paid</span>}
                  {isComplementary && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">Complementary</span>}
                  {!isComplementary && order.paymentStatus === 'UNPAID' && remaining > 0 && order.status === 'COMPLETED' && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', isCreditOverdue ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning')}>{isCreditOverdue ? 'Overdue' : 'On credit'}</span>}
                  <span className="font-bold">{formatKes(remaining)}</span>
                </span>
              </div>

              {order.status === 'PENDING_CANCELLATION' ? (
                <p className="mt-2 rounded-sm border border-warning/40 bg-warning/10 p-3 text-center text-xs font-semibold text-warning">
                  {order.servedAt ? 'Return' : 'Cancellation'} requested — waiting for approval.
                </p>
              ) : order.status === 'CANCELLED' ? null : (() => {
                const isReturn = order.status === 'SERVED' || order.status === 'COMPLETED'
                const withinWindow = !order.servedAt || Date.now() - new Date(order.servedAt).getTime() <= RETURN_WINDOW_MS
                if (isReturn && !withinWindow) {
                  return (
                    <p className="mt-2 rounded-sm border border-dashed p-3 text-center text-xs text-muted-foreground">
                      Returns are only allowed within 1 hour of being served — this one was served {timeAgo(order.servedAt!)}.
                    </p>
                  )
                }
                return cancelOpen ? (
                  <div className="mt-2 space-y-2 rounded-sm border border-destructive/30 p-3">
                    <label className="block text-xs font-semibold text-destructive">Reason for {isReturn ? 'the return' : 'cancelling'}</label>
                    <textarea
                      autoFocus rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g. customer left, wrong order rung up…"
                      className="w-full rounded-sm border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setCancelOpen(false); setCancelReason('') }} className="flex-1 rounded-sm border py-2 text-xs font-semibold hover:bg-muted">Back</button>
                      <button disabled={cancelling} onClick={() => void requestCancellation()} className="flex-1 rounded-sm bg-destructive py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50">
                        {cancelling ? 'Submitting…' : 'Submit for approval'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setCancelOpen(true)} className="mt-2 w-full rounded-sm border border-destructive/30 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10">
                    {isReturn ? `Request return · ${timeAgo(order.servedAt!)}` : 'Request cancellation'}
                  </button>
                )
              })()}

              {(order.status === 'SERVED' || order.status === 'COMPLETED') && remaining > 0.01 && (
                <form onSubmit={settle} className="mt-5 space-y-3 border-t pt-5">
                  <div className="flex gap-1 rounded-sm bg-muted/50 p-1">
                    {(['PAY', 'ROOM'] as const).map((value) => (
                      <button key={value} type="button" onClick={() => setMode(value)} className={cn('flex-1 rounded-sm py-1.5 text-sm font-semibold', mode === value ? 'bg-card text-secondary shadow-sm' : 'text-muted-foreground')}>
                        {value === 'PAY' ? 'Pay now' : 'Charge to Room'}
                      </button>
                    ))}
                  </div>

                  {mode === 'PAY' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm font-medium">
                          Method
                          <select className="input mt-1.5" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                            <option value="">Select method</option>
                            {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </label>
                        <label className="block text-sm font-medium">
                          Amount
                          <input required type="number" min="0" step="0.01" max={remaining} className="input mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        </label>
                      </div>
                      <label className="block text-sm font-medium">
                        {selectedMethod?.requiresReference ? 'Reference' : 'Reference (optional)'}
                        <input placeholder="e.g. M-Pesa code" required={selectedMethod?.requiresReference} className="input mt-1.5" value={reference} onChange={(e) => setReference(e.target.value)} />
                      </label>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Search checked-in stays
                        <input placeholder="Guest name, room, reservation no…" className="input mt-1.5" value={staySearch} onChange={(e) => { setStaySearch(e.target.value); setReservationId('') }} />
                      </label>
                      {selectedStay ? (
                        <div className="flex items-center justify-between rounded-sm border bg-secondary/5 p-2.5 text-sm">
                          <span>Room {selectedStay.room.number} — {selectedStay.customer.firstName} {selectedStay.customer.lastName ?? ''} ({selectedStay.reservationNo})</span>
                          <button type="button" onClick={() => setReservationId('')} className="text-xs font-semibold text-secondary hover:underline">Change</button>
                        </div>
                      ) : (
                        <div className="max-h-32 space-y-1 overflow-y-auto">
                          {stays.length === 0 && <p className="p-1.5 text-center text-xs text-muted-foreground">No checked-in stays match.</p>}
                          {stays.map((stay) => (
                            <button key={stay.id} type="button" onClick={() => setReservationId(stay.id)} className="block w-full rounded-sm border p-2 text-left text-xs hover:bg-muted/40">
                              Room {stay.room.number} — {stay.customer.firstName} {stay.customer.lastName ?? ''} <span className="text-muted-foreground">({stay.reservationNo})</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <label className="block text-sm font-medium">
                        Amount
                        <input required type="number" min="0" step="0.01" max={remaining} className="input mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      </label>
                    </div>
                  )}

                  <button disabled={paying || (mode === 'PAY' ? !paymentMethodId : !reservationId)} className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                    {paying && <LuLoaderCircle className="animate-spin" />}
                    {mode === 'PAY' ? 'Record payment' : 'Charge to room'}
                  </button>
                </form>
              )}

              {order.status === 'SERVED' && (
                <div className="mt-3 space-y-2">
                  {remaining > 0.01 && !order.customer && (
                    <button
                      type="button"
                      onClick={() => setCustModalOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-sm border py-2 text-xs font-semibold hover:bg-muted"
                    >
                      <LuUserPlus className="size-3.5" /> Add a customer to complete on credit
                    </button>
                  )}
                  {remaining > 0.01 && order.customer && (
                    <div className="space-y-2 rounded-sm border bg-warning/5 p-3">
                      <label className="block text-xs font-semibold text-warning">
                        Reason for credit
                        <textarea rows={2} value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="e.g. client requested credit until salary date" className="mt-1.5 w-full rounded-sm border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
                      </label>
                      <label className="block text-xs font-semibold text-warning">
                        Expected payment date
                        <input type="date" value={creditExpectedAt} onChange={(e) => setCreditExpectedAt(e.target.value)} className="input mt-1.5" />
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={settling || (remaining > 0.01 && (!order.customer || !creditReason.trim() || !creditExpectedAt))}
                    onClick={() => void completeOrder()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground disabled:opacity-50"
                  >
                    {settling && <LuLoaderCircle className="animate-spin" />}
                    {remaining > 0.01 ? `Complete on credit · ${formatKes(remaining)} owing` : 'Complete order'}
                  </button>
                </div>
              )}

              {order.status === 'READY' && <p className="mt-5 text-sm text-warning">Waiting for the waiter to mark this order served before payment can be taken.</p>}
              {order.status === 'COMPLETED' && remaining <= 0.01 && <p className="mt-5 text-sm font-semibold text-success">{isComplementary ? 'Completed.' : 'Paid in full.'}</p>}
              {order.status === 'COMPLETED' && remaining > 0.01 && (
                <div className={cn('mt-5 rounded-sm border p-3 text-sm', isCreditOverdue ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning')}>
                  <p className="font-semibold">{isCreditOverdue ? 'Overdue credit' : 'Completed on credit'}: {formatKes(remaining)} owing.</p>
                  {order.creditReason && <p className="mt-1 text-xs">Reason: {order.creditReason}</p>}
                  {order.creditExpectedAt && <p className="mt-1 text-xs">Expected: {new Date(order.creditExpectedAt).toLocaleDateString()}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {custModalOpen && (
        <CustomerSelectModal
          party={order?.customer ? { kind: 'CUSTOMER', customer: { id: order.customer.id, firstName: order.customer.firstName, lastName: order.customer.lastName, phone: '' } } : { kind: 'WALK_IN' }}
          onChange={(p) => void attachCustomer(p)}
          onClose={() => setCustModalOpen(false)}
        />
      )}
    </>
  )
}
