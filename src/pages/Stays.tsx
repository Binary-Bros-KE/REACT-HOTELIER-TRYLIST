import { useCallback, useEffect, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuSearch, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

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

const statusStyles: Record<ReservationStatus, string> = {
  PENDING: 'bg-warning/15 text-warning',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  CHECKED_IN: 'bg-success/10 text-success',
  CHECKED_OUT: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
  NO_SHOW: 'bg-destructive/10 text-destructive',
}

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
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
      <header>
        <p className="text-sm font-semibold text-secondary">Reception</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Guest Stays</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every reservation — active, past, cancelled, or no-show — with its full folio history.</p>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, reservation no, room…" className="w-full rounded-sm border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading guest stays…</div>
      ) : stays.length === 0 ? (
        <div className="mt-7 min-h-64 rounded-sm border bg-card p-16 text-center text-sm text-muted-foreground shadow-sm">No stays match your search.</div>
      ) : (
        <section className="mt-7 overflow-hidden rounded-sm border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Guest</th>
                  <th className="px-5 py-3">Room</th>
                  <th className="px-5 py-3">Stay</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {stays.map((stay) => {
                  const totals = folioTotals(stay.folio)
                  return (
                    <tr key={stay.id} className="cursor-pointer border-t transition hover:bg-muted/30" onClick={() => setSelected(stay)}>
                      <td className="px-5 py-4">
                        <p className="font-semibold">{stay.customer.firstName} {stay.customer.lastName ?? ''}</p>
                        <p className="text-xs text-muted-foreground">{stay.reservationNo}</p>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{stay.room.number} · {stay.room.roomType.name}</td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {new Date(stay.checkIn).toLocaleDateString()} – {new Date(stay.checkOut).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('rounded-full px-2 py-1 text-xs font-bold', statusStyles[stay.status])}>{titleCase(stay.status)}</span>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold">{formatKes(totals.balance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && <StayDetailModal stay={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StayDetailModal({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const totals = folioTotals(stay.folio)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-sm border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <p className="text-sm font-semibold text-secondary">{stay.folio?.folioNo ?? 'No folio'}</p>
            <h2 className="mt-1 font-display text-xl font-semibold">{stay.customer.firstName} {stay.customer.lastName ?? ''}</h2>
            <p className="text-xs text-muted-foreground">{stay.reservationNo} · Room {stay.room.number} · {stay.room.roomType.name} · {titleCase(stay.source)}</p>
          </div>
          <button onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', statusStyles[stay.status])}>{titleCase(stay.status)}</span>
            <span className="text-xs text-muted-foreground">{new Date(stay.checkIn).toLocaleDateString()} – {new Date(stay.checkOut).toLocaleDateString()}</span>
          </div>
          {stay.status === 'CANCELLED' && stay.cancellationReason && (
            <div className="rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-semibold">{titleCase(stay.cancellationReason)}</p>
              {stay.cancellationNotes && <p className="mt-1 text-xs">{stay.cancellationNotes}</p>}
            </div>
          )}

          {stay.folio && (
            <>
              <div className="overflow-hidden rounded-sm border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                    <tr><th className="px-3 py-2">Charge</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2 text-right">Amount</th></tr>
                  </thead>
                  <tbody>
                    {stay.folio.lineItems.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">{item.label}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatKes(Number(item.amount) * item.quantity)}</td>
                      </tr>
                    ))}
                    {stay.folio.lineItems.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">No charges.</td></tr>}
                  </tbody>
                </table>
              </div>
              {stay.folio.payments.length > 0 && (
                <div className="overflow-hidden rounded-sm border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                      <tr><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Amount</th></tr>
                    </thead>
                    <tbody>
                      {stay.folio.payments.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="px-3 py-2">{titleCase(p.kind)}</td>
                          <td className="px-3 py-2">{p.paymentMethod.name}{p.reference ? ` · ${p.reference}` : ''}</td>
                          <td className="px-3 py-2 text-right">{formatKes(Number(p.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="rounded-sm bg-muted/40 p-3 text-sm">
                <div className="flex justify-between"><span>Charges</span><span>{formatKes(totals.charges)}</span></div>
                <div className="flex justify-between text-success"><span>Paid</span><span>-{formatKes(totals.paid)}</span></div>
                <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>Balance</span><span>{formatKes(totals.balance)}</span></div>
              </div>
            </>
          )}

          {stay.additionalGuests.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Additional guests</p>
              <div className="space-y-1.5">
                {stay.additionalGuests.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-sm border p-2.5 text-sm">
                    <span>{g.name}{g.idNumber ? ` · ${g.idNumber}` : ''}</span>
                    <span className="text-xs text-muted-foreground">{new Date(g.addedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stay.activities.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
              <div className="space-y-1.5">
                {stay.activities.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 rounded-sm border p-2.5 text-sm">
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
      </div>
    </div>
  )
}
