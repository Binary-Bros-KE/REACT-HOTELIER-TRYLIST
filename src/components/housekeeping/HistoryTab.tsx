import { useCallback, useEffect, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api } from '@/lib/api'
import StatCard from '@/components/ui/StatCard'
import SearchableSelect from '@/components/ui/SearchableSelect'
import TaskDetailModal from './TaskDetailModal'
import { StatusBadge, TYPE_LABEL, fmtDateTime, fmtMinutes, taskName, type Staff, type Task } from './shared'

type Summary = { completed: number; cancelled: number; avgWorkMinutes: number | null; totalWorkMinutes: number }

/** Receipts-style record of finished tasks. Employees only ever get their own. */
export default function HistoryTab({ isManager, staff }: { isManager: boolean; staff: Staff[] }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (status) q.set('status', status)
      if (type) q.set('type', type)
      if (assigneeId) q.set('assigneeId', assigneeId)
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      if (search.trim()) q.set('search', search.trim())
      const data = await api<{ tasks: Task[]; summary: Summary }>(`/housekeeping/history?${q}`)
      setTasks(data.tasks); setSummary(data.summary); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load history') }
    finally { setLoading(false) }
  }, [status, type, assigneeId, from, to, search])

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t) }, [load])

  return (
    <div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="Completed" value={summary?.completed ?? 0} />
        <StatCard index={1} label="Cancelled" value={summary?.cancelled ?? 0} />
        <StatCard index={2} label="Avg time per task" value={fmtMinutes(summary?.avgWorkMinutes)} />
        <StatCard index={3} label="Total work time" value={fmtMinutes(summary?.totalWorkMinutes)} />
      </section>
      <div className="mt-5 flex flex-wrap items-end gap-3 border bg-card p-3">
        <label className="relative block min-w-52 flex-1 text-xs font-semibold">Search
          <LuSearch className="pointer-events-none absolute bottom-3 left-3 size-4 text-muted-foreground" />
          <input className="input mt-1 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Room, task, employee…" />
        </label>
        <label className="text-xs font-semibold">Outcome
          <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select>
        </label>
        <label className="text-xs font-semibold">Type
          <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value)}><option value="">All</option>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        {isManager && (
          <div className="min-w-48 text-xs font-semibold">Employee
            <div className="mt-1"><SearchableSelect value={assigneeId} onChange={setAssigneeId} placeholder="All employees" searchPlaceholder="Search…" emptyText="No match" options={[{ value: '', label: 'All employees' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} /></div>
          </div>
        )}
        <label className="text-xs font-semibold">From<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs font-semibold">To<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <div className="mt-4 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}
      <div className="mt-4 overflow-x-auto border bg-card shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-primary text-primary-foreground"><tr>{['Task', 'Employee', 'Assigned', 'Started', 'Finished', 'Time taken', 'Outcome'].map((h) => <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {loading ? <tr><td colSpan={7} className="p-10 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></td></tr>
              : tasks.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">No finished tasks match these filters.</td></tr>
              : tasks.map((t) => (
                <tr key={t.id} onClick={() => setOpenId(t.id)} className="cursor-pointer even:bg-muted/30 hover:bg-muted/60">
                  <td className="px-4 py-3"><p className="font-semibold">{taskName(t)}</p><p className="text-xs text-muted-foreground">{t.taskNo}</p></td>
                  <td className="px-4 py-3">{t.completedByName ?? t.assigneeName ?? '—'}</td>
                  <td className="px-4 py-3">{fmtDateTime(t.assignedAt)}</td>
                  <td className="px-4 py-3">{fmtDateTime(t.startedAt)}</td>
                  <td className="px-4 py-3">{fmtDateTime(t.status === 'CANCELLED' ? t.cancelledAt : t.completedAt)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtMinutes(t.workMinutes)}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {openId && <TaskDetailModal taskId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
