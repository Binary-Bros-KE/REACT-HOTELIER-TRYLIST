import type { PillTone } from '@/components/ui/StatusPill'
import StatusPill from '@/components/ui/StatusPill'

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type TaskType = 'CLEANING' | 'INSPECTION' | 'MAINTENANCE' | 'GENERAL'
export type Priority = 'LOW' | 'NORMAL' | 'HIGH'

export type TaskEvent = { id: string; action: string; summary: string; performerName: string | null; occurredAt: string }
export type Task = {
  id: string
  taskNo: string | null
  type: TaskType
  status: TaskStatus
  priority: Priority
  source: 'MANUAL' | 'CHECKOUT' | 'ROOM_STATUS'
  title: string | null
  roomId: string | null
  roomNumber: string | null
  room: { id: string; number: string; name: string | null; status: string; cleanliness: string } | null
  assignedToId: string | null
  assigneeName: string | null
  assignedAt: string | null
  startedAt: string | null
  completedAt: string | null
  completedByName: string | null
  cancelledAt: string | null
  cancelReason: string | null
  notes: string | null
  dueAt: string | null
  createdAt: string
  overdue: boolean
  waitMinutes: number | null
  workMinutes: number | null
  totalMinutes: number | null
  events?: TaskEvent[]
}
export type Staff = { id: string; name: string; employeeCode: string | null; jobTitle: string | null; isSupervisor: boolean; activeTasks: number }

export const TYPE_LABEL: Record<TaskType, string> = { CLEANING: 'Cleaning', INSPECTION: 'Inspection', MAINTENANCE: 'Maintenance', GENERAL: 'General' }
export const SOURCE_LABEL = { MANUAL: 'Created by supervisor', CHECKOUT: 'Guest checkout', ROOM_STATUS: 'Room marked dirty' } as const
const STATUS_TONE: Record<TaskStatus, { tone: PillTone; label: string }> = {
  PENDING: { tone: 'warning', label: 'Pending' },
  IN_PROGRESS: { tone: 'secondary', label: 'In progress' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CANCELLED: { tone: 'muted', label: 'Cancelled' },
}

export const StatusBadge = ({ status }: { status: TaskStatus }) => <StatusPill tone={STATUS_TONE[status].tone}>{STATUS_TONE[status].label}</StatusPill>
export const PriorityBadge = ({ priority }: { priority: Priority }) => priority === 'NORMAL' ? null : <StatusPill tone={priority === 'HIGH' ? 'danger' : 'muted'}>{priority === 'HIGH' ? 'High priority' : 'Low priority'}</StatusPill>

export const taskName = (task: Pick<Task, 'title' | 'type' | 'roomNumber'>) =>
  task.roomNumber ? `Room ${task.roomNumber} · ${TYPE_LABEL[task.type]}` : task.title ?? TYPE_LABEL[task.type]

export function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 1) return '<1 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${m}m` : `${m} min`
}

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
