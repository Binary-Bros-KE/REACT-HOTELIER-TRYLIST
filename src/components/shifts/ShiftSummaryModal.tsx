import { useState, type ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'

export type ShiftSession = {
  id: string
  status: 'REQUESTED_START' | 'ACTIVE' | 'REQUESTED_END' | 'ENDED' | 'REJECTED_START' | 'REJECTED_END'
  requestedStartAt: string
  approvedStartAt: string | null
  requestedEndAt: string | null
  approvedEndAt: string | null
  rejectionReason: string | null
  cashVariance: number | null
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

/**
 * The one "what did this employee do on this shift" modal — sales,
 * transactions, hours, payment-method breakdown. Used both for a live
 * end-shift handover review (approval mode: cash-variance input + Approve/
 * Reject) and for read-only browsing of past shifts (Dashboard's recent-
 * shifts list, Attendance's employee report) — same data, same layout,
 * wherever it's opened from.
 */
export default function ShiftSummaryModal({
  title, session, summary, approval, busyKey, onClose, onApprove, onReject,
}: {
  title: string
  session: ShiftSession
  summary: ShiftSummary
  approval?: boolean
  busyKey?: string
  onClose: () => void
  onApprove?: (cashVariance?: number) => void
  onReject?: (cashVariance?: number) => void
}) {
  const [cashInput, setCashInput] = useState('')
  const cashBucket = summary.byPaymentMethod.find((m) => m.name.toLowerCase() === 'cash')
  const parsedVariance = cashInput.trim() === '' ? undefined : Number(cashInput)
  const decidedVariance = !approval && session.cashVariance != null ? session.cashVariance : null

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
          {(session.status === 'REJECTED_START' || session.status === 'REJECTED_END') && (
            <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Rejected</p>
              <p className="mt-1 text-sm">{session.rejectionReason || <span className="italic text-muted-foreground">No reason given</span>}</p>
            </div>
          )}
          {decidedVariance != null && Math.abs(decidedVariance) > 0.005 && (
            <div className={cn('rounded-sm border p-3 text-sm font-semibold', decidedVariance > 0 ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive')}>
              Cash {decidedVariance > 0 ? 'over' : 'short'} by {formatKes(Math.abs(decidedVariance))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ShiftMiniStat label="Hours" value={`${summary.hours.toFixed(2)}h`} />
            <ShiftMiniStat label="Sales" value={formatKes(summary.totalSales)} />
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cash variance (KSh) — positive if over, negative if short
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="0"
                className="w-40 rounded-sm border px-3 py-2 text-sm"
              />
              {cashBucket && <span className="text-xs text-muted-foreground">System cash total: {formatKes(cashBucket.total)}</span>}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {onReject && <button disabled={busyKey === `${session.id}:reject-end`} onClick={() => onReject(parsedVariance)} className="inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">{busyKey === `${session.id}:reject-end` && <LuLoaderCircle className="size-4 animate-spin" />}Reject</button>}
              {onApprove && <button disabled={busyKey === `${session.id}:approve-end`} onClick={() => onApprove(parsedVariance)} className="inline-flex items-center gap-2 rounded-sm bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busyKey === `${session.id}:approve-end` && <LuLoaderCircle className="size-4 animate-spin" />}Mark cleared and end shift</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ShiftMiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>
}

function ShiftSummaryTable({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <div className="overflow-hidden rounded-sm border">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{empty}</p> : <div className="max-h-56 overflow-y-auto"><table className="w-full text-left text-sm"><tbody>{children}</tbody></table></div>}
    </div>
  )
}
