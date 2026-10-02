import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuClock3,
  LuDownload,
  LuHandCoins,
  LuLoaderCircle,
  LuPackage,
  LuSearch,
  LuTruck,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { packAndUnit } from '@/components/ui/PackQtyInput'
import { cn } from '@/lib/utils'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }
type NameBucket = { key: string; name: string; count: number; value: number; percentOfTotal: number }
type TrendPoint = { date: string; value: number }
type ProductBucket = { productId: string; name: string; sku: string | null; category: string | null; unit: string; packSize: number | null; packLabel: string | null; quantity: number; value: number; count: number; percentOfTotal: number; avgUnitCost: number }
type PaymentStatusBucket = { status: string; count: number; value: number; percentOfTotal: number }
type ReceiptLine = { id: string; receivedAt: string; purchaseNo: string; supplier: string; productName: string; sku: string | null; quantity: number; unit: string; packSize: number | null; packLabel: string | null; unitCost: number; value: number; location: string; recordedBy: string | null }
type AwaitingPurchase = { id: string; purchaseNo: string; supplier: string; status: string; orderDate: string; expectedDate: string | null; outstandingValue: number; lines: { productName: string; outstandingQty: number; unit: string; packSize: number | null; packLabel: string | null }[] }

type PurchasesReportData = {
  range: { period: Period; start: string; end: string }
  cards: {
    totalPurchased: number; receiptsCount: number; lineItemsCount: number
    suppliersCount: number; productsCount: number; avgReceiptValue: number
    outstandingToSuppliers: number; awaitingDeliveryValue: number; awaitingDeliveryCount: number
  }
  trend: TrendPoint[]
  bySupplier: NameBucket[]
  byProduct: ProductBucket[]
  byCategory: NameBucket[]
  byLocation: NameBucket[]
  byPaymentStatus: PaymentStatusBucket[]
  receiptLines: ReceiptLine[]
  awaitingDelivery: AwaitingPurchase[]
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
const qty = (quantity: number, p: { packSize: number | null; packLabel: string | null; unit: string }) => packAndUnit(quantity, p.packSize ?? 0, p.packLabel ?? '', p.unit)
const paymentStatusLabel: Record<string, string> = { UNPAID: 'Unpaid', PARTIAL: 'Partially Paid', PAID: 'Paid' }

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

function downloadCsv(report: PurchasesReportData) {
  const rows = [
    ['Section', 'Date', 'PO', 'Supplier', 'Product', 'SKU', 'Quantity', 'Unit Cost', 'Value', 'Location'],
    ...report.receiptLines.map((l) => ['Receipt', l.receivedAt, l.purchaseNo, l.supplier, l.productName, l.sku ?? '', qty(l.quantity, l), l.unitCost, l.value, l.location]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `purchases-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function PurchasesReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<PurchasesReportData | null>(null)
  const [productSort, setProductSort] = useState<'value' | 'quantity'>('value')
  const [productSearch, setProductSearch] = useState('')
  const [detailTab, setDetailTab] = useState<'receipts' | 'awaiting'>('receipts')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      setReport(await api<PurchasesReportData>(`/reports/purchases?${query}`))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the purchases report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  const sortedProducts = useMemo(() => {
    if (!report) return []
    const needle = productSearch.trim().toLowerCase()
    const filtered = needle ? report.byProduct.filter((p) => p.name.toLowerCase().includes(needle) || p.sku?.toLowerCase().includes(needle)) : report.byProduct
    return [...filtered].sort((a, b) => productSort === 'value' ? b.value - a.value : b.quantity - a.quantity)
  }, [report, productSort, productSearch])

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  const c = report?.cards

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Purchases Report" />

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
        </div>
        <p className="text-[11px] text-muted-foreground">Based on goods actually received (not just ordered) — stock and supplier balances only move once a delivery is recorded. Orders still waiting on delivery show separately, below, as a live snapshot.</p>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report || !c ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="Total Purchased" value={formatKes(c.totalPurchased)} icon={<LuWallet />} hint={`${c.receiptsCount} ${c.receiptsCount === 1 ? 'delivery' : 'deliveries'} received`} />
            <StatCard index={1} label="Suppliers" value={String(c.suppliersCount)} icon={<LuUsers />} hint="Supplied something this period" />
            <StatCard index={2} label="Products Bought" value={String(c.productsCount)} icon={<LuPackage />} hint={`Avg ${formatKes(c.avgReceiptValue)} per delivery`} />
            <StatCard index={3} label="Outstanding to Suppliers" value={formatKes(c.outstandingToSuppliers)} icon={<LuHandCoins />} hint="Live balance owed, not period-scoped" />
          </section>

          <section className="mt-3">
            <PlainStat label="Awaiting Delivery" value={formatKes(c.awaitingDeliveryValue)} meta={`${c.awaitingDeliveryCount} order${c.awaitingDeliveryCount === 1 ? '' : 's'} placed but not fully received yet — live snapshot`} icon={<LuTruck />} />
          </section>

          <ReportSection title="Purchases Trend" note="Value of goods received per day, 5 days either side of the selected period.">
            <div className="h-64 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={report.trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => new Date(String(d)).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <Tooltip formatter={(v) => formatKes(Number(v))} labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-KE', { weekday: 'short', day: '2-digit', month: 'short' })} />
                  <Line type="linear" dataKey="value" stroke="var(--secondary)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Purchases by Supplier" note="Where the money went.">
              <BucketRows rows={report.bySupplier} empty="No deliveries received this period." />
            </ReportSection>
            <ReportSection title="Purchases by Category" note="Product category breakdown.">
              <BucketRows rows={report.byCategory} empty="No deliveries received this period." />
            </ReportSection>
          </div>

          <ReportSection title="Purchases by Product" note="How much of each product was bought this period — search or sort to find a specific one.">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <div className="relative flex-1 min-w-48">
                <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search product or SKU..." className="w-full rounded-sm border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="inline-flex rounded-sm border p-0.5">
                {(['value', 'quantity'] as const).map((s) => (
                  <button key={s} onClick={() => setProductSort(s)} className={cn('rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wide', productSort === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                    Sort by {s === 'value' ? 'Value' : 'Quantity'}
                  </button>
                ))}
              </div>
            </div>
            {sortedProducts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{report.byProduct.length === 0 ? 'No deliveries received this period.' : 'No product matches that search.'}</p>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Quantity Bought</th><th className="px-4 py-2.5 text-right">Avg Unit Cost</th><th className="px-4 py-2.5 text-right">% of Total</th><th className="px-4 py-2.5 text-right">Value</th></tr></thead>
                  <tbody>{sortedProducts.map((p) => (
                    <tr key={p.productId} className="border-t">
                      <td className="px-4 py-3"><span className="font-semibold">{p.name}</span><span className="block text-xs text-muted-foreground">{p.sku ?? 'No SKU'}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.category ?? '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{qty(p.quantity, p)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatKes(p.avgUnitCost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.percentOfTotal.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(p.value)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Purchases by Location" note="Where deliveries landed.">
              <BucketRows rows={report.byLocation} empty="No deliveries received this period." />
            </ReportSection>
            <ReportSection title="Purchases by Payment Status" note="Bucketed by purchase order, not by line — a part-paid PO counts once.">
              {report.byPaymentStatus.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No deliveries received this period.</p> : (
                <SimpleRows rows={report.byPaymentStatus.map((s) => ({ key: s.status, title: paymentStatusLabel[s.status] ?? s.status, meta: `${s.count} order${s.count === 1 ? '' : 's'} - ${s.percentOfTotal.toFixed(1)}%`, value: formatKes(s.value) }))} empty="" />
              )}
            </ReportSection>
          </div>

          <ReportSection title="Detail" note="Every delivery received, plus orders still waiting on one.">
            <div className="flex flex-wrap gap-1 border-b p-2">
              <button onClick={() => setDetailTab('receipts')} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold', detailTab === 'receipts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>Received ({report.receiptLines.length})</button>
              <button onClick={() => setDetailTab('awaiting')} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold', detailTab === 'awaiting' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>Awaiting Delivery ({report.awaitingDelivery.length})</button>
            </div>

            {detailTab === 'receipts' && (
              report.receiptLines.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No deliveries received this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Received</th><th className="px-4 py-2.5">PO</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5 text-right">Unit Cost</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5 text-right">Value</th></tr></thead>
                    <tbody>{report.receiptLines.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(l.receivedAt)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{l.purchaseNo}</td>
                        <td className="px-4 py-3 font-semibold">{l.supplier}</td>
                        <td className="px-4 py-3"><span className="font-semibold">{l.productName}</span><span className="block text-xs text-muted-foreground">{l.sku ?? 'No SKU'}</span></td>
                        <td className="px-4 py-3 text-right tabular-nums">{qty(l.quantity, l)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatKes(l.unitCost)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{l.location}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{l.recordedBy ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(l.value)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )
            )}

            {detailTab === 'awaiting' && (
              report.awaitingDelivery.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing outstanding — every order has been fully received.</p> : (
                <div className="divide-y">
                  {report.awaitingDelivery.map((p) => (
                    <div key={p.id} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold">{p.purchaseNo} — {p.supplier}</p>
                          <p className="text-xs text-muted-foreground">
                            <LuClock3 className="mr-1 inline size-3" />Ordered {dateOnly(p.orderDate)}{p.expectedDate ? ` - expected ${dateOnly(p.expectedDate)}` : ''} - {paymentStatusLabel[p.status] ?? p.status}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{formatKes(p.outstandingValue)}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{p.lines.map((l) => `${qty(l.outstandingQty, l)} ${l.productName}`).join(', ')}</p>
                    </div>
                  ))}
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
        <div key={r.key} className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.count} delivery{r.count === 1 ? '' : ' lines'} - {r.percentOfTotal.toFixed(1)}%</p></div>
            <span className="shrink-0 font-semibold tabular-nums">{formatKes(r.value)}</span>
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
