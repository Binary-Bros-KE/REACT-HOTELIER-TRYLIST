import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { IconType } from 'react-icons'
import {
  LuBedDouble,
  LuCircleAlert,
  LuConciergeBell,
  LuLoaderCircle,
  LuPackage,
  LuPencil,
  LuPlus,
  LuPower,
  LuSmartphone,
  LuStore,
  LuTrash2,
  LuUtensils,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'
import { cn } from '@/lib/utils'

const LOCATION_TYPES = ['RECEPTION', 'RESTAURANT', 'CAFE', 'BAKERY', 'BAR', 'GYM', 'SPA', 'STORE', 'SHOP', 'HOUSEKEEPING'] as const
type LocationType = (typeof LOCATION_TYPES)[number]
const typeLabels: Record<LocationType, string> = {
  RECEPTION: 'Reception', RESTAURANT: 'Restaurant', CAFE: 'Cafe', BAKERY: 'Bakery', BAR: 'Bar', GYM: 'Gym', SPA: 'Spa', STORE: 'Store', SHOP: 'Shop', HOUSEKEEPING: 'Housekeeping',
}

const SELLING_PERMISSIONS = [
  { key: 'canSellRooms', label: 'Can Sell Rooms', description: 'Reception & room bookings' },
  { key: 'canSellMenu', label: 'Can Sell Menu', description: 'Food, drinks, and add-ons' },
  { key: 'canSellServices', label: 'Can Sell Services', description: 'Spa, gym, and other services' },
  { key: 'canSellProducts', label: 'Can Sell Products', description: 'Retail store items' },
] as const

const SERVE_MODES = ['KITCHEN', 'COUNTER', 'DIRECT'] as const
type ServeMode = (typeof SERVE_MODES)[number]
const serveModeInfo: Record<ServeMode, { label: string; description: string }> = {
  KITCHEN: { label: 'Kitchen ticket', description: 'Full prep flow — Kitchen takes it, marks it preparing then ready, a waiter serves it.' },
  COUNTER: { label: 'Counter approval', description: 'No kitchen prep, but a fixed counter still hands it over — a waiter sends the order here, and only staff with the counter-approval capability can mark it served. For a bar or club where the floor and the counter are different people.' },
  DIRECT: { label: 'Serve instantly', description: 'No kitchen, no approval step — served the moment it’s rung up (a bakery/café counter handing the item straight over).' },
}

// Compact per-row indicators for the four selling permissions — green when
// the location may sell that line, faint when it can't.
const PERMISSION_ICONS: { key: 'canSellRooms' | 'canSellMenu' | 'canSellServices' | 'canSellProducts'; icon: IconType; label: string }[] = [
  { key: 'canSellRooms', icon: LuBedDouble, label: 'Rooms' },
  { key: 'canSellMenu', icon: LuUtensils, label: 'Menu' },
  { key: 'canSellServices', icon: LuConciergeBell, label: 'Services' },
  { key: 'canSellProducts', icon: LuPackage, label: 'Products' },
]

type Employee = { id: string; firstName: string; lastName: string }
type LocationRow = {
  id: string
  name: string
  type: LocationType | null
  description: string | null
  address: string | null
  managerId: string | null
  manager: Employee | null
  primaryPhone: string | null
  secondaryPhone: string | null
  email: string | null
  openingTime: string | null
  closingTime: string | null
  isActive: boolean
  canSellRooms: boolean
  canSellMenu: boolean
  canSellServices: boolean
  canSellProducts: boolean
  serveMode: ServeMode
  requireStoreDispatch: boolean
  dispatchAutoPrint: boolean
  dispatchFromLocationId: string | null
  receiptHeader: string | null
  receiptFooter: string | null
  invoiceHeader: string | null
  invoiceFooter: string | null
  quotationHeader: string | null
  quotationFooter: string | null
  _count: { menuItems: number; employees: number }
}
type LocationForm = {
  name: string
  type: LocationType | ''
  description: string
  address: string
  managerId: string
  primaryPhone: string
  secondaryPhone: string
  email: string
  openingTime: string
  closingTime: string
  isActive: boolean
  canSellRooms: boolean
  canSellMenu: boolean
  canSellServices: boolean
  canSellProducts: boolean
  serveMode: ServeMode
  requireStoreDispatch: boolean
  dispatchAutoPrint: boolean
  dispatchFromLocationId: string
  receiptHeader: string
  receiptFooter: string
  invoiceHeader: string
  invoiceFooter: string
  quotationHeader: string
  quotationFooter: string
}
const emptyLocationForm: LocationForm = {
  name: '', type: '', description: '', address: '', managerId: '',
  primaryPhone: '', secondaryPhone: '', email: '', openingTime: '', closingTime: '',
  isActive: true,
  canSellRooms: true, canSellMenu: true, canSellServices: true, canSellProducts: true,
  serveMode: 'KITCHEN',
  requireStoreDispatch: false,
  dispatchAutoPrint: true,
  dispatchFromLocationId: '',
  receiptHeader: '', receiptFooter: '', invoiceHeader: '', invoiceFooter: '', quotationHeader: '', quotationFooter: '',
}

export default function Locations() {
  const toast = useToast()
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<LocationForm>(emptyLocationForm)
  const [editing, setEditing] = useState<LocationRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mpesaFor, setMpesaFor] = useState<LocationRow | null>(null)
  const isSupervisor = useAppSelector((s) => Boolean(s.auth.user?.isSupervisor) || s.auth.user?.role?.name === 'Super Admin')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ locations: LocationRow[] }>('/locations')
      setLocations(response.locations)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load locations'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    api<{ employees: Employee[] }>('/employees')
      .then((response) => setEmployees(response.employees))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load employees'))
  }, [toast])

  function openCreate() {
    setEditing(null)
    setForm(emptyLocationForm)
    setShowForm(true)
  }

  function openEdit(location: LocationRow) {
    setEditing(location)
    setForm({
      name: location.name,
      type: location.type ?? '',
      description: location.description ?? '',
      address: location.address ?? '',
      managerId: location.managerId ?? '',
      primaryPhone: location.primaryPhone ?? '',
      secondaryPhone: location.secondaryPhone ?? '',
      email: location.email ?? '',
      openingTime: location.openingTime ?? '',
      closingTime: location.closingTime ?? '',
      isActive: location.isActive,
      canSellRooms: location.canSellRooms,
      canSellMenu: location.canSellMenu,
      canSellServices: location.canSellServices,
      canSellProducts: location.canSellProducts,
      serveMode: location.serveMode,
      requireStoreDispatch: location.requireStoreDispatch,
      dispatchAutoPrint: location.dispatchAutoPrint,
      dispatchFromLocationId: location.dispatchFromLocationId ?? '',
      receiptHeader: location.receiptHeader ?? '',
      receiptFooter: location.receiptFooter ?? '',
      invoiceHeader: location.invoiceHeader ?? '',
      invoiceFooter: location.invoiceFooter ?? '',
      quotationHeader: location.quotationHeader ?? '',
      quotationFooter: location.quotationFooter ?? '',
    })
    setShowForm(true)
  }

  async function saveLocation(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await api(editing ? `/locations/${editing.id}` : '/locations', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, dispatchFromLocationId: form.dispatchFromLocationId || null }) })
      toast.success(editing ? 'Location updated.' : 'Location created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save location')
    } finally {
      setSaving(false)
    }
  }

  async function deleteLocation(location: LocationRow) {
    if (!window.confirm(`Delete "${location.name}"?`)) return
    try {
      await api(`/locations/${location.id}`, { method: 'DELETE' })
      toast.success('Location deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete location')
    }
  }

  async function toggleActive(location: LocationRow) {
    try {
      await api(`/locations/${location.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !location.isActive }) })
      toast.success(location.isActive ? 'Location deactivated.' : 'Location activated.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update location')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Business" title="Locations" />

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Branches &amp; warehouses</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every selling point, warehouse, and internal store this property runs. Menu items and staff can be scoped to one, so the POS only ever shows what's sellable there.
            </p>
          </div>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate} className="shrink-0">New location</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading locations…</div>
        ) : locations.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No locations yet. If you never add one, everything behaves as a single point of sale.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th className="w-14" aria-label="Icon" />
                  <th>Location</th>
                  <th>Type</th>
                  <th>Manager</th>
                  <th>Phone</th>
                  <th>Permissions</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {locations.map((location) => (
                  <tr key={location.id} className="align-middle transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className="flex size-9 items-center justify-center rounded-md border bg-secondary/10 text-secondary">
                        <LuStore className="size-4" />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{location.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {location.address || location.description || (location.type ? typeLabels[location.type] : '—')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {location.type ? (
                        <span className="keep-round inline-flex whitespace-nowrap border border-dashed border-secondary/70 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-secondary">
                          {typeLabels[location.type]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {location.manager ? `${location.manager.firstName} ${location.manager.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {[location.primaryPhone, location.secondaryPhone].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {PERMISSION_ICONS.map(({ key, icon: Icon, label }) => (
                          <span
                            key={key}
                            title={`${label}: ${location[key] ? 'allowed' : 'off'}`}
                            className={cn(
                              'flex size-7 items-center justify-center border',
                              location[key]
                                ? 'border-success/30 bg-success/10 text-success'
                                : 'border-transparent bg-muted text-muted-foreground/40',
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'keep-round inline-flex whitespace-nowrap border border-dashed px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        location.isActive ? 'border-success/70 text-success' : 'border-muted-foreground/50 text-muted-foreground',
                      )}>
                        {location.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(location)} />
                        <ActionButton tone={location.isActive ? 'neutral' : 'success'} icon={<LuPower />} title={location.isActive ? 'Deactivate' : 'Activate'} onClick={() => void toggleActive(location)} />
                        {isSupervisor && <ActionButton tone="neutral" icon={<LuSmartphone />} title="M-Pesa settings" onClick={() => setMpesaFor(location)} />}
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete" onClick={() => void deleteLocation(location)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {mpesaFor && <MpesaConfigModal location={mpesaFor} onClose={() => setMpesaFor(null)} />}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveLocation} className="max-h-[88vh] w-full max-w-xl overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit location' : 'New location'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a location'}</h2>
            </div>

            <FieldGroup title="Basics">
              <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Poolside Bar" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Type" required>
                <select required className="input" value={form.type} onChange={(e) => {
                  const type = e.target.value as LocationType | ''
                  // A warehouse or the internal Housekeeping supply point
                  // doesn't run its own POS — SHOP is a genuine customer-
                  // facing retail point, so it keeps the normal defaults.
                  const isWarehouse = type === 'STORE' || type === 'HOUSEKEEPING'
                  // Just a starting point — the owner can change this per
                  // location below regardless of type. A bar defaults to
                  // Counter approval (floor takes the order, the bar counter
                  // hands it over); a café/bakery counter serves instantly.
                  const serveMode: ServeMode = type === 'BAR' ? 'COUNTER' : type === 'BAKERY' || type === 'CAFE' ? 'DIRECT' : 'KITCHEN'
                  setForm({ ...form, type, serveMode, ...(isWarehouse ? { canSellRooms: false, canSellMenu: false, canSellServices: false, canSellProducts: false } : {}) })
                }}>
                  <option value="" disabled>Select type</option>
                  {LOCATION_TYPES.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}
                </select>
              </Field>
              <Field label="Manager">
                <select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                  <option value="">No manager assigned</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </Field>
              <Field label="Description" className="sm:col-span-2"><input placeholder="Short note about this location" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
              <Field label="Address" className="sm:col-span-2"><input placeholder="e.g. Ground floor, near the pool" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Contact">
              <Field label="Primary Phone"><input type="tel" placeholder="e.g. 0712 345 678" value={form.primaryPhone} onChange={(e) => setForm({ ...form, primaryPhone: e.target.value })} className="input" /></Field>
              <Field label="Secondary Phone"><input type="tel" placeholder="e.g. 0733 987 654" value={form.secondaryPhone} onChange={(e) => setForm({ ...form, secondaryPhone: e.target.value })} className="input" /></Field>
              <Field label="Email" className="sm:col-span-2"><input type="email" placeholder="e.g. poolside@hotel.co.ke" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Hours">
              <Field label="Opening Time"><input type="time" value={form.openingTime} onChange={(e) => setForm({ ...form, openingTime: e.target.value })} className="input" /></Field>
              <Field label="Closing Time"><input type="time" value={form.closingTime} onChange={(e) => setForm({ ...form, closingTime: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <div className="mt-6 border-t pt-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Printed documents</p>
              <p className="mb-3 text-xs text-muted-foreground">Optional text this location's receipts, invoices, and quotations print above/below the body. Leave blank to use the default.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Receipt Header"><textarea rows={2} placeholder="e.g. this branch's own note" value={form.receiptHeader} onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })} className="input" /></Field>
                <Field label="Receipt Footer"><textarea rows={2} placeholder="e.g. Thank you for your visit!" value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} className="input" /></Field>
                <Field label="Invoice Header"><textarea rows={2} value={form.invoiceHeader} onChange={(e) => setForm({ ...form, invoiceHeader: e.target.value })} className="input" /></Field>
                <Field label="Invoice Footer"><textarea rows={2} value={form.invoiceFooter} onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })} className="input" /></Field>
                <Field label="Quotation Header"><textarea rows={2} value={form.quotationHeader} onChange={(e) => setForm({ ...form, quotationHeader: e.target.value })} className="input" /></Field>
                <Field label="Quotation Footer"><textarea rows={2} value={form.quotationFooter} onChange={(e) => setForm({ ...form, quotationFooter: e.target.value })} className="input" /></Field>
              </div>
            </div>

            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selling Permissions</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {SELLING_PERMISSIONS.map((perm) => (
                  <label key={perm.key} className="flex cursor-pointer items-start gap-2.5 rounded-sm border bg-muted/40 p-3">
                    <input
                      type="checkbox"
                      checked={form[perm.key]}
                      onChange={(e) => setForm({ ...form, [perm.key]: e.target.checked })}
                      className="mt-0.5 size-4 accent-secondary"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{perm.label}</span>
                      <span className="block text-xs text-muted-foreground">{perm.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {form.canSellMenu && (
              <div className="mt-6 border-t pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Handling</p>
                <p className="mb-3 -mt-2 text-xs text-muted-foreground">How does a menu order at this location get served?</p>
                <div className="space-y-2">
                  {SERVE_MODES.map((mode) => {
                    const checked = form.serveMode === mode
                    const { label, description } = serveModeInfo[mode]
                    return (
                      <label
                        key={mode}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-sm border p-3 transition-colors',
                          checked ? 'border-secondary bg-secondary/10' : 'bg-muted/40 hover:bg-muted',
                        )}
                      >
                        <input
                          type="radio"
                          name="serveMode"
                          checked={checked}
                          onChange={() => setForm({ ...form, serveMode: mode })}
                          className="mt-0.5 size-4 accent-secondary"
                        />
                        <span>
                          <span className={cn('block text-sm font-semibold', checked && 'text-secondary')}>{label}</span>
                          <span className="block text-xs text-muted-foreground">{description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {form.serveMode === 'KITCHEN' && (
                  <div className={cn('mt-3 border p-3 transition-colors', form.requireStoreDispatch ? 'border-secondary bg-secondary/10' : 'bg-muted/40')}>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input type="checkbox" checked={form.requireStoreDispatch} onChange={(e) => setForm({ ...form, requireStoreDispatch: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
                      <span>
                        <span className="block text-sm font-semibold">Kitchen needs store approval for ingredients</span>
                        <span className="block text-xs text-muted-foreground">Every order posted here goes straight to the store, and the storekeeper dispatches the recipe&apos;s ingredients before the chef can start. Leave off if the kitchen keeps its own stock.</span>
                      </span>
                    </label>
                    {form.requireStoreDispatch && (
                      <label className="mt-3 flex cursor-pointer items-start gap-2.5 border bg-card p-3">
                        <input type="checkbox" checked={form.dispatchAutoPrint} onChange={(e) => setForm({ ...form, dispatchAutoPrint: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
                        <span>
                          <span className="block text-sm font-semibold">Print the dispatch slip automatically at the store</span>
                          <span className="block text-xs text-muted-foreground">The store&apos;s printer prints what to dispatch as soon as an order is posted. Off = the storekeeper prints it with the Print button. Needs a printer set up on the store computer.</span>
                        </span>
                      </label>
                    )}
                    {form.requireStoreDispatch && (
                      <label className="mt-3 block text-sm font-medium">Supplying store
                        <select className="input mt-1.5" value={form.dispatchFromLocationId} onChange={(e) => setForm({ ...form, dispatchFromLocationId: e.target.value })}>
                          <option value="">First store location (default)</option>
                          {locations.filter((l) => l.type === 'STORE' && l.id !== editing?.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="mt-6 flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
              Active
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
            </label>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create location'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

type MpesaConfig = {
  accountType: 'PAYBILL' | 'TILL'
  shortcode: string
  tillNumber: string | null
  environment: 'SANDBOX' | 'PRODUCTION'
  isActive: boolean
  passkeyMasked: string
  consumerKeyMasked: string
  consumerSecretMasked: string
}
type MpesaForm = { accountType: 'PAYBILL' | 'TILL'; shortcode: string; tillNumber: string; passkey: string; consumerKey: string; consumerSecret: string; environment: 'SANDBOX' | 'PRODUCTION'; isActive: boolean }
const emptyMpesaForm: MpesaForm = { accountType: 'PAYBILL', shortcode: '', tillNumber: '', passkey: '', consumerKey: '', consumerSecret: '', environment: 'SANDBOX', isActive: true }

/** Per-location Safaricom Daraja credentials for STK push — each outlet has
 * its own Paybill/Till and its own Daraja app, so this is scoped to one
 * `Location`, never tenant-wide. Secrets are write-only from here: the read
 * endpoint only ever returns a masked form, and a blank field on save means
 * "leave the stored value alone" so a shortcode edit doesn't force retyping
 * the consumer secret. */
function MpesaConfigModal({ location, onClose }: { location: LocationRow; onClose: () => void }) {
  const toast = useToast()
  const [existing, setExisting] = useState<MpesaConfig | null>(null)
  const [form, setForm] = useState<MpesaForm>(emptyMpesaForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ config: MpesaConfig | null }>(`/locations/${location.id}/mpesa-config`)
      .then((r) => {
        setExisting(r.config)
        if (r.config) setForm({ accountType: r.config.accountType, shortcode: r.config.shortcode, tillNumber: r.config.tillNumber ?? '', passkey: '', consumerKey: '', consumerSecret: '', environment: r.config.environment, isActive: r.config.isActive })
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load M-Pesa settings'))
      .finally(() => setLoading(false))
  }, [location.id])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { config } = await api<{ config: MpesaConfig }>(`/locations/${location.id}/mpesa-config`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          tillNumber: form.tillNumber || undefined,
          passkey: form.passkey || undefined,
          consumerKey: form.consumerKey || undefined,
          consumerSecret: form.consumerSecret || undefined,
        }),
      })
      setExisting(config)
      setForm((f) => ({ ...f, passkey: '', consumerKey: '', consumerSecret: '' }))
      toast.success('M-Pesa settings saved.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save M-Pesa settings'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={save} className="max-h-[88vh] w-full max-w-lg overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">M-Pesa (STK push)</p>
          <h2 className="text-lg font-bold">{location.name}</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><LuLoaderCircle className="animate-spin" /></div>
        ) : (
          <>
            {error && <div className="mb-4 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
            {!existing && !error && <p className="mb-4 text-sm text-muted-foreground">Not set up yet — this location can't send STK push prompts until these are filled in.</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account type" required>
                <select required className="input" value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value as MpesaForm['accountType'] })}>
                  <option value="PAYBILL">Paybill</option>
                  <option value="TILL">Till (Buy Goods)</option>
                </select>
              </Field>
              <Field label="Environment" required>
                <select required className="input" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as MpesaForm['environment'] })}>
                  <option value="SANDBOX">Sandbox (testing)</option>
                  <option value="PRODUCTION">Production (real money)</option>
                </select>
              </Field>
              <Field label={form.accountType === 'TILL' ? 'API shortcode' : 'Paybill number'} required className="sm:col-span-2">
                <input required value={form.shortcode} onChange={(e) => setForm({ ...form, shortcode: e.target.value })} placeholder="e.g. 174379" className="input" />
              </Field>
              {form.accountType === 'TILL' && (
                <Field label="Till number (if different from the shortcode above)" className="sm:col-span-2">
                  <input value={form.tillNumber} onChange={(e) => setForm({ ...form, tillNumber: e.target.value })} placeholder="Leave blank if the same as the shortcode" className="input" />
                </Field>
              )}
              <Field label="Passkey" required={!existing} className="sm:col-span-2">
                <input type="password" value={form.passkey} onChange={(e) => setForm({ ...form, passkey: e.target.value })} placeholder={existing ? `Set (${existing.passkeyMasked}) — leave blank to keep it` : 'From the Daraja app'} className="input" />
              </Field>
              <Field label="Consumer key" required={!existing}>
                <input type="password" value={form.consumerKey} onChange={(e) => setForm({ ...form, consumerKey: e.target.value })} placeholder={existing ? `Set (${existing.consumerKeyMasked})` : 'From the Daraja app'} className="input" />
              </Field>
              <Field label="Consumer secret" required={!existing}>
                <input type="password" value={form.consumerSecret} onChange={(e) => setForm({ ...form, consumerSecret: e.target.value })} placeholder={existing ? `Set (${existing.consumerSecretMasked})` : 'From the Daraja app'} className="input" />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active — the till can send STK push here
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={onClose} className="border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />} Save
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5 first:mt-6 first:border-t">
      <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block text-sm font-medium', className)}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
