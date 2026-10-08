import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LuCircleAlert, LuClipboardList, LuLoaderCircle, LuMapPin, LuPackageCheck, LuSearch } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { useAppSelector } from '@/store/hooks'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import PageBanner from '@/components/ui/PageBanner'

type Location = { id: string; name: string; type?: string; isActive?: boolean }
type SheetProduct = { id: string; name: string; unit: string; trackingMode: 'PER_SALE' | 'ISSUE_ONLY' | 'PERIODIC_COUNT'; categoryName: string; onHand: number }
type CountRow = { id: string; name: string; unit: string; onHand: number }
type CountResult = { productId: string; name: string; expected: number; counted: number; used: number; found: number }
type StockRequest = {
  id: string
  requestNo: string
  status: 'REQUESTED' | 'DISPATCHED' | 'REJECTED' | 'CANCELLED'
  note: string | null
  requestedByName: string | null
  requestedAt: string
  respondedByName: string | null
  rejectReason: string | null
  fromLocation: Location
  toLocation: Location
  items: { id: string; productId: string; productName: string; unit: string; trackingMode: SheetProduct['trackingMode']; requestedQty: number; dispatchedQty: number | null; available: number }[]
}

const MODE_LABEL: Record<SheetProduct['trackingMode'], string> = {
  PER_SALE: 'Stocked at destination',
  ISSUE_ONLY: 'Used when issued',
  PERIODIC_COUNT: 'Counted at close',
}

export default function StockIssues() {
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  const canDispatch = user?.role?.name === 'Super Admin' || Boolean(user?.role?.permissions.includes('STORE_DISPATCH'))
  const [tab, setTab] = useState<'request' | 'mine' | 'store' | 'count'>('request')
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState('')
  const { fixed, options, selectedId, setLocation, effectiveId } = useWorkingLocation(locations, { persist: false })

  useEffect(() => {
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
  }, [])

  const storeId = useMemo(() => locations.find((l) => l.type === 'STORE')?.id ?? '', [locations])
  const departmentId = effectiveId || locations.find((l) => l.type !== 'STORE' && l.isActive !== false)?.id || ''
  const tabs: readonly ('request' | 'mine' | 'store' | 'count')[] = canDispatch ? ['request', 'mine', 'store', 'count'] : ['request', 'mine', 'count']

  useEffect(() => {
    if (!tabs.includes(tab)) setTab('request')
  }, [tab, tabs])

  return (
    <div className="dashboard-square mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Stock Requests" />

      {error && <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <div className="mt-6 flex flex-wrap gap-1 border bg-card p-1 shadow-sm">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-1.5 text-xs font-bold uppercase tracking-wider', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {t === 'request' ? 'New request' : t === 'mine' ? 'My requests' : t === 'store' ? 'Store inbox' : 'Counts'}
          </button>
        ))}
      </div>

      {tab === 'request' && (
        <RequestPanel
          locations={locations}
          storeId={storeId}
          departmentId={departmentId}
          fixedLocation={fixed}
          locationOptions={options}
          selectedLocationId={selectedId}
          onLocationChange={setLocation}
          onError={setError}
          onDone={() => { toast.success('Stock request sent to store.'); setTab('mine') }}
        />
      )}
      {tab === 'mine' && <RequestsList title="My requests" empty="No requests for this location yet." toLocationId={departmentId} onError={setError} />}
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

function RequestPanel({
  locations, storeId, departmentId, fixedLocation, locationOptions, selectedLocationId, onLocationChange, onError, onDone,
}: {
  locations: Location[]
  storeId: string
  departmentId: string
  fixedLocation: Location | null
  locationOptions: Location[]
  selectedLocationId: string
  onLocationChange: (id: string) => void
  onError: (m: string) => void
  onDone: () => void
}) {
  const [fromId, setFromId] = useState('')
  const [rows, setRows] = useState<SheetProduct[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!fromId && storeId) setFromId(storeId) }, [fromId, storeId])

  const load = useCallback(async () => {
    if (!fromId) { setRows([]); return }
    setLoading(true)
    try {
      const r = await api<{ products: SheetProduct[] }>(`/stock-issues/request-sheet?fromLocationId=${fromId}`)
      setRows(r.products)
      setQuantities({})
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load products from store')
    } finally {
      setLoading(false)
    }
  }, [fromId, onError])

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
    if (!fromId) { onError('Choose the store supplying this request'); return }
    if (!departmentId) { onError('Choose the department/location that needs the stock'); return }
    if (fromId === departmentId) { onError('Store and destination must be different'); return }
    if (lines.length === 0) { onError('Enter a quantity for at least one product'); return }
    setSaving(true)
    onError('')
    try {
      await api('/stock-issues/requests', { method: 'POST', body: JSON.stringify({ fromLocationId: fromId, toLocationId: departmentId, note: note.trim() || undefined, lines }) })
      setQuantities({})
      setNote('')
      onDone()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not send this request')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 overflow-hidden border bg-card shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b p-4">
        <LocationPicker label="Request from" value={fromId} onChange={setFromId} locations={locations} exclude={departmentId} />
        {fixedLocation ? (
          <div className="min-w-56">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Needed at</p>
            <p className="mt-1 border bg-muted px-3 py-2 text-sm font-semibold">{fixedLocation.name}</p>
          </div>
        ) : (
          <LocationPicker label="Needed at" value={selectedLocationId || departmentId} onChange={onLocationChange} locations={locationOptions} exclude={fromId} />
        )}
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Afternoon room replenishment" className="input font-normal normal-case tracking-normal" />
        </label>
      </div>

      <div className="flex items-center gap-2 border-b p-4">
        <LuSearch className="text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="input flex-1" />
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading...</div>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">No stock products are set up for this store yet.</p>
      ) : (
        <div className="divide-y">
          {[...grouped.entries()].map(([category, products]) => (
            <div key={category} className="p-4">
              <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-primary">{category}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                    <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Tracking</th><th className="px-3 py-2 text-right">Store has</th><th className="px-3 py-2 text-right">Request</th></tr>
                  </thead>
                  <tbody>
                    {products.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{MODE_LABEL[r.trackingMode]}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.onHand}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min="0" step="0.001" value={quantities[r.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [r.id]: e.target.value }))} className="input w-28 text-right" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t p-4">
        <p className="text-xs text-muted-foreground">{lines.length} product{lines.length === 1 ? '' : 's'} requested</p>
        <Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !fromId || !departmentId}>{saving ? 'Sending...' : 'Send request to store'}</Button>
      </div>
    </section>
  )
}

function RequestsList({ title, empty, fromLocationId, toLocationId, onError }: { title: string; empty: string; fromLocationId?: string; toLocationId?: string; onError: (m: string) => void }) {
  const [requests, setRequests] = useState<StockRequest[]>([])
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (fromLocationId) params.set('fromLocationId', fromLocationId)
    if (toLocationId) params.set('toLocationId', toLocationId)
    setLoading(true)
    try {
      const r = await api<{ requests: StockRequest[] }>(`/stock-issues/requests?${params.toString()}`)
      setRequests(r.requests)
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load stock requests')
    } finally {
      setLoading(false)
    }
  }, [fromLocationId, onError, toLocationId])
  useEffect(() => { void load() }, [load])
  return <RequestCards title={title} empty={empty} loading={loading} requests={requests} />
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
      <section className="mt-6">
        <RequestCards title="Store inbox" empty="No pending stock requests." loading={loading} requests={requests} actions={(request) => (
          <div className="flex gap-2">
            <Button className="px-3 py-2 text-xs" onClick={() => setDispatching(request)}><LuPackageCheck /> Dispatch</Button>
            <Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => setRejecting(request)}>Reject</Button>
          </div>
        )} />
      </section>
      {dispatching && <DispatchModal request={dispatching} onClose={() => setDispatching(null)} onDone={() => { setDispatching(null); onDone(); void load() }} onError={onError} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); onDone(); void load() }} onError={onError} />}
    </>
  )
}

function RequestCards({ title, empty, loading, requests, actions }: { title: string; empty: string; loading: boolean; requests: StockRequest[]; actions?: (request: StockRequest) => ReactNode }) {
  return (
    <div className="overflow-hidden border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b p-4">
        <LuClipboardList className="text-primary" />
        <h2 className="font-display text-lg font-bold">{title}</h2>
      </div>
      {loading ? <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading...</div> : requests.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{empty}</p> : (
        <div className="divide-y">
          {requests.map((request) => (
            <article key={request.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold">{request.requestNo}</p>
                  <p className="text-sm text-muted-foreground">{request.fromLocation.name}{' -> '}{request.toLocation.name} - {new Date(request.requestedAt).toLocaleString()}</p>
                  {request.note && <p className="mt-1 text-sm">{request.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-sm border px-2 py-1 text-xs font-bold uppercase', request.status === 'REQUESTED' ? 'border-warning text-warning' : request.status === 'DISPATCHED' ? 'border-success text-success' : 'border-destructive text-destructive')}>{request.status}</span>
                  {actions?.(request)}
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Requested</th><th className="px-3 py-2 text-right">Dispatched</th><th className="px-3 py-2 text-right">Store has</th></tr></thead>
                  <tbody>{request.items.map((item) => <tr key={item.id} className="border-t"><td className="px-3 py-2 font-medium">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></td><td className="px-3 py-2 text-right tabular-nums">{item.requestedQty}</td><td className="px-3 py-2 text-right tabular-nums">{item.dispatchedQty ?? '-'}</td><td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{item.available}</td></tr>)}</tbody>
                </table>
              </div>
              {request.rejectReason && <p className="mt-2 text-sm text-destructive">{request.rejectReason}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">{request.requestNo}</p><h2 className="font-display text-xl font-bold">Dispatch to {request.toLocation.name}</h2></div><Button variant="secondary" onClick={onClose}>Close</Button></div>
        <div className="p-4">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Requested</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">Send</th></tr></thead>
            <tbody>{request.items.map((item) => <tr key={item.id} className="border-t"><td className="px-3 py-2 font-medium">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></td><td className="px-3 py-2 text-right">{item.requestedQty}</td><td className={cn('px-3 py-2 text-right tabular-nums', item.available < item.requestedQty && 'text-warning')}>{item.available}</td><td className="px-3 py-2 text-right"><input type="number" min="0" step="0.001" className="input w-28 text-right" value={quantities[item.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))} /></td></tr>)}</tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t p-4"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? 'Dispatching...' : 'Dispatch goods'}</Button></div>
      </div>
    </div>
  )
}

function RejectModal({ request, onClose, onDone, onError }: { request: StockRequest; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [reason, setReason] = useState('')
  async function submit() {
    try {
      await api(`/stock-issues/requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
      onDone()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not reject this request')
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md border bg-card p-4 shadow-xl">
        <h2 className="font-display text-lg font-bold">Reject {request.requestNo}</h2>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-4 min-h-28 w-full" placeholder="Reason" />
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => void submit()} disabled={!reason.trim()}>Reject request</Button></div>
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
      {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading...</div> : rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No products are counted at this location.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Expected</th><th className="px-4 py-2.5 text-right">Counted now</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td className="px-4 py-3 font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></td><td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.onHand}</td><td className="px-4 py-3 text-right"><input type="number" min="0" step="0.001" placeholder="Leave blank to skip" value={counts[r.id] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [r.id]: e.target.value }))} className="input w-40 text-right" /></td></tr>)}</tbody></table></div>
      )}
      {results && <div className="border-t p-4"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Last count</p><ul className="space-y-1 text-sm">{results.map((r) => <li key={r.productId} className="flex justify-between gap-3"><span>{r.name}</span><span className="tabular-nums text-muted-foreground">{r.used > 0 ? `used ${r.used}` : r.found > 0 ? `found ${r.found} more` : 'matches the books'}</span></li>)}</ul></div>}
      <div className="flex items-center justify-between gap-3 border-t p-4"><p className="text-xs text-muted-foreground">{lines.length} product{lines.length === 1 ? '' : 's'} counted</p><Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !locationId}>{saving ? 'Saving...' : 'Save count'}</Button></div>
    </section>
  )
}
