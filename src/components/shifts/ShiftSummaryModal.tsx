import { useEffect, useState, type ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'

export type ShiftSession = {
  id: string
  status: 'REQUESTED_START' | 'ACTIVE' | 'REQUESTED_END' | 'ENDED' | 'REJECTED_START' | 'REJECTED_END'
  requestedStartAt: string
  approvedStartAt: string | null
  requestedEndAt: string | null
  approvedEndAt: string | null
  rejectionReason: string | null
  cashVariance: number | string | null
  varianceNote?: string | null
  reviewedAt?: string | null
  reviewReason?: string | null
  employee: { id: string; firstName: string; lastName: string; jobTitle: string; supervisorId: string | null; isSupervisor: boolean }
}

export type ShiftSummary = {
  from: string
  to: string
  hours: number
  totalSales: number
  totalPaid: number
  complimentaryTotal: number
  complimentaryCount: number
  creditSales: number
  pendingOrders: number
  byPaymentMethod: { name: string; total: number; count: number }[]
  transactions: {
    id: string
    transactionNo: string
    direction: 'IN' | 'OUT'
    source: string
    amount: number
    paymentMethod: string | null
    reference: string | null
    description: string | null
    createdAt: string
  }[]
  sales: {
    id: string
    orderNumber: number
    status: string
    paymentStatus: string
    saleType: 'SALE' | 'COMPLIMENTARY'
    complimentaryOrderRole: string | null
    complimentaryRecipientName: string | null
    createdAt: string
    total: number
    paid: number
  }[]
}

export const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export type ShiftDecision = { cashVariance?: number; varianceNote?: string }

// Super Admin implicitly holds every permission server-side; mirror that here
// so the controls show even before a tenant's role rows list the newer ones.
function useCan(permission: string) {
  const role = useAppSelector((s) => s.auth.user?.role)
  return role?.name === 'Super Admin' || Boolean(role?.permissions.includes(permission))
}

const nairobiMonth = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 7)

/**
 * The one "what did this employee do on this shift" modal — sales,
 * transactions, hours, payment-method breakdown. Used both for a live
 * end-shift handover review (approval mode: cash-variance input + Approve/
 * Reject) and for read-only browsing of past shifts (Dashboard's recent-
 * shifts list, Attendance's employee report) — same data, same layout,
 * wherever it's opened from.
 */
export default function ShiftSummaryModal({
  title, session, summary, approval, busyKey, onClose, onApprove, onReject, onChanged,
}: {
  title: string
  session: ShiftSession
  summary: ShiftSummary
  approval?: boolean
  busyKey?: string
  onClose: () => void
  onApprove?: (decision: ShiftDecision) => void
  onReject?: (decision: ShiftDecision) => void
  /** Called after a review/payroll edit so the parent can refresh its lists. */
  onChanged?: () => void
}) {
  const canReview = useCan('SHIFT_REVIEW')
  const canSalary = useCan('SALARY_MANAGE')
  // The modal edits its own copy after a review so it reflects the change
  // immediately, without waiting on the parent to reload.
  const [live, setLive] = useState(session)
  useEffect(() => setLive(session), [session])
  const [somethingOff, setSomethingOff] = useState(false)
  const [cashInput, setCashInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const cashBucket = summary.byPaymentMethod.find((m) => m.name.toLowerCase() === 'cash')
  const parsedVariance = somethingOff && cashInput.trim() !== '' ? Number(cashInput) : undefined
  const decision: ShiftDecision = somethingOff ? { cashVariance: parsedVariance, varianceNote: noteInput.trim() || undefined } : {}
  const flaggedMissingInfo = somethingOff && (!parsedVariance || Math.abs(parsedVariance) < 0.005 || !noteInput.trim())
  const decidedVariance = !approval && live.cashVariance != null ? Number(live.cashVariance) : null
  const decided = live.status === 'ENDED' || live.status === 'REJECTED_END'
  // Everything in the Transactions table below, money in minus money out — set
  // beside Sales so a missing or extra transaction stands out at a glance.
  const transactionsNet = summary.transactions.reduce((sum, t) => sum + (t.direction === 'IN' ? t.amount : -t.amount), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-8">
      <div className="w-full max-w-4xl rounded-sm border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Shift handover</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{session.employee.firstName} {session.employee.lastName} - {summary.from ? new Date(summary.from).toLocaleString() : ''}</p>
          </div>
          <button onClick={onClose} className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Close</button>
        </div>
        <div className="space-y-5 p-5">
          {(live.status === 'REJECTED_START' || live.status === 'REJECTED_END') && (
            <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Rejected</p>
              <p className="mt-1 text-sm">{live.rejectionReason || <span className="italic text-muted-foreground">No reason given</span>}</p>
            </div>
          )}
          {decidedVariance != null && Math.abs(decidedVariance) > 0.005 && (
            <div className={cn('rounded-sm border p-3 text-sm font-semibold', decidedVariance > 0 ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive')}>
              Cash {decidedVariance > 0 ? 'over' : 'short'} by {formatKes(Math.abs(decidedVariance))}
              {live.varianceNote && <p className="mt-1 text-sm font-normal text-foreground">{live.varianceNote}</p>}
            </div>
          )}
          {live.reviewedAt && (
            <p className="text-xs text-muted-foreground">Outcome edited {new Date(live.reviewedAt).toLocaleString()}{live.reviewReason ? ' — ' + live.reviewReason : ''}</p>
          )}
          {!approval && decided && canReview && <ReviewPanel session={live} onSaved={(next) => { setLive(next); onChanged?.() }} />}
          {!approval && decided && canSalary && <PayrollPanel session={live} onSaved={() => onChanged?.()} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <ShiftMiniStat label="Hours" value={`${summary.hours.toFixed(2)}h`} />
            <ShiftMiniStat label="Sales" value={formatKes(summary.totalSales)} hint={`${summary.sales.length} sale${summary.sales.length === 1 ? '' : 's'}`} />
            <ShiftMiniStat label="Transactions" value={formatKes(transactionsNet)} hint={`${summary.transactions.length} transaction${summary.transactions.length === 1 ? '' : 's'}`} />
            <ShiftMiniStat label="Collected" value={formatKes(summary.totalPaid)} />
            <ShiftMiniStat label="Credit" value={formatKes(summary.creditSales)} />
            <ShiftMiniStat label="Complimentary" value={formatKes(summary.complimentaryTotal)} />
          </div>
          <ShiftSummaryTable title="Sales by payment method" empty="No payments collected.">
            {summary.byPaymentMethod.map((m) => <tr key={m.name} className="border-t"><td className="px-3 py-2">{m.name}</td><td className="px-3 py-2 text-right">{m.count}</td><td className="px-3 py-2 text-right font-semibold">{formatKes(m.total)}</td></tr>)}
          </ShiftSummaryTable>
          <ShiftSummaryTable title="Transactions" empty="No transactions recorded.">
            {summary.transactions.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2">
                  <p className="font-semibold">{t.reference || t.transactionNo}</p>
                  {t.reference && <p className="text-[11px] text-muted-foreground">Txn {t.transactionNo}</p>}
                </td>
                <td className="px-3 py-2">{t.paymentMethod ?? t.source}</td>
                <td className="px-3 py-2">{new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td className={cn('px-3 py-2 text-right font-semibold', t.direction === 'IN' ? 'text-success' : 'text-destructive')}>{t.direction === 'IN' ? '+' : '-'}{formatKes(t.amount)}</td>
              </tr>
            ))}
          </ShiftSummaryTable>
          <ShiftSummaryTable title="Sales" empty="No sales recorded.">
            {summary.sales.map((s) => <tr key={s.id} className="border-t"><td className="px-3 py-2">#{s.orderNumber}</td><td className="px-3 py-2">{s.saleType === 'COMPLIMENTARY' ? `Complementary${s.complimentaryRecipientName ? ` - ${s.complimentaryRecipientName}` : ''}` : s.paymentStatus}</td><td className="px-3 py-2">{new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-2 text-right font-semibold">{formatKes(s.total)}</td></tr>)}
          </ShiftSummaryTable>
        </div>
        {approval && (onApprove || onReject) && (
          <div className="border-t p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setSomethingOff(false)} className={cn('rounded-sm border p-3 text-left text-sm', !somethingOff ? 'border-success bg-success/10' : 'hover:bg-muted')}>
                <span className="font-semibold">Cleared</span>
                <span className="block text-xs text-muted-foreground">Nothing is wrong with this shift.</span>
              </button>
              <button type="button" onClick={() => setSomethingOff(true)} className={cn('rounded-sm border p-3 text-left text-sm', somethingOff ? 'border-destructive bg-destructive/10' : 'hover:bg-muted')}>
                <span className="font-semibold">Something is off</span>
                <span className="block text-xs text-muted-foreground">Record the amount and what happened.</span>
              </button>
            </div>
            {somethingOff && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount off (KSh) — positive if over, negative if short</label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input type="number" step="0.01" value={cashInput} onChange={(e) => setCashInput(e.target.value)} placeholder="e.g. -500" className="w-40 rounded-sm border px-3 py-2 text-sm" />
                    {cashBucket && <span className="text-xs text-muted-foreground">System cash total: {formatKes(cashBucket.total)}</span>}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes — what happened</label>
                  <textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} maxLength={500} className="mt-1.5 min-h-20 w-full rounded-sm border px-3 py-2 text-sm" placeholder="Explain the discrepancy" />
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {onReject && <button disabled={flaggedMissingInfo || busyKey === `${session.id}:reject-end`} onClick={() => onReject(decision)} className="inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">{busyKey === `${session.id}:reject-end` && <LuLoaderCircle className="size-4 animate-spin" />}Reject</button>}
              {onApprove && <button disabled={flaggedMissingInfo || busyKey === `${session.id}:approve-end`} onClick={() => onApprove(decision)} className={cn('inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold text-white disabled:opacity-60', somethingOff ? 'bg-destructive' : 'bg-success')}>{busyKey === `${session.id}:approve-end` && <LuLoaderCircle className="size-4 animate-spin" />}{somethingOff ? 'End shift with discrepancy' : 'Mark cleared and end shift'}</button>}
            </div>
            {flaggedMissingInfo && <p className="mt-2 text-right text-xs text-muted-foreground">Enter the amount and a note to continue.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function ShiftMiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p>{hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}</div>
}

function ShiftSummaryTable({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <div className="overflow-hidden rounded-sm border">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{empty}</p> : <div className="max-h-56 overflow-y-auto"><table className="w-full text-left text-sm"><tbody>{children}</tbody></table></div>}
    </div>
  )
}

function ReviewPanel({ session, onSaved }: { session: ShiftSession; onSaved: (next: ShiftSession) => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const variance = session.cashVariance != null ? Number(session.cashVariance) : null
  const [status, setStatus] = useState<'ENDED' | 'REJECTED_END'>(session.status === 'REJECTED_END' ? 'REJECTED_END' : 'ENDED')
  const [amount, setAmount] = useState(variance != null ? String(variance) : '')
  const [note, setNote] = useState(session.varianceNote ?? '')
  const [reason, setReason] = useState('')
  const hasAmount = amount.trim() !== '' && Math.abs(Number(amount)) >= 0.005
  const invalid = reason.trim().length < 3 || (hasAmount && !note.trim())

  async function save() {
    setSaving(true)
    try {
      const { session: next } = await api<{ session: ShiftSession }>(`/shifts/${session.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: reason.trim(), cashVariance: hasAmount ? Number(amount) : undefined, varianceNote: hasAmount ? note.trim() : undefined }),
      })
      toast.success('Shift outcome updated.')
      setOpen(false)
      setReason('')
      onSaved({ ...session, ...next, employee: session.employee })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update the shift')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Edit outcome / discrepancy</button>
  }
  return (
    <div className="space-y-3 rounded-sm border bg-muted/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edit shift outcome</p>
      <div className="flex flex-wrap gap-2">
        {([['ENDED', 'Cleared'], ['REJECTED_END', 'Rejected']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={cn('rounded-sm border px-3 py-1.5 text-sm font-semibold', status === value ? (value === 'ENDED' ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10') : 'hover:bg-muted')}>{label}</button>
        ))}
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount off (KSh) — positive if over, negative if short; leave empty for none</label>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 w-40 rounded-sm border px-3 py-2 text-sm" />
      </div>
      {hasAmount && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes — what happened</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1.5 min-h-16 w-full rounded-sm border px-3 py-2 text-sm" />
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason for this change <span className="text-destructive">*</span></label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1.5 w-full rounded-sm border px-3 py-2 text-sm" placeholder="Why is the outcome being changed?" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Cancel</button>
        <button type="button" disabled={invalid || saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving && <LuLoaderCircle className="size-4 animate-spin" />}Save</button>
      </div>
    </div>
  )
}

type RecordedItem = { id: string; type: 'ALLOWANCE' | 'DEDUCTION'; label: string; amount: string | number; salary: { payslipNo: string; payPeriod: string; status: string } }

function PayrollPanel({ session, onSaved }: { session: ShiftSession; onSaved: () => void }) {
  const toast = useToast()
  const variance = session.cashVariance != null ? Number(session.cashVariance) : 0
  const [recorded, setRecorded] = useState<RecordedItem | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<'ALLOWANCE' | 'DEDUCTION'>(variance > 0 ? 'ALLOWANCE' : 'DEDUCTION')
  const [amount, setAmount] = useState(variance ? String(Math.abs(variance)) : '')
  const [label, setLabel] = useState('')
  const [month, setMonth] = useState(nairobiMonth(session.approvedStartAt ?? session.requestedStartAt))

  useEffect(() => {
    api<{ item: RecordedItem | null }>(`/employee-salaries/by-shift/${session.id}`)
      .then(({ item }) => {
        setRecorded(item)
        if (item) { setType(item.type); setAmount(String(Number(item.amount))); setLabel(item.label); setMonth(item.salary.payPeriod.slice(0, 7)) }
      })
      .catch(() => {})
  }, [session.id])

  const locked = recorded != null && recorded.salary.status !== 'DRAFT'

  async function save() {
    setSaving(true)
    try {
      await api('/employee-salaries/from-shift', { method: 'POST', body: JSON.stringify({ shiftSessionId: session.id, type, amount: Number(amount), label: label.trim() || undefined, payPeriod: month + '-01' }) })
      toast.success(recorded ? 'Salary line updated.' : 'Added to ' + month + ' salary draft.')
      setOpen(false)
      const { item } = await api<{ item: RecordedItem | null }>(`/employee-salaries/by-shift/${session.id}`)
      setRecorded(item)
      onSaved()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the adjustment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 rounded-sm border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payroll</p>
      {recorded && (
        <p className="text-sm">
          Recorded as a <span className="font-semibold">{recorded.type === 'DEDUCTION' ? 'deduction' : 'allowance'}</span> of {formatKes(Number(recorded.amount))} on the {new Date(recorded.salary.payPeriod).toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' })} salary ({recorded.salary.payslipNo}, {recorded.salary.status.toLowerCase()}).
        </p>
      )}
      {locked ? (
        <p className="text-xs text-muted-foreground">That salary is already completed, so this line can no longer be changed.</p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:bg-muted">{recorded ? 'Edit salary line' : 'Record deduction / allowance'}</button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'ALLOWANCE' | 'DEDUCTION')} className="mt-1.5 w-full rounded-sm border px-3 py-2 text-sm">
              <option value="DEDUCTION">Deduction</option>
              <option value="ALLOWANCE">Allowance</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount (KSh)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 w-full rounded-sm border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salary month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={recorded != null} className="mt-1.5 w-full rounded-sm border px-3 py-2 text-sm disabled:opacity-60" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label (optional)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className="mt-1.5 w-full rounded-sm border px-3 py-2 text-sm" placeholder="Shift shortage - 10 March" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Adds to that month's draft salary, or creates the draft if there isn't one yet. It's added up with everything else when the salary is completed.</p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-sm border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Cancel</button>
            <button type="button" disabled={saving || !(Number(amount) > 0)} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving && <LuLoaderCircle className="size-4 animate-spin" />}{recorded ? 'Update' : 'Record'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
