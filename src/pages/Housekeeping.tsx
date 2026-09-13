import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuBedDouble, LuCheck, LuCircleAlert, LuClipboardList, LuLoaderCircle, LuPencil, LuPlus, LuSparkles, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'

type Status = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
type TaskType = 'CLEANING' | 'INSPECTION' | 'MAINTENANCE'
type Room = { id: string; number: string; roomType: { name: string }; status: string; cleanliness: string }
type Task = { id: string; type: TaskType; status: Status; assignedTo: string | null; notes: string | null; dueAt: string | null; roomId: string; room: Room }
type Summary = { pending: number; inProgress: number; completed: number }
type Form = { roomId: string; type: TaskType; assignedTo: string; notes: string; dueAt: string; status: Status }

export default function Housekeeping() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [summary, setSummary] = useState<Summary>({ pending: 0, inProgress: 0, completed: 0 })
  const [filter, setFilter] = useState<'ALL' | Status>('ALL')
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState<Form>({ roomId: '', type: 'CLEANING', assignedTo: '', notes: '', dueAt: '', status: 'PENDING' })
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const query = filter === 'ALL' ? '' : `?status=${filter}`
      const [taskData, roomData] = await Promise.all([
        api<{ tasks: Task[]; summary: Summary }>(`/housekeeping/tasks${query}`),
        api<{ rooms: Room[] }>('/housekeeping/rooms'),
      ])
      setTasks(taskData.tasks); setSummary(taskData.summary); setRooms(roomData.rooms); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load housekeeping') }
    finally { if (!quiet) setLoading(false) }
  }, [filter])

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 10000); return () => window.clearInterval(timer) }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ roomId: rooms.find((room) => room.cleanliness !== 'CLEAN')?.id ?? rooms[0]?.id ?? '', type: 'CLEANING', assignedTo: '', notes: '', dueAt: '', status: 'PENDING' })
    setShowForm(true); setError('')
  }

  function openEdit(task: Task) {
    setEditing(task)
    setForm({ roomId: task.roomId, type: task.type, assignedTo: task.assignedTo ?? '', notes: task.notes ?? '', dueAt: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : '', status: task.status })
    setShowForm(true); setError('')
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await api(editing ? `/housekeeping/tasks/${editing.id}` : '/housekeeping/tasks', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, assignedTo: form.assignedTo || undefined, notes: form.notes || undefined, dueAt: form.dueAt || undefined, ...(editing ? {} : { status: undefined }) }),
      })
      setNotice(editing ? 'Housekeeping task updated.' : 'Housekeeping task created.'); setShowForm(false); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save task') }
    finally { setSaving(false) }
  }

  async function advance(task: Task) {
    setWorking(task.id); setError(''); setNotice('')
    try {
      const next = task.status === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED'
      await api(`/housekeeping/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      setNotice(next === 'COMPLETED' ? `Room ${task.room.number} is clean and available to Reception.` : `Room ${task.room.number} is being serviced.`)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update task') }
    finally { setWorking('') }
  }

  async function remove(task: Task) {
    if (!window.confirm(`Delete the ${task.type.toLowerCase()} task for room ${task.room.number}?`)) return
    try { await api(`/housekeeping/tasks/${task.id}`, { method: 'DELETE' }); setNotice('Task deleted.'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete task') }
  }

  return <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
    <header className="rounded-sm bg-linear-to-r from-[#173d35] to-accent p-7 text-white shadow-xl"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-white/60">Housekeeping command centre</p><h1 className="mt-3 font-display text-3xl font-semibold">Turn every room into a welcome.</h1><p className="mt-2 text-sm text-white/70">Room readiness is synchronized with Reception every 10 seconds.</p></div><Button onClick={openCreate} className="shrink-0"><LuPlus /> New task</Button></div></header>
    {error && <Message error text={error} />}{notice && <Message text={notice} />}
    <section className="mt-6 grid gap-4 sm:grid-cols-3"><Metric index={0} icon={<LuClipboardList />} label="Pending" value={summary.pending} /><Metric index={1} icon={<LuSparkles />} label="In progress" value={summary.inProgress} /><Metric index={2} icon={<LuBedDouble />} label="Completed" value={summary.completed} /></section>
    <div className="mt-7 flex w-fit rounded-sm border bg-card p-1">{([['ALL','All'],['PENDING','Pending'],['IN_PROGRESS','In progress'],['COMPLETED','Completed']] as const).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-sm px-4 py-2 text-sm font-semibold ${filter === value ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>)}</div>
    {loading ? <div className="p-16 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div> : tasks.length === 0 ? <div className="mt-5 rounded-sm border border-dashed p-16 text-center text-sm text-muted-foreground">No housekeeping tasks in this view.</div> : <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tasks.map((task) => <article key={task.id} className="overflow-hidden rounded-sm border bg-card shadow-sm"><div className={`h-1.5 ${task.type === 'MAINTENANCE' ? 'bg-warning' : task.status === 'COMPLETED' ? 'bg-success' : 'bg-secondary'}`} /><div className="p-5"><div className="flex justify-between"><div><p className="text-xs font-bold uppercase text-muted-foreground">{task.type}</p><h2 className="mt-1 font-display text-2xl font-bold">Room {task.room.number}</h2></div><div className="flex gap-1"><button onClick={() => openEdit(task)} className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil /></button><button onClick={() => void remove(task)} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button></div></div><div className="mt-4 rounded-sm bg-muted/60 p-3 text-sm"><p className="text-xs text-muted-foreground">Assigned to</p><p className="font-semibold">{task.assignedTo || 'Unassigned'}</p>{task.dueAt && <p className="mt-1 text-xs text-muted-foreground">Due {new Date(task.dueAt).toLocaleString()}</p>}{task.notes && <p className="mt-2 text-xs text-muted-foreground">{task.notes}</p>}</div>{task.status === 'COMPLETED' ? <div className="mt-4 flex items-center justify-center gap-2 rounded-sm bg-success/10 py-2.5 text-sm font-bold text-success"><LuCheck /> Ready for Reception</div> : <button disabled={working === task.id} onClick={() => void advance(task)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60">{working === task.id ? <LuLoaderCircle className="animate-spin" /> : task.status === 'PENDING' ? <LuSparkles /> : <LuCheck />}{task.status === 'PENDING' ? 'Start task' : 'Complete task'}</button>}</div></article>)}</section>}
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4 backdrop-blur-sm"><form onSubmit={saveTask} className="w-full max-w-lg rounded-sm bg-card p-6 shadow-2xl"><p className="text-sm font-semibold text-secondary">{editing ? 'Edit task' : 'New task'}</p><h2 className="mt-1 font-display text-2xl font-semibold">{editing ? `Room ${editing.room.number}` : 'Housekeeping assignment'}</h2><div className="mt-5 space-y-3"><select required value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} className="input">{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.number} · {room.roomType.name} · {room.cleanliness.toLowerCase()}</option>)}</select><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })} className="input"><option value="CLEANING">Cleaning</option><option value="INSPECTION">Inspection</option><option value="MAINTENANCE">Maintenance</option></select>{editing && <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })} className="input"><option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option></select>}<input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} placeholder="Assign to" className="input" /><input type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} className="input" /><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="input" /></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2">Cancel</button><button disabled={saving} className="flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-semibold text-white disabled:opacity-60">{saving && <LuLoaderCircle className="animate-spin" />}{editing ? 'Save changes' : 'Create task'}</button></div></form></div>}
  </div>
}

function Metric({ icon,label,value,index }: { icon:React.ReactNode;label:string;value:number;index?:number }) { return <StatCard index={index} icon={icon} label={label} value={value} /> }
function Message({ text,error=false }: { text:string;error?:boolean }) { return <div className={`mt-5 flex items-center gap-2 rounded-sm p-3 text-sm ${error?'bg-destructive/10 text-destructive':'bg-success/10 text-success'}`}>{error?<LuCircleAlert/>:<LuCheck/>}{text}</div> }
