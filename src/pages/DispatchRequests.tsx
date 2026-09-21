import { useCallback, useEffect, useState } from 'react'
import { LuBan, LuCircleAlert, LuLoaderCircle, LuPackageCheck, LuPrinter, LuRefreshCw, LuStore } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { printDispatchSlip, type DispatchSlip } from '@/lib/thermalPrinter'
import type { ReceiptProfile } from '@/components/pos/OrderReceipt'
import { useToast } from '@/components/ui/Toast'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import ModalShell from '@/components/ui/ModalShell'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import StatusPill from '@/components/ui/StatusPill'

type Item = { id: string; productName: string; requestedQty: string | number; dispatchedQty: string | number | null; storeQty?: number; product?: { unit: string } }
type Request = {
  id: string
  requestNo: string
  status: 'REQUESTED' | 'DISPATCHED' | 'REJECTED' | 'CANCELLED'
  orderNumber: number
  requestedAt: string
  requestedByName: string | null
  respondedAt: string | null
  respondedByName: string | null
  rejectReason: string | null
  note: string | null
  items: Item[]
  fromLocation: { name: string }
  toLocation: { name: string }
  order: { table: { label: string } | null }
}
type Tab = 'pending' | 'history'

const POLL_MS = 10_000
const qty = (value: string | number) => Number(value).toLocaleString('en-KE', { maximumFractionDigits: 3 })
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const STATUS_TONE = { REQUESTED: 'warning', DISPATCHED: 'success', REJECTED: 'danger', CANCELLED: 'muted' } as const
const STATUS_LABEL = { REQUESTED: 'Waiting', DISPATCHED: 'Dispatched', REJECTED: 'Rejected', CANCELLED: 'Cancelled' } as const

/** The store's inbox for kitchen ingredient requests: dispatch (a real stock transfer to the kitchen) or reject. */
export default function DispatchRequests() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [dispatching, setDispatching] = useState<Request | null>(null)
  const [rejecting, setRejecting] = useState<Request | null>(null)
  const seen = useState(() => ({ ids: null as Set<string> | null }))[0]

  // Manual print: this device's thermal printer if it has one, else the browser print sheet.
  async function printSlip(request: Request) {
    const slip: DispatchSlip = {
      requestNo: request.requestNo,
      orderNumber: request.orderNumber,
      table: request.order.table?.label ?? null,
      from: request.fromLocation.name,
      to: request.toLocation.name,
      requestedByName: request.requestedByName,
      requestedAt: request.requestedAt,
      note: request.note,
      items: request.items.map((i) => ({ name: i.productName, quantity: Number(i.requestedQty), unit: i.product?.unit ?? '' })),
    }
    try {
      const { profile } = await api<{ profile: ReceiptProfile }>('/business-profile').catch(() => ({ profile: null as unknown as ReceiptProfile }))
      await printDispatchSlip(slip, profile ?? null)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not print the slip') }
  }

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true)
    try {
      const data = await api<{ requests: Request[] }>(`/dispatch-requests${tab === 'history' ? '?status=history' : ''}`)
      if (tab === 'pending') {
        // Announce requests that arrived since the last poll.
        if (seen.ids) {
          const fresh = data.requests.filter((r) => !seen.ids!.has(r.id))
          if (fresh.length === 1) toast.info(`New request: order #${fresh[0].orderNumber} needs ingredients`)
          else if (fresh.length > 1) toast.info(`${fresh.length} new kitchen requests`)
        }
        seen.ids = new Set(data.requests.map((r) => r.id))
      }
      setRequests(data.requests); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load dispatch requests') }
    finally { setLoading(false); setRefreshing(false) }
  }, [tab, toast, seen])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load(true) }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const pendingCount = tab === 'pending' ? requests.length : null

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Dispatch Requests">
        <StatusPill tone="success">Live sync</StatusPill>
        <ActionButton tone="neutral" icon={<LuRefreshCw className={refreshing ? 'animate-spin' : ''} />} title="Refresh" onClick={() => void load(true)} />
      </PageBanner>

      <p className="mt-4 text-sm text-muted-foreground">Every order posted at a kitchen that uses the store lands here automatically. Dispatching moves the stock from the store to the kitchen and lets the chef start cooking. Print the slip to pick and hand over the items.</p>

      <div className="mt-5 flex w-fit border bg-card p-1">
        {([['pending', 'Waiting for you'], ['history', 'History']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={cn('px-4 py-2 text-sm font-semibold transition', tab === key ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted')}>{label}{key === 'pending' && pendingCount ? ` (${pendingCount})` : ''}</button>
        ))}
      </div>

      {tab === 'pending' && <section className="mt-5 grid gap-4 sm:grid-cols-2"><StatCard tone={requests.length ? 'warn' : undefined} index={0} label="Waiting for dispatch" value={requests.length} icon={<LuStore />} /></section>}

      {error && <div className="mt-4 flex items-center gap-2 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}

      {loading ? <div className="p-16 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        : requests.length === 0 ? <div className="mt-5 border border-dashed p-16 text-center text-sm text-muted-foreground">{tab === 'pending' ? 'No kitchen requests waiting. New ones appear here automatically.' : 'No dispatch history yet.'}</div>
        : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {requests.map((request) => (
              <article key={request.id} className="flex flex-col border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{request.requestNo}</p>
                    <h3 className="font-display text-lg font-semibold">Order #{request.orderNumber}{request.order.table ? ` · ${request.order.table.label}` : ''}</h3>
                    <p className="text-xs text-muted-foreground">{request.fromLocation.name} → {request.toLocation.name}</p>
                  </div>
                  <StatusPill tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</StatusPill>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-1.5">Item</th><th className="text-right">Asked</th>{request.status === 'REQUESTED' ? <th className="text-right">In store</th> : <th className="text-right">Sent</th>}</tr></thead>
                  <tbody className="divide-y">
                    {request.items.map((item) => {
                      const short = request.status === 'REQUESTED' && (item.storeQty ?? 0) < Number(item.requestedQty)
                      return (
                        <tr key={item.id}>
                          <td className="py-1.5 font-medium">{item.productName}</td>
                          <td className="text-right tabular-nums">{qty(item.requestedQty)}</td>
                          <td className={cn('text-right tabular-nums', short && 'font-semibold text-destructive')}>{request.status === 'REQUESTED' ? qty(item.storeQty ?? 0) : item.dispatchedQty === null ? '—' : qty(item.dispatchedQty)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">
                  Requested {when(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ''}
                  {request.status !== 'REQUESTED' && request.respondedAt ? ` · ${STATUS_LABEL[request.status].toLowerCase()} ${when(request.respondedAt)}${request.respondedByName ? ` by ${request.respondedByName}` : ''}` : ''}
                </p>
                {request.rejectReason && <p className="mt-1 text-xs text-destructive">Reason: {request.rejectReason}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {request.status === 'REQUESTED' && <ActionButton tone="success" icon={<LuPackageCheck />} onClick={() => setDispatching(request)}>Dispatch</ActionButton>}
                  {request.status === 'REQUESTED' && <ActionButton tone="danger" icon={<LuBan />} onClick={() => setRejecting(request)}>Reject</ActionButton>}
                  <ActionButton tone="neutral" icon={<LuPrinter />} onClick={() => void printSlip(request)}>Print slip</ActionButton>
                </div>
              </article>
            ))}
          </div>
        )}

      {dispatching && <DispatchModal request={dispatching} onClose={() => setDispatching(null)} onDone={() => { setDispatching(null); toast.success('Dispatched to the kitchen'); void load(true) }} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); toast.success('Request rejected'); void load(true) }} />}
    </div>
  )
}

function DispatchModal({ request, onClose, onDone }: { request: Request; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(request.items.map((i) => [i.id, String(Number(i.requestedQty))])))
  const [saving, setSaving] = useState(false)
  const partial = request.items.some((i) => Number(quantities[i.id]) < Number(i.requestedQty))
  const anything = request.items.some((i) => Number(quantities[i.id]) > 0)

  async function save() {
    setSaving(true)
    try {
      await api(`/dispatch-requests/${request.id}/dispatch`, { method: 'POST', body: JSON.stringify({ items: request.items.map((i) => ({ itemId: i.id, quantity: Number(quantities[i.id]) || 0 })) }) })
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not dispatch'); setSaving(false) }
  }

  return (
    <ModalShell kicker={request.requestNo} title={`Dispatch for order #${request.orderNumber}`} subtitle={`${request.fromLocation.name} → ${request.toLocation.name}`} onClose={onClose} size="md"
      footer={<Button onClick={() => void save()} disabled={!anything || saving}>{saving ? 'Dispatching…' : 'Dispatch to kitchen'}</Button>}>
      <div className="space-y-3 p-5">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-1.5">Item</th><th className="text-right">Asked</th><th className="text-right">In store</th><th className="w-28 text-right">Send</th></tr></thead>
          <tbody className="divide-y">
            {request.items.map((item) => (
              <tr key={item.id}>
                <td className="py-2 font-medium">{item.productName}</td>
                <td className="text-right tabular-nums">{qty(item.requestedQty)}</td>
                <td className={cn('text-right tabular-nums', (item.storeQty ?? 0) < Number(item.requestedQty) && 'font-semibold text-destructive')}>{qty(item.storeQty ?? 0)}</td>
                <td className="text-right"><input type="number" min="0" step="any" className="input h-8 w-24 text-right" value={quantities[item.id]} onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {partial && <p className="text-xs text-warning">You are sending less than was asked. The kitchen may not be able to finish the order.</p>}
        <p className="text-xs text-muted-foreground">This moves the stock out of {request.fromLocation.name} into {request.toLocation.name} and is recorded in the stock ledger.</p>
      </div>
    </ModalShell>
  )
}

function RejectModal({ request, onClose, onDone }: { request: Request; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api(`/dispatch-requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not reject'); setSaving(false) }
  }
  return (
    <ModalShell kicker={request.requestNo} title={`Reject order #${request.orderNumber}`} onClose={onClose} size="sm"
      footer={<Button variant="danger" onClick={() => void save()} disabled={reason.trim().length < 3 || saving}>{saving ? 'Rejecting…' : 'Reject request'}</Button>}>
      <div className="space-y-3 p-5">
        <label className="block text-sm font-medium">Reason for the kitchen
          <textarea rows={3} className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock, expected tomorrow" />
        </label>
        <p className="text-xs text-muted-foreground">The chef sees this reason and can send a new request.</p>
      </div>
    </ModalShell>
  )
}

