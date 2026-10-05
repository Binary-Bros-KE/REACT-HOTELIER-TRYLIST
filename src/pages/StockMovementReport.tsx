import { useCallback, useEffect, useMemo, useState } from 'react'
import { downloadCsvRows } from '@/lib/csv'
import { LuCalendarDays, LuChevronLeft, LuChevronRight, LuCircleAlert, LuDownload, LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { packAndUnit } from '@/components/ui/PackQtyInput'
import { cn } from '@/lib/utils'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportDocData } from '@/components/documents/pdf'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }
type SummaryRow = {
  productId: string; name: string; sku: string | null; unit: string; packSize: number | null; packLabel: string | null
  locationId: string; locationName: string; opening: number; received: number; issued: number; adjustments: number; net: number; closing: number; reconciles: boolean; movements: number
}
type MovementRow = {
  id: string; occurredAt: string; productName: string; sku: string | null; unit: string; packSize: number | null; packLabel: string | null
  locationName: string; type: string; quantity: number; balanceAfter: number | null; note: string | null; by: string | null
}
type StockReport = {
  range: { period: Period; start: string; end: string }
  cards: { products: number; locations: number; movements: number; unreconciled: number }
  rows: SummaryRow[]
  movements: MovementRow[]
}

const TYPE_LABEL: Record<string, string> = {
  OPENING_STOCK: 'Opening stock', PURCHASE: 'Purchase', SALE: 'Sale', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Transfer out', ISSUE: 'Issued', USAGE: 'Used (counted)',
  RETURN: 'Return', DAMAGE_LOSS: 'Damage / loss', ADJUSTMENT: 'Adjustment', ROOM_CONSUMPTION: 'Room use',
  BORROWED_IN: 'Borrowed in', RETURNED_BORROWED_STOCK: 'Borrowed returned', LENT_OUT: 'Lent out', LOAN_RETURNED: 'Loan returned',
}

const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const signed = (qty: number, p: { packSize: number | null; packLabel: string | null; unit: string }) => {
  const text = packAndUnit(Math.abs(qty), p.packSize ?? 0, p.packLabel ?? '', p.unit)
  return qty > 0 ? `+${text}` : qty < 0 ? `−${text}` : text
}
const plain = (qty: number, p: { packSize: number | null; packLabel: string | null; unit: string }) => packAndUnit(qty, p.packSize ?? 0, p.packLabel ?? '', p.unit)

function stepAnchor(period: Exclude<Period, 'custom'>, iso: string, dir: 1 | -1) {
  const d = new Date(`${iso}T00:00:00`)
  if (period === 'day') d.setDate(d.getDate() + dir)
  else if (period === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  return toLocalIso(d)
}

function rangeLabel(period: Period, startIso: string, endIso: string) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (period === 'day') return s.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${s.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} - ${e.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function downloadCsv(report: StockReport) {
  const rows = [
    ['Product', 'SKU', 'Location', 'Opening', 'Received', 'Issued', 'Adjustments', 'Net change', 'Closing', 'Reconciles'],
    ...report.rows.map((r) => [r.name, r.sku ?? '', r.locationName, plain(r.opening, r), plain(r.received, r), plain(r.issued, r), plain(r.adjustments, r), plain(r.net, r), plain(r.closing, r), r.reconciles ? 'yes' : 'NO']),
  ]
  downloadCsvRows('stock-movement-summary', rows)
}

function buildReportDoc(report: StockReport): ReportDocData {
  return {
    reportTitle: 'Stock Movement Summary',
    kicker: 'Reports',
    rangeLabel: rangeLabel(report.range.period, report.range.start, report.range.end),
    generatedAt: new Date().toISOString(),
    cards: [
      { label: 'Products', value: String(report.cards.products) },
      { label: 'Movements', value: String(report.cards.movements) },
      { label: 'Locations', value: String(report.cards.locations) },
      ...(report.cards.unreconciled > 0 ? [{ label: 'Needs checking', value: String(report.cards.unreconciled), hint: 'Rows whose opening + net change does not equal closing' }] : []),
    ],
    sections: [
      {
        title: 'Stock by product and location',
        note: 'Opening + received − issued + adjustments = closing.',
        columns: [
          { label: 'Product' }, { label: 'Location' }, { label: 'Opening', align: 'right' }, { label: 'Received', align: 'right' },
          { label: 'Issued', align: 'right' }, { label: 'Adjust.', align: 'right' }, { label: 'Net change', align: 'right' }, { label: 'Closing', align: 'right' },
        ],
        rows: report.rows.map((r) => [r.name, r.locationName, plain(r.opening, r), plain(r.received, r), plain(r.issued, r), plain(r.adjustments, r), signed(r.net, r), plain(r.closing, r)]),
      },
    ],
  }
}

export default function StockMovementReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('day')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<StockReport | null>(null)
  const [tab, setTab] = useState<'summary' | 'movements'>('summary')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      setReport(await api<StockReport>(`/reports/stock-movements?${query}`))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the stock movement summary'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  const needle = search.trim().toLowerCase()
  const rows = useMemo(() => (report?.rows ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.sku ?? '').toLowerCase().includes(needle)), [report, needle])
  const movements = useMemo(() => (report?.movements ?? []).filter((m) => !needle || m.productName.toLowerCase().includes(needle)), [report, needle])

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Stock Movement Summary" />

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
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuDownload />} disabled={!report || loading} onClick={() => report && downloadCsv(report)}>Export CSV</ActionButton>
          <PrintReportButton data={report ? buildReportDoc(report) : null} disabled={loading} />
        </div>
        <p className="text-[11px] text-muted-foreground">Opening is the stock at the start of the period, closing is at the end. Received, issued and adjustments are the movements in between, so opening + net change = closing.</p>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="Products moved" value={String(report.cards.products)} hint={`${report.cards.locations} location(s)`} />
            <StatCard index={1} label="Movements" value={String(report.cards.movements)} />
            <StatCard index={2} label="Locations" value={String(report.cards.locations)} />
            <StatCard index={3} label="Needs checking" value={String(report.cards.unreconciled)} tone={report.cards.unreconciled > 0 ? 'warn' : undefined} hint="Rows that don't add up" />
          </section>

          <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-l-4 border-l-accent p-4">
              <div>
                <h2 className="font-display text-lg font-semibold leading-tight">{rangeLabel(report.range.period, report.range.start, report.range.end)}</h2>
                <p className="text-xs text-muted-foreground">Only products that moved in the period are listed.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product..." className="rounded-sm border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="inline-flex rounded-sm border p-0.5">
                  {(['summary', 'movements'] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                      {t === 'summary' ? 'Summary' : 'Movements'}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {tab === 'summary' ? (
              rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No stock movements in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5 text-right">Opening</th><th className="px-4 py-2.5 text-right">Received</th><th className="px-4 py-2.5 text-right">Issued</th>
                        <th className="px-4 py-2.5 text-right">Adjust.</th><th className="px-4 py-2.5 text-right">Net change</th><th className="px-4 py-2.5 text-right">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={`${r.productId}|${r.locationId}`} className={cn('border-t', !r.reconciles && 'bg-warning/10')}>
                          <td className="px-4 py-3"><span className="font-semibold">{r.name}</span><span className="block text-xs text-muted-foreground">{r.sku ?? 'No SKU'}{r.reconciles ? '' : ' · does not add up'}</span></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{r.locationName}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{plain(r.opening, r)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-success">{r.received ? signed(r.received, r) : '-'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-destructive">{r.issued ? signed(r.issued, r) : '-'}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{r.adjustments ? signed(r.adjustments, r) : '-'}</td>
                          <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', r.net < 0 ? 'text-destructive' : r.net > 0 ? 'text-success' : '')}>{signed(r.net, r)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">{plain(r.closing, r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              movements.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No movements in this period.</p> : (
                <div className="max-h-[32rem] overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                      <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5 text-right">Balance after</th><th className="px-4 py-2.5">By</th></tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{dateTime(m.occurredAt)}</td>
                          <td className="px-4 py-2.5 font-medium">{m.productName}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.locationName}</td>
                          <td className="px-4 py-2.5 text-xs">{TYPE_LABEL[m.type] ?? m.type}{m.note ? <span className="block text-muted-foreground">{m.note}</span> : null}</td>
                          <td className={cn('px-4 py-2.5 text-right tabular-nums', m.quantity < 0 ? 'text-destructive' : 'text-success')}>{signed(m.quantity, m)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{m.balanceAfter == null ? '-' : plain(m.balanceAfter, m)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.by ?? 'System'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </section>
        </>
      )}
    </div>
  )
}
