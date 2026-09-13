import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuBedDouble, LuLoaderCircle, LuPlus, LuSearch, LuUserRound, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export type PickedCustomer = { id: string; firstName: string; lastName: string | null; phone: string }

/** Who a sale is for. A ROOM party is a checked-in guest whose tab should
 * settle against their folio — the reservation is remembered on the order
 * now, but nothing is charged until settlement (they may still pay cash). */
export type SaleParty =
  | { kind: 'WALK_IN' }
  | { kind: 'CUSTOMER'; customer: PickedCustomer }
  | { kind: 'ROOM'; reservationId: string; reservationNo: string; roomNumber: string; customer: PickedCustomer }

type Stay = { id: string; reservationNo: string; customer: PickedCustomer; room: { number: string } }

const fullName = (c: { firstName: string; lastName: string | null }) => `${c.firstName} ${c.lastName ?? ''}`.trim()

export function partyLabel(party: SaleParty): string {
  if (party.kind === 'WALK_IN') return 'Walk-in Customer'
  if (party.kind === 'ROOM') return `Room ${party.roomNumber} · ${fullName(party.customer)}`
  return party.customer.phone ? `${fullName(party.customer)} · ${party.customer.phone}` : fullName(party.customer)
}

/** Full-screen "Choose Customer" pop-up: search customers or checked-in
 * rooms, tap an occupied room straight off the touch grid, quick-add a
 * customer (name + phone only), or keep the sale as a walk-in. */
export default function CustomerSelectModal({ party, onChange, onClose }: {
  party: SaleParty
  onChange: (party: SaleParty) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<PickedCustomer[]>([])
  const [stays, setStays] = useState<Stay[]>([])
  const [roomsAvailable, setRoomsAvailable] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Checked-in stays — refetched as the search term changes (empty term =
  // the full occupied list, shown as the touch grid). A 403 here just means
  // the Reservations module isn't on for this tenant: drop all room UI.
  useEffect(() => {
    if (!roomsAvailable) return
    const timer = window.setTimeout(() => {
      const qs = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
      api<{ reservations: Stay[] }>(`/reception/reservations?status=CHECKED_IN${qs}`)
        .then((r) => setStays(r.reservations))
        .catch(() => setRoomsAvailable(false))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [search, roomsAvailable])

  useEffect(() => {
    const query = search.trim()
    if (!query) { setCustomers([]); return }
    const timer = window.setTimeout(() => {
      api<{ customers: PickedCustomer[] }>(`/customers?search=${encodeURIComponent(query)}`)
        .then((r) => setCustomers(r.customers.slice(0, 10)))
        .catch(() => setCustomers([]))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [search])

  async function createCustomer(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !phone.trim()) return
    setSaving(true)
    setError('')
    try {
      const { customer } = await api<{ customer: PickedCustomer }>('/customers', {
        method: 'POST',
        body: JSON.stringify({ firstName: name.trim(), phone: phone.trim() }),
      })
      onChange({ kind: 'CUSTOMER', customer })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add customer')
    } finally {
      setSaving(false)
    }
  }

  const pickCustomer = (customer: PickedCustomer) => { onChange({ kind: 'CUSTOMER', customer }); onClose() }
  const pickRoom = (stay: Stay) => {
    onChange({ kind: 'ROOM', reservationId: stay.id, reservationNo: stay.reservationNo, roomNumber: stay.room.number, customer: stay.customer })
    onClose()
  }

  const searching = search.trim().length > 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-sm border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <h2 className="font-display text-xl font-semibold">Choose Customer</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Search by name or phone — or keep it as a walk-in sale.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm p-1.5 text-muted-foreground hover:bg-muted"><LuX className="size-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="mb-3 rounded-sm border border-destructive/25 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}

          {creating ? (
            <form onSubmit={createCustomer} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New customer</p>
              <input autoFocus placeholder="Full name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
              <input placeholder="Phone" className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreating(false)} className="flex-1 rounded-sm border py-2 text-sm font-semibold hover:bg-muted">Back</button>
                <button disabled={saving || !name.trim() || !phone.trim()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-secondary py-2 text-sm font-semibold text-secondary-foreground disabled:opacity-60">
                  {saving && <LuLoaderCircle className="size-3.5 animate-spin" />} Add &amp; select
                </button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" onClick={() => setCreating(true)} className="mb-3 flex w-full items-center justify-end gap-1 text-xs font-bold uppercase tracking-wide text-secondary hover:underline">
                <LuPlus className="size-3.5" /> New customer
              </button>

              <div className="relative">
                <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  placeholder={roomsAvailable ? 'Search name, phone, or room…' : 'Search name or phone…'}
                  className="input pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              {searching && (
                <div className="mt-3 space-y-1">
                  {roomsAvailable && stays.map((stay) => (
                    <button key={`room-${stay.id}`} type="button" onClick={() => pickRoom(stay)} className="flex w-full items-center gap-2 rounded-sm border p-2.5 text-left text-sm hover:bg-muted/40">
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-secondary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-secondary">
                        <LuBedDouble className="size-3" /> Room {stay.room.number}
                      </span>
                      <span className="truncate">{fullName(stay.customer)} <span className="text-xs text-muted-foreground">· bill to room</span></span>
                    </button>
                  ))}
                  {customers.map((customer) => (
                    <button key={`cust-${customer.id}`} type="button" onClick={() => pickCustomer(customer)} className="flex w-full items-center gap-2 rounded-sm border p-2.5 text-left text-sm hover:bg-muted/40">
                      <LuUserRound className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{fullName(customer)} <span className="text-xs text-muted-foreground">· {customer.phone}</span></span>
                    </button>
                  ))}
                  {customers.length === 0 && (!roomsAvailable || stays.length === 0) && (
                    <p className="py-3 text-center text-xs text-muted-foreground">No customers or rooms match your search.</p>
                  )}
                </div>
              )}

              {!searching && roomsAvailable && stays.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checked-in rooms</p>
                  <div className="grid grid-cols-2 gap-2">
                    {stays.map((stay) => (
                      <button key={stay.id} type="button" onClick={() => pickRoom(stay)} className="flex flex-col items-start gap-1 rounded-sm border p-3 text-left transition hover:border-secondary hover:bg-secondary/5">
                        <span className="inline-flex items-center gap-1 text-sm font-bold"><LuBedDouble className="size-4 text-secondary" /> Room {stay.room.number}</span>
                        <span className="w-full truncate text-xs text-muted-foreground">{fullName(stay.customer)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!searching && !roomsAvailable && (
                <p className="mt-4 text-center text-xs text-muted-foreground">Type a name or phone number to find a customer.</p>
              )}
            </>
          )}
        </div>

        {!creating && (
          <button type="button" onClick={() => { onChange({ kind: 'WALK_IN' }); onClose() }} className={cn('flex items-center justify-between border-t p-4 text-left text-sm hover:bg-muted/40', party.kind === 'WALK_IN' && 'bg-secondary/5')}>
            <span className="inline-flex items-center gap-2 font-semibold"><LuUserRound className="size-4 text-muted-foreground" /> Walk-in Customer</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Default</span>
          </button>
        )}
      </div>
    </div>
  )
}

/** The row that shows who a sale is for and opens the pop-up on tap. Drop-in
 * replacement for the old inline CustomerPicker. */
export function CustomerSelectField({ party, onChange }: {
  party: SaleParty
  onChange: (party: SaleParty) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-between gap-2 rounded-sm border bg-background px-3 py-2 text-left text-sm hover:bg-muted/40">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {party.kind === 'ROOM'
            ? <LuBedDouble className="size-3.5 shrink-0 text-secondary" />
            : <LuUserRound className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{partyLabel(party)}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-secondary">Change</span>
      </button>
      {open && <CustomerSelectModal party={party} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  )
}
