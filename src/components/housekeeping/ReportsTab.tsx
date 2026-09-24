import { useEffect, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuPackageCheck } from 'react-icons/lu'
import { api } from '@/lib/api'
import StatCard from '@/components/ui/StatCard'
import ModalShell from '@/components/ui/ModalShell'
import { TYPE_LABEL, fmtDateTime, fmtMinutes, taskName, type TaskType } from './shared'

type ReportRow = {
  employeeId: string; name: string; employeeCode: string | null; jobTitle: string | null
  tasksCompleted: number; byType: Partial<Record<TaskType, number>>; totalWorkMinutes: number; avgWorkMinutes: number | null
  onTimeRate: number | null; cancelled: number; shifts: number; shiftHours: number
  tasks?: { id: string; taskNo: string | null; type: TaskType; title: string | null; roomNumber: string | null; startedAt: string | null; completedAt: string | null }[]
}
type ConsumableUsage = {
  id: string
  usageNo: string
  createdAt: string
  room: { id: string; number: string; name: string | null; roomType: { name: string } }
  task: { id: string; taskNo: string | null; status: string } | null
  location: { id: string; name: string; type: string | null }
  employee: { id: string; firstName: string; lastName: string } | null
  items: {
    id: string
    quantity: string | number
    product: { id: string; name: string; unit: string; sku: string | null }
    movement: { value: string | number | null } | null
  }[]
}

const currentMonth = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7)
const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

function monthRange(month: string) {
  const [year, monthNo] = month.split('-').map(Number)
  const start = new Date(year, monthNo - 1, 1)
  const end = new Date(year, monthNo, 0)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** Monthly per-employee output: tasks done, time taken, on-time rate and shift hours. */
export default function ReportsTab({ isManager }: { isManager: boolean }) {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [consumables, setConsumables] = useState<ConsumableUsage[]>([])
  const [consumablesLoading, setConsumablesLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ReportRow | null>(null)

  useEffect(() => {
    setLoading(true)
    const request = isManager
      ? api<{ employees: ReportRow[] }>(`/housekeeping/reports/employees?month=${month}`).then((r) => r.employees)
      : api<{ employee: ReportRow }>(`/housekeeping/reports/employees/me?month=${month}`).then((r) => [r.employee])
    request.then((r) => { setRows(r); setError('') }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load report')).finally(() => setLoading(false))
  }, [month, isManager])

  useEffect(() => {
    setConsumablesLoading(true)
    const { from, to } = monthRange(month)
    const q = new URLSearchParams({ from, to, pageSize: '200' })
    api<{ usages: ConsumableUsage[] }>(`/room-consumables/usages?${q}`)
      .then((r) => { setConsumables(r.usages); setError('') })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load consumables'))
      .finally(() => setConsumablesLoading(false))
  }, [month])

  async function open(row: ReportRow) {
    try {
      const r = await api<{ employee: ReportRow }>(`/housekeeping/reports/employees/${row.employeeId}?month=${month}`)
      setDetail(r.employee)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load detail') }
  }

  const totalTasks = rows.reduce((s, r) => s + r.tasksCompleted, 0)
  const totalHours = rows.reduce((s, r) => s + r.shiftHours, 0)
  const totalWork = rows.reduce((s, r) => s + r.totalWorkMinutes, 0)
  const totalConsumableItems = consumables.reduce((sum, usage) => sum + usage.items.reduce((inner, item) => inner + Number(item.quantity), 0), 0)
  const totalConsumableCost = consumables.reduce((sum, usage) => sum + usage.items.reduce((inner, item) => inner + Number(item.movement?.value ?? 0), 0), 0)
  const byProduct = Array.from(consumables.reduce((map, usage) => {
    for (const item of usage.items) {
      const current = map.get(item.product.id) ?? { id: item.product.id, name: item.product.name, unit: item.product.unit, quantity: 0, value: 0 }
      current.quantity += Number(item.quantity)
      current.value += Number(item.movement?.value ?? 0)
      map.set(item.product.id, current)
    }
    return map
  }, new Map<string, { id: string; name: string; unit: string; quantity: number; value: number }>()).values()).sort((a, b) => b.value - a.value || b.quantity - a.quantity)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">Month<input type="month" className="input mt-1" value={month} max={currentMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} /></label>
      </div>
      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label="Tasks completed" value={totalTasks} />
        <StatCard index={1} label="Task work time" value={fmtMinutes(totalWork)} />
        <StatCard index={2} label="Shift hours" value={`${Math.round(totalHours * 10) / 10} h`} />
      </section>
      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard index={3} icon={<LuPackageCheck />} label="Rooms replenished" value={String(consumables.length)} />
        <StatCard index={4} label="Supply items used" value={String(Math.round(totalConsumableItems * 1000) / 1000)} />
        <StatCard index={5} label="Supply stock cost" value={formatKes(totalConsumableCost)} />
      </section>
      {error && <div className="mt-4 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}
      <div className="mt-4 overflow-x-auto border bg-card shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-primary text-primary-foreground"><tr>{['Employee', 'Tasks done', 'Avg time', 'Total task time', 'On time', 'Cancelled', 'Shifts', 'Shift hours'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {loading ? <tr><td colSpan={8} className="p-10 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">No housekeeping staff or activity for this month.</td></tr>
              : rows.map((r) => (
                <tr key={r.employeeId} onClick={() => void open(r)} className="cursor-pointer even:bg-muted/30 hover:bg-muted/60">
                  <td className="px-4 py-3"><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.employeeCode ?? r.jobTitle ?? ''}</p></td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{r.tasksCompleted}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtMinutes(r.avgWorkMinutes)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtMinutes(r.totalWorkMinutes)}</td>
                  <td className="px-4 py-3 tabular-nums">{r.onTimeRate === null ? '—' : `${r.onTimeRate}%`}</td>
                  <td className="px-4 py-3 tabular-nums">{r.cancelled}</td>
                  <td className="px-4 py-3 tabular-nums">{r.shifts}</td>
                  <td className="px-4 py-3 tabular-nums">{r.shiftHours} h</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Consumables by product</h3>
            <p className="text-xs text-muted-foreground">Stock consumed while replenishing rooms.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-primary-foreground"><tr className="text-xs font-bold uppercase tracking-wider [&>th]:px-4 [&>th]:py-3"><th>Product</th><th>Qty</th><th>Cost</th></tr></thead>
              <tbody className="divide-y">
                {consumablesLoading ? <tr><td colSpan={3} className="p-8 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></td></tr>
                  : byProduct.length === 0 ? <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No room supplies recorded for this month.</td></tr>
                  : byProduct.map((p) => <tr key={p.id} className="even:bg-muted/30"><td className="px-4 py-3 font-semibold">{p.name}</td><td className="px-4 py-3 tabular-nums">{Math.round(p.quantity * 1000) / 1000} {p.unit}</td><td className="px-4 py-3 font-semibold tabular-nums">{formatKes(p.value)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
        <section className="border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Room replenishment history</h3>
            <p className="text-xs text-muted-foreground">Who replaced what, from which stock location.</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-primary text-primary-foreground"><tr className="text-xs font-bold uppercase tracking-wider [&>th]:px-4 [&>th]:py-3"><th>Room</th><th>Items</th><th>Location</th><th>Done by</th><th>Time</th></tr></thead>
              <tbody className="divide-y">
                {consumablesLoading ? <tr><td colSpan={5} className="p-8 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></td></tr>
                  : consumables.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No replenishments recorded.</td></tr>
                  : consumables.map((usage) => (
                    <tr key={usage.id} className="even:bg-muted/30">
                      <td className="px-4 py-3"><p className="font-semibold">Room {usage.room.number}</p><p className="text-xs text-muted-foreground">{usage.usageNo}{usage.task?.taskNo ? ` · ${usage.task.taskNo}` : ''}</p></td>
                      <td className="px-4 py-3">{usage.items.map((item) => <span key={item.id} className="mr-2 inline-block whitespace-nowrap">{Number(item.quantity)} {item.product.unit} {item.product.name}</span>)}</td>
                      <td className="px-4 py-3">{usage.location.name}</td>
                      <td className="px-4 py-3">{usage.employee ? `${usage.employee.firstName} ${usage.employee.lastName}` : '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtDateTime(usage.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {detail && (
        <ModalShell kicker={`Report · ${month}`} title={detail.name} subtitle={`${detail.tasksCompleted} tasks · ${detail.shiftHours} shift hours`} onClose={() => setDetail(null)} size="lg">
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2 text-xs">{Object.entries(detail.byType).map(([t, n]) => <span key={t} className="border px-2 py-1 font-semibold">{TYPE_LABEL[t as TaskType]}: {n}</span>)}</div>
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-primary-foreground"><tr className="text-xs font-bold uppercase tracking-wider [&>th]:px-3 [&>th]:py-2"><th className="py-2">Task</th><th>Started</th><th>Finished</th></tr></thead>
              <tbody className="divide-y">
                {(detail.tasks ?? []).map((t) => <tr key={t.id} className="even:bg-muted/30"><td className="px-3 py-2"><span className="font-medium">{taskName(t)}</span> <span className="text-xs text-muted-foreground">{t.taskNo}</span></td><td>{fmtDateTime(t.startedAt)}</td><td>{fmtDateTime(t.completedAt)}</td></tr>)}
                {(detail.tasks ?? []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No completed tasks this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
