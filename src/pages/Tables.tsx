import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuPencil, LuPlus, LuReceiptText, LuTable2, LuTrash2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { cn } from '@/lib/utils'
import { type ReceiptProfile } from '@/components/pos/OrderReceipt'
import OrderSettlementPanel from '@/components/pos/OrderSettlementPanel'

type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE'
type ActiveOrderSummary = {
  id: string
  orderNumber: number
  status: string
  createdAt: string
  servedBy: { firstName: string; lastName: string } | null
  customer: { firstName: string; lastName: string | null } | null
  itemCount: number
}
type LocationOption = { id: string; name: string }
// A table can carry several separate, independently-billed orders at once —
// activeOrders lists every one still in flight, not just the latest.
type RestaurantTable = { id: string; label: string; area: string | null; capacity: number; status: TableStatus; isActive: boolean; locationId: string | null; location: LocationOption | null; activeOrders: ActiveOrderSummary[] }

type TableForm = { label: string; area: string; capacity: string; locationId: string; isActive: boolean }
const emptyForm: TableForm = { label: '', area: '', capacity: '2', locationId: '', isActive: true }

type PaymentMethod = { id: string; name: string; requiresReference: boolean }

const STATUS_STYLES: Record<TableStatus, string> = {
  AVAILABLE: 'bg-success/10 text-success',
  OCCUPIED: 'bg-warning/15 text-warning',
  RESERVED: 'bg-secondary/10 text-secondary',
  OUT_OF_SERVICE: 'bg-muted text-muted-foreground',
}

// orderId is null while showing the "pick which order" list for a table
// with more than one active order.
type PanelTarget = { table: RestaurantTable; orderId: string | null }

export default function Tables() {
  const toast = useToast()
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [profile, setProfile] = useState<ReceiptProfile>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState<TableForm>(emptyForm)
  const [editing, setEditing] = useState<RestaurantTable | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [panel, setPanel] = useState<PanelTarget | null>(null)

  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId } = useWorkingLocation(locations, { persist: false })
  // Fixed-location staff always see only their own location; a floating
  // manager sees everything by default (browsing history/tables isn't a
  // live sale — forcing a pick would just be friction) with an optional
  // filter available instead.

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const locationQuery = effectiveLocationId ? `?locationId=${effectiveLocationId}` : ''
      const [tableResponse, profileResponse, methodsResponse, locationResponse] = await Promise.all([
        api<{ tables: RestaurantTable[] }>(`/tables${locationQuery}`),
        api<{ profile: ReceiptProfile }>('/business-profile'),
        api<{ methods: (PaymentMethod & { code: string })[] }>('/payment-methods?activeOnly=true'),
        api<{ locations: LocationOption[] }>('/locations'),
      ])
      setTables(tableResponse.tables)
      setProfile(profileResponse.profile)
      // Room Charge is a system method the backend resolves by code when
      // settling to a folio — it isn't a real "how did they pay" choice.
      setPaymentMethods(methodsResponse.methods.filter((m) => m.code !== 'ROOM_CHARGE'))
      setLocations(locationResponse.locations)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load tables'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [effectiveLocationId])

  useEffect(() => { void load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEditForm(table: RestaurantTable) {
    setEditing(table)
    setForm({ label: table.label, area: table.area ?? '', capacity: String(table.capacity), locationId: table.locationId ?? '', isActive: table.isActive })
    setError('')
    setShowForm(true)
  }

  async function saveTable(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      // Editing needs to be able to explicitly clear a location back to
      // "shared" — an empty string there means null, not "leave unchanged".
      const payload = editing ? { ...form, locationId: form.locationId || null } : form
      await api(editing ? `/tables/${editing.id}` : '/tables', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(editing ? 'Table updated.' : 'Table added.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save table')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTable(table: RestaurantTable) {
    if (!window.confirm(`Delete table "${table.label}"?`)) return
    try {
      await api(`/tables/${table.id}`, { method: 'DELETE' })
      toast.success('Table deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete table')
    }
  }

  function openTable(table: RestaurantTable) {
    // Exactly one active order: skip straight to its detail. More than one:
    // show a picker first. None: the "table is free" message.
    const soleOrderId = table.activeOrders.length === 1 ? table.activeOrders[0].id : null
    setPanel({ table, orderId: soleOrderId })
  }

  function selectOrderInPanel(orderId: string) {
    setPanel((current) => (current ? { ...current, orderId } : current))
  }

  function backToOrderList() {
    setPanel((current) => (current ? { ...current, orderId: null } : current))
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Sales</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Tables</h1>
          <p className="mt-2 text-sm text-muted-foreground">See who's seated, follow their order, and settle the bill.</p>
        </div>
        <div className="flex items-center gap-2">
          {!fixedLocation && pickableLocations.length > 0 && (
            <select aria-label="Filter by location" value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
              <option value="">All locations</option>
              {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <Button onClick={openCreate}>
            <LuPlus /> Add table
          </Button>
        </div>
      </header>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading tables…</div>
      ) : tables.length === 0 ? (
        <div className="mt-7 min-h-64 rounded-sm border bg-card p-16 text-center text-sm text-muted-foreground shadow-sm">No tables yet. Add your first one to start seating guests.</div>
      ) : (
        <section className="mt-7 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((table) => (
            <article key={table.id} className={cn('rounded-sm border bg-card p-5 shadow-sm', table.status === 'OCCUPIED' && 'border-2 border-warning')}>
              <div className="flex items-start justify-between">
                <span className="flex size-9 items-center justify-center rounded-sm bg-secondary/10 text-secondary"><LuTable2 className="size-4" /></span>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_STYLES[table.status])}>{table.status.replace('_', ' ')}</span>
              </div>
              <h2 className="mt-4 font-semibold">{table.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{[table.area, `Seats ${table.capacity}`].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-xs">
                <span className={cn('rounded-full px-2 py-0.5 font-semibold', table.location ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground')}>
                  {table.location ? table.location.name : 'Shared'}
                </span>
              </p>
              {table.activeOrders.length === 1 && <p className="mt-2 text-xs font-semibold text-warning">Order #{table.activeOrders[0].orderNumber} · {table.activeOrders[0].status}</p>}
              {table.activeOrders.length > 1 && <p className="mt-2 text-xs font-semibold text-warning">{table.activeOrders.length} active orders</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => openTable(table)} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><LuReceiptText className="size-3.5" /> {table.activeOrders.length > 0 ? 'View orders' : 'Details'}</button>
                <button onClick={() => openEditForm(table)} className="rounded-sm border p-1.5 text-muted-foreground hover:bg-muted"><LuPencil className="size-3.5" /></button>
                <button onClick={() => void deleteTable(table)} className="rounded-sm border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10"><LuTrash2 className="size-3.5" /></button>
              </div>
            </article>
          ))}
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveTable} className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit table' : 'New table'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.label : 'Add a table'}</h2>
            </div>
            <div className="mt-6 space-y-4">
              <Field label="Label" required><input required placeholder="e.g. T1" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="input" /></Field>
              <Field label="Area"><input placeholder="e.g. Main Hall, Patio" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="input" /></Field>
              <Field label="Capacity" required><input required type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="input" /></Field>
              <Field label="Location">
                <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Shared (visible everywhere)</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create table'}
              </button>
            </div>
          </form>
        </div>
      )}

      {panel && panel.orderId === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-secondary">{panel.table.label}{panel.table.area ? ` · ${panel.table.area}` : ''}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{panel.table.activeOrders.length > 0 ? 'Choose an order' : 'No open order'}</h2>
              </div>
              <button onClick={() => setPanel(null)} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
            </div>
            {panel.table.activeOrders.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">This table is free — no order is open on it right now.</p>
            ) : (
              <div className="mt-5 space-y-2">
                {panel.table.activeOrders.map((activeOrder) => (
                  <button key={activeOrder.id} onClick={() => selectOrderInPanel(activeOrder.id)} className="block w-full rounded-sm border p-3 text-left text-sm hover:bg-muted/40">
                    <span className="flex items-center justify-between">
                      <span className="font-semibold">Order #{activeOrder.orderNumber}</span>
                      <span className="text-xs text-muted-foreground">{activeOrder.status}</span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{new Date(activeOrder.createdAt).toLocaleString()}</span>
                      <span>{activeOrder.itemCount} item{activeOrder.itemCount === 1 ? '' : 's'}</span>
                      {activeOrder.servedBy && <span>Waiter: {activeOrder.servedBy.firstName} {activeOrder.servedBy.lastName}</span>}
                      {activeOrder.customer && <span>Client: {activeOrder.customer.firstName} {activeOrder.customer.lastName ?? ''}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {panel && panel.orderId !== null && (
        <>
          <OrderSettlementPanel
            orderId={panel.orderId}
            title={`${panel.table.label}${panel.table.area ? ` · ${panel.table.area}` : ''}`}
            subtitle={panel.table.activeOrders.length > 1 ? 'One of several orders on this table' : undefined}
            profile={profile}
            paymentMethods={paymentMethods}
            onClose={() => setPanel(null)}
            onChanged={() => void load()}
          />
          {panel.table.activeOrders.length > 1 && (
            <button onClick={backToOrderList} className="fixed left-4 top-4 z-[70] rounded-sm border bg-card px-3 py-1.5 text-xs font-semibold shadow-lg hover:bg-muted">
              ← Back to order list
            </button>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
