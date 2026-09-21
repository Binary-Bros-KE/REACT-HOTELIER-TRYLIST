import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuImageOff, LuLoaderCircle, LuPencil, LuPlus, LuPower, LuSearch, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type MenuCategory = { id: string; name: string; isActive: boolean }
type StockProduct = { id: string; name: string; unit: string; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }
type Addon = {
  id: string
  name: string
  description: string | null
  price: string
  sku: string | null
  imageUrl: string | null
  menuCategoryId: string | null
  menuCategory: { id: string; name: string } | null
  stockProductId: string | null
  stockQtyPerUnit: string | null
  stockProduct: StockProduct | null
  recipeId: string | null
  recipe: { id: string; name: string } | null
  isActive: boolean
  _count: { orderItems: number }
}
type StockMode = 'none' | 'product' | 'recipe'
type Form = { name: string; description: string; price: string; sku: string; imageUrl: string; menuCategoryId: string; isActive: boolean; stockMode: StockMode; stockProductId: string; stockQtyPerUnit: string; recipeId: string }
const emptyForm: Form = { name: '', description: '', price: '', sku: '', imageUrl: '', menuCategoryId: '', isActive: true, stockMode: 'none', stockProductId: '', stockQtyPerUnit: '', recipeId: '' }

// "750 ml bottle" / "500 ml can" — what one unit of a pack-tracked product
// actually is, so picking a quantity per sale means something. Mirrors
// MenuItems.tsx's own packHint (kept local there too — small enough not to
// be worth sharing).
function packHint(p: StockProduct): string | undefined {
  if (!p.packSize || !p.packUnit) return undefined
  return `1 ${p.packLabel || 'pack'} = ${Number(p.packSize).toLocaleString()} ${p.packUnit.name}`
}

const TH = 'px-4 py-3 text-xs font-bold uppercase tracking-wider'
const money = (v: string | number) => `KSh ${Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export default function Addons() {
  const toast = useToast()
  const [addons, setAddons] = useState<Addon[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [stockProducts, setStockProducts] = useState<StockProduct[]>([])
  const [recipes, setRecipes] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [form, setForm] = useState<Form>(emptyForm)
  const [editing, setEditing] = useState<Addon | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api<{ addons: Addon[] }>('/addons')
      setAddons(r.addons)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load add-ons'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api<{ categories: MenuCategory[] }>('/menu-categories').then((r) => setCategories(r.categories)).catch(() => {})
    api<{ products: StockProduct[] }>('/products?active=true').then((r) => setStockProducts(r.products)).catch(() => {})
    // Recipes need the Kitchen module - a property without it just gets no options.
    api<{ recipes: { id: string; name: string }[] }>('/recipes').then((r) => setRecipes(r.recipes)).catch(() => {})
  }, [])

  const stockProductOptions = useMemo(
    () => stockProducts.map((p) => ({ value: p.id, label: p.name, hint: packHint(p) ?? p.unit })),
    [stockProducts],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return addons.filter((a) =>
      (!categoryFilter || (categoryFilter === '__none__' ? !a.menuCategoryId : a.menuCategoryId === categoryFilter)) &&
      (!q || a.name.toLowerCase().includes(q) || (a.sku ?? '').toLowerCase().includes(q)),
    )
  }, [addons, search, categoryFilter])

  function openCreate() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(a: Addon) {
    setEditing(a)
    setForm({
      name: a.name, description: a.description ?? '', price: String(Number(a.price)), sku: a.sku ?? '', imageUrl: a.imageUrl ?? '', menuCategoryId: a.menuCategoryId ?? '', isActive: a.isActive,
      stockMode: a.recipeId ? 'recipe' : a.stockProductId ? 'product' : 'none',
      stockProductId: a.stockProductId ?? '',
      stockQtyPerUnit: a.stockQtyPerUnit != null ? String(Number(a.stockQtyPerUnit)) : '',
      recipeId: a.recipeId ?? '',
    })
    setShowForm(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim() || form.price === '') return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price: Number(form.price),
        sku: form.sku.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        menuCategoryId: form.menuCategoryId || null,
        isActive: form.isActive,
        stockProductId: form.stockMode === 'product' ? form.stockProductId || null : null,
        stockQtyPerUnit: form.stockMode === 'product' && form.stockQtyPerUnit !== '' ? Number(form.stockQtyPerUnit) : null,
        recipeId: form.stockMode === 'recipe' ? form.recipeId || null : null,
      }
      await api(editing ? `/addons/${editing.id}` : '/addons', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(editing ? 'Add-on updated.' : 'Add-on created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save add-on')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(a: Addon) {
    setBusy(true)
    try {
      await api(`/addons/${a.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !a.isActive }) })
      toast.success(a.isActive ? 'Add-on deactivated.' : 'Add-on activated.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update add-on')
    } finally {
      setBusy(false)
    }
  }

  async function remove(a: Addon) {
    if (!window.confirm(`Delete "${a.name}"?`)) return
    try {
      await api(`/addons/${a.id}`, { method: 'DELETE' })
      toast.success('Add-on deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete add-on')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Menu" title="Add-ons" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />{error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">Extras a cashier can attach to any item</h2>
            <p className="max-w-xl text-xs text-muted-foreground">
              One record per extra. Tag each with a menu category so the POS add-on picker can filter to it; leave it blank to keep it general.
            </p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-60" />
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All categories</option>
            <option value="__none__">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>New add-on</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading add-ons…</div>
        ) : visible.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">{search.trim() || categoryFilter ? 'No add-ons match.' : 'No add-ons yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="w-14" aria-label="Image" />
                  <th className={TH}>Add-on</th>
                  <th className={TH}>Category</th>
                  <th className={cn(TH, 'text-right')}>Price</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((a) => (
                  <tr key={a.id} className={cn('align-middle transition even:bg-muted/30 hover:bg-muted/60', !a.isActive && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <span className="flex size-10 items-center justify-center overflow-hidden border bg-muted/50 text-muted-foreground">
                        {a.imageUrl
                          ? <img src={a.imageUrl} alt="" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          : <LuImageOff className="size-4" />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{a.name}</p>
                      <p className="max-w-sm truncate text-xs text-muted-foreground">
                        {[a.sku && `SKU ${a.sku}`, a.description].filter(Boolean).join(' · ') || <span className="italic">no details</span>}
                      </p>
                      {a.stockProduct ? (
                        <p className="mt-0.5 text-xs font-medium text-secondary">→ {Number(a.stockQtyPerUnit ?? 1)} {a.stockProduct.packUnit?.name ?? a.stockProduct.unit} of {a.stockProduct.name}</p>
                      ) : (
                        <p className="mt-0.5 text-xs italic text-warning">No stock impact</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.menuCategory?.name ?? <span className="text-xs italic">Any</span>}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(a.price)}</td>
                    <td className="px-4 py-3"><StatusPill tone={a.isActive ? 'success' : 'muted'}>{a.isActive ? 'Active' : 'Inactive'}</StatusPill></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(a)} />
                        <ActionButton tone="neutral" icon={<LuPower />} title={a.isActive ? 'Deactivate' : 'Activate'} disabled={busy} onClick={() => void toggleActive(a)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title={a._count.orderItems > 0 ? 'On an order — deactivate instead' : 'Delete'} disabled={a._count.orderItems > 0} onClick={() => void remove(a)} />
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
          size="md"
          kicker={editing ? 'Edit add-on' : 'New add-on'}
          title={editing ? editing.name : 'Add an add-on'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="addon-form" disabled={saving || !form.name.trim() || form.price === ''} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create add-on'}
              </button>
            </>
          }
        >
          <form id="addon-form" onSubmit={save}>
            <div className="space-y-4 p-5">
              <Field label="Name" required><input required autoFocus placeholder="e.g. Cheddar" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (KSh)" required><input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" /></Field>
                <Field label="SKU"><input placeholder="Optional" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="input" /></Field>
              </div>
              <Field label="Menu category">
                <select value={form.menuCategoryId} onChange={(e) => setForm({ ...form, menuCategoryId: e.target.value })} className="input">
                  <option value="">Any — shows for every item</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">The POS add-on picker opens filtered to the menu item's category.</span>
              </Field>
              <Field label="Stock deduction">
                <select className="input" value={form.stockMode} onChange={(e) => setForm({ ...form, stockMode: e.target.value as StockMode })}>
                  <option value="none">Doesn't affect stock</option>
                  <option value="product">Consumes a set amount of one product</option>
                  <option value="recipe">Uses a recipe (several ingredients)</option>
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">e.g. "Extra Red Bull" consuming 1 can, or "Double shot" consuming 25ml of the same spirit. Without this link, this add-on never touches stock — model mixers/extra pours here, not as a bare add-on.</span>
              </Field>
              {form.stockMode === 'recipe' && (
                <Field label="Recipe">
                  <SearchableSelect
                    options={recipes.map((r) => ({ value: r.id, label: r.name }))}
                    value={form.recipeId}
                    onChange={(value) => setForm({ ...form, recipeId: value })}
                    placeholder={recipes.length ? 'Select a recipe' : 'No recipes yet - add one under Kitchen > Recipes'}
                    searchPlaceholder="Search recipes…"
                    emptyText="No recipes match."
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">One unit of this add-on uses everything in the recipe, multiplied by how many are ordered.</span>
                </Field>
              )}
              {form.stockMode === 'product' && (
                <>
                  <Field label="Product">
                    <SearchableSelect
                      options={stockProductOptions}
                      value={form.stockProductId}
                      onChange={(value) => setForm({ ...form, stockProductId: value })}
                      placeholder="Select a product"
                      searchPlaceholder="Search products…"
                      emptyText="No products match."
                    />
                  </Field>
                  <Field label="Consumes per sale">
                    <input
                      type="number" min="0" step="0.001" placeholder="e.g. 1"
                      value={form.stockQtyPerUnit}
                      onChange={(e) => setForm({ ...form, stockQtyPerUnit: e.target.value })}
                      className="input"
                    />
                    {(() => {
                      const p = stockProducts.find((x) => x.id === form.stockProductId)
                      if (!p) return null
                      const hint = packHint(p)
                      return <span className="mt-1 block text-xs text-muted-foreground">In {p.packUnit?.name ?? p.unit}{hint ? ` — ${hint}` : ''}</span>
                    })()}
                  </Field>
                </>
              )}
              <Field label="Description"><input placeholder="Optional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
              <Field label="Image URL">
                <input type="url" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="input" />
                {form.imageUrl.trim() && (
                  <span className="mt-2 flex size-20 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                    <img src={form.imageUrl} alt="preview" className="size-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0.15' }} />
                  </span>
                )}
              </Field>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </div>
          </form>
        </ModalShell>
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
