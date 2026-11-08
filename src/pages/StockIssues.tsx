import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LuArrowLeft, LuArrowRight, LuLock, LuBan, LuCircleAlert, LuEye, LuHourglass, LuLoaderCircle, LuMapPin, LuMessageSquare, LuPackage, LuPackageCheck, LuPackageMinus, LuPencil, LuPlus, LuSearch, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { useAppSelector } from '@/store/hooks'
import { useToast } from '@/components/ui/Toast'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import StatusPill, { type PillTone } from '@/components/ui/StatusPill'
import SearchableSelect from '@/components/ui/SearchableSelect'

type Employee = { id: string; firstName: string; lastName: string | null }
type Location = { id: string; name: string; type?: string; isActive?: boolean }
type SheetProduct = { id: string; name: string; unit: string; trackingMode: 'PER_SALE' | 'ISSUE_ONLY' | 'PERIODIC_COUNT'; categoryName: string; onHand: number }
type Status = 'REQUESTED' | 'DISPATCHED' | 'REJECTED' | 'CANCELLED'
type RequestItem = { id: string; productId: string; productName: string; unit: string; trackingMode: SheetProduct['trackingMode']; requestedQty: number; dispatchedQty: number | null; available: number }
export type StockRequest = {
  id: string
  requestNo: string
  status: Status
  note: string | null
  requestedByName: string | null
  requestedAt: string
  respondedByName: string | null
  respondedAt: string | null
  rejectReason: string | null
  transferId?: string | null
  fromLocation: Location
  toLocation: Location
  items: RequestItem[]
}

const MODE_LABEL: Record<SheetProduct['trackingMode'], string> = {
  PER_SALE: 'Stocked at destination',
  ISSUE_ONLY: 'Used when issued',
  PERIODIC_COUNT: 'Counted at close',
}

// What a request card shows: a dispatch that sent less than was asked is "Partial", not "Dispatched".
type Shown = Status | 'PARTIAL'
export const shownStatus = (r: StockRequest): Shown =>
  r.status === 'DISPATCHED' && r.items.some((i) => (i.dispatchedQty ?? 0) < i.requestedQty) ? 'PARTIAL' : r.status
export const SHOWN: Record<Shown, { label: string; tone: PillTone; edge: string }> = {
  REQUESTED: { label: 'Waiting', tone: 'warning', edge: 'border-l-amber-400' },
  DISPATCHED: { label: 'Dispatched', tone: 'success', edge: 'border-l-emerald-500' },
  PARTIAL: { label: 'Partial', tone: 'orange', edge: 'border-l-orange-500' },
  REJECTED: { label: 'Rejected', tone: 'danger', edge: 'border-l-rose-500' },
  CANCELLED: { label: 'Cancelled', tone: 'muted', edge: 'border-l-slate-400' },
}
const FILTERS: Shown[] = ['REQUESTED', 'DISPATCHED', 'PARTIAL', 'REJECTED', 'CANCELLED']
const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const qty = (n: number) => n.toLocaleString('en-KE', { maximumFractionDigits: 3 })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback)

export default function StockIssues() {
  const user = useAppSelector((s) => s.auth.user)
  const isSuperAdmin = user?.role?.name === 'Super Admin'
  const [locations, setLocations] = useState<Location[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const { fixed, options, selectedId, setLocation, effectiveId } = useWorkingLocation(locations, { persist: false })

  useEffect(() => {
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
    api<{ employees: Employee[] }>('/employees').then((r) => setEmployees(r.employees)).catch(() => {})
  }, [])

  const storeId = useMemo(() => locations.find((l) => l.type === 'STORE' && l.isActive !== false)?.id ?? '', [locations])
  const departmentId = effectiveId || locations.find((l) => l.type !== 'STORE' && l.isActive !== false)?.id || ''
  // Answering requests (dispatch / reject) lives in Store & Distribute, with every other stock movement.

  return (
    <div className="dashboard-square mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Stock Requests" />

      <RequestsPanel
          locations={locations}
          employees={employees}
          storeId={storeId}
          seeAll={isSuperAdmin}
          departmentId={departmentId}
          fixedLocation={fixed}
          locationOptions={options}
          selectedLocationId={selectedId}
          onLocationChange={setLocation}
        />
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

/** One request as its own card: where from and to, who asked, how much, the
 * note. The products themselves open in a modal, so the list stays short. */
function RequestCard({ request, actions }: { request: StockRequest; actions: ReactNode }) {
  const shown = SHOWN[shownStatus(request)]
  const units = request.items.reduce((sum, i) => sum + i.requestedQty, 0)
  const sentLines = request.items.filter((i) => (i.dispatchedQty ?? 0) > 0).length
  return (
    <article className={cn('rounded-sm border border-l-4 bg-card p-4 shadow-sm transition hover:shadow-md', shown.edge)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{request.requestNo}</span>
            <StatusPill tone={shown.tone}>{shown.label}</StatusPill>
          </div>
          <h3 className="mt-1 flex flex-wrap items-center gap-1.5 font-display text-base font-semibold">
            {request.fromLocation.name} <LuArrowRight className="size-4 text-muted-foreground" /> {request.toLocation.name}
          </h3>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><LuPackage className="size-3.5" /><b className="font-semibold text-foreground">{plural(request.items.length, 'product')}</b> · {qty(units)} units asked</span>
        {request.status === 'DISPATCHED' && (
          <span className="flex items-center gap-1.5"><LuPackageCheck className="size-3.5" />Sent {sentLines} of {request.items.length}</span>
        )}
        <span>Requested {when(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ''}</span>
        {request.respondedByName && request.status !== 'REQUESTED' && (
          <span>{shown.label} {request.respondedAt ? when(request.respondedAt) : ''} by {request.respondedByName}</span>
        )}
      </div>
      {request.note && <p className="mt-2 flex items-start gap-1.5 text-xs"><LuMessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="line-clamp-2">{request.note}</span></p>}
      {request.rejectReason && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-destructive"><LuBan className="mt-0.5 size-3.5 shrink-0" />{request.rejectReason}</p>}
    </article>
  )
}

function ModalShell({ kicker, title, wide, fill, onClose, children, footer }: { kicker: string; title: string; wide?: boolean; fill?: boolean; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  // `fill`: takes the whole screen on a phone, a centred box from sm up.
  return (
    <div className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/60', fill ? 'sm:p-4' : 'p-4')}>
      <div className={cn('flex w-full flex-col overflow-hidden bg-card sm:max-h-[92vh] sm:border-2 sm:border-foreground/25 sm:shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]', fill ? 'h-[100dvh] sm:h-auto' : 'max-h-[92vh] border-2 border-foreground/25', wide ? 'max-w-4xl' : 'max-w-2xl')}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b-4 border-accent bg-muted/60 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{kicker}</p>
            <h2 className="mt-1 font-display text-lg font-semibold leading-tight sm:text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-5" /></button>
        </div>
        {children}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t-2 border-foreground/15 bg-muted/40 px-4 py-3 sm:px-6 sm:py-4">{footer}</div>
      </div>
    </div>
  )
}

const CancelButton = ({ onClick, label = 'Cancel' }: { onClick: () => void; label?: string }) => (
  <button type="button" onClick={onClick} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">{label}</button>
)

/** The products on a request: what was asked and, once answered, what was sent. */
export function RequestDetail({ request, onClose }: { request: StockRequest; onClose: () => void }) {
  const shown = SHOWN[shownStatus(request)]
  const answered = request.status === 'DISPATCHED'
  return (
    <ModalShell kicker={request.requestNo} title={`${request.fromLocation.name} → ${request.toLocation.name}`} onClose={onClose} footer={<><StatusPill tone={shown.tone}>{shown.label}</StatusPill><CancelButton onClick={onClose} label="Close" /></>}>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <p className="text-xs text-muted-foreground">Requested {when(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ''}{request.respondedByName && request.status !== 'REQUESTED' ? ` · ${shown.label.toLowerCase()} by ${request.respondedByName}` : ''}</p>
        {request.note && <p className="mt-2 rounded-sm border bg-muted/40 p-3 text-sm"><span className="font-semibold">Note:</span> {request.note}</p>}
        {request.rejectReason && <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><span className="font-semibold">Rejected:</span> {request.rejectReason}</p>}
        <div className={cn('mt-4 hidden gap-3 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground sm:grid', answered ? 'sm:grid-cols-[1fr_6rem_6rem]' : 'sm:grid-cols-[1fr_6rem]')}>
          <span>Product</span><span className="text-right">Asked</span>{answered && <span className="text-right">Sent</span>}
        </div>
        <div className="mt-2 space-y-2">
          {request.items.map((item) => {
            const short = answered && (item.dispatchedQty ?? 0) < item.requestedQty
            return (
              <div key={item.id} className={cn('grid gap-3 rounded-sm border bg-background p-3 shadow-sm', answered ? 'grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_6rem_6rem]' : 'grid-cols-[1fr_auto] sm:grid-cols-[1fr_6rem]', short && 'border-orange-400/60')}>
                <p className="min-w-0 truncate text-sm font-medium">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></p>
                <p className="text-right text-sm tabular-nums">{qty(item.requestedQty)}</p>
                {answered && <p className={cn('text-right text-sm font-semibold tabular-nums', short ? 'text-orange-600' : 'text-success')}>{qty(item.dispatchedQty ?? 0)}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </ModalShell>
  )
}

/** Searchable: a property can have dozens of staff. Matches requests they made or answered. */
function EmployeeFilter({ employees, value, onChange }: { employees: Employee[]; value: string; onChange: (id: string) => void }) {
  const options = useMemo(() => [
    { value: '', label: 'All employees' },
    ...employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ''}`.trim() })),
  ], [employees])
  return (
    <div className="sm:w-60">
      <SearchableSelect options={options} value={value} onChange={onChange} placeholder="All employees" searchPlaceholder="Search employees…" emptyText="No employee matches." />
    </div>
  )
}

const SELECT = 'rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring'

function ListState({ loading, empty, children }: { loading: boolean; empty: string | null; children: ReactNode }) {
  if (loading) return <div className="flex min-h-40 items-center justify-center gap-2 border bg-card p-10 text-sm text-muted-foreground shadow-sm"><LuLoaderCircle className="animate-spin" /> Loading…</div>
  if (empty) return <p className="border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">{empty}</p>
  return <div className="space-y-3">{children}</div>
}

/** The requester's history (every location's for Super Admin), a card per
 * request, and the "New request" button that opens the split-pane form. */
function RequestsPanel({
  locations, employees, storeId, seeAll, departmentId, fixedLocation, locationOptions, selectedLocationId, onLocationChange,
}: {
  locations: Location[]
  employees: Employee[]
  storeId: string
  seeAll: boolean
  departmentId: string
  fixedLocation: Location | null
  locationOptions: Location[]
  selectedLocationId: string
  onLocationChange: (id: string) => void
}) {
  const toast = useToast()
  const [requests, setRequests] = useState<StockRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | Shown>('all')
  // Super Admin sees every location's requests; they can narrow it to one.
  const [locationFilter, setLocationFilter] = useState('')
  const listLocationId = seeAll ? locationFilter : departmentId
  const [employeeId, setEmployeeId] = useState('')
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; request?: StockRequest } | null>(null)
  const [viewing, setViewing] = useState<StockRequest | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (listLocationId) params.set('toLocationId', listLocationId)
      if (employeeId) params.set('employeeId', employeeId)
      const r = await api<{ requests: StockRequest[] }>(`/stock-issues/requests?${params.toString()}`)
      setRequests(r.requests)
    } catch (cause) {
      toast.error(message(cause, 'Could not load stock requests'))
    } finally {
      setLoading(false)
    }
  }, [listLocationId, employeeId, toast])
  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => {
    const out: Record<Shown, number> = { REQUESTED: 0, DISPATCHED: 0, PARTIAL: 0, REJECTED: 0, CANCELLED: 0 }
    for (const r of requests) out[shownStatus(r)] += 1
    return out
  }, [requests])
  const shown = statusFilter === 'all' ? requests : requests.filter((r) => shownStatus(r) === statusFilter)

  return (
    <>
      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="Waiting" value={counts.REQUESTED} icon={<LuHourglass />} tone={counts.REQUESTED ? 'warn' : undefined} />
        <StatCard index={1} label="Dispatched" value={counts.DISPATCHED} icon={<LuPackageCheck />} tone="success" />
        <StatCard index={8} label="Partial" value={counts.PARTIAL} icon={<LuPackageMinus />} />
        <StatCard index={2} label="Rejected" value={counts.REJECTED} icon={<LuBan />} tone="danger" />
      </section>

      <div className="mt-5 flex flex-col gap-3 border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Shown)} className={SELECT}>
          <option value="all">All statuses</option>
          {FILTERS.map((s) => <option key={s} value={s}>{SHOWN[s].label}</option>)}
        </select>
        {seeAll && (
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={SELECT}>
            <option value="">All locations</option>
            {locations.filter((l) => l.type !== 'STORE' && l.isActive !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <EmployeeFilter employees={employees} value={employeeId} onChange={setEmployeeId} />
        <div className="sm:ml-auto"><ActionButton tone="primary" icon={<LuPlus />} onClick={() => setModal({ mode: 'create' })}>New request</ActionButton></div>
      </div>

      <div className="mt-4">
        <ListState loading={loading} empty={shown.length === 0 ? (requests.length === 0 ? 'No stock requests yet.' : 'No requests match this filter.') : null}>
          {shown.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              actions={<>
                <ActionButton tone="neutral" icon={<LuEye />} onClick={() => setViewing(request)}>View</ActionButton>
                {request.status === 'REQUESTED' && <ActionButton tone="neutral" icon={<LuPencil />} onClick={() => setModal({ mode: 'edit', request })}>Edit</ActionButton>}
              </>}
            />
          ))}
        </ListState>
      </div>

      {viewing && <RequestDetail request={viewing} onClose={() => setViewing(null)} />}
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

/** Create/edit, split in two: location + note on the left, the store's
 * product sheet (search, grouped by category, a card per product with a
 * quantity) on the right. Each pane scrolls on its own. */
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
  const toast = useToast()
  const [fromId, setFromId] = useState(request?.fromLocation.id ?? storeId)
  const [toId, setToId] = useState(request?.toLocation.id ?? (fixedLocation ? fixedLocation.id : (selectedLocationId || departmentId)))
  const [note, setNote] = useState(request?.note ?? '')
  const [rows, setRows] = useState<SheetProduct[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries((request?.items ?? []).map((i) => [i.productId, String(i.requestedQty)])))
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Phones walk through it: locations, then products, then a review before sending.
  const [step, setStep] = useState(0)
  // A property with a single store always requests from it.
  const stores = locations.filter((l) => l.type === 'STORE' && l.isActive !== false)
  const onlyStore = stores.length === 1 ? stores[0] : null

  useEffect(() => { if (!fromId && storeId) setFromId(storeId) }, [fromId, storeId])
  useEffect(() => { if (onlyStore && mode === 'create') setFromId(onlyStore.id) }, [onlyStore?.id, mode])

  const load = useCallback(async () => {
    if (!fromId) { setRows([]); return }
    setLoading(true)
    try {
      const r = await api<{ products: SheetProduct[] }>(`/stock-issues/request-sheet?fromLocationId=${fromId}`)
      setRows(r.products)
    } catch (cause) {
      toast.error(message(cause, 'Could not load products from store'))
    } finally {
      setLoading(false)
    }
  }, [fromId, toast])
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

  const locationProblem = !fromId ? 'Choose the store supplying this request'
    : !toId ? 'Choose the department/location that needs the stock'
    : fromId === toId ? 'Store and destination must be different' : null
  const productProblem = lines.length === 0 ? 'Enter a quantity for at least one product' : null
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  const nameOf = (id: string) => locations.find((l) => l.id === id)?.name ?? '—'

  function next() {
    const problem = step === 0 ? locationProblem : productProblem
    if (problem) { toast.error(problem); return }
    setStep((s) => s + 1)
  }

  async function submit() {
    const problem = locationProblem ?? productProblem
    if (problem) { toast.error(problem); return }
    setSaving(true)
    try {
      const payload = { fromLocationId: fromId, toLocationId: toId, note: note.trim() || undefined, lines }
      if (mode === 'edit' && request) await api(`/stock-issues/requests/${request.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      else await api('/stock-issues/requests', { method: 'POST', body: JSON.stringify(payload) })
      onDone()
    } catch (cause) {
      toast.error(message(cause, 'Could not save this request'))
    } finally {
      setSaving(false)
    }
  }

  const COLS = 'sm:grid-cols-[1fr_9rem_5.5rem_6.5rem]'
  const STEPS = ['Locations', 'Products', 'Review'] as const
  return (
    <ModalShell
      wide
      fill
      kicker={mode === 'edit' ? 'Edit request' : 'New request'}
      title={mode === 'edit' && request ? request.requestNo : 'Request stock from the store'}
      onClose={onClose}
      footer={<>
        <p className="text-xs text-muted-foreground">{plural(lines.length, 'product')} requested</p>
        {/* Phone: back / next through the steps, send on the last one. */}
        <div className="flex gap-2 sm:hidden">
          {step === 0
            ? <CancelButton onClick={onClose} />
            : <button type="button" onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1.5 border-2 border-foreground/20 bg-card px-3 py-2 text-xs font-bold uppercase tracking-wider"><LuArrowLeft className="size-4" />Back</button>}
          {step < 2
            ? <Button onClick={next}>Next <LuArrowRight className="ml-1.5 size-4" /></Button>
            : <Button onClick={() => void submit()} disabled={saving}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Send request'}</Button>}
        </div>
        <div className="hidden gap-2 sm:flex">
          <CancelButton onClick={onClose} />
          <Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !fromId || !toId}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Send request to store'}</Button>
        </div>
      </>}
    >
      <ol className="flex shrink-0 border-b bg-card sm:hidden">
        {STEPS.map((label, i) => (
          <li key={label} className={cn('flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-[11px] font-bold uppercase tracking-wider', i === step ? 'border-primary text-primary' : i < step ? 'border-primary/40 text-foreground' : 'border-transparent text-muted-foreground')}>
            <span className={cn('keep-round flex size-5 items-center justify-center rounded-full text-[10px]', i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] sm:grid-cols-[18rem_1fr]">
        <div className={cn(step === 0 ? 'block' : 'hidden', 'min-h-0 overflow-y-auto p-4 sm:block sm:border-r sm:p-6')}>
          <div className="space-y-5">
            {onlyStore ? (
              <LockedLocation label="Request from" name={onlyStore.name} />
            ) : (
              <LocationPicker label="Request from" value={fromId} onChange={setFromId} locations={locations} exclude={toId} />
            )}
            {fixedLocation ? (
              <LockedLocation label="Needed at" name={fixedLocation.name} />
            ) : (
              <LocationPicker label="Needed at" value={toId} onChange={(id) => { setToId(id); onLocationChange(id) }} locations={locationOptions} exclude={fromId} />
            )}
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Note
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Afternoon room replenishment" className="input font-normal normal-case tracking-normal" />
            </label>
          </div>
        </div>

        <div className={cn(step === 1 ? 'flex' : 'hidden', 'min-h-0 flex-col bg-muted/30 p-4 sm:flex sm:p-6')}>
          <p className="mb-2 flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:hidden">{nameOf(fromId)} <LuArrowRight className="size-3.5" /> {nameOf(toId)}</p>
          <div className="relative shrink-0">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm" />
          </div>
          {/* One header for the whole sheet; the cards below carry only the values. */}
          <div className={cn('mt-3 hidden shrink-0 gap-3 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:grid', COLS)}>
            <span>Product</span><span>Tracking</span><span className="text-right">Store has</span><span className="text-right">Request</span>
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
            ) : rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No stock products are set up for this store yet.</p>
            ) : (
              <div className="space-y-5">
                {[...grouped.entries()].map(([category, products]) => (
                  <div key={category}>
                    <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-primary">{category}</h3>
                    <div className="space-y-2">
                      {products.map((r) => {
                        const asked = Number(quantities[r.id]) > 0
                        return (
                          <div key={r.id} className={cn('grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-sm border bg-card p-3 shadow-sm transition', COLS, asked && 'border-primary/60 ring-1 ring-primary/30')}>
                            <p className="min-w-0 truncate text-sm font-medium" title={r.name}>{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></p>
                            <p className="order-3 text-xs text-muted-foreground sm:order-none">{MODE_LABEL[r.trackingMode]}</p>
                            <p className={cn('order-4 text-right text-sm tabular-nums sm:order-none', r.onHand <= 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}><span className="text-xs font-normal text-muted-foreground sm:hidden">Store has </span>{qty(r.onHand)}</p>
                            <input
                              type="number" inputMode="decimal" min="0" step="0.001" placeholder="Qty" aria-label={`Quantity of ${r.name}`}
                              value={quantities[r.id] ?? ''}
                              onChange={(e) => setQuantities((q) => ({ ...q, [r.id]: e.target.value }))}
                              className="input order-2 w-24 text-right sm:order-none sm:w-full"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Phone only: what is about to be sent, checked before sending. */}
        <div className={cn(step === 2 ? 'block' : 'hidden', 'min-h-0 overflow-y-auto bg-muted/30 p-4 sm:hidden')}>
          <div className="rounded-sm border bg-card p-3 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">From → to</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 font-display font-semibold">{nameOf(fromId)} <LuArrowRight className="size-4 text-muted-foreground" /> {nameOf(toId)}</p>
            {note.trim() && <p className="mt-2 flex items-start gap-1.5 text-xs"><LuMessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{note.trim()}</p>}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{plural(lines.length, 'product')}</p>
            <button type="button" onClick={() => setStep(1)} className="text-xs font-bold uppercase tracking-wider text-primary">Change</button>
          </div>
          <div className="mt-2 space-y-2">
            {lines.map((line) => {
              const r = rowById.get(line.productId)
              return (
                <div key={line.productId} className="flex items-center justify-between gap-3 rounded-sm border bg-card p-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r?.name} <span className="text-xs text-muted-foreground">{r?.unit}</span></p>
                    <p className={cn('text-xs', r && r.onHand < line.quantity ? 'font-semibold text-destructive' : 'text-muted-foreground')}>Store has {qty(r?.onHand ?? 0)}</p>
                  </div>
                  <p className="shrink-0 font-display text-lg font-semibold tabular-nums">{qty(line.quantity)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function LockedLocation({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"><LuMapPin className="size-3.5" /> {label}</p>
      <p className="mt-1 flex items-center justify-between gap-2 border bg-muted px-3 py-2.5 text-sm font-semibold">{name}<LuLock className="size-3.5 text-muted-foreground" /></p>
    </div>
  )
}

/** Each line starts at what was asked. A line the store can't cover blocks the
 * dispatch until the storekeeper sets what they're really sending, or 0. */
export function DispatchModal({ request, onClose, onDone }: { request: StockRequest; onClose: () => void; onDone: (partial: boolean) => void }) {
  const toast = useToast()
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(request.items.map((i) => [i.id, String(i.requestedQty)])))
  const [saving, setSaving] = useState(false)
  const problems = request.items.map((item) => {
    const raw = quantities[item.id] ?? ''
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value) || value < 0) return 'blank'
    if (value > Math.max(item.available, 0)) return 'short'
    if (value > item.requestedQty) return 'over'
    return null
  })
  const blocked = problems.filter(Boolean).length
  const sending = request.items.filter((i) => Number(quantities[i.id]) > 0).length
  const partial = request.items.some((i) => Number(quantities[i.id] ?? 0) < i.requestedQty)

  async function submit() {
    if (blocked) { toast.error(`Fix ${plural(blocked, 'line')} first: set what you're really sending, or 0.`); return }
    if (!sending) { toast.error('Nothing is being sent. Reject the request instead.'); return }
    setSaving(true)
    try {
      await api(`/stock-issues/requests/${request.id}/dispatch`, { method: 'POST', body: JSON.stringify({ lines: request.items.map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id]) })) }) })
      onDone(partial)
    } catch (cause) {
      toast.error(message(cause, 'Could not dispatch this request'))
    } finally {
      setSaving(false)
    }
  }
  const COLS = 'sm:grid-cols-[1fr_5.5rem_5.5rem_7rem]'
  return (
    <ModalShell
      fill
      kicker={request.requestNo}
      title={`Dispatch to ${request.toLocation.name}`}
      onClose={onClose}
      footer={<>
        <p className={cn('text-xs', blocked ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
          {blocked ? `${plural(blocked, 'line')} to fix before dispatching` : `Sending ${sending} of ${request.items.length}${partial ? ' · partial' : ''}`}
        </p>
        <div className="flex gap-2">
          <CancelButton onClick={onClose} />
          <Button onClick={() => void submit()} disabled={saving || blocked > 0 || sending === 0}>{saving ? 'Dispatching…' : 'Dispatch goods'}</Button>
        </div>
      </>}
    >
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-6">
        {request.note && <p className="mb-3 rounded-sm border bg-card p-3 text-sm"><span className="font-semibold">Note:</span> {request.note}</p>}
        <div className={cn('hidden gap-3 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground sm:grid', COLS)}>
          <span>Product</span><span className="text-right">Asked</span><span className="text-right">Store has</span><span className="text-right">Send</span>
        </div>
        <div className="mt-2 space-y-2">
          {request.items.map((item, index) => {
            const problem = problems[index]
            return (
              <div key={item.id} className={cn('rounded-sm border bg-card p-3 shadow-sm', problem && 'border-destructive/60 ring-1 ring-destructive/30')}>
                <div className={cn('grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1', COLS)}>
                  <p className="min-w-0 truncate text-sm font-medium">{item.productName} <span className="text-xs text-muted-foreground">{item.unit}</span></p>
                  <p className="order-3 text-sm tabular-nums text-muted-foreground sm:order-none sm:text-right"><span className="sm:hidden">Asked </span>{qty(item.requestedQty)}</p>
                  <p className={cn('order-4 text-right text-sm tabular-nums sm:order-none', item.available < item.requestedQty ? 'font-semibold text-destructive' : 'text-muted-foreground')}><span className="sm:hidden">Store has </span>{qty(item.available)}</p>
                  <input type="number" min="0" step="0.001" aria-label={`Send ${item.productName}`} className="input order-2 w-24 text-right sm:order-none sm:w-full" value={quantities[item.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))} />
                </div>
                {problem && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <LuCircleAlert className="size-3.5 shrink-0" />
                    {problem === 'blank' ? 'Enter how much you are sending (0 if none).'
                      : problem === 'over' ? `More than the ${qty(item.requestedQty)} asked.`
                      : `The store only has ${qty(Math.max(item.available, 0))}. Set what you're really sending, or 0.`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </ModalShell>
  )
}

export function RejectModal({ request, onClose, onDone }: { request: StockRequest; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true)
    try {
      await api(`/stock-issues/requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
      onDone()
    } catch (cause) {
      toast.error(message(cause, 'Could not reject this request'))
      setSaving(false)
    }
  }
  return (
    <ModalShell
      kicker={request.requestNo}
      title="Reject this request"
      onClose={onClose}
      footer={<>
        <span />
        <div className="flex gap-2">
          <CancelButton onClick={onClose} />
          <Button variant="danger" onClick={() => void submit()} disabled={!reason.trim() || saving}>{saving ? 'Rejecting…' : 'Reject request'}</Button>
        </div>
      </>}
    >
      <div className="p-6">
        <label className="block text-sm font-medium">Reason
          <textarea rows={3} className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock, expected tomorrow" />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">The requester sees this reason and can raise a new request.</p>
      </div>
    </ModalShell>
  )
}
