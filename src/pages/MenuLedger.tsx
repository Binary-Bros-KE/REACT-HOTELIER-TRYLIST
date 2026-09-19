import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuCircleAlert, LuGift, LuLoaderCircle, LuSearch, LuUndo2, LuUtensils } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import StatCard from '@/components/ui/StatCard'
import { cn } from '@/lib/utils'

type EntryType = 'SALE' | 'COMPLIMENTARY' | 'RETURN'

const TYPE_META: Record<EntryType, { label: string; className: string }> = {
  SALE: { label: 'Sale', className: 'border-success/40 text-success' },
  COMPLIMENTARY: { label: 'Complimentary', className: 'border-amber-500/50 text-amber-600' },
  RETURN: { label: 'Return', className: 'border-destructive/40 text-destructive' },
}
const TABS: ('ALL' | EntryType)[] = ['ALL', 'SALE', 'COMPLIMENTARY', 'RETURN']

type Entry = {
  id: string
  type: EntryType
  itemName: string
  variantName: string | null
  addonsNote: string | null
  quantity: number
  unitPrice: string
  amount: string
  orderNumber: number
  locationName: string | null
  note: string | null
  performedByName: string | null
  occurredAt: string
}
type Summary = { sold: number; soldAmount: number; complimentary: number; complimentaryAmount: number; returned: number; returnedAmount: number }
type Pagination = { page: number; pageSize: number; total: number; pages: number }
type Location = { id: string; name: string }

const money = (v: number) => `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i)

/** What was actually SOLD at menu level (a pizza, a cocktail) — the stock
 * ledger next door shows the ingredients those sales consumed. */
export default function MenuLedgerPanel() {
  const toast = useToast()
  const [entries, setEntries] = useState<Entry[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, pages: 1 })
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tab, setTab] = useState<'ALL' | EntryType>('ALL')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState(String(THIS_YEAR))
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
      const res = await api<{ entries: Entry[]; summary: Summary; pagination: Pagination }>(`/menu-ledger?${q}`)
      setEntries(res.entries)
      setSummary(res.summary)
      setPagination(res.pagination)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the menu ledger'
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

  if (!hasApiTenant()) return <div className="px-6 py-16 text-center text-sm text-muted-foreground">Workspace not resolved yet.</div>

  const fieldClass = 'mt-1.5 w-full rounded-sm border bg-background px-3 py-2.5 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring'
  return (
    <div>
      <p className="mt-1 text-sm text-muted-foreground">Every menu item actually sold, given away, or returned — the dish or drink itself, not the ingredients it used up. Recorded when an order is served.</p>

      {summary && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatCard tone="success" icon={<LuUtensils className="size-4" />} label="Sold" value={String(summary.sold)} hint={money(summary.soldAmount)} />
          <StatCard tone="warn" icon={<LuGift className="size-4" />} label="Complimentary" value={String(summary.complimentary)} hint={money(summary.complimentaryAmount)} />
          <StatCard tone="danger" icon={<LuUndo2 className="size-4" />} label="Returned" value={String(summary.returned)} hint={money(summary.returnedAmount)} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('rounded-t-sm px-3 py-2 text-sm font-semibold transition', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            {t === 'ALL' ? 'All' : TYPE_META[t].label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Search
          <span className="relative mt-1.5 block">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name or order #…" className="w-full rounded-sm border bg-background py-2.5 pl-9 pr-3 text-sm font-normal normal-case outline-none focus:ring-2 focus:ring-ring" />
          </span>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)} disabled={Boolean(from || to)} className={cn(fieldClass, 'disabled:opacity-50')}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} /></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Storefront
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={fieldClass}>
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-5 overflow-hidden rounded-sm border bg-card shadow-sm">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading ledger…</div>
        ) : entries.length === 0 ? (
          <div className="min-h-72 p-16 text-center text-sm text-muted-foreground">No menu sales match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Menu item</th>
                  <th className="px-4 py-3">Storefront</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t align-top transition hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(e.occurredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <span className="block">{new Date(e.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{e.itemName}{e.variantName ? ` — ${e.variantName}` : ''}</p>
                      {(e.addonsNote || e.note) && <p className="text-xs text-muted-foreground">{[e.addonsNote && `+ ${e.addonsNote}`, e.note].filter(Boolean).join(' · ')}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.locationName ?? '—'}</td>
                    <td className="px-4 py-3"><span className={cn('inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold', TYPE_META[e.type].className)}>{TYPE_META[e.type].label}</span></td>
                    <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', e.quantity > 0 ? 'text-success' : 'text-destructive')}>{e.quantity > 0 ? '+' : ''}{e.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{money(Number(e.unitPrice))}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(Number(e.amount))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">#{e.orderNumber}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{e.performedByName ?? '—'}</td>
                  </tr>
                ))}
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
