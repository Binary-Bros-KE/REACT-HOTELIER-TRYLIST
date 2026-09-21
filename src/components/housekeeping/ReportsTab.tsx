import { useEffect, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle } from 'react-icons/lu'
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

const currentMonth = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7)

/** Monthly per-employee output: tasks done, time taken, on-time rate and shift hours. */
export default function ReportsTab({ isManager }: { isManager: boolean }) {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ReportRow | null>(null)

  useEffect(() => {
    setLoading(true)
    const request = isManager
      ? api<{ employees: ReportRow[] }>(`/housekeeping/reports/employees?month=${month}`).then((r) => r.employees)
      : api<{ employee: ReportRow }>(`/housekeeping/reports/employees/me?month=${month}`).then((r) => [r.employee])
    request.then((r) => { setRows(r); setError('') }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load report')).finally(() => setLoading(false))
  }, [month, isManager])

  async function open(row: ReportRow) {
    try {
      const r = await api<{ employee: ReportRow }>(`/housekeeping/reports/employees/${row.employeeId}?month=${month}`)
      setDetail(r.employee)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load detail') }
  }

  const totalTasks = rows.reduce((s, r) => s + r.tasksCompleted, 0)
  const totalHours = rows.reduce((s, r) => s + r.shiftHours, 0)
  const totalWork = rows.reduce((s, r) => s + r.totalWorkMinutes, 0)

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
