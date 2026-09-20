import { useEffect, useState } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import ModalShell from '@/components/ui/ModalShell'
import { PriorityBadge, SOURCE_LABEL, StatusBadge, fmtDateTime, fmtMinutes, taskName, type Task } from './shared'

const Row = ({ label, value }: { label: string; value: string }) => (
  <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-medium">{value}</p></div>
)

/** Full record of one task: who, when, how long, and the event timeline. */
export default function TaskDetailModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [task, setTask] = useState<Task | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ task: Task }>(`/housekeeping/tasks/${taskId}`).then((r) => setTask(r.task)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load task'))
  }, [taskId])

  return (
    <ModalShell kicker={task?.taskNo ?? 'Task'} title={task ? taskName(task) : 'Task details'} onClose={onClose} size="lg">
      {!task ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{error || <LuLoaderCircle className="mx-auto animate-spin" />}</div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><PriorityBadge priority={task.priority} /><span className="text-xs text-muted-foreground">{SOURCE_LABEL[task.source]}</span></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Row label="Assigned to" value={task.assigneeName ?? 'Unassigned'} />
            <Row label="Created" value={fmtDateTime(task.createdAt)} />
            <Row label="Assigned at" value={fmtDateTime(task.assignedAt)} />
            <Row label="Started" value={fmtDateTime(task.startedAt)} />
            <Row label={task.status === 'CANCELLED' ? 'Cancelled' : 'Completed'} value={fmtDateTime(task.status === 'CANCELLED' ? task.cancelledAt : task.completedAt)} />
            <Row label="Due" value={fmtDateTime(task.dueAt)} />
            <Row label="Waited before start" value={fmtMinutes(task.waitMinutes)} />
            <Row label="Time to complete" value={fmtMinutes(task.workMinutes)} />
            <Row label="Created to done" value={fmtMinutes(task.totalMinutes)} />
            {task.completedByName && <Row label="Completed by" value={task.completedByName} />}
          </div>
          {task.notes && <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p><p className="mt-0.5 text-sm">{task.notes}</p></div>}
          {task.cancelReason && <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cancellation reason</p><p className="mt-0.5 text-sm">{task.cancelReason}</p></div>}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Timeline</p>
            <ol className="space-y-2 border-l-2 pl-4">
              {(task.events ?? []).map((e) => (
                <li key={e.id} className="text-sm"><span className="font-medium">{e.summary}</span><span className="block text-xs text-muted-foreground">{fmtDateTime(e.occurredAt)}{e.performerName ? ` · ${e.performerName}` : ''}</span></li>
              ))}
              {(task.events ?? []).length === 0 && <li className="text-sm text-muted-foreground">No recorded events.</li>}
            </ol>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
