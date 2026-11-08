import { useEffect, useState } from 'react'
import { LuArrowRight, LuLoaderCircle, LuScrollText } from 'react-icons/lu'
import { api } from '@/lib/api'
import ModalShell from '@/components/ui/ModalShell'
import { activityKind, KIND_COLORS } from '@/components/activity/activityKinds'
import { useAppSelector } from '@/store/hooks'
import { cn } from '@/lib/utils'

export type ActivityEntry = {
  id: string
  occurredAt: string
  actorId: string | null
  actorName: string
  actorRole: string | null
  area: string
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  summary: string
  reason: string | null
  changes: { field: string; label: string; from: unknown; to: unknown }[] | null
  fromRecords: boolean
}

export const AREA_LABELS: Record<string, string> = {
  POS: 'Sales', STAYS: 'Stays', STOCK: 'Stock', MENU: 'Menu', DOCUMENTS: 'Invoices & quotations', FINANCE: 'Finance',
  PAYROLL: 'Salaries', PEOPLE: 'Staff & roles', SETTINGS: 'Settings', SHIFTS: 'Shifts', SERVICE_CENTER: 'Service center', AUTH: 'Sign-in',
}

/** The Super Admin always sees the activity log; anyone else needs ACTIVITY_VIEW (the server checks it too). */
export function useCanViewActivity() {
  return useAppSelector((s) => s.auth.user?.role?.name === 'Super Admin' || Boolean(s.auth.user?.role?.permissions.includes('ACTIVITY_VIEW')))
}

const shown = (value: unknown) => (value == null || value === '' ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value))

/** One activity row: when, who, what, why, and what changed. Shared by the log page and a record's history. */
export function ActivityRow({ entry, showArea = true }: { entry: ActivityEntry; showArea?: boolean }) {
  const kind = activityKind(entry.action)
  return (
    <div className="flex flex-col gap-1.5 border-b px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:gap-4">
      <div className="shrink-0 sm:w-40">
        <p className="font-medium tabular-nums">{new Date(entry.occurredAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        <p className="text-xs text-muted-foreground">{entry.actorName}{entry.actorRole ? ` · ${entry.actorRole}` : ''}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('keep-round inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset', KIND_COLORS[kind.color])}>{kind.label}</span>
          {showArea && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{AREA_LABELS[entry.area] ?? entry.area}</span>}
          {entry.fromRecords && <span title="Read from the record itself - kept since before the activity log started" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">From records</span>}
        </div>
        <p className="mt-1 break-words">{entry.summary}</p>
        {entry.reason && <p className="mt-0.5 break-words text-xs text-muted-foreground">Reason: {entry.reason}</p>}
        {entry.changes && entry.changes.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {entry.changes.map((change) => (
              <li key={change.field} className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{change.label}:</span>
                <span className="text-muted-foreground line-through">{shown(change.from)}</span>
                <LuArrowRight className="size-3 text-muted-foreground" />
                <span>{shown(change.to)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** "History" for one record (an order, invoice, stay or product): every logged action on it. */
export function ActivityHistoryButton({ targetType, targetId, label, className, compact = false }: { targetType: string; targetId: string; label: string; className?: string; compact?: boolean }) {
  const canView = useCanViewActivity()
  const [open, setOpen] = useState(false)
  if (!canView) return null
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Who did what to this" className={cn(compact ? 'rounded-sm border p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary' : 'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground', className)}>
        <LuScrollText className={compact ? undefined : 'size-3.5'} />{!compact && 'History'}
      </button>
      {open && <ActivityHistoryModal targetType={targetType} targetId={targetId} label={label} onClose={() => setOpen(false)} />}
    </>
  )
}

function ActivityHistoryModal({ targetType, targetId, label, onClose }: { targetType: string; targetId: string; label: string; onClose: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const query = new URLSearchParams({ targetType, targetId, pageSize: '200' })
    api<{ entries: ActivityEntry[] }>(`/activity?${query}`).then((r) => setEntries(r.entries)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the history'))
  }, [targetType, targetId])
  return (
    <ModalShell size="lg" stacked="top" kicker="History" title={label} subtitle="Who did what to this record, newest first" onClose={onClose}>
      {error ? <p className="p-5 text-sm text-destructive">{error}</p>
        : entries === null ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
        : entries.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">Nothing recorded on this yet.</p>
        : <div>{entries.map((entry) => <ActivityRow key={entry.id} entry={entry} showArea={false} />)}</div>}
    </ModalShell>
  )
}
