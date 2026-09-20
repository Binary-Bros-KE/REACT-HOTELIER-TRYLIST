import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { CustomerSelectField, type SaleParty } from './CustomerSelectModal'

export type PaymentMethod = { id: string; name: string; requiresReference: boolean }
export type CreatedOrder = { id: string; orderNumber: number }
type CheckedInStay = { id: string; reservationNo: string; customer: { firstName: string; lastName: string | null }; room: { number: string } }

const formatKes = (price: number) => `KSh ${price.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Shared "ring up and pay" checkout for the Products and Services POS
 * screens — neither has a kitchen step, so creating the order and settling
 * it happen back-to-back behind one button, unlike the food POS's separate
 * send-to-kitchen / take-payment steps. */
export default function RetailCheckoutModal({ items, total, channel, locationId, discount, methods, onClose, onComplete }: {
  items: { id: string; quantity: number }[]
  total: number
  channel: 'PRODUCTS' | 'SERVICES'
  locationId: string | undefined
  discount: number
  methods: PaymentMethod[]
  onClose: () => void
  onComplete: (order: CreatedOrder) => void
}) {
  const [mode, setMode] = useState<'PAY' | 'ROOM'>('PAY')
  const [party, setParty] = useState<SaleParty>({ kind: 'WALK_IN' })
  const [paymentMethodId, setPaymentMethodId] = useState(methods[0]?.id ?? '')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState(String(total))
  const [staySearch, setStaySearch] = useState('')
  const [stays, setStays] = useState<CheckedInStay[]>([])
  const [reservationId, setReservationId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const selectedMethod = methods.find((m) => m.id === paymentMethodId)
  const selectedStay = stays.find((s) => s.id === reservationId)

  useEffect(() => {
    if (mode !== 'ROOM') return
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ status: 'CHECKED_IN' })
      if (staySearch.trim()) query.set('search', staySearch.trim())
      api<{ reservations: CheckedInStay[] }>(`/reception/reservations?${query}`).then((r) => setStays(r.reservations)).catch(() => setStays([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [mode, staySearch])

  // Picking a checked-in room as the customer means "bill this to that room"
  // — flip straight to the ROOM tab with the stay already locked in.
  useEffect(() => {
    if (party.kind !== 'ROOM') return
    setMode('ROOM')
    setReservationId(party.reservationId)
    setStays((current) => current.some((s) => s.id === party.reservationId)
      ? current
      : [...current, { id: party.reservationId, reservationNo: party.reservationNo, customer: party.customer, room: { number: party.roomNumber } }])
  }, [party])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'PAY' && !paymentMethodId) return
    if (mode === 'ROOM' && !reservationId) { setError('Choose a checked-in stay to bill this to'); return }
    if (mode === 'PAY' && selectedMethod?.requiresReference && !reference.trim()) { setError(`${selectedMethod.name} requires a reference number`); return }
    setSubmitting(true)
    setError('')
    try {
      const orderResponse = await api<{ order: CreatedOrder }>('/pos/retail-orders', {
        method: 'POST',
        body: JSON.stringify({
          channel,
          locationId,
          discount,
          customerId: party.kind === 'WALK_IN' ? undefined : party.customer.id,
          items: items.map((item) => channel === 'PRODUCTS' ? { productId: item.id, quantity: item.quantity } : { serviceId: item.id, quantity: item.quantity }),
        }),
      })
      // Settlement — cash/card now, or charged to a room — always happens as
      // a second, separate call, decided right here at checkout rather than
      // baked into order creation.
      await api(`/pos/orders/${orderResponse.order.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(
          mode === 'PAY'
            ? { method: 'PAY', paymentMethodId, amount: Number(amount) || total, reference: reference || undefined }
            : { method: 'ROOM', reservationId, amount: total },
        ),
      })
      onComplete(orderResponse.order)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the sale')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="-mx-6 -mt-6 flex items-start justify-between border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Checkout</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{formatKes(total)}</h2>
          </div>
          <button type="button" onClick={onClose} title="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX /></button>
        </div>

        {error && <div className="mt-4 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="mt-5 flex gap-1 rounded-sm bg-muted/50 p-1">
          {([['PAY', 'Pay now'], ['ROOM', 'Bill to Room']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`flex-1 rounded-sm py-1.5 text-sm font-semibold ${mode === value ? 'bg-card shadow-sm text-secondary' : 'text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <CustomerSelectField party={party} onChange={setParty} />
        </div>

        {mode === 'PAY' ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              Payment method
              <select required className="input mt-1.5" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                <option value="">Select method</option>
                {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Amount received
              <input required type="number" min="0" step="0.01" className="input mt-1.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              {selectedMethod?.requiresReference ? 'Reference *' : 'Reference (optional)'}
              <input required={selectedMethod?.requiresReference} placeholder="e.g. M-Pesa code" className="input mt-1.5" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              Search checked-in stays
              <input placeholder="Guest name, room, reservation no…" className="input mt-1.5" value={staySearch} onChange={(e) => { setStaySearch(e.target.value); setReservationId('') }} />
            </label>
            {selectedStay ? (
              <div className="flex items-center justify-between rounded-sm border bg-secondary/5 p-3 text-sm">
                <span>Room {selectedStay.room.number} — {selectedStay.customer.firstName} {selectedStay.customer.lastName ?? ''} ({selectedStay.reservationNo})</span>
                <button type="button" onClick={() => setReservationId('')} className="text-xs font-semibold text-secondary hover:underline">Change</button>
              </div>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {stays.length === 0 && <p className="p-2 text-center text-xs text-muted-foreground">No checked-in stays match.</p>}
                {stays.map((stay) => (
                  <button key={stay.id} type="button" onClick={() => setReservationId(stay.id)} className="block w-full rounded-sm border p-2.5 text-left text-sm hover:bg-muted/40">
                    Room {stay.room.number} — {stay.customer.firstName} {stay.customer.lastName ?? ''} <span className="text-xs text-muted-foreground">({stay.reservationNo})</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">This charge settles with the room bill at checkout — no payment is collected now.</p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button disabled={submitting || (mode === 'PAY' ? !paymentMethodId : !reservationId)} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {submitting && <LuLoaderCircle className="animate-spin" />} {mode === 'PAY' ? 'Complete sale' : 'Bill to room'}
          </button>
        </div>
      </form>
    </div>
  )
}
