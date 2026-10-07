import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  LuBuilding2,
  LuCircleAlert,
  LuHandCoins,
  LuLoaderCircle,
  LuMinus,
  LuReceiptText,
  LuSearch,
  LuTruck,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Location = { id: string; name: string }
type MoneyCards = { debtorsTotal: number; posCredit: number; serviceCredit: number; rooms: number; creditors: number; netExposure: number }
type CreditRow = {
  id: string
  orderNumber: number
  customerName: string
  phone: string | null
  locationName: string | null
  reference: string
  description: string
  completedAt: string
  expectedAt: string | null
  reason: string | null
  total: number
  paid: number
  balance: number
}
type RoomRow = {
  id: string
  folioNo: string
  reservationNo: string
  guestName: string
  phone: string | null
  locationName: string | null
  roomNumber: string
  status: 'CHECKED_IN' | 'CHECKED_OUT_CREDIT'
  checkIn: string
  checkOut: string
  expectedAt: string | null
  reason: string | null
  total: number
  paid: number
  balance: number
}
type CreditorRow = { id: string; supplierName: string; phone: string | null; email: string | null; paymentTerms: string | null; balance: number; updatedAt: string }
type Report = {
  generatedAt: string
  cards: MoneyCards
  posCredit: CreditRow[]
  serviceCredit: CreditRow[]
  rooms: RoomRow[]
  creditors: CreditorRow[]
}

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
const overdue = (iso: string | null) => Boolean(iso && new Date(iso).getTime() < Date.now())

export default function CreditDebtorsReport() {
  const toast = useToast()
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (locationId) params.set('locationId', locationId)
      if (search.trim()) params.set('search', search.trim())
      setReport(await api<Report>(`/reports/credit-debtors?${params}`))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load the credit report'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [locationId, search, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])
  useEffect(() => { api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  const c = report?.cards

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reports" title="Credit & Debtors Report" />

      <div className="mt-6 rounded-sm border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, room, order, supplier..." className="w-full rounded-sm border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Live balances: POS/service credit and room folios are what customers owe you now; creditors are supplier balances owed now.</p>
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      {loading || !report || !c ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading credit report...</div>
      ) : (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard index={0} label="Debtors Total" value={formatKes(c.debtorsTotal)} icon={<LuUsers />} hint="Customers owing you" />
            <StatCard index={1} label="POS Credit" value={formatKes(c.posCredit)} icon={<LuReceiptText />} hint={`${report.posCredit.length} order${report.posCredit.length === 1 ? '' : 's'}`} />
            <StatCard index={2} label="Service Credit" value={formatKes(c.serviceCredit)} icon={<LuWallet />} hint={`${report.serviceCredit.length} service sale${report.serviceCredit.length === 1 ? '' : 's'}`} />
            <StatCard index={3} label="Rooms Owing" value={formatKes(c.rooms)} icon={<LuBuilding2 />} hint={`${report.rooms.length} folio${report.rooms.length === 1 ? '' : 's'}`} />
            <StatCard index={4} label="Creditors" value={formatKes(c.creditors)} icon={<LuTruck />} hint={`${report.creditors.length} supplier${report.creditors.length === 1 ? '' : 's'}`} />
            <StatCard tone={c.netExposure >= 0 ? 'success' : 'danger'} label="Net Exposure" value={formatKes(c.netExposure)} icon={c.netExposure >= 0 ? <LuHandCoins /> : <LuMinus />} hint="Debtors minus creditors" />
          </section>

          <CreditTable title="POS orders completed on credit" rows={report.posCredit} empty="No POS credit orders are pending." />
          <CreditTable title="Services completed on credit" rows={report.serviceCredit} empty="No service credit is pending." />
          <RoomsTable rows={report.rooms} />
          <CreditorsTable rows={report.creditors} />
        </>
      )}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
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

function CreditTable({ title, rows, empty }: { title: string; rows: CreditRow[]; empty: string }) {
  return (
    <Section title={title}>
      {rows.length === 0 ? <Empty text={empty} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">Completed</th><th className="px-4 py-2.5">Expected</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5 text-right">Paid</th><th className="px-4 py-2.5 text-right">Balance</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2.5 font-semibold">{row.reference}<p className="text-xs font-normal text-muted-foreground">{row.description || '-'}</p></td>
                <td className="px-4 py-2.5">{row.customerName}<p className="text-xs text-muted-foreground">{row.phone ?? '-'}</p></td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.locationName ?? '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{when(row.completedAt)}</td>
                <td className={cn('px-4 py-2.5', overdue(row.expectedAt) ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{when(row.expectedAt)}{row.reason && <p className="text-xs font-normal text-muted-foreground">{row.reason}</p>}</td>
                <MoneyCell value={row.total} />
                <MoneyCell value={row.paid} />
                <MoneyCell value={row.balance} strong danger />
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function RoomsTable({ rows }: { rows: RoomRow[] }) {
  return (
    <Section title="Rooms yet to be paid" note="Checked-in folios plus checked-out stays that were left on credit.">
      {rows.length === 0 ? <Empty text="No room balances are pending." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Stay</th><th className="px-4 py-2.5">Guest</th><th className="px-4 py-2.5">Room</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Expected</th><th className="px-4 py-2.5 text-right">Charges</th><th className="px-4 py-2.5 text-right">Paid</th><th className="px-4 py-2.5 text-right">Balance</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={`${row.status}-${row.folioNo}`} className="border-t">
                <td className="px-4 py-2.5 font-semibold">{row.reservationNo}<p className="text-xs font-normal text-muted-foreground">{row.folioNo} · {row.locationName ?? '-'}</p></td>
                <td className="px-4 py-2.5">{row.guestName}<p className="text-xs text-muted-foreground">{row.phone ?? '-'}</p></td>
                <td className="px-4 py-2.5">Room {row.roomNumber}</td>
                <td className="px-4 py-2.5"><span className={cn('rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-wide', row.status === 'CHECKED_IN' ? 'bg-secondary/10 text-secondary' : 'bg-warning/10 text-warning')}>{row.status === 'CHECKED_IN' ? 'Checked in' : 'Checked out credit'}</span></td>
                <td className={cn('px-4 py-2.5', overdue(row.expectedAt) ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{when(row.expectedAt)}{row.reason && <p className="text-xs font-normal text-muted-foreground">{row.reason}</p>}</td>
                <MoneyCell value={row.total} />
                <MoneyCell value={row.paid} />
                <MoneyCell value={row.balance} strong danger />
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function CreditorsTable({ rows }: { rows: CreditorRow[] }) {
  return (
    <Section title="Creditors / suppliers yet to be paid">
      {rows.length === 0 ? <Empty text="No supplier balances are pending." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">Contact</th><th className="px-4 py-2.5">Terms</th><th className="px-4 py-2.5">Updated</th><th className="px-4 py-2.5 text-right">Owed</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2.5 font-semibold">{row.supplierName}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.phone ?? row.email ?? '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.paymentTerms ?? '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{when(row.updatedAt)}</td>
                <MoneyCell value={row.balance} strong danger />
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

function MoneyCell({ value, strong, danger }: { value: number; strong?: boolean; danger?: boolean }) {
  return <td className={cn('px-4 py-2.5 text-right tabular-nums', strong && 'font-semibold', danger && value > 0.01 && 'text-destructive')}>{formatKes(value)}</td>
}

function Empty({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{text}</p>
}
