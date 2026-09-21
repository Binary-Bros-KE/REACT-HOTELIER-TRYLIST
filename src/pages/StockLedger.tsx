import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { packAndUnit } from '@/components/ui/PackQtyInput'
import MenuLedgerPanel from '@/pages/MenuLedger'
import PageBanner from '@/components/ui/PageBanner'

type MoveType =
  | 'OPENING_STOCK' | 'PURCHASE' | 'SALE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RETURN'
  | 'DAMAGE_LOSS' | 'ADJUSTMENT' | 'BORROWED_IN' | 'RETURNED_BORROWED_STOCK' | 'LENT_OUT' | 'LOAN_RETURNED'

const TYPE_META: Record<MoveType, { label: string; className: string }> = {
  PURCHASE: { label: 'Purchase', className: 'border-secondary/40 text-secondary' },
  SALE: { label: 'Sale', className: 'border-destructive/40 text-destructive' },
  TRANSFER_IN: { label: 'Transfer In', className: 'border-success/40 text-success' },
  TRANSFER_OUT: { label: 'Transfer Out', className: 'border-amber-500/50 text-amber-600' },
  RETURN: { label: 'Return', className: 'border-indigo-400/50 text-indigo-500' },
  DAMAGE_LOSS: { label: 'Damage / Loss', className: 'border-destructive/40 text-destructive' },
  ADJUSTMENT: { label: 'Adjustment', className: 'border-border text-muted-foreground' },
  OPENING_STOCK: { label: 'Opening Stock', className: 'border-success/40 text-success' },
  BORROWED_IN: { label: 'Borrowed In', className: 'border-secondary/40 text-secondary' },
  RETURNED_BORROWED_STOCK: { label: 'Returned Borrowed Stock', className: 'border-amber-500/50 text-amber-600' },
  LENT_OUT: { label: 'Lent Out', className: 'border-amber-500/50 text-amber-600' },
  LOAN_RETURNED: { label: 'Loan Returned', className: 'border-success/40 text-success' },
}

// Borrow/lend movement types exist in the schema but have no writers yet, so
// they're left out of the filter tabs until that module lands.
const TABS: ('ALL' | MoveType)[] = [
  'ALL', 'PURCHASE', 'SALE', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN', 'DAMAGE_LOSS',
  'ADJUSTMENT', 'OPENING_STOCK',
]

type Entry = {
  id: string
  type: MoveType
  quantity: string
  balanceBefore: string | null
  balanceAfter: string | null
  value: string | null
  note: string | null
  occurredAt: string
  product: { id: string; name: string; sku: string | null; unit: string; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }
  location: { id: string; name: string }
  employee: { id: string; firstName: string; lastName: string } | null
}
type Pagination = { page: number; pageSize: number; total: number; pages: number }
type Location = { id: string; name: string }

const num = (v: string | null) => (v == null ? null : Number(v))
const stockQty = (value: number, product: Entry['product']) => packAndUnit(value, Number(product.packSize) || 0, product.packLabel ?? '', product.packUnit?.name ?? product.unit)
const money = (v: number) => `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i)

function StockMovementsPanel() {
  const toast = useToast()
  const [entries, setEntries] = useState<Entry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, pages: 1 })
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tab, setTab] = useState<'ALL' | MoveType>('ALL')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState<string>(String(THIS_YEAR))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [locationId, setLocationId] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [tab, search, year, from, to, locationId])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams()
      if (tab !== 'ALL') q.set('type', tab)
      if (search.trim()) q.set('search', search.trim())
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      if (!from && !to && year) q.set('year', year)
      if (locationId) q.set('locationId', locationId)
      q.set('page', String(page))
      q.set('pageSize', '50')
      const res = await api<{ entries: Entry[]; pagination: Pagination }>(`/stock-ledger?${q}`)
      setEntries(res.entries)
      setPagination(res.pagination)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the stock ledger'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [tab, search, year, from, to, locationId, page, toast])

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t) }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  const rangeLabel = useMemo(() => {
    if (!pagination.total) return '0'
    const start = (pagination.page - 1) * pagination.pageSize + 1
    const end = Math.min(pagination.total, pagination.page * pagination.pageSize)
    return `${start}–${end} of ${pagination.total.toLocaleString()}`
  }, [pagination])

  if (!hasApiTenant()) {
    return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
  }

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-t-sm px-3 py-2 text-sm font-semibold transition',
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t === 'ALL' ? 'All' : TYPE_META[t].label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Search
          <span className="relative mt-1.5 block">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product…" className="w-full rounded-sm border bg-background py-2.5 pl-9 pr-3 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring" />
          </span>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)} disabled={Boolean(from || to)} className="mt-1.5 w-full rounded-sm border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring disabled:opacity-50">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1.5 w-full rounded-sm border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 w-full rounded-sm border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Storefront
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="mt-1.5 w-full rounded-sm border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>
      )}

      <section className="mt-5 overflow-hidden rounded-sm border bg-card shadow-sm">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading ledger…</div>
        ) : entries.length === 0 ? (
          <div className="min-h-72 p-16 text-center text-sm text-muted-foreground">No stock movements match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Storefront</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">Stock Before</th>
                  <th className="px-4 py-3 text-right">Stock After</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const change = Number(e.quantity)
                  const before = num(e.balanceBefore)
                  const after = num(e.balanceAfter)
                  return (
                    <tr key={e.id} className="border-t align-top transition hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {new Date(e.occurredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <span className="block">{new Date(e.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{e.product.name}</p>
                        <p className="text-xs text-muted-foreground">{e.product.sku ?? e.product.unit}{e.note ? ` · ${e.note}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.location.name}</td>
                      <td className="px-4 py-3">
                        <span className={cn('keep-round inline-block whitespace-nowrap rounded-full border border-dashed px-2 py-0.5 text-[11px] font-semibold', TYPE_META[e.type].className)}>
                          {TYPE_META[e.type].label}
                        </span>
                      </td>
                      <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {change > 0 ? '+' : ''}{stockQty(change, e.product)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{before == null ? '—' : stockQty(before, e.product)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{after == null ? '—' : stockQty(after, e.product)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.value == null ? '—' : money(Number(e.value))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{e.employee ? `${e.employee.firstName} ${e.employee.lastName}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>{rangeLabel}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1} className="rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">Previous</button>
              <span className="px-2 text-xs tabular-nums">Page {pagination.page} / {pagination.pages}</span>
              <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={pagination.page >= pagination.pages} className="rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// Two ledgers, one page: what was sold at menu level (a pizza), and what that
// did to stock (flour, oil, cheese).
export default function StockLedger() {
  const [view, setView] = useState<'STOCK' | 'MENU'>('STOCK')
  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title={view === 'STOCK' ? 'Stock Ledger' : 'Menu Ledger'} />
      <div className="mb-6 mt-6 inline-flex border">
        {([['STOCK', 'Stock Ledger'], ['MENU', 'Menu Ledger']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} className={cn('px-4 py-2 text-xs font-bold uppercase tracking-wider transition', view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
        ))}
      </div>
      {view === 'STOCK' ? <StockMovementsPanel /> : <MenuLedgerPanel />}
    </div>
  )
}
