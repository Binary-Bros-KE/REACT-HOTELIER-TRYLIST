import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuCircleAlert, LuFileText, LuLoaderCircle, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import ShiftSummaryModal, { formatKes, type ShiftSession as FullShiftSession, type ShiftSummary } from '@/components/shifts/ShiftSummaryModal'

type Employee = { id: string; firstName: string; lastName: string; jobTitle: string; status: string }
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE'
type AttendanceRecord = { employeeId: string; date: string; status: AttendanceStatus; notes: string | null }
type ShiftSession = { id: string; employeeId: string; status: string; requestedStartAt: string; approvedStartAt: string | null; approvedEndAt: string | null }
type EmployeeReport = {
  employee: Employee
  totals: { shifts: number; rejected: number; hours: number; sales: number; paid: number; creditSales: number }
  sessions: (FullShiftSession & { summary: ShiftSummary | null })[]
}

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE']
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success/15 text-success',
  ABSENT: 'bg-destructive/15 text-destructive',
  LATE: 'bg-warning/15 text-warning',
  ON_LEAVE: 'bg-secondary/15 text-secondary',
}
const STATUS_DOT: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success',
  ABSENT: 'bg-destructive',
  LATE: 'bg-warning',
  ON_LEAVE: 'bg-secondary',
}
const STATUS_LETTER: Record<AttendanceStatus, string> = { PRESENT: 'P', ABSENT: 'A', LATE: 'L', ON_LEAVE: 'O' }
const STATUS_LABEL: Record<AttendanceStatus, string> = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', ON_LEAVE: 'On leave' }
const titleCase = (value: string) => value.toLowerCase().split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')

// "YYYY-MM-DD" -> day-of-month, cheaply, without a Date/timezone round trip.
function monthKey(date: string): string {
  return date.slice(8, 10)
}

// Monday-first calendar grid for a given month: null cells pad the first
// week (before day 1) and the last week (after the month's final day) so
// every row is a full 7-day week, like a real calendar.
function calendarWeeks(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7 // 0=Mon..6=Sun
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Attendance() {
  const toast = useToast()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-based
  const [employees, setEmployees] = useState<Employee[]>([])
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map())
  const [shiftSessions, setShiftSessions] = useState<ShiftSession[]>([])
  const [report, setReport] = useState<EmployeeReport | null>(null)
  // Housekeeping task output for the same month; null when the tenant has no housekeeping module or the viewer may not see it.
  const [taskReport, setTaskReport] = useState<{ tasksCompleted: number; totalWorkMinutes: number; avgWorkMinutes: number | null; onTimeRate: number | null } | null>(null)
  const [selectedSummary, setSelectedSummary] = useState<{ title: string; session: FullShiftSession; summary: ShiftSummary } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const weeks = useMemo(() => calendarWeeks(year, month), [year, month])
  const monthLabel = useMemo(() => new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), [year, month])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [e, r, shifts] = await Promise.all([
        api<{ employees: Employee[] }>('/employees'),
        api<{ records: AttendanceRecord[] }>(`/attendance?year=${year}&month=${month}`),
        api<{ sessions: ShiftSession[] }>(`/shifts/sessions?year=${year}&month=${month}`),
      ])
      setEmployees(e.employees.filter((emp) => emp.status === 'ACTIVE'))
      setRecords(new Map(r.records.map((rec) => [`${rec.employeeId}|${monthKey(rec.date)}`, rec])))
      setShiftSessions(shifts.sessions)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load attendance'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [year, month, toast])

  useEffect(() => { void load() }, [load])

  async function openReport(employee: Employee) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const next = new Date(year, month, 1)
    const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
    try {
      setTaskReport(null)
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      const [shiftReport, tasks] = await Promise.all([
        api<EmployeeReport>(`/shifts/employees/${employee.id}/report?from=${from}&to=${to}`),
        api<{ employee: NonNullable<typeof taskReport> }>(`/housekeeping/reports/employees/${employee.id}?month=${monthKey}`).then((r) => r.employee).catch(() => null),
      ])
      setReport(shiftReport)
      setTaskReport(tasks && tasks.tasksCompleted > 0 ? tasks : null)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load employee report')
    }
  }

  function shiftMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
    setOpenKey(null)
  }

  async function setStatus(employeeId: string, day: number, status: AttendanceStatus | null) {
    const key = `${employeeId}|${String(day).padStart(2, '0')}`
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setOpenKey(null)
    setSavingKey(key)
    try {
      if (status) {
        await api<{ record: AttendanceRecord }>('/attendance/mark', { method: 'PUT', body: JSON.stringify({ employeeId, date: dateStr, status }) })
      } else {
        await api(`/attendance/${employeeId}/${dateStr}`, { method: 'DELETE' })
      }
      setRecords((prev) => {
        const copy = new Map(prev)
        if (status) copy.set(key, { employeeId, date: dateStr, status, notes: null })
        else copy.delete(key)
        return copy
      })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update attendance')
    } finally {
      setSavingKey(null)
    }
  }

  const summaryFor = useMemo(() => {
    const counts = new Map<string, Record<AttendanceStatus, number>>()
    for (const rec of records.values()) {
      const row = counts.get(rec.employeeId) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, ON_LEAVE: 0 }
      row[rec.status] += 1
      counts.set(rec.employeeId, row)
    }
    return counts
  }, [records])

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">Team</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Attendance</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Click a day to choose Present, Absent, Late, or On leave for that person — any past month is one click away.</p>
        </div>
        <div className="flex items-center gap-2 rounded-sm border bg-card px-2 py-1.5 shadow-sm">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded-sm p-1.5 hover:bg-muted"><LuChevronLeft className="size-4" /></button>
          <span className="min-w-32 text-center text-sm font-semibold">{monthLabel}</span>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" className="rounded-sm p-1.5 hover:bg-muted"><LuChevronRight className="size-4" /></button>
        </div>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', STATUS_DOT[s])} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 flex min-h-64 items-center justify-center gap-2 rounded-lg border bg-card p-8 text-sm text-muted-foreground shadow-sm"><LuLoaderCircle className="animate-spin" /> Loading attendance…</div>
      ) : employees.length === 0 ? (
        <div className="mt-6 min-h-64 rounded-lg border bg-card p-16 text-center text-sm text-muted-foreground shadow-sm">No active employees yet.</div>
      ) : (
        <div className="mt-6 space-y-6">
          {employees.map((emp) => (
            <EmployeeCalendar
              key={emp.id}
              employee={emp}
              weeks={weeks}
              records={records}
              shifts={shiftSessions.filter((s) => s.employeeId === emp.id)}
              summary={summaryFor.get(emp.id)}
              savingKey={savingKey}
              openKey={openKey}
              setOpenKey={setOpenKey}
              onSetStatus={setStatus}
              onReport={openReport}
            />
          ))}
        </div>
      )}
      {report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-secondary">Employee report</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{report.employee.firstName} {report.employee.lastName}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              <Mini label="Shifts" value={String(report.totals.shifts)} />
              <Mini label="Rejected" value={String(report.totals.rejected)} />
              <Mini label="Hours" value={report.totals.hours.toFixed(1)} />
              <Mini label="Sales" value={`KSh ${Math.round(report.totals.sales).toLocaleString()}`} />
              <Mini label="Credit" value={`KSh ${Math.round(report.totals.creditSales).toLocaleString()}`} />
            </div>
            {taskReport && (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Housekeeping tasks</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-4">
                  <Mini label="Tasks done" value={String(taskReport.tasksCompleted)} />
                  <Mini label="Avg time" value={taskReport.avgWorkMinutes === null ? '-' : `${taskReport.avgWorkMinutes} min`} />
                  <Mini label="Task time" value={`${(taskReport.totalWorkMinutes / 60).toFixed(1)} h`} />
                  <Mini label="On time" value={taskReport.onTimeRate === null ? '-' : `${taskReport.onTimeRate}%`} />
                </div>
              </>
            )}
            <div className="mt-4 max-h-72 overflow-y-auto rounded-sm border">
              {report.sessions.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No shifts in this period.</p> : report.sessions.map((s) => {
                const rejected = s.status === 'REJECTED_START' || s.status === 'REJECTED_END'
                const clickable = Boolean(s.summary)
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => s.summary && setSelectedSummary({ title: `${report.employee.firstName}'s shift summary`, session: s, summary: s.summary })}
                    className={cn('block w-full border-t p-3 text-left first:border-t-0', clickable && 'transition hover:bg-muted/50')}
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {s.approvedStartAt ? new Date(s.approvedStartAt).toLocaleString() : 'Shift'} - {s.approvedEndAt ? new Date(s.approvedEndAt).toLocaleString() : rejected ? 'rejected' : 'open'}
                      {rejected && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">Rejected</span>}
                    </p>
                    {rejected && <p className="mt-1 text-xs text-destructive">{s.rejectionReason || 'No reason given'}</p>}
                    {s.summary && (
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {s.summary.byPaymentMethod.map((m) => <span key={m.name} className="rounded-sm border px-2 py-1">{m.name}: {formatKes(m.total)}</span>)}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-5 flex justify-end"><button onClick={() => setReport(null)} className="rounded-sm border px-4 py-2 text-sm font-semibold hover:bg-muted">Close</button></div>
          </div>
        </div>
      )}
      {selectedSummary && (
        <ShiftSummaryModal
          title={selectedSummary.title}
          session={selectedSummary.session}
          summary={selectedSummary.summary}
          onChanged={() => { if (report) void openReport(report.employee) }}
          onClose={() => setSelectedSummary(null)}
        />
      )}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>
}

function EmployeeCalendar({
  employee, weeks, records, shifts, summary, savingKey, openKey, setOpenKey, onSetStatus, onReport,
}: {
  employee: Employee
  weeks: (number | null)[][]
  records: Map<string, AttendanceRecord>
  shifts: ShiftSession[]
  summary: Record<AttendanceStatus, number> | undefined
  savingKey: string | null
  openKey: string | null
  setOpenKey: (key: string | null) => void
  onSetStatus: (employeeId: string, day: number, status: AttendanceStatus | null) => void
  onReport: (employee: Employee) => void
}) {
  return (
    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold">{employee.firstName} {employee.lastName}</h2>
        <p className="text-xs text-muted-foreground">{employee.jobTitle}</p>
        <button onClick={() => onReport(employee)} className="inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"><LuFileText className="size-3.5" /> Employee report</button>
        <p className="flex gap-3 text-xs font-semibold tabular-nums">
          <span className="text-success">{summary?.PRESENT ?? 0} present</span>
          <span className="text-destructive">{summary?.ABSENT ?? 0} absent</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => <div key={label}>{label}</div>)}
      </div>

      <div className="mt-1.5 space-y-1.5">
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-7 gap-1.5">
            {week.map((day, j) => (
              day === null
                ? <div key={j} />
                : (
                  <DayCell
                    key={j}
                    employee={employee}
                    day={day}
                    record={records.get(`${employee.id}|${String(day).padStart(2, '0')}`)}
                    shift={shifts.find((s) => (s.approvedStartAt ?? s.requestedStartAt).slice(8, 10) === String(day).padStart(2, '0'))}
                    isSaving={savingKey === `${employee.id}|${String(day).padStart(2, '0')}`}
                    isOpen={openKey === `${employee.id}|${String(day).padStart(2, '0')}`}
                    setOpenKey={setOpenKey}
                    onSetStatus={onSetStatus}
                  />
                )
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function DayCell({
  employee, day, record, shift, isSaving, isOpen, setOpenKey, onSetStatus,
}: {
  employee: Employee
  day: number
  record: AttendanceRecord | undefined
  shift: ShiftSession | undefined
  isSaving: boolean
  isOpen: boolean
  setOpenKey: (key: string | null) => void
  onSetStatus: (employeeId: string, day: number, status: AttendanceStatus | null) => void
}) {
  const key = `${employee.id}|${String(day).padStart(2, '0')}`
  const ref = useRef<HTMLDivElement>(null)
  const status = record?.status
  const shiftTone = shift?.status === 'ACTIVE' ? 'bg-success' : shift?.status === 'REQUESTED_START' || shift?.status === 'REQUESTED_END' ? 'bg-warning' : shift ? 'bg-secondary' : ''

  useEffect(() => {
    if (!isOpen) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenKey(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [isOpen, setOpenKey])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpenKey(isOpen ? null : key)}
        disabled={isSaving}
        className={cn(
          'flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-md border text-sm font-bold transition-colors disabled:opacity-50',
          status ? cn(STATUS_STYLE[status], 'border-transparent') : 'border-border text-foreground hover:bg-muted',
        )}
      >
        {isSaving ? (
          <LuLoaderCircle className="size-4 animate-spin" />
        ) : (
          <>
            <span className="text-[11px] font-semibold leading-none opacity-70">{day}</span>
            <span className="text-sm leading-none">{status ? STATUS_LETTER[status] : ''}</span>
            {shift && <span title={titleCase(shift.status)} className={cn('absolute bottom-1 right-1 size-2 rounded-full', shiftTone)} />}
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-1/2 top-full z-20 mt-1.5 w-40 -translate-x-1/2 overflow-hidden rounded-sm border bg-card shadow-lg">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => onSetStatus(employee.id, day, s)}
              className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted', status === s && 'bg-muted/60 font-semibold')}
            >
              <span className={cn('size-2.5 shrink-0 rounded-full', STATUS_DOT[s])} />
              {STATUS_LABEL[s]}
            </button>
          ))}
          {status && (
            <button
              onClick={() => onSetStatus(employee.id, day, null)}
              className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              <LuX className="size-3.5 shrink-0" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
