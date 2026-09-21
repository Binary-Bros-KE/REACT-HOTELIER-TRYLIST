import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LuCircleAlert, LuLayers, LuLoaderCircle, LuPencil, LuPlus, LuSearch, LuSettings2, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import QuickAddModal, { QuickNewButton } from '@/components/QuickAddModal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'
import ServiceVariantsModal from '@/components/services/ServiceVariantsModal'
import VariantStockEditor, { emptyVariantStock, type RecipeInfo, type VariantStock } from '@/components/menu/VariantStockEditor'
import { TAX_CHOICES, taxChoiceLabel, taxChoiceOf, taxPayload, type BizTax, type TaxChoice } from '@/lib/taxChoices'
import { taxCategoryText, type TaxMode, type TaxTreatment } from '@/lib/tax'

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
  cost: string | number | null
  taxRate: string | number | null
  taxMode: TaxMode | null
  taxTreatment: TaxTreatment | null
  durationMinutes: number | null
  productId: string | null
  stockQtyPerUnit: string | number | null
  recipeId: string | null
  variants: { id: string; name: string; price: string | number; isActive: boolean }[]
  description: string | null
  isActive: boolean
  locations: Location[]
}
type ServiceForm = {
  name: string
  categoryId: string
  unitId: string
  price: string
  cost: string
  taxChoice: TaxChoice
  taxRate: string
  duration: string
  stock: VariantStock
  description: string
  isActive: boolean
  locationIds: string[]
}
const emptyForm: ServiceForm = { name: '', categoryId: '', unitId: '', price: '', cost: '', taxChoice: 'INHERIT', taxRate: '', duration: '', stock: emptyVariantStock, description: '', isActive: true, locationIds: [] }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'

export default function Services() {
  const toast = useToast()
  // The same page is mounted under Reception and under Service Center.
  const kicker = useLocation().pathname.startsWith('/reception') ? 'Reception' : 'Service center'
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [quickAdd, setQuickAdd] = useState<'category' | 'unit' | null>(null)
  const [units, setUnits] = useState<UnitOfMeasure[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [bizTax, setBizTax] = useState<BizTax | null>(null)
  const [recipes, setRecipes] = useState<RecipeInfo[]>([])
  const [productOptions, setProductOptions] = useState<{ value: string; label: string; hint?: string }[]>([])
  const [variantsFor, setVariantsFor] = useState<Service | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
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
  useEffect(() => {
    api<{ profile: BizTax | null }>('/business-profile').then((r) => setBizTax(r.profile)).catch(() => {})
    // Recipes need the Kitchen module - a property without it just gets no options.
    api<{ recipes: RecipeInfo[] }>('/recipes').then((r) => setRecipes(r.recipes)).catch(() => {})
    api<{ products: { id: string; name: string; unit: string }[] }>('/products?active=true').then((r) => setProductOptions(r.products.map((p) => ({ value: p.id, label: p.name, hint: p.unit })))).catch(() => {})
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? services.filter((s) => `${s.name} ${s.category.name} ${s.description ?? ''}`.toLowerCase().includes(q)) : services
  }, [services, search])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  function openEdit(service: Service) {
    setEditing(service)
    setForm({
      name: service.name,
      categoryId: service.categoryId,
      unitId: service.unitId,
      price: String(service.price),
      cost: service.cost != null ? String(Number(service.cost)) : '',
      taxChoice: taxChoiceOf(service),
      taxRate: service.taxRate != null ? String(Number(service.taxRate)) : '',
      duration: service.durationMinutes ? String(service.durationMinutes) : '',
      stock: service.recipeId
        ? { mode: 'recipe', stockProductId: '', stockQtyPerUnit: '', recipeId: service.recipeId, overrides: [] }
        : service.productId
          ? { mode: 'product', stockProductId: service.productId, stockQtyPerUnit: service.stockQtyPerUnit != null ? String(Number(service.stockQtyPerUnit)) : '', recipeId: '', overrides: [] }
          : emptyVariantStock,
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
        body: JSON.stringify({
          name: form.name,
          categoryId: form.categoryId,
          unitId: form.unitId,
          price: Number(form.price),
          // Blank cost = not costed (null), never 0.
          cost: form.cost.trim() === '' ? null : Number(form.cost),
          ...taxPayload(form.taxChoice, form.taxRate),
          durationMinutes: form.duration.trim() === '' ? null : Number(form.duration),
          // Stock a unit consumes: one product + quantity, or a recipe - never both.
          productId: form.stock.mode === 'product' ? form.stock.stockProductId || null : null,
          stockQtyPerUnit: form.stock.mode === 'product' && form.stock.stockQtyPerUnit !== '' ? Number(form.stock.stockQtyPerUnit) : null,
          recipeId: form.stock.mode === 'recipe' ? form.stock.recipeId || null : null,
          description: form.description,
          isActive: form.isActive,
          locationIds: form.locationIds,
        }),
      })
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
      toast.success('Service deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete service')
    }
  }

  const noCategories = categories.length === 0

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker={kicker} title="Services" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}
      {!loading && noCategories && (
        <div className="mt-5 flex items-center gap-2 border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <LuCircleAlert />
          Add a service category first — use "Categories" above the table.
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">Sellable services</h2>
            <p className="text-xs text-muted-foreground">Spa, transport, laundry and more — each priced per unit.</p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-64" />
          </label>
          <div className="flex gap-2">
            <ActionButton tone="neutral" icon={<LuSettings2 />} onClick={() => setShowCategories(true)}>Categories</ActionButton>
            <ActionButton tone="primary" icon={<LuPlus />} disabled={noCategories} onClick={openCreate}>Add service</ActionButton>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading services…</div>
        ) : visible.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">{services.length === 0 ? 'No services yet.' : 'No services match your search.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Service</th>
                  <th className={TH}>Category</th>
                  <th className={cn(TH, 'text-right')}>Price</th>
                  <th className={TH}>Tax</th>
                  <th className={TH}>Available at</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((service) => (
                  <tr key={service.id} className="align-middle even:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold">{service.name}{service.variants.length > 0 && <span className="ml-2 text-xs font-normal text-secondary">{service.variants.length} option{service.variants.length === 1 ? '' : 's'}</span>}</p>
                      {service.description && <p className="max-w-xs truncate text-xs text-muted-foreground">{service.description}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{service.category.name}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums">
                      {formatKes(Number(service.price))} <span className="text-xs font-normal text-muted-foreground">/ {service.unit.name}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{taxCategoryText(service.taxTreatment ? service : {}, bizTax)}</td>
                    <td className="max-w-[14rem] truncate px-5 py-3.5 text-xs text-muted-foreground">{service.locations.length > 0 ? service.locations.map((l) => l.name).join(', ') : 'Everywhere'}</td>
                    <td className="px-5 py-3.5"><StatusPill tone={service.isActive ? 'success' : 'muted'}>{service.isActive ? 'Active' : 'Inactive'}</StatusPill></td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuLayers />} title="Options (sizes / durations)" onClick={() => setVariantsFor(service)} />
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit service" onClick={() => openEdit(service)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete service" onClick={() => void deleteService(service)} />
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
        <ModalShell
          size="lg"
          kicker={editing ? 'Edit service' : 'New service'}
          title={editing ? editing.name : 'Add a service'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="service-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create service'}
              </button>
            </>
          }
        >
          <form id="service-form" onSubmit={saveService} className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Airport Transfer" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Category" required>
                <div className="flex gap-2"><select required className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="" disabled>Select category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select><QuickNewButton onClick={() => setQuickAdd('category')} /></div>
              </Field>
              <Field label="Unit" required>
                <div className="flex gap-2"><select required className="input" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                  <option value="" disabled>Select unit</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select><QuickNewButton onClick={() => setQuickAdd('unit')} /></div>
              </Field>
              <Field label="Price" required><input required type="number" min="0" step="0.01" placeholder="e.g. 2500" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" /></Field>
              <Field label="Cost (optional)">
                <input type="number" min="0" step="0.01" placeholder="What it costs you to deliver one unit" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="input" />
              </Field>
              <Field label="Tax treatment">
                <select className="input" value={form.taxChoice} onChange={(e) => setForm({ ...form, taxChoice: e.target.value as TaxChoice })}>
                  {TAX_CHOICES.map((c) => <option key={c.key} value={c.key}>{taxChoiceLabel(c, bizTax)}</option>)}
                </select>
              </Field>
              <Field label="Tax rate (%)">
                <input
                  type="number" min="0" max="100" step="0.01"
                  placeholder={form.taxChoice.startsWith('STANDARD') ? `Blank = ${Number(bizTax?.taxRate ?? 16)}% (property default)` : 'Not used for this treatment'}
                  value={form.taxChoice.startsWith('STANDARD') ? form.taxRate : ''}
                  disabled={!form.taxChoice.startsWith('STANDARD')}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Duration (minutes, optional)">
                <input type="number" min="1" step="1" placeholder="e.g. 60. Times an active service." value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="input" />
              </Field>
              <div className="sm:col-span-2">
                <VariantStockEditor value={form.stock} onChange={(stock) => setForm({ ...form, stock })} productOptions={productOptions} recipes={recipes} allowOverrides={false} label="Stock used per unit sold (optional)" />
                <p className="mt-1 text-xs text-muted-foreground">e.g. a bottle of lotion per massage. Options and add-ons can use their own stock instead.</p>
              </div>
              <Field label="Active">
                <label className="flex items-center gap-2 border bg-background px-3 py-2.5">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
                  <span className="text-sm">Available for sale</span>
                </label>
              </Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </div>

            <div className="mt-6 border-t pt-5">
              <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Locations</p>
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations set up — this service is sellable everywhere by default. Add locations under System → Business Information to scope it to specific selling points.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">Leave all unchecked to make this service available everywhere (the default).</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {locations.map((l) => (
                      <label key={l.id} className="flex items-center justify-between border bg-background px-3 py-2 text-sm">
                        <span>{l.name}{l.type ? <span className="text-muted-foreground"> ({l.type})</span> : null}</span>
                        <input type="checkbox" checked={form.locationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} className="size-4 accent-secondary" />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </form>
        </ModalShell>
      )}

      {variantsFor && (
        <ServiceVariantsModal
          service={variantsFor}
          productOptions={productOptions}
          recipes={recipes}
          onClose={() => setVariantsFor(null)}
          onChanged={load}
        />
      )}

      {showCategories && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={load}
        />
      )}
      {quickAdd === 'category' && (
        <QuickAddModal title="New service category" label="Category name" placeholder="e.g. Spa" endpoint="/service-categories" responseKey="category" onClose={() => setQuickAdd(null)}
          onCreated={(c) => { setCategories((cur) => [...cur, { id: c.id, name: c.name, isActive: true, _count: { services: 0 } }]); setForm((f) => ({ ...f, categoryId: c.id })); setQuickAdd(null) }} />
      )}
      {quickAdd === 'unit' && (
        <QuickAddModal title="New unit of measure" label="Unit name" placeholder="e.g. session" endpoint="/units-of-measure" responseKey="unit" onClose={() => setQuickAdd(null)}
          onCreated={(u) => { setUnits((cur) => [...cur, { id: u.id, name: u.name }]); setForm((f) => ({ ...f, unitId: u.id })); setQuickAdd(null) }} />
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
    <ModalShell size="sm" kicker="Services" title="Categories" onClose={onClose}>
      <div className="p-5">
        <form onSubmit={addCategory} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Events" className="input flex-1" />
          <button disabled={saving || !name.trim()} className="bg-primary px-4 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-50">Add</button>
        </form>
        <div className="mt-4 divide-y border">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between gap-2 p-3 even:bg-muted/30">
              {editing?.id === category.id ? (
                <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                  <input required autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="input flex-1" />
                  <button disabled={saving} className="bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="border-2 border-foreground/20 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium">{category.name}</p>
                    <p className="text-xs text-muted-foreground">{category._count.services} service{category._count.services === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <ActionButton tone="neutral" icon={<LuPencil />} title="Rename" onClick={() => { setEditing(category); setEditingName(category.name) }} />
                    <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete" onClick={() => void removeCategory(category)} />
                  </div>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No categories yet.</p>}
        </div>
      </div>
    </ModalShell>
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
