import type { ReactNode } from 'react'
import { LuCheck, LuClipboardCheck, LuClock3, LuEye, LuPower, LuTriangleAlert, LuX } from 'react-icons/lu'
import SlantButton from '@/components/ui/SlantButton'
import { TablePanelSkeleton } from '@/components/ui/DashboardSkeleton'
import { cn } from '@/lib/utils'
import { formatKes } from '@/components/shifts/ShiftSummaryModal'
import { useNow, useShift, type ShiftRow } from '@/components/shifts/shiftContext'

const initials = (s: ShiftRow) => `${s.employee.firstName[0] ?? ''}${s.employee.lastName[0] ?? ''}`.toUpperCase()
const fullName = (s: ShiftRow) => `${s.employee.firstName} ${s.employee.lastName}`
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--')

function Panel({ title, count, hint, children }: { title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3 border-l-4 border-accent pl-3">
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {count != null && <span className="bg-secondary px-2.5 py-1 text-xs font-bold tabular-nums text-secondary-foreground">{count}</span>}
      </div>
      {children}
    </section>
  )
}

const TH = 'px-4 py-2.5 text-xs font-bold uppercase tracking-wider'

/** Small, quiet elapsed-time readout. */
function LiveClock({ since }: { since: string | null }) {
  const now = useNow()
  const elapsed = since ? Math.max(0, now.getTime() - new Date(since).getTime()) : 0
  const h = Math.floor(elapsed / 36e5)
  const m = Math.floor((elapsed % 36e5) / 6e4)
  const s = Math.floor((elapsed % 6e4) / 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="inline-flex items-center gap-1.5 bg-muted px-2 py-1 font-mono text-xs font-semibold tabular-nums text-primary/60" title={`Clocked in ${clock(since)}`}>
      <LuClock3 className="size-3.5" />
      {p(h)}<span className="shift-blink">:</span>{p(m)}<span className="shift-blink">:</span>{p(s)}
    </span>
  )
}

function OnShiftCard({ s }: { s: ShiftRow }) {
  const { openSummary, busyKey, forceEnd } = useShift()
  const open = s.summary?.pendingOrders ?? 0
  return (
    <article className="flex items-center gap-3 border border-l-4 border-l-success bg-card px-3 py-2.5 shadow-sm">
      <div className="flex size-10 shrink-0 items-center justify-center bg-secondary/15 font-display text-sm font-bold text-secondary">{initials(s)}</div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold leading-tight">
          <span className="truncate">{fullName(s)}</span>
          <span className="relative flex size-2 shrink-0" title="At work"><span className="absolute inline-flex size-full animate-ping bg-success opacity-75" /><span className="relative inline-flex size-2 bg-success" /></span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{s.employee.jobTitle || 'Employee'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <LiveClock since={s.approvedStartAt} />
          {open > 0 && <span className="inline-flex items-center gap-1 bg-warning/15 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning"><LuTriangleAlert className="size-3" />{open} open</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <SlantButton tone="secondary" icon={<LuEye />} loading={busyKey === `${s.id}:summary`} onClick={() => openSummary(s, `${s.employee.firstName}'s active shift`)}>View</SlantButton>
        <SlantButton tone="danger" icon={<LuPower />} loading={busyKey === `${s.id}:force-end`} onClick={() => forceEnd(s)}>End</SlantButton>
      </div>
    </article>
  )
}

function Outcome({ s }: { s: ShiftRow }) {
  if (s.status === 'REJECTED_START' || s.status === 'REJECTED_END') {
    return <span className="inline-block border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">Rejected</span>
  }
  const v = s.cashVariance != null ? Number(s.cashVariance) : 0
  if (Math.abs(v) > 0.005) {
    return <span className={cn('inline-block border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', v > 0 ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive')}>{v > 0 ? 'Over' : 'Short'} {formatKes(Math.abs(v))}</span>
  }
  return <span className="inline-block border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success">Cleared</span>
}

export default function ShiftTeamPanels() {
  const { loaded, approvals, activeStaff, history, isSupervisor, busyKey, openSummary, ask, post } = useShift()

  if (!loaded) return isSupervisor ? <div className="mt-8"><TablePanelSkeleton rows={4} /></div> : null

  return (
    <>
      {approvals.length > 0 && (
        <Panel title="Supervisor approvals" count={approvals.length} hint="Requests waiting on you">
          <div className="overflow-x-auto border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr><th className={TH}>Employee</th><th className={TH}>Request</th><th className={cn(TH, 'text-right')}>Collected</th><th className={cn(TH, 'text-right')}>Action</th></tr>
              </thead>
              <tbody className="divide-y">
                {approvals.map((a) => (
                  <tr key={a.id} className="align-middle even:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center bg-secondary/15 text-xs font-bold text-secondary">{initials(a)}</span>
                        <div className="min-w-0"><p className="truncate font-semibold">{fullName(a)}</p><p className="truncate text-xs text-muted-foreground">{a.employee.jobTitle || 'Employee'}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-block border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', a.status === 'REQUESTED_END' ? 'border-warning/40 bg-warning/10 text-warning' : 'border-secondary/40 bg-secondary/10 text-secondary')}>
                        {a.status === 'REQUESTED_END' ? 'End shift' : 'Start shift'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{a.status === 'REQUESTED_END' ? formatKes(a.summary?.totalPaid ?? 0) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {a.status === 'REQUESTED_END' && a.summary && (
                          <SlantButton tone="secondary" icon={<LuClipboardCheck />} loading={busyKey === `${a.id}:summary`} onClick={() => openSummary(a, `${a.employee.firstName}'s handover`, true)}>Review</SlantButton>
                        )}
                        {a.status === 'REQUESTED_START' && (
                          <>
                            <SlantButton tone="success" icon={<LuCheck />} loading={busyKey === `${a.id}:approve`} onClick={() => ask({
                              title: 'Approve shift start?',
                              message: `${fullName(a)} will be marked active immediately.`,
                              confirmLabel: 'Approve',
                              busyKey: `${a.id}:approve`,
                              run: () => post(`/shifts/${a.id}/start-approval`, { action: 'APPROVE' }, `${a.id}:approve`),
                            })}>Approve</SlantButton>
                            <SlantButton tone="danger" icon={<LuX />} loading={busyKey === `${a.id}:reject`} onClick={() => ask({
                              title: 'Reject shift start?',
                              message: `${fullName(a)}'s start request will be rejected.`,
                              confirmLabel: 'Reject',
                              tone: 'danger',
                              busyKey: `${a.id}:reject`,
                              run: () => post(`/shifts/${a.id}/start-approval`, { action: 'REJECT' }, `${a.id}:reject`),
                            })}>Reject</SlantButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {isSupervisor && activeStaff.length > 0 && (
        <Panel title="Currently on shift" count={activeStaff.length} hint="Live — clocks run from the approved start">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeStaff.map((s) => <OnShiftCard key={s.id} s={s} />)}
          </div>
        </Panel>
      )}

      {history.length > 0 && (
        <Panel title={isSupervisor ? 'Recent staff shifts' : 'My shift history'} count={history.length}>
          <div className="max-h-[28rem] overflow-auto border bg-card">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
                <tr>
                  {isSupervisor && <th className={TH}>Employee</th>}
                  <th className={TH}>Date</th>
                  <th className={TH}>Time</th>
                  <th className={cn(TH, 'text-right')}>Hours</th>
                  <th className={cn(TH, 'text-right')}>Sales</th>
                  <th className={cn(TH, 'text-right')}>Collected</th>
                  <th className={TH}>Outcome</th>
                  <th className={cn(TH, 'text-right')}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((s) => {
                  const hasSummary = s.status !== 'REJECTED_START'
                  const rejected = s.status === 'REJECTED_START' || s.status === 'REJECTED_END'
                  return (
                    <tr key={s.id} className="align-middle even:bg-muted/30">
                      {isSupervisor && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center bg-secondary/15 text-[11px] font-bold text-secondary">{initials(s)}</span>
                            <span className="font-semibold">{fullName(s)}</span>
                          </div>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3">{new Date(s.approvedStartAt ?? s.requestedStartAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{clock(s.approvedStartAt)} – {clock(s.approvedEndAt)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{hasSummary ? (s.summary?.hours ?? 0).toFixed(1) : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{hasSummary ? formatKes(s.summary?.totalSales ?? 0) : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{hasSummary ? formatKes(s.summary?.totalPaid ?? 0) : '—'}</td>
                      <td className="px-4 py-3">
                        <Outcome s={s} />
                        {rejected && <p className="mt-1 max-w-48 truncate text-xs text-destructive" title={s.rejectionReason ?? ''}>{s.rejectionReason || 'No reason given'}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasSummary && (
                          <SlantButton tone="secondary" icon={<LuEye />} className="align-middle" loading={busyKey === `${s.id}:summary`} onClick={() => openSummary(s, isSupervisor ? `${s.employee.firstName}'s shift summary` : 'Shift summary')}>View</SlantButton>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}
