import { useCallback, useEffect, useState } from 'react'
import { LuCalendarDays, LuChevronLeft, LuChevronRight, LuCircleAlert, LuDownload, LuLoaderCircle, LuReceiptText } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }
type TaxItem = { itemId: string | null; name: string; sku: string | null; category: string | null; quantity: number; net: number; tax: number; gross: number; taxCategory?: string }
type TaxBucket = { key: string; label: string; treatment: string; rate: number; mode: string; lines: number; net: number; tax: number; gross: number; topItems: TaxItem[] }
type TaxReportData = {
  range: { period: Period; start: string; end: string }
  summary: { net: number; tax: number; gross: number; orders: number; lines: number }
  breakdown: TaxBucket[]
  topItems: TaxItem[]
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())

function stepAnchor(period: 'day' | 'week' | 'month', iso: string, dir: 1 | -1) {
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

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(report: TaxReportData) {
  const rows = [
    ['Section', 'Tax Category', 'Product', 'SKU', 'Category', 'Qty', 'Net', 'Tax', 'Gross'],
    ...report.breakdown.map((b) => ['Breakdown', b.label, '', '', '', b.lines, b.net, b.tax, b.gross]),
    ...report.topItems.map((i) => ['Top Items', i.taxCategory ?? '', i.name, i.sku ?? '', i.category ?? '', i.quantity, i.net, i.tax, i.gross]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tax-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function TaxReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<TaxReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      const response = await api<TaxReportData>(`/reports/tax?${query}`)
      setReport(response)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the tax report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Tax Report" />

      <div className="mt-6 space-y-3 rounded-sm border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-sm border p-0.5">
            {(['day', 'week', 'month', 'custom'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide', period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
                {p === 'day' ? 'Daily' : p === 'week' ? 'Weekly' : p === 'month' ? 'Monthly' : 'Custom'}
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
              <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous" onClick={() => setAnchor((a) => stepAnchor(period, a, -1))} />
              <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next" onClick={() => setAnchor((a) => stepAnchor(period, a, 1))} />
              {report && <span className="ml-2 text-sm font-medium text-muted-foreground">{rangeLabel(period, report.range.start, report.range.end)}</span>}
            </div>
          )}

          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="ml-auto rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuDownload />} disabled={!report || loading} onClick={() => report && downloadCsv(report)}>Export Report</ActionButton>
        </div>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 md:grid-cols-3">
            <TaxCard label="Net" value={report.summary.net} tone="primary" />
            <TaxCard label="Tax" value={report.summary.tax} tone="secondary" />
            <TaxCard label="Gross" value={report.summary.gross} tone="plain" />
          </section>

          <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="border-b border-l-4 border-l-accent p-4">
              <h2 className="font-display text-lg font-semibold leading-tight">Breakdown by Tax Category</h2>
              <p className="text-xs text-muted-foreground">{report.summary.orders.toLocaleString()} completed order{report.summary.orders === 1 ? '' : 's'} and {report.summary.lines.toLocaleString()} taxable line{report.summary.lines === 1 ? '' : 's'} in this period.</p>
            </header>
            {report.breakdown.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No completed sales in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase text-primary-foreground">
                    <tr><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5 text-right">Net</th><th className="px-4 py-2.5 text-right">Tax</th><th className="px-4 py-2.5 text-right">Gross</th></tr>
                  </thead>
                  <tbody>{report.breakdown.map((b) => (
                    <tr key={b.key} className="border-t">
                      <td className="px-4 py-2.5"><span className="rounded-sm border border-secondary/40 px-2 py-0.5 text-xs font-semibold uppercase text-secondary">{b.label}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{b.lines.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatKes(b.net)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatKes(b.tax)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatKes(b.gross)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
            <header className="border-b border-l-4 border-l-accent p-4">
              <h2 className="font-display text-lg font-semibold leading-tight">Top 10 Most-Taxed Items</h2>
            </header>
            {report.topItems.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No taxed items in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase text-primary-foreground">
                    <tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Tax Category</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Net</th><th className="px-4 py-2.5 text-right">Tax</th><th className="px-4 py-2.5 text-right">Gross</th></tr>
                  </thead>
                  <tbody>{report.topItems.map((item) => (
                    <tr key={`${item.taxCategory}-${item.itemId ?? item.name}`} className="border-t">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{[item.sku, item.category].filter(Boolean).join(' / ') || 'No SKU'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.taxCategory}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity.toLocaleString('en-KE')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatKes(item.net)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatKes(item.tax)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatKes(item.gross)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function TaxCard({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'secondary' | 'plain' }) {
  return (
    <div className={cn('rounded-sm border p-4 shadow-sm', tone === 'primary' && 'bg-primary text-primary-foreground', tone === 'secondary' && 'bg-secondary text-secondary-foreground', tone === 'plain' && 'bg-card')}>
      <div className="flex items-center justify-between gap-3">
        <span className={cn('text-xs font-semibold uppercase tracking-wide', tone === 'plain' ? 'text-muted-foreground' : 'text-current/75')}>{label}</span>
        <LuReceiptText className={cn('size-4', tone === 'plain' ? 'text-muted-foreground' : 'text-current/70')} />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{formatKes(value)}</p>
    </div>
  )
}
