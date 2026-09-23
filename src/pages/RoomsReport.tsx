import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LuBadgeDollarSign,
  LuBedDouble,
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuLoaderCircle,
  LuReceiptText,
  LuTriangleAlert,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Period = 'day' | 'week' | 'month' | 'custom'
type Location = { id: string; name: string }
type RoomReport = {
  range: { period: Period; start: string; end: string }
  cards: {
    totalRooms: number
    vacantRooms: number
    occupiedRooms: number
    outOfServiceRooms: number
    dirtyRooms: number
    occupancyRate: number
    occupiedRoomNights: number
    roomRevenue: number
    roomDiscounts: number
    roomPayments: number
    deposits: number
    settlements: number
    currentGuests: number
    paidGuests: number
    owingGuests: number
    inHouseCharges: number
    inHousePaid: number
    inHouseBalance: number
    upcomingReservations: number
  }
  topRooms: RoomSalesRow[]
  slowestRooms: SlowRoomRow[]
  salesByRoomType: RoomTypeSalesRow[]
  outOfService: OutRoomRow[]
  currentGuests: GuestRow[]
  upcoming: UpcomingRow[]
  byPaymentMethod: MethodRow[]
}
type RoomSalesRow = { roomId: string; roomNumber: string; roomName: string | null; roomType: string; stays: number; nights: number; revenue: number; discounts: number; lastGuest: string | null }
type SlowRoomRow = { roomId: string; roomNumber: string; roomName: string | null; roomType: string; stays: number; occupiedNights: number; occupancyRate: number }
type RoomTypeSalesRow = { roomTypeId: string; roomType: string; rooms: number; stays: number; nights: number; revenue: number; averageStayValue: number }
type OutRoomRow = { roomId: string; roomNumber: string; roomName: string | null; roomType: string; cleanliness: string; notes: string | null }
type GuestRow = { reservationId: string; reservationNo: string; guestName: string; phone: string | null; roomNumber: string; roomName: string | null; roomType: string; locationName: string; checkIn: string; checkOut: string; guests: number; charges: number; paid: number; balance: number; paymentStatus: 'PAID' | 'OWING' | 'OVERPAID' }
type UpcomingRow = { reservationId: string; reservationNo: string; guestName: string; phone: string | null; roomNumber: string; roomName: string | null; roomType: string; locationName: string; checkIn: string; checkOut: string; status: string }
type MethodRow = { name: string; count: number; total: number; percentOfTotal: number }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const toLocalIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = () => toLocalIso(new Date())
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })

function stepAnchor(period: Exclude<Period, 'custom'>, iso: string, dir: 1 | -1) {
  const d = new Date(`${iso}T00:00:00`)
  if (period === 'day') d.setDate(d.getDate() + dir)
  else if (period === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  return toLocalIso(d)
}

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function RoomsReport() {
  const toast = useToast()
  const [period, setPeriod] = useState<Period>('day')
  const [anchor, setAnchor] = useState(todayIso())
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [report, setReport] = useState<RoomReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ period })
      if (period === 'custom') { query.set('from', customFrom); query.set('to', customTo) } else { query.set('date', anchor) }
      if (locationId) query.set('locationId', locationId)
      const response = await api<RoomReport>(`/reports/rooms?${query}`)
      setReport(response)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the rooms report'
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
      <PageBanner kicker="Reports" title="Rooms Report" />

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
              <ActionButton tone="neutral" icon={<LuChevronLeft />} title="Previous" onClick={() => setAnchor((a) => stepAnchor(period, a, -1))} />
              <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-sm border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <ActionButton tone="neutral" icon={<LuChevronRight />} title="Next" onClick={() => setAnchor((a) => stepAnchor(period, a, 1))} />
            </div>
          )}

          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="ml-auto rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="Room revenue" value={formatKes(report.cards.roomRevenue)} icon={<LuBadgeDollarSign />} hint={`${report.cards.roomDiscounts ? `${formatKes(report.cards.roomDiscounts)} discounted` : 'No room discounts'} in this period`} />
            <StatCard index={1} label="Room payments" value={formatKes(report.cards.roomPayments)} icon={<LuWallet />} hint={`${formatKes(report.cards.deposits)} deposits, ${formatKes(report.cards.settlements)} settlements`} />
            <StatCard index={2} label="Occupancy" value={`${report.cards.occupancyRate.toFixed(1)}%`} icon={<LuBedDouble />} hint={`${report.cards.occupiedRoomNights.toLocaleString()} occupied room-nights`} />
            <StatCard index={3} label="In-house balance" value={formatKes(report.cards.inHouseBalance)} icon={<LuReceiptText />} tone={report.cards.inHouseBalance > 0 ? 'warn' : undefined} hint={`${report.cards.owingGuests} owing, ${report.cards.paidGuests} cleared`} />
          </section>

          <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <PlainStat label="Total rooms" value={report.cards.totalRooms} icon={<LuBedDouble />} />
            <PlainStat label="Vacant" value={report.cards.vacantRooms} icon={<LuBedDouble />} />
            <PlainStat label="Occupied" value={report.cards.occupiedRooms} icon={<LuUsers />} />
            <PlainStat label="Out of service" value={report.cards.outOfServiceRooms} icon={<LuTriangleAlert />} tone={report.cards.outOfServiceRooms > 0 ? 'danger' : undefined} />
            <PlainStat label="Upcoming" value={report.cards.upcomingReservations} icon={<LuCalendarDays />} />
          </section>

          <ReportSection title="Guests In House" note={`${report.cards.currentGuests} current guest${report.cards.currentGuests === 1 ? '' : 's'} - ${formatKes(report.cards.inHousePaid)} paid so far`}>
            <RoomTable empty="No guests in house right now.">
              {report.currentGuests.length > 0 && (
                <>
                  <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Guest</th><th className="px-4 py-2.5">Room</th><th className="px-4 py-2.5">Stay</th><th className="px-4 py-2.5 text-right">Charges</th><th className="px-4 py-2.5 text-right">Paid</th><th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5">Status</th></tr></thead>
                  <tbody>{report.currentGuests.map((g) => (
                    <tr key={g.reservationId} className="border-t">
                      <td className="px-4 py-3"><span className="font-semibold">{g.guestName}</span><span className="block text-xs text-muted-foreground">{g.reservationNo} - {g.guests} guest{g.guests === 1 ? '' : 's'}</span></td>
                      <td className="px-4 py-3"><span className="font-semibold">#{g.roomNumber}</span><span className="block text-xs text-muted-foreground">{g.roomType}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(g.checkIn)}<br />to {dateTime(g.checkOut)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatKes(g.charges)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatKes(g.paid)}</td>
                      <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', g.balance > 0 ? 'text-warning' : 'text-success')}>{formatKes(Math.max(0, g.balance))}</td>
                      <td className="px-4 py-3"><StatusBadge status={g.paymentStatus} /></td>
                    </tr>
                  ))}</tbody>
                </>
              )}
            </RoomTable>
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Top Selling Rooms" note="Ranked by charged room revenue after room discounts.">
              <SimpleRows rows={report.topRooms.map((r) => ({ key: r.roomId, title: `#${r.roomNumber} ${r.roomName ?? ''}`.trim(), meta: `${r.roomType} - ${r.stays} stay${r.stays === 1 ? '' : 's'} - ${r.nights} night${r.nights === 1 ? '' : 's'}`, value: formatKes(r.revenue) }))} empty="No room sales in this period." />
            </ReportSection>
            <ReportSection title="Slowest Rooms" note="Lowest occupied nights in the selected period.">
              <SimpleRows rows={report.slowestRooms.map((r) => ({ key: r.roomId, title: `#${r.roomNumber} ${r.roomName ?? ''}`.trim(), meta: `${r.roomType} - ${r.stays} stay${r.stays === 1 ? '' : 's'} - ${r.occupancyRate.toFixed(1)}% occupancy`, value: `${r.occupiedNights} nights` }))} empty="No room inventory found." />
            </ReportSection>
          </div>

          <ReportSection title="Sales By Room Type" note="Shows which room categories are carrying the accommodation revenue.">
            <RoomTable empty="No room type sales in this period.">
              {report.salesByRoomType.length > 0 && (
                <>
                  <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Room type</th><th className="px-4 py-2.5 text-right">Rooms</th><th className="px-4 py-2.5 text-right">Stays</th><th className="px-4 py-2.5 text-right">Nights</th><th className="px-4 py-2.5 text-right">Revenue</th><th className="px-4 py-2.5 text-right">Avg stay</th></tr></thead>
                  <tbody>{report.salesByRoomType.map((r) => (
                    <tr key={r.roomTypeId} className="border-t"><td className="px-4 py-3 font-semibold">{r.roomType}</td><td className="px-4 py-3 text-right tabular-nums">{r.rooms}</td><td className="px-4 py-3 text-right tabular-nums">{r.stays}</td><td className="px-4 py-3 text-right tabular-nums">{r.nights}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKes(r.revenue)}</td><td className="px-4 py-3 text-right tabular-nums">{formatKes(r.averageStayValue)}</td></tr>
                  ))}</tbody>
                </>
              )}
            </RoomTable>
          </ReportSection>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportSection title="Room Payments By Method" note="Deposits and settlement payments recorded in this period.">
              <SimpleRows rows={report.byPaymentMethod.map((m) => ({ key: m.name, title: m.name, meta: `${m.count} payment${m.count === 1 ? '' : 's'} - ${m.percentOfTotal.toFixed(1)}%`, value: formatKes(m.total) }))} empty="No room payments in this period." />
            </ReportSection>
            <ReportSection title="Out Of Service Rooms" note={`${report.cards.dirtyRooms} room${report.cards.dirtyRooms === 1 ? '' : 's'} currently marked dirty.`}>
              <SimpleRows rows={report.outOfService.map((r) => ({ key: r.roomId, title: `#${r.roomNumber} ${r.roomName ?? ''}`.trim(), meta: `${r.roomType} - ${r.cleanliness}${r.notes ? ` - ${r.notes}` : ''}`, value: 'Out' }))} empty="No rooms are out of service." />
            </ReportSection>
          </div>

          <ReportSection title="Upcoming Reservations" note={`Next reservations inside this report range.`}>
            <RoomTable empty="No upcoming reservations in this period.">
              {report.upcoming.length > 0 && (
                <>
                  <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Guest</th><th className="px-4 py-2.5">Room</th><th className="px-4 py-2.5">Arrival</th><th className="px-4 py-2.5">Departure</th><th className="px-4 py-2.5">Status</th></tr></thead>
                  <tbody>{report.upcoming.map((r) => (
                    <tr key={r.reservationId} className="border-t"><td className="px-4 py-3"><span className="font-semibold">{r.guestName}</span><span className="block text-xs text-muted-foreground">{r.reservationNo}</span></td><td className="px-4 py-3">#{r.roomNumber}<span className="block text-xs text-muted-foreground">{r.roomType}</span></td><td className="px-4 py-3 text-sm">{dateOnly(r.checkIn)}</td><td className="px-4 py-3 text-sm">{dateOnly(r.checkOut)}</td><td className="px-4 py-3"><StatusBadge status={r.status} /></td></tr>
                  ))}</tbody>
                </>
              )}
            </RoomTable>
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

function RoomTable({ empty, children }: { empty: string; children: ReactNode }) {
  if (!children) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">{children}</table></div>
}

function SimpleRows({ rows, empty }: { rows: { key: string; title: string; meta: string; value: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="divide-y">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <div className="min-w-0"><p className="truncate font-semibold">{row.title}</p><p className="truncate text-xs text-muted-foreground">{row.meta}</p></div>
          <span className="shrink-0 font-semibold tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function PlainStat({ label, value, icon, tone }: { label: string; value: string | number; icon: ReactNode; tone?: 'danger' }) {
  return (
    <div className={cn('rounded-sm border bg-card p-4 shadow-sm', tone === 'danger' && 'border-destructive/30 bg-destructive/5')}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'PAID' || status === 'CONFIRMED'
    ? 'border-success/30 bg-success/10 text-success'
    : status === 'OWING' || status === 'PENDING'
      ? 'border-warning/30 bg-warning/10 text-warning'
      : 'border-muted bg-muted text-muted-foreground'
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tone)}>{status.replaceAll('_', ' ')}</span>
}
