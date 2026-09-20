import { useCallback, useEffect, useState } from 'react'
import { LuCircleAlert, LuEye, LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import StatusPill, { type PillTone } from '@/components/ui/StatusPill'
import ActionButton from '@/components/ui/ActionButton'

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW'
const STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW']

type FolioLineItem = { id: string; source: string; label: string; amount: string | number; quantity: number }
type FolioPayment = { id: string; kind: 'DEPOSIT' | 'SETTLEMENT'; paymentMethod: { id: string; name: string }; amount: string | number; reference: string | null; createdAt: string }
type Folio = { id: string; folioNo: string; status: 'OPEN' | 'SETTLED'; lineItems: FolioLineItem[]; payments: FolioPayment[] }
type Guest = { id: string; name: string; idNumber: string | null; addedAt: string }
type Activity = {
  id: string
  action: string
  summary: string
  occurredAt: string
  employee: { id: string; firstName: string; lastName: string } | null
  location: { id: string; name: string } | null
}
type Stay = {
  id: string
  reservationNo: string
  checkIn: string
  checkOut: string
  status: ReservationStatus
  source: string
  cancellationReason: string | null
  cancellationNotes: string | null
  customer: { id: string; firstName: string; lastName: string | null; phone: string; customerNo: string }
  room: { number: string; roomType: { name: string } }
  location: { id: string; name: string } | null
  folio: Folio | null
  additionalGuests: Guest[]
  activities: Activity[]
}

function folioTotals(folio: Folio | null) {
  if (!folio) return { charges: 0, paid: 0, balance: 0 }
  const charges = folio.lineItems.reduce((sum, item) => sum + Number(item.amount) * item.quantity, 0)
  const paid = folio.payments.reduce((sum, p) => sum + Number(p.amount), 0)
  return { charges, paid, balance: charges - paid }
}

const STATUS_TONE: Record<ReservationStatus, PillTone> = {
  PENDING: 'warning',
  CONFIRMED: 'secondary',
  CHECKED_IN: 'success',
  CHECKED_OUT: 'muted',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
}

// Which desk received the guest, and who dealt with them — the check-in
// (or, if they never arrived, creation) event.
function deskOf(stay: Stay) {
  const event = stay.activities.find((a) => a.action === 'CHECKED_IN') ?? stay.activities.find((a) => a.action === 'CREATED')
  return { desk: event?.location?.name ?? stay.location?.name ?? null, by: event?.employee ? `${event.employee.firstName} ${event.employee.lastName}` : null }
}

const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'
const TH_SM = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider'

export default function Stays() {
  const toast = useToast()
  const [stays, setStays] = useState<Stay[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Stay | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (statusFilter) query.set('status', statusFilter)
      const response = await api<{ reservations: Stay[] }>(`/reception/reservations${query.size ? `?${query}` : ''}`)
      setStays(response.reservations)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load guest stays'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reception" title="Guest Stays" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="border-l-4 border-accent pl-3 sm:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">All stays</h2>
            <p className="text-xs text-muted-foreground">Active, past, cancelled and no-show — with full folio history.</p>
          </div>
          <label className="relative sm:w-72">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, reservation no, room…" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading guest stays…</div>
        ) : stays.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No stays match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Guest</th>
                  <th className={TH}>Room</th>
                  <th className={TH}>Stay</th>
                  <th className={TH}>Desk</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Balance</th>
                  <th className={cn(TH, 'text-right')}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stays.map((stay) => {
                  const totals = folioTotals(stay.folio)
                  const info = deskOf(stay)
                  return (
                    <tr key={stay.id} className="cursor-pointer align-middle transition even:bg-muted/30 hover:bg-muted/60" onClick={() => setSelected(stay)}>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold">{stay.customer.firstName} {stay.customer.lastName ?? ''}</p>
                        <p className="text-xs text-muted-foreground">{stay.reservationNo}</p>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{stay.room.number} · {stay.room.roomType.name}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground">
                        {new Date(stay.checkIn).toLocaleDateString()} – {new Date(stay.checkOut).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium">{info.desk ?? '—'}</p>
                        {info.by && <p className="text-xs text-muted-foreground">by {info.by}</p>}
                      </td>
                      <td className="px-5 py-3.5"><StatusPill tone={STATUS_TONE[stay.status]}>{titleCase(stay.status)}</StatusPill></td>
                      <td className={cn('px-5 py-3.5 text-right font-semibold tabular-nums', totals.balance > 0.005 && 'text-warning')}>{formatKes(totals.balance)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <ActionButton tone="neutral" icon={<LuEye />} title="View stay" onClick={() => setSelected(stay)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <StayDetailModal stay={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</p>
}

function StayDetailModal({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const totals = folioTotals(stay.folio)
  const info = deskOf(stay)
  return (
    <ModalShell
      size="lg"
      kicker={stay.folio?.folioNo ?? 'No folio'}
      title={`${stay.customer.firstName} ${stay.customer.lastName ?? ''}`.trim()}
      subtitle={`${stay.reservationNo} · Room ${stay.room.number} · ${stay.room.roomType.name} · ${titleCase(stay.source)}`}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 border-b bg-card text-sm sm:grid-cols-4">
        {([
          ['Status', <StatusPill key="s" tone={STATUS_TONE[stay.status]}>{titleCase(stay.status)}</StatusPill>],
          ['Check-in', new Date(stay.checkIn).toLocaleDateString()],
          ['Check-out', new Date(stay.checkOut).toLocaleDateString()],
          ['Desk', info.desk ? `${info.desk}${info.by ? ` · ${info.by}` : ''}` : '—'],
        ] as const).map(([label, value]) => (
          <div key={label} className="border-r px-4 py-3 last:border-r-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <div className="mt-1 text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-5 p-5">
        {stay.status === 'CANCELLED' && stay.cancellationReason && (
          <div className="border-2 border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-bold">{titleCase(stay.cancellationReason)}</p>
            {stay.cancellationNotes && <p className="mt-1 text-xs">{stay.cancellationNotes}</p>}
          </div>
        )}

        {stay.folio && (
          <>
            <div>
              <SectionTitle>Charges</SectionTitle>
              <div className="overflow-hidden border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-primary-foreground">
                    <tr><th className={TH_SM}>Charge</th><th className={TH_SM}>Qty</th><th className={cn(TH_SM, 'text-right')}>Amount</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {stay.folio.lineItems.map((item) => (
                      <tr key={item.id} className="even:bg-muted/30">
                        <td className="px-3 py-2">{item.label}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatKes(Number(item.amount) * item.quantity)}</td>
                      </tr>
                    ))}
                    {stay.folio.lineItems.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">No charges.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {stay.folio.payments.length > 0 && (
              <div>
                <SectionTitle>Payments</SectionTitle>
                <div className="overflow-hidden border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-primary-foreground">
                      <tr><th className={TH_SM}>Payment</th><th className={TH_SM}>Method</th><th className={cn(TH_SM, 'text-right')}>Amount</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {stay.folio.payments.map((p) => (
                        <tr key={p.id} className="even:bg-muted/30">
                          <td className="px-3 py-2">{titleCase(p.kind)}</td>
                          <td className="px-3 py-2">{p.paymentMethod.name}{p.reference ? ` · ${p.reference}` : ''}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatKes(Number(p.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {([
                ['Charges', formatKes(totals.charges), 'bg-secondary'],
                ['Paid', formatKes(totals.paid), 'bg-success'],
                ['Balance', formatKes(totals.balance), totals.balance > 0.005 ? 'bg-warning' : 'bg-muted-foreground'],
              ] as const).map(([label, value, bar]) => (
                <div key={label} className="flex border bg-card">
                  <span className={cn('w-1.5 shrink-0', bar)} />
                  <div className="min-w-0 flex-1 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                    <p className="mt-1 truncate text-lg font-bold tabular-nums leading-tight">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {stay.additionalGuests.length > 0 && (
          <div>
            <SectionTitle>Additional guests</SectionTitle>
            <div className="divide-y border">
              {stay.additionalGuests.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm even:bg-muted/30">
                  <span>{g.name}{g.idNumber ? ` · ${g.idNumber}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{new Date(g.addedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stay.activities.length > 0 && (
          <div>
            <SectionTitle>Activity</SectionTitle>
            <div className="divide-y border">
              {stay.activities.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm even:bg-muted/30">
                  <div>
                    <p>{a.summary}</p>
                    <p className="text-xs text-muted-foreground">{a.location ? a.location.name : 'Location unknown'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(a.occurredAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
