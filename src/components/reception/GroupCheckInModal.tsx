import { useMemo, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import SearchableSelect from '@/components/ui/SearchableSelect'
import RoomTermsFields, { defaultTerms, termsDiscount, termsInvalid, termsPayload, type RoomTerms } from '@/components/reception/RoomTerms'
import GroupRoomsBuilder, { MEAL_PLAN_LABELS, parseOccupants, rateFor, rowsToPayload, type PickCustomer, type PickRoom, type RoomRow } from '@/components/reception/GroupRoomsBuilder'

type Api = <T>(path: string, init?: RequestInit) => Promise<T>

const SOURCES = ['CORPORATE', 'WALK_IN', 'PHONE', 'WEBSITE', 'TRAVEL_AGENT', 'OTHER'] as const
const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10) }
const nightsBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000))
const kes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const STEPS = ['Party', 'Rooms', 'Review'] as const

export default function GroupCheckInModal({ customers, rooms, at, onClose, onDone, onCustomerCreated }: {
  customers: PickCustomer[]
  rooms: PickRoom[]
  at: Api
  onClose: () => void
  onDone: (groupId: string) => void
  onCustomerCreated: () => void
}) {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [customerId, setCustomerId] = useState('')
  const [company, setCompany] = useState({ firstName: '', lastName: '', phone: '', email: '' })
  const [name, setName] = useState('')
  const [checkIn, setCheckIn] = useState(day())
  const [checkOut, setCheckOut] = useState(day(1))
  const [source, setSource] = useState<(typeof SOURCES)[number]>('CORPORATE')
  const [arrival, setArrival] = useState<'CHECKED_IN' | 'PENDING'>('CHECKED_IN')
  const [notes, setNotes] = useState('')
  const [groupTerms, setGroupTerms] = useState<RoomTerms>(defaultTerms())
  const [rows, setRows] = useState<RoomRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const nights = nightsBetween(checkIn, checkOut)
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])
  const billing = customers.find((c) => c.id === customerId)
  const partyValid = Boolean(name.trim()) && (mode === 'existing' ? Boolean(customerId) : Boolean(company.firstName.trim()) && company.phone.trim().length >= 5)
  const roomsValid = rows.length > 0 && nights > 0 && !termsInvalid(groupTerms) && rows.every((r) => !(r.ownTerms && termsInvalid(r.terms)))
  const valid = [partyValid, roomsValid, true]

  const review = useMemo(() => {
    let gross = 0
    let off = 0
    let people = 0
    for (const row of rows) {
      const room = roomById.get(row.roomId)
      if (!room) continue
      const rowGross = rateFor(room, row.mealPlan) * nights
      gross += rowGross
      off += termsDiscount(row.ownTerms ? row.terms : groupTerms, rowGross)
      people += Math.max(parseOccupants(row.occupants).length, Number(row.adults) + Number(row.children) || 1)
    }
    return { gross, off, net: gross - off, people }
  }, [rows, roomById, nights, groupTerms])

  async function complete() {
    setSaving(true)
    setError('')
    try {
      let id = customerId
      if (mode === 'new') {
        const created = await at<{ customer: { id: string } }>('/reception/customers', {
          method: 'POST',
          body: JSON.stringify({ customerType: 'BUSINESS', firstName: company.firstName, lastName: company.lastName || undefined, phone: company.phone, email: company.email || undefined }),
        })
        id = created.customer.id
        // If the booking below fails, retrying must not create the company twice.
        setCustomerId(id)
        setMode('existing')
        onCustomerCreated()
      }
      const result = await at<{ group: { id: string } }>('/reception/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), customerId: id, checkIn, checkOut, source, status: arrival, notes: notes.trim() || undefined,
          terms: termsPayload(groupTerms),
          rooms: rowsToPayload(rows),
        }),
      })
      toast.success(arrival === 'CHECKED_IN' ? `Group checked in — ${rows.length} room${rows.length === 1 ? '' : 's'}.` : `Group reserved — ${rows.length} room${rows.length === 1 ? '' : 's'}.`)
      onDone(result.group.id)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not create the group'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const last = step === STEPS.length - 1
  return (
    <ModalShell
      size="xl"
      kicker="Reception"
      title="New Group"
      subtitle={STEPS[step]}
      onClose={onClose}
      footer={
        <>
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Back</button>}
          {!last ? (
            <button type="button" disabled={!valid[step]} onClick={() => setStep(step + 1)} className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-50">Next</button>
          ) : (
            <button type="button" disabled={saving || !valid[0] || !valid[1]} onClick={() => void complete()} className="inline-flex items-center gap-2 bg-success px-5 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50">
              {saving && <LuLoaderCircle className="size-4 animate-spin" />} {arrival === 'CHECKED_IN' ? 'Check in group' : 'Reserve group'}
            </button>
          )}
        </>
      }
    >
      <div className="flex border-b bg-muted/40">
        {STEPS.map((label, i) => (
          <button key={label} type="button" onClick={i < step || (i > step && valid.slice(0, i).every(Boolean)) ? () => setStep(i) : undefined} disabled={!(i < step || (i > step && valid.slice(0, i).every(Boolean)))}
            className={cn('flex flex-1 items-center gap-2 border-b-4 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition', i === step ? 'border-secondary bg-card text-foreground' : i < step ? 'border-success bg-card text-success hover:bg-muted' : 'border-transparent text-muted-foreground')}>
            <span className={cn('flex size-5 items-center justify-center text-[11px]', i === step ? 'bg-secondary text-secondary-foreground' : i < step ? 'bg-success text-white' : 'bg-muted')}>{i + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-5 p-5">
        {error && <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        {step === 0 && (
          <>
            <div>
              <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Group</p>
              <label className="block text-sm font-medium">Group name *
                <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Safaricom staff retreat" maxLength={120} />
              </label>
            </div>
            <div>
              <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Who pays (billing customer)</p>
              <div className="grid grid-cols-2 border-2 border-foreground/20 text-xs font-bold uppercase tracking-wider">
                {(['existing', 'new'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={cn('px-3 py-2.5 transition', mode === m ? 'bg-secondary text-secondary-foreground' : 'bg-card hover:bg-muted')}>{m === 'existing' ? 'Existing customer' : 'New company / customer'}</button>
                ))}
              </div>
              {mode === 'existing' ? (
                <div className="mt-3">
                  <SearchableSelect
                    options={customers.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`.trim(), hint: c.phone ?? undefined }))}
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="Search by name or phone…"
                    searchPlaceholder="Search customers…"
                    emptyText="No customers match — create a new one."
                  />
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">Company / name *<input className="input mt-1.5" value={company.firstName} onChange={(e) => setCompany({ ...company, firstName: e.target.value })} /></label>
                  <label className="text-sm font-medium">Contact person<input className="input mt-1.5" value={company.lastName} onChange={(e) => setCompany({ ...company, lastName: e.target.value })} /></label>
                  <label className="text-sm font-medium">Phone *<input className="input mt-1.5" value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></label>
                  <label className="text-sm font-medium">Email<input type="email" className="input mt-1.5" value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></label>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">The whole party is billed to this customer — they check out and pay for every room together, or the balance is left on their account to be invoiced.</p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="text-sm font-medium">Check-in date<input type="date" className="input mt-1.5" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></label>
              <label className="text-sm font-medium">Check-out date<input type="date" className="input mt-1.5" min={checkIn} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></label>
              <label className="text-sm font-medium">Source
                <select className="input mt-1.5" value={source} onChange={(e) => setSource(e.target.value as (typeof SOURCES)[number])}>{SOURCES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>
              </label>
              <div>
                <p className="text-sm font-medium">Arrival</p>
                <div className="mt-1.5 grid grid-cols-2 border-2 border-foreground/20 text-[11px] font-bold uppercase tracking-wider">
                  {([['CHECKED_IN', 'Check in now'], ['PENDING', 'Reserve']] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setArrival(value)} className={cn('px-2 py-2.5 transition', arrival === value ? 'bg-secondary text-secondary-foreground' : 'bg-card hover:bg-muted')}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            {nights <= 0 && <p className="text-xs font-semibold text-destructive">Check-out must be after check-in.</p>}
            <div>
              <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Terms for every room <span className="font-normal normal-case">(a room can override below)</span></p>
              <RoomTermsFields value={groupTerms} onChange={setGroupTerms} />
            </div>
            <div>
              <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Rooms ({rows.length})</p>
              <GroupRoomsBuilder rooms={rooms} customers={customers} rows={rows} onChange={setRows} groupTerms={groupTerms} nights={nights} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="divide-y border bg-muted/30 text-sm">
              {([
                ['Group', name || '—'],
                ['Billed to', mode === 'existing' ? (billing ? `${billing.firstName} ${billing.lastName}`.trim() : '—') : company.firstName],
                ['Stay', `${new Date(checkIn).toLocaleDateString()} – ${new Date(checkOut).toLocaleDateString()} (${nights} night${nights === 1 ? '' : 's'})`],
                ['Rooms', `${rows.length} · about ${review.people} guest${review.people === 1 ? '' : 's'}`],
                ['Arrival', arrival === 'CHECKED_IN' ? 'Checked in now' : 'Reserved for later'],
                ['Room charges', kes(review.gross)],
                ['Discounts / complimentary', review.off > 0 ? `− ${kes(review.off)}` : '—'],
                ['Total for the party', kes(review.net)],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3 py-2"><span className="text-muted-foreground">{k}</span><span className="text-right font-semibold">{v}</span></div>
              ))}
            </div>
            <div className="border">
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground"><tr><th className="px-3 py-2">Room</th><th className="px-3 py-2">Staying</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y">
                  {rows.map((row) => {
                    const room = roomById.get(row.roomId)
                    if (!room) return null
                    const gross = rateFor(room, row.mealPlan) * nights
                    const total = gross - termsDiscount(row.ownTerms ? row.terms : groupTerms, gross)
                    const people = parseOccupants(row.occupants)
                    return (
                      <tr key={row.key}>
                        <td className="px-3 py-2 font-semibold">{room.number}<span className="block text-xs font-normal text-muted-foreground">{room.roomType.name}</span></td>
                        <td className="px-3 py-2 text-xs">{people.length ? people.map((p) => p.name).join(', ') : <span className="text-muted-foreground">{row.adults} adult{Number(row.adults) === 1 ? '' : 's'} (names not entered)</span>}</td>
                        <td className="px-3 py-2 text-xs">{MEAL_PLAN_LABELS[row.mealPlan]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{kes(total)}{(row.ownTerms ? row.terms.roomSaleType === 'COMPLIMENTARY' : groupTerms.roomSaleType === 'COMPLIMENTARY') && <span className="block text-[11px] text-accent">complimentary</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <label className="block text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea rows={2} className="input mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </>
        )}
      </div>
    </ModalShell>
  )
}
