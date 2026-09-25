import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LuArmchair,
  LuBadgeDollarSign,
  LuBedDouble,
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuLoaderCircle,
  LuPackagePlus,
  LuTriangleAlert,
  LuTrendingDown,
  LuLandmark,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }
type Bucket = { key: string; name: string; assets: number; units: number; value: number; percentOfValue: number }
type AssetRow = { id: string; assetNo: string; name: string; unit: string; quantity: number; unitCost: number | null; value: number; category: string | null; placement: string | null }
type RoomRow = { roomId: string; roomNumber: string; roomName: string | null; roomType: string; assets: number; units: number; value: number }
type AssetsReportData = {
  range: { period: Period; start: string; end: string }
  cards: {
    assets: number; inactiveAssets: number; totalUnits: number; bookValue: number
    roomAssets: number; roomsWithAssets: number; roomsWithoutAssets: number
    unitsAdded: number; valueAdded: number; unitsWrittenOff: number; valueWrittenOff: number
    capitalInvested: number; purchaseCount: number; recordedWithoutPurchase: number; writeOffRate: number; movements: number
  }
  reconciliation: {
    openingUnits: number; openingValue: number; added: number; addedValue: number
    writtenOff: number; writtenOffValue: number; adjustments: number; adjustmentValue: number
    closingUnits: number; closingValue: number
  }
  byCategory: Bucket[]
  byPlacement: Bucket[]
  rooms: RoomRow[]
  roomsWithoutAssets: { roomId: string; roomNumber: string; roomName: string | null; roomType: string }[]
  topAssets: AssetRow[]
  attention: { counts: { noValue: number; noCategory: number; notPlaced: number; outOfStock: number }; noValue: AssetRow[]; noCategory: AssetRow[]; notPlaced: AssetRow[]; outOfStock: AssetRow[] }
  capitalByMethod: { name: string; count: number; total: number; percentOfTotal: number }[]
  lossesByCategory: { name: string; units: number; value: number; events: number }[]
  byEmployee: { employeeId: string; name: string; movements: number; added: number; writtenOff: number }[]
  acquisitions: { id: string; occurredAt: string; assetNo: string; name: string; quantity: number; unit: string; unitCost: number | null; value: number; how: string; paymentMethod: string | null; reference: string | null; placement: string | null; by: string | null }[]
  writeOffs: { id: string; occurredAt: string; assetNo: string; name: string; quantity: number; unit: string; value: number; note: string | null; placement: string | null; by: string | null }[]
  adjustments: { id: string; occurredAt: string; assetNo: string; name: string; quantity: number; unit: string; note: string | null; by: string | null }[]
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 3 })
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function stepAnchor(period: Exclude<Period, 'custom'>, iso: string, dir: 1 | -1) {
  const d = new Date(`${iso}T00:00:00`)
  if (period === 'day') d.setDate(d.getDate() + dir)
  else if (period === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  return toLocalIso(d)
}

export default function AssetsReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<AssetsReportData | null>(null)
  const [attentionTab, setAttentionTab] = useState<'noValue' | 'noCategory' | 'notPlaced' | 'outOfStock'>('noValue')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      setReport(await api<AssetsReportData>(`/reports/assets?${query}`))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the assets report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [period, anchor, customFrom, customTo, locationId, toast])

  useEffect(() => { void load() }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  const c = report?.cards
  const rec = report?.reconciliation
  const attentionLabels = { noValue: 'No value recorded', noCategory: 'No category', notPlaced: 'Not placed', outOfStock: 'None on hand' } as const

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Assets Report" />

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
        </div>
        <p className="text-[11px] text-muted-foreground">The register (what you own and its worth) is a live snapshot. Additions, purchases, write-offs and the reconciliation cover the selected period. Values use each asset's current unit value.</p>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report || !c || !rec ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="Book value" value={formatKes(c.bookValue)} icon={<LuBadgeDollarSign />} hint={`${c.assets} asset${c.assets === 1 ? '' : 's'} - ${num(c.totalUnits)} units${c.inactiveAssets ? ` (+${c.inactiveAssets} inactive)` : ''}`} />
            <StatCard index={1} label="Capital invested" value={formatKes(c.capitalInvested)} icon={<LuLandmark />} hint={`${c.purchaseCount} purchase${c.purchaseCount === 1 ? '' : 's'} this period - capital, not expense`} />
            <StatCard index={2} label="Added this period" value={formatKes(c.valueAdded)} icon={<LuPackagePlus />} hint={`${num(c.unitsAdded)} units, of which ${formatKes(c.recordedWithoutPurchase)} was recorded without a purchase`} />
            <StatCard index={3} label="Written off" value={formatKes(c.valueWrittenOff)} icon={<LuTrendingDown />} tone={c.valueWrittenOff > 0 ? 'warn' : undefined} hint={`${num(c.unitsWrittenOff)} units - ${c.writeOffRate.toFixed(1)}% loss rate`} />
          </section>

          <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <PlainStat label="Assets" value={c.assets} icon={<LuArmchair />} />
            <PlainStat label="In rooms" value={c.roomAssets} icon={<LuBedDouble />} />
            <PlainStat label="Rooms with assets" value={c.roomsWithAssets} icon={<LuBedDouble />} />
            <PlainStat label="Rooms with none" value={c.roomsWithoutAssets} icon={<LuTriangleAlert />} tone={c.roomsWithoutAssets > 0 ? 'warn' : undefined} />
            <PlainStat label="Movements" value={c.movements} icon={<LuPackagePlus />} />
          </section>

          <ReportSection title="Period Reconciliation" note="How the count and value moved from the start of the period to now. Adjustments are stock-count corrections.">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Step</th><th className="px-4 py-2.5 text-right">Units</th><th className="px-4 py-2.5 text-right">Value</th></tr></thead>
                <tbody>
                  <RecRow label="Opening" units={rec.openingUnits} value={rec.openingValue} />
                  <RecRow label="+ Added (received or purchased)" units={rec.added} value={rec.addedValue} tone="success" />
                  <RecRow label="- Written off (broken, lost, disposed)" units={-rec.writtenOff} value={-rec.writtenOffValue} tone="danger" />
                  <RecRow label="+/- Count adjustments" units={rec.adjustments} value={rec.adjustmentValue} />
                  <RecRow label="Closing (today)" units={rec.closingUnits} value={rec.closingValue} strong />
                </tbody>
              </table>
            </div>
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Value By Category" note="Where the money is tied up.">
              <BucketRows rows={report.byCategory} empty="No assets registered yet." />
            </ReportSection>
            <ReportSection title="Value By Placement" note="Rooms, individual locations, and anything not placed anywhere.">
              <BucketRows rows={report.byPlacement} empty="No assets registered yet." />
            </ReportSection>
          </div>

          <ReportSection title="Most Valuable Assets" note="Top ten holdings by quantity x unit value.">
            <AssetTable rows={report.topAssets} empty="No valued assets yet." />
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Assets Per Room" note="Value of the equipment recorded in each room.">
              <SimpleRows rows={report.rooms.map((r) => ({ key: r.roomId, title: `#${r.roomNumber} ${r.roomName ?? ''}`.trim(), meta: `${r.roomType} - ${r.assets} asset${r.assets === 1 ? '' : 's'} - ${num(r.units)} units`, value: formatKes(r.value) }))} empty="No room assets recorded." />
            </ReportSection>
            <ReportSection title="Rooms With No Assets" note="Rooms nobody has recorded any equipment for - worth an inventory walk-through.">
              <SimpleRows rows={report.roomsWithoutAssets.map((r) => ({ key: r.roomId, title: `#${r.roomNumber} ${r.roomName ?? ''}`.trim(), meta: r.roomType, value: 'Empty' }))} empty="Every room has assets recorded." />
            </ReportSection>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Capital Invested By Method" note="Money paid out for assets this period. This is investment in equipment, not an operating expense.">
              <SimpleRows rows={report.capitalByMethod.map((m) => ({ key: m.name, title: m.name, meta: `${m.count} payment${m.count === 1 ? '' : 's'} - ${m.percentOfTotal.toFixed(1)}%`, value: formatKes(m.total) }))} empty="No assets were purchased in this period." />
            </ReportSection>
            <ReportSection title="Losses By Category" note="Write-offs this period.">
              <SimpleRows rows={report.lossesByCategory.map((l) => ({ key: l.name, title: l.name, meta: `${l.events} event${l.events === 1 ? '' : 's'} - ${num(l.units)} units`, value: formatKes(l.value) }))} empty="Nothing written off in this period." />
            </ReportSection>
          </div>

          <ReportSection title="Additions" note="Everything received this period. Purchased = money was paid; Recorded = already owned, just logged.">
            <MovementTable empty="No assets were added in this period." head={['When', 'Asset', 'Qty', 'Value', 'How', 'Placement', 'By']}>
              {report.acquisitions.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(m.occurredAt)}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{m.name}</span><span className="block text-xs text-muted-foreground">{m.assetNo}</span></td>
                  <td className="px-4 py-3 tabular-nums">{num(m.quantity)} {m.unit}</td>
                  <td className="px-4 py-3 tabular-nums">{formatKes(m.value)}</td>
                  <td className="px-4 py-3"><Badge tone={m.how === 'Purchased' ? 'warn' : 'muted'}>{m.how}</Badge>{m.paymentMethod && <span className="block text-xs text-muted-foreground">{m.paymentMethod}{m.reference ? ` - ${m.reference}` : ''}</span>}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.placement ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.by ?? '-'}</td>
                </tr>
              ))}
            </MovementTable>
          </ReportSection>

          <ReportSection title="Write-offs" note="Breakage, loss and disposal, with the reason given.">
            <MovementTable empty="Nothing written off in this period." head={['When', 'Asset', 'Qty', 'Value lost', 'Reason', 'Placement', 'By']}>
              {report.writeOffs.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(m.occurredAt)}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{m.name}</span><span className="block text-xs text-muted-foreground">{m.assetNo}</span></td>
                  <td className="px-4 py-3 tabular-nums">{num(m.quantity)} {m.unit}</td>
                  <td className="px-4 py-3 tabular-nums text-destructive">{formatKes(m.value)}</td>
                  <td className="px-4 py-3 text-xs">{m.note ?? <span className="text-muted-foreground">No reason given</span>}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.placement ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.by ?? '-'}</td>
                </tr>
              ))}
            </MovementTable>
          </ReportSection>

          <ReportSection title="Count Adjustments" note="Corrections made after a physical count.">
            <MovementTable empty="No count adjustments in this period." head={['When', 'Asset', 'Change', 'Note', 'By']}>
              {report.adjustments.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(m.occurredAt)}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{m.name}</span><span className="block text-xs text-muted-foreground">{m.assetNo}</span></td>
                  <td className={cn('px-4 py-3 tabular-nums', m.quantity < 0 ? 'text-destructive' : 'text-success')}>{m.quantity > 0 ? '+' : ''}{num(m.quantity)} {m.unit}</td>
                  <td className="px-4 py-3 text-xs">{m.note ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.by ?? '-'}</td>
                </tr>
              ))}
            </MovementTable>
          </ReportSection>

          <ReportSection title="Needs Attention" note="Register gaps that make this report less accurate.">
            <div className="flex flex-wrap gap-1 border-b p-2">
              {(Object.keys(attentionLabels) as (keyof typeof attentionLabels)[]).map((k) => (
                <button key={k} onClick={() => setAttentionTab(k)} className={cn('rounded-sm px-3 py-1.5 text-xs font-semibold', attentionTab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                  {attentionLabels[k]} ({report.attention.counts[k]})
                </button>
              ))}
            </div>
            <AssetTable rows={report.attention[attentionTab]} empty="Nothing to fix here." />
          </ReportSection>

          <ReportSection title="Activity By Employee" note="Who recorded asset movements this period.">
            <SimpleRows rows={report.byEmployee.map((e) => ({ key: e.employeeId, title: e.name, meta: `${num(e.added)} units added - ${num(e.writtenOff)} written off`, value: `${e.movements} move${e.movements === 1 ? '' : 's'}` }))} empty="No asset activity in this period." />
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

function RecRow({ label, units, value, tone, strong }: { label: string; units: number; value: number; tone?: 'success' | 'danger'; strong?: boolean }) {
  return (
    <tr className={cn('border-t', strong && 'bg-muted/40 font-semibold')}>
      <td className="px-4 py-3">{label}</td>
      <td className={cn('px-4 py-3 text-right tabular-nums', tone === 'success' && 'text-success', tone === 'danger' && 'text-destructive')}>{num(units)}</td>
      <td className={cn('px-4 py-3 text-right tabular-nums', tone === 'success' && 'text-success', tone === 'danger' && 'text-destructive')}>{formatKes(value)}</td>
    </tr>
  )
}

function BucketRows({ rows, empty }: { rows: Bucket[]; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.key} className="px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0"><p className="truncate font-semibold">{r.name}</p><p className="truncate text-xs text-muted-foreground">{r.assets} asset{r.assets === 1 ? '' : 's'} - {num(r.units)} units - {r.percentOfValue.toFixed(1)}% of value</p></div>
            <span className="shrink-0 font-semibold tabular-nums">{formatKes(r.value)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-accent" style={{ width: `${Math.min(100, r.percentOfValue)}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

function AssetTable({ rows, empty }: { rows: AssetRow[]; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Placement</th><th className="px-4 py-2.5 text-right">On hand</th><th className="px-4 py-2.5 text-right">Unit value</th><th className="px-4 py-2.5 text-right">Value</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-4 py-3"><span className="font-semibold">{a.name}</span><span className="block text-xs text-muted-foreground">{a.assetNo}</span></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{a.category ?? '-'}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{a.placement ?? '-'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{num(a.quantity)} {a.unit}</td>
              <td className="px-4 py-3 text-right tabular-nums">{a.unitCost == null ? '-' : formatKes(a.unitCost)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(a.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MovementTable({ head, empty, children }: { head: string[]; empty: string; children: ReactNode[] }) {
  if (children.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr>{head.map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
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

function PlainStat({ label, value, icon, tone }: { label: string; value: string | number; icon: ReactNode; tone?: 'warn' }) {
  return (
    <div className={cn('rounded-sm border bg-card p-4 shadow-sm', tone === 'warn' && 'border-warning/30 bg-warning/5')}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Badge({ tone, children }: { tone: 'warn' | 'muted'; children: ReactNode }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tone === 'warn' ? 'border-warning/30 bg-warning/10 text-warning' : 'border-muted bg-muted text-muted-foreground')}>{children}</span>
}
