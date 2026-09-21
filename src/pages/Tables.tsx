import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuPencil, LuPlus, LuPrinter, LuReceiptText, LuTable2, LuTrash2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { cn } from '@/lib/utils'
import { type ReceiptProfile } from '@/components/pos/OrderReceipt'
import OrderSettlementPanel from '@/components/pos/OrderSettlementPanel'
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal'

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
  AVAILABLE: 'border-success/70 text-success',
  OCCUPIED: 'border-warning/70 text-warning',
  RESERVED: 'border-secondary/70 text-secondary',
  OUT_OF_SERVICE: 'border-muted-foreground/50 text-muted-foreground',
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
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null)

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
    <div className="dashboard-square mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Sales" title="Tables" />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border bg-card p-4 shadow-sm">
        <div className="border-l-4 border-accent pl-3">
          <h2 className="font-display text-xl font-semibold leading-tight">Floor</h2>
          <p className="text-xs text-muted-foreground">See who's seated, follow their order, and settle the bill.</p>
        </div>
        <div className="flex items-center gap-2">
          {!fixedLocation && pickableLocations.length > 0 && (
            <select aria-label="Filter by location" value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="border bg-background px-3 py-2 text-sm outline-none">
              <option value="">All locations</option>
              {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>Add table</ActionButton>
        </div>
      </div>

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
            <article key={table.id} className={cn('border border-l-4 border-l-accent bg-card p-5 shadow-sm', table.status === 'OCCUPIED' && 'border-warning border-l-warning')}>
              <div className="flex items-start justify-between">
                <span className="flex size-9 items-center justify-center bg-secondary/10 text-secondary"><LuTable2 className="size-4" /></span>
                <span className={cn('keep-round border border-dashed px-2.5 py-1 text-xs font-semibold', STATUS_STYLES[table.status])}>{table.status.replace('_', ' ')}</span>
              </div>
              <h2 className="mt-4 font-semibold">{table.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{[table.area, `Seats ${table.capacity}`].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-xs">
                <span className={cn('keep-round border border-dashed px-2 py-0.5 font-semibold', table.location ? 'border-secondary/70 text-secondary' : 'border-muted-foreground/50 text-muted-foreground')}>
                  {table.location ? table.location.name : 'Shared'}
                </span>
              </p>
              {table.activeOrders.length === 1 && <p className="mt-2 text-xs font-semibold text-warning">Order #{table.activeOrders[0].orderNumber} · {table.activeOrders[0].status}</p>}
              {table.activeOrders.length > 1 && <p className="mt-2 text-xs font-semibold text-warning">{table.activeOrders.length} active orders</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton tone="neutral" icon={<LuReceiptText />} onClick={() => openTable(table)}>{table.activeOrders.length > 0 ? 'View orders' : 'Details'}</ActionButton>
                {table.activeOrders.length === 1 && (
                  <ActionButton tone="neutral" icon={<LuPrinter />} title="View / print receipt" onClick={() => setReceiptOrderId(table.activeOrders[0].id)} />
                )}
                <ActionButton tone="neutral" icon={<LuPencil />} title="Edit table" onClick={() => openEditForm(table)} />
                <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete table" onClick={() => void deleteTable(table)} />
              </div>
            </article>
          ))}
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveTable} className="w-full max-w-md border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit table' : 'New table'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.label : 'Add a table'}</h2>
            </div>
            <div className="space-y-4">
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
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create table'}
              </button>
            </div>
          </form>
        </div>
      )}

      {panel && panel.orderId === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="flex items-start justify-between -mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{panel.table.label}{panel.table.area ? ` · ${panel.table.area}` : ''}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{panel.table.activeOrders.length > 0 ? 'Choose an order' : 'No open order'}</h2>
              </div>
              <button onClick={() => setPanel(null)} className="bg-black p-2 text-white transition hover:bg-black/80"><LuX /></button>
            </div>
            {panel.table.activeOrders.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">This table is free — no order is open on it right now.</p>
            ) : (
              <div className="mt-5 space-y-2">
                {panel.table.activeOrders.map((activeOrder) => (
                  <div key={activeOrder.id} className="flex items-stretch gap-1 border border-l-4 border-l-accent hover:bg-muted/40">
                    <button onClick={() => selectOrderInPanel(activeOrder.id)} className="min-w-0 flex-1 p-3 text-left text-sm">
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
                    <ActionButton tone="neutral" icon={<LuPrinter />} title="View / print receipt" onClick={() => setReceiptOrderId(activeOrder.id)} className="mr-2 shrink-0 self-center" />
                  </div>
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
            paymentMethods={paymentMethods}
            onClose={() => setPanel(null)}
            onChanged={() => void load()}
          />
          {panel.table.activeOrders.length > 1 && (
            <button onClick={backToOrderList} className="fixed left-4 top-4 z-[70] border-2 border-foreground/20 bg-card px-3 py-2 text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-muted">
              ← Back to order list
            </button>
          )}
        </>
      )}

      {receiptOrderId && (
        <ReceiptPreviewModal
          orderId={receiptOrderId}
          profile={profile}
          onClose={() => setReceiptOrderId(null)}
        />
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
