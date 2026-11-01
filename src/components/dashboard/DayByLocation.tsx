import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LuCircleAlert, LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'

// The owner's full day by location: everything each location sold, reception's
// stays with their money, new memberships, who owes, and the day's purchases.
// Backed by GET /reports/dashboard-day.

type ItemRow = { key: string; kind: 'MENU' | 'SERVICE' | 'PRODUCT'; name: string; quantity: number; complimentaryQuantity: number; value: number }
type StayRow = {
  id: string; reservationNo: string; status: string; stage: 'ARRIVING' | 'DEPARTING' | 'IN_HOUSE'
  room: string; guest: string; phone: string | null; checkIn: string; checkOut: string; nights: number
  charges: number; paid: number; balance: number; paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' | 'NO_CHARGES'
}
type MembershipRow = { id: string; member: string; phone: string | null; plan: string; price: number; startsAt: string; endsAt: string; status: string; paid: number }
type LocationSection = {
  locationId: string; name: string; type: string
  sells: { menu: boolean; services: boolean; products: boolean; rooms: boolean }
  totals: {
    orders: number; sales: number; paid: number; credit: number; roomBills: number; complimentary: number; membershipPayments: number
    roomCharges: number; roomPaid: number; roomBalance: number
  }
  paymentMethods: { name: string; amount: number }[]
  items: ItemRow[]
  stays: StayRow[]
  memberships: MembershipRow[]
}
type DayReport = {
  range: { start: string; end: string }
  locations: LocationSection[]
  credit: { count: number; total: number; debtors: { id: string; name: string; phone: string | null; balance: number }[] }
  purchases: { count: number; total: number; rows: { id: string; purchaseNo: string; supplier: string; location: string | null; status: string; paymentStatus: string; total: number; reference: string | null }[] }
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
const localIsoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const KIND_LABEL: Record<ItemRow['kind'], string> = { MENU: 'Menu items', SERVICE: 'Services', PRODUCT: 'Products' }
const STAGE_LABEL: Record<StayRow['stage'], string> = { ARRIVING: 'Arriving', DEPARTING: 'Departing', IN_HOUSE: 'In house' }
const PAY_TONE: Record<StayRow['paymentStatus'], string> = {
  PAID: 'bg-success/10 text-success',
  PARTIAL: 'bg-warning/15 text-warning',
  UNPAID: 'bg-destructive/10 text-destructive',
  NO_CHARGES: 'bg-muted text-muted-foreground',
}

// Always the whole business: the dashboard's location filter (which opens on the
// user's default location) does not narrow this owner's view.
export default function DayByLocation() {
  const [date, setDate] = useState(() => localIsoDay(new Date()))
  const [report, setReport] = useState<DayReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setReport(await api<DayReport>(`/reports/dashboard-day?date=${date}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the day report')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { void load() }, [load])

  const sections = report?.locations ?? []
  const isToday = date === localIsoDay(new Date())

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isToday ? "Today's" : 'Daily'} report by location</p>
          <p className="text-xs text-muted-foreground">Everything sold and active on {new Date(`${date}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.</p>
        </div>
        <input type="date" aria-label="Report date" value={date} max={localIsoDay(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} className="input w-auto" />
      </div>

      {loading && !report ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-sm border bg-card p-8 text-sm text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" /> Loading the day…</div>
      ) : error ? (
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>
      ) : report && (
        <div className={cn('mt-3 space-y-5', loading && 'opacity-60')}>
          {sections.length === 0 && <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">No locations to show.</p>}
          {sections.map((s) => <LocationCard key={s.locationId} section={s} />)}
          <div className="grid gap-4 lg:grid-cols-2">
            <CreditCard credit={report.credit} />
            <PurchasesCard purchases={report.purchases} />
          </div>
        </div>
      )}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">{text}</p>
}

function SectionHeader({ title, subtitle, to, linkLabel }: { title: string; subtitle?: string; to: string; linkLabel: string }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-primary/20 bg-primary/5 p-4">
      <div className="min-w-0">
        <h2 className="font-bold uppercase tracking-wide text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <Link to={to} className="shrink-0 text-xs font-semibold text-secondary hover:underline">{linkLabel} →</Link>
    </header>
  )
}

// The dashboard's signature stat card, a touch tighter to fit six in a row.
function Figure({ label, value, tone, index }: { label: string; value: string; tone?: 'success' | 'danger'; index: number }) {
  return <StatCard label={label} value={value} tone={tone} index={index} className="p-4" />
}

function LocationCard({ section: s }: { section: LocationSection }) {
  const t = s.totals
  const hasSales = t.orders > 0
  const kinds = (['MENU', 'SERVICE', 'PRODUCT'] as const).filter((k) => s.items.some((i) => i.kind === k))
  // Each widget shows even with nothing in it (with an empty note) wherever the
  // location does that kind of business.
  const showsRooms = s.sells.rooms || s.type === 'RECEPTION' || s.stays.length > 0
  const showsMemberships = s.type === 'GYM' || s.memberships.length > 0 || t.membershipPayments > 0
  const salesLink = '/reports'
  const subtitle = [
    hasSales ? `${t.orders} order${t.orders === 1 ? '' : 's'} · ${formatKes(t.sales)} sold` : null,
    showsRooms ? `${s.stays.length} stay${s.stays.length === 1 ? '' : 's'} active` : null,
    showsMemberships ? `${s.memberships.length} new membership${s.memberships.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ') || 'No activity this day'

  const salesBlock = (
    <div>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Figure index={4} label="Total sales" value={formatKes(t.sales)} />
            <Figure index={1} label="Paid" value={formatKes(t.paid)} tone="success" />
            <Figure index={8} label="On credit" value={formatKes(t.credit)} tone={t.credit > 0.01 ? 'danger' : undefined} />
            <Figure index={2} label="Billed to rooms" value={formatKes(t.roomBills)} />
            <Figure index={7} label="Complimentary" value={formatKes(t.complimentary)} />
            <Figure index={6} label="Orders" value={String(t.orders)} />
        </div>
  
        <div className="grid gap-4 border-t p-4 lg:grid-cols-[1fr_16rem]">
            <div className="space-y-4">
              {kinds.length === 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items sold · 0</p>
                  <Empty text="Nothing sold this day." />
                </div>
              )}
              {kinds.map((kind) => {
                const rows = s.items.filter((i) => i.kind === kind)
                return (
                  <div key={kind}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KIND_LABEL[kind]} sold · {rows.length}</p>
                    <div className="overflow-x-auto rounded-sm border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                          <tr><th className="px-3 py-2 text-left font-medium">Item</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Value</th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {rows.map((i) => (
                            <tr key={i.key}>
                              <td className="px-3 py-1.5">{i.name}{i.complimentaryQuantity > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({i.complimentaryQuantity} complimentary)</span>}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{i.quantity.toLocaleString('en-KE', { maximumFractionDigits: 3 })}</td>
                              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatKes(i.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t bg-muted/40 font-semibold">
                          <tr><td className="px-3 py-1.5">Total</td><td className="px-3 py-1.5 text-right tabular-nums">{rows.reduce((sum, i) => sum + i.quantity, 0).toLocaleString('en-KE', { maximumFractionDigits: 3 })}</td><td className="px-3 py-1.5 text-right tabular-nums">{formatKes(rows.reduce((sum, i) => sum + i.value, 0))}</td></tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payments received</p>
              {s.paymentMethods.length === 0 ? (
                <Empty text="No payments taken." />
              ) : (
                <div className="divide-y rounded-sm border">
                  {s.paymentMethods.map((m) => (
                    <div key={m.name} className="flex justify-between gap-2 px-3 py-1.5 text-sm"><span className="truncate">{m.name}</span><span className="shrink-0 font-medium tabular-nums">{formatKes(m.amount)}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
    </div>
  )
  const roomsBlock = (
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rooms · {s.stays.length} stay{s.stays.length === 1 ? '' : 's'}</p>
              <Link to="/reports/rooms-report" className="text-xs font-semibold text-secondary hover:underline">Rooms report →</Link>
            </div>
            {s.stays.length === 0 ? (
              <Empty text="No stays this day." />
            ) : (
              <>
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Figure index={4} label="Room charges" value={formatKes(t.roomCharges)} />
                  <Figure index={1} label="Paid" value={formatKes(t.roomPaid)} tone="success" />
                  <Figure index={8} label="Balance" value={formatKes(t.roomBalance)} tone={t.roomBalance > 0.01 ? 'danger' : undefined} />
                </div>
                <div className="overflow-x-auto rounded-sm border">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Guest</th>
                        <th className="px-3 py-2 text-left font-medium">Room</th>
                        <th className="px-3 py-2 text-left font-medium">Stay</th>
                        <th className="px-3 py-2 text-left font-medium">Today</th>
                        <th className="px-3 py-2 text-right font-medium">Charges</th>
                        <th className="px-3 py-2 text-right font-medium">Paid</th>
                        <th className="px-3 py-2 text-right font-medium">Balance</th>
                        <th className="px-3 py-2 text-left font-medium">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {s.stays.map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-1.5"><p className="font-medium">{r.guest}</p><p className="text-xs text-muted-foreground">{r.reservationNo}{r.phone ? ` · ${r.phone}` : ''}</p></td>
                          <td className="px-3 py-1.5">{r.room}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{shortDate(r.checkIn)} – {shortDate(r.checkOut)}<p className="text-xs text-muted-foreground">{r.nights} night{r.nights === 1 ? '' : 's'} · {r.status.replace(/_/g, ' ').toLowerCase()}</p></td>
                          <td className="px-3 py-1.5">{STAGE_LABEL[r.stage]}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatKes(r.charges)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatKes(r.paid)}</td>
                          <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', r.balance > 0.01 && 'text-destructive')}>{formatKes(r.balance)}</td>
                          <td className="px-3 py-1.5"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', PAY_TONE[r.paymentStatus])}>{r.paymentStatus.replace('_', ' ')}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
  )
  const membershipsBlock = (
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New memberships · {s.memberships.length}{t.membershipPayments > 0 ? ` · ${formatKes(t.membershipPayments)} collected` : ''}</p>
              <Link to="/service-center/memberships" className="text-xs font-semibold text-secondary hover:underline">Memberships →</Link>
            </div>
            {s.memberships.length === 0 ? (
              <Empty text="No new memberships this day." />
            ) : (
              <div className="overflow-x-auto rounded-sm border">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2 text-left font-medium">Member</th><th className="px-3 py-2 text-left font-medium">Plan</th><th className="px-3 py-2 text-left font-medium">Period</th><th className="px-3 py-2 text-right font-medium">Price</th><th className="px-3 py-2 text-right font-medium">Paid</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {s.memberships.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-1.5"><p className="font-medium">{m.member}</p>{m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}</td>
                        <td className="px-3 py-1.5">{m.plan}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{shortDate(m.startsAt)} – {shortDate(m.endsAt)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatKes(m.price)}</td>
                        <td className={cn('px-3 py-1.5 text-right font-medium tabular-nums', m.paid + 0.01 < m.price && 'text-destructive')}>{formatKes(m.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
  )

  return (
    <div className="overflow-hidden rounded-sm border border-primary/30 bg-card shadow-sm">
      <SectionHeader title={s.name} subtitle={subtitle} to={salesLink} linkLabel="Full report" />
      {/* Rooms come first where rooms are sold; the till sales follow. */}
      <div className="divide-y">
        {showsRooms && roomsBlock}
        {showsRooms && showsMemberships && membershipsBlock}
        {salesBlock}
        {!showsRooms && showsMemberships && membershipsBlock}
      </div>
    </div>
  )
}

function CreditCard({ credit }: { credit: DayReport['credit'] }) {
  return (
    <div className="overflow-hidden rounded-sm border border-primary/30 bg-card shadow-sm">
      <SectionHeader title="Credit" subtitle={`${credit.count} customer${credit.count === 1 ? '' : 's'} owe ${formatKes(credit.total)} (as of now)`} to="/reports/credit-debtors" linkLabel="Credit report" />
      {credit.debtors.length === 0 ? (
        <div className="p-4"><Empty text="No customer owes you right now." /></div>
      ) : (
        <div className="divide-y">
          {credit.debtors.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{d.name}</p>{d.phone && <p className="text-xs text-muted-foreground">{d.phone}</p>}</div>
              <span className="shrink-0 font-semibold tabular-nums text-destructive">{formatKes(d.balance)}</span>
            </div>
          ))}
          {credit.count > credit.debtors.length && <p className="px-4 py-2 text-xs text-muted-foreground">+ {credit.count - credit.debtors.length} more in the credit report</p>}
        </div>
      )}
    </div>
  )
}

function PurchasesCard({ purchases }: { purchases: DayReport['purchases'] }) {
  return (
    <div className="overflow-hidden rounded-sm border border-primary/30 bg-card shadow-sm">
      <SectionHeader title="Purchases" subtitle={`${purchases.count} purchase${purchases.count === 1 ? '' : 's'} · ${formatKes(purchases.total)}`} to="/reports/purchases-report" linkLabel="Purchases report" />
      {purchases.rows.length === 0 ? (
        <div className="p-4"><Empty text="No purchases this day." /></div>
      ) : (
        <div className="divide-y">
          {purchases.rows.map((p) => (
            <div key={p.id} className={cn('flex items-center justify-between gap-3 px-4 py-2 text-sm', p.status === 'CANCELLED' && 'opacity-50 line-through')}>
              <div className="min-w-0">
                <p className="truncate font-medium">{p.supplier}</p>
                <p className="text-xs text-muted-foreground">{p.purchaseNo}{p.location ? ` · ${p.location}` : ''}{p.reference ? ` · ${p.reference}` : ''} · {p.status.toLowerCase()} · {p.paymentStatus.toLowerCase()}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatKes(p.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
