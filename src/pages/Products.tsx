import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuArrowLeftRight,
  LuBoxes,
  LuCircleAlert,
  LuCircleCheck,
  LuLoaderCircle,
  LuPackage,
  LuPackagePlus,
  LuPencil,
  LuPlus,
  LuRuler,
  LuSearch,
  LuTriangleAlert,
  LuTrash2,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import UnitsOfMeasureModal from '@/components/UnitsOfMeasureModal'
import PackQtyInput, { packAndUnit } from '@/components/ui/PackQtyInput'

type Category = { id: string; name: string; level: number; parentId: string | null }
type Location = { id: string; name: string; type?: string }
type StockByLocation = { locationId: string; locationName: string; quantity: string }
type Product = {
  id: string
  categoryId: string | null
  category: { id: string; name: string; level: number } | null
  name: string
  sku: string | null
  barcode: string | null
  brand: string | null
  description: string | null
  unit: string
  isPerishable: boolean
  shelfLifeDays: number | null
  packSize: string | null
  packLabel: string | null
  packUnitId: string | null
  packUnit: { id: string; name: string } | null
  stockByLocation: StockByLocation[]
  totalQuantity: string
  reorderLevel: string
  maxStockLevel: string | null
  unitCost: string | null
  sellsDirectly: boolean
  sellingPrice: string | null
  preferredSupplier: string | null
  isActive: boolean
  createdAt: string
}
type Summary = { total: number; active: number; inactive: number; lowStock: number }
type MovementType =
  | 'OPENING_STOCK' | 'PURCHASE' | 'SALE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RETURN'
  | 'DAMAGE_LOSS' | 'ADJUSTMENT' | 'BORROWED_IN' | 'RETURNED_BORROWED_STOCK' | 'LENT_OUT' | 'LOAN_RETURNED'
const MOVEMENT_LABELS: Record<MovementType, string> = {
  OPENING_STOCK: 'Opening stock', PURCHASE: 'Purchase', SALE: 'Sale', TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out', RETURN: 'Return', DAMAGE_LOSS: 'Damage / loss', ADJUSTMENT: 'Adjustment',
  BORROWED_IN: 'Borrowed in', RETURNED_BORROWED_STOCK: 'Returned borrowed', LENT_OUT: 'Lent out', LOAN_RETURNED: 'Loan returned',
}
type Movement = { id: string; type: MovementType; location: { id: string; name: string }; quantity: string; note: string | null; occurredAt: string }

// Matches the backend's MANUAL_MOVEMENT_TYPES (products.routes.ts) — the
// only types the "Adjust stock" action is allowed to record. Everything
// except ADJUSTMENT only ever adds to stock; the quantity input's sign
// convention is enforced both here (min="0") and again server-side.
type ManualMovementType = 'PURCHASE' | 'RETURN' | 'DAMAGE_LOSS' | 'ADJUSTMENT' | 'OPENING_STOCK'
const MANUAL_MOVEMENT_TYPES: ManualMovementType[] = ['PURCHASE', 'RETURN', 'DAMAGE_LOSS', 'ADJUSTMENT', 'OPENING_STOCK']
const MANUAL_MOVEMENT_HINTS: Record<ManualMovementType, string> = {
  PURCHASE: 'Stock bought in outside the normal Purchases/Goods-Receipt flow — adds to stock.',
  RETURN: 'Stock physically handed back in (e.g. a customer return) — adds to stock.',
  DAMAGE_LOSS: 'Enter how much was lost — this always reduces stock, regardless of sign.',
  ADJUSTMENT: 'A plain count correction. Enter a positive number to add, negative to remove.',
  OPENING_STOCK: "A baseline this product didn't get when it was created — adds to stock.",
}

type ProductForm = {
  categoryId: string
  name: string
  sku: string
  barcode: string
  brand: string
  description: string
  unit: string
  isPerishable: boolean
  shelfLifeDays: string
  packLabel: string
  packSize: string
  packUnitId: string
  openingStock: string
  locationId: string
  reorderLevel: string
  maxStockLevel: string
  unitCost: string
  sellsDirectly: boolean
  sellingPrice: string
  preferredSupplier: string
  isActive: boolean
}
const emptyForm: ProductForm = {
  categoryId: '', name: '', sku: '', barcode: '', brand: '', description: '',
  unit: '', isPerishable: false, shelfLifeDays: '',
  packLabel: '', packSize: '', packUnitId: '',
  openingStock: '0', locationId: '', reorderLevel: '0', maxStockLevel: '', unitCost: '', sellsDirectly: false, sellingPrice: '', preferredSupplier: '',
  isActive: true,
}
const emptyTransfer = { productId: '', productName: '', fromLocationId: '', toLocationId: '', quantity: '', stockByLocation: [] as StockByLocation[], packSize: 0, packLabel: '', unitName: '' }
const emptyAdjust = {
  productId: '', productName: '', type: 'PURCHASE' as ManualMovementType,
  locationId: '', quantity: '', unitCost: '', note: '', stockByLocation: [] as StockByLocation[],
  packSize: 0, packLabel: '', unitName: '',
}

function SetupMessage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">Workspace not resolved yet.</p>
    </div>
  )
}

export default function Products() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, inactive: 0, lowStock: 0 })
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [movements, setMovements] = useState<Movement[] | null>(null)
  const [transfer, setTransfer] = useState(emptyTransfer)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [adjust, setAdjust] = useState(emptyAdjust)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [adjustError, setAdjustError] = useState('')
  const [showUnits, setShowUnits] = useState(false)
  const [units, setUnits] = useState<{ id: string; name: string }[]>([])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (lowStockOnly) query.set('lowStock', 'true')
      const response = await api<{ products: Product[]; summary: Summary }>(`/products${query.size ? `?${query}` : ''}`)
      setProducts(response.products)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load products'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, lowStockOnly, toast])

  useEffect(() => { const timer = window.setTimeout(() => void loadProducts(), 250); return () => window.clearTimeout(timer) }, [loadProducts])

  useEffect(() => {
    api<{ categories: Category[] }>('/categories?scope=STORE')
      .then((r) => setCategories(r.categories))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load categories'))
    api<{ locations: Location[] }>('/locations')
      .then((r) => setLocations(r.locations))
      .catch(() => {})
    api<{ units: { id: string; name: string }[] }>('/units-of-measure')
      .then((r) => setUnits(r.units))
      .catch(() => {})
  }, [toast, showUnits])

  const categoryLabel = useMemo(() => (c: Category) => '— '.repeat(c.level - 1) + c.name, [])
  const packSizeNum = Number(form.packSize) || 0

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setMovements(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    setForm({
      categoryId: product.categoryId ?? '',
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      brand: product.brand ?? '',
      description: product.description ?? '',
      unit: product.unit,
      isPerishable: product.isPerishable,
      shelfLifeDays: product.shelfLifeDays?.toString() ?? '',
      packLabel: product.packLabel ?? '',
      packSize: product.packSize ?? '',
      packUnitId: product.packUnitId ?? '',
      openingStock: '0',
      locationId: '',
      reorderLevel: product.reorderLevel,
      maxStockLevel: product.maxStockLevel ?? '',
      unitCost: product.unitCost ?? '',
      sellsDirectly: product.sellsDirectly,
      sellingPrice: product.sellingPrice ?? '',
      preferredSupplier: product.preferredSupplier ?? '',
      isActive: product.isActive,
    })
    setMovements(null)
    setError('')
    setShowForm(true)
    api<{ movements: Movement[] }>(`/products/${product.id}/movements`).then((r) => setMovements(r.movements)).catch(() => setMovements([]))
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = { ...form, ...(editing ? { openingStock: undefined, locationId: undefined } : {}) }
      await api(editing ? `/products/${editing.id}` : '/products', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setNotice(editing ? 'Product updated.' : 'Product added.')
      toast.success(editing ? 'Product updated.' : 'Product added.')
      setShowForm(false)
      await loadProducts()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save product'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Permanently delete ${product.name}?`)) return
    setError('')
    setNotice('')
    try {
      await api(`/products/${product.id}`, { method: 'DELETE' })
      setNotice('Product deleted.')
      toast.success('Product deleted.')
      await loadProducts()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete product'
      setError(message)
      toast.error(message)
    }
  }

  function openTransfer(product: Product) {
    setTransfer({
      productId: product.id,
      productName: product.name,
      fromLocationId: product.stockByLocation[0]?.locationId ?? '',
      toLocationId: '',
      quantity: '',
      stockByLocation: product.stockByLocation,
      packSize: Number(product.packSize) || 0,
      packLabel: product.packLabel ?? '',
      unitName: product.packUnit?.name ?? product.unit,
    })
    setTransferError('')
    setShowTransfer(true)
  }

  async function saveTransfer(event: FormEvent) {
    event.preventDefault()
    setTransferring(true)
    setTransferError('')
    try {
      await api(`/products/${transfer.productId}/transfer`, { method: 'POST', body: JSON.stringify({ fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, quantity: transfer.quantity }) })
      toast.success('Stock transferred.')
      setShowTransfer(false)
      await loadProducts()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not transfer stock'
      setTransferError(message)
      toast.error(message)
    } finally {
      setTransferring(false)
    }
  }

  function openAdjust(product: Product) {
    setAdjust({
      productId: product.id,
      productName: product.name,
      type: 'PURCHASE',
      locationId: product.stockByLocation[0]?.locationId ?? (locations.length === 1 ? locations[0].id : ''),
      quantity: '',
      unitCost: product.unitCost ?? '',
      note: '',
      stockByLocation: product.stockByLocation,
      packSize: Number(product.packSize) || 0,
      packLabel: product.packLabel ?? '',
      unitName: product.packUnit?.name ?? product.unit,
    })
    setAdjustError('')
    setShowAdjust(true)
  }

  async function saveAdjust(event: FormEvent) {
    event.preventDefault()
    setAdjusting(true)
    setAdjustError('')
    try {
      await api(`/products/${adjust.productId}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          type: adjust.type,
          locationId: adjust.locationId,
          quantity: Number(adjust.quantity),
          unitCost: adjust.unitCost ? Number(adjust.unitCost) : undefined,
          note: adjust.note.trim() || undefined,
        }),
      })
      toast.success('Stock updated.')
      setShowAdjust(false)
      await loadProducts()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not update stock'
      setAdjustError(message)
      toast.error(message)
    } finally {
      setAdjusting(false)
    }
  }

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Products</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Products</h1>
          <p className="mt-2 text-sm text-muted-foreground">Record everything received into the store and track stock on hand.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowUnits(true)}>
            <LuRuler /> Manage UOM
          </Button>
          <Button onClick={openCreate}>
            <LuPlus /> Add product
          </Button>
        </div>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-4">
        {([
          ['Total products', summary.total, <LuPackage key="a" />],
          ['Active', summary.active, <LuBoxes key="b" />],
          ['Inactive', summary.inactive, <LuBoxes key="c" />],
          ['Low stock', summary.lowStock, <LuTriangleAlert key="d" />],
        ] as const).map(([label, value, icon], i) => (
          <StatCard
            key={label}
            index={i}
            tone={label === 'Low stock' && Number(value) > 0 ? 'warn' : undefined}
            label={label}
            value={value}
            icon={icon}
          />
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU, barcode, brand…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="flex items-center gap-2 rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} className="size-4 accent-secondary" />
            Low stock only
          </label>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading products…</div>
        ) : products.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No products match your search.</div>
        ) : (
          <div className="space-y-3 p-4">
            {products.map((product) => {
              const low = Number(product.totalQuantity) <= Number(product.reorderLevel)
              const productPackSize = Number(product.packSize) || 0
              const unitLabel = product.packUnit?.name ?? product.unit
              const fmt = (qty: string | number) => packAndUnit(Number(qty), productPackSize, product.packLabel ?? '', unitLabel)
              const locationRows = product.stockByLocation.length > 0 ? product.stockByLocation : [{ locationId: 'none', locationName: 'No location stock yet', quantity: '0' }]
              return (
                <article key={product.id} className={cn('overflow-hidden rounded-sm border bg-background shadow-sm', low && 'border-warning/60')}>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-sm border bg-muted/50 text-muted-foreground"><LuPackage /></div>
                      <div className="min-w-0">
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{[product.sku, product.category?.name, product.brand].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className={cn('text-lg font-semibold tabular-nums', low ? 'text-warning' : 'text-success')}>{fmt(product.totalQuantity)}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total stock</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {low && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Low</span>}
                        {!product.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>}
                        <button onClick={() => openAdjust(product)} title="Add or remove stock" className="rounded-sm border p-2 text-muted-foreground hover:bg-success/10 hover:text-success"><LuPackagePlus /></button>
                        <button onClick={() => openTransfer(product)} title="Transfer stock" className="rounded-sm border p-2 text-muted-foreground hover:bg-accent/10 hover:text-accent"><LuArrowLeftRight /></button>
                        <button onClick={() => openEdit(product)} title="Edit product" className="rounded-sm border p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil /></button>
                        <button onClick={() => void deleteProduct(product)} title="Delete product" className="rounded-sm border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto border-t">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-primary text-xs uppercase tracking-wide text-primary-foreground">
                        <tr>
                          <th className="px-4 py-2.5">Location</th>
                          <th className="px-4 py-2.5 text-right">On hand</th>
                          <th className="px-4 py-2.5 text-right">Reorder level</th>
                          <th className="px-4 py-2.5 text-right">Unit cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locationRows.map((s) => (
                          <tr key={s.locationId} className="border-t first:border-t-0">
                            <td className="px-4 py-2.5 font-medium">{s.locationName}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{s.locationId === 'none' ? '—' : fmt(s.quantity)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(product.reorderLevel)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{product.unitCost ? `KSh ${Number(product.unitCost).toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )
            })}
            {false && (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Stock by location</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Unit Cost</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const low = Number(product.totalQuantity) <= Number(product.reorderLevel)
                  const productPackSize = Number(product.packSize) || 0
                  const unitLabel = product.packUnit?.name ?? product.unit
                  return (
                    <tr key={product.id} className="border-t transition hover:bg-muted/30">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{[product.sku, product.brand].filter(Boolean).join(' · ') || '—'}</p>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{product.category?.name ?? '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {product.stockByLocation.length === 0 ? '—' : (
                          <div className="flex flex-wrap gap-1">
                            {product.stockByLocation.map((s) => (
                              <span key={s.locationId} className="rounded-full bg-muted px-2 py-0.5 text-xs">{s.locationName}: {packAndUnit(Number(s.quantity), productPackSize, product.packLabel ?? '', unitLabel)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('font-semibold', low ? 'text-warning' : 'text-foreground')}>{packAndUnit(Number(product.totalQuantity), productPackSize, product.packLabel ?? '', unitLabel)}</span>
                        {low && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Low</span>}
                        {!product.isActive && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{product.unitCost ? `KSh ${Number(product.unitCost).toLocaleString()}` : '—'}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openAdjust(product)} title="Add or remove stock" className="rounded-sm p-2 text-muted-foreground hover:bg-success/10 hover:text-success"><LuPackagePlus /></button>
                          <button onClick={() => openTransfer(product)} title="Transfer stock" className="rounded-sm p-2 text-muted-foreground hover:bg-accent/10 hover:text-accent"><LuArrowLeftRight /></button>
                          <button onClick={() => openEdit(product)} title="Edit product" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil /></button>
                          <button onClick={() => void deleteProduct(product)} title="Delete product" className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            )}
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveProduct} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit product' : 'New product'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Record a product'}</h2>
            </div>

            <FieldGroup title="Identity">
              <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Coca-Cola 500ml" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="SKU"><input placeholder="e.g. COKE-500" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="input" /></Field>
              <Field label="Barcode"><input placeholder="e.g. 5449000000996" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="input" /></Field>
              <Field label="Brand"><input placeholder="e.g. Coca-Cola" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input" /></Field>
              <Field label="Category">
                <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
                </select>
              </Field>
              <Field label="Description" className="sm:col-span-2"><input placeholder="e.g. 500ml glass bottle" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Classification">
              <Field label="Unit of Measure" required>
                <select required className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  <option value="" disabled>Select a unit of measure…</option>
                  {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Shelf Life (days)"><input type="number" min="0" placeholder="e.g. 180" value={form.shelfLifeDays} onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                <input type="checkbox" checked={form.isPerishable} onChange={(e) => setForm({ ...form, isPerishable: e.target.checked })} className="size-4 accent-secondary" />
                This product is perishable
              </label>
            </FieldGroup>

            <FieldGroup title="Pack / Container">
              <p className="text-xs text-muted-foreground sm:col-span-2">
                For bar bottles, kegs and cases: say what one pack holds. Stock is then kept in that unit (e.g. ml), and you can enter or view it either as packs or as the raw amount. Leave blank for items you just count.
              </p>
              <Field label="Pack label"><input placeholder="e.g. bottle, can, keg" value={form.packLabel} onChange={(e) => setForm({ ...form, packLabel: e.target.value })} className="input" /></Field>
              <Field label="Contains (per pack)"><input type="number" min="0" step="0.001" placeholder="e.g. 750" value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value })} className="input" /></Field>
              <Field label="Measured in" className="sm:col-span-2">
                <div className="flex gap-2">
                  <select className="input" value={form.packUnitId} onChange={(e) => setForm({ ...form, packUnitId: e.target.value })}>
                    <option value="">Select a unit of measure…</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowUnits(true)} className="shrink-0 rounded-sm border px-3 text-sm font-medium hover:bg-muted">Manage</button>
                </div>
              </Field>
            </FieldGroup>

            <FieldGroup title="Stock">
              {editing ? (
                <>
                  {editing.stockByLocation.map((s) => (
                    <Field key={s.locationId} label={s.locationName}>
                      <input disabled className="input opacity-70" value={packAndUnit(Number(s.quantity), packSizeNum, form.packLabel, editing.packUnit?.name ?? editing.unit)} />
                    </Field>
                  ))}
                  <Field label="Total Stock" className="sm:col-span-2">
                    <input disabled className="input opacity-70 font-semibold" value={packAndUnit(Number(editing.totalQuantity), packSizeNum, form.packLabel, editing.packUnit?.name ?? editing.unit)} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Opening Stock" required>
                    <PackQtyInput
                      required
                      value={form.openingStock}
                      onChange={(v) => setForm({ ...form, openingStock: v })}
                      packSize={packSizeNum}
                      packLabel={form.packLabel}
                      unitName={units.find((u) => u.id === form.packUnitId)?.name ?? form.unit}
                    />
                  </Field>
                  {Number(form.openingStock) > 0 && (
                    <Field label="Received At" required={locations.length !== 1}>
                      <select required={locations.length !== 1} className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                        <option value="">{locations.length === 1 ? `${locations[0].name} (only location)` : 'Select a location'}</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </Field>
                  )}
                </>
              )}
              <Field label="Reorder Level"><input type="number" min="0" step="0.001" placeholder="e.g. 12" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} className="input" /></Field>
              <Field label="Max Stock Level"><input type="number" min="0" step="0.001" placeholder="e.g. 200" value={form.maxStockLevel} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Costing">
              <Field label="Unit Cost (KES)"><input type="number" min="0" step="0.01" placeholder="e.g. 45.50" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} className="input" /></Field>
              <Field label="Preferred Supplier"><input placeholder="e.g. Nairobi Bottlers Ltd" value={form.preferredSupplier} onChange={(e) => setForm({ ...form, preferredSupplier: e.target.value })} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.sellsDirectly}
                  onChange={(e) => setForm({ ...form, sellsDirectly: e.target.checked, sellingPrice: e.target.checked ? form.sellingPrice : '' })}
                  className="size-4 accent-secondary"
                />
                Also sold directly, as a whole unit, via Products POS
              </label>
              {form.sellsDirectly && (
                <Field label="Selling Price (KES)" required className="sm:col-span-2">
                  <input required type="number" min="0" step="0.01" placeholder="e.g. 65.00" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className="input" />
                  <span className="mt-1 block text-xs text-muted-foreground">This is the price for one whole {form.packLabel || form.unit.toLowerCase()} — a pack-tracked product sold as a Tot/Double instead needs a Menu Item variant, not this.</span>
                </Field>
              )}
            </FieldGroup>

            <label className="mt-6 flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
              Active
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
            </label>

            {editing && movements && movements.length > 0 && (
              <div className="mt-6 border-t pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Stock Movements</p>
                <div className="space-y-1.5">
                  {movements.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-sm bg-muted/50 px-3 py-2 text-xs">
                      <span className="font-medium">{MOVEMENT_LABELS[m.type] ?? m.type} · {m.location.name}{m.note ? ` — ${m.note}` : ''}</span>
                      <span className={cn('font-semibold', Number(m.quantity) < 0 ? 'text-destructive' : 'text-success')}>{Number(m.quantity) > 0 ? '+' : ''}{Number(m.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveTransfer} className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">Transfer stock</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{transfer.productName}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {transfer.stockByLocation.length === 0 ? 'No stock recorded yet' : transfer.stockByLocation.map((s) => `${s.locationName}: ${packAndUnit(Number(s.quantity), transfer.packSize, transfer.packLabel, transfer.unitName)}`).join(' · ')}
              </p>
            </div>

            {transferError && (
              <div className="mt-4 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                <LuCircleAlert />
                {transferError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Field label="From" required>
                  <select required className="input" value={transfer.fromLocationId} onChange={(e) => setTransfer({ ...transfer, fromLocationId: e.target.value })}>
                    <option value="" disabled>Select location</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <Field label="To" required>
                  <select required className="input" value={transfer.toLocationId} onChange={(e) => setTransfer({ ...transfer, toLocationId: e.target.value })}>
                    <option value="" disabled>Select location</option>
                    {locations.filter((l) => l.id !== transfer.fromLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Quantity" required>
                <PackQtyInput
                  required
                  autoFocus
                  value={transfer.quantity}
                  onChange={(v) => setTransfer({ ...transfer, quantity: v })}
                  packSize={transfer.packSize}
                  packLabel={transfer.packLabel}
                  unitName={transfer.unitName}
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowTransfer(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={transferring} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {transferring && <LuLoaderCircle className="animate-spin" />}
                Transfer
              </button>
            </div>
          </form>
        </div>
      )}

      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveAdjust} className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">Add or remove stock</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{adjust.productName}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {adjust.stockByLocation.length === 0 ? 'No stock recorded yet' : adjust.stockByLocation.map((s) => `${s.locationName}: ${packAndUnit(Number(s.quantity), adjust.packSize, adjust.packLabel, adjust.unitName)}`).join(' · ')}
              </p>
            </div>

            {adjustError && (
              <div className="mt-4 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                <LuCircleAlert />
                {adjustError}
              </div>
            )}

            <div className="mt-5 space-y-4">
              <Field label="Action" required>
                <select required className="input" value={adjust.type} onChange={(e) => setAdjust({ ...adjust, type: e.target.value as ManualMovementType })}>
                  {MANUAL_MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">{MANUAL_MOVEMENT_HINTS[adjust.type]}</span>
              </Field>
              <Field label="Location" required>
                <select required className="input" value={adjust.locationId} onChange={(e) => setAdjust({ ...adjust, locationId: e.target.value })}>
                  <option value="" disabled>Select location</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity" required>
                  <PackQtyInput
                    required
                    autoFocus
                    allowNegative={adjust.type === 'ADJUSTMENT'}
                    value={adjust.quantity}
                    onChange={(v) => setAdjust({ ...adjust, quantity: v })}
                    packSize={adjust.packSize}
                    packLabel={adjust.packLabel}
                    unitName={adjust.unitName}
                  />
                </Field>
                <Field label="Unit cost (KSh)"><input type="number" min="0" step="0.01" placeholder="Optional" value={adjust.unitCost} onChange={(e) => setAdjust({ ...adjust, unitCost: e.target.value })} className="input" /></Field>
              </div>
              <Field label="Note"><input placeholder="Optional" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} className="input" /></Field>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowAdjust(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={adjusting} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {adjusting && <LuLoaderCircle className="animate-spin" />}
                Record
              </button>
            </div>
          </form>
        </div>
      )}

      <UnitsOfMeasureModal open={showUnits} onClose={() => setShowUnits(false)} />
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5 first:mt-6 first:border-t">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
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
