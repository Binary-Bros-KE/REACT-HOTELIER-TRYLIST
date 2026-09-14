import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBox, LuCircleAlert, LuLoaderCircle, LuPackageX, LuTriangleAlert, LuWallet } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import StatCard from '@/components/ui/StatCard'
import { cn } from '@/lib/utils'
import { packAndUnit } from '@/components/ui/PackQtyInput'

type Location = { id: string; name: string }
type CategoryBucket = { category: string; units: number; value: number; percent: number }
type StockProduct = {
  productId: string
  name: string
  sku: string | null
  category: string | null
  quantity: number
  unit: string
  unitCost: number
  packSize: number | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
  value: number
  low: boolean
  out: boolean
}
type Summary = { totalProducts: number; totalUnits: number; lowStockCount: number; outOfStockCount: number; stockValue: number; byCategory: CategoryBucket[] }
type LocationOverview = Summary & { locationId: string; name: string; products: StockProduct[] }
type Overview = { mode: 'live' | 'asOf'; asOfDate: string; overall: Summary; locations: LocationOverview[] }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
const stockQty = (product: StockProduct) => packAndUnit(product.quantity, Number(product.packSize) || 0, product.packLabel ?? '', product.packUnit?.name ?? product.unit)
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const CHART_COLORS = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#0891b2', '#7c3aed', '#dc2626', '#65a30d']

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function InventoryOverview() {
  const toast = useToast()
  const [tab, setTab] = useState<'live' | 'asOf'>('live')
  const [asOfDate, setAsOfDate] = useState(toLocalIso(new Date()))
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [locationFilter, setLocationFilter] = useState<Record<string, 'ALL' | 'LOW_OUT'>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (tab === 'asOf') query.set('asOfDate', asOfDate)
      if (locationId) query.set('locationId', locationId)
      const response = await api<Overview>(`/reports/inventory-overview?${query}`)
      setOverview(response)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the inventory report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [tab, asOfDate, locationId, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  const maxCategoryValue = useMemo(() => Math.max(1, ...(overview?.overall.byCategory.map((c) => c.value) ?? [1])), [overview])

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Reports</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Inventory Report</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Stock on hand, low and out-of-stock alerts, stock value, and a per-location breakdown.</p>
        </div>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </header>

      <div className="mt-6 flex items-center gap-1 rounded-sm border bg-card p-1 shadow-sm sm:w-fit">
        {(['live', 'asOf'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('rounded-sm px-4 py-1.5 text-sm font-semibold', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {t === 'live' ? 'Live' : 'As Of Date'}
          </button>
        ))}
        {tab === 'asOf' && (
          <input type="date" value={asOfDate} max={toLocalIso(new Date())} onChange={(e) => setAsOfDate(e.target.value)} className="ml-1 rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        )}
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !overview ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report…</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="Total products" value={overview.overall.totalProducts.toLocaleString()} icon={<LuBox />} hint="Distinct products with stock, across every location" />
            <StatCard index={1} label="Total units on hand" value={overview.overall.totalUnits.toLocaleString()} icon={<LuWallet />} hint="Every unit, everywhere it's held" />
            <StatCard label="Low stock" value={overview.overall.lowStockCount.toLocaleString()} icon={<LuTriangleAlert />} tone={overview.overall.lowStockCount > 0 ? 'warn' : undefined} hint="At or below reorder level, anywhere" />
            <StatCard label="Out of stock" value={overview.overall.outOfStockCount.toLocaleString()} icon={<LuPackageX />} tone={overview.overall.outOfStockCount > 0 ? 'danger' : undefined} hint="Zero on hand, anywhere" />
          </section>

          <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="border-b p-4"><h2 className="font-semibold">Stock value by category</h2></header>
            {overview.overall.byCategory.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No stock on hand.</p>
            ) : (
              <>
                <div className="space-y-2 p-4">
                  {overview.overall.byCategory.map((c, i) => (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm">{c.category}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div className="h-full rounded-sm" style={{ width: `${Math.max(2, (c.value / maxCategoryValue) * 100)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-sm tabular-nums">{formatKes(c.value)}</span>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Units</th><th className="px-4 py-2.5 text-right">Value</th><th className="px-4 py-2.5 text-right">% of total</th></tr>
                    </thead>
                    <tbody>
                      {overview.overall.byCategory.map((c) => (
                        <tr key={c.category} className="border-t">
                          <td className="px-4 py-3">{c.category}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.units.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(c.value)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <div className="mt-6 space-y-6">
            {overview.locations.map((loc) => {
              const filter = locationFilter[loc.locationId] ?? 'ALL'
              const rows = filter === 'ALL' ? loc.products : loc.products.filter((p) => p.low || p.out)
              return (
                <section key={loc.locationId} className="overflow-hidden rounded-sm border bg-card shadow-sm">
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <h2 className="font-semibold">{loc.name}</h2>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span><span className="font-semibold text-foreground">{loc.totalProducts}</span> products</span>
                      <span className={cn(loc.lowStockCount > 0 && 'font-semibold text-warning')}>{loc.lowStockCount} low stock</span>
                      <span className={cn(loc.outOfStockCount > 0 && 'font-semibold text-destructive')}>{loc.outOfStockCount} out of stock</span>
                      <span>Stock value <span className="font-semibold text-foreground">{formatKes(loc.stockValue)}</span></span>
                    </div>
                  </header>
                  <div className="flex gap-1 border-b p-2">
                    {(['ALL', 'LOW_OUT'] as const).map((f) => (
                      <button key={f} onClick={() => setLocationFilter((s) => ({ ...s, [loc.locationId]: f }))} className={cn('rounded-sm px-3 py-1 text-xs font-semibold', filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                        {f === 'ALL' ? 'All' : 'Low / out of stock'}
                      </button>
                    ))}
                  </div>
                  {rows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">{filter === 'ALL' ? 'No stock at this location.' : 'Nothing low or out of stock here.'}</p>
                  ) : (
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-muted/90 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                          <tr>
                            <th className="px-4 py-2.5">Product</th>
                            <th className="px-4 py-2.5">SKU</th>
                            <th className="px-4 py-2.5">Category</th>
                            <th className="px-4 py-2.5 text-right">Qty</th>
                            <th className="px-4 py-2.5 text-right">Unit cost</th>
                            <th className="px-4 py-2.5 text-right">Value</th>
                            <th className="px-4 py-2.5 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((p) => (
                            <tr key={p.productId} className={cn('border-t', p.out && 'bg-destructive/5')}>
                              <td className="px-4 py-3">{p.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{p.sku ?? '—'}</td>
                              <td className="px-4 py-3 text-muted-foreground">{p.category ?? '—'}</td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                <span className={cn(p.out && 'font-semibold text-destructive')}>{stockQty(p)}</span>
                                {p.out && <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive">Out of stock</span>}
                                {!p.out && p.low && <span className="ml-1.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">Low</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatKes(p.unitCost)}</td>
                              <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', p.out && 'text-destructive')}>{formatKes(p.value)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{loc.stockValue > 0 ? ((p.value / loc.stockValue) * 100).toFixed(1) : '0.0'}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
