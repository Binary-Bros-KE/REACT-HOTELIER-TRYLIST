import { useCallback, useEffect, useRef, useState } from 'react'
import { LuBan, LuCalendarClock, LuCircleAlert, LuLoaderCircle, LuPackageCheck, LuPlay, LuPlus, LuCheck, LuTrash2, LuUserRoundPlus } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import ActionButton from '@/components/ui/ActionButton'
import ModalShell from '@/components/ui/ModalShell'
import PageBanner from '@/components/ui/PageBanner'
import SearchableSelect from '@/components/ui/SearchableSelect'
import StatCard from '@/components/ui/StatCard'
import StatusPill from '@/components/ui/StatusPill'
import HistoryTab from '@/components/housekeeping/HistoryTab'
import ReportsTab from '@/components/housekeeping/ReportsTab'
import TaskDetailModal from '@/components/housekeeping/TaskDetailModal'
import { PriorityBadge, SOURCE_LABEL, StatusBadge, TYPE_LABEL, fmtDateTime, taskName, type Staff, type Task, type TaskType } from '@/components/housekeeping/shared'

type Summary = { pending: number; inProgress: number; unassigned: number; overdue: number }
type RoomOption = { id: string; number: string; cleanliness: string; roomType: { name: string } }
type LocationOption = { id: string; name: string; type?: string | null }
type ConsumableProduct = {
  id: string
  name: string
  sku: string | null
  unit: string
  packLabel: string | null
  stockOnHand: string | number
}
type ConsumableStandard = { id: string; productId: string; quantity: string | number; product: Omit<ConsumableProduct, 'stockOnHand'> }
type Tab = 'tasks' | 'history' | 'reports'

const POLL_MS = 10_000

export default function Housekeeping() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('tasks')
  const [tasks, setTasks] = useState<Task[]>([])
  const [summary, setSummary] = useState<Summary>({ pending: 0, inProgress: 0, unassigned: 0, overdue: 0 })
  const [isManager, setIsManager] = useState(false)
  const [staff, setStaff] = useState<Staff[]>([])
  const [statusFilter, setStatusFilter] = useState<'active' | 'PENDING' | 'IN_PROGRESS'>('active')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [assigning, setAssigning] = useState<Task | null>(null)
  const [cancelling, setCancelling] = useState<Task | null>(null)
  const [replenishing, setReplenishing] = useState<Task | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const q = new URLSearchParams({ status: statusFilter })
      if (assigneeFilter) q.set('assigneeId', assigneeFilter)
      if (search.trim()) q.set('search', search.trim())
      const data = await api<{ tasks: Task[]; summary: Summary; isManager: boolean }>(`/housekeeping/tasks?${q}`)
      // After the first load, announce tasks that appeared since the last poll.
      if (seen.current) {
        const fresh = data.tasks.filter((t) => !seen.current!.has(t.id) && t.status === 'PENDING' && (data.isManager ? !t.assignedToId : true))
        if (fresh.length === 1) toast.info(data.isManager ? `New task to assign: ${taskName(fresh[0])}` : `New task assigned: ${taskName(fresh[0])}`)
        else if (fresh.length > 1) toast.info(data.isManager ? `${fresh.length} new tasks to assign` : `${fresh.length} new tasks assigned to you`)
      }
      seen.current = new Set([...(seen.current ?? []), ...data.tasks.map((t) => t.id)])
      setTasks(data.tasks); setSummary(data.summary); setIsManager(data.isManager); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load housekeeping') }
    finally { if (!quiet) setLoading(false) }
  }, [statusFilter, assigneeFilter, search, toast])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 200)
    const timer = window.setInterval(() => { if (!document.hidden) void load(true) }, POLL_MS)
    return () => { window.clearTimeout(t); window.clearInterval(timer) }
  }, [load])

  useEffect(() => {
    if (!isManager) return
    api<{ staff: Staff[] }>('/housekeeping/staff').then((r) => setStaff(r.staff)).catch(() => {})
  }, [isManager, assigning, createOpen])

  async function act(task: Task, action: 'start' | 'complete') {
    setWorking(task.id)
    try {
      await api(`/housekeeping/tasks/${task.id}/${action}`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(action === 'start' ? `Started ${taskName(task)}` : task.roomNumber && task.type !== 'MAINTENANCE' ? `Room ${task.roomNumber} is done` : `${taskName(task)} completed`)
      await load(true)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not update task') }
    finally { setWorking('') }
  }

  function completeTask(task: Task) {
    if (task.roomId && task.type !== 'MAINTENANCE') setReplenishing(task)
    else void act(task, 'complete')
  }

  const tabs: { key: Tab; label: string }[] = [{ key: 'tasks', label: isManager ? 'Tasks' : 'My tasks' }, { key: 'history', label: 'History' }, { key: 'reports', label: isManager ? 'Reports' : 'My report' }]

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Housekeeping" title={isManager ? 'Housekeeping tasks' : 'My tasks'}>
        {isManager && <ActionButton tone="primary" icon={<LuPlus />} onClick={() => setCreateOpen(true)}>New task</ActionButton>}
      </PageBanner>

      {tab !== 'tasks' && <div className="mt-6 flex w-fit border bg-card">
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn('px-3 py-2 text-xs font-bold uppercase tracking-wider transition', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{t.label}</button>
        ))}
      </div>}

      {tab === 'history' && <div className="mt-5"><HistoryTab isManager={isManager} staff={staff} /></div>}
      {tab === 'reports' && <div className="mt-5"><ReportsTab isManager={isManager} /></div>}

      {tab === 'tasks' && (
        <>
          <section className={cn('mt-5 grid gap-4 sm:grid-cols-2', isManager ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
            <StatCard index={0} label="Pending" value={summary.pending} />
            <StatCard index={1} label="In progress" value={summary.inProgress} />
            {isManager && <StatCard tone={summary.unassigned ? 'warn' : undefined} index={2} label="Waiting for assignment" value={summary.unassigned} />}
            <StatCard tone={summary.overdue ? 'danger' : undefined} index={3} label="Overdue" value={summary.overdue} />
          </section>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex border bg-card">
              {tabs.map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn('px-3 py-2 text-xs font-bold uppercase tracking-wider transition', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{t.label}</button>
              ))}
            </div>
            <div className="flex border bg-card">
              {([['active', 'All active'], ['PENDING', 'Pending'], ['IN_PROGRESS', 'In progress']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setStatusFilter(value)} className={cn('px-3 py-2 text-xs font-bold uppercase tracking-wider', statusFilter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
              ))}
            </div>
            <input className="input h-9 min-w-52 flex-1 text-sm lg:max-w-64" placeholder="Search room, task, employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {isManager && (
              <div className="min-w-52 flex-1 lg:max-w-56">
                <SearchableSelect value={assigneeFilter} onChange={setAssigneeFilter} placeholder="All employees" searchPlaceholder="Search…" emptyText="No match" options={[{ value: '', label: 'All employees' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
              </div>
            )}
          </div>

          {error && <div className="mt-4 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}

          {loading ? <div className="p-16 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div>
            : tasks.length === 0 ? <div className="mt-5 border border-dashed p-16 text-center text-sm text-muted-foreground">{isManager ? 'Nothing to do right now. New checkouts and dirty rooms will appear here automatically.' : 'No tasks assigned to you right now. New ones appear here automatically.'}</div>
            : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {tasks.map((task) => (
                  <article key={task.id} className={cn('flex flex-col border border-l-4 border-l-accent bg-card p-4 shadow-sm', task.overdue && 'border-destructive/60 border-l-destructive')}>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setDetailId(task.id)} className="min-w-0 text-left">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{task.taskNo} · {SOURCE_LABEL[task.source]}</p>
                        <h3 className="mt-0.5 truncate font-display text-lg font-semibold hover:underline">{taskName(task)}</h3>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={task.status} /><PriorityBadge priority={task.priority} />{task.overdue && <StatusPill tone="danger">Overdue</StatusPill>}</div>
                    </div>
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Assigned to</dt><dd className={cn('font-medium', !task.assigneeName && 'text-warning')}>{task.assigneeName ?? 'Unassigned'}</dd></div>
                      {task.dueAt && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Due</dt><dd className="flex items-center gap-1 font-medium"><LuCalendarClock className="size-3.5" />{fmtDateTime(task.dueAt)}</dd></div>}
                      {task.startedAt && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Started</dt><dd className="font-medium">{fmtDateTime(task.startedAt)}</dd></div>}
                      {task.roomNumber && task.type !== 'CLEANING' && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Type</dt><dd className="font-medium">{TYPE_LABEL[task.type]}</dd></div>}
                    </dl>
                    {task.notes && <p className="mt-2 text-sm text-muted-foreground">{task.notes}</p>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {task.assigneeName && task.status === 'PENDING' && <ActionButton tone="secondary" icon={<LuPlay />} loading={working === task.id} onClick={() => void act(task, 'start')}>Start</ActionButton>}
                      {task.status === 'IN_PROGRESS' && <ActionButton tone="success" icon={<LuCheck />} loading={working === task.id} onClick={() => completeTask(task)}>Complete</ActionButton>}
                      {isManager && <ActionButton tone="neutral" icon={<LuUserRoundPlus />} onClick={() => setAssigning(task)}>{task.assignedToId ? 'Reassign' : 'Assign'}</ActionButton>}
                      {isManager && <ActionButton tone="danger" icon={<LuBan />} title="Cancel task" onClick={() => setCancelling(task)}>Cancel</ActionButton>}
                    </div>
                  </article>
                ))}
              </div>
            )}
        </>
      )}

      {createOpen && <CreateTaskModal staff={staff} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); toast.success('Task created'); void load(true) }} />}
      {assigning && <AssignModal task={assigning} staff={staff} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); void load(true) }} />}
      {cancelling && <CancelModal task={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); toast.success('Task cancelled'); void load(true) }} />}
      {replenishing && <ReplenishModal task={replenishing} onClose={() => setReplenishing(null)} onDone={() => { setReplenishing(null); void load(true) }} />}
      {detailId && <TaskDetailModal taskId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function ReplenishModal({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationId, setLocationId] = useState('')
  const [standards, setStandards] = useState<ConsumableStandard[]>([])
  const [products, setProducts] = useState<ConsumableProduct[]>([])
  const [search, setSearch] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [productLoading, setProductLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api<{ locations: LocationOption[] }>('/locations').catch(() => ({ locations: [] })),
      task.roomId ? api<{ standards: ConsumableStandard[] }>(`/room-consumables/standards/for-room/${task.roomId}`).catch(() => ({ standards: [] })) : Promise.resolve({ standards: [] }),
    ]).then(([locs, standardResponse]) => {
      if (cancelled) return
      setLocations(locs.locations)
      const preferred = locs.locations.find((l) => l.type === 'HOUSEKEEPING') ?? locs.locations[0]
      if (preferred) setLocationId(preferred.id)
      setStandards(standardResponse.standards)
      setQuantities(Object.fromEntries(standardResponse.standards.map((s) => [s.productId, String(Number(s.quantity) || '')])))
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load room supplies'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [task.roomId])

  useEffect(() => {
    if (!locationId) { setProducts([]); return }
    const timer = window.setTimeout(() => {
      setProductLoading(true)
      const q = new URLSearchParams({ locationId, pageSize: '100', inStockOnly: 'true' })
      if (search.trim()) q.set('search', search.trim())
      api<{ products: ConsumableProduct[] }>(`/room-consumables/products?${q}`)
        .then((r) => { setProducts(r.products); setError('') })
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load products at this location'))
        .finally(() => setProductLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [locationId, search])

  const productMap = new Map<string, ConsumableProduct>(products.map((p) => [p.id, p] as const))
  const chosen = Object.entries(quantities)
    .map(([productId, qty]) => ({ productId, quantity: Number(qty) }))
    .filter((item) => productMap.has(item.productId))
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)
  const valid = Boolean(task.roomId && locationId && chosen.length > 0)

  function setQty(productId: string, quantity: string) {
    setQuantities((current) => ({ ...current, [productId]: quantity }))
  }

  async function finish(skipSupplies = false) {
    setSaving(true); setError('')
    try {
      if (!skipSupplies) {
        if (!valid) { setError('Choose at least one replenished item, or skip supplies.'); setSaving(false); return }
        await api('/room-consumables/usages', {
          method: 'POST',
          body: JSON.stringify({ roomId: task.roomId, taskId: task.id, locationId, note: note.trim() || undefined, items: chosen }),
        })
      }
      await api(`/housekeeping/tasks/${task.id}/complete`, { method: 'POST', body: JSON.stringify({}) })
      toast.success(skipSupplies ? `${taskName(task)} completed` : `Supplies recorded and ${taskName(task)} completed`)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete task')
      toast.error(cause instanceof Error ? cause.message : 'Could not complete task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      kicker={task.taskNo ?? 'Task'}
      title="Replenished items"
      subtitle={task.roomNumber ? `Room ${task.roomNumber}` : undefined}
      onClose={onClose}
      size="xl"
      footer={(
        <>
          <ActionButton tone="neutral" icon={<LuCheck />} loading={saving} onClick={() => void finish(true)}>Skip supplies</ActionButton>
          <ActionButton tone="success" icon={<LuPackageCheck />} loading={saving} disabled={!valid} onClick={() => void finish(false)}>Record and complete</ActionButton>
        </>
      )}
    >
      <div className="space-y-4 p-5">
        {loading ? <div className="p-10 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div> : (
          <>
            <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr]">
              <div className="text-sm font-medium">Stock location
                <div className="mt-1.5">
                  <SearchableSelect
                    value={locationId}
                    onChange={setLocationId}
                    placeholder="Choose source location"
                    searchPlaceholder="Search locations..."
                    emptyText="No locations"
                    options={locations.map((l) => ({ value: l.id, label: l.name, hint: l.type ?? undefined }))}
                  />
                </div>
              </div>
              <label className="block text-sm font-medium">Find another product
                <input className="input mt-1.5" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search soap, sugar, cocoa..." />
              </label>
            </div>

            {error && <div className="flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}

            <div className="overflow-x-auto border">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-primary text-primary-foreground">
                  <tr className="text-xs font-bold uppercase tracking-wider [&>th]:px-4 [&>th]:py-3"><th>Product</th><th>Suggested</th><th>In stock</th><th className="w-36">Used</th><th className="w-16"></th></tr>
                </thead>
                <tbody className="divide-y">
                  {Array.from(productMap.entries()).map(([productId, product]) => {
                    const standard = standards.find((s) => s.productId === productId)
                    const stock = Number(product.stockOnHand)
                    return (
                      <tr key={productId} className="even:bg-muted/30">
                        <td className="px-4 py-3"><p className="font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{product.sku ?? product.unit}</p></td>
                        <td className="px-4 py-3 tabular-nums">{standard ? `${Number(standard.quantity)} ${product.unit}` : '-'}</td>
                        <td className={cn('px-4 py-3 tabular-nums', stock <= 0 && 'text-destructive')}>{`${stock} ${product.unit}`}</td>
                        <td className="px-4 py-3"><input type="number" min="0" step="0.001" className="input h-9" value={quantities[productId] ?? ''} onChange={(e) => setQty(productId, e.target.value)} /></td>
                        <td className="px-4 py-3 text-right"><ActionButton tone="neutral" icon={<LuTrash2 />} title="Clear item" onClick={() => setQty(productId, '')} /></td>
                      </tr>
                    )
                  })}
                  {productMap.size === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">{productLoading ? 'Loading products...' : 'No in-stock room supply products found at this location.'}</td></tr>}
                </tbody>
              </table>
            </div>

            <label className="block text-sm font-medium">Note
              <textarea rows={2} className="input mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. guest used extra sugar" />
            </label>
          </>
        )}
      </div>
    </ModalShell>
  )
}

function CreateTaskModal({ staff, onClose, onCreated }: { staff: Staff[]; onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<'room' | 'general'>('room')
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [roomId, setRoomId] = useState('')
  const [type, setType] = useState<TaskType>('CLEANING')
  const [title, setTitle] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api<{ rooms: RoomOption[] }>('/housekeeping/rooms').then((r) => setRooms(r.rooms)).catch(() => {}) }, [])

  async function save() {
    setSaving(true); setError('')
    try {
      await api('/housekeeping/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...(mode === 'room' ? { roomId, type } : { title, type: 'GENERAL' }),
          priority,
          assignedToId: assignedToId || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      onCreated()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create task') }
    finally { setSaving(false) }
  }

  const valid = mode === 'room' ? Boolean(roomId) : title.trim().length >= 2
  return (
    <ModalShell kicker="Housekeeping" title="New task" onClose={onClose} size="md" footer={<ActionButton tone="primary" icon={<LuCheck />} loading={saving} disabled={!valid} onClick={() => void save()}>{saving ? 'Saving…' : 'Create task'}</ActionButton>}>
      <div className="space-y-4 p-5">
        <div className="flex w-fit border">
          {([['room', 'Room task'], ['general', 'General task']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value)} className={cn('px-3 py-2 text-xs font-bold uppercase tracking-wider', mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{label}</button>)}
        </div>
        {mode === 'room' ? (
          <>
            <div className="text-sm font-medium">Room
              <div className="mt-1.5"><SearchableSelect value={roomId} onChange={setRoomId} placeholder="Choose a room" searchPlaceholder="Search rooms…" emptyText="No rooms" options={rooms.map((r) => ({ value: r.id, label: `Room ${r.number}`, hint: `${r.roomType.name} · ${r.cleanliness.toLowerCase()}` }))} /></div>
            </div>
            <label className="block text-sm font-medium">Task type
              <select className="input mt-1.5" value={type} onChange={(e) => setType(e.target.value as TaskType)}>{(['CLEANING', 'INSPECTION', 'MAINTENANCE'] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
            </label>
          </>
        ) : (
          <label className="block text-sm font-medium">What needs doing?
            <input className="input mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wash towels, clean level 2 bathrooms" />
          </label>
        )}
        <div className="text-sm font-medium">Assign to <span className="font-normal text-muted-foreground">(optional, can be done later)</span>
          <div className="mt-1.5"><SearchableSelect value={assignedToId} onChange={setAssignedToId} placeholder="Leave unassigned" searchPlaceholder="Search staff…" emptyText="No housekeeping staff" options={[{ value: '', label: 'Leave unassigned' }, ...staff.map((s) => ({ value: s.id, label: s.name, hint: `${s.activeTasks} active` }))]} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Priority
            <select className="input mt-1.5" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select>
          </label>
          <label className="block text-sm font-medium">Due <span className="font-normal text-muted-foreground">(optional)</span>
            <input type="datetime-local" className="input mt-1.5" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm font-medium">Notes
          <textarea rows={2} className="input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </ModalShell>
  )
}

function AssignModal({ task, staff, onClose, onDone }: { task: Task; staff: Staff[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [employeeId, setEmployeeId] = useState(task.assignedToId ?? '')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api(`/housekeeping/tasks/${task.id}/assign`, { method: 'POST', body: JSON.stringify({ employeeId }) })
      toast.success('Task assigned')
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not assign task'); setSaving(false) }
  }
  return (
    <ModalShell kicker={task.taskNo ?? 'Task'} title={`${task.assignedToId ? 'Reassign' : 'Assign'} ${taskName(task)}`} onClose={onClose} size="md" footer={<ActionButton tone="primary" icon={<LuUserRoundPlus />} loading={saving} disabled={!employeeId || employeeId === task.assignedToId} onClick={() => void save()}>{saving ? 'Saving…' : 'Assign'}</ActionButton>}>
      <div className="min-h-[22rem] space-y-3 p-5">
        <SearchableSelect value={employeeId} onChange={setEmployeeId} placeholder="Choose an employee" searchPlaceholder="Search staff…" emptyText="No housekeeping staff. Add employees to the Housekeeping department first." options={staff.map((s) => ({ value: s.id, label: s.name, hint: `${s.activeTasks} active` }))} />
        {task.status === 'IN_PROGRESS' && <p className="text-xs text-warning">This task is already in progress. Reassigning restarts the work for the new person.</p>}
      </div>
    </ModalShell>
  )
}

function CancelModal({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api(`/housekeeping/tasks/${task.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) })
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not cancel task'); setSaving(false) }
  }
  return (
    <ModalShell kicker={task.taskNo ?? 'Task'} title={`Cancel ${taskName(task)}`} onClose={onClose} size="sm" footer={<ActionButton tone="danger" icon={<LuBan />} loading={saving} disabled={reason.trim().length < 3} onClick={() => void save()}>{saving ? 'Cancelling…' : 'Cancel task'}</ActionButton>}>
      <div className="space-y-3 p-5">
        <label className="block text-sm font-medium">Reason
          <textarea rows={3} className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this task being cancelled?" />
        </label>
        <p className="text-xs text-muted-foreground">The task stays in History. If the room is still dirty, a fresh unassigned cleaning task is opened for it.</p>
      </div>
    </ModalShell>
  )
}
