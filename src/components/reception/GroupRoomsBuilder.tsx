import { useMemo, useState } from 'react'
import { LuPlus, LuX } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { hasVariants, isHourlyUnit, unitWord, type RoomRateOption } from '@/lib/roomRates'
import RoomTermsFields, { defaultTerms, termsDiscount, termsPayload, type RoomTerms } from '@/components/reception/RoomTerms'

export type PickRoom = {
  id: string
  number: string
  name: string | null
  roomType: { id: string; name: string; rates: RoomRateOption[]; priceUnit?: { id: string; name: string } | null }
  capacity: number
  nightlyRate: string | number
  status: string
  cleanliness: string
}
export type PickCustomer = { id: string; firstName: string; lastName: string; phone: string | null }

/** One room in the party. Occupants are typed one per line ("Name" or "Name, ID"). */
export type RoomRow = {
  key: string
  roomId: string
  occupants: string
  adults: string
  children: string
  rateId: string
  customerId: string
  ownTerms: boolean
  terms: RoomTerms
}

export const newRow = (roomId: string): RoomRow => ({ key: `${roomId}-${Math.random().toString(36).slice(2, 7)}`, roomId, occupants: '', adults: '1', children: '0', rateId: '', customerId: '', ownTerms: false, terms: defaultTerms() })

/** Rooms of a variant type must be sold under a rate; hourly rates aren't offered for group bookings (they're priced by date). */
export const rowMissingRate = (room: PickRoom | undefined, row: RoomRow) => Boolean(room) && hasVariants(room!) && !room!.roomType.rates.some((r) => r.id === row.rateId)
export const rowsMissingRate = (rows: RoomRow[], rooms: PickRoom[]) => rows.some((row) => rowMissingRate(rooms.find((r) => r.id === row.roomId), row))
export function groupRowGross(room: PickRoom, row: RoomRow, nights: number): number {
  if (hasVariants(room)) {
    const rate = room.roomType.rates.find((r) => r.id === row.rateId)
    return rate ? Number(rate.price) * nights : 0
  }
  return Number(room.nightlyRate) * nights
}
export const rateLabel = (room: PickRoom, row: RoomRow) => room.roomType.rates.find((r) => r.id === row.rateId)?.name ?? 'Standard'

export function parseOccupants(text: string): { name: string; idNumber?: string }[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name, ...rest] = line.split(',')
    const idNumber = rest.join(',').trim()
    return { name: name.trim(), ...(idNumber ? { idNumber } : {}) }
  })
}

/** Rows as the API's `rooms` array. */
export function rowsToPayload(rows: RoomRow[]) {
  return rows.map((row) => ({
    roomId: row.roomId,
    customerId: row.customerId || undefined,
    rateId: row.rateId || undefined,
    adults: Math.max(1, Number(row.adults) || 1),
    children: Math.max(0, Number(row.children) || 0),
    guests: parseOccupants(row.occupants),
    ...(row.ownTerms ? { terms: termsPayload(row.terms) } : {}),
  }))
}

export default function GroupRoomsBuilder({ rooms, customers, rows, onChange, groupTerms, nights }: {
  rooms: PickRoom[]
  customers: PickCustomer[]
  rows: RoomRow[]
  onChange: (rows: RoomRow[]) => void
  groupTerms: RoomTerms
  nights: number
}) {
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const taken = useMemo(() => new Set(rows.map((r) => r.roomId)), [rows])
  const available = useMemo(
    () => rooms.filter((r) => r.status === 'VACANT' && r.cleanliness === 'CLEAN' && !taken.has(r.id)).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [rooms, taken],
  )
  const shown = available.filter((r) => `${r.number} ${r.name ?? ''} ${r.roomType.name}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])

  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const addPicked = () => {
    if (picked.size === 0) return
    onChange([...rows, ...[...picked].map(newRow)])
    setPicked(new Set())
  }
  const update = (key: string, patch: Partial<RoomRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const setOccupants = (row: RoomRow, occupants: string) => {
    const count = parseOccupants(occupants).length
    update(row.key, { occupants, ...(count > Number(row.adults) ? { adults: String(count) } : {}) })
  }

  return (
    <div className="space-y-4">
      <div className="border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pick rooms ({available.length} ready)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rooms…" className="input h-8 w-40 py-1 text-xs" />
            <button type="button" onClick={() => setPicked(new Set(shown.map((r) => r.id)))} className="text-xs font-semibold text-secondary hover:underline">Select all shown</button>
            {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="text-xs font-semibold text-muted-foreground hover:underline">Clear</button>}
          </div>
        </div>
        <div className="mt-2 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
          {shown.map((r) => (
            <button key={r.id} type="button" onClick={() => toggle(r.id)} className={cn('border px-2 py-1.5 text-left text-xs transition', picked.has(r.id) ? 'border-secondary bg-secondary/10' : 'hover:bg-muted')}>
              <span className="font-semibold">Room {r.number}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{r.roomType.name} · sleeps {r.capacity}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="col-span-full py-3 text-center text-xs text-muted-foreground">{available.length === 0 ? 'No more ready rooms.' : 'No rooms match.'}</p>}
        </div>
        <button type="button" disabled={picked.size === 0} onClick={addPicked} className="mt-2 inline-flex items-center gap-1.5 bg-secondary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-secondary-foreground disabled:opacity-50">
          <LuPlus className="size-3.5" /> Add {picked.size || ''} room{picked.size === 1 ? '' : 's'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="border border-dashed p-6 text-center text-sm text-muted-foreground">No rooms in the party yet — pick some above.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const room = roomById.get(row.roomId)
            if (!room) return null
            const gross = groupRowGross(room, row, nights)
            const terms = row.ownTerms ? row.terms : groupTerms
            const off = termsDiscount(terms, gross)
            return (
              <div key={row.key} className="border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Room {room.number} · {room.roomType.name}</p>
                    <p className="text-xs text-muted-foreground">Sleeps {room.capacity} · {hasVariants(room) ? (rowMissingRate(room, row) ? 'choose a rate' : rateLabel(room, row)) : 'Standard'} · {nights > 0 && !rowMissingRate(room, row) ? `KSh ${(gross - off).toLocaleString('en-KE', { maximumFractionDigits: 2 })}` : '—'}{off > 0 ? ` (after KSh ${off.toLocaleString('en-KE', { maximumFractionDigits: 2 })} off)` : ''}</p>
                  </div>
                  <button type="button" onClick={() => onChange(rows.filter((r) => r.key !== row.key))} title="Remove room" className="text-muted-foreground hover:text-destructive"><LuX className="size-4" /></button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium sm:row-span-2">Who is staying <span className="font-normal text-muted-foreground">(one per line, "Name, ID")</span>
                    <textarea rows={3} className="input mt-1.5" value={row.occupants} onChange={(e) => setOccupants(row, e.target.value)} placeholder={'Jane Wanjiku, 12345678\nJohn Otieno'} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium">Adults<input type="number" min="1" className="input mt-1.5" value={row.adults} onChange={(e) => update(row.key, { adults: e.target.value })} /></label>
                    <label className="block text-sm font-medium">Children<input type="number" min="0" className="input mt-1.5" value={row.children} onChange={(e) => update(row.key, { children: e.target.value })} /></label>
                  </div>
                  {hasVariants(room) && (
                    <label className="block text-sm font-medium">Rate *
                      <select className="input mt-1.5" value={row.rateId} onChange={(e) => update(row.key, { rateId: e.target.value })}>
                        <option value="" disabled>Select a rate</option>
                        {room.roomType.rates.filter((r) => !isHourlyUnit(r.unit)).map((r) => <option key={r.id} value={r.id}>{r.name} — KSh {Number(r.price).toLocaleString('en-KE')}{r.unit ? ` / ${unitWord(r.unit.name)}` : ''}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="sm:col-span-2">
                    <p className="mb-1.5 text-sm font-medium">Registered to <span className="font-normal text-muted-foreground">(leave empty for the billing customer)</span></p>
                    <SearchableSelect
                      options={[{ value: '', label: 'Billing customer' }, ...customers.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`.trim(), hint: c.phone ?? undefined }))]}
                      value={row.customerId}
                      onChange={(value) => update(row.key, { customerId: value })}
                      placeholder="Billing customer"
                      searchPlaceholder="Search guests…"
                      emptyText="No guests match."
                    />
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={row.ownTerms} onChange={(e) => update(row.key, { ownTerms: e.target.checked, terms: e.target.checked && row.terms.roomSaleType === 'PAID' && row.terms.discountType === 'NONE' ? { ...groupTerms } : row.terms })} />
                  This room has its own terms (different discount, or complimentary)
                </label>
                {row.ownTerms && <div className="mt-3"><RoomTermsFields value={row.terms} onChange={(terms) => update(row.key, { terms })} roomTotal={nights > 0 ? gross : undefined} /></div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
