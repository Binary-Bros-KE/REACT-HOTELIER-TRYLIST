import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuEyeOff,
  LuImageOff,
  LuLayers,
  LuListChecks,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuPower,
  LuSearch,
  LuTrash2,
  LuX,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { taxCategoryText, type TaxMode, type TaxTreatment } from '@/lib/tax'

const TEMPERATURES = ['OTHER', 'HOT', 'COLD'] as const
type Temperature = (typeof TEMPERATURES)[number]
const tempLabel: Record<Temperature, string> = { OTHER: 'Not a drink', HOT: 'Hot drink', COLD: 'Cold drink' }

type Category = { id: string; name: string; isActive: boolean }
type Location = { id: string; name: string; type: string | null }
type StockProduct = {
  id: string
  name: string
  unit: string
  packSize: string | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
}
type Recipe = { id: string; name: string }

type MenuItem = {
  id: string
  name: string
  shortName: string | null
  menuCategoryId: string
  menuCategory: { id: string; name: string; isActive: boolean }
  description: string | null
  sku: string | null
  price: string
  taxRate: string | null
  taxMode: TaxMode | null
  taxTreatment: TaxTreatment | null
  photoUrl: string | null
  temperature: Temperature
  isVegetarian: boolean
  allowsAddons: boolean
  isActive: boolean
  isAvailable: boolean
  sortOrder: number
  locations: { id: string; name: string }[]
  productId: string | null
  recipeId: string | null
  stockQtyPerUnit: string | null
  product: StockProduct | null
  recipe: Recipe | null
  variants: { price: string }[]
  _count: { orderItems: number; variants: number }
}

function displayPrice(item: MenuItem): number {
  if (item.variants.length === 0) return Number(item.price)
  return Math.min(...item.variants.map((v) => Number(v.price)))
}

type Variant = {
  id: string
  menuItemId: string
  name: string
  sku: string | null
  price: string
  stockProductId: string | null
  stockQtyPerUnit: string | null
  stockProduct: StockProduct | null
  isActive: boolean
  sortOrder: number
}

// "750 ml bottle" / "500 ml can" — what one unit of a pack-tracked product
// actually is, so picking a serving size means something.
function packHint(p: StockProduct): string | undefined {
  if (!p.packSize || !p.packUnit) return undefined
  return `1 ${p.packLabel || 'pack'} = ${Number(p.packSize).toLocaleString()} ${p.packUnit.name}`
}

const TAX_CHOICES = [
  { key: 'INHERIT', label: 'Business default' },
  { key: 'STANDARD_INCLUSIVE', label: 'Standard — inclusive' },
  { key: 'STANDARD_EXCLUSIVE', label: 'Standard — exclusive' },
  { key: 'ZERO_RATED', label: 'Zero-rated (0%)' },
  { key: 'EXEMPT', label: 'Exempt' },
] as const
type TaxChoice = (typeof TAX_CHOICES)[number]['key']
type BizTax = { taxRate: string | null; taxMode: TaxMode; taxTreatment: TaxTreatment }

function taxChoiceOf(item: Pick<MenuItem, 'taxTreatment' | 'taxMode'>): TaxChoice {
  if (!item.taxTreatment) return 'INHERIT'
  if (item.taxTreatment === 'STANDARD') return item.taxMode === 'EXCLUSIVE' ? 'STANDARD_EXCLUSIVE' : 'STANDARD_INCLUSIVE'
  return item.taxTreatment
}
function taxPayload(choice: TaxChoice, rate: string) {
  const r = rate.trim() === '' ? null : Number(rate)
  switch (choice) {
    case 'STANDARD_INCLUSIVE': return { taxTreatment: 'STANDARD', taxMode: 'INCLUSIVE', taxRate: r }
    case 'STANDARD_EXCLUSIVE': return { taxTreatment: 'STANDARD', taxMode: 'EXCLUSIVE', taxRate: r }
    case 'ZERO_RATED': return { taxTreatment: 'ZERO_RATED', taxMode: null, taxRate: null }
    case 'EXEMPT': return { taxTreatment: 'EXEMPT', taxMode: null, taxRate: null }
    default: return { taxTreatment: null, taxMode: null, taxRate: null }
  }
}
function describeBizTax(biz: BizTax | null): string {
  if (!biz) return 'the property setting'
  return taxCategoryText(biz)
}

function describeItemTax(item: MenuItem, biz: BizTax | null): string {
  return taxCategoryText(item.taxTreatment ? item : {}, biz)
}

// How selling this item affects stock: nothing tracked, one direct product
// (a whole-bottle beer), or a recipe (multi-ingredient / cocktails).
type StockMode = 'none' | 'product' | 'recipe'

type Form = {
  name: string
  shortName: string
  menuCategoryId: string
  description: string
  sku: string
  price: string
  taxChoice: TaxChoice
  taxRate: string
  photoUrl: string
  temperature: Temperature
  isVegetarian: boolean
  allowsAddons: boolean
  isActive: boolean
  isAvailable: boolean
  locationIds: string[]
  stockMode: StockMode
  stockProductId: string
  stockQtyPerUnit: string
  recipeId: string
}
const emptyForm: Form = {
  name: '', shortName: '', menuCategoryId: '', description: '', sku: '', price: '', taxChoice: 'INHERIT', taxRate: '',
  photoUrl: '', temperature: 'OTHER', isVegetarian: false, allowsAddons: false, isActive: true, isAvailable: true, locationIds: [],
  stockMode: 'none', stockProductId: '', stockQtyPerUnit: '', recipeId: '',
}

const money = (v: string | number) => `KSh ${Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export default function MenuItems() {
  const toast = useToast()
  const [items, setItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'unavailable'>('all')
  const [form, setForm] = useState<Form>(emptyForm)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  // Variants staged in the create form — POSTed after the item is created.
  const [newVariants, setNewVariants] = useState<{ name: string; price: string; sku: string; stockProductId: string; stockQtyPerUnit: string }[]>([])
  const [variantDraft, setVariantDraft] = useState({ name: '', price: '', sku: '', stockProductId: '', stockQtyPerUnit: '' })
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [variantsFor, setVariantsFor] = useState<MenuItem | null>(null)
  const [bizTax, setBizTax] = useState<BizTax | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [stockProducts, setStockProducts] = useState<StockProduct[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (categoryFilter) query.set('categoryId', categoryFilter)
      if (statusFilter === 'active') query.set('active', 'true')
      if (statusFilter === 'inactive') query.set('active', 'false')
      if (statusFilter === 'unavailable') query.set('available', 'false')
      const response = await api<{ items: MenuItem[] }>(`/menu-items${query.size ? `?${query}` : ''}`)
      setItems(response.items)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load menu items'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, statusFilter, toast])

  useEffect(() => { const t = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(t) }, [load])
  useEffect(() => {
    api<{ categories: Category[] }>('/menu-categories').then((r) => setCategories(r.categories)).catch(() => {})
    api<{ profile: BizTax | null }>('/business-profile').then((r) => setBizTax(r.profile)).catch(() => {})
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
    api<{ products: StockProduct[] }>('/products?active=true').then((r) => setStockProducts(r.products)).catch(() => {})
    // Recipes need the Kitchen module — a property without it just gets no options here.
    api<{ recipes: Recipe[] }>('/recipes').then((r) => setRecipes(r.recipes)).catch(() => {})
  }, [])

  const stockProductOptions = useMemo(
    () => stockProducts.map((p) => ({ value: p.id, label: p.name, hint: packHint(p) ?? p.unit })),
    [stockProducts],
  )
  const recipeOptions = useMemo(() => recipes.map((r) => ({ value: r.id, label: r.name })), [recipes])

  const summary = useMemo(() => ({
    total: items.length,
    unavailable: items.filter((i) => !i.isAvailable).length,
    inactive: items.filter((i) => !i.isActive).length,
  }), [items])

  const canReorder = !!categoryFilter && !search.trim() && statusFilter === 'all'

  function resetVariantStaging() {
    setNewVariants([])
    setVariantDraft({ name: '', price: '', sku: '', stockProductId: '', stockQtyPerUnit: '' })
  }

  function addStagedVariant() {
    if (!variantDraft.name.trim() || variantDraft.price === '') return
    setNewVariants((v) => [...v, {
      name: variantDraft.name.trim(),
      price: variantDraft.price,
      sku: variantDraft.sku.trim(),
      stockProductId: variantDraft.stockProductId,
      stockQtyPerUnit: variantDraft.stockQtyPerUnit,
    }])
    setVariantDraft({ name: '', price: '', sku: '', stockProductId: '', stockQtyPerUnit: '' })
  }

  function openCreate() {
    setEditing(null)
    setShowCategoryModal(false)
    resetVariantStaging()
    setForm({ ...emptyForm, menuCategoryId: categoryFilter || categories.find((c) => c.isActive)?.id || '' })
    setShowForm(true)
  }

  function openEdit(item: MenuItem) {
    setEditing(item)
    setShowCategoryModal(false)
    resetVariantStaging()
    setForm({
      name: item.name,
      shortName: item.shortName ?? '',
      menuCategoryId: item.menuCategoryId,
      description: item.description ?? '',
      sku: item.sku ?? '',
      price: String(Number(item.price)),
      taxChoice: taxChoiceOf(item),
      taxRate: item.taxRate != null ? String(Number(item.taxRate)) : '',
      photoUrl: item.photoUrl ?? '',
      temperature: item.temperature,
      isVegetarian: item.isVegetarian,
      allowsAddons: item.allowsAddons,
      isActive: item.isActive,
      isAvailable: item.isAvailable,
      locationIds: item.locations.map((l) => l.id),
      stockMode: item.recipeId ? 'recipe' : item.productId ? 'product' : 'none',
      stockProductId: item.productId ?? '',
      stockQtyPerUnit: item.stockQtyPerUnit != null ? String(Number(item.stockQtyPerUnit)) : '',
      recipeId: item.recipeId ?? '',
    })
    setShowForm(true)
  }

  const toggleLocation = (id: string) =>
    setForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim() || !form.menuCategoryId || form.price === '') return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        menuCategoryId: form.menuCategoryId,
        description: form.description.trim() || undefined,
        sku: form.sku.trim() || undefined,
        price: Number(form.price),
        ...taxPayload(form.taxChoice, form.taxRate),
        photoUrl: form.photoUrl.trim() || undefined,
        temperature: form.temperature,
        isVegetarian: form.isVegetarian,
        allowsAddons: form.allowsAddons,
        isActive: form.isActive,
        isAvailable: form.isAvailable,
        locationIds: form.locationIds,
        productId: form.stockMode === 'product' ? form.stockProductId || null : null,
        recipeId: form.stockMode === 'recipe' ? form.recipeId || null : null,
        stockQtyPerUnit: form.stockMode === 'product' && form.stockQtyPerUnit !== '' ? Number(form.stockQtyPerUnit) : null,
      }
      if (editing) {
        await api(`/menu-items/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      } else {
        const { item } = await api<{ item: { id: string } }>('/menu-items', { method: 'POST', body: JSON.stringify(payload) })
        if (newVariants.length > 0) {
          const results = await Promise.allSettled(newVariants.map((v) =>
            api(`/menu-items/${item.id}/variants`, {
              method: 'POST',
              body: JSON.stringify({
                name: v.name,
                price: Number(v.price),
                sku: v.sku || undefined,
                stockProductId: v.stockProductId || undefined,
                stockQtyPerUnit: v.stockQtyPerUnit !== '' ? Number(v.stockQtyPerUnit) : undefined,
              }),
            }),
          ))
          const failed = results.filter((r) => r.status === 'rejected').length
          if (failed > 0) toast.error(`Item saved, but ${failed} variant${failed === 1 ? '' : 's'} could not be added — add them from the item's row.`)
        }
      }
      toast.success(editing ? 'Menu item updated.' : 'Menu item created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save menu item')
    } finally {
      setSaving(false)
    }
  }

  async function patch(item: MenuItem, body: Partial<Pick<MenuItem, 'isActive' | 'isAvailable'>>, message: string) {
    setBusy(true)
    try {
      await api(`/menu-items/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      toast.success(message)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update menu item')
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: MenuItem) {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    try {
      await api(`/menu-items/${item.id}`, { method: 'DELETE' })
      toast.success('Menu item deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete menu item')
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (!canReorder || target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
    setBusy(true)
    try {
      await api('/menu-items/reorder', { method: 'POST', body: JSON.stringify({ menuCategoryId: categoryFilter, orderedIds: next.map((i) => i.id) }) })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reorder')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Menu" title="Menu Items" />

      {categories.length === 0 && !loading && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <LuCircleAlert /> Add a menu category first — Menu ▸ Menu Categories.
        </div>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {([
          ['Items', summary.total, <LuListChecks key="i" />],
          ['Unavailable', summary.unavailable, <LuEyeOff key="i" />],
          ['Inactive', summary.inactive, <LuPower key="i" />],
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

      <section className="mt-6 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, short name or SKU…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (inactive)'}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="all">Any status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="unavailable">Unavailable only</option>
          </select>
          <ActionButton tone="primary" icon={<LuPlus />} disabled={categories.length === 0} onClick={openCreate}>New item</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading menu items…</div>
        ) : items.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">{search.trim() || categoryFilter || statusFilter !== 'all' ? 'No items match these filters.' : 'No menu items yet.'}</div>
        ) : (
          <div>
            {!canReorder && !search.trim() && !categoryFilter && (
              <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Filter by a single category to drag items into order.</p>
            )}

            {/* Mobile — cards */}
            <div className="divide-y sm:hidden">
              {items.map((item, index) => (
                <div key={item.id} className={cn('flex gap-3 p-4', !item.isActive && 'opacity-60')}>
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50 text-muted-foreground">
                    {item.photoUrl
                      ? <img src={item.photoUrl} alt="" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      : <LuImageOff className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.menuCategory.name}</p>
                      </div>
                      <p className="shrink-0 text-right text-sm font-medium tabular-nums">
                        {item._count.variants > 0 && <span className="block text-[10px] font-normal leading-tight text-muted-foreground">from</span>}
                        {money(displayPrice(item))}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[item.shortName, item.sku && `SKU ${item.sku}`].filter(Boolean).join(' · ') || <span className="italic">no short name</span>}
                      {' · '}{describeItemTax(item, bizTax)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.locations.length > 0 ? `Only at: ${item.locations.map((l) => l.name).join(', ')}` : 'Available everywhere'}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => void patch(item, { isAvailable: !item.isAvailable }, item.isAvailable ? 'Marked unavailable.' : 'Marked available.')}
                        disabled={busy}
                        className={cn(
                          'keep-round inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-0.5 text-xs font-semibold transition',
                          item.isAvailable ? 'border-success/40 text-success hover:bg-success/10' : 'border-warning/40 text-warning hover:bg-warning/10',
                        )}
                      >
                        {!item.isAvailable && <LuEyeOff className="size-3" />}
                        {item.isAvailable ? 'Available' : 'Sold out'}
                      </button>
                      <span className={cn(
                        'keep-round inline-flex whitespace-nowrap rounded-full border border-dashed px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        item.isActive ? 'border-success/40 text-success' : 'border-muted-foreground/30 text-muted-foreground',
                      )}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => void move(index, -1)} disabled={busy || !canReorder || index === 0} title={canReorder ? 'Move up' : 'Filter to one category to reorder'} className="rounded-sm p-1 text-muted-foreground hover:bg-muted disabled:opacity-20">
                          <LuChevronUp className="size-4" />
                        </button>
                        <button onClick={() => void move(index, 1)} disabled={busy || !canReorder || index === items.length - 1} title={canReorder ? 'Move down' : 'Filter to one category to reorder'} className="rounded-sm p-1 text-muted-foreground hover:bg-muted disabled:opacity-20">
                          <LuChevronDown className="size-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setVariantsFor(item)} title="Variants (sizes / options)" className="relative rounded-md p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary">
                          <LuLayers className="size-4" />
                          {item._count.variants > 0 && <span className="absolute -right-0.5 -top-0.5 keep-round flex min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold leading-4 text-secondary-foreground">{item._count.variants}</span>}
                        </button>
                        <button onClick={() => openEdit(item)} title="Edit" className="rounded-md p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                        <button
                          onClick={() => void patch(item, { isActive: !item.isActive }, item.isActive ? 'Item deactivated.' : 'Item activated.')}
                          disabled={busy}
                          title={item.isActive ? 'Deactivate' : 'Activate'}
                          className={cn('rounded-md p-2 hover:bg-muted', item.isActive ? 'text-muted-foreground' : 'text-success')}
                        >
                          <LuPower className="size-4" />
                        </button>
                        <button
                          onClick={() => void remove(item)}
                          disabled={item._count.orderItems > 0}
                          title={item._count.orderItems > 0 ? 'On an order — deactivate instead' : 'Delete'}
                          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        >
                          <LuTrash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop / tablet — table */}
            <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th className="w-14 text-center">Order</th>
                  <th className="w-14" aria-label="Image" />
                  <th>Item</th>
                  <th>Category</th>
                  <th className="text-right">Price</th>
                  <th>Availability</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {items.map((item, index) => (
                  <tr key={item.id} className={cn('align-middle transition hover:bg-muted/40', !item.isActive && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => void move(index, -1)} disabled={busy || !canReorder || index === 0} title={canReorder ? 'Move up' : 'Filter to one category to reorder'} className="rounded-sm p-1 text-muted-foreground hover:bg-muted disabled:opacity-20">
                          <LuChevronUp className="size-4" />
                        </button>
                        <button onClick={() => void move(index, 1)} disabled={busy || !canReorder || index === items.length - 1} title={canReorder ? 'Move down' : 'Filter to one category to reorder'} className="rounded-sm p-1 text-muted-foreground hover:bg-muted disabled:opacity-20">
                          <LuChevronDown className="size-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted/50 text-muted-foreground">
                        {item.photoUrl
                          ? <img src={item.photoUrl} alt="" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          : <LuImageOff className="size-4" />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[item.shortName, item.sku && `SKU ${item.sku}`].filter(Boolean).join(' · ') || <span className="italic">no short name</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.locations.length > 0 ? `Only at: ${item.locations.map((l) => l.name).join(', ')}` : 'Available everywhere'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.menuCategory.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {item._count.variants > 0 ? <span className="text-xs font-normal text-muted-foreground">from </span> : null}
                      {money(displayPrice(item))}
                      <span className="ml-1 text-xs text-muted-foreground">{describeItemTax(item, bizTax)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void patch(item, { isAvailable: !item.isAvailable }, item.isAvailable ? 'Marked unavailable.' : 'Marked available.')}
                        disabled={busy}
                        className={cn(
                          'keep-round inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-0.5 text-xs font-semibold transition',
                          item.isAvailable ? 'border-success/40 text-success hover:bg-success/10' : 'border-warning/40 text-warning hover:bg-warning/10',
                        )}
                      >
                        {!item.isAvailable && <LuEyeOff className="size-3" />}
                        {item.isAvailable ? 'Available' : 'Sold out'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'keep-round inline-flex whitespace-nowrap rounded-full border border-dashed px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        item.isActive ? 'border-success/40 text-success' : 'border-muted-foreground/30 text-muted-foreground',
                      )}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setVariantsFor(item)} title="Variants (sizes / options)" className="relative rounded-md p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary">
                          <LuLayers className="size-4" />
                          {item._count.variants > 0 && <span className="absolute -right-0.5 -top-0.5 keep-round flex min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold leading-4 text-secondary-foreground">{item._count.variants}</span>}
                        </button>
                        <button onClick={() => openEdit(item)} title="Edit" className="rounded-md p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                        <button
                          onClick={() => void patch(item, { isActive: !item.isActive }, item.isActive ? 'Item deactivated.' : 'Item activated.')}
                          disabled={busy}
                          title={item.isActive ? 'Deactivate' : 'Activate'}
                          className={cn('rounded-md p-2 hover:bg-muted', item.isActive ? 'text-muted-foreground' : 'text-success')}
                        >
                          <LuPower className="size-4" />
                        </button>
                        <button
                          onClick={() => void remove(item)}
                          disabled={item._count.orderItems > 0}
                          title={item._count.orderItems > 0 ? 'On an order — deactivate instead' : 'Delete'}
                          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        >
                          <LuTrash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit item' : 'New item'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a menu item'}</h2>
            </div>

            <FieldGroup title="Basics">
              <Field label="Name" required className="sm:col-span-2"><input required autoFocus placeholder="e.g. Chicken Burger" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Short name"><input placeholder="Receipt / KOT label" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} className="input" /></Field>
              <div className="block text-sm font-medium">
                <div className="flex items-center justify-between gap-2">
                  <span>Category <span className="text-destructive">*</span></span>
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"
                  >
                    <LuPlus className="size-3.5" /> New category
                  </button>
                </div>
                <span className="mt-1.5 block">
                  <SearchableSelect
                    options={categories.map((c) => ({ value: c.id, label: c.name, hint: c.isActive ? undefined : 'inactive' }))}
                    value={form.menuCategoryId}
                    onChange={(value) => setForm({ ...form, menuCategoryId: value })}
                    placeholder="Select category"
                    searchPlaceholder="Search categories…"
                    emptyText="No categories match."
                  />
                </span>
              </div>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} placeholder="Shown on the menu" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
              <Field label="Image URL" className="sm:col-span-2">
                <input type="url" placeholder="https://…" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} className="input" />
                {form.photoUrl.trim() && (
                  <span className="mt-2 flex size-24 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                    <img src={form.photoUrl} alt="preview" className="size-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0.15' }} />
                  </span>
                )}
              </Field>
            </FieldGroup>

            <FieldGroup title="Pricing">
              {editing && editing._count.variants > 0 ? (
                <div>
                  <span className="text-sm font-medium">Price (KSh)</span>
                  <p className="mt-1.5 rounded-sm border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Not used — this item has variants, each with its own price. Manage them from the item's row. Delete all variants to price this item directly again.
                  </p>
                </div>
              ) : (
                <Field label="Price (KSh)" required><input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" /></Field>
              )}
              <Field label="SKU"><input placeholder="Optional — unique" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="input" /></Field>
              <Field label="Tax treatment">
                <select className="input" value={form.taxChoice} onChange={(e) => setForm({ ...form, taxChoice: e.target.value as TaxChoice })}>
                  {TAX_CHOICES.map((c) => {
                    const rate = Number(bizTax?.taxRate ?? 16)
                    const label = c.key === 'INHERIT'
                      ? `Business default (${describeBizTax(bizTax)})`
                      : c.key.startsWith('STANDARD') ? `${rate}% ${c.label}` : c.label
                    return <option key={c.key} value={c.key}>{label}</option>
                  })}
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
              <Field label="Drink type">
                <select className="input" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value as Temperature })}>
                  {TEMPERATURES.map((t) => <option key={t} value={t}>{tempLabel[t]}</option>)}
                </select>
              </Field>
            </FieldGroup>

            <FieldGroup title="Stock deduction">
              <Field label="On sale, this item" className="sm:col-span-2">
                <select
                  className="input"
                  value={form.stockMode}
                  onChange={(e) => setForm({ ...form, stockMode: e.target.value as StockMode })}
                >
                  <option value="none">Doesn't track stock</option>
                  <option value="product">Consumes a set amount of one product</option>
                  <option value="recipe">Uses a recipe (multiple ingredients)</option>
                </select>
              </Field>
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
                      type="number" min="0" step="0.001" placeholder="e.g. 500"
                      value={form.stockQtyPerUnit}
                      onChange={(e) => setForm({ ...form, stockQtyPerUnit: e.target.value })}
                      className="input"
                    />
                    {(() => {
                      const p = stockProducts.find((x) => x.id === form.stockProductId)
                      if (!p) return null
                      const hint = packHint(p)
                      return (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          In {p.packUnit?.name ?? p.unit}{hint ? ` — ${hint}` : ''}
                        </span>
                      )
                    })()}
                  </Field>
                </>
              )}
              {form.stockMode === 'recipe' && (
                <Field label="Recipe" className="sm:col-span-2">
                  <SearchableSelect
                    options={recipeOptions}
                    value={form.recipeId}
                    onChange={(value) => setForm({ ...form, recipeId: value })}
                    placeholder={recipeOptions.length ? 'Select a recipe' : 'No recipes yet — add one under Kitchen → Recipes'}
                    searchPlaceholder="Search recipes…"
                    emptyText="No recipes match."
                    disabled={recipeOptions.length === 0}
                  />
                </Field>
              )}
              {!!editing?._count.variants && form.stockMode !== 'none' && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  This item has variants — any variant with its own product set (in Variants) overrides this for that size.
                </p>
              )}
            </FieldGroup>

            <FieldGroup title="Available at">
              <div className="sm:col-span-2">
                {locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No locations set up — this item is sellable everywhere. Add selling points under Business to scope items.</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">Leave all unchecked to make this item available at every location (the default). Tick some to limit it.</p>
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
            </FieldGroup>

            {!editing && (
              <div className="mt-6 border-t pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variants (sizes / options)</p>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">Optional — Small / Medium / Large, each with its own price. You can also add or edit these later from the item's row.</p>

                {newVariants.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {newVariants.map((v, i) => {
                      const p = stockProducts.find((x) => x.id === v.stockProductId)
                      return (
                        <div key={i} className="flex items-center justify-between gap-3 rounded-sm border bg-muted/40 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{v.name}</span>
                            {p && (
                              <span className="ml-2 text-xs text-secondary">
                                → {v.stockQtyPerUnit || 1} {p.packUnit?.name ?? p.unit} of {p.name}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className="tabular-nums">{money(v.price || 0)}</span>
                            {v.sku && <span className="text-xs text-muted-foreground">{v.sku}</span>}
                            <button type="button" onClick={() => setNewVariants((cur) => cur.filter((_, x) => x !== i))} title="Remove" className="text-muted-foreground hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2">
                    <label className="text-xs font-medium">Name
                      <input
                        value={variantDraft.name}
                        onChange={(e) => setVariantDraft({ ...variantDraft, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStagedVariant() } }}
                        placeholder="Large"
                        className="input mt-1"
                      />
                    </label>
                    <label className="text-xs font-medium">Price
                      <input
                        type="number" min="0" step="0.01"
                        value={variantDraft.price}
                        onChange={(e) => setVariantDraft({ ...variantDraft, price: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStagedVariant() } }}
                        className="input mt-1"
                      />
                    </label>
                    <label className="text-xs font-medium">SKU
                      <input value={variantDraft.sku} onChange={(e) => setVariantDraft({ ...variantDraft, sku: e.target.value })} placeholder="opt." className="input mt-1" />
                    </label>
                    <button type="button" onClick={addStagedVariant} disabled={!variantDraft.name.trim() || variantDraft.price === ''} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">Add</button>
                  </div>
                  <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
                    <label className="text-xs font-medium">Stock (optional) — e.g. a 25ml Tot vs. a 750ml Bottle
                      <span className="mt-1 block">
                        <SearchableSelect
                          options={stockProductOptions}
                          value={variantDraft.stockProductId}
                          onChange={(value) => setVariantDraft({ ...variantDraft, stockProductId: value })}
                          placeholder="No product — doesn't deduct"
                          searchPlaceholder="Search products…"
                          emptyText="No products match."
                        />
                      </span>
                    </label>
                    <label className="text-xs font-medium">Consumes
                      <input type="number" min="0" step="0.001" placeholder="e.g. 25" value={variantDraft.stockQtyPerUnit} onChange={(e) => setVariantDraft({ ...variantDraft, stockQtyPerUnit: e.target.value })} className="input mt-1" />
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menu flags</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['isActive', 'On the menu', 'Uncheck to hide it entirely'],
                  ['isAvailable', 'Available now', 'Uncheck when temporarily sold out'],
                  ['isVegetarian', 'Vegetarian', ''],
                  ['allowsAddons', 'Offers add-ons', 'POS asks for add-ons; off = adds straight to the order'],
                ] as const).map(([key, label, hint]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-sm border bg-muted/40 p-3">
                    <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving || !form.name.trim() || !form.menuCategoryId || form.price === ''} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm && showCategoryModal && (
        <NewMenuCategoryModal
          onClose={() => setShowCategoryModal(false)}
          onCreated={(category) => {
            setCategories((prev) => (prev.some((c) => c.id === category.id) ? prev : [...prev, category]))
            setForm((f) => ({ ...f, menuCategoryId: category.id }))
            setShowCategoryModal(false)
          }}
        />
      )}

      {variantsFor && (
        <VariantsModal
          item={variantsFor}
          stockProductOptions={stockProductOptions}
          onClose={() => setVariantsFor(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

/** Minimal category create — just the one required field (name). Saves via the
 * same POST /menu-categories the Menu Categories page uses, then hands the new
 * record back so the form can select it. */
function NewMenuCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: (category: Category) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const { category } = await api<{ category: Category }>('/menu-categories', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      toast.success('Category created.')
      onCreated(category)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="-mx-6 -mt-6 flex items-start justify-between border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">New category</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Add a menu category</h2>
          </div>
          <button type="button" onClick={onClose} title="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-4" /></button>
        </div>

        <label className="mt-5 block text-sm font-medium">
          Name <span className="text-destructive">*</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot Drinks" className="input mt-1.5" />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />}
            Create category
          </button>
        </div>
      </form>
    </div>
  )
}

type VariantsModalProps = {
  item: MenuItem
  stockProductOptions: { value: string; label: string; hint?: string }[]
  onClose: () => void
  onChanged: () => Promise<void>
}

function VariantsModal({ item, stockProductOptions, onClose, onChanged }: VariantsModalProps) {
  const toast = useToast()
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ name: '', price: '', sku: '', stockProductId: '', stockQtyPerUnit: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', price: '', sku: '', stockProductId: '', stockQtyPerUnit: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<{ variants: Variant[] }>(`/menu-items/${item.id}/variants`)
      setVariants(r.variants)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load variants')
    } finally {
      setLoading(false)
    }
  }, [item.id, toast])
  useEffect(() => { void load() }, [load])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim() || draft.price === '') return
    setBusy(true)
    try {
      await api(`/menu-items/${item.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          price: Number(draft.price),
          sku: draft.sku.trim() || undefined,
          stockProductId: draft.stockProductId || undefined,
          stockQtyPerUnit: draft.stockQtyPerUnit !== '' ? Number(draft.stockQtyPerUnit) : undefined,
        }),
      })
      setDraft({ name: '', price: '', sku: '', stockProductId: '', stockQtyPerUnit: '' })
      await load()
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add variant')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(id: string) {
    if (!editDraft.name.trim() || editDraft.price === '') return
    setBusy(true)
    try {
      await api(`/menu-items/${item.id}/variants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editDraft.name.trim(),
          price: Number(editDraft.price),
          sku: editDraft.sku.trim() || undefined,
          stockProductId: editDraft.stockProductId || null,
          stockQtyPerUnit: editDraft.stockQtyPerUnit !== '' ? Number(editDraft.stockQtyPerUnit) : null,
        }),
      })
      setEditingId(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update variant')
    } finally {
      setBusy(false)
    }
  }

  async function patchVariant(v: Variant, body: Record<string, unknown>) {
    setBusy(true)
    try {
      await api(`/menu-items/${item.id}/variants/${v.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update variant')
    } finally {
      setBusy(false)
    }
  }

  async function removeVariant(v: Variant) {
    if (!window.confirm(`Delete the "${v.name}" variant?`)) return
    setBusy(true)
    try {
      await api(`/menu-items/${item.id}/variants/${v.id}`, { method: 'DELETE' })
      await load()
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete variant')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= variants.length) return
    const next = [...variants]
    ;[next[index], next[target]] = [next[target], next[index]]
    setVariants(next)
    setBusy(true)
    try {
      await api(`/menu-items/${item.id}/variants/reorder`, { method: 'POST', body: JSON.stringify({ orderedIds: next.map((v) => v.id) }) })
    } catch {
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="-mx-6 -mt-6 flex items-start justify-between border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Variants</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{item.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sizes / options with their own price — like Small / Medium / Large. <span className="font-medium text-foreground">Not add-ons.</span></p>
          </div>
          <button onClick={onClose} title="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-4" /></button>
        </div>

        <form onSubmit={add} className="mt-5 space-y-2">
          <div className="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2">
            <label className="text-xs font-medium">Name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Large" className="input mt-1" /></label>
            <label className="text-xs font-medium">Price<input required type="number" min="0" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="input mt-1" /></label>
            <label className="text-xs font-medium">SKU<input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="opt." className="input mt-1" /></label>
            <button disabled={busy || !draft.name.trim() || draft.price === ''} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">Add</button>
          </div>
          <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
            <label className="text-xs font-medium">
              Stock (optional) — e.g. a 25ml Tot vs. a 750ml Bottle
              <span className="mt-1 block">
                <SearchableSelect
                  options={stockProductOptions}
                  value={draft.stockProductId}
                  onChange={(value) => setDraft({ ...draft, stockProductId: value })}
                  placeholder="No product — doesn't deduct"
                  searchPlaceholder="Search products…"
                  emptyText="No products match."
                />
              </span>
            </label>
            <label className="text-xs font-medium">Consumes
              <input type="number" min="0" step="0.001" placeholder="e.g. 25" value={draft.stockQtyPerUnit} onChange={(e) => setDraft({ ...draft, stockQtyPerUnit: e.target.value })} className="input mt-1" />
            </label>
          </div>
        </form>

        <div className="mt-5 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
          ) : variants.length === 0 ? (
            <p className="rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">No variants — the base price of <span className="font-semibold text-foreground">{money(item.price)}</span> is used.</p>
          ) : variants.map((v, index) => (
            <div key={v.id} className={cn('rounded-sm border p-3', !v.isActive && 'opacity-60')}>
              {editingId === v.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2">
                    <label className="text-xs font-medium">Name<input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="input mt-1" /></label>
                    <label className="text-xs font-medium">Price<input type="number" min="0" step="0.01" value={editDraft.price} onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })} className="input mt-1" /></label>
                    <label className="text-xs font-medium">SKU<input value={editDraft.sku} onChange={(e) => setEditDraft({ ...editDraft, sku: e.target.value })} className="input mt-1" /></label>
                    <div className="flex gap-1">
                      <button onClick={() => void saveEdit(v.id)} disabled={busy} className="rounded-sm bg-primary px-2.5 py-2 text-xs font-semibold text-primary-foreground">Save</button>
                      <button onClick={() => setEditingId(null)} className="rounded-sm border px-2.5 py-2 text-xs font-semibold hover:bg-muted">Cancel</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
                    <label className="text-xs font-medium">Stock (optional)
                      <span className="mt-1 block">
                        <SearchableSelect
                          options={stockProductOptions}
                          value={editDraft.stockProductId}
                          onChange={(value) => setEditDraft({ ...editDraft, stockProductId: value })}
                          placeholder="No product — doesn't deduct"
                          searchPlaceholder="Search products…"
                          emptyText="No products match."
                        />
                      </span>
                    </label>
                    <label className="text-xs font-medium">Consumes
                      <input type="number" min="0" step="0.001" value={editDraft.stockQtyPerUnit} onChange={(e) => setEditDraft({ ...editDraft, stockQtyPerUnit: e.target.value })} className="input mt-1" />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => void move(index, -1)} disabled={busy || index === 0} className="rounded-sm text-muted-foreground hover:bg-muted disabled:opacity-20"><LuChevronUp className="size-3.5" /></button>
                    <button onClick={() => void move(index, 1)} disabled={busy || index === variants.length - 1} className="rounded-sm text-muted-foreground hover:bg-muted disabled:opacity-20"><LuChevronDown className="size-3.5" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{v.name}</p>
                    {v.sku && <p className="text-xs text-muted-foreground">SKU {v.sku}</p>}
                    {v.stockProductId && v.stockProduct && (
                      <p className="truncate text-xs text-secondary">
                        → {v.stockQtyPerUnit != null ? Number(v.stockQtyPerUnit).toLocaleString() : 1} {v.stockProduct.packUnit?.name ?? v.stockProduct.unit} of {v.stockProduct.name}
                      </p>
                    )}
                  </div>
                  <span className="tabular-nums text-sm font-medium">{money(v.price)}</span>
                  <button onClick={() => void patchVariant(v, { isActive: !v.isActive })} disabled={busy} title={v.isActive ? 'Deactivate' : 'Activate'} className={cn('rounded-md p-1.5 hover:bg-muted', v.isActive ? 'text-muted-foreground' : 'text-success')}><LuPower className="size-3.5" /></button>
                  <button
                    onClick={() => {
                      setEditingId(v.id)
                      setEditDraft({
                        name: v.name,
                        price: String(Number(v.price)),
                        sku: v.sku ?? '',
                        stockProductId: v.stockProductId ?? '',
                        stockQtyPerUnit: v.stockQtyPerUnit != null ? String(Number(v.stockQtyPerUnit)) : '',
                      })
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"
                  ><LuPencil className="size-3.5" /></button>
                  <button onClick={() => void removeVariant(v)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end border-t pt-4">
          <button onClick={onClose} className="rounded-sm border px-4 py-2 text-sm font-semibold hover:bg-muted">Done</button>
        </div>
      </div>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5">
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
