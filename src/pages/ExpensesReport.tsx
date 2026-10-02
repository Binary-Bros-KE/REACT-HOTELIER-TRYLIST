import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuDownload,
  LuHandCoins,
  LuLandmark,
  LuLoaderCircle,
  LuPackagePlus,
  LuReceiptText,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportDocData } from '@/components/documents/pdf'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }
type NameBucket = { name: string; count: number; total: number; percentOfTotal: number }
type TrendPoint = { date: string; total: number }

type ExpenseRow = { id: string; expenseNo: string; date: string; category: string; amount: number; paymentMethod: string; reference: string | null; description: string | null; location: string | null; recordedBy: string | null }
type SalaryRow = { id: string; payslipNo: string; payPeriod: string; employeeName: string; department: string; location: string | null; grossPay: number; totalDeductions: number; netPay: number; paymentMethod: string | null; paidAt: string | null }
type SupplierPaymentRow = { id: string; paymentNo: string; supplier: string; purchaseNo: string | null; amount: number; paymentMethod: string; reference: string | null; paidAt: string; recordedBy: string | null }
type AssetPurchaseRow = { id: string; occurredAt: string; assetName: string; assetNo: string; category: string | null; quantity: number; unitCost: number | null; value: number; paymentMethod: string; reference: string | null; placement: string | null; recordedBy: string | null }

type ExpensesReportData = {
  range: { period: Period; start: string; end: string }
  cards: {
    totalCashOut: number; operatingExpenses: number; capitalOutflows: number
    expensesTotal: number; expensesCount: number
    salariesTotal: number; salariesCount: number
    supplierPaymentsTotal: number; supplierPaymentsCount: number
    assetPurchasesTotal: number; assetPurchasesCount: number
  }
  trend: TrendPoint[]
  expensesByCategory: NameBucket[]
  expensesByRecordedBy: NameBucket[]
  salariesByDepartment: NameBucket[]
  supplierPaymentsBySupplier: NameBucket[]
  assetPurchasesByCategory: NameBucket[]
  byPaymentMethod: NameBucket[]
  expensesList: ExpenseRow[]
  salariesList: SalaryRow[]
  supplierPaymentsList: SupplierPaymentRow[]
  assetPurchasesList: AssetPurchaseRow[]
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function rangeLabel(period: Period, startIso: string, endIso: string) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (period === 'day') return s.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${s.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} - ${e.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function buildReportDoc(report: ExpensesReportData): ReportDocData {
  const c = report.cards
  const bucketRows = (rows: NameBucket[]) => rows.map((r) => [r.name, r.count, `${r.percentOfTotal.toFixed(1)}%`, formatKes(r.total)])
  return {
    reportTitle: 'Expenses Report',
    kicker: 'Reports',
    rangeLabel: rangeLabel(report.range.period, report.range.start, report.range.end),
    generatedAt: new Date().toISOString(),
    cards: [
      { label: 'Total Cash Out', value: formatKes(c.totalCashOut) },
      { label: 'Operating Expenses', value: formatKes(c.operatingExpenses), hint: 'Expenses + Salaries' },
      { label: 'Capital Outflows', value: formatKes(c.capitalOutflows), hint: 'Supplier payments + Asset purchases' },
      { label: 'Expenses', value: formatKes(c.expensesTotal), hint: `${c.expensesCount} record${c.expensesCount === 1 ? '' : 's'}` },
      { label: 'Salaries Paid', value: formatKes(c.salariesTotal), hint: `${c.salariesCount} payslip${c.salariesCount === 1 ? '' : 's'}` },
      { label: 'Supplier Payments', value: formatKes(c.supplierPaymentsTotal), hint: `${c.supplierPaymentsCount} payment${c.supplierPaymentsCount === 1 ? '' : 's'}` },
      { label: 'Asset Purchases', value: formatKes(c.assetPurchasesTotal), hint: `${c.assetPurchasesCount} purchase${c.assetPurchasesCount === 1 ? '' : 's'}` },
    ],
    sections: [
      { title: 'Expenses by Category', columns: [{ label: 'Category' }, { label: 'Records', align: 'right' }, { label: '% of Total', align: 'right' }, { label: 'Total', align: 'right' }], rows: bucketRows(report.expensesByCategory) },
      { title: 'Salaries by Department', columns: [{ label: 'Department' }, { label: 'Payslips', align: 'right' }, { label: '% of Total', align: 'right' }, { label: 'Total', align: 'right' }], rows: bucketRows(report.salariesByDepartment) },
      { title: 'Supplier Payments by Supplier', columns: [{ label: 'Supplier' }, { label: 'Payments', align: 'right' }, { label: '% of Total', align: 'right' }, { label: 'Total', align: 'right' }], rows: bucketRows(report.supplierPaymentsBySupplier) },
      { title: 'Asset Purchases by Category', columns: [{ label: 'Category' }, { label: 'Purchases', align: 'right' }, { label: '% of Total', align: 'right' }, { label: 'Total', align: 'right' }], rows: bucketRows(report.assetPurchasesByCategory) },
      { title: 'All Cash Out by Payment Method', columns: [{ label: 'Method' }, { label: 'Payments', align: 'right' }, { label: '% of Total', align: 'right' }, { label: 'Total', align: 'right' }], rows: bucketRows(report.byPaymentMethod) },
    ],
  }
}

function stepAnchor(period: Exclude<Period, 'custom'>, iso: string, dir: 1 | -1) {
  const d = new Date(`${iso}T00:00:00`)
  if (period === 'day') d.setDate(d.getDate() + dir)
  else if (period === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  return toLocalIso(d)
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(report: ExpensesReportData) {
  const rows = [
    ['Section', 'Ref', 'Date', 'Who/What', 'Detail', 'Payment Method', 'Amount'],
    ...report.expensesList.map((e) => ['Expense', e.expenseNo, e.date, e.category, e.description ?? '', e.paymentMethod, e.amount]),
    ...report.salariesList.map((s) => ['Salary', s.payslipNo, s.paidAt ?? '', s.employeeName, s.department, s.paymentMethod ?? '', s.netPay]),
    ...report.supplierPaymentsList.map((p) => ['Supplier Payment', p.paymentNo, p.paidAt, p.supplier, p.purchaseNo ?? '', p.paymentMethod, p.amount]),
    ...report.assetPurchasesList.map((m) => ['Asset Purchase', m.assetNo, m.occurredAt, m.assetName, m.category ?? '', m.paymentMethod, m.value]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `expenses-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExpensesReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<ExpensesReportData | null>(null)
  const [detailTab, setDetailTab] = useState<'expenses' | 'salaries' | 'supplierPayments' | 'assetPurchases'>('expenses')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      setReport(await api<ExpensesReportData>(`/reports/expenses?${query}`))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the expenses report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  const c = report?.cards
  const detailLabels = {
    expenses: `Expenses (${report?.expensesList.length ?? 0})`,
    salaries: `Salaries (${report?.salariesList.length ?? 0})`,
    supplierPayments: `Supplier Payments (${report?.supplierPaymentsList.length ?? 0})`,
    assetPurchases: `Asset Purchases (${report?.assetPurchasesList.length ?? 0})`,
  } as const

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Expenses Report" />

      <div className="mt-6 space-y-3 rounded-sm border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-sm border p-0.5">
            {(['day', 'week', 'month', 'custom'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide', period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Range'}
              </button>
            ))}
          </div>
          {period === 'custom' ? (
            <div className="flex flex-wrap items-center gap-2">
              <LuCalendarDays className="text-muted-foreground" />
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous" onClick={() => setAnchor((a) => stepAnchor(period as Exclude<Period, 'custom'>, a, -1))} />
              <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next" onClick={() => setAnchor((a) => stepAnchor(period as Exclude<Period, 'custom'>, a, 1))} />
            </div>
          )}
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="ml-auto rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuDownload />} disabled={!report || loading} onClick={() => report && downloadCsv(report)}>Export Report</ActionButton>
          <PrintReportButton data={report ? buildReportDoc(report) : null} disabled={loading} />
        </div>
        <p className="text-[11px] text-muted-foreground">Every real cash outflow across the business for the selected period. Operating costs (Expenses, Salaries) reduce Net Profit on the Sales Report; capital outflows (Supplier Payments, Asset Purchases) don't — stock becomes cost of goods when sold, equipment stays on the books as an asset.</p>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report || !c ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-3">
            <StatCard index={0} label="Total Cash Out" value={formatKes(c.totalCashOut)} icon={<LuWallet />} hint="Operating + capital, every source combined" />
            <StatCard index={1} label="Operating Expenses" value={formatKes(c.operatingExpenses)} icon={<LuReceiptText />} hint="Expenses + Salaries — reduces Net Profit" />
            <StatCard index={2} label="Capital Outflows" value={formatKes(c.capitalOutflows)} icon={<LuLandmark />} hint="Supplier payments + Asset purchases — not an expense" />
          </section>

          <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PlainStat label="Expenses" value={formatKes(c.expensesTotal)} meta={`${c.expensesCount} record${c.expensesCount === 1 ? '' : 's'}`} icon={<LuReceiptText />} />
            <PlainStat label="Salaries Paid" value={formatKes(c.salariesTotal)} meta={`${c.salariesCount} payslip${c.salariesCount === 1 ? '' : 's'}`} icon={<LuUsers />} />
            <PlainStat label="Supplier Payments" value={formatKes(c.supplierPaymentsTotal)} meta={`${c.supplierPaymentsCount} payment${c.supplierPaymentsCount === 1 ? '' : 's'}`} icon={<LuHandCoins />} />
            <PlainStat label="Asset Purchases" value={formatKes(c.assetPurchasesTotal)} meta={`${c.assetPurchasesCount} purchase${c.assetPurchasesCount === 1 ? '' : 's'}`} icon={<LuPackagePlus />} />
          </section>

          <ReportSection title="Cash Out Trend" note="Total cash out per day, 5 days either side of the selected period.">
            <div className="h-64 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => formatKes(Number(v))} labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-KE', { weekday: 'short', day: '2-digit', month: 'short' })} />
                  <Line type="linear" dataKey="total" stroke="var(--destructive)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Expenses by Category" note="Share of the Expenses total only.">
              <BucketRows rows={report.expensesByCategory} empty="No expenses recorded this period." />
            </ReportSection>
            <ReportSection title="Salaries by Department" note="Share of Salaries Paid only.">
              <BucketRows rows={report.salariesByDepartment} empty="No salaries paid this period." />
            </ReportSection>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Supplier Payments by Supplier" note="Share of Supplier Payments only — capital, not expense.">
              <BucketRows rows={report.supplierPaymentsBySupplier} empty="No supplier payments this period." />
            </ReportSection>
            <ReportSection title="Asset Purchases by Category" note="Share of Asset Purchases only — capital, not expense.">
              <BucketRows rows={report.assetPurchasesByCategory} empty="No asset purchases this period." />
            </ReportSection>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="All Cash Out by Payment Method" note="Every source combined — where the money physically left from.">
              <SimpleRows rows={report.byPaymentMethod.map((m) => ({ key: m.name, title: m.name, meta: `${m.count} payment${m.count === 1 ? '' : 's'} - ${m.percentOfTotal.toFixed(1)}%`, value: formatKes(m.total) }))} empty="Nothing paid out this period." />
            </ReportSection>
            <ReportSection title="Expenses Recorded By" note="Who logged the day-to-day expenses.">
              <SimpleRows rows={report.expensesByRecordedBy.map((e) => ({ key: e.name, title: e.name, meta: `${e.count} expense${e.count === 1 ? '' : 's'} - ${e.percentOfTotal.toFixed(1)}%`, value: formatKes(e.total) }))} empty="No expenses recorded this period." />
            </ReportSection>
          </div>

          <ReportSection title="Detail" note="Every record behind the totals above.">
            <div className="flex flex-wrap gap-1 border-b p-2">
              {(Object.keys(detailLabels) as (keyof typeof detailLabels)[]).map((k) => (
                <button key={k} onClick={() => setDetailTab(k)} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold', detailTab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                  {detailLabels[k]}
                </button>
              ))}
            </div>

            {detailTab === 'expenses' && (
              report.expensesList.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No expenses in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Description</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5 text-right">Amount</th></tr></thead>
                    <tbody>{report.expensesList.map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(e.date)}</td>
                        <td className="px-4 py-3"><span className="font-semibold">{e.category}</span><span className="block text-xs text-muted-foreground">{e.expenseNo}</span></td>
                        <td className="px-4 py-3 text-xs">{e.description ?? '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{e.paymentMethod}{e.reference ? ` - ${e.reference}` : ''}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{e.location ?? '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{e.recordedBy ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(e.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === 'salaries' && (
              report.salariesList.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No salaries paid in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Paid</th><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Department</th><th className="px-4 py-2.5 text-right">Gross</th><th className="px-4 py-2.5 text-right">Deductions</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5 text-right">Net Pay</th></tr></thead>
                    <tbody>{report.salariesList.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.paidAt ? dateTime(s.paidAt) : '-'}</td>
                        <td className="px-4 py-3"><span className="font-semibold">{s.employeeName}</span><span className="block text-xs text-muted-foreground">{s.payslipNo}</span></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.department}{s.location ? ` - ${s.location}` : ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatKes(s.grossPay)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-destructive">{formatKes(s.totalDeductions)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{s.paymentMethod ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(s.netPay)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === 'supplierPayments' && (
              report.supplierPaymentsList.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No supplier payments in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Paid</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">Purchase</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5 text-right">Amount</th></tr></thead>
                    <tbody>{report.supplierPaymentsList.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(p.paidAt)}</td>
                        <td className="px-4 py-3"><span className="font-semibold">{p.supplier}</span><span className="block text-xs text-muted-foreground">{p.paymentNo}</span></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.purchaseNo ?? '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.paymentMethod}{p.reference ? ` - ${p.reference}` : ''}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.recordedBy ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(p.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === 'assetPurchases' && (
              report.assetPurchasesList.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No asset purchases in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5">Placement</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5 text-right">Value</th></tr></thead>
                    <tbody>{report.assetPurchasesList.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(m.occurredAt)}</td>
                        <td className="px-4 py-3"><span className="font-semibold">{m.assetName}</span><span className="block text-xs text-muted-foreground">{m.assetNo}{m.category ? ` - ${m.category}` : ''}</span></td>
                        <td className="px-4 py-3 text-right tabular-nums">{m.quantity}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.paymentMethod}{m.reference ? ` - ${m.reference}` : ''}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.placement ?? '-'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.recordedBy ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(m.value)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )
            )}
          </ReportSection>
        </>
      )}
    </div>
  )
}

function ReportSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
      <header className="border-b border-l-4 border-l-accent p-4">
        <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </header>
      {children}
    </section>
  )
}

function BucketRows({ rows, empty }: { rows: NameBucket[]; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.name} className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.count} record{r.count === 1 ? '' : 's'} - {r.percentOfTotal.toFixed(1)}%</p></div>
            <span className="shrink-0 font-semibold tabular-nums">{formatKes(r.total)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-accent" style={{ width: `${Math.min(100, r.percentOfTotal)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

function SimpleRows({ rows, empty }: { rows: { key: string; title: string; meta: string; value: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="max-h-96 divide-y overflow-y-auto">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <div className="min-w-0"><p className="truncate font-semibold">{row.title}</p><p className="truncate text-xs text-muted-foreground">{row.meta}</p></div>
          <span className="shrink-0 font-semibold tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function PlainStat({ label, value, meta, icon }: { label: string; value: string; meta: string; icon: ReactNode }) {
  return (
    <div className="rounded-sm border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 font-display text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
    </div>
  )
}
