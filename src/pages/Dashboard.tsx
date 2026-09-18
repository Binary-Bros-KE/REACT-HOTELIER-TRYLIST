import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LuArrowDownLeft, LuArrowUpRight, LuBanknote, LuBedDouble, LuBellRing, LuBookOpen, LuBoxes, LuChefHat, LuCircleAlert, LuCircleCheck, LuClipboardList, LuClock3, LuLoaderCircle, LuLock,
  LuLogIn, LuLogOut, LuPackage, LuPackageCheck, LuReceiptText, LuSearch, LuShoppingBag, LuSparkles, LuTable2, LuTrendingUp, LuTriangleAlert, LuUndo2, LuUsers, LuUtensils, LuWallet,
} from 'react-icons/lu'
import { navigation } from '@/config/navigation'
import { api } from '@/lib/api'
import { useAppSelector } from '@/store/hooks'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { cn } from '@/lib/utils'
import { packAndUnit } from '@/components/ui/PackQtyInput'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

// ---- Revenue dashboard — real, live data, for the roles allowed to see
// money (Super Admin, Manager — Accountant's turn is still pending; every
// other role keeps the plain "Your Modules" view below until its own
// dashboard is built — this is being rolled out role by role, see the
// hotelier_dashboard_rollout memory). Scoped by whichever location(s) the
// viewing employee is actually assigned to: a floating Super Admin with no
// assignment sees the whole property by default (same as before), a Manager
// pinned to one branch is locked to it, and one pinned to several gets a
// picker restricted to just those — same convention as Receipts/Tables/POS. ----

type Cards = { totalRevenue: number; netRevenue: number; totalExpenses: number; netProfit: number }
type TopItem = { name: string; qty: number; revenue: number }
type CountBucket = { name: string; count: number; total: number }
type LocationBucket = { locationId: string | null; name: string; revenue: number; percentOfTotal: number }
type MethodBucket = { name: string; total: number; percentOfTotal: number }
type EmployeeBucket = { name: string; total: number; percentOfTotal: number }
type CustomerBucket = { name: string; revenue: number; percentOfTotal: number }
type Debtors = {
  total: number
  customers: { total: number; top: { id: string; name: string; balance: number }[] }
  unsettledFolios: { total: number; top: { folioNo: string; reservationNo: string; guestName: string; balance: number }[] }
}
type Creditors = { total: number; top: { id: string; name: string; balance: number }[] }
type TaxLine = { key: string; label: string; net: number; tax: number; gross: number }
type ComplimentarySessionRow = { id: string; title: string; hostName: string | null; startsAt: string | null; endsAt: string | null; complimentaryValue: number; complimentaryCogs: number; guestRevenue: number; guestProfit: number; coverPercent: number; netImpact: number; orders: number }

type SalesReport = {
  cards: Cards
  revenueBreakdown: { complimentaryValue: number; complimentaryCogs: number }
  complimentarySessions: ComplimentarySessionRow[]
  topItems: TopItem[]
  expensesByCategory: CountBucket[]
  salesByLocation: LocationBucket[]
  byPaymentMethod: MethodBucket[]
  byEmployee: EmployeeBucket[]
  byCustomer: CustomerBucket[]
  debtors: Debtors
  creditors: Creditors
  expectedProfit: number
  taxBreakdown: TaxLine[]
  returns: { count: number; value: number }
}

type OrderSummary = { id: string; status: string }
type TableSummary = { id: string; status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE'; capacity: number; isActive: boolean }
type TransactionRow = {
  id: string
  transactionNo: string
  direction: 'IN' | 'OUT'
  source: string
  amount: string | number
  createdAt: string
  description: string | null
  paymentMethod: { name: string } | null
  customer: { firstName: string; lastName: string | null } | null
  supplier: { name: string } | null
}
type ShiftSession = {
  id: string
  status: 'REQUESTED_START' | 'ACTIVE' | 'REQUESTED_END' | 'ENDED' | 'REJECTED_START' | 'REJECTED_END'
  requestedStartAt: string
  approvedStartAt: string | null
  requestedEndAt: string | null
  approvedEndAt: string | null
  employee: { id: string; firstName: string; lastName: string; jobTitle: string; supervisorId: string | null; isSupervisor: boolean }
}
type ShiftSummary = {
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
type ShiftPayload = { serverNow: string; user: { isSupervisor: boolean; role: { name: string } | null }; session: ShiftSession | null; summary: ShiftSummary | null }

const NON_FINAL_STATUSES = ['OPEN', 'PREPARING', 'READY', 'SERVED']
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
type LocationOption = { id: string; name: string }

/** 'operations' (Super Admin, Manager): the full floor-and-money picture.
 * 'finance' (Accountant): money only — Accountant's allowedSections are just
 * FINANCE/REPORTS, no SALES/KITCHEN, so Active Orders/Tables/sales-mix
 * breakdowns would be showing them into sections they can't otherwise open.
 * Gets the debtors/creditors/expected-profit and tax panels instead, which
 * the operations variant skips (Super Admin/Manager get that same detail
 * from the full Sales Report already). */
function RevenueDashboard({ variant }: { variant: 'operations' | 'finance' }) {
  const [locations, setLocations] = useState<LocationOption[]>([])
  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId } = useWorkingLocation(locations, { persist: false })

  const [report, setReport] = useState<SalesReport | null>(null)
  const [activeOrderCount, setActiveOrderCount] = useState(0)
  const [tables, setTables] = useState<TableSummary[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const locQuery = effectiveLocationId ? `&locationId=${effectiveLocationId}` : ''
      const [salesResponse, ordersResponse, tablesResponse, transactionsResponse, locationResponse] = await Promise.all([
        api<SalesReport>(`/reports/sales?period=day${locQuery}`),
        variant === 'operations' ? api<{ orders: OrderSummary[] }>(`/pos/orders?channel=FOOD${locQuery}`) : Promise.resolve({ orders: [] }),
        variant === 'operations' ? api<{ tables: TableSummary[] }>(`/tables${effectiveLocationId ? `?locationId=${effectiveLocationId}` : ''}`) : Promise.resolve({ tables: [] }),
        api<{ transactions: TransactionRow[] }>(`/transactions?limit=${variant === 'finance' ? 12 : 8}${locQuery}`),
        api<{ locations: LocationOption[] }>('/locations'),
      ])
      setReport(salesResponse)
      setActiveOrderCount(ordersResponse.orders.filter((o) => NON_FINAL_STATUSES.includes(o.status)).length)
      setTables(tablesResponse.tables)
      setTransactions(transactionsResponse.transactions)
      setLocations(locationResponse.locations)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the dashboard')
    } finally {
      setLoading(false)
    }
  }, [effectiveLocationId, variant])

  useEffect(() => { void load() }, [load])

  const locationPicker = fixedLocation ? (
    <span className="text-sm font-medium text-muted-foreground">{fixedLocation.name}</span>
  ) : pickableLocations.length > 0 ? (
    <select aria-label="Filter by location" value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="input w-auto">
      <option value="">All locations</option>
      {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  ) : null

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading today's overview…</div>
  }
  if (error || !report) {
    return <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error || 'Could not load the dashboard'}</div>
  }

  const occupiedTables = tables.filter((t) => t.status === 'OCCUPIED')
  const activeTables = tables.filter((t) => t.isActive)
  const estimatedGuests = occupiedTables.reduce((s, t) => s + t.capacity, 0)

  return (
    <>
      {locationPicker && <div className="mt-7 flex justify-end">{locationPicker}</div>}
      <section className={locationPicker ? 'mt-3' : 'mt-7'}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's financial overview</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label="Total Revenue" value={formatKes(report.cards.totalRevenue)} icon={<LuWallet className="size-4" />} hint="Cash actually received" />
          <StatCard index={1} label="Net Revenue" value={formatKes(report.cards.netRevenue)} icon={<LuTrendingUp className="size-4" />} hint="Sold − cost of goods" />
          <StatCard index={2} label="Total Expenses" value={formatKes(report.cards.totalExpenses)} icon={<LuReceiptText className="size-4" />} />
          <StatCard index={3} label="Net Profit" value={formatKes(report.cards.netProfit)} icon={<LuBanknote className="size-4" />} hint="Net revenue − expenses" />
        </div>
      </section>

      {report.complimentarySessions.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-sm border bg-card">
          <header className="border-b p-4">
            <h2 className="font-semibold">Complementary Host Impact</h2>
            <p className="text-xs text-muted-foreground">Guest profit compared with the stock cost given to hosts.</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">Event</th><th className="px-4 py-2 text-right">Comp Cost</th><th className="px-4 py-2 text-right">Guest Revenue</th><th className="px-4 py-2">Covered</th><th className="px-4 py-2 text-right">Net</th></tr>
              </thead>
              <tbody>{report.complimentarySessions.slice(0, 6).map((session) => {
                const pct = Math.max(0, Math.min(100, session.coverPercent))
                return (
                  <tr key={session.id} className="border-t">
                    <td className="px-4 py-3"><span className="font-semibold">{session.title}</span><span className="block text-xs text-muted-foreground">{session.hostName ?? 'Host'}{session.startsAt ? ` - ${new Date(session.startsAt).toLocaleString()}` : ''}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatKes(session.complimentaryCogs)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatKes(session.guestRevenue)}</td>
                    <td className="px-4 py-3">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted"><div className={cn('h-full', session.coverPercent >= 100 ? 'bg-success' : 'bg-warning')} style={{ width: `${pct}%` }} /></div>
                      <span className="mt-1 block text-[11px] font-semibold text-muted-foreground">{Math.round(session.coverPercent)}%</span>
                    </td>
                    <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', session.netImpact >= 0 ? 'text-success' : 'text-destructive')}>{formatKes(session.netImpact)}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        </section>
      )}

      {variant === 'operations' ? (
        <section className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Right now</p>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={4} label="Active Orders" value={String(activeOrderCount)} icon={<LuClipboardList className="size-4" />} hint="Open, preparing, ready or served" />
            <StatCard index={5} label="Tables Occupied" value={`${occupiedTables.length} / ${activeTables.length}`} icon={<LuTable2 className="size-4" />} hint={estimatedGuests > 0 ? `~${estimatedGuests} guests seated now` : 'No one seated right now'} />
            <StatCard tone="warn" label="Sales on Credit" value={formatKes(report.debtors.total)} icon={<LuUsers className="size-4" />} hint="Owed by customers + unsettled rooms" />
            <StatCard index={6} label="Processed Returns" value={String(report.returns.count)} icon={<LuUndo2 className="size-4" />} hint={report.returns.value > 0 ? formatKes(report.returns.value) : undefined} />
          </div>
        </section>
      ) : (
        <section className="mt-6 overflow-hidden rounded-sm border bg-card">
          <header className="border-b p-4"><h2 className="font-semibold">Debtors, Creditors &amp; Expected Profit</h2><p className="text-xs text-muted-foreground">A live snapshot — not scoped to today, unlike the cards above.</p></header>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-sm border bg-secondary/5 p-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary"><LuUsers className="size-3.5" /> Debtors</p>
              <p className="mt-1 text-xl font-semibold">{formatKes(report.debtors.total)}</p>
              <p className="text-xs text-muted-foreground">Owed to you — customer credit + unsettled rooms</p>
            </div>
            <div className="rounded-sm border bg-destructive/5 p-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive"><LuTriangleAlert className="size-3.5" /> Creditors</p>
              <p className="mt-1 text-xl font-semibold">{formatKes(report.creditors.total)}</p>
              <p className="text-xs text-muted-foreground">Owed to suppliers</p>
            </div>
            <div className={cn('rounded-sm border p-3.5', report.expectedProfit >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
              <p className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wide', report.expectedProfit >= 0 ? 'text-success' : 'text-destructive')}><LuTrendingUp className="size-3.5" /> Expected Profit</p>
              <p className="mt-1 text-xl font-semibold">{formatKes(report.expectedProfit)}</p>
              <p className="text-xs text-muted-foreground">Net Profit + debtors − creditors</p>
            </div>
          </div>
          {(report.debtors.customers.top.length > 0 || report.debtors.unsettledFolios.top.length > 0 || report.creditors.top.length > 0) && (
            <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who owes you</p>
                <div className="space-y-1.5">
                  {report.debtors.customers.top.slice(0, 6).map((c) => <RowLine key={c.id} label={c.name} value={formatKes(c.balance)} />)}
                  {report.debtors.unsettledFolios.top.slice(0, 6).map((f) => <RowLine key={f.folioNo} label={`${f.guestName} (${f.reservationNo})`} value={formatKes(f.balance)} />)}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who you owe</p>
                {report.creditors.top.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You don't owe any supplier right now.</p>
                ) : (
                  <div className="space-y-1.5">{report.creditors.top.slice(0, 6).map((s) => <RowLine key={s.id} label={s.name} value={formatKes(s.balance)} />)}</div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {variant === 'operations' ? (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <MiniBreakdown title="Sales by Location" rows={report.salesByLocation.map((l) => ({ key: l.locationId ?? 'unassigned', label: l.name, value: l.revenue, percent: l.percentOfTotal }))} />
          <MiniBreakdown title="Sales by Payment Method" rows={report.byPaymentMethod.map((m) => ({ key: m.name, label: m.name, value: m.total, percent: m.percentOfTotal }))} />
          <MiniBreakdown title="Sales by Employee" rows={report.byEmployee.map((e) => ({ key: e.name, label: e.name, value: e.total, percent: e.percentOfTotal }))} />
          <MiniBreakdown title="Sales by Customer" rows={report.byCustomer.map((c) => ({ key: c.name, label: c.name, value: c.revenue, percent: c.percentOfTotal }))} />
        </section>
      ) : (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <MiniBreakdown title="Sales by Payment Method" rows={report.byPaymentMethod.map((m) => ({ key: m.name, label: m.name, value: m.total, percent: m.percentOfTotal }))} />
          <div className="overflow-hidden rounded-sm border bg-card">
            <header className="border-b p-4"><h2 className="font-semibold">Tax Breakdown — Today</h2></header>
            {report.taxBreakdown.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No taxable sales today.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Treatment</th><th className="px-4 py-2.5 text-right">Net</th><th className="px-4 py-2.5 text-right">Tax</th><th className="px-4 py-2.5 text-right">Gross</th></tr></thead>
                <tbody>{report.taxBreakdown.map((t) => (
                  <tr key={t.key} className="border-t"><td className="px-4 py-2.5 font-medium">{t.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatKes(t.net)}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatKes(t.tax)}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatKes(t.gross)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <section className={cn('mt-6 grid gap-4', variant === 'operations' && 'lg:grid-cols-2')}>
        {variant === 'operations' && (
          <div className="overflow-hidden rounded-sm border bg-card">
            <header className="flex items-center justify-between border-b p-4">
              <h2 className="font-semibold">Top 10 Selling Menu Items</h2>
              <Link to="/reports" className="text-xs font-semibold text-secondary hover:underline">Full report →</Link>
            </header>
            {report.topItems.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items sold today yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Revenue</th></tr></thead>
                <tbody>{report.topItems.map((i, idx) => (
                  <tr key={i.name} className="border-t"><td className="px-4 py-2.5">{idx + 1}. {i.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{i.qty}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatKes(i.revenue)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="font-semibold">Top Expense Categories</h2>
            <Link to="/finance/expenses" className="text-xs font-semibold text-secondary hover:underline">View expenses →</Link>
          </header>
          {report.expensesByCategory.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No expenses recorded today.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Times Paid</th><th className="px-4 py-2.5 text-right">Total</th></tr></thead>
              <tbody>{report.expensesByCategory.slice(0, 8).map((c) => (
                <tr key={c.name} className="border-t"><td className="px-4 py-2.5 font-medium">{c.name}</td><td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td><td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatKes(c.total)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-sm border bg-card">
        <header className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Latest Transactions</h2>
          <Link to="/finance/transactions" className="text-xs font-semibold text-secondary hover:underline">View all →</Link>
        </header>
        {transactions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="divide-y">
            {transactions.map((t) => {
              const who = t.customer ? `${t.customer.firstName} ${t.customer.lastName ?? ''}`.trim() : t.supplier?.name ?? t.description ?? titleCase(t.source)
              return (
                <div key={t.id} className="flex items-center gap-3 p-3.5">
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-sm', t.direction === 'IN' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                    {t.direction === 'IN' ? <LuArrowDownLeft className="size-4" /> : <LuArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{who}</p>
                    <p className="text-xs text-muted-foreground">{titleCase(t.source)}{t.paymentMethod ? ` · ${t.paymentMethod.name}` : ''} · {new Date(t.createdAt).toLocaleString()}</p>
                  </div>
                  <p className={cn('shrink-0 font-semibold tabular-nums', t.direction === 'IN' ? 'text-success' : 'text-destructive')}>{t.direction === 'IN' ? '+' : '−'}{formatKes(Number(t.amount))}</p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-sm border bg-muted/30 px-3 py-2 text-sm">
      <span className="truncate">{label}</span>
      <span className="shrink-0 pl-2 font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function MiniBreakdown({ title, rows }: { title: string; rows: { key: string; label: string; value: number; percent: number }[] }) {
  const top = rows.slice(0, 5)
  return (
    <div className="rounded-sm border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link to="/reports" className="text-xs font-semibold text-secondary hover:underline">Full report →</Link>
      </div>
      {top.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No activity today.</p>
      ) : (
        <div className="space-y-3">
          {top.map((r) => (
            <div key={r.key}>
              <div className="flex items-center justify-between text-sm"><span className="truncate font-medium">{r.label}</span><span className="shrink-0 pl-2 tabular-nums font-semibold">{formatKes(r.value)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-secondary" style={{ width: `${Math.min(100, Math.max(0, r.percent))}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Receptionist dashboard — front-desk operations, no hotel revenue.
// Reuses GET /reception/reservations the same (unfiltered, heavy-include)
// way Reception.tsx itself already does — this isn't a new cost, the page
// already pays it. Arrivals/departures are computed client-side from
// checkIn/checkOut against today's local date. ----

type RoomStatus = 'VACANT' | 'OCCUPIED' | 'OUT_OF_SERVICE'
type RoomCleanliness = 'CLEAN' | 'DIRTY' | 'INSPECTING'
type ReceptionRoom = { id: string; number: string; status: RoomStatus; cleanliness: RoomCleanliness; roomType: { name: string } }
type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW'
type ReceptionFolio = { lineItems: { amount: string | number; quantity: number }[]; payments: { amount: string | number }[] }
type ReceptionReservation = {
  id: string
  reservationNo: string
  checkIn: string
  checkOut: string
  adults: number
  children: number
  status: ReservationStatus
  customer: { firstName: string; lastName: string | null; phone: string | null }
  room: { number: string }
  folio: ReceptionFolio | null
}

const localIsoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const isSameLocalDay = (iso: string, dayIso: string) => localIsoDay(new Date(iso)) === dayIso
const folioBalance = (folio: ReceptionFolio | null) => {
  if (!folio) return 0
  const charges = folio.lineItems.reduce((s, i) => s + Number(i.amount) * i.quantity, 0)
  const paid = folio.payments.reduce((s, p) => s + Number(p.amount), 0)
  return charges - paid
}

function ReceptionDashboard() {
  const [reservations, setReservations] = useState<ReceptionReservation[]>([])
  const [rooms, setRooms] = useState<ReceptionRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [reservationResponse, roomResponse] = await Promise.all([
          api<{ reservations: ReceptionReservation[] }>('/reception/reservations'),
          api<{ rooms: ReceptionRoom[] }>('/reception/rooms'),
        ])
        if (cancelled) return
        setReservations(reservationResponse.reservations)
        setRooms(roomResponse.rooms)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the front desk overview')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading today's front desk…</div>
  }
  if (error) {
    return <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>
  }

  const today = localIsoDay(new Date())
  const arrivals = reservations.filter((r) => isSameLocalDay(r.checkIn, today) && (r.status === 'PENDING' || r.status === 'CONFIRMED'))
  const departures = reservations.filter((r) => isSameLocalDay(r.checkOut, today) && r.status === 'CHECKED_IN')
  const inHouse = reservations.filter((r) => r.status === 'CHECKED_IN')
  const roomsReady = rooms.filter((r) => r.status === 'VACANT' && r.cleanliness === 'CLEAN')
  const guestName = (c: ReceptionReservation['customer']) => `${c.firstName} ${c.lastName ?? ''}`.trim()

  return (
    <>
      <section className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's front desk</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label="Arrivals Today" value={String(arrivals.length)} icon={<LuLogIn className="size-4" />} hint="Expected, not yet checked in" />
          <StatCard index={1} label="Departures Today" value={String(departures.length)} icon={<LuLogOut className="size-4" />} hint="Checked in, due out today" />
          <StatCard index={2} label="In-House Now" value={String(inHouse.length)} icon={<LuUsers className="size-4" />} hint="Currently checked in" />
          <StatCard index={3} label="Rooms Ready" value={`${roomsReady.length} / ${rooms.length}`} icon={<LuBedDouble className="size-4" />} hint="Vacant and clean" />
        </div>
      </section>

      <section className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room status</p>
        <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniCount label="Vacant" value={rooms.filter((r) => r.status === 'VACANT').length} cls="bg-success/10 text-success" />
          <MiniCount label="Occupied" value={rooms.filter((r) => r.status === 'OCCUPIED').length} cls="bg-warning/15 text-warning" />
          <MiniCount label="Out of Service" value={rooms.filter((r) => r.status === 'OUT_OF_SERVICE').length} cls="bg-destructive/10 text-destructive" />
          <MiniCount label="Clean" value={rooms.filter((r) => r.cleanliness === 'CLEAN').length} cls="bg-success/10 text-success" />
          <MiniCount label="Dirty" value={rooms.filter((r) => r.cleanliness === 'DIRTY').length} cls="bg-destructive/10 text-destructive" />
          <MiniCount label="Inspecting" value={rooms.filter((r) => r.cleanliness === 'INSPECTING').length} cls="bg-secondary/10 text-secondary" />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuLogIn className="size-4 text-secondary" /> Arrivals Today</h2>
            <Link to="/reservations" className="text-xs font-semibold text-secondary hover:underline">Check In →</Link>
          </header>
          {arrivals.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No arrivals expected today.</p>
          ) : (
            <div className="divide-y">
              {arrivals.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{guestName(r.customer)}</p>
                    <p className="text-xs text-muted-foreground">{r.reservationNo} · Room {r.room.number} · {r.adults + r.children} guest{r.adults + r.children === 1 ? '' : 's'}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', r.status === 'CONFIRMED' ? 'bg-secondary/10 text-secondary' : 'bg-warning/15 text-warning')}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuLogOut className="size-4 text-secondary" /> Departures Today</h2>
            <Link to="/reception/stays" className="text-xs font-semibold text-secondary hover:underline">Guest Stays →</Link>
          </header>
          {departures.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No departures due today.</p>
          ) : (
            <div className="divide-y">
              {departures.map((r) => {
                const balance = folioBalance(r.folio)
                return (
                  <div key={r.id} className="flex items-center gap-3 p-3.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{guestName(r.customer)}</p>
                      <p className="text-xs text-muted-foreground">{r.reservationNo} · Room {r.room.number}</p>
                    </div>
                    {balance > 0.01 ? (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-destructive">Balance due</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success">Settled</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function MiniCount({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={cn('rounded-sm p-3 text-center', cls)}>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
    </div>
  )
}

// ---- Waiter dashboard — their own orders only, no tenant-wide data. Waiter
// holds none of the POS_VIEW_ALL_ORDERS/POS_APPROVE_* permissions, so
// GET /pos/orders already scopes every one of these calls to createdBy ===
// them server-side (canSeeAllOrders() in pos.routes.ts) — nothing extra to
// filter here. "My Sales Today" is their own personal total, not the
// business's aggregate revenue, so it's shown despite the no-revenue rule
// for other roles (confirmed with the user). ----

type WaiterOrderItem = { id: string; quantity: number }
type WaiterOrder = { id: string; orderNumber: number; status: string; total: number; table: { label: string } | null; items: WaiterOrderItem[] }

const WAITER_NON_FINAL = ['OPEN', 'PREPARING', 'READY', 'SERVED']

function WaiterDashboard() {
  const [activeOrders, setActiveOrders] = useState<WaiterOrder[]>([])
  const [completedToday, setCompletedToday] = useState<WaiterOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servingId, setServingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const today = localIsoDay(new Date())
      const [activeResponse, completedResponse] = await Promise.all([
        api<{ orders: WaiterOrder[] }>('/pos/orders?channel=FOOD'),
        api<{ orders: WaiterOrder[] }>(`/pos/orders?channel=FOOD&status=COMPLETED&from=${today}&to=${today}&limit=100`),
      ])
      setActiveOrders(activeResponse.orders.filter((o) => WAITER_NON_FINAL.includes(o.status)))
      setCompletedToday(completedResponse.orders)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function serveNow(orderId: string) {
    setServingId(orderId)
    try {
      await api(`/pos/orders/${orderId}/serve`, { method: 'PATCH' })
      void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not mark the order served')
    } finally {
      setServingId(null)
    }
  }

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading your orders…</div>
  }

  const readyOrders = activeOrders.filter((o) => o.status === 'READY')
  const otherActive = activeOrders.filter((o) => o.status !== 'READY')
  const salesToday = completedToday.reduce((s, o) => s + o.total, 0)
  const itemCount = (o: WaiterOrder) => o.items.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My shift</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label="My Active Orders" value={String(activeOrders.length)} icon={<LuClipboardList className="size-4" />} />
          <StatCard tone="warn" label="Ready to Serve" value={String(readyOrders.length)} icon={<LuBellRing className="size-4" />} hint={readyOrders.length > 0 ? 'Waiting on you' : undefined} />
          <StatCard index={1} label="Completed Today" value={String(completedToday.length)} icon={<LuCircleCheck className="size-4" />} />
          <StatCard index={2} label="My Sales Today" value={formatKes(salesToday)} icon={<LuWallet className="size-4" />} />
        </div>
      </section>

      {readyOrders.length > 0 && (
        <section className="mt-6 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-2.5">
          <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-destructive">
            <LuBellRing className="size-3.5" /> Ready to serve · {readyOrders.length}
          </p>
          <div className="space-y-2">
            {readyOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-2 rounded-sm border bg-card p-2.5 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">Order #{order.orderNumber}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{itemCount(order)} item{itemCount(order) === 1 ? '' : 's'} · {order.table?.label ?? 'Takeaway'}</p>
                </div>
                <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">Pending</span>
                <button
                  disabled={servingId === order.id}
                  onClick={() => void serveNow(order.id)}
                  className="shrink-0 rounded-sm bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground disabled:opacity-60"
                >
                  {servingId === order.id ? <LuLoaderCircle className="size-3.5 animate-spin" /> : 'Serve Now'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card">
        <header className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">My Other Active Orders</h2>
          <Link to="/pos" className="text-xs font-semibold text-secondary hover:underline">Open POS →</Link>
        </header>
        {otherActive.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing else in progress right now.</p>
        ) : (
          <div className="divide-y">
            {otherActive.map((o) => (
              <div key={o.id} className="flex items-center gap-3 p-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">Order #{o.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{itemCount(o)} item{itemCount(o) === 1 ? '' : 's'} · {o.table?.label ?? 'Takeaway'}</p>
                </div>
                <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning">{o.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// ---- Storekeeper dashboard — stock, purchasing, and requisitions, no hotel
// revenue. Purchase order "openValue" is money committed to suppliers, not
// business revenue, so it's fine here the same way a Waiter's own sales
// total was — it's operational supply-chain data, not the tenant's
// aggregate financial picture. ----

type BarmanOrderItem = { id: string; quantity: number; menuItem: { name: string } | null; variant: { name: string } | null }
type BarmanOrder = {
  id: string
  orderNumber: number
  status: string
  total: number
  createdAt: string
  table: { label: string } | null
  location: { name: string } | null
  items: BarmanOrderItem[]
}

function BarmanDashboard() {
  const [activeOrders, setActiveOrders] = useState<BarmanOrder[]>([])
  const [completedToday, setCompletedToday] = useState<BarmanOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [servingId, setServingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const today = localIsoDay(new Date())
      const [activeResponse, completedResponse] = await Promise.all([
        api<{ orders: BarmanOrder[] }>('/pos/orders?channel=FOOD&limit=200'),
        api<{ orders: BarmanOrder[] }>(`/pos/orders?channel=FOOD&status=COMPLETED&from=${today}&to=${today}&limit=200`),
      ])
      setActiveOrders(activeResponse.orders.filter((order) => [...WAITER_NON_FINAL, 'PENDING_CANCELLATION'].includes(order.status)))
      setCompletedToday(completedResponse.orders)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the bar overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function serveNow(orderId: string) {
    setServingId(orderId)
    try {
      await api(`/pos/orders/${orderId}/serve`, { method: 'PATCH' })
      void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve the order')
    } finally {
      setServingId(null)
    }
  }

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading bar counter...</div>
  }

  const readyOrders = activeOrders.filter((order) => order.status === 'READY')
  const pendingCancellations = activeOrders.filter((order) => order.status === 'PENDING_CANCELLATION')
  const inProgress = activeOrders.filter((order) => order.status === 'OPEN' || order.status === 'PREPARING')
  const servedUnsettled = activeOrders.filter((order) => order.status === 'SERVED')
  const salesToday = completedToday.reduce((sum, order) => sum + order.total, 0)
  const itemCount = (order: BarmanOrder) => order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bar counter</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label="Active Bar Orders" value={String(activeOrders.length)} icon={<LuClipboardList className="size-4" />} />
          <StatCard tone="warn" label="Ready for Handoff" value={String(readyOrders.length)} icon={<LuBellRing className="size-4" />} hint={readyOrders.length ? 'Approve counter pickup' : undefined} />
          <StatCard index={1} label="Served, Not Settled" value={String(servedUnsettled.length)} icon={<LuReceiptText className="size-4" />} />
          <StatCard tone={pendingCancellations.length ? 'warn' : 'info'} label="Pending Cancellations" value={String(pendingCancellations.length)} icon={<LuUndo2 className="size-4" />} />
        </div>
      </section>

      {readyOrders.length > 0 && (
        <section className="mt-6 rounded-lg border-2 border-warning/40 bg-warning/5 p-2.5">
          <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-warning">
            <LuBellRing className="size-3.5" /> Ready for handoff - {readyOrders.length}
          </p>
          <div className="space-y-2">
            {readyOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-2 rounded-sm border bg-card p-2.5 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">Order #{order.orderNumber}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{itemCount(order)} item{itemCount(order) === 1 ? '' : 's'} - {order.table?.label ?? 'Takeaway'}{order.location ? ` - ${order.location.name}` : ''}</p>
                </div>
                <button
                  disabled={servingId === order.id}
                  onClick={() => void serveNow(order.id)}
                  className="shrink-0 rounded-sm bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground disabled:opacity-60"
                >
                  {servingId === order.id ? <LuLoaderCircle className="size-3.5 animate-spin" /> : 'Approve'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuClipboardList className="size-4 text-secondary" /> Bar Orders In Progress</h2>
            <Link to="/pos" className="text-xs font-semibold text-secondary hover:underline">Open POS</Link>
          </header>
          {inProgress.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No drinks in progress right now.</p>
          ) : (
            <div className="divide-y">
              {inProgress.slice(0, 8).map((order) => (
                <div key={order.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">Order #{order.orderNumber} - {order.table?.label ?? 'Takeaway'}</p>
                    <p className="truncate text-xs text-muted-foreground">{order.items.map((item) => `${item.quantity}x ${item.menuItem?.name ?? 'item'}${item.variant ? ` (${item.variant.name})` : ''}`).join(' - ')}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-secondary">{titleCase(order.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuCircleCheck className="size-4 text-success" /> Completed Today</h2>
            <Link to="/sales/receipts" className="text-xs font-semibold text-secondary hover:underline">Receipts</Link>
          </header>
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-sm border bg-background p-3">
              <p className="text-2xl font-semibold tabular-nums">{completedToday.length}</p>
              <p className="text-xs text-muted-foreground">Completed orders</p>
            </div>
            <div className="rounded-sm border bg-background p-3">
              <p className="text-2xl font-semibold tabular-nums">{formatKes(salesToday)}</p>
              <p className="text-xs text-muted-foreground">Visible sales</p>
            </div>
          </div>
          {pendingCancellations.length > 0 && (
            <div className="border-t p-4">
              <Link to="/sales/approvals" className="inline-flex items-center gap-2 rounded-sm border border-warning/40 px-3 py-2 text-xs font-bold text-warning hover:bg-warning/10">
                <LuUndo2 className="size-4" /> Review {pendingCancellations.length} cancellation{pendingCancellations.length === 1 ? '' : 's'}
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

type PackInfo = { unit: string; packSize?: string | null; packLabel?: string | null; packUnit?: { id: string; name: string } | null }
type LowStockProduct = { id: string; name: string; totalQuantity: string; reorderLevel: string | number } & PackInfo
type StockMovement = { id: string; type: string; quantity: string | number; occurredAt: string; product: ({ name: string } & PackInfo) | null; location: { name: string } | null }
type RequisitionStatus2 = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED'
type Requisition = { id: string; requisitionNo: string; purpose: string | null; status: RequisitionStatus2; items: { id: string }[] }
type PurchaseStatus2 = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
type PurchaseOrder = { id: string; purchaseNo: string; status: PurchaseStatus2; total: string | number; supplier: { name: string } | null }

const requisitionStatusCls: Record<RequisitionStatus2, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SUBMITTED: 'bg-warning/15 text-warning',
  APPROVED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
  CONVERTED: 'bg-secondary/10 text-secondary',
  CANCELLED: 'bg-muted text-muted-foreground',
}
const purchaseStatusCls: Record<PurchaseStatus2, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ORDERED: 'bg-warning/15 text-warning',
  PARTIALLY_RECEIVED: 'bg-secondary/10 text-secondary',
  RECEIVED: 'bg-success/10 text-success',
  CANCELLED: 'bg-destructive/10 text-destructive',
}
const stockLabel = (qty: string | number, product: PackInfo) =>
  packAndUnit(Number(qty), Number(product.packSize) || 0, product.packLabel ?? '', product.packUnit?.name ?? product.unit)

function StorekeeperDashboard() {
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([])
  const [productSummary, setProductSummary] = useState({ total: 0, active: 0, lowStock: 0 })
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [awaitingReview, setAwaitingReview] = useState(0)
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([])
  const [purchasesInTransit, setPurchasesInTransit] = useState(0)
  const [openValue, setOpenValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [productResponse, movementResponse, requisitionResponse, purchaseResponse] = await Promise.all([
          api<{ products: LowStockProduct[]; summary: { total: number; active: number; lowStock: number } }>('/products?lowStock=true'),
          api<{ entries: StockMovement[] }>('/stock-ledger?pageSize=8'),
          api<{ requisitions: Requisition[]; summary: { awaitingReview: number } }>('/purchase-requisitions'),
          api<{ purchases: PurchaseOrder[]; summary: { byStatus: Record<PurchaseStatus2, number>; openValue: number } }>('/purchases'),
        ])
        if (cancelled) return
        setLowStock(productResponse.products.slice(0, 8))
        setProductSummary(productResponse.summary)
        setMovements(movementResponse.entries)
        setRequisitions(requisitionResponse.requisitions.slice(0, 6))
        setAwaitingReview(requisitionResponse.summary.awaitingReview)
        setPurchases(purchaseResponse.purchases.filter((p) => p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED').slice(0, 6))
        setPurchasesInTransit((purchaseResponse.summary.byStatus.ORDERED ?? 0) + (purchaseResponse.summary.byStatus.PARTIALLY_RECEIVED ?? 0))
        setOpenValue(purchaseResponse.summary.openValue)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the stock overview')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading stock overview…</div>
  }
  if (error) {
    return <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>
  }

  return (
    <>
      <section className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock at a glance</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard tone="warn" label="Low Stock Items" value={String(productSummary.lowStock)} icon={<LuTriangleAlert className="size-4" />} />
          <StatCard index={0} label="Active Products" value={String(productSummary.active)} icon={<LuPackage className="size-4" />} />
          <StatCard index={1} label="Requisitions Awaiting Review" value={String(awaitingReview)} icon={<LuClipboardList className="size-4" />} />
          <StatCard index={2} label="Purchase Orders In Transit" value={String(purchasesInTransit)} icon={<LuShoppingBag className="size-4" />} hint={openValue > 0 ? `${formatKes(openValue)} committed` : undefined} />
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuTriangleAlert className="size-4 text-warning" /> Low Stock</h2>
            <Link to="/products" className="text-xs font-semibold text-secondary hover:underline">All products →</Link>
          </header>
          {lowStock.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing below its reorder level right now.</p>
          ) : (
            <div className="divide-y">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.name}</p></div>
                  <p className="shrink-0 tabular-nums text-warning">{stockLabel(p.totalQuantity, p)} / {stockLabel(p.reorderLevel, p)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuBookOpen className="size-4 text-secondary" /> Recent Stock Movements</h2>
            <Link to="/inventory/stock-ledger" className="text-xs font-semibold text-secondary hover:underline">Full ledger →</Link>
          </header>
          {movements.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No stock movements recorded yet.</p>
          ) : (
            <div className="divide-y">
              {movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.product?.name ?? 'Unknown product'}</p>
                    <p className="text-xs text-muted-foreground">{titleCase(m.type)}{m.location ? ` · ${m.location.name}` : ''} · {new Date(m.occurredAt).toLocaleDateString()}</p>
                  </div>
                  <p className={cn('shrink-0 tabular-nums font-semibold', Number(m.quantity) >= 0 ? 'text-success' : 'text-destructive')}>{Number(m.quantity) >= 0 ? '+' : ''}{m.product ? stockLabel(m.quantity, m.product) : Number(m.quantity).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuClipboardList className="size-4 text-secondary" /> Recent Requisitions</h2>
            <Link to="/inventory/purchase-requisitions" className="text-xs font-semibold text-secondary hover:underline">All requisitions →</Link>
          </header>
          {requisitions.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No requisitions raised yet.</p>
          ) : (
            <div className="divide-y">
              {requisitions.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.requisitionNo}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.purpose || `${r.items.length} item${r.items.length === 1 ? '' : 's'}`}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', requisitionStatusCls[r.status])}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuBoxes className="size-4 text-secondary" /> Purchase Orders In Progress</h2>
            <Link to="/inventory/purchases" className="text-xs font-semibold text-secondary hover:underline">All purchases →</Link>
          </header>
          {purchases.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing on order right now.</p>
          ) : (
            <div className="divide-y">
              {purchases.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.purchaseNo}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.supplier?.name ?? 'No supplier'}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', purchaseStatusCls[p.status])}>{p.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

// ---- Chef dashboard — kitchen tickets, menu, recipes, low-stock
// ingredients, no hotel revenue. Reuses GET /kitchen/orders exactly the way
// Kitchen.tsx itself does (OPEN/PREPARING only, oldest first) and its
// start/ready actions, so the dashboard can act on a ticket directly. ----

type KitchenOrderItem = { id: string; quantity: number; menuItem: { name: string } | null; variant: { name: string } | null }
type KitchenOrder = { id: string; orderNumber: number; status: 'OPEN' | 'PREPARING'; createdAt: string; table: { label: string } | null; items: KitchenOrderItem[] }
type KitchenMenuItem = { id: string; recipe: { id: string } | null }

const elapsedMinutes = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))

function ChefDashboard() {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [menuItems, setMenuItems] = useState<KitchenMenuItem[]>([])
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [orderResponse, menuResponse, productResponse] = await Promise.all([
        api<{ orders: KitchenOrder[] }>('/kitchen/orders'),
        api<{ items: KitchenMenuItem[] }>('/kitchen/menu-items'),
        api<{ products: LowStockProduct[]; summary: { lowStock: number } }>('/products?lowStock=true'),
      ])
      setOrders(orderResponse.orders)
      setMenuItems(menuResponse.items)
      setLowStock(productResponse.products.slice(0, 8))
      setLowStockCount(productResponse.summary.lowStock)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the kitchen overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function advance(order: KitchenOrder) {
    setWorkingId(order.id)
    try {
      await api(`/kitchen/orders/${order.id}/${order.status === 'OPEN' ? 'start' : 'ready'}`, { method: 'PATCH' })
      void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the ticket')
    } finally {
      setWorkingId('')
    }
  }

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading the kitchen…</div>
  }

  const newTickets = orders.filter((o) => o.status === 'OPEN')
  const inProgress = orders.filter((o) => o.status === 'PREPARING')
  const oldest = orders[0]
  const withRecipe = menuItems.filter((m) => m.recipe).length

  return (
    <>
      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kitchen right now</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard index={0} label="New Tickets" value={String(newTickets.length)} icon={<LuClipboardList className="size-4" />} />
          <StatCard index={1} label="In Progress" value={String(inProgress.length)} icon={<LuChefHat className="size-4" />} />
          <StatCard tone={oldest && elapsedMinutes(oldest.createdAt) > 15 ? 'warn' : 'info'} label="Oldest Ticket" value={oldest ? `${elapsedMinutes(oldest.createdAt)} min` : '—'} icon={<LuClock3 className="size-4" />} />
          <StatCard tone="warn" label="Low Stock Ingredients" value={String(lowStockCount)} icon={<LuTriangleAlert className="size-4" />} />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-sm border bg-card">
        <header className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 font-semibold"><LuChefHat className="size-4 text-secondary" /> Ticket Queue</h2>
          <Link to="/kitchen" className="text-xs font-semibold text-secondary hover:underline">Open Kitchen →</Link>
        </header>
        {orders.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No tickets waiting — kitchen is clear.</p>
        ) : (
          <div className="divide-y">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-3 p-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">Order #{o.orderNumber} · {o.table?.label ?? 'Takeaway'}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.items.map((i) => `${i.quantity}× ${i.menuItem?.name ?? 'item'}${i.variant ? ` (${i.variant.name})` : ''}`).join(' · ')}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', o.status === 'OPEN' ? 'bg-warning/15 text-warning' : 'bg-secondary/10 text-secondary')}>{elapsedMinutes(o.createdAt)} min</span>
                <button
                  disabled={workingId === o.id}
                  onClick={() => void advance(o)}
                  className="shrink-0 rounded-sm bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground disabled:opacity-60"
                >
                  {workingId === o.id ? <LuLoaderCircle className="size-3.5 animate-spin" /> : o.status === 'OPEN' ? 'Start' : 'Mark Ready'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuTriangleAlert className="size-4 text-warning" /> Low Stock Ingredients</h2>
            <Link to="/products" className="text-xs font-semibold text-secondary hover:underline">All products →</Link>
          </header>
          {lowStock.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing below its reorder level right now.</p>
          ) : (
            <div className="divide-y">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.name}</p></div>
                  <p className="shrink-0 tabular-nums text-warning">{stockLabel(p.totalQuantity, p)} / {stockLabel(p.reorderLevel, p)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-sm border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold"><LuUtensils className="size-4 text-secondary" /> Menu</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link to="/menu/items" className="rounded-sm border p-3 text-center hover:bg-muted/40">
              <p className="text-xl font-semibold tabular-nums">{menuItems.length}</p>
              <p className="text-xs text-muted-foreground">Active Menu Items</p>
            </Link>
            <Link to="/kitchen/recipes" className="rounded-sm border p-3 text-center hover:bg-muted/40">
              <p className="text-xl font-semibold tabular-nums">{withRecipe}</p>
              <p className="text-xs text-muted-foreground">With a Recipe</p>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

// ---- Housekeeping dashboard — room tasks, cleanliness, lost & found, no
// hotel revenue. Last role in the rollout. ----

type HkTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
type HkTaskType = 'CLEANING' | 'INSPECTION' | 'MAINTENANCE'
type HkRoom = { id: string; number: string; status: RoomStatus; cleanliness: RoomCleanliness }
type HkTask = { id: string; type: HkTaskType; status: HkTaskStatus; assignedTo: string | null; dueAt: string | null; room: HkRoom }
type LostFoundRow = { id: string; itemNo: string; itemName: string; room: { number: string } | null; foundAt: string; status: 'UNCLAIMED' | 'COLLECTED' }

function HousekeepingDashboard() {
  const [tasks, setTasks] = useState<HkTask[]>([])
  const [taskSummary, setTaskSummary] = useState({ pending: 0, inProgress: 0, completed: 0 })
  const [rooms, setRooms] = useState<HkRoom[]>([])
  const [roomSummary, setRoomSummary] = useState({ ready: 0, needsService: 0 })
  const [lostFound, setLostFound] = useState<LostFoundRow[]>([])
  const [unclaimedCount, setUnclaimedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [taskResponse, roomResponse, lostFoundResponse] = await Promise.all([
        api<{ tasks: HkTask[]; summary: { pending: number; inProgress: number; completed: number } }>('/housekeeping/tasks'),
        api<{ rooms: HkRoom[]; summary: { ready: number; needsService: number } }>('/housekeeping/rooms'),
        api<{ items: LostFoundRow[]; summary: { unclaimed: number } }>('/lost-found'),
      ])
      setTasks(taskResponse.tasks.filter((t) => t.status !== 'COMPLETED'))
      setTaskSummary(taskResponse.summary)
      setRooms(roomResponse.rooms)
      setRoomSummary(roomResponse.summary)
      setLostFound(lostFoundResponse.items.slice(0, 6))
      setUnclaimedCount(lostFoundResponse.summary.unclaimed)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the housekeeping overview')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function advance(task: HkTask) {
    setWorkingId(task.id)
    try {
      const next = task.status === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED'
      await api(`/housekeeping/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      void load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the task')
    } finally {
      setWorkingId('')
    }
  }

  if (loading) {
    return <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading housekeeping…</div>
  }

  return (
    <>
      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Housekeeping right now</p>
        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard tone="warn" label="Pending Tasks" value={String(taskSummary.pending)} icon={<LuClipboardList className="size-4" />} />
          <StatCard index={0} label="In Progress" value={String(taskSummary.inProgress)} icon={<LuSparkles className="size-4" />} />
          <StatCard index={1} label="Rooms Ready" value={String(roomSummary.ready)} icon={<LuBedDouble className="size-4" />} hint={`${roomSummary.needsService} need service`} />
          <StatCard index={2} label="Lost & Found" value={String(unclaimedCount)} icon={<LuSearch className="size-4" />} hint="Unclaimed items" />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-sm border bg-card">
        <header className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 font-semibold"><LuClipboardList className="size-4 text-secondary" /> Task Queue</h2>
          <Link to="/housekeeping" className="text-xs font-semibold text-secondary hover:underline">All tasks →</Link>
        </header>
        {tasks.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No pending tasks — all caught up.</p>
        ) : (
          <div className="divide-y">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">Room {t.room.number} · {titleCase(t.type)}</p>
                  <p className="text-xs text-muted-foreground">{t.assignedTo ? `Assigned to ${t.assignedTo}` : 'Unassigned'}{t.dueAt ? ` · Due ${new Date(t.dueAt).toLocaleDateString()}` : ''}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', t.status === 'PENDING' ? 'bg-warning/15 text-warning' : 'bg-secondary/10 text-secondary')}>{t.status.replace('_', ' ')}</span>
                <button
                  disabled={workingId === t.id}
                  onClick={() => void advance(t)}
                  className="shrink-0 rounded-sm bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground disabled:opacity-60"
                >
                  {workingId === t.id ? <LuLoaderCircle className="size-3.5 animate-spin" /> : t.status === 'PENDING' ? 'Start' : 'Mark Done'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="border-b p-4"><h2 className="font-semibold">Room Cleanliness</h2></header>
          <div className="grid grid-cols-3 gap-3 p-4">
            <MiniCount label="Clean" value={rooms.filter((r) => r.cleanliness === 'CLEAN').length} cls="bg-success/10 text-success" />
            <MiniCount label="Dirty" value={rooms.filter((r) => r.cleanliness === 'DIRTY').length} cls="bg-destructive/10 text-destructive" />
            <MiniCount label="Inspecting" value={rooms.filter((r) => r.cleanliness === 'INSPECTING').length} cls="bg-secondary/10 text-secondary" />
          </div>
        </div>

        <div className="overflow-hidden rounded-sm border bg-card">
          <header className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold"><LuPackageCheck className="size-4 text-secondary" /> Recent Lost &amp; Found</h2>
            <Link to="/housekeeping/lost-and-found" className="text-xs font-semibold text-secondary hover:underline">All items →</Link>
          </header>
          {lostFound.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing unclaimed right now.</p>
          ) : (
            <div className="divide-y">
              {lostFound.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.itemName}</p>
                    <p className="text-xs text-muted-foreground">{item.itemNo}{item.room ? ` · Room ${item.room.number}` : ''} · {new Date(item.foundAt).toLocaleDateString()}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning">Unclaimed</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function ShiftControl({ onReady }: { onReady: (ready: boolean) => void }) {
  const user = useAppSelector((s) => s.auth.user)
  const toast = useToast()
  const [state, setState] = useState<ShiftPayload | null>(null)
  const [approvals, setApprovals] = useState<(ShiftSession & { summary: ShiftSummary | null })[]>([])
  const [activeStaff, setActiveStaff] = useState<(ShiftSession & { summary: ShiftSummary | null })[]>([])
  const [history, setHistory] = useState<(ShiftSession & { summary: ShiftSummary | null })[]>([])
  const [selectedSummary, setSelectedSummary] = useState<{ title: string; session: ShiftSession; summary: ShiftSummary; approval?: boolean } | null>(null)
  const [now, setNow] = useState(new Date())
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [confirmEndShift, setConfirmEndShift] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; tone?: 'warning' | 'danger'; busyKey: string; run: () => Promise<boolean> } | null>(null)
  const isSuperAdmin = user?.role?.name === 'Super Admin'
  const isSupervisor = Boolean(user?.isSupervisor || isSuperAdmin)

  const load = useCallback(async () => {
    try {
      const current = await api<ShiftPayload>('/shifts/current')
      setState(current)
      onReady(isSuperAdmin || current.session?.status === 'ACTIVE')
      const historyResponse = isSupervisor
        ? await api<{ sessions: (ShiftSession & { summary: ShiftSummary | null })[] }>('/shifts/sessions?status=ENDED&take=32')
        : await api<{ sessions: (ShiftSession & { summary: ShiftSummary | null })[] }>('/shifts/history')
      setHistory(historyResponse.sessions)
      if (isSupervisor) {
        const [pending, active] = await Promise.all([
          api<{ sessions: (ShiftSession & { summary: ShiftSummary | null })[] }>('/shifts/approvals'),
          api<{ sessions: (ShiftSession & { summary: ShiftSummary | null })[] }>('/shifts/active-supervised'),
        ])
        setApprovals(pending.sessions)
        setActiveStaff(active.sessions)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load shift status')
      onReady(false)
    }
  }, [isSuperAdmin, isSupervisor, onReady])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id) }, [])

  async function post(path: string, body: object = {}, key = path) {
    setBusyKey(key)
    setError('')
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) })
      toast.success('Shift updated.')
      await load()
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not update shift'
      setError(message)
      toast.error(message)
      return false
    } finally {
      setBusyKey('')
    }
  }

  async function openShiftSummary(session: ShiftSession & { summary?: ShiftSummary | null }, title: string, approval = false) {
    setBusyKey(`${session.id}:summary`)
    setError('')
    try {
      if (session.summary) {
        setSelectedSummary({ title, session, summary: session.summary, approval })
        return
      }
      const response = await api<{ session: ShiftSession; summary: ShiftSummary | null }>(`/shifts/${session.id}/summary`)
      if (!response.summary) {
        toast.error('No shift summary is available yet.')
        return
      }
      setSelectedSummary({ title, session: response.session, summary: response.summary, approval })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load shift summary'
      setError(message)
      toast.error(message)
    } finally {
      setBusyKey('')
    }
  }

  const session = state?.session
  const approvedAt = session?.approvedStartAt ? new Date(session.approvedStartAt) : null
  const elapsed = approvedAt ? Math.max(0, now.getTime() - approvedAt.getTime()) : 0
  const hours = Math.floor(elapsed / 36e5)
  const minutes = Math.floor((elapsed % 36e5) / 6e4)
  const seconds = Math.floor((elapsed % 6e4) / 1000)
  const timeText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const startText = isSupervisor ? 'Start shift' : 'Request start shift'
  const endText = isSupervisor ? 'End shift' : 'Request end shift'
  const runConfirmedAction = () => {
    const action = confirmAction
    if (!action) return
    void action.run().then((ok) => { if (ok) setConfirmAction(null) })
  }

  return (
    <section className="mt-6 space-y-5">
      {!isSuperAdmin && <div className="rounded-sm border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Shift</p>
          <h2 className="mt-1 font-display text-xl font-semibold">{session?.status === 'ACTIVE' ? 'You are on shift' : session?.status === 'REQUESTED_START' ? 'Start request waiting approval' : session?.status === 'REQUESTED_END' ? 'End request waiting approval' : 'Request shift start'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="text-left lg:text-right">
          <p className="font-display text-3xl font-semibold tabular-nums">{session?.status === 'ACTIVE' || session?.status === 'REQUESTED_END' ? timeText : '--:--:--'}</p>
          <p className="text-xs text-muted-foreground">{approvedAt ? `Started ${approvedAt.toLocaleTimeString()}` : 'Supervisor approval starts the clock'}</p>
        </div>
      </div>
      {state?.summary && (
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Sales</p><p className="font-semibold">{formatKes(state.summary.totalSales)}</p></div>
          <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Collected</p><p className="font-semibold">{formatKes(state.summary.totalPaid)}</p></div>
          <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Credit</p><p className="font-semibold">{formatKes(state.summary.creditSales)}</p></div>
          <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Complimentary</p><p className="font-semibold">{formatKes(state.summary.complimentaryTotal)}</p></div>
          <div className="rounded-sm border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Pending</p><p className="font-semibold">{state.summary.pendingOrders}</p></div>
        </div>
      )}
      {state?.summary?.byPaymentMethod.length ? (
        <div className="mt-4 rounded-sm border">
          {state.summary.byPaymentMethod.map((m) => (
            <div key={m.name} className="flex items-center justify-between border-t px-3 py-2 text-sm first:border-t-0">
              <span>{m.name}</span>
              <span className="font-semibold tabular-nums">{formatKes(m.total)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {!session && <ShiftButton loading={busyKey === 'start'} onClick={() => setConfirmAction({
          title: isSupervisor ? 'Are you sure you want to start shift?' : 'Request shift start?',
          message: isSupervisor ? 'Your shift will start immediately.' : 'Your supervisor will need to approve this request before you can work.',
          confirmLabel: startText,
          busyKey: 'start',
          run: () => post('/shifts/start-request', {}, 'start'),
        })} icon={<LuLogIn />}>{startText}</ShiftButton>}
        {session?.status === 'ACTIVE' && <ShiftButton loading={busyKey === 'end'} onClick={() => setConfirmEndShift(true)} icon={<LuLogOut />}>{endText}</ShiftButton>}
        {session?.status === 'REQUESTED_START' && <span className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Waiting for supervisor</span>}
        {session?.status === 'REQUESTED_END' && <span className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Waiting for handover approval</span>}
      </div>
      </div>}
      {approvals.length > 0 && (
        <div className="overflow-hidden rounded-sm border bg-card">
          <div className="bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supervisor approvals</div>
          {approvals.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{a.employee.firstName} {a.employee.lastName}</p>
                <p className="text-xs text-muted-foreground">{a.status === 'REQUESTED_END' ? `End shift · ${formatKes(a.summary?.totalPaid ?? 0)} collected` : 'Start shift'}</p>
              </div>
              <div className="flex gap-2">
                {a.status === 'REQUESTED_END' && a.summary && <button onClick={() => void openShiftSummary(a, `${a.employee.firstName}'s handover`, true)} className="rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted">Review</button>}
                {a.status === 'REQUESTED_START' && <button disabled={busyKey === `${a.id}:approve`} onClick={() => setConfirmAction({
                  title: 'Approve shift start?',
                  message: `${a.employee.firstName} ${a.employee.lastName} will be marked active immediately.`,
                  confirmLabel: 'Approve',
                  busyKey: `${a.id}:approve`,
                  run: () => post(`/shifts/${a.id}/start-approval`, { action: 'APPROVE' }, `${a.id}:approve`),
                })} className="inline-flex items-center gap-1.5 rounded-sm bg-success px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{busyKey === `${a.id}:approve` && <LuLoaderCircle className="size-3 animate-spin" />}Approve</button>}
                {a.status === 'REQUESTED_START' && <button disabled={busyKey === `${a.id}:reject`} onClick={() => setConfirmAction({
                  title: 'Reject shift start?',
                  message: `${a.employee.firstName} ${a.employee.lastName}'s start request will be rejected.`,
                  confirmLabel: 'Reject',
                  tone: 'danger',
                  busyKey: `${a.id}:reject`,
                  run: () => post(`/shifts/${a.id}/start-approval`, { action: 'REJECT' }, `${a.id}:reject`),
                })} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60">{busyKey === `${a.id}:reject` && <LuLoaderCircle className="size-3 animate-spin" />}Reject</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {isSupervisor && activeStaff.length > 0 && (
        <div className="overflow-hidden rounded-sm border bg-card">
          <div className="bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently on shift</div>
          <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-3">
            {activeStaff.map((s) => {
              const started = s.approvedStartAt ? new Date(s.approvedStartAt) : null
              const liveHours = started ? Math.max(0, (now.getTime() - started.getTime()) / 36e5) : 0
              return (
                <button key={s.id} type="button" onClick={() => void openShiftSummary(s, `${s.employee.firstName}'s active shift`)} className="border-t p-3 text-left text-sm transition hover:bg-muted/50 sm:border-r">
                  <p className="font-semibold">{s.employee.firstName} {s.employee.lastName}</p>
                  <p className="text-xs text-muted-foreground">{s.employee.jobTitle || 'Employee'} - {liveHours.toFixed(1)} hrs</p>
                  <div className="mt-2 flex items-center justify-between text-xs"><span>Sales</span><span className="font-semibold">{formatKes(s.summary?.totalSales ?? 0)}</span></div>
                  <div className="mt-1 flex items-center justify-between text-xs"><span>Credit</span><span className="font-semibold">{formatKes(s.summary?.creditSales ?? 0)}</span></div>
                  <p className="mt-2 text-[11px] font-semibold text-secondary">{busyKey === `${s.id}:summary` ? 'Loading...' : 'View shift details'}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div className="overflow-hidden rounded-sm border bg-card">
          <div className="bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isSupervisor ? 'Recent staff shifts' : 'My shift history'}</div>
          <div className="max-h-80 overflow-y-auto">
            {history.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{isSupervisor ? `${s.employee.firstName} ${s.employee.lastName}` : s.approvedStartAt ? new Date(s.approvedStartAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Shift'}</p>
                  <p className="text-xs text-muted-foreground">{s.approvedStartAt ? new Date(s.approvedStartAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} - {s.approvedEndAt ? new Date(s.approvedEndAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'} - {(s.summary?.hours ?? 0).toFixed(1)} hrs</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <p className="font-semibold">{formatKes(s.summary?.totalSales ?? 0)}</p>
                    <p className="text-muted-foreground">{formatKes(s.summary?.totalPaid ?? 0)} collected</p>
                  </div>
                  <button onClick={() => void openShiftSummary(s, isSupervisor ? `${s.employee.firstName}'s shift summary` : 'Shift summary')} className="rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted">{busyKey === `${s.id}:summary` ? 'Loading...' : 'View'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedSummary && (
        <ShiftSummaryModal
          title={selectedSummary.title}
          session={selectedSummary.session}
          summary={selectedSummary.summary}
          approval={selectedSummary.approval}
          busyKey={busyKey}
          onClose={() => setSelectedSummary(null)}
          onApprove={() => setConfirmAction({
            title: 'Are you sure you want to approve this shift end?',
            message: `${selectedSummary.session.employee.firstName} ${selectedSummary.session.employee.lastName}'s shift will be marked cleared and ended.`,
            confirmLabel: 'Mark cleared and end shift',
            busyKey: `${selectedSummary.session.id}:approve-end`,
            run: () => post(`/shifts/${selectedSummary.session.id}/end-approval`, { action: 'APPROVE' }, `${selectedSummary.session.id}:approve-end`).then((ok) => { if (ok) setSelectedSummary(null); return ok }),
          })}
          onReject={() => setConfirmAction({
            title: 'Reject this shift end?',
            message: `${selectedSummary.session.employee.firstName} ${selectedSummary.session.employee.lastName}'s end request will be rejected.`,
            confirmLabel: 'Reject',
            tone: 'danger',
            busyKey: `${selectedSummary.session.id}:reject-end`,
            run: () => post(`/shifts/${selectedSummary.session.id}/end-approval`, { action: 'REJECT' }, `${selectedSummary.session.id}:reject-end`).then((ok) => { if (ok) setSelectedSummary(null); return ok }),
          })}
        />
      )}
      <ConfirmModal
        open={confirmEndShift}
        tone="warning"
        title="Are you sure you want to end shift?"
        message={isSupervisor ? "This closes your shift now — you'll need to start a new one to keep selling." : "This sends an end-shift request to your supervisor for approval."}
        confirmLabel={endText}
        loading={busyKey === 'end'}
        onCancel={() => setConfirmEndShift(false)}
        onConfirm={() => void post('/shifts/end-request', {}, 'end').then((ok) => { if (ok) setConfirmEndShift(false) })}
      />
      <ConfirmModal
        open={confirmAction !== null}
        tone={confirmAction?.tone ?? 'warning'}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        loading={Boolean(confirmAction && busyKey === confirmAction.busyKey)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
      />
    </section>
  )
}

function ShiftButton({ loading, onClick, icon, children }: { loading: boolean; onClick: () => void; icon: ReactNode; children: string }) {
  return (
    <button disabled={loading} onClick={onClick} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
      {loading ? <LuLoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

function ShiftSummaryModal({ title, session, summary, approval, busyKey, onClose, onApprove, onReject }: { title: string; session: ShiftSession; summary: ShiftSummary; approval?: boolean; busyKey: string; onClose: () => void; onApprove: () => void; onReject: () => void }) {
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
        {approval && (
          <div className="flex flex-wrap justify-end gap-2 border-t p-5">
            <button disabled={busyKey === `${session.id}:reject-end`} onClick={onReject} className="inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60">{busyKey === `${session.id}:reject-end` && <LuLoaderCircle className="size-4 animate-spin" />}Reject</button>
            <button disabled={busyKey === `${session.id}:approve-end`} onClick={onApprove} className="inline-flex items-center gap-2 rounded-sm bg-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busyKey === `${session.id}:approve-end` && <LuLoaderCircle className="size-4 animate-spin" />}Mark cleared and end shift</button>
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

export default function Dashboard() {
  const allModules = navigation.flatMap((g) => g.items).filter((i) => i.moduleKey)
  const user = useAppSelector((s) => s.auth.user)
  const moduleKeys = useAppSelector((s) => s.tenant.moduleKeys)
  const [shiftReady, setShiftReady] = useState(user?.role?.name === 'Super Admin')
  const firstName = user?.firstName ?? 'there'
  // Revenue and every figure derived from it: Super Admin, Manager, and
  // Accountant — the three roles the user named as allowed to see money.
  // Every other role still keeps the plain module list below until its own
  // dashboard is built (see hotelier_dashboard_rollout memory).
  const roleName = user?.role?.name
  const revenueVariant = roleName === 'Super Admin' || roleName === 'Manager' ? 'operations' : roleName === 'Accountant' ? 'finance' : null
  const isReceptionist = roleName === 'Receptionist'
  const isWaiter = roleName === 'Waiter'
  const isStorekeeper = roleName === 'Storekeeper'
  const isChef = roleName === 'Chef'
  const isHousekeeping = roleName === 'Housekeeping'
  const isBarman = roleName === 'Barman'

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          01 &middot; Daily Focus
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {getGreeting()}, {firstName}
        </p>
      </header>

      <ShiftControl onReady={setShiftReady} />

      {shiftReady && revenueVariant && <RevenueDashboard variant={revenueVariant} />}
      {shiftReady && isReceptionist && <ReceptionDashboard />}
      {shiftReady && isWaiter && <WaiterDashboard />}
      {shiftReady && isStorekeeper && <StorekeeperDashboard />}
      {shiftReady && isChef && <ChefDashboard />}
      {shiftReady && isHousekeeping && <HousekeepingDashboard />}
      {shiftReady && isBarman && <BarmanDashboard />}

      <section className="mt-8 rounded-sm border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Your Modules
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This workspace&apos;s plan includes the modules below. Upgrade anytime to unlock more.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {allModules.map((mod) => {
            const enabled = mod.moduleKey ? moduleKeys.includes(mod.moduleKey) : false
            return (
              <div
                key={mod.href}
                className={`flex items-center gap-3 rounded-sm border px-3.5 py-3 ${
                  enabled
                    ? 'border-border bg-background'
                    : 'border-dashed border-border bg-muted/40 opacity-60'
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-sm ${
                    enabled ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <mod.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {mod.label}
                </span>
                {!enabled && <LuLock className="size-3.5 shrink-0 text-muted-foreground" />}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
