import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBan, LuCircleAlert, LuHourglass, LuLoaderCircle, LuMapPin, LuPackageCheck, LuPencil, LuPlus, LuSearch, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { useAppSelector } from '@/store/hooks'
import { useToast } from '@/components/ui/Toast'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import StatusPill from '@/components/ui/StatusPill'

type Location = { id: string; name: string; type?: string; isActive?: boolean }
type SheetProduct = { id: string; name: string; unit: string; trackingMode: 'PER_SALE' | 'ISSUE_ONLY' | 'PERIODIC_COUNT'; categoryName: string; onHand: number }
type CountRow = { id: string; name: string; unit: string; onHand: number }
type CountResult = { productId: string; name: string; expected: number; counted: number; used: number; found: number }
type Status = 'REQUESTED' | 'DISPATCHED' | 'REJECTED' | 'CANCELLED'
type RequestItem = { id: string; productId: string; productName: string; unit: string; trackingMode: SheetProduct['trackingMode']; requestedQty: number; dispatchedQty: number | null; available: number }
type StockRequest = {
  id: string
  requestNo: string
  status: Status
  note: string | null
  requestedByName: string | null
  requestedAt: string
  respondedByName: string | null
  rejectReason: string | null
  fromLocation: Location
  toLocation: Location
  items: RequestItem[]
}

const MODE_LABEL: Record<SheetProduct['trackingMode'], string> = {
  PER_SALE: 'Stocked at destination',
  ISSUE_ONLY: 'Used when issued',
  PERIODIC_COUNT: 'Counted at close',
}
const STATUS_TONE: Record<Status, 'warning' | 'success' | 'danger' | 'muted'> = { REQUESTED: 'warning', DISPATCHED: 'success', REJECTED: 'danger', CANCELLED: 'muted' }
const STATUS_LABEL: Record<Status, string> = { REQUESTED: 'Waiting', DISPATCHED: 'Dispatched', REJECTED: 'Rejected', CANCELLED: 'Cancelled' }
const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function StockIssues() {
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  const canDispatch = user?.role?.name === 'Super Admin' || Boolean(user?.role?.permissions.includes('STORE_DISPATCH'))
  const [tab, setTab] = useState<'requests' | 'store' | 'count'>('requests')
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState('')
  const { fixed, options, selectedId, setLocation, effectiveId } = useWorkingLocation(locations, { persist: false })

  useEffect(() => {
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
  }, [])

  const storeId = useMemo(() => locations.find((l) => l.type === 'STORE')?.id ?? '', [locations])
  const departmentId = effectiveId || locations.find((l) => l.type !== 'STORE' && l.isActive !== false)?.id || ''
  const tabs: readonly ('requests' | 'store' | 'count')[] = canDispatch ? ['requests', 'store', 'count'] : ['requests', 'count']

  useEffect(() => {
    if (!tabs.includes(tab)) setTab('requests')
  }, [tab, tabs])

  return (
    <div className="dashboard-square mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Stock Requests" />

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <div className="mt-6 flex w-fit flex-wrap gap-1 border bg-card p-1 shadow-sm">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-2 text-xs font-bold uppercase tracking-wider', tab === t ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted')}>
            {t === 'requests' ? 'My requests' : t === 'store' ? 'Store inbox' : 'Counts'}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <RequestsPanel
          locations={locations}
          storeId={storeId}
          departmentId={departmentId}
          fixedLocation={fixed}
          locationOptions={options}
          selectedLocationId={selectedId}
          onLocationChange={setLocation}
          onError={setError}
          toast={toast}
        />
      )}
      {tab === 'store' && <StoreInbox storeId={storeId} onError={setError} onDone={() => toast.success('Request answered.')} />}
      {tab === 'count' && <CountPanel locations={locations} onError={setError} onDone={() => toast.success('Count saved.')} />}
    </div>
  )
}

function LocationPicker({ label, value, onChange, locations, exclude }: { label: string; value: string; onChange: (id: string) => void; locations: Location[]; exclude?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="flex items-center gap-1"><LuMapPin className="size-3.5" /> {label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input min-w-56 font-normal normal-case tracking-normal">
        <option value="">Choose a location</option>
        {locations.filter((l) => l.id !== exclude && l.isActive !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  )
}

/** The requester's own history: filters, a card per request (items shown
 * inline — no need to drill in), an edit action while still pending, and
 * the "New request" button that opens the split-pane form. */
function RequestsPanel({
  locations, storeId, departmentId, fixedLocation, locationOptions, selectedLocationId, onLocationChange, onError, toast,
}: {
  locations: Location[]
  storeId: string
  departmentId: string
  fixedLocation: Location | null
  locationOptions: Location[]
  selectedLocationId: string
  onLocationChange: (id: string) => void
  onError: (m: string) => void
  toast: ReturnType<typeof useToast>
}) {
  const [requests, setRequests] = useState<StockRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; request?: StockRequest } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (departmentId) params.set('toLocationId', departmentId)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const r = await api<{ requests: StockRequest[] }>(`/stock-issues/requests?${params.toString()}`)
      setRequests(r.requests)
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load stock requests')
    } finally {
      setLoading(false)
    }
  }, [departmentId, statusFilter, onError])
  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => {
    const out: Record<Status, number> = { REQUESTED: 0, DISPATCHED: 0, REJECTED: 0, CANCELLED: 0 }
    for (const r of requests) out[r.status] += 1
    return out
  }, [requests])

  return (
    <>
      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard index={0} label="Waiting" value={counts.REQUESTED} icon={<LuHourglass />} tone={counts.REQUESTED ? 'warn' : undefined} />
        <StatCard index={1} label="Dispatched" value={counts.DISPATCHED} icon={<LuPackageCheck />} tone="success" />
        <StatCard index={2} label="Rejected" value={counts.REJECTED} icon={<LuBan />} tone="danger" />
      </section>

      <section className="mt-5 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={() => setModal({ mode: 'create' })}>New request</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
        ) : requests.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No stock requests yet.</p>
        ) : (
          <div className="divide-y">
            {requests.map((request) => (
              <article key={request.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{request.requestNo}</p>
                    <h3 className="font-display text-base font-semibold">{request.fromLocation.name} → {request.toLocation.name}</h3>
                    <p className="text-xs text-muted-foreground">Requested {when(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</StatusPill>
                    {request.status === 'REQUESTED' && <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => setModal({ mode: 'edit', request })} />}
                  </div>
                </div>
                <ul className="mt-3 divide-y text-sm">
                  {request.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="truncate">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{item.requestedQty}{item.dispatchedQty != null ? ` · sent ${item.dispatchedQty}` : ''}</span>
                    </li>
                  ))}
                </ul>
                {request.note && <p className="mt-2 text-xs text-muted-foreground">Note: {request.note}</p>}
                {request.respondedByName && request.status !== 'REQUESTED' && <p className="mt-1 text-xs text-muted-foreground">{STATUS_LABEL[request.status]} by {request.respondedByName}</p>}
                {request.rejectReason && <p className="mt-1 text-xs text-destructive">Reason: {request.rejectReason}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <RequestModal
          mode={modal.mode}
          request={modal.request}
          locations={locations}
          storeId={storeId}
          departmentId={departmentId}
          fixedLocation={fixedLocation}
          locationOptions={locationOptions}
          selectedLocationId={selectedLocationId}
          onLocationChange={onLocationChange}
          onClose={() => setModal(null)}
          onDone={() => {
            const wasEdit = modal.mode === 'edit'
            setModal(null)
            toast.success(wasEdit ? 'Request updated.' : 'Stock request sent to store.')
            void load()
          }}
        />
      )}
    </>
  )
}

/** Create/edit, split in two like the Requisition form: location + note on
 * the left, the store's product sheet (search, grouped by category, a
 * quantity per line) on the right. Each pane scrolls on its own. */
function RequestModal({
  mode, request, locations, storeId, departmentId, fixedLocation, locationOptions, selectedLocationId, onLocationChange, onClose, onDone,
}: {
  mode: 'create' | 'edit'
  request?: StockRequest
  locations: Location[]
  storeId: string
  departmentId: string
  fixedLocation: Location | null
  locationOptions: Location[]
  selectedLocationId: string
  onLocationChange: (id: string) => void
  onClose: () => void
  onDone: () => void
}) {
  const [fromId, setFromId] = useState(request?.fromLocation.id ?? storeId)
  const [toId, setToId] = useState(request?.toLocation.id ?? (fixedLocation ? fixedLocation.id : (selectedLocationId || departmentId)))
  const [note, setNote] = useState(request?.note ?? '')
  const [rows, setRows] = useState<SheetProduct[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries((request?.items ?? []).map((i) => [i.productId, String(i.requestedQty)])))
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (!fromId && storeId) setFromId(storeId) }, [fromId, storeId])

  const load = useCallback(async () => {
    if (!fromId) { setRows([]); return }
    setLoading(true)
    try {
      const r = await api<{ products: SheetProduct[] }>(`/stock-issues/request-sheet?fromLocationId=${fromId}`)
      setRows(r.products)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load products from store')
    } finally {
      setLoading(false)
    }
  }, [fromId])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter((r) => `${r.name} ${r.categoryName}`.toLowerCase().includes(q)) : rows
  }, [rows, search])
  const grouped = useMemo(() => visible.reduce((groups, product) => {
    const group = groups.get(product.categoryName) ?? []
    group.push(product)
    groups.set(product.categoryName, group)
    return groups
  }, new Map<string, SheetProduct[]>()), [visible])
  const lines = useMemo(() => rows.map((r) => ({ productId: r.id, quantity: Number(quantities[r.id]) })).filter((l) => l.quantity > 0), [rows, quantities])

  async function submit() {
    if (!fromId) { setError('Choose the store supplying this request'); return }
    if (!toId) { setError('Choose the department/location that needs the stock'); return }
    if (fromId === toId) { setError('Store and destination must be different'); return }
    if (lines.length === 0) { setError('Enter a quantity for at least one product'); return }
    setSaving(true)
    setError('')
    try {
      const payload = { fromLocationId: fromId, toLocationId: toId, note: note.trim() || undefined, lines }
      if (mode === 'edit' && request) await api(`/stock-issues/requests/${request.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      else await api('/stock-issues/requests', { method: 'POST', body: JSON.stringify(payload) })
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{mode === 'edit' ? 'Edit request' : 'New request'}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{mode === 'edit' && request ? request.requestNo : 'Request stock from the store'}</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[18rem_1fr]">
          <div className="min-h-0 overflow-y-auto border-b p-6 sm:border-b-0 sm:border-r">
            <div className="space-y-4">
              <LocationPicker label="Request from" value={fromId} onChange={setFromId} locations={locations} exclude={toId} />
              {fixedLocation ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Needed at</p>
                  <p className="mt-1 border bg-muted px-3 py-2 text-sm font-semibold">{fixedLocation.name}</p>
                </div>
              ) : (
                <LocationPicker label="Needed at" value={toId} onChange={(id) => { setToId(id); onLocationChange(id) }} locations={locationOptions} exclude={fromId} />
              )}
              <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Note
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Afternoon room replenishment" className="input font-normal normal-case tracking-normal" />
              </label>
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-6">
            <div className="relative shrink-0">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
              ) : rows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No stock products are set up for this store yet.</p>
              ) : (
                <div className="space-y-4">
                  {[...grouped.entries()].map(([category, products]) => (
                    <div key={category}>
                      <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-primary">{category}</h3>
                      <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_8rem_7rem_7rem]">
                        <span>Product</span><span>Tracking</span><span className="text-right">Store has</span><span className="text-right">Request</span>
                      </div>
                      <div className="space-y-1.5">
                        {products.map((r) => (
                          <div key={r.id} className="rounded-sm border p-2.5 sm:grid sm:grid-cols-[1fr_8rem_7rem_7rem] sm:items-center sm:gap-2 sm:border-0 sm:p-0">
                            <p className="truncate text-sm font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></p>
                            <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0">{MODE_LABEL[r.trackingMode]}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0 sm:text-right sm:tabular-nums">Store has {r.onHand}</p>
                            <input
                              type="number" min="0" step="0.001" placeholder="Qty"
                              value={quantities[r.id] ?? ''}
                              onChange={(e) => setQuantities((q) => ({ ...q, [r.id]: e.target.value }))}
                              className="input mt-2 w-full sm:mt-0 sm:text-right"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="mx-6 mb-3 flex shrink-0 items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-foreground/15 bg-muted/40 px-6 py-4">
          <p className="text-xs text-muted-foreground">{lines.length} product{lines.length === 1 ? '' : 's'} requested</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
            <Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !fromId || !toId}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Send request to store'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StoreInbox({ storeId, onError, onDone }: { storeId: string; onError: (m: string) => void; onDone: () => void }) {
  const [requests, setRequests] = useState<StockRequest[]>([])
  const [dispatching, setDispatching] = useState<StockRequest | null>(null)
  const [rejecting, setRejecting] = useState<StockRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: 'REQUESTED', fromLocationId: storeId })
      const r = await api<{ requests: StockRequest[] }>(`/stock-issues/requests?${params.toString()}`)
      setRequests(r.requests)
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load store inbox')
    } finally {
      setLoading(false)
    }
  }, [onError, storeId])
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 15000); return () => window.clearInterval(id) }, [load])

  return (
    <>
      <section className="mt-5 overflow-hidden border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b p-4">
          <StatusPill tone="warning">{requests.length} waiting</StatusPill>
        </div>
        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
        ) : requests.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No pending stock requests.</p>
        ) : (
          <div className="divide-y">
            {requests.map((request) => (
              <article key={request.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{request.requestNo}</p>
                    <h3 className="font-display text-base font-semibold">{request.fromLocation.name} → {request.toLocation.name}</h3>
                    <p className="text-xs text-muted-foreground">Requested {when(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ActionButton tone="success" icon={<LuPackageCheck />} onClick={() => setDispatching(request)}>Dispatch</ActionButton>
                    <ActionButton tone="danger" icon={<LuBan />} onClick={() => setRejecting(request)}>Reject</ActionButton>
                  </div>
                </div>
                <ul className="mt-3 divide-y text-sm">
                  {request.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="truncate">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></span>
                      <span className={cn('shrink-0 tabular-nums', item.available < item.requestedQty && 'font-semibold text-destructive')}>{item.requestedQty} <span className="text-xs text-muted-foreground">(store has {item.available})</span></span>
                    </li>
                  ))}
                </ul>
                {request.note && <p className="mt-2 text-xs text-muted-foreground">Note: {request.note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
      {dispatching && <DispatchModal request={dispatching} onClose={() => setDispatching(null)} onDone={() => { setDispatching(null); onDone(); void load() }} onError={onError} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); onDone(); void load() }} onError={onError} />}
    </>
  )
}

function DispatchModal({ request, onClose, onDone, onError }: { request: StockRequest; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(request.items.map((i) => [i.id, String(Math.min(i.requestedQty, Math.max(i.available, 0)))])))
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true)
    try {
      await api(`/stock-issues/requests/${request.id}/dispatch`, { method: 'POST', body: JSON.stringify({ lines: request.items.map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id] ?? 0) })) }) })
      onDone()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not dispatch this request')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{request.requestNo}</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Dispatch to {request.toLocation.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_6rem_6rem_7rem]">
            <span>Item</span><span className="text-right">Requested</span><span className="text-right">Available</span><span className="text-right">Send</span>
          </div>
          <div className="mt-1 space-y-2">
            {request.items.map((item) => (
              <div key={item.id} className="rounded-sm border p-2.5 sm:grid sm:grid-cols-[1fr_6rem_6rem_7rem] sm:items-center sm:gap-2 sm:border-0 sm:p-0">
                <p className="truncate text-sm font-medium">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0 sm:text-right sm:tabular-nums sm:text-sm">Asked {item.requestedQty}</p>
                <p className={cn('mt-0.5 text-xs sm:mt-0 sm:text-right sm:tabular-nums sm:text-sm', item.available < item.requestedQty ? 'font-semibold text-destructive' : 'text-muted-foreground')}>Has {item.available}</p>
                <input type="number" min="0" step="0.001" className="input mt-2 w-full sm:mt-0 sm:text-right" value={quantities[item.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t-2 border-foreground/15 bg-muted/40 px-6 py-4">
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <Button onClick={() => void submit()} disabled={saving}>{saving ? 'Dispatching…' : 'Dispatch goods'}</Button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({ request, onClose, onDone, onError }: { request: StockRequest; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true)
    try {
      await api(`/stock-issues/requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
      onDone()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not reject this request')
      setSaving(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="border-b-4 border-accent bg-muted/60 px-6 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{request.requestNo}</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Reject this request</h2>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium">Reason
            <textarea rows={3} className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock, expected tomorrow" />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">The requester sees this reason and can raise a new request.</p>
        </div>
        <div className="flex justify-end gap-2 border-t-2 border-foreground/15 bg-muted/40 px-6 py-4">
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <Button variant="danger" onClick={() => void submit()} disabled={!reason.trim() || saving}>{saving ? 'Rejecting…' : 'Reject request'}</Button>
        </div>
      </div>
    </div>
  )
}

function CountPanel({ locations, onError, onDone }: { locations: Location[]; onError: (m: string) => void; onDone: () => void }) {
  const [locationId, setLocationId] = useState('')
  const [rows, setRows] = useState<CountRow[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<CountResult[] | null>(null)

  const load = useCallback(async () => {
    if (!locationId) { setRows([]); return }
    setLoading(true)
    try {
      const r = await api<{ products: CountRow[] }>(`/stock-issues/count-sheet?locationId=${locationId}`)
      setRows(r.products)
      setCounts({})
      setResults(null)
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load the count list')
    } finally {
      setLoading(false)
    }
  }, [locationId, onError])

  useEffect(() => { void load() }, [load])
  const lines = useMemo(() => rows.filter((r) => counts[r.id] !== undefined && counts[r.id] !== '').map((r) => ({ productId: r.id, counted: Number(counts[r.id]) })), [rows, counts])

  async function submit() {
    setSaving(true)
    onError('')
    try {
      const r = await api<{ lines: CountResult[] }>('/stock-issues/count', { method: 'POST', body: JSON.stringify({ locationId, note: note.trim() || undefined, lines }) })
      setResults(r.lines)
      onDone()
      void load().then(() => setResults(r.lines))
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not save the count')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 overflow-hidden border bg-card shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b p-4">
        <LocationPicker label="Location" value={locationId} onChange={setLocationId} locations={locations} />
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Oil finished, discarded" className="input font-normal normal-case tracking-normal" /></label>
      </div>
      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading...</div>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">No products are counted at this location.</p>
      ) : (
        <div className="p-4">
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_7rem_10rem]">
            <span>Product</span><span className="text-right">Expected</span><span className="text-right">Counted now</span>
          </div>
          <div className="mt-1 space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="rounded-sm border p-2.5 sm:grid sm:grid-cols-[1fr_7rem_10rem] sm:items-center sm:gap-2 sm:border-0 sm:p-0">
                <p className="truncate text-sm font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground sm:mt-0 sm:text-right sm:tabular-nums sm:text-sm">Expected {r.onHand}</p>
                <input type="number" min="0" step="0.001" placeholder="Leave blank to skip" value={counts[r.id] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [r.id]: e.target.value }))} className="input mt-2 w-full sm:mt-0 sm:text-right" />
              </div>
            ))}
          </div>
        </div>
      )}
      {results && <div className="border-t p-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Last count</p><ul className="space-y-1 text-sm">{results.map((r) => <li key={r.productId} className="flex justify-between gap-3"><span>{r.name}</span><span className="tabular-nums text-muted-foreground">{r.used > 0 ? `used ${r.used}` : r.found > 0 ? `found ${r.found} more` : 'matches the books'}</span></li>)}</ul></div>}
      <div className="flex items-center justify-between gap-3 border-t p-4"><p className="text-xs text-muted-foreground">{lines.length} product{lines.length === 1 ? '' : 's'} counted</p><Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !locationId}>{saving ? 'Saving...' : 'Save count'}</Button></div>
    </section>
  )
}
