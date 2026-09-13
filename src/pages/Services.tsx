import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuPencil, LuPlus, LuSettings2, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type ServiceCategory = { id: string; name: string; isActive: boolean; _count: { services: number } }
type UnitOfMeasure = { id: string; name: string }
type Location = { id: string; name: string; type?: string }
type Service = {
  id: string
  name: string
  categoryId: string
  category: { id: string; name: string }
  unitId: string
  unit: { id: string; name: string }
  price: string | number
  description: string | null
  isActive: boolean
  locations: Location[]
}
type ServiceForm = {
  name: string
  categoryId: string
  unitId: string
  price: string
  description: string
  isActive: boolean
  locationIds: string[]
}
const emptyForm: ServiceForm = { name: '', categoryId: '', unitId: '', price: '', description: '', isActive: true, locationIds: [] }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

export default function Services() {
  const toast = useToast()
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<ServiceForm>(emptyForm)
  const [editing, setEditing] = useState<Service | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [servicesRes, categoriesRes, unitsRes, locationsRes] = await Promise.all([
        api<{ services: Service[] }>('/services'),
        api<{ categories: ServiceCategory[] }>('/service-categories'),
        api<{ units: UnitOfMeasure[] }>('/units-of-measure'),
        api<{ locations: Location[] }>('/locations'),
      ])
      setServices(servicesRes.services)
      setCategories(categoriesRes.categories)
      setUnits(unitsRes.units)
      setLocations(locationsRes.locations)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load services'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '', unitId: units[0]?.id ?? '' })
    setShowForm(true)
  }

  function openEdit(service: Service) {
    setEditing(service)
    setForm({
      name: service.name,
      categoryId: service.categoryId,
      unitId: service.unitId,
      price: String(service.price),
      description: service.description ?? '',
      isActive: service.isActive,
      locationIds: service.locations.map((l) => l.id),
    })
    setShowForm(true)
  }

  function toggleLocation(id: string) {
    setForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }))
  }

  async function saveService(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(editing ? `/services/${editing.id}` : '/services', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      })
      setNotice(editing ? 'Service updated.' : 'Service created.')
      toast.success(editing ? 'Service updated.' : 'Service created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save service'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteService(service: Service) {
    if (!window.confirm(`Delete "${service.name}"?`)) return
    try {
      await api(`/services/${service.id}`, { method: 'DELETE' })
      setNotice('Service deleted.')
      toast.success('Service deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete service')
    }
  }

  const noLookups = categories.length === 0 || units.length === 0

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">Services</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Services</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Sellable services — spa, transport, laundry, and more — each priced per unit.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCategories(true)}>
            <LuSettings2 /> Manage categories
          </Button>
          <Button onClick={openCreate} disabled={noLookups}>
            <LuPlus /> Add service
          </Button>
        </div>
      </header>

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
      {!loading && noLookups && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <LuCircleAlert />
          {categories.length === 0 ? 'Add a service category first — click "Manage categories" above.' : 'Add a unit of measure first, under System → Units of Measure.'}
        </div>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading services…</div>
      ) : services.length === 0 ? (
        <div className="mt-7 rounded-sm border bg-card p-16 text-center text-sm text-muted-foreground shadow-sm">No services yet.</div>
      ) : (
        <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="rounded-sm border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <span className="rounded-sm bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">{service.category.name}</span>
                <span className={cn('rounded-sm px-2.5 py-1 text-xs font-semibold', service.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{service.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <h2 className="mt-4 font-semibold">{service.name}</h2>
              {service.description && <p className="mt-1 text-xs text-muted-foreground">{service.description}</p>}
              <p className="mt-3 font-display text-xl font-semibold text-secondary">
                {formatKes(Number(service.price))} <span className="text-xs font-normal text-muted-foreground">/ {service.unit.name}</span>
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{service.locations.length > 0 ? `Only at: ${service.locations.map((l) => l.name).join(', ')}` : 'Available everywhere'}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => openEdit(service)} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><LuPencil className="size-3.5" /> Edit</button>
                <button onClick={() => void deleteService(service)} className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"><LuTrash2 className="size-3.5" /> Delete</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveService} className="w-full max-w-lg rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-accent">{editing ? 'Edit service' : 'New service'}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a service'}</h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Airport Transfer" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Category" required>
                <select required className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="" disabled>Select category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Unit" required>
                <select required className="input" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                  <option value="" disabled>Select unit</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Price" required><input required type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" /></Field>
              <Field label="Active">
                <label className="flex items-center gap-2 rounded-sm border bg-background px-3 py-2.5">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
                  <span className="text-sm">Available for sale</span>
                </label>
              </Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </div>

            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Locations</p>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations set up — this service is sellable everywhere by default. Add locations under System → Business Information to scope it to specific selling points.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">Leave all unchecked to make this service available everywhere (the default).</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {locations.map((l) => (
                      <label key={l.id} className="flex items-center justify-between rounded-sm border bg-background px-3 py-2 text-sm">
                        <span>{l.name}{l.type ? <span className="text-muted-foreground"> ({l.type})</span> : null}</span>
                        <input type="checkbox" checked={form.locationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} className="size-4 accent-secondary" />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create service'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCategories && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={load}
        />
      )}
    </div>
  )
}

function ManageCategoriesModal({ categories, onClose, onChanged }: { categories: ServiceCategory[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<ServiceCategory | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)

  async function addCategory(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api('/service-categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      toast.success('Category added.')
      setName('')
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add category')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing || !editingName.trim()) return
    setSaving(true)
    try {
      await api(`/service-categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingName.trim() }) })
      toast.success('Category updated.')
      setEditing(null)
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update category')
    } finally {
      setSaving(false)
    }
  }

  async function removeCategory(category: ServiceCategory) {
    if (!window.confirm(`Delete "${category.name}"?`)) return
    try {
      await api(`/service-categories/${category.id}`, { method: 'DELETE' })
      toast.success('Category deleted.')
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete category')
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-primary/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-sm bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Service Categories</h2>
          <button onClick={onClose} className="text-sm font-semibold text-secondary">Done</button>
        </div>
        <form onSubmit={addCategory} className="mt-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. events" className="input flex-1" />
          <button disabled={saving || !name.trim()} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Add</button>
        </form>
        <div className="mt-4 space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between rounded-sm border p-3">
              {editing?.id === category.id ? (
                <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                  <input required autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="input flex-1" />
                  <button disabled={saving} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-sm border px-3 py-2 text-xs font-semibold hover:bg-muted">Cancel</button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium">{category.name}</p>
                    <p className="text-xs text-muted-foreground">{category._count.services} service{category._count.services === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(category); setEditingName(category.name) }} className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                    <button onClick={() => void removeCategory(category)} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-4" /></button>
                  </div>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <p className="text-center text-sm text-muted-foreground">No categories yet.</p>}
        </div>
      </div>
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
