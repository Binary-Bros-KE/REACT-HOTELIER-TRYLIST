import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBan, LuCalendarDays, LuCircleAlert, LuLoaderCircle, LuMapPin, LuPrinter, LuReceiptText, LuSearch, LuUserRound, LuWallet } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import StatCard from '@/components/ui/StatCard'
import { type ReceiptOrder, type ReceiptProfile } from '@/components/pos/OrderReceipt'
import OrderSettlementPanel from '@/components/pos/OrderSettlementPanel'
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal'

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'
type ReceiptRow = ReceiptOrder & { total: number; paid: number; paymentStatus?: PaymentStatus; createdBy: string | null }
type LocationOption = { id: string; name: string }
type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type EmployeeOption = { id: string; firstName: string; lastName: string | null }
type PaymentFilter = 'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID'
type StatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED'

// Applied to each status fetched (COMPLETED, CANCELLED) — kept in step with
// the same cap used for the POS Completed/Cancelled tabs and the Approvals
// history view, so every "recent sales" list in the app behaves the same
// way. ~100 full order payloads (items/payments/tax breakdown included) run
// well under 1MB even on a slow connection; 500 would push multiple MB on
// every page load for no real benefit — nobody scrolls that far back. A
// narrower date range (below) is the intended way to reach further back.
const FETCH_LIMIT = 100

const formatKes = (value: number | string) => `KSh ${Number(value).toLocaleString()}`

const badgeFor = (row: ReceiptRow) => {
  if (row.status === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-destructive/10 text-destructive' }
  if (row.saleType === 'COMPLIMENTARY') return { label: 'Complementary', cls: 'bg-warning/15 text-warning' }
  const owed = Math.max(0, row.total - row.paid)
  if (owed > 0.01 && row.creditExpectedAt && new Date(row.creditExpectedAt).getTime() < Date.now()) return { label: 'Overdue', cls: 'bg-destructive/10 text-destructive' }
  if (row.paymentStatus === 'PAID' || owed <= 0.01) return { label: 'Paid', cls: 'bg-success/10 text-success' }
  if (row.paymentStatus === 'PARTIAL' || row.paid > 0.01) return { label: 'Part-paid', cls: 'bg-warning/15 text-warning' }
  return { label: 'On credit', cls: 'bg-destructive/10 text-destructive' }
}

const paymentStatusOf = (row: ReceiptRow): PaymentStatus => {
  if (row.paymentStatus) return row.paymentStatus
  const owed = Math.max(0, row.total - row.paid)
  return owed <= 0.01 ? 'PAID' : row.paid > 0.01 ? 'PARTIAL' : 'UNPAID'
}

export default function Receipts() {
  const toast = useToast()
  const [orders, setOrders] = useState<ReceiptRow[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [profile, setProfile] = useState<ReceiptProfile>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [manageId, setManageId] = useState<string | null>(null)
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null)

  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId } = useWorkingLocation(locations, { persist: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let query = effectiveLocationId ? `&locationId=${effectiveLocationId}` : ''
      if (employeeFilter) query += `&employeeId=${employeeFilter}`
      if (dateFrom) query += `&from=${dateFrom}`
      if (dateTo) query += `&to=${dateTo}`
      // Only pull the statuses actually needed — narrowing the Status filter
      // to Completed or Cancelled halves the payload instead of fetching
      // both and throwing one half away client-side.
      const statuses: ('COMPLETED' | 'CANCELLED')[] = statusFilter === 'ALL' ? ['COMPLETED', 'CANCELLED'] : [statusFilter]
      const [orderResponses, profileResponse, locationResponse, employeeResponse, methodsResponse] = await Promise.all([
        Promise.all(statuses.map((s) => api<{ orders: ReceiptRow[] }>(`/pos/orders?status=${s}&limit=${FETCH_LIMIT}${query}`))),
        api<{ profile: ReceiptProfile }>('/business-profile'),
        api<{ locations: LocationOption[] }>('/locations'),
        api<{ employees: EmployeeOption[] }>('/employees'),
        api<{ methods: (PaymentMethod & { code: string })[] }>('/payment-methods?activeOnly=true'),
      ])
      const merged = orderResponses.flatMap((r) => r.orders).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      setOrders(merged)
      setProfile(profileResponse.profile)
      setLocations(locationResponse.locations)
      setEmployees(employeeResponse.employees)
      setPaymentMethods(methodsResponse.methods.filter((m) => m.code !== 'ROOM_CHARGE'))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load receipts'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [effectiveLocationId, statusFilter, employeeFilter, dateFrom, dateTo, toast])

  useEffect(() => { void load() }, [load])

  const staffNames = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()])), [employees])

  const visible = orders.filter((order) => {
    if (paymentFilter !== 'ALL') {
      if (order.status === 'CANCELLED') return false
      if (paymentStatusOf(order) !== paymentFilter) return false
    }
    if (!search.trim()) return true
    const query = search.trim().toLowerCase()
    return String(order.orderNumber).includes(query) || (order.table?.label ?? 'takeaway').toLowerCase().includes(query)
  })

  const completedVisible = visible.filter((o) => o.status !== 'CANCELLED')
  const cancelledVisible = visible.filter((o) => o.status === 'CANCELLED')
  const totalSales = completedVisible.reduce((s, o) => s + o.total, 0)
  const totalCollected = completedVisible.reduce((s, o) => s + o.paid, 0)
  const totalOutstanding = completedVisible.reduce((s, o) => s + Math.max(0, o.total - o.paid), 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
      <header>
        <p className="text-sm font-semibold text-secondary">Sales</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Receipts</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every completed sale — plus cancelled orders, kept here for the record — with the full itemized breakdown and payment history.</p>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard index={0} icon={<LuReceiptText className="size-4" />} label="Sales" value={formatKes(totalSales)} hint={`${completedVisible.length} order${completedVisible.length === 1 ? '' : 's'}`} />
        <StatCard tone="success" icon={<LuWallet className="size-4" />} label="Collected" value={formatKes(totalCollected)} />
        <StatCard tone="warn" icon={<LuWallet className="size-4" />} label="Outstanding" value={formatKes(totalOutstanding)} />
        <StatCard tone="danger" icon={<LuBan className="size-4" />} label="Cancelled" value={String(cancelledVisible.length)} hint={formatKes(cancelledVisible.reduce((s, o) => s + o.total, 0))} />
      </section>

      <div className="mt-7 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <span className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order # or table…" className="input pl-9" />
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Payment status
          <select aria-label="Filter by payment status" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)} className="input">
            <option value="ALL">All payment statuses</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partially paid</option>
            <option value="PAID">Fully paid</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select aria-label="Filter by order status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="input">
            <option value="ALL">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Employee
          <select aria-label="Filter by employee" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input">
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName ?? ''}</option>)}
          </select>
        </label>

        {fixedLocation ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Location
            <span className="input flex items-center gap-1.5 text-muted-foreground"><LuMapPin className="size-3.5" /> {fixedLocation.name}</span>
          </label>
        ) : pickableLocations.length > 0 && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Location
            <select aria-label="Filter by location" value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="input">
              <option value="">All locations</option>
              {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          From
          <span className="relative">
            <LuCalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="input pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          To
          <span className="relative">
            <LuCalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="input pl-9" />
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading receipts…</div>
      ) : visible.length === 0 ? (
        <div className="mt-7 min-h-64 rounded-sm border bg-card p-16 text-center text-sm text-muted-foreground">No sales {search.trim() || paymentFilter !== 'ALL' || statusFilter !== 'ALL' || employeeFilter || dateFrom || dateTo ? 'match this view' : 'yet'}.</div>
      ) : (
        <section className="mt-7 overflow-hidden rounded-sm border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wide text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Table</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Paid</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => {
                  const badge = badgeFor(order)
                  const owed = Math.max(0, order.total - order.paid)
                  return (
                    <tr key={order.id} className="cursor-pointer border-t transition hover:bg-muted/30" onClick={() => setManageId(order.id)}>
                      <td className="px-5 py-4 font-semibold">#{order.orderNumber}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {order.table?.label ?? 'Takeaway'}
                        {order.createdBy && staffNames[order.createdBy] && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80"><LuUserRound className="size-3" /> {staffNames[order.createdBy]}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{new Date(order.updatedAt).toLocaleString()}</td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', badge.cls)}>{badge.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{order.saleType === 'COMPLIMENTARY' ? (order.complimentaryRecipientName || order.complimentarySession?.title || 'No payment') : [...new Set(order.payments.map((p) => p.paymentMethod.name))].join(', ') || '—'}</span>
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">{order.status === 'CANCELLED' ? '—' : <>{formatKes(order.paid)}{owed > 0.01 && <span className="block text-[11px] font-semibold text-warning">owing {formatKes(owed)}</span>}</>}</td>
                      <td className="px-5 py-4 text-right font-semibold">{formatKes(order.total)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          {order.status !== 'CANCELLED' && owed > 0.01 && (
                            <button onClick={(e) => { e.stopPropagation(); setManageId(order.id) }} title="Take payment" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuWallet /></button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setReceiptOrderId(order.id) }} title="View / print receipt" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPrinter /></button>
                          <button onClick={(e) => { e.stopPropagation(); setManageId(order.id) }} title="Manage / request a return" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuReceiptText /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {manageId && (
        <OrderSettlementPanel
          orderId={manageId}
          title="Receipt"
          paymentMethods={paymentMethods}
          onClose={() => setManageId(null)}
          onChanged={() => void load()}
        />
      )}

      {receiptOrderId && (
        <ReceiptPreviewModal
          orderId={receiptOrderId}
          profile={profile}
          onClose={() => setReceiptOrderId(null)}
        />
      )}
    </div>
  )
}
