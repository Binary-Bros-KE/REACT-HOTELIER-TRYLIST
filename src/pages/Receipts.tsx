import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBan, LuCalendarDays, LuCircleAlert, LuLoaderCircle, LuMapPin, LuPrinter, LuReceiptText, LuSearch, LuUserRound, LuWallet } from 'react-icons/lu'
import { useLocation } from 'react-router-dom'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import StatCard from '@/components/ui/StatCard'
import { type ReceiptOrder, type ReceiptProfile } from '@/components/pos/OrderReceipt'
import OrderSettlementPanel from '@/components/pos/OrderSettlementPanel'
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill, { type PillTone } from '@/components/ui/StatusPill'

type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'
type ReceiptRow = ReceiptOrder & { total: number; paid: number; paymentStatus?: PaymentStatus; createdBy: string | null; customer?: { firstName: string; lastName: string | null; phone: string | null } | null }
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

const badgeFor = (row: ReceiptRow): { label: string; tone: PillTone } => {
  if (row.status === 'CANCELLED') return { label: 'Cancelled', tone: 'danger' }
  if (row.saleType === 'COMPLIMENTARY') return { label: 'Complementary', tone: 'warning' }
  const owed = Math.max(0, row.total - row.paid)
  if (owed > 0.01 && row.creditExpectedAt && new Date(row.creditExpectedAt).getTime() < Date.now()) return { label: 'Overdue', tone: 'danger' }
  if (row.paymentStatus === 'PAID' || owed <= 0.01) return { label: 'Paid', tone: 'success' }
  if (row.paymentStatus === 'PARTIAL' || row.paid > 0.01) return { label: 'Part-paid', tone: 'warning' }
  return { label: 'On credit', tone: 'danger' }
}

const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'

const paymentStatusOf = (row: ReceiptRow): PaymentStatus => {
  if (row.paymentStatus) return row.paymentStatus
  const owed = Math.max(0, row.total - row.paid)
  return owed <= 0.01 ? 'PAID' : row.paid > 0.01 ? 'PARTIAL' : 'UNPAID'
}

/** channel: leave unset for every sale (Sales > Receipts) or pass 'SERVICES' for the Service Center's own receipts. */
export default function Receipts({ channel }: { channel?: 'FOOD' | 'PRODUCTS' | 'SERVICES' } = {}) {
  const isServices = channel === 'SERVICES'
  const path = useLocation().pathname
  const isReception = path.startsWith('/reception')
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  const isSuperAdmin = user?.role?.name === 'Super Admin'
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
  const [overridesOnly, setOverridesOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [manageId, setManageId] = useState<string | null>(null)
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null)
  const [voidingId, setVoidingId] = useState<string | null>(null)

  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId } = useWorkingLocation(locations, { persist: false })
  const assignedLocationCount = user?.locations.length ?? 0

  useEffect(() => {
    if (!fixedLocation && assignedLocationCount > 0 && !selectedLocationId && pickableLocations[0]) setLocation(pickableLocations[0].id)
  }, [assignedLocationCount, fixedLocation, pickableLocations, selectedLocationId, setLocation])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let query = effectiveLocationId ? `&locationId=${effectiveLocationId}` : ''
      if (channel) query += `&channel=${channel}`
      if (overridesOnly) query += '&overridden=true'
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
  }, [effectiveLocationId, channel, overridesOnly, statusFilter, employeeFilter, dateFrom, dateTo, toast])

  useEffect(() => { void load() }, [load])

  async function voidSale(order: ReceiptRow) {
    const reason = window.prompt(`Void completed sale #${order.orderNumber}? Give a reason:`)?.trim()
    if (!reason) return
    setVoidingId(order.id)
    try {
      await api(`/pos/orders/${order.id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
      toast.success(`Order #${order.orderNumber} voided.`)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not void this sale')
    } finally {
      setVoidingId(null)
    }
  }

  const staffNames = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()])), [employees])

  const visible = orders.filter((order) => {
    if (paymentFilter !== 'ALL') {
      if (order.status === 'CANCELLED') return false
      if (paymentStatusOf(order) !== paymentFilter) return false
    }
    if (!search.trim()) return true
    const query = search.trim().toLowerCase()
    const customerName = order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}`.trim().toLowerCase() : ''
    return String(order.orderNumber).includes(query)
      || (order.table?.label ?? 'takeaway').toLowerCase().includes(query)
      || customerName.includes(query)
      || (order.customer?.phone ?? '').toLowerCase().includes(query)
  })

  const completedVisible = visible.filter((o) => o.status !== 'CANCELLED')
  const cancelledVisible = visible.filter((o) => o.status === 'CANCELLED')
  const totalSales = completedVisible.reduce((s, o) => s + o.total, 0)
  const totalCollected = completedVisible.reduce((s, o) => s + o.paid, 0)
  const totalOutstanding = completedVisible.reduce((s, o) => s + Math.max(0, o.total - o.paid), 0)

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker={isServices ? 'Service center' : isReception ? 'Reception' : 'Sales'} title={isServices ? 'Service Receipts' : 'Receipts'} />

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard index={0} icon={<LuReceiptText className="size-4" />} label="Sales" value={formatKes(totalSales)} hint={`${completedVisible.length} order${completedVisible.length === 1 ? '' : 's'}`} />
        <StatCard tone="success" icon={<LuWallet className="size-4" />} label="Collected" value={formatKes(totalCollected)} />
        <StatCard tone="warn" icon={<LuWallet className="size-4" />} label="Outstanding" value={formatKes(totalOutstanding)} />
        <StatCard tone="danger" icon={<LuBan className="size-4" />} label="Cancelled" value={String(cancelledVisible.length)} hint={formatKes(cancelledVisible.reduce((s, o) => s + o.total, 0))} />
      </section>

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="border-b p-4">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Sales register</h2>
            <p className="text-xs text-muted-foreground">Every completed sale — plus cancelled orders, kept for the record — with the full breakdown and payment history.</p>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Search
              <span className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, table, or customer…" className="input pl-9 font-normal normal-case tracking-normal" />
              </span>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Payment
              <select aria-label="Filter by payment status" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)} className="input font-normal normal-case tracking-normal">
                <option value="ALL">All payment statuses</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partially paid</option>
                <option value="PAID">Fully paid</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Status
              <select aria-label="Filter by order status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="input font-normal normal-case tracking-normal">
                <option value="ALL">All statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Employee
              <select aria-label="Filter by employee" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input font-normal normal-case tracking-normal">
                <option value="">All employees</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName ?? ''}</option>)}
              </select>
            </label>

            {fixedLocation ? (
              <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Location
                <span className="input flex items-center gap-1.5 font-normal normal-case tracking-normal text-muted-foreground"><LuMapPin className="size-3.5" /> {fixedLocation.name}</span>
              </label>
            ) : pickableLocations.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Location
                <select aria-label="Filter by location" value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="input font-normal normal-case tracking-normal">
                  {assignedLocationCount === 0 && <option value="">All locations</option>}
                  {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}

            {isServices && (
              <label className="flex items-center gap-2 self-end border bg-background px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <input type="checkbox" checked={overridesOnly} onChange={(e) => setOverridesOnly(e.target.checked)} className="size-4 accent-secondary" />
                Price changed only
              </label>
            )}

            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              From
              <span className="relative">
                <LuCalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="input pl-9 font-normal normal-case tracking-normal" />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              To
              <span className="relative">
                <LuCalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="input pl-9 font-normal normal-case tracking-normal" />
              </span>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading receipts…</div>
        ) : visible.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No sales {search.trim() || paymentFilter !== 'ALL' || statusFilter !== 'ALL' || employeeFilter || dateFrom || dateTo ? 'match this view' : 'yet'}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Order</th>
                  <th className={TH}>{isServices ? 'Served by' : 'Table'}</th>
                  <th className={TH}>Customer</th>
                  <th className={TH}>Date</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Paid</th>
                  <th className={cn(TH, 'text-right')}>Total</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((order) => {
                  const badge = badgeFor(order)
                  const owed = Math.max(0, order.total - order.paid)
                  return (
                    <tr key={order.id} className="cursor-pointer align-middle transition even:bg-muted/30 hover:bg-muted/60" onClick={() => setManageId(order.id)}>
                      <td className="px-5 py-3.5 font-semibold">#{order.orderNumber}{order.items.some((i) => i.listPrice) && <span className="mt-1 block"><StatusPill tone="warning">Price changed</StatusPill></span>}</td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {order.table?.label ?? (isServices ? '' : 'Takeaway')}
                        {order.createdBy && staffNames[order.createdBy] && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80"><LuUserRound className="size-3" /> {staffNames[order.createdBy]}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {order.customer ? (
                          <>
                            {order.customer.firstName} {order.customer.lastName ?? ''}
                            {order.customer.phone && <span className="block text-[11px] text-muted-foreground/80">{order.customer.phone}</span>}
                          </>
                        ) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-muted-foreground">{new Date(order.updatedAt).toLocaleString()}</td>
                      <td className="px-5 py-3.5">
                        <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
                        <span className="ml-2 text-xs text-muted-foreground">{order.saleType === 'COMPLIMENTARY' ? (order.complimentaryRecipientName || order.complimentarySession?.title || 'No payment') : [...new Set(order.payments.map((p) => p.paymentMethod.name))].join(', ') || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{order.status === 'CANCELLED' ? '—' : <>{formatKes(order.paid)}{owed > 0.01 && <span className="block text-[11px] font-semibold text-warning">owing {formatKes(owed)}</span>}</>}</td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatKes(order.total)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {order.status !== 'CANCELLED' && owed > 0.01 && (
                            <ActionButton tone="warning" icon={<LuWallet />} title="Take payment" onClick={() => setManageId(order.id)} />
                          )}
                          <ActionButton tone="neutral" icon={<LuPrinter />} title="View / print receipt" onClick={() => setReceiptOrderId(order.id)} />
                          <ActionButton tone="neutral" icon={<LuReceiptText />} title="Manage / request a return" onClick={() => setManageId(order.id)} />
                          {isSuperAdmin && order.status === 'COMPLETED' && (
                            <ActionButton tone="danger" icon={voidingId === order.id ? <LuLoaderCircle className="animate-spin" /> : <LuBan />} title="Void completed sale" onClick={() => void voidSale(order)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
