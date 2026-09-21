import { useCallback, useEffect, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuCircleAlert, LuLoaderCircle } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Location = { id: string; name: string }
type ProductRow = { productId: string; name: string; sku: string | null; category: string | null; qty: number; revenue: number; profit: number; margin: number; lastSoldAt: string | null }
type ProductsOverview = {
  range: { from: string; to: string }
  bestSelling: { byQuantity: ProductRow[]; byRevenue: ProductRow[]; byProfit: ProductRow[] }
  slowest: ProductRow[]
}
type Period = 'day' | 'week' | 'month' | 'year' | 'custom'
type SortBy = 'qty' | 'revenue' | 'profit'

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function rangeFor(period: Period, anchor: Date, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  const from = new Date(anchor)
  const to = new Date(anchor)
  if (period === 'day') {
    return { from: toLocalIso(anchor), to: toLocalIso(anchor), label: anchor.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) }
  }
  if (period === 'week') {
    const day = (anchor.getDay() + 6) % 7 // 0=Mon
    from.setDate(anchor.getDate() - day)
    to.setDate(from.getDate() + 6)
    return { from: toLocalIso(from), to: toLocalIso(to), label: `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` }
  }
  if (period === 'year') {
    return { from: `${anchor.getFullYear()}-01-01`, to: `${anchor.getFullYear()}-12-31`, label: String(anchor.getFullYear()) }
  }
  if (period === 'custom') {
    return { from: customFrom || toLocalIso(anchor), to: customTo || toLocalIso(anchor), label: 'Custom range' }
  }
  // month
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  return { from: toLocalIso(first), to: toLocalIso(last), label: anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
}

function shiftAnchor(period: Period, anchor: Date, delta: number): Date {
  const next = new Date(anchor)
  if (period === 'day') next.setDate(next.getDate() + delta)
  else if (period === 'week') next.setDate(next.getDate() + delta * 7)
  else if (period === 'year') next.setFullYear(next.getFullYear() + delta)
  else next.setMonth(next.getMonth() + delta)
  return next
}

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function ProductsReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [customFrom, setCustomFrom] = useState(toLocalIso(new Date()))
  const [customTo, setCustomTo] = useState(toLocalIso(new Date()))
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('qty')
  const [show, setShow] = useState(20)
  const [overview, setOverview] = useState<ProductsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { from, to, label } = rangeFor(period, anchor, customFrom, customTo)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ from, to, limit: String(show) })
      if (locationId) query.set('locationId', locationId)
      const response = await api<ProductsOverview>(`/reports/products-overview?${query}`)
      setOverview(response)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the products report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, locationId, show, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  const bestSelling = overview ? (sortBy === 'qty' ? overview.bestSelling.byQuantity : sortBy === 'revenue' ? overview.bestSelling.byRevenue : overview.bestSelling.byProfit) : []

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Products Report" />

      <div className="mt-6 flex flex-col gap-3 rounded-sm border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-sm bg-muted/50 p-1">
          {(['day', 'week', 'month', 'year', 'custom'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide', period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {p}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-sm text-muted-foreground">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous" onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))} />
            <span className="min-w-40 text-center text-sm font-semibold">{label}</span>
            <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next" onClick={() => setAnchor((a) => shiftAnchor(period, a, 1))} />
          </div>
        )}
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !overview ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report…</div>
      ) : (
        <>
          <section className="mt-7 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-l-4 border-l-accent p-4">
              <h2 className="font-display text-lg font-semibold leading-tight">Best selling products</h2>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Show
                  <input type="number" min={1} max={100} value={show} onChange={(e) => setShow(Number(e.target.value) || 20)} className="w-16 rounded-sm border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </label>
                <div className="flex items-center gap-1 rounded-sm bg-muted/50 p-1">
                  {([['qty', 'By quantity'], ['revenue', 'By revenue'], ['profit', 'By profit']] as const).map(([value, l]) => (
                    <button key={value} onClick={() => setSortBy(value)} className={cn('rounded-sm px-3 py-1 text-xs font-semibold', sortBy === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l}</button>
                  ))}
                </div>
              </div>
            </header>
            {bestSelling.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                    <tr>
                      <th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">SKU</th><th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right">Qty sold</th><th className="px-4 py-2.5 text-right">Revenue</th><th className="px-4 py-2.5 text-right">Profit</th><th className="px-4 py-2.5 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestSelling.map((p, i) => (
                      <tr key={p.productId} className="border-t">
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.sku ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.category ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.qty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatKes(p.revenue)}</td>
                        <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', p.profit >= 0 ? 'text-success' : 'text-destructive')}>{formatKes(p.profit)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{p.margin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="border-b border-l-4 border-l-accent p-4">
              <h2 className="font-display text-lg font-semibold leading-tight">Slowest moving products</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Fewest units sold in this period first — includes products with zero sales entirely.</p>
            </header>
            {overview.slowest.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No products yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">SKU</th><th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right">Qty sold (period)</th><th className="px-4 py-2.5 text-right">Revenue (period)</th><th className="px-4 py-2.5">Last sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.slowest.map((p) => (
                      <tr key={p.productId} className="border-t">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.sku ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.category ?? '—'}</td>
                        <td className={cn('px-4 py-3 text-right tabular-nums', p.qty === 0 && 'font-semibold text-destructive')}>{p.qty.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatKes(p.revenue)}</td>
                        <td className="px-4 py-3">{p.lastSoldAt ? new Date(p.lastSoldAt).toLocaleDateString() : <span className="font-semibold text-destructive">Never sold</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
