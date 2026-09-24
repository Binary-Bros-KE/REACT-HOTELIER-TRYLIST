import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { LuCircleAlert, LuFileText, LuLoaderCircle, LuPlus, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'
import ModalShell from '@/components/ui/ModalShell'
import type { DocProfile } from '@/components/documents/pdf'
import type { GroupInvoiceDocData } from '@/components/documents/pdf/GroupInvoiceDocument'
import { CreditFields, defaultTerms, termsInvalid, termsPayload, type RoomTerms } from '@/components/reception/RoomTerms'
import RoomTermsFields from '@/components/reception/RoomTerms'
import GroupRoomsBuilder, { rowsMissingRate, rowsToPayload, type PickCustomer, type PickRoom, type RoomRow } from '@/components/reception/GroupRoomsBuilder'
import type { BizTax } from '@/lib/taxChoices'

// The PDF renderer is heavy — only load it when an invoice is actually opened.
const DocumentViewer = lazy(() => import('@/components/documents/DocumentViewer'))

type Api = <T>(path: string, init?: RequestInit) => Promise<T>

type Line = {
  amount: string | number
  quantity: number
  source: string
  label: string
  taxRate?: string | number | null
  taxMode?: 'INCLUSIVE' | 'EXCLUSIVE' | null
  taxTreatment?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | null
}
type GroupReservation = {
  id: string
  reservationNo: string
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW'
  adults: number
  children: number
  checkIn: string
  checkOut: string
  customerId: string
  customer: { id: string; firstName: string; lastName: string }
  room: { id: string; number: string; roomType: { name: string } }
  additionalGuests: { id: string; name: string }[]
  folio: { id: string; status: string; creditAmount: string | number; creditReason: string | null; creditExpectedAt: string | null; creditOutstanding?: number; lineItems: Line[]; payments: { amount: string | number }[] } | null
}
type Group = {
  id: string
  groupNo: string
  name: string
  notes: string | null
  customer: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null }
  reservations: GroupReservation[]
  summary: { rooms: number; pending: number; checkedIn: number; checkedOut: number; guests: number; charges: number; paid: number; balance: number; creditOutstanding: number }
}
type Method = { id: string; name: string; requiresReference: boolean; code: string }
type PayRow = { key: string; methodId: string; amount: string; reference: string }

const kes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10) }
const nightsBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000))
const STATUS_STYLE: Record<GroupReservation['status'], string> = {
  PENDING: 'border-warning/70 text-warning', CONFIRMED: 'border-secondary/70 text-secondary', CHECKED_IN: 'border-success/70 text-success',
  CHECKED_OUT: 'border-muted-foreground/50 text-muted-foreground', CANCELLED: 'border-destructive/70 text-destructive', NO_SHOW: 'border-destructive/70 text-destructive',
}
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')

// Gross (tax-inclusive, what the guest is actually charged) per line, split
// by sign into charges vs. discounts — same tax resolution as the server's
// folioTotals (item's own snapshot, else the property default).
function lineGross(line: Line, bizTax: BizTax | null) {
  const sub = Number(line.amount) * line.quantity
  const rate = line.taxRate != null ? Number(line.taxRate) : bizTax?.taxRate != null ? Number(bizTax.taxRate) : 16
  const mode = line.taxMode ?? bizTax?.taxMode ?? 'INCLUSIVE'
  const treatment = line.taxTreatment ?? bizTax?.taxTreatment ?? 'STANDARD'
  if (treatment === 'EXEMPT' || treatment === 'ZERO_RATED' || rate <= 0) return sub
  return mode === 'EXCLUSIVE' ? sub * (1 + rate / 100) : sub
}
const lineTotals = (lines: Line[], bizTax: BizTax | null) => {
  const values = lines.map((l) => lineGross(l, bizTax))
  return { charges: round2(values.filter((v) => v > 0).reduce((a, b) => a + b, 0)), discounts: round2(-values.filter((v) => v < 0).reduce((a, b) => a + b, 0)) }
}
const balanceOf = (r: GroupReservation, bizTax: BizTax | null) => {
  if (!r.folio) return 0
  const charges = r.folio.lineItems.reduce((s, l) => s + lineGross(l, bizTax), 0)
  const paid = r.folio.payments.reduce((s, p) => s + Number(p.amount), 0)
  return round2(charges - paid)
}

function PaymentRows({ methods, rows, onChange }: { methods: Method[]; rows: PayRow[]; onChange: (rows: PayRow[]) => void }) {
  const set = (key: string, patch: Partial<PayRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const method = methods.find((m) => m.id === row.methodId)
        return (
          <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
            <select className="input" value={row.methodId} onChange={(e) => set(row.key, { methodId: e.target.value })}>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="number" min="0" step="0.01" className="input" value={row.amount} onChange={(e) => set(row.key, { amount: e.target.value })} placeholder="Amount" />
            <input className="input" value={row.reference} onChange={(e) => set(row.key, { reference: e.target.value })} placeholder={method?.requiresReference ? 'Reference *' : 'Reference (optional)'} />
            <button type="button" disabled={rows.length === 1} onClick={() => onChange(rows.filter((r) => r.key !== row.key))} className="px-2 text-muted-foreground hover:text-destructive disabled:opacity-30" title="Remove payment"><LuX className="size-4" /></button>
          </div>
        )
      })}
      <button type="button" onClick={() => onChange([...rows, { key: Math.random().toString(36).slice(2), methodId: methods[0]?.id ?? '', amount: '', reference: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"><LuPlus className="size-3.5" /> Split across another payment</button>
    </div>
  )
}

export default function GroupModal({ groupId, at, rooms, customers, onClose, onChanged, onOpenStay }: {
  groupId: string
  at: Api
  rooms: PickRoom[]
  customers: PickCustomer[]
  onClose: () => void
  onChanged: () => void
  onOpenStay: (reservationId: string) => void
}) {
  const toast = useToast()
  const canCollectCredit = useAppSelector((s) => s.auth.user?.role?.name === 'Super Admin' || Boolean(s.auth.user?.role?.permissions.includes('CREDIT_COLLECT')))
  const [group, setGroup] = useState<Group | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'rooms' | 'add' | 'checkout' | 'credit'>('rooms')
  const [methods, setMethods] = useState<Method[]>([])
  const [profile, setProfile] = useState<DocProfile>(null)
  const [bizTax, setBizTax] = useState<BizTax | null>(null)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [busy, setBusy] = useState('')

  // checkout
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [payments, setPayments] = useState<PayRow[]>([])
  const [creditReason, setCreditReason] = useState('')
  const [creditExpectedAt, setCreditExpectedAt] = useState(day(14))
  // credit payments
  const [creditPayments, setCreditPayments] = useState<PayRow[]>([])
  // add rooms
  const [addRows, setAddRows] = useState<RoomRow[]>([])
  const [addTerms, setAddTerms] = useState<RoomTerms>(defaultTerms())
  const [addIn, setAddIn] = useState(day())
  const [addOut, setAddOut] = useState(day(1))
  const [addStatus, setAddStatus] = useState<'CHECKED_IN' | 'PENDING'>('CHECKED_IN')

  const load = useCallback(async () => {
    try {
      const response = await at<{ group: Group }>(`/reception/groups/${groupId}`)
      setGroup(response.group)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the group')
    }
  }, [at, groupId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api<{ methods: Method[] }>('/payment-methods?activeOnly=true').then((r) => {
      const list = r.methods.filter((m) => m.code !== 'ROOM_CHARGE')
      setMethods(list)
      const fresh = (): PayRow[] => [{ key: Math.random().toString(36).slice(2), methodId: list[0]?.id ?? '', amount: '', reference: '' }]
      setPayments(fresh())
      setCreditPayments(fresh())
    }).catch(() => {})
    api<{ profile: DocProfile }>('/business-profile').then((r) => setProfile(r.profile)).catch(() => {})
    api<{ profile: BizTax | null }>('/business-profile').then((r) => setBizTax(r.profile)).catch(() => {})
  }, [])

  // Every checked-in room is selected for checkout by default (and again after each reload).
  useEffect(() => {
    if (group) setSelected(new Set(group.reservations.filter((r) => r.status === 'CHECKED_IN').map((r) => r.id)))
  }, [group])

  const live = useMemo(() => (group?.reservations ?? []).filter((r) => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW'), [group])
  const inHouse = live.filter((r) => r.status === 'CHECKED_IN')
  const chosen = inHouse.filter((r) => selected.has(r.id))
  const due = round2(chosen.reduce((s, r) => s + Math.max(0, balanceOf(r, bizTax)), 0))
  const payTotal = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))
  const remaining = round2(due - payTotal)
  const owingRooms = live.filter((r) => (r.folio?.creditOutstanding ?? 0) > 0.01)
  const owing = round2(owingRooms.reduce((s, r) => s + (r.folio?.creditOutstanding ?? 0), 0))
  const creditPayTotal = round2(creditPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0))
  const everCredited = live.some((r) => Number(r.folio?.creditAmount ?? 0) > 0)

  const invoice = useMemo<GroupInvoiceDocData | null>(() => {
    if (!group) return null
    const roomsDoc = live.map((r) => {
      const t = lineTotals(r.folio?.lineItems ?? [], bizTax)
      const names = r.additionalGuests.map((g) => g.name)
      if (names.length === 0 && r.customerId !== group.customer.id) names.push(`${r.customer.firstName} ${r.customer.lastName}`.trim())
      return { room: r.room.number, roomType: r.room.roomType.name, guests: names, checkIn: r.checkIn, checkOut: r.checkOut, charges: t.charges, discounts: t.discounts, total: round2(t.charges - t.discounts), paid: round2((r.folio?.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)) }
    })
    const sum = (key: 'charges' | 'discounts' | 'total' | 'paid') => round2(roomsDoc.reduce((s, r) => s + r[key], 0))
    const dates = owingRooms.flatMap((r) => (r.folio?.creditExpectedAt ? [r.folio.creditExpectedAt] : [])).sort()
    return {
      groupNo: group.groupNo,
      name: group.name,
      issuedAt: new Date().toISOString(),
      customer: { name: `${group.customer.firstName} ${group.customer.lastName}`.trim(), phone: group.customer.phone, email: group.customer.email },
      expectedBy: dates[0] ?? null,
      creditReason: owingRooms.find((r) => r.folio?.creditReason)?.folio?.creditReason ?? null,
      rooms: roomsDoc,
      totals: { charges: sum('charges'), discounts: sum('discounts'), total: sum('total'), paid: sum('paid'), balance: round2(sum('total') - sum('paid')) },
    }
  }, [group, live, owingRooms])

  async function run<T>(key: string, action: () => Promise<T>, success: string): Promise<T | undefined> {
    setBusy(key)
    try {
      const result = await action()
      toast.success(success)
      await load()
      onChanged()
      return result
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'That did not go through')
      return undefined
    } finally {
      setBusy('')
    }
  }

  const checkPayRows = (rows: PayRow[]) => {
    for (const row of rows) {
      const amount = Number(row.amount) || 0
      if (amount <= 0) continue
      const method = methods.find((m) => m.id === row.methodId)
      if (!method) return 'Choose a payment method'
      if (method.requiresReference && !row.reference.trim()) return `${method.name} requires a reference number`
    }
    return null
  }
  const payload = (rows: PayRow[]) => rows.filter((r) => Number(r.amount) > 0).map((r) => ({ paymentMethodId: r.methodId, amount: Number(r.amount), reference: r.reference.trim() || undefined }))

  async function checkoutGroup() {
    const problem = checkPayRows(payments)
    if (problem) { toast.error(problem); return }
    if (chosen.length === 0) { toast.error('Choose at least one room'); return }
    if (remaining < -0.01) { toast.error('Payments are more than the balance due'); return }
    if (remaining > 0.01 && (creditReason.trim().length < 3 || !creditExpectedAt)) { toast.error('Give a reason for the credit and an expected payment date'); return }
    const everyone = chosen.length === inHouse.length
    const done = await run('checkout', () => at(`/reception/groups/${groupId}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ ...(everyone ? {} : { reservationIds: chosen.map((r) => r.id) }), payments: payload(payments), ...(remaining > 0.01 ? { creditReason: creditReason.trim(), creditExpectedAt } : {}) }),
    }), remaining > 0.01 ? `Checked out ${chosen.length} room${chosen.length === 1 ? '' : 's'} on credit — ${kes(remaining)} owing.` : `Checked out ${chosen.length} room${chosen.length === 1 ? '' : 's'}.`)
    if (done !== undefined) { setPayments((rows) => rows.map((r, i) => (i === 0 ? { ...r, amount: '', reference: '' } : r)).slice(0, 1)); setTab(remaining > 0.01 ? 'credit' : 'rooms') }
  }

  async function receiveCredit() {
    const problem = checkPayRows(creditPayments)
    if (problem) { toast.error(problem); return }
    if (creditPayTotal <= 0) { toast.error('Enter an amount'); return }
    if (creditPayTotal > owing + 0.01) { toast.error('That is more than is owed'); return }
    const done = await run('credit', () => at(`/reception/groups/${groupId}/credit-payments`, { method: 'POST', body: JSON.stringify({ payments: payload(creditPayments) }) }), 'Payment received.')
    if (done !== undefined) setCreditPayments((rows) => rows.map((r, i) => (i === 0 ? { ...r, amount: '', reference: '' } : r)).slice(0, 1))
  }

  async function addRooms() {
    if (addRows.length === 0) { toast.error('Pick at least one room'); return }
    if (termsInvalid(addTerms)) { toast.error(termsInvalid(addTerms)!); return }
    const done = await run('add', () => at(`/reception/groups/${groupId}/rooms`, {
      method: 'POST',
      body: JSON.stringify({ checkIn: addIn, checkOut: addOut, status: addStatus, terms: termsPayload(addTerms), rooms: rowsToPayload(addRows) }),
    }), `${addRows.length} room${addRows.length === 1 ? '' : 's'} added.`)
    if (done !== undefined) { setAddRows([]); setTab('rooms') }
  }

  if (!group) {
    return (
      <ModalShell size="xl" kicker="Group" title="Loading…" onClose={onClose}>
        <div className="p-16 text-center text-sm text-muted-foreground">{error ? <span className="text-destructive">{error}</span> : <LuLoaderCircle className="mx-auto animate-spin" />}</div>
      </ModalShell>
    )
  }

  const tabs: [typeof tab, string][] = [['rooms', 'Rooms'], ['add', 'Add rooms'], ['checkout', 'Group checkout'], ...(everCredited ? [['credit', 'Credit & payments'] as [typeof tab, string]] : [])]
  return (
    <>
      <ModalShell size="xl" kicker={group.groupNo} title={group.name} subtitle={`Billed to ${group.customer.firstName} ${group.customer.lastName}`.trim()} onClose={onClose}>
        <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
          {([
            ['Rooms', `${group.summary.rooms}`, `${group.summary.checkedIn} in house · ${group.summary.pending} waiting`],
            ['Guests', `${group.summary.guests}`, ''],
            ['Charges', kes(group.summary.charges), `Paid ${kes(group.summary.paid)}`],
            ['Balance', kes(Math.max(0, group.summary.balance)), owing > 0.01 ? `${kes(owing)} owing on credit` : ''],
          ] as const).map(([label, value, sub]) => (
            <div key={label} className="bg-card px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight">{value}</p>
              {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
            </div>
          ))}
        </div>

        <div className="flex border-b bg-muted/40">
          {tabs.map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={cn('flex-1 border-b-4 px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition', tab === value ? 'border-secondary bg-card text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground')}>{label}</button>
          ))}
        </div>

        <div className="p-5">
          {error && <div className="mb-4 flex items-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

          {tab === 'rooms' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Each room is its own stay, with its own folio and guests. Open one to add charges or extend it.</p>
                <div className="flex flex-wrap gap-2">
                  {group.summary.pending > 0 && (
                    <button type="button" disabled={busy === 'checkin'} onClick={() => void run('checkin', () => at(`/reception/groups/${groupId}/check-in`, { method: 'POST', body: '{}' }), 'Waiting rooms checked in.')} className="inline-flex items-center gap-2 bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                      {busy === 'checkin' && <LuLoaderCircle className="size-3.5 animate-spin" />} Check in {group.summary.pending} waiting
                    </button>
                  )}
                  <button type="button" onClick={() => setInvoiceOpen(true)} className="inline-flex items-center gap-1.5 border-2 border-foreground/20 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted"><LuFileText className="size-3.5" /> Invoice</button>
                </div>
              </div>
              <div className="overflow-x-auto border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground"><tr><th className="px-3 py-2">Room</th><th className="px-3 py-2">Staying</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Balance</th><th /></tr></thead>
                  <tbody className="divide-y">
                    {group.reservations.map((r) => (
                      <tr key={r.id} className="align-middle even:bg-muted/30">
                        <td className="px-3 py-2.5 font-semibold">{r.room.number}<span className="block text-xs font-normal text-muted-foreground">{r.room.roomType.name} · {nightsBetween(r.checkIn, r.checkOut)} night{nightsBetween(r.checkIn, r.checkOut) === 1 ? '' : 's'}</span></td>
                        <td className="px-3 py-2.5 text-xs">{r.additionalGuests.length ? r.additionalGuests.map((g) => g.name).join(', ') : `${r.customer.firstName} ${r.customer.lastName}`.trim()}<span className="block text-muted-foreground">{r.adults} adult{r.adults === 1 ? '' : 's'}{r.children ? `, ${r.children} child${r.children === 1 ? '' : 'ren'}` : ''}</span></td>
                        <td className="px-3 py-2.5"><span className={cn('inline-block border border-dashed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', STATUS_STYLE[r.status])}>{titleCase(r.status)}</span></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{kes(Math.max(0, balanceOf(r, bizTax)))}{(r.folio?.creditOutstanding ?? 0) > 0.01 && <span className="block text-[11px] text-warning">on credit</span>}</td>
                        <td className="px-3 py-2.5 text-right">
                          {r.status === 'CHECKED_IN' && <button type="button" onClick={() => onOpenStay(r.id)} className="text-xs font-semibold text-secondary hover:underline">Manage stay</button>}
                          {(r.status === 'PENDING' || r.status === 'CONFIRMED') && <button type="button" disabled={busy === r.id} onClick={() => void run(r.id, () => at(`/reception/reservations/${r.id}/check-in`, { method: 'PATCH', body: '{}' }), `Room ${r.room.number} checked in.`)} className="text-xs font-semibold text-secondary hover:underline">Check in</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'add' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium">Check-in date<input type="date" className="input mt-1.5" value={addIn} onChange={(e) => setAddIn(e.target.value)} /></label>
                <label className="text-sm font-medium">Check-out date<input type="date" className="input mt-1.5" min={addIn} value={addOut} onChange={(e) => setAddOut(e.target.value)} /></label>
                <div>
                  <p className="text-sm font-medium">Arrival</p>
                  <div className="mt-1.5 grid grid-cols-2 border-2 border-foreground/20 text-[11px] font-bold uppercase tracking-wider">
                    {([['CHECKED_IN', 'Check in now'], ['PENDING', 'Reserve']] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setAddStatus(v)} className={cn('px-2 py-2.5', addStatus === v ? 'bg-secondary text-secondary-foreground' : 'bg-card hover:bg-muted')}>{l}</button>)}
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Terms for these rooms</p>
                <RoomTermsFields value={addTerms} onChange={setAddTerms} />
              </div>
              <GroupRoomsBuilder rooms={rooms} customers={customers} rows={addRows} onChange={setAddRows} groupTerms={addTerms} nights={nightsBetween(addIn, addOut)} />
              <button type="button" disabled={busy === 'add' || addRows.length === 0 || nightsBetween(addIn, addOut) <= 0 || rowsMissingRate(addRows, rooms)} onClick={() => void addRooms()} className="inline-flex items-center gap-2 bg-success px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50">
                {busy === 'add' && <LuLoaderCircle className="size-4 animate-spin" />} Add {addRows.length || ''} room{addRows.length === 1 ? '' : 's'} to the group
              </button>
            </div>
          )}

          {tab === 'checkout' && (
            inHouse.length === 0 ? (
              <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">No rooms in this group are checked in.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rooms leaving ({chosen.length} of {inHouse.length})</p>
                    <div className="flex gap-3 text-xs font-semibold text-secondary">
                      <button type="button" onClick={() => setSelected(new Set(inHouse.map((r) => r.id)))} className="hover:underline">All</button>
                      <button type="button" onClick={() => setSelected(new Set())} className="hover:underline">None</button>
                    </div>
                  </div>
                  <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {inHouse.map((r) => (
                      <label key={r.id} className={cn('flex cursor-pointer items-center justify-between gap-2 border px-3 py-2 text-sm', selected.has(r.id) && 'border-secondary bg-secondary/5')}>
                        <span className="flex items-center gap-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => setSelected((cur) => { const next = new Set(cur); if (next.has(r.id)) next.delete(r.id); else next.add(r.id); return next })} /> <span className="font-semibold">Room {r.room.number}</span></span>
                        <span className="tabular-nums text-muted-foreground">{kes(Math.max(0, balanceOf(r, bizTax)))}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-sm bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between"><span>Total balance due</span><span className="font-bold">{kes(due)}</span></div>
                  <div className="flex justify-between text-success"><span>Paying now</span><span>{kes(payTotal)}</span></div>
                  <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>{remaining > 0.01 ? 'Left owing (on credit)' : 'Remaining'}</span><span className={remaining > 0.01 ? 'text-warning' : ''}>{kes(Math.max(0, remaining))}</span></div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment</p>
                    {due > 0.01 && <button type="button" onClick={() => setPayments((rows) => rows.map((r, i) => (i === 0 ? { ...r, amount: String(due) } : { ...r, amount: '' })))} className="text-xs font-semibold text-secondary hover:underline">Pay the full balance ({kes(due)})</button>}
                  </div>
                  <PaymentRows methods={methods} rows={payments} onChange={setPayments} />
                </div>

                {remaining > 0.01 && <CreditFields reason={creditReason} expectedAt={creditExpectedAt} onReason={setCreditReason} onExpectedAt={setCreditExpectedAt} />}
                {remaining < -0.01 && <p className="text-xs font-semibold text-destructive">Payments are more than the balance due.</p>}

                <button type="button" disabled={busy === 'checkout' || chosen.length === 0 || remaining < -0.01} onClick={() => void checkoutGroup()} className={cn('inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-50', remaining > 0.01 ? 'bg-warning' : 'bg-success')}>
                  {busy === 'checkout' && <LuLoaderCircle className="size-4 animate-spin" />}
                  {remaining > 0.01 ? `Check out ${chosen.length} room${chosen.length === 1 ? '' : 's'} on credit` : `Check out ${chosen.length} room${chosen.length === 1 ? '' : 's'}`}
                </button>
                <p className="text-xs text-muted-foreground">One payment (or a mix — card, cash, M-Pesa) is spread across the chosen rooms. Whatever isn't paid stays on {group.customer.firstName}'s account to be invoiced. Rooms go to Housekeeping.</p>
              </div>
            )
          )}

          {tab === 'credit' && (
            <div className="space-y-4">
              {owing > 0.01 ? (
                <>
                  <div className="border-2 border-warning/50 bg-warning/5 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-warning">Owing on credit</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">Send the invoice so {group.customer.firstName} can pay, then record payments here as they arrive.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold tabular-nums text-warning">{kes(owing)}</p>
                        <button type="button" onClick={() => setInvoiceOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"><LuFileText className="size-3.5" /> View / print invoice</button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground"><tr><th className="px-3 py-2">Room</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Expected</th><th className="px-3 py-2 text-right">Owing</th></tr></thead>
                      <tbody className="divide-y">
                        {owingRooms.map((r) => (
                          <tr key={r.id} className="even:bg-muted/30">
                            <td className="px-3 py-2 font-semibold">{r.room.number}</td>
                            <td className="px-3 py-2 text-xs">{r.folio?.creditReason ?? '—'}</td>
                            <td className="px-3 py-2 text-xs">{r.folio?.creditExpectedAt ? new Date(r.folio.creditExpectedAt).toLocaleDateString() : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{kes(r.folio?.creditOutstanding ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!canCollectCredit && <p className="border border-warning/40 bg-warning/5 p-3 text-sm font-semibold text-warning">Only an accountant or manager can clear debts - ask them to record this payment.</p>}
                  {canCollectCredit && <><div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Receive payment</p>
                      <button type="button" onClick={() => setCreditPayments((rows) => rows.map((r, i) => (i === 0 ? { ...r, amount: String(owing) } : { ...r, amount: '' })))} className="text-xs font-semibold text-secondary hover:underline">Pay it all ({kes(owing)})</button>
                    </div>
                    <PaymentRows methods={methods} rows={creditPayments} onChange={setCreditPayments} />
                  </div>
                  <button type="button" disabled={busy === 'credit' || creditPayTotal <= 0} onClick={() => void receiveCredit()} className="inline-flex items-center gap-2 bg-success px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50">
                    {busy === 'credit' && <LuLoaderCircle className="size-4 animate-spin" />} Receive {creditPayTotal > 0 ? kes(creditPayTotal) : 'payment'}
                  </button></>}
                </>
              ) : (
                <p className="border border-success/40 bg-success/5 p-6 text-center text-sm text-success">All credit for this group has been paid.</p>
              )}
            </div>
          )}
        </div>
      </ModalShell>
      {invoiceOpen && invoice && <Suspense fallback={null}><DocumentViewer kind="group-invoice" data={invoice} profile={profile} onClose={() => setInvoiceOpen(false)} /></Suspense>}
    </>
  )
}
