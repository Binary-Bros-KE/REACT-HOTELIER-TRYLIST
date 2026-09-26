import { useCallback, useEffect, useState } from 'react'
import {
  LuBanknote,
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuHandCoins,
  LuLoaderCircle,
  LuPackageX,
  LuReceiptText,
  LuShoppingBag,
  LuTrendingUp,
  LuTriangleAlert,
  LuUndo2,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import StatCard from '@/components/ui/StatCard'
import { cn } from '@/lib/utils'
import ShiftSummaryModal, { type ShiftSession, type ShiftSummary } from '@/components/shifts/ShiftSummaryModal'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }

type Cards = {
  totalRevenue: number
  netRevenue: number
  totalExpenses: number
  netProfit: number
  capitalInvested: number
  transactions: number
  averageSale: number
  itemsSold: number
  menuOrdersCompleted: number
}
type RevenueBreakdown = {
  posSalesCash: number
  creditGiven?: number
  creditRepaymentsCash?: number
  folioDepositsCash: number
  folioSettlementsCash: number
  roomSalesValue?: number
  roomSalesCount?: number
  roomDiscountsGiven?: number
  serviceCenterCash: number
  totalRevenue: number
  taxCollected: number
  discountsGiven: number
  complimentaryValue: number
  complimentaryCogs: number
  completedSalesValue: number
  cogs: number
  unresolvedCostLines: number
  netRevenue: number
  serviceCenterExcludedByLocationFilter: boolean
}
type TopItem = { name: string; qty: number; revenue: number }
type CountBucket = { name: string; count: number; total: number }
type TrendPoint = { date: string; revenue: number }
type LocationBucket = {
  locationId: string | null
  name: string
  transactions: number
  revenue: number
  avgSale: number
  percentOfTotal: number
  expenses: number
  netProfit: number
  profitPercent: number
}
type MethodBucket = { name: string; count: number; total: number; percentOfTotal: number }
type EmployeeBucket = { employeeId: string | null; name: string; branch: string; count: number; total: number; percentOfTotal: number }
type Debtors = {
  total: number
  customers: { total: number; top: { id: string; name: string; balance: number }[] }
  unsettledFolios: { total: number; top: { folioNo: string; reservationNo: string; guestName: string; balance: number }[] }
}
type Creditors = { total: number; top: { id: string; name: string; balance: number }[] }
type TaxLine = { key: string; label: string; treatment: string; rate: number; mode: string; net: number; tax: number; gross: number }
type ComplimentarySessionRow = { id: string; title: string; hostName: string | null; startsAt: string | null; endsAt: string | null; complimentaryValue: number; complimentaryCogs: number; guestRevenue: number; guestCogs: number; guestProfit: number; coverPercent: number; netImpact: number; orders: number }

type SalesReport = {
  range: { period: Period; start: string; end: string }
  cards: Cards
  revenueBreakdown: RevenueBreakdown
  topItems: TopItem[]
  soldItems: TopItem[]
  expensesByCategory: CountBucket[]
  purchasesBySupplier: CountBucket[]
  trend: TrendPoint[]
  salesByLocation: LocationBucket[]
  byPaymentMethod: MethodBucket[]
  byEmployee: EmployeeBucket[]
  complimentarySessions: ComplimentarySessionRow[]
  voided: { count: number; value: number }
  returns: { supported: boolean; count: number; value: number; note: string }
  cancelledPurchases: { count: number; value: number }
  debtors: Debtors
  creditors: Creditors
  expectedProfit: number
  taxBreakdown: TaxLine[]
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())

function stepAnchor(period: 'day' | 'week' | 'month', iso: string, dir: 1 | -1) {
  const d = new Date(`${iso}T00:00:00`)
  if (period === 'day') d.setDate(d.getDate() + dir)
  else if (period === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  return toLocalIso(d)
}

// The trading day in progress right now, named by the calendar date it
// started on — before the rollover hour (e.g. 8am with a 9am rollover) that's
// still YESTERDAY's date, so the picker must not default to plain today.
// Nairobi is a fixed UTC+3, same convention as the server.
function currentBusinessDateIso(startHour: number) {
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000)
  if (shifted.getUTCHours() < startHour) shifted.setUTCDate(shifted.getUTCDate() - 1)
  return shifted.toISOString().slice(0, 10)
}

const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`

function rangeLabel(period: Period, startIso: string, endIso: string, startHour: number) {
  const s = new Date(startIso)
  // With a non-midnight rollover the range ends the next morning; label it by
  // the last trading day it covers, not the calendar day it spills into.
  const e = new Date(new Date(endIso).getTime() - startHour * 60 * 60 * 1000)
  if (period === 'day') {
    const day = s.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return startHour === 0 ? day : `${day} · ${hourLabel(startHour)} → ${hourLabel(startHour)} next day`
  }
  return `${s.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function Reports() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('day')
  const [startHour, setStartHour] = useState<number | null>(null)
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employeeBreakdown, setEmployeeBreakdown] = useState<{ session: ShiftSession; summary: ShiftSummary } | null>(null)
  const [loadingEmployeeId, setLoadingEmployeeId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      const response = await api<SalesReport>(`/reports/sales?${query}`)
      setReport(response)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the sales report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])

  useEffect(() => {
    api<{ profile: { businessDayStartHour?: number } | null }>('/business-profile')
      .then((r) => {
        const hour = r.profile?.businessDayStartHour ?? 0
        const businessToday = currentBusinessDateIso(hour)
        setAnchor(businessToday); setCustomFrom(businessToday); setCustomTo(businessToday)
        setStartHour(hour)
      })
      .catch(() => setStartHour(0))
  }, [])

  // Wait for the start hour so the first load already uses the right default day.
  useEffect(() => { if (startHour !== null) void load() }, [load, startHour])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  async function openEmployeeBreakdown(bucket: EmployeeBucket) {
    if (!bucket.employeeId || !report) return
    setLoadingEmployeeId(bucket.employeeId)
    try {
      const query = new URLSearchParams({ from: report.range.start, to: report.range.end })
      const { employee, summary } = await api<{ employee: { id: string; firstName: string; lastName: string }; summary: ShiftSummary }>(`/reports/employees/${bucket.employeeId}/breakdown?${query}`)
      // No real ShiftSession backs a business-day breakdown (it can span
      // several shifts, or none) — this shape just satisfies the modal's
      // display needs; readOnly below hides the review/payroll panels that
      // would otherwise edit a specific shift row.
      const session: ShiftSession = {
        id: `report:${employee.id}`,
        status: 'ENDED',
        requestedStartAt: summary.from,
        approvedStartAt: summary.from,
        requestedEndAt: summary.to,
        approvedEndAt: summary.to,
        rejectionReason: null,
        cashVariance: null,
        employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName, jobTitle: rangeLabel(period, report.range.start, report.range.end, startHour ?? 0), supervisorId: null, isSupervisor: false },
      }
      setEmployeeBreakdown({ session, summary })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load this employee's sales")
    } finally {
      setLoadingEmployeeId(null)
    }
  }

  const cogsNote = report && report.revenueBreakdown.unresolvedCostLines > 0
    ? `Cost of goods sold could not be resolved for ${report.revenueBreakdown.unresolvedCostLines} sold line${report.revenueBreakdown.unresolvedCostLines === 1 ? '' : 's'} (a service, or a menu item with no product/recipe linked) — those count as zero cost here.`
    : null

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Sales Report" />

      <div className="mt-6 space-y-3 rounded-sm border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-sm border p-0.5">
            {(['day', 'week', 'month', 'custom'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide', period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
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
              <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous" onClick={() => setAnchor((a) => stepAnchor(period, a, -1))} />
              <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next" onClick={() => setAnchor((a) => stepAnchor(period, a, 1))} />
              {report && <span className="ml-2 text-sm font-medium text-muted-foreground">{rangeLabel(period, report.range.start, report.range.end, startHour ?? 0)}</span>}
            </div>
          )}

          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="ml-auto rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report…</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {([
              ['Total Revenue', formatKes(report.cards.totalRevenue), <LuWallet key="a" />],
              ['Net Revenue', formatKes(report.cards.netRevenue), <LuTrendingUp key="b" />],
              ['Total Expenses', formatKes(report.cards.totalExpenses), <LuReceiptText key="c" />],
              ['Net Profit', formatKes(report.cards.netProfit), <LuBanknote key="d" />],
              ['Capital Invested', formatKes(report.cards.capitalInvested), <LuHandCoins key="e" />],
            ] as const).map(([label, value, icon], i) => <StatCard key={label} index={i} label={label} value={value} icon={icon} />)}
          </section>
          <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['Transactions', report.cards.transactions, <LuShoppingBag key="f" />],
              ['Average Sale', formatKes(report.cards.averageSale), <LuTrendingUp key="g" />],
              ['Items Sold', report.cards.itemsSold, <LuShoppingBag key="h" />],
              ['Menu Orders Completed', report.cards.menuOrdersCompleted, <LuReceiptText key="i" />],
            ] as const).map(([label, value, icon]) => <PlainStat key={label} label={label} value={value} icon={icon} />)}
          </section>

          {/* Revenue & Expense Breakdown */}
          <section className="mt-7 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="border-b border-l-4 border-l-accent p-4"><h2 className="font-display text-lg font-semibold leading-tight">Revenue &amp; Expense Breakdown</h2><p className="text-xs text-muted-foreground">Every figure above traces back to something real — here's exactly where it comes from.</p></header>
            <div className="space-y-5 p-4">
              <div className="rounded-sm border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Revenue — where it came from</p>
                <p className="mt-1">
                  <span className="font-semibold">{formatKes(report.revenueBreakdown.posSalesCash - (report.revenueBreakdown.creditRepaymentsCash ?? 0))}</span> POS sales paid
                  {' + '}<span className="font-semibold">{formatKes(report.revenueBreakdown.creditGiven ?? 0)}</span> sold on credit
                  {' + '}<span className="font-semibold">{formatKes(report.revenueBreakdown.folioDepositsCash)}</span> room deposits
                  {' + '}<span className="font-semibold">{formatKes(report.revenueBreakdown.folioSettlementsCash)}</span> room checkouts
                  {' + '}<span className="font-semibold">{formatKes(report.revenueBreakdown.serviceCenterCash)}</span> service-center
                  {' = '}<span className="font-semibold text-secondary">{formatKes(report.revenueBreakdown.totalRevenue)}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Revenue is what was sold: money taken in for sales, plus sales given on credit. A customer later paying off credit isn't counted again{(report.revenueBreakdown.creditRepaymentsCash ?? 0) > 0 ? ` (${formatKes(report.revenueBreakdown.creditRepaymentsCash ?? 0)} of such repayments came in this period — shown in the payment-method table but not here)` : ''}.{report.revenueBreakdown.serviceCenterExcludedByLocationFilter && ' Service-center bookings aren\'t location-tagged yet, so they\'re left out of this location-filtered view.'}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-sm border bg-card p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tax Collected</p>
                    <p className="mt-0.5 font-semibold">{formatKes(report.revenueBreakdown.taxCollected)}</p>
                  </div>
                  <div className="rounded-sm border bg-card p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discounts Given</p>
                    <p className="mt-0.5 font-semibold">{formatKes(report.revenueBreakdown.discountsGiven)}</p>
                  </div>
                  <div className="rounded-sm border bg-card p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room Sales</p>
                    <p className="mt-0.5 font-semibold">{formatKes(report.revenueBreakdown.roomSalesValue ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">{report.revenueBreakdown.roomSalesCount ?? 0} stay{(report.revenueBreakdown.roomSalesCount ?? 0) === 1 ? '' : 's'} charged</p>
                  </div>
                  <div className="rounded-sm border bg-card p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room Discounts</p>
                    <p className="mt-0.5 font-semibold">{formatKes(report.revenueBreakdown.roomDiscountsGiven ?? 0)}</p>
                  </div>
                  <div className="rounded-sm border bg-card p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complementary Value</p>
                    <p className="mt-0.5 font-semibold">{formatKes(report.revenueBreakdown.complimentaryValue)}</p>
                  </div>
                  <div className="rounded-sm border bg-card p-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complimentary Cost</p>
                    <p className="mt-0.5 font-semibold">{formatKes(report.revenueBreakdown.complimentaryCogs)}</p>
                  </div>
                </div>
              </div>

              {report.complimentarySessions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complementary host/event impact</p>
                  <div className="overflow-hidden rounded-sm border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2">Session</th><th className="px-4 py-2 text-right">Comp Value</th><th className="px-4 py-2 text-right">Comp Cost</th><th className="px-4 py-2 text-right">Guest Revenue</th><th className="px-4 py-2">Covered</th><th className="px-4 py-2 text-right">Net Impact</th></tr></thead>
                      <tbody>{report.complimentarySessions.map((session) => (
                        <tr key={session.id} className="border-t">
                          <td className="px-4 py-2"><span className="font-semibold">{session.title}</span><span className="block text-xs text-muted-foreground">{session.hostName ?? 'Host'} · {session.orders} order{session.orders === 1 ? '' : 's'}</span></td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatKes(session.complimentaryValue)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatKes(session.complimentaryCogs)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatKes(session.guestRevenue)}</td>
                          <td className="px-4 py-2"><div className="h-2 w-28 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', session.coverPercent >= 100 ? 'bg-success' : 'bg-warning')} style={{ width: `${Math.max(0, Math.min(100, session.coverPercent))}%` }} /></div><span className="mt-1 block text-[11px] font-semibold text-muted-foreground">{Math.round(session.coverPercent)}%</span></td>
                          <td className={cn('px-4 py-2 text-right font-semibold tabular-nums', session.netImpact >= 0 ? 'text-success' : 'text-destructive')}>{formatKes(session.netImpact)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {report.soldItems.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All items sold ({report.soldItems.length})</p>
                  <div className="max-h-[32rem] overflow-auto rounded-sm border">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Qty Sold</th><th className="px-4 py-2 text-right">Revenue</th></tr></thead>
                      <tbody>{report.soldItems.map((i, idx) => (
                        <tr key={`${i.name}-${idx}`} className="border-t"><td className="px-4 py-2">{idx + 1}. {i.name}</td><td className="px-4 py-2 text-right tabular-nums">{i.qty} sold</td><td className="px-4 py-2 text-right tabular-nums">{formatKes(i.revenue)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-sm border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net Revenue — profit on goods sold</p>
                <p className="mt-1">
                  <span className="font-semibold">{formatKes(report.revenueBreakdown.completedSalesValue)}</span> sold this period
                  {' − '}<span className="font-semibold">{formatKes(report.revenueBreakdown.cogs)}</span> cost of goods sold
                  {' = '}<span className="font-semibold text-secondary">{formatKes(report.revenueBreakdown.netRevenue)}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Based on everything completed/sold this period, whether paid in cash or settled on credit — the same sales as Total Revenue above, less the cost of goods.{cogsNote ? ` ${cogsNote}` : ''}</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Expenses — where the money went ({formatKes(report.cards.totalExpenses)})</p>
                {report.expensesByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses recorded this period.</p>
                ) : (
                  <div className="overflow-hidden rounded-sm border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2">Category</th><th className="px-4 py-2 text-right">Times Paid</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">% of Total</th></tr></thead>
                      <tbody>{report.expensesByCategory.map((c) => (
                        <tr key={c.name} className="border-t"><td className="px-4 py-2 font-medium">{c.name}</td><td className="px-4 py-2 text-right tabular-nums">{c.count}</td><td className="px-4 py-2 text-right tabular-nums font-semibold">{formatKes(c.total)}</td><td className="px-4 py-2 text-right tabular-nums">{report.cards.totalExpenses ? ((c.total / report.cards.totalExpenses) * 100).toFixed(1) : '0.0'}%</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Supplier payments (Capital Invested) aren't counted here — see the card above.</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Purchases by supplier — Capital Invested ({formatKes(report.cards.capitalInvested)})</p>
                {report.purchasesBySupplier.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No stock received this period.</p>
                ) : (
                  <div className="overflow-hidden rounded-sm border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2">Supplier</th><th className="px-4 py-2 text-right">Deliveries</th><th className="px-4 py-2 text-right">Goods Received Value</th></tr></thead>
                      <tbody>{report.purchasesBySupplier.map((s) => (
                        <tr key={s.name} className="border-t"><td className="px-4 py-2 font-medium">{s.name}</td><td className="px-4 py-2 text-right tabular-nums">{s.count}</td><td className="px-4 py-2 text-right tabular-nums font-semibold">{formatKes(s.total)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">This is what came in from suppliers this period — Capital Invested above is what was actually paid to them, which can differ.</p>
              </div>
            </div>
          </section>

          {/* Trend */}
          <section className="mt-6 overflow-hidden rounded-sm border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">Total Revenue Trend — 5 days before and after this period's end</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => v.toLocaleString()} tick={{ fontSize: 12 }} width={70} />
                  <Tooltip formatter={(v) => formatKes(Number(v))} labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })} />
                  <Line type="monotone" dataKey="revenue" stroke="var(--secondary)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Sales by Location */}
          <BreakdownSection
            title="Sales by Location"
            rows={report.salesByLocation.map((l) => ({ key: l.locationId ?? 'unassigned', label: l.name, value: l.revenue, percent: l.percentOfTotal }))}
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5 text-right">Transactions</th><th className="px-4 py-2.5 text-right">Revenue</th><th className="px-4 py-2.5 text-right">Avg Sale</th><th className="px-4 py-2.5 text-right">Net Profit</th><th className="px-4 py-2.5 text-right">Profit %</th><th className="px-4 py-2.5 text-right">% of Total</th></tr></thead>
              <tbody>{report.salesByLocation.map((l) => (
                <tr key={l.locationId ?? 'unassigned'} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{l.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{l.transactions}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatKes(l.revenue)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatKes(l.avgSale)}</td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', l.netProfit >= 0 ? 'text-success' : 'text-destructive')}>{formatKes(l.netProfit)}</td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums', l.netProfit >= 0 ? 'text-success' : 'text-destructive')}>{l.profitPercent.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{l.percentOfTotal.toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </BreakdownSection>

          {/* Sales by Payment Method */}
          <BreakdownSection
            title="Sales by Payment Method"
            note="Cash/mobile-money/etc. rows are new-sale collections; credit repayments are excluded so credit is not counted twice. Credit and Complimentary are sold value that was not collected in cash."
            rows={report.byPaymentMethod.map((m) => ({ key: m.name, label: m.name, value: m.total, percent: m.percentOfTotal }))}
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Method</th><th className="px-4 py-2.5 text-right">Payments</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">% of Total</th></tr></thead>
              <tbody>{report.byPaymentMethod.map((m) => (
                <tr key={m.name} className="border-t"><td className="px-4 py-2.5 font-medium">{m.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{m.count}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatKes(m.total)}</td><td className="px-4 py-2.5 text-right tabular-nums">{m.percentOfTotal.toFixed(1)}%</td></tr>
              ))}</tbody>
            </table>
          </BreakdownSection>

          {/* Sales by Employee */}
          <BreakdownSection
            title="Sales by Employee"
            rows={report.byEmployee.map((e) => ({ key: e.name, label: e.name, value: e.total, percent: e.percentOfTotal }))}
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Branch</th><th className="px-4 py-2.5 text-right">Transactions</th><th className="px-4 py-2.5 text-right">Revenue</th><th className="px-4 py-2.5 text-right">Avg Sale</th><th className="px-4 py-2.5 text-right">% of Total</th></tr></thead>
              <tbody>{report.byEmployee.map((e) => (
                <tr key={e.name} className={cn('border-t', e.employeeId && 'cursor-pointer hover:bg-muted/40')} onClick={() => void openEmployeeBreakdown(e)}>
                  <td className="px-4 py-2.5 font-medium">{e.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{e.branch}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{e.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {loadingEmployeeId === e.employeeId ? <LuLoaderCircle className="ml-auto size-4 animate-spin" /> : formatKes(e.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatKes(e.count ? e.total / e.count : 0)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{e.percentOfTotal.toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </BreakdownSection>

          {/* Voided sales & Returns */}
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-sm border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><LuPackageX className="size-3.5" /> Voided Sales</p>
              <p className="mt-1 text-2xl font-semibold">{report.voided.count}</p>
              <p className="text-sm text-muted-foreground">Worth {formatKes(report.voided.value)} — removed entirely from every figure above.</p>
            </div>
            <div className="rounded-sm border bg-card p-4 shadow-sm">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><LuUndo2 className="size-3.5" /> Processed Returns</p>
              <p className="mt-1 text-2xl font-semibold">{report.returns.count}</p>
              <p className="text-sm text-muted-foreground">{report.returns.note}</p>
            </div>
          </section>

          {/* Cancelled purchases */}
          <section className="mt-4 rounded-sm border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cancelled Purchases</p>
            <p className="mt-1 text-2xl font-semibold">{report.cancelledPurchases.count}</p>
            <p className="text-sm text-muted-foreground">Worth {formatKes(report.cancelledPurchases.value)} — never counted toward capital invested or supplier spend.</p>
          </section>

          {/* Debtors, Creditors & Expected Profit */}
          <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="border-b border-l-4 border-l-accent p-4"><h2 className="font-display text-lg font-semibold leading-tight">Debtors, Creditors &amp; Expected Profit</h2><p className="text-xs text-muted-foreground">A live snapshot as of today — not scoped to the period selected above.</p></header>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-sm border bg-secondary/5 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary"><LuUsers className="size-3.5" /> Debtors</p>
                <p className="mt-1 text-2xl font-semibold">{formatKes(report.debtors.total)}</p>
                <p className="text-xs text-muted-foreground">Unpaid balances owed to you — customer credit + unsettled room bills</p>
              </div>
              <div className="rounded-sm border bg-destructive/5 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive"><LuTriangleAlert className="size-3.5" /> Creditors</p>
                <p className="mt-1 text-2xl font-semibold">{formatKes(report.creditors.total)}</p>
                <p className="text-xs text-muted-foreground">Unpaid balances you owe suppliers — {report.creditors.top.length} supplier{report.creditors.top.length === 1 ? '' : 's'}</p>
              </div>
              <div className={cn('rounded-sm border p-4', report.expectedProfit >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
                <p className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wide', report.expectedProfit >= 0 ? 'text-success' : 'text-destructive')}><LuTrendingUp className="size-3.5" /> Expected Profit</p>
                <p className="mt-1 text-2xl font-semibold">{formatKes(report.expectedProfit)}</p>
                <p className="text-xs text-muted-foreground">Net Profit + money owed to you − money you owe</p>
              </div>
            </div>
            <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who owes you</p>
                {report.debtors.customers.top.length === 0 && report.debtors.unsettledFolios.top.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody owes you right now.</p>
                ) : (
                  <div className="space-y-1.5">
                    {report.debtors.customers.top.map((c) => <RowLine key={c.id} label={c.name} value={formatKes(c.balance)} />)}
                    {report.debtors.unsettledFolios.top.map((f) => <RowLine key={f.folioNo} label={`${f.guestName} (${f.reservationNo})`} value={formatKes(f.balance)} />)}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who you owe</p>
                {report.creditors.top.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You don't owe any supplier right now.</p>
                ) : (
                  <div className="space-y-1.5">{report.creditors.top.map((s) => <RowLine key={s.id} label={s.name} value={formatKes(s.balance)} />)}</div>
                )}
              </div>
            </div>
          </section>

          {/* Tax breakdown */}
          {report.taxBreakdown.length > 0 && (
            <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
              <header className="border-b border-l-4 border-l-accent p-4"><h2 className="font-display text-lg font-semibold leading-tight">Tax Breakdown</h2><p className="text-xs text-muted-foreground">Tax collected this period, by rate — see the standalone Products report for a per-item view.</p></header>
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Treatment</th><th className="px-4 py-2.5 text-right">Net</th><th className="px-4 py-2.5 text-right">Tax</th><th className="px-4 py-2.5 text-right">Gross</th></tr></thead>
                <tbody>{report.taxBreakdown.map((t) => (
                  <tr key={t.key} className="border-t"><td className="px-4 py-2.5 font-medium">{t.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatKes(t.net)}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatKes(t.tax)}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatKes(t.gross)}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
        </>
      )}
      {employeeBreakdown && (
        <ShiftSummaryModal
          title="Sales breakdown"
          session={employeeBreakdown.session}
          summary={employeeBreakdown.summary}
          readOnly
          onClose={() => setEmployeeBreakdown(null)}
        />
      )}
    </div>
  )
}

function BreakdownSection({ title, note, rows, children }: { title: string; note?: string; rows: { key: string; label: string; value: number; percent: number }[]; children: React.ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
      <header className="border-b border-l-4 border-l-accent p-4"><h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>{note && <p className="text-xs text-muted-foreground">{note}</p>}</header>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">No activity in this period.</p>
      ) : (
        <>
          <div className="space-y-3 p-4">
            {rows.map((r) => (
              <div key={r.key}>
                <div className="flex items-center justify-between text-sm"><span className="font-medium">{r.label}</span><span className="tabular-nums font-semibold">{formatKes(r.value)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-secondary" style={{ width: `${Math.min(100, Math.max(0, r.percent))}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto border-t">{children}</div>
        </>
      )}
    </section>
  )
}

function PlainStat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-sm border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-sm border bg-muted/30 px-3 py-2 text-sm">
      <span className="truncate">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums">{value}</span>
    </div>
  )
}
