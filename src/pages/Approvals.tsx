import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBadgeCheck, LuCircleAlert, LuClock3, LuLoaderCircle, LuLock, LuReceiptText, LuUserRound, LuX } from 'react-icons/lu'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal'
import { type ReceiptProfile } from '@/components/pos/OrderReceipt'

// How many already-decided (cancelled) orders to show below the live queue —
// enough recent history to check a decision without pulling the property's
// entire cancellation record every time this page loads.
const HISTORY_LIMIT = 100

type OrderItem = { id: string; quantity: number; menuItem: { name: string } | null; variant: { name: string } | null }
type PendingOrder = {
  id: string
  orderNumber: number
  status: string
  statusBeforeCancel: string | null
  total: number
  cancelReason: string | null
  cancelRequestedBy: string | null
  cancelRequestedAt: string | null
  cancelDecidedBy: string | null
  cancelDecidedAt: string | null
  cancelDecisionNote: string | null
  table: { label: string } | null
  customer: { firstName: string; lastName: string | null } | null
  items: OrderItem[]
}
type Employee = { id: string; firstName: string; lastName: string | null }
type ReturnRequest = {
  id: string
  quantity: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedBy: string | null
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  order: PendingOrder
  orderItem: { id: string; quantity: number; menuItem: { name: string } | null; variant: { name: string } | null }
}
type ReturnRequestGroup = { order: PendingOrder; requests: ReturnRequest[] }

const money = (v: number) => `KSh ${Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const ago = (iso: string | null) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleString()
}

export default function Approvals() {
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  // This queue is only useful to someone who can actually decide a
  // cancellation — a plain waiter has no reason to browse other staff's
  // requests. The list itself is already ownership-scoped server-side
  // (canSeeAllOrders), so this is a UI courtesy, not the real access
  // control — but it stops a Sales-section role from stumbling onto approve/
  // reject buttons that would just 403.
  const canApprove = Boolean(user?.role?.permissions.includes('POS_APPROVE_CANCELLATION'))
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [returns, setReturns] = useState<ReturnRequest[]>([])
  const [decided, setDecided] = useState<PendingOrder[]>([])
  const [decidedReturns, setDecidedReturns] = useState<ReturnRequest[]>([])
  const [staff, setStaff] = useState<Record<string, string>>({})
  const [profile, setProfile] = useState<ReceiptProfile>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [pending, pendingReturns, history, returnHistory] = await Promise.all([
        api<{ orders: PendingOrder[] }>('/pos/orders?channel=FOOD&status=PENDING_CANCELLATION'),
        api<{ requests: ReturnRequest[] }>('/pos/return-requests?status=PENDING'),
        api<{ orders: PendingOrder[] }>(`/pos/orders?channel=FOOD&status=CANCELLED&limit=${HISTORY_LIMIT}`),
        api<{ requests: ReturnRequest[] }>(`/pos/return-requests?status=APPROVED&limit=${HISTORY_LIMIT}`),
      ])
      setOrders(pending.orders)
      setReturns(pendingReturns.requests)
      setDecided(history.orders)
      setDecidedReturns(returnHistory.requests)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load approvals'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { if (canApprove) void load(); else setLoading(false) }, [load, canApprove])
  useEffect(() => {
    api<{ employees: Employee[] }>('/employees').then((r) => {
      setStaff(Object.fromEntries(r.employees.map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()])))
    }).catch(() => {})
    api<{ profile: ReceiptProfile }>('/business-profile').then((r) => setProfile(r.profile)).catch(() => {})
  }, [])

  async function decide(order: PendingOrder, action: 'approve' | 'reject') {
    let note: string | undefined
    if (action === 'reject') {
      const input = window.prompt(`Reject the cancellation of order #${order.orderNumber}? Optional note for the waiter:`, '')
      if (input === null) return
      note = input.trim() || undefined
    } else if (!window.confirm(`Approve cancelling order #${order.orderNumber}? It will be marked cancelled.`)) {
      return
    }
    setBusyId(order.id)
    try {
      await api(`/pos/orders/${order.id}/cancel/${action}`, { method: 'POST', body: JSON.stringify(action === 'reject' ? { note } : {}) })
      toast.success(action === 'approve' ? `Order #${order.orderNumber} cancelled.` : `Cancellation of #${order.orderNumber} rejected.`)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the decision')
    } finally {
      setBusyId(null)
    }
  }

  async function decideReturnGroup(group: ReturnRequestGroup, action: 'approve' | 'reject') {
    const summary = group.requests.map((request) => `${request.quantity} x ${request.orderItem.menuItem?.name ?? 'item'}${request.orderItem.variant ? ` (${request.orderItem.variant.name})` : ''}`).join(', ')
    let note: string | undefined
    if (action === 'reject') {
      const input = window.prompt(`Reject return request for order #${group.order.orderNumber}? Optional note for the waiter:`, '')
      if (input === null) return
      note = input.trim() || undefined
    } else if (!window.confirm(`Approve returning ${summary} from order #${group.order.orderNumber}? Stock will be returned and the order total reduced.`)) {
      return
    }
    setBusyId(group.order.id)
    try {
      for (const request of group.requests) {
        await api(`/pos/return-requests/${request.id}/${action}`, { method: 'POST', body: JSON.stringify(action === 'reject' ? { note } : {}) })
      }
      toast.success(action === 'approve' ? `Return approved for #${group.order.orderNumber}.` : `Return rejected for #${group.order.orderNumber}.`)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the decision')
    } finally {
      setBusyId(null)
    }
  }

  const returnGroups = useMemo(() => {
    const byOrder = new Map<string, ReturnRequestGroup>()
    for (const request of returns) {
      // An order with a whole-order return pending is decided ONCE, on its
      // cancellation card — its item-level requests close automatically with
      // that decision, so listing them again would show the order twice.
      if (request.order.status === 'PENDING_CANCELLATION') continue
      const group = byOrder.get(request.order.id) ?? { order: request.order, requests: [] }
      group.requests.push(request)
      byOrder.set(request.order.id, group)
    }
    return [...byOrder.values()]
  }, [returns])
  const heading = useMemo(() => `${orders.length + returnGroups.length} awaiting decision`, [orders.length, returnGroups.length])

  if (!canApprove) {
    return (
      <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
        <PageBanner kicker="Sales" title="Approvals" />
        <div className="mt-6 flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          <LuLock className="size-5" />
          You don't have permission to approve cancellations. Ask a manager to grant "Approve order cancellations" on your role.
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Sales" title="Approvals" />

      {error && <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <SectionHead title="Cancellation requests" hint="Approve to cancel the order, or reject to send it back." count={heading} />

      {loading ? (
        <div className="mt-4 flex min-h-40 items-center justify-center gap-2 border bg-card text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
      ) : orders.length === 0 ? (
        <div className="mt-4 border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">Nothing waiting for approval.</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {orders.map((order) => (
            <article key={order.id} className="border border-l-4 border-l-warning bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold">Order #{order.orderNumber}</h2>
                    <StatusPill tone="warning">Pending approval</StatusPill>
                    {order.statusBeforeCancel && <StatusPill tone="muted">was {order.statusBeforeCancel.toLowerCase()}</StatusPill>}
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{order.table?.label ?? 'Takeaway'}</span>
                    <span className="flex items-center gap-1"><LuUserRound className="size-3.5" /> {order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}` : 'Walk-in'}</span>
                    <span className="flex items-center gap-1"><LuClock3 className="size-3.5" /> requested {ago(order.cancelRequestedAt)}{order.cancelRequestedBy && staff[order.cancelRequestedBy] ? ` by ${staff[order.cancelRequestedBy]}` : ''}</span>
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums">{money(order.total)}</p>
              </div>

              <div className="mt-3 border bg-muted/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Reason</p>
                <p className="mt-0.5 text-sm">{order.cancelReason || <span className="italic text-muted-foreground">No reason given</span>}</p>
              </div>

              {(() => {
                const folded = returns.filter((request) => request.order.id === order.id).reduce((sum, request) => sum + request.quantity, 0)
                return folded > 0 ? (
                  <p className="mt-3 border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
                    This order also has {folded} item{folded === 1 ? '' : 's'} waiting on their own return requests. Deciding this closes those too — nothing else to approve for #{order.orderNumber}.
                  </p>
                ) : null
              })()}

              {order.items.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {order.items.map((i) => `${i.quantity}× ${i.menuItem?.name ?? 'item'}${i.variant ? ` (${i.variant.name})` : ''}`).join(' · ')}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton tone="success" icon={<LuBadgeCheck />} loading={busyId === order.id} onClick={() => void decide(order, 'approve')}>Approve cancellation</ActionButton>
                <ActionButton tone="danger" icon={<LuX />} disabled={busyId === order.id} onClick={() => void decide(order, 'reject')}>Reject</ActionButton>
                <ActionButton tone="neutral" icon={<LuReceiptText />} onClick={() => setReceiptId(order.id)}>Receipt</ActionButton>
              </div>
            </article>
          ))}
        </div>
      )}

      <SectionHead title="Partial return requests" count={`${returnGroups.length} waiting`} />
      {!loading && returnGroups.length === 0 ? (
        <div className="mt-4 border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No partial returns waiting for approval.</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {returnGroups.map((group) => {
            const first = group.requests[0]
            const requestedByItem = new Map<string, number>()
            for (const request of group.requests) requestedByItem.set(request.orderItem.id, (requestedByItem.get(request.orderItem.id) ?? 0) + request.quantity)
            const reason = [...new Set(group.requests.map((request) => request.reason).filter(Boolean))].join(' | ')
            const requestedQty = group.requests.reduce((sum, request) => sum + request.quantity, 0)
            return (
            <article key={group.order.id} className="border border-l-4 border-l-warning bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold">Order #{group.order.orderNumber}</h2>
                    <StatusPill tone="warning">Return requested</StatusPill>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {requestedQty} item{requestedQty === 1 ? '' : 's'} requested {ago(first.requestedAt)}
                    {first.requestedBy && staff[first.requestedBy] ? ` by ${staff[first.requestedBy]}` : ''}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums">{money(group.order.total)}</p>
              </div>
              <div className="mt-3 overflow-hidden border">
                <div className="flex items-center justify-between bg-primary px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
                  <span>Receipt lines</span>
                  <span>Returning</span>
                </div>
                <div className="divide-y">
                  {group.order.items.map((item) => {
                    const returning = requestedByItem.get(item.id) ?? 0
                    return (
                      <div key={item.id} className={cn('grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm', returning > 0 && 'bg-warning/10')}>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{item.quantity} x {item.menuItem?.name ?? 'item'}{item.variant ? ` (${item.variant.name})` : ''}</p>
                          <p className="text-[11px] text-muted-foreground">Original order quantity</p>
                        </div>
                        {returning > 0 ? (
                          <span className="self-center"><StatusPill tone="warning">{returning} back</StatusPill></span>
                        ) : (
                          <span className="self-center text-xs text-muted-foreground">-</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="mt-3 border bg-muted/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Reason</p>
                <p className="mt-0.5 text-sm">{reason}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton tone="success" icon={<LuBadgeCheck />} loading={busyId === group.order.id} onClick={() => void decideReturnGroup(group, 'approve')}>Approve return</ActionButton>
                <ActionButton tone="danger" icon={<LuX />} disabled={busyId === group.order.id} onClick={() => void decideReturnGroup(group, 'reject')}>Reject</ActionButton>
                <ActionButton tone="neutral" icon={<LuReceiptText />} onClick={() => setReceiptId(group.order.id)}>Receipt</ActionButton>
              </div>
            </article>
            )
          })}
        </div>
      )}

      <SectionHead title="Recently decided" hint="Cancellations" count={`last ${decided.length}`} />
      {!loading && decided.length === 0 ? (
        <div className="mt-4 border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No cancellations decided yet.</div>
      ) : (
        <div className="mt-4 overflow-x-auto border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr><th className={TH}>Order</th><th className={TH}>Reason</th><th className={TH}>Decided</th><th className={cn(TH, 'text-right')}>Total</th><th className={cn(TH, 'text-right')}>Receipt</th></tr>
            </thead>
            <tbody className="divide-y">
              {decided.map((order) => (
                <tr key={order.id} className="align-middle even:bg-muted/30">
                  <td className="px-5 py-3"><span className="mr-2 font-semibold">#{order.orderNumber}</span><StatusPill tone="danger">Cancelled</StatusPill></td>
                  <td className="max-w-xs truncate px-5 py-3 text-muted-foreground">{order.cancelReason || 'No reason given'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">{order.cancelDecidedBy && staff[order.cancelDecidedBy] ? `${staff[order.cancelDecidedBy]} · ` : ''}{order.cancelDecidedAt ? ago(order.cancelDecidedAt) : ''}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{money(order.total)}</td>
                  <td className="px-5 py-3"><div className="flex justify-end"><ActionButton tone="neutral" icon={<LuReceiptText />} title="View receipt" onClick={() => setReceiptId(order.id)} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionHead title="Recently approved returns" hint="Partial returns" count={`last ${decidedReturns.length}`} />
      {!loading && decidedReturns.length === 0 ? (
        <div className="mt-4 border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No partial returns approved yet.</div>
      ) : (
        <div className="mt-4 overflow-x-auto border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr><th className={TH}>Order</th><th className={TH}>Item</th><th className={TH}>Decided</th><th className={cn(TH, 'text-right')}>Receipt</th></tr>
            </thead>
            <tbody className="divide-y">
              {decidedReturns.map((request) => (
                <tr key={request.id} className="align-middle even:bg-muted/30">
                  <td className="px-5 py-3"><span className="mr-2 font-semibold">#{request.order.orderNumber}</span><StatusPill tone="success">Returned</StatusPill></td>
                  <td className="px-5 py-3 text-muted-foreground">{request.quantity}× {request.orderItem.menuItem?.name ?? 'item'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">{request.decidedBy && staff[request.decidedBy] ? `${staff[request.decidedBy]} · ` : ''}{request.decidedAt ? ago(request.decidedAt) : ''}</td>
                  <td className="px-5 py-3"><div className="flex justify-end"><ActionButton tone="neutral" icon={<LuReceiptText />} title="View receipt" onClick={() => setReceiptId(request.order.id)} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {receiptId && <ReceiptPreviewModal orderId={receiptId} profile={profile} onClose={() => setReceiptId(null)} />}
    </div>
  )
}

const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'

function SectionHead({ title, hint, count }: { title: string; hint?: string; count?: string }) {
  return (
    <div className="mb-0 mt-8 flex items-end justify-between gap-3 border-l-4 border-accent pl-3">
      <div>
        <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {count && <span className="border bg-muted px-2.5 py-1 text-xs font-bold tabular-nums text-foreground">{count}</span>}
    </div>
  )
}
