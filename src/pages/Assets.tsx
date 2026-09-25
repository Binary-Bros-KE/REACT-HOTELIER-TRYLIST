import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuBoxes,
  LuCircleAlert,
  LuCircleCheck,
  LuClipboardList,
  LuLoaderCircle,
  LuPackageSearch,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import QuickAddModal, { QuickNewButton } from '@/components/QuickAddModal'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'

const UNITS_OF_MEASURE = [
  'Each', 'Pieces', 'Kg', 'Grams', 'Litres', 'Millilitres', 'Box', 'Carton',
  'Pack', 'Dozen', 'Roll', 'Bottle', 'Can', 'Bag', 'Set', 'Pair', 'Meter',
] as const

const MOVEMENT_TYPES = ['RECEIPT', 'ADJUSTMENT', 'WRITE_OFF'] as const
const movementLabels: Record<(typeof MOVEMENT_TYPES)[number], string> = { RECEIPT: 'Receipt (more acquired)', ADJUSTMENT: 'Adjustment (correction)', WRITE_OFF: 'Write-off (broken / lost / disposed)' }

type Category = { id: string; name: string; level: number }
type Location = { id: string; name: string }
type Room = { id: string; number: string; name: string | null; roomType: { name: string } }
type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type Asset = {
  id: string
  assetNo: string
  categoryId: string | null
  category: { id: string; name: string } | null
  name: string
  description: string | null
  unit: string
  quantity: string
  unitCost: string | null
  locationId: string | null
  location: { id: string; name: string } | null
  roomId: string | null
  room: Room | null
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
  createdByEmployee: { id: string; firstName: string; lastName: string } | null
  updatedByEmployee: { id: string; firstName: string; lastName: string } | null
}
type Summary = { total: number; totalValue: number; roomAssets?: number }
type RoomAssetReport = {
  rooms: { room: Room; assetCount: number; quantity: number; value: number; assets: Asset[] }[]
  summary: { rooms: number; assets: number; quantity: number; value: number }
}

type AssetForm = {
  categoryId: string
  name: string
  description: string
  unit: (typeof UNITS_OF_MEASURE)[number]
  quantity: string
  unitCost: string
  locationId: string
  roomId: string
  purchased: boolean
  paymentMethodId: string
  reference: string
  notes: string
  isActive: boolean
}
const emptyForm: AssetForm = { categoryId: '', name: '', description: '', unit: 'Each', quantity: '0', unitCost: '', locationId: '', roomId: '', purchased: false, paymentMethodId: '', reference: '', notes: '', isActive: true }

type MovementForm = { type: (typeof MOVEMENT_TYPES)[number]; quantity: string; unitCost: string; purchased: boolean; paymentMethodId: string; reference: string; note: string }
const emptyMovement: MovementForm = { type: 'RECEIPT', quantity: '', unitCost: '', purchased: false, paymentMethodId: '', reference: '', note: '' }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

function SetupMessage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">Workspace not resolved yet.</p>
    </div>
  )
}

export default function Assets() {
  const toast = useToast()
  const [assets, setAssets] = useState<Asset[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, totalValue: 0 })
  const [categories, setCategories] = useState<Category[]>([])
  const [quickCategory, setQuickCategory] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomReport, setRoomReport] = useState<RoomAssetReport | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [search, setSearch] = useState('')
  const [assignment, setAssignment] = useState<'all' | 'rooms' | 'locations' | 'unassigned'>('all')
  const [roomFilter, setRoomFilter] = useState('')
  const [form, setForm] = useState<AssetForm>(emptyForm)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [movementFor, setMovementFor] = useState<Asset | null>(null)
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovement)
  const [recording, setRecording] = useState(false)
  const [movementError, setMovementError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (assignment !== 'all') query.set('assignment', assignment)
      if (roomFilter) query.set('roomId', roomFilter)
      const response = await api<{ assets: Asset[]; summary: Summary }>(`/assets${query.size ? `?${query}` : ''}`)
      setAssets(response.assets)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load assets'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, assignment, roomFilter, toast])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer) }, [load])

  useEffect(() => {
    api<{ categories: Category[] }>('/categories?scope=ASSETS').then((r) => setCategories(r.categories)).catch(() => {})
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
    api<{ rooms: Room[] }>('/rooms/rooms').then((r) => setRooms(r.rooms)).catch(() => {})
    api<{ methods: PaymentMethod[] }>('/payment-methods?activeOnly=true').then((r) => setMethods(r.methods)).catch(() => {})
  }, [])

  useEffect(() => {
    api<RoomAssetReport>('/assets/reports/rooms').then(setRoomReport).catch(() => setRoomReport(null))
  }, [notice])

  const categoryLabel = useMemo(() => (c: Category) => '— '.repeat(c.level - 1) + c.name, [])
  const selectedMethod = methods.find((m) => m.id === form.paymentMethodId)
  const movementSelectedMethod = methods.find((m) => m.id === movementForm.paymentMethodId)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(asset: Asset) {
    setEditing(asset)
    setForm({
      categoryId: asset.categoryId ?? '',
      name: asset.name,
      description: asset.description ?? '',
      unit: asset.unit as (typeof UNITS_OF_MEASURE)[number],
      quantity: '0',
      unitCost: asset.unitCost ?? '',
      locationId: asset.locationId ?? '',
      roomId: asset.roomId ?? '',
      purchased: false,
      paymentMethodId: '',
      reference: '',
      notes: asset.notes ?? '',
      isActive: asset.isActive,
    })
    setError('')
    setShowForm(true)
  }

  async function saveAsset(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = editing
        ? { categoryId: form.categoryId || undefined, name: form.name, description: form.description || undefined, unit: form.unit, unitCost: form.unitCost || undefined, locationId: form.locationId || undefined, roomId: form.roomId || undefined, notes: form.notes || undefined, isActive: form.isActive }
        : { ...form, categoryId: form.categoryId || undefined, locationId: form.locationId || undefined, roomId: form.roomId || undefined, purchased: form.purchased, paymentMethodId: form.purchased ? form.paymentMethodId || undefined : undefined, reference: form.purchased ? form.reference || undefined : undefined }
      await api(editing ? `/assets/${editing.id}` : '/assets', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setNotice(editing ? 'Asset updated.' : 'Asset registered.')
      toast.success(editing ? 'Asset updated.' : 'Asset registered.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save asset'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteAsset(asset: Asset) {
    if (!window.confirm(`Permanently delete ${asset.name}?`)) return
    setError('')
    setNotice('')
    try {
      await api(`/assets/${asset.id}`, { method: 'DELETE' })
      setNotice('Asset deleted.')
      toast.success('Asset deleted.')
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete asset'
      setError(message)
      toast.error(message)
    }
  }

  function openMovement(asset: Asset) {
    setMovementFor(asset)
    setMovementForm(emptyMovement)
    setMovementError('')
  }

  async function saveMovement(event: FormEvent) {
    event.preventDefault()
    if (!movementFor) return
    setRecording(true)
    setMovementError('')
    try {
      const magnitude = Number(movementForm.quantity)
      const signedQuantity = movementForm.type === 'WRITE_OFF' ? -Math.abs(magnitude) : magnitude
      await api(`/assets/${movementFor.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          type: movementForm.type,
          quantity: signedQuantity,
          unitCost: movementForm.type === 'RECEIPT' ? movementForm.unitCost || undefined : undefined,
          purchased: movementForm.type === 'RECEIPT' && movementForm.purchased,
          paymentMethodId: movementForm.type === 'RECEIPT' && movementForm.purchased ? movementForm.paymentMethodId || undefined : undefined,
          reference: movementForm.type === 'RECEIPT' && movementForm.purchased ? movementForm.reference || undefined : undefined,
          note: movementForm.note || undefined,
        }),
      })
      toast.success('Movement recorded.')
      setMovementFor(null)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record movement'
      setMovementError(message)
      toast.error(message)
    } finally {
      setRecording(false)
    }
  }

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Assets" />

      <section className="mt-7 grid gap-3 sm:grid-cols-3">
        {([
          ['Total assets', summary.total, <LuBoxes key="a" />],
          ['Total value', formatKes(summary.totalValue), <LuClipboardList key="b" />],
          ['Room assets', summary.roomAssets ?? 0, <LuPackageSearch key="c" />],
        ] as const).map(([label, value, icon], i) => (
          <StatCard key={label} index={i} label={label} value={value} icon={icon} />
        ))}
      </section>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-success/25 bg-success/10 p-3 text-sm text-success">
          <LuCircleCheck />
          {notice}
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or asset no…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select className="input h-10 w-full sm:w-44" value={assignment} onChange={(e) => setAssignment(e.target.value as typeof assignment)}>
            <option value="all">All assignments</option>
            <option value="rooms">Room assets</option>
            <option value="locations">Location assets</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select className="input h-10 w-full sm:w-48" value={roomFilter} onChange={(e) => { setRoomFilter(e.target.value); if (e.target.value) setAssignment('rooms') }}>
            <option value="">All rooms</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>Room {room.number}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>Register asset</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading assets…</div>
        ) : assets.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No assets match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Assigned to</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Value</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">{asset.assetNo}</p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{asset.category?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground">{asset.room ? `Room ${asset.room.number}` : asset.location?.name ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span className="font-semibold">{Number(asset.quantity).toLocaleString()} {asset.unit}</span>
                      {!asset.isActive && <span className="ml-2 keep-round border border-dashed border-muted-foreground/50 px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{asset.unitCost ? formatKes(Number(asset.quantity) * Number(asset.unitCost)) : '—'}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPackageSearch />} title="Record movement" onClick={() => openMovement(asset)} />
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit asset" onClick={() => openEdit(asset)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete asset" onClick={() => void deleteAsset(asset)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveAsset} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit asset' : 'New asset'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Register an asset'}</h2>
            </div>

            <FieldGroup title="Identity">
              <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Dining Chair" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Category">
                <div className="flex gap-2"><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
                </select><QuickNewButton onClick={() => setQuickCategory(true)} /></div>
              </Field>
              <Field label="Unit" required>
                <select required className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as AssetForm['unit'] })}>
                  {UNITS_OF_MEASURE.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Description" className="sm:col-span-2"><input placeholder="e.g. Wooden dining chair, dark finish" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Location & Cost">
              <Field label="Location">
                <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Not assigned yet</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Room">
                <select className="input" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                  <option value="">Not inside a room</option>
                  {rooms.map((room) => <option key={room.id} value={room.id}>Room {room.number} - {room.roomType.name}</option>)}
                </select>
              </Field>
              <Field label="Unit value (KES)"><input type="number" min="0" step="0.01" placeholder="e.g. 3500 (what one is worth)" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} className="input" /></Field>
            </FieldGroup>

            {editing ? (
              <FieldGroup title="Stock">
                <Field label="Current Quantity" className="sm:col-span-2">
                  <input disabled className="input opacity-70 font-semibold" value={`${Number(editing.quantity).toLocaleString()} ${editing.unit}`} />
                  <span className="mt-1 block text-xs text-muted-foreground">Quantity only changes through a recorded movement — close this form and use "Record movement" instead.</span>
                </Field>
              </FieldGroup>
            ) : (
              <FieldGroup title="Opening Quantity">
                <Field label="Quantity" required><input required type="number" min="0" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input" /></Field>
                {Number(form.quantity) > 0 && (
                  <label className="flex items-start gap-2 rounded-sm border bg-muted/30 p-3 text-sm sm:col-span-2">
                    <input type="checkbox" className="mt-0.5" checked={form.purchased} onChange={(e) => setForm({ ...form, purchased: e.target.checked })} />
                    <span><b>I am buying this now</b><span className="block text-xs text-muted-foreground">Leave unticked to just record what you already own. Ticking it pays for it: the money goes out through a payment method and is logged as capital invested (not an expense).</span></span>
                  </label>
                )}
                {form.purchased && Number(form.quantity) > 0 && Number(form.unitCost) > 0 && (
                  <>
                    <Field label="Paid Via" required>
                      <select required className="input" value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}>
                        <option value="">Select method</option>
                        {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </Field>
                    <Field label={selectedMethod?.requiresReference ? 'Reference' : 'Reference (optional)'} required={selectedMethod?.requiresReference}>
                      <input required={selectedMethod?.requiresReference} placeholder="e.g. Receipt no." value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input" />
                    </Field>
                    <p className="text-xs text-muted-foreground sm:col-span-2">This will be recorded as {formatKes(Number(form.quantity) * Number(form.unitCost))} capital invested, in the Transactions ledger.</p>
                  </>
                )}
              </FieldGroup>
            )}

            <FieldGroup title="Notes">
              <Field label="Notes" className="sm:col-span-2">
                <textarea rows={2} placeholder="Anything worth remembering about this asset" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
              </Field>
            </FieldGroup>

            <label className="mt-6 flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
              Active
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
            </label>

            {editing && (editing.createdByEmployee || editing.updatedByEmployee) && (
              <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                {editing.createdByEmployee && <>Created by {editing.createdByEmployee.firstName} {editing.createdByEmployee.lastName} on {new Date(editing.createdAt).toLocaleDateString()}</>}
                {editing.createdByEmployee && editing.updatedByEmployee && ' · '}
                {editing.updatedByEmployee && <>Last updated by {editing.updatedByEmployee.firstName} {editing.updatedByEmployee.lastName} on {new Date(editing.updatedAt).toLocaleDateString()}</>}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Register asset'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="border-b p-4">
          <h2 className="font-display text-xl font-semibold">Room asset register</h2>
          <p className="text-xs text-muted-foreground">Durable items assigned inside rooms, with replacement value.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
              <tr><th className="px-5 py-3">Room</th><th className="px-5 py-3">Assets</th><th className="px-5 py-3">Quantity</th><th className="px-5 py-3">Value</th><th className="px-5 py-3">Items</th></tr>
            </thead>
            <tbody>
              {!roomReport ? <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No room asset data yet.</td></tr>
                : roomReport.rooms.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">No assets assigned to rooms yet.</td></tr>
                : roomReport.rooms.map((row) => (
                  <tr key={row.room.id} className="border-t align-top even:bg-muted/30">
                    <td className="px-5 py-4"><p className="font-semibold">Room {row.room.number}</p><p className="text-xs text-muted-foreground">{row.room.roomType.name}</p></td>
                    <td className="px-5 py-4 font-semibold tabular-nums">{row.assetCount}</td>
                    <td className="px-5 py-4 tabular-nums">{row.quantity}</td>
                    <td className="px-5 py-4 font-semibold tabular-nums">{formatKes(row.value)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{row.assets.map((asset) => `${asset.name} (${Number(asset.quantity)} ${asset.unit})`).join(', ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {movementFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveMovement} className="w-full max-w-md border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Record movement</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{movementFor.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Currently {Number(movementFor.quantity).toLocaleString()} {movementFor.unit} on hand.</p>
            </div>

            {movementError && (
              <div className="mt-4 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                <LuCircleAlert />
                {movementError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <Field label="Type" required>
                <select required className="input" value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value as MovementForm['type'] })}>
                  {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{movementLabels[t]}</option>)}
                </select>
              </Field>
              <Field label={movementForm.type === 'ADJUSTMENT' ? 'Quantity (negative to reduce)' : 'Quantity'} required>
                <input required autoFocus type="number" step="0.001" min={movementForm.type === 'ADJUSTMENT' ? undefined : '0.001'} value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} className="input" />
              </Field>
              {movementForm.type === 'RECEIPT' && (
                <>
                  <Field label="Unit value (KES)"><input type="number" min="0" step="0.01" value={movementForm.unitCost} onChange={(e) => setMovementForm({ ...movementForm, unitCost: e.target.value })} className="input" /></Field>
                  <label className="flex items-start gap-2 rounded-sm border bg-muted/30 p-3 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={movementForm.purchased} onChange={(e) => setMovementForm({ ...movementForm, purchased: e.target.checked })} />
                    <span><b>I am buying these now</b><span className="block text-xs text-muted-foreground">Untick to just record units you already own. Ticking logs the payment as capital invested.</span></span>
                  </label>
                  {movementForm.purchased && Number(movementForm.unitCost) > 0 && (
                    <>
                      <Field label="Paid Via" required>
                        <select required className="input" value={movementForm.paymentMethodId} onChange={(e) => setMovementForm({ ...movementForm, paymentMethodId: e.target.value })}>
                          <option value="">Select method</option>
                          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </Field>
                      <Field label={movementSelectedMethod?.requiresReference ? 'Reference' : 'Reference (optional)'} required={movementSelectedMethod?.requiresReference}>
                        <input required={movementSelectedMethod?.requiresReference} placeholder="e.g. Receipt no." value={movementForm.reference} onChange={(e) => setMovementForm({ ...movementForm, reference: e.target.value })} className="input" />
                      </Field>
                    </>
                  )}
                </>
              )}
              <Field label="Note">
                <textarea rows={2} placeholder={movementForm.type === 'WRITE_OFF' ? 'e.g. 2 chairs broke during an event' : 'Optional note'} value={movementForm.note} onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })} className="input" />
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setMovementFor(null)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={recording} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {recording && <LuLoaderCircle className="animate-spin" />}
                Record
              </button>
            </div>
          </form>
        </div>
      )}
      {quickCategory && (
        <QuickAddModal title="New category" label="Category name" placeholder="e.g. Furniture" endpoint="/categories" extraBody={{ scope: 'ASSETS' }} responseKey="category" onClose={() => setQuickCategory(false)}
          onCreated={(c) => { setCategories((cur) => [...cur, { id: c.id, name: c.name, level: Number(c.level ?? 1) }]); setForm((f) => ({ ...f, categoryId: c.id })); setQuickCategory(false) }} />
      )}
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
    <label className={cn('text-sm font-medium', className)}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
