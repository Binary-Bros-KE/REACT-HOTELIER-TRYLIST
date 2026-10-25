import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { LuCalendarDays, LuChevronLeft, LuChevronRight, LuCircleAlert, LuDownload, LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api } from '@/lib/api'
import { downloadCsvRows } from '@/lib/csv'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { packAndUnit } from '@/components/ui/PackQtyInput'
import { cn } from '@/lib/utils'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportDocData } from '@/components/documents/pdf'

// Stock take for one location over a period: every product carried there, by
// category, with opening, added (anything that increased stock), sold (anything
// that decreased it), net change and closing - plus every movement. Shown inside
// that location's card on the Inventory Report. Server: GET /reports/stock-movements
// with allProducts=true.

type Period = 'day' | 'week' | 'month' | 'custom'
type SummaryRow = {
  productId: string; name: string; sku: string | null; category: string | null; unit: string; packSize: number | null; packLabel: string | null
  locationId: string; locationName: string; opening: number; received: number; issued: number; adjustments: number
  added: number; removed: number; net: number; closing: number; reconciles: boolean; movements: number
  // Closing stock at the product's unit cost.
  value: number
}
type MovementRow = {
  id: string; occurredAt: string; productName: string; sku: string | null; unit: string; packSize: number | null; packLabel: string | null
  locationName: string; type: string; quantity: number; balanceAfter: number | null; note: string | null; by: string | null
}
type StockReport = {
  range: { period: Period; start: string; end: string }
  cards: { products: number; listed?: number; stockValue?: number; locations: number; movements: number; unreconciled: number }
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

// Stock take figures: a number in the product's own unit (packs when it's tracked in packs),
// with the unit in its own UOM column; "-" for nothing.
const kes = (v: number) => `KSh ${v.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`
const inUnit = (qty: number, p: { packSize: number | null }) => +((p.packSize && p.packSize > 0 ? qty / p.packSize : qty).toFixed(3))
const uom = (p: { packSize: number | null; packLabel: string | null; unit: string }) => (p.packSize && p.packSize > 0 ? p.packLabel || 'pack' : p.unit)
const num = (qty: number, p: { packSize: number | null }) => inUnit(qty, p).toLocaleString('en-KE', { maximumFractionDigits: 3 })
const dash = (qty: number, p: { packSize: number | null }, sign = '') => (Math.abs(qty) < 0.0005 ? '-' : `${sign}${num(qty, p)}`)
const netCell = (qty: number, p: { packSize: number | null }) => (Math.abs(qty) < 0.0005 ? '-' : qty > 0 ? `+${num(qty, p)}` : `−${num(-qty, p)}`)
function byCategory(rows: SummaryRow[]) {
  const map = new Map<string, SummaryRow[]>()
  for (const r of rows) {
    const key = r.category ?? 'Uncategorised'
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, list]) => ({ category, rows: list.sort((a, b) => a.name.localeCompare(b.name)) }))
}

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

export default function LocationMovements({ locationId, locationName }: { locationId: string; locationName: string }) {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('day')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [report, setReport] = useState<StockReport | null>(null)
  const [view, setView] = useState<'summary' | 'movements'>('summary')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period, locationId, allProducts: 'true' })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      setReport(await api<StockReport>(`/reports/stock-movements?${query}`))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the stock movements'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])
  useEffect(() => { void load() }, [load])

  const needle = search.trim().toLowerCase()
  const rows = useMemo(() => (report?.rows ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || (r.sku ?? '').toLowerCase().includes(needle)), [report, needle])
  const groups = useMemo(() => byCategory(rows), [rows])
  const movements = useMemo(() => (report?.movements ?? []).filter((m) => !needle || m.productName.toLowerCase().includes(needle)), [report, needle])

  function exportCsv(r: StockReport) {
    downloadCsvRows(`stock-take-${locationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, [
      ['Category', 'Product', 'UOM', 'Opening', 'Added', 'Sold', 'Net change', 'Closing', 'Stock value (KSh)'],
      ...byCategory(r.rows).flatMap((g) => g.rows.map((x) => [g.category, x.name, uom(x), inUnit(x.opening, x), inUnit(x.added, x), inUnit(x.removed, x), inUnit(x.net, x), inUnit(x.closing, x), x.value])),
      ['', 'TOTAL', '', '', '', '', '', '', r.cards.stockValue ?? 0],
    ])
  }

  function doc(r: StockReport): ReportDocData {
    return {
      reportTitle: `${locationName} Stock Take`,
      kicker: 'Inventory Report',
      rangeLabel: rangeLabel(r.range.period, r.range.start, r.range.end),
      generatedAt: new Date().toISOString(),
      cards: [
        { label: 'Products', value: String(r.cards.listed ?? r.rows.length) },
        { label: 'Products moved', value: String(r.cards.products) },
        { label: 'Stock value', value: kes(r.cards.stockValue ?? 0), hint: 'Closing stock at unit cost' },
        { label: 'Movements', value: String(r.cards.movements) },
        ...(r.cards.unreconciled > 0 ? [{ label: 'Needs checking', value: String(r.cards.unreconciled), hint: 'Rows whose opening + net change does not equal closing' }] : []),
      ],
      // One table per category, like the live stock print. Opening + added - sold = closing.
      sections: byCategory(r.rows).map((g) => ({
        title: g.category,
        compact: true,
        columns: [
          { label: 'Product', flex: 2.2 }, { label: 'UOM' }, { label: 'Opening', align: 'right' }, { label: 'Added', align: 'right' },
          { label: 'Sold', align: 'right' }, { label: 'Net change', align: 'right' }, { label: 'Closing', align: 'right' }, { label: 'Value', align: 'right' },
        ],
        rows: g.rows.map((x) => [x.name, uom(x), num(x.opening, x), dash(x.added, x, '+'), dash(x.removed, x, '−'), netCell(x.net, x), num(x.closing, x), kes(x.value)]),
        totals: ['Total', '', '', '', '', '', '', kes(g.rows.reduce((sum, x) => sum + x.value, 0))],
      })),
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <div className="inline-flex rounded-sm border p-0.5">
          {(['day', 'week', 'month', 'custom'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wide', period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Range'}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <LuCalendarDays className="text-muted-foreground" />
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-sm text-muted-foreground">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous" onClick={() => setAnchor((a) => stepAnchor(period as Exclude<Period, 'custom'>, a, -1))} />
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next" onClick={() => setAnchor((a) => stepAnchor(period as Exclude<Period, 'custom'>, a, 1))} />
          </div>
        )}
        <div className="relative">
          <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product..." className="rounded-sm border bg-background py-1 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="inline-flex rounded-sm border p-0.5">
          {(['summary', 'movements'] as const).map((t) => (
            <button key={t} onClick={() => setView(t)} className={cn('rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wide', view === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {t === 'summary' ? 'Summary' : 'Each movement'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <ActionButton tone="neutral" icon={<LuDownload />} disabled={!report || loading} onClick={() => report && exportCsv(report)}>Export CSV</ActionButton>
          <PrintReportButton data={report ? doc(report) : null} disabled={loading} label="Print section" />
        </div>
      </div>

      {error && <div className="m-3 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading movements…</div>
      ) : (
        <>
          <div className="border-b p-3">
            <p className="mb-2 text-xs font-semibold">{rangeLabel(report.range.period, report.range.start, report.range.end)}{report.cards.unreconciled > 0 && <span className="text-warning"> · {report.cards.unreconciled} need checking</span>}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Products" value={String(report.cards.listed ?? report.rows.length)} />
              <MiniStat label="Moved" value={String(report.cards.products)} />
              <MiniStat label="Movements" value={String(report.cards.movements)} />
              <MiniStat label="Stock value" value={kes(report.cards.stockValue ?? 0)} hint="Closing stock at unit cost" strong />
            </div>
          </div>
          {view === 'summary' ? (
            rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{needle ? 'No products match.' : 'No products carried here.'}</p> : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">UOM</th>
                      <th className="px-4 py-2.5 text-right">Opening</th><th className="px-4 py-2.5 text-right">Added</th><th className="px-4 py-2.5 text-right">Sold</th>
                      <th className="px-4 py-2.5 text-right">Net change</th><th className="px-4 py-2.5 text-right">Closing</th><th className="px-4 py-2.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <Fragment key={g.category}>
                        <tr className="border-t bg-muted/60"><td colSpan={8} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.category} · {g.rows.length}</td></tr>
                        {g.rows.map((r) => (
                          <tr key={`${r.productId}|${r.locationId}`} className={cn('border-t', !r.reconciles && 'bg-warning/10')}>
                            <td className="px-4 py-2.5"><span className="font-semibold">{r.name}</span>{!r.reconciles && <span className="block text-xs text-warning">does not add up</span>}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{uom(r)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{num(r.opening, r)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-success">{dash(r.added, r, '+')}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{dash(r.removed, r, '−')}</td>
                            <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums', r.net < 0 ? 'text-destructive' : r.net > 0 ? 'text-success' : 'text-muted-foreground')}>{netCell(r.net, r)}</td>
                            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{num(r.closing, r)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{kes(r.value)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            movements.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No movements here in this period.</p> : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                    <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 text-right">Quantity</th><th className="px-4 py-2.5 text-right">Balance after</th><th className="px-4 py-2.5">By</th></tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{dateTime(m.occurredAt)}</td>
                        <td className="px-4 py-2.5 font-medium">{m.productName}</td>
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
        </>
      )}
    </div>
  )
}

function MiniStat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={cn('border bg-card px-3 py-2', strong && 'border-secondary/50 bg-secondary/5')}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', strong && 'text-secondary')}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
