import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuCircleAlert,
  LuCircleCheck,
  LuLoaderCircle,
  LuPackageCheck,
  LuPencil,
  LuPlus,
  LuPrinter,
  LuSearch,
  LuShoppingBag,
  LuTrash2,
  LuTruck,
  LuWallet,
  LuX,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import StatCard from '@/components/ui/StatCard'
import { cn } from '@/lib/utils'
import type { DocProfile } from '@/components/documents/pdf'
import PackQtyInput, { packAndUnit } from '@/components/ui/PackQtyInput'
import SupplierPickerModal, { type SupplierOption } from '@/components/SupplierPickerModal'

const DocumentViewer = lazy(() => import('@/components/documents/DocumentViewer'))

type Status = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
const STATUS_META: Record<Status, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  ORDERED: { label: 'Ordered', className: 'bg-secondary/10 text-secondary' },
  PARTIALLY_RECEIVED: { label: 'Partially received', className: 'bg-warning/10 text-warning' },
  RECEIVED: { label: 'Received', className: 'bg-success/10 text-success' },
  CANCELLED: { label: 'Cancelled', className: 'bg-destructive/10 text-destructive' },
}
// Manual status changes only — PARTIALLY_RECEIVED/RECEIVED are computed from
// real goods receipts (see the "Receive goods" action), never set by hand.
const NEXT_ACTIONS: Record<Status, { to: Status; label: string }[]> = {
  DRAFT: [{ to: 'ORDERED', label: 'Mark ordered' }, { to: 'CANCELLED', label: 'Cancel' }],
  ORDERED: [{ to: 'CANCELLED', label: 'Cancel' }],
  PARTIALLY_RECEIVED: [{ to: 'CANCELLED', label: 'Cancel remaining' }],
  RECEIVED: [],
  CANCELLED: [],
}

type Supplier = SupplierOption
type Employee = { id: string; firstName: string; lastName: string }
type Location = { id: string; name: string; type: string | null }
type TaxTreatment = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'
type TaxMode = 'INCLUSIVE' | 'EXCLUSIVE'
type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'
const PAYMENT_META: Record<PaymentStatus, { label: string; className: string }> = {
  UNPAID: { label: 'Unpaid', className: 'bg-warning/10 text-warning' },
  PARTIAL: { label: 'Partially paid', className: 'bg-secondary/10 text-secondary' },
  PAID: { label: 'Paid', className: 'bg-success/10 text-success' },
}
type MenuPriceRef = { id: string; name: string; price: string }
type StockProduct = {
  id: string
  name: string
  unit: string
  packSize: string | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
  unitCost?: string | null
  sellingPrice?: string | null
  taxRate?: string | null
  taxMode?: TaxMode | null
  taxTreatment?: TaxTreatment | null
  menuItems?: MenuPriceRef[]
  variantStocks?: { menuItem: MenuPriceRef }[]
  recipeIngredients?: { recipe: { menuItems: MenuPriceRef[] } }[]
}
type Product = StockProduct
type MenuPriceUpdate = { menuItemId: string; sellingPrice: string }
type PurchaseItem = {
  id: string
  productId: string
  quantity: string
  unitCost: string
  sellingPrice: string | null
  discountPerUnit: string
  taxRate: string
  taxMode: TaxMode
  taxTreatment: TaxTreatment
  taxAmount: string
  lineTotal: string
  receivedQuantity: string
  note: string | null
  product: StockProduct
  menuPriceUpdates: { id: string; menuItemId: string; sellingPrice: string; menuItem: MenuPriceRef }[]
}
type GoodsReceiptItem = { id: string; productId: string; quantity: string; unitCost: string; note: string | null; product: StockProduct }
type GoodsReceipt = {
  id: string
  receiptNo: string
  receivedAt: string
  note: string | null
  location: { id: string; name: string }
  createdByEmployee: Employee | null
  items: GoodsReceiptItem[]
}
type Purchase = {
  id: string
  purchaseNo: string
  status: Status
  paymentStatus: PaymentStatus
  orderDate: string
  expectedDate: string | null
  reference: string | null
  notes: string | null
  taxRate: string
  subtotal: string
  taxAmount: string
  total: string
  supplier: { id: string; name: string }
  location: { id: string; name: string } | null
  requisition: { id: string; requisitionNo: string } | null
  items: PurchaseItem[]
  goodsReceipts: GoodsReceipt[]
  payments: SupplierPayment[]
  supplierBalanceEntries: SupplierBalanceEntry[]
  orderedAt: string | null
  receivedAt: string | null
  createdAt: string
  updatedAt: string
  createdByEmployee: Employee | null
  updatedByEmployee: Employee | null
}
type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type SupplierPayment = { id: string; paymentNo: string; amount: string; reference: string | null; note: string | null; paidAt: string; paymentMethod: PaymentMethod | null }
type SupplierBalanceEntry = { id: string; type: 'OPENING_BALANCE' | 'GOODS_RECEIPT' | 'PAYMENT' | 'ADJUSTMENT'; amount: string }
type Summary = { total: number; byStatus: Record<Status, number>; openValue: number }

type LineRow = { productId: string; quantity: string; unitCost: string; sellingPrice: string; discountPerUnit: string; taxRate: string; taxMode: TaxMode; taxTreatment: TaxTreatment; menuPriceUpdates: MenuPriceUpdate[]; note: string }
type PurchaseForm = {
  supplierId: string
  locationId: string
  orderDate: string
  expectedDate: string
  reference: string
  notes: string
  items: LineRow[]
}
const emptyForm: PurchaseForm = { supplierId: '', locationId: '', orderDate: '', expectedDate: '', reference: '', notes: '', items: [] }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const costUnits = (quantity: number, packSize: number) => (packSize > 0 ? quantity / packSize : quantity)
const taxOptions: { label: string; rate: string; mode: TaxMode; treatment: TaxTreatment }[] = [
  { label: 'VAT 16% inclusive', rate: '16', mode: 'INCLUSIVE', treatment: 'STANDARD' },
  { label: 'VAT 16% exclusive', rate: '16', mode: 'EXCLUSIVE', treatment: 'STANDARD' },
  { label: 'Zero-rated', rate: '0', mode: 'INCLUSIVE', treatment: 'ZERO_RATED' },
  { label: 'Exempt', rate: '0', mode: 'INCLUSIVE', treatment: 'EXEMPT' },
]
function productTaxDefaults(product: Product) {
  const fallback = taxOptions[0]
  const treatment = product.taxTreatment ?? fallback.treatment
  const mode = product.taxMode ?? fallback.mode
  return {
    taxTreatment: treatment,
    taxMode: mode,
    taxRate: product.taxRate != null ? String(Number(product.taxRate)) : treatment === 'STANDARD' ? fallback.rate : '0',
  }
}
function menuReferencesForProduct(product: Product | undefined) {
  const refs = new Map<string, MenuPriceRef>()
  product?.menuItems?.forEach((item) => refs.set(item.id, item))
  product?.variantStocks?.forEach((entry) => refs.set(entry.menuItem.id, entry.menuItem))
  product?.recipeIngredients?.forEach((entry) => entry.recipe.menuItems.forEach((item) => refs.set(item.id, item)))
  return [...refs.values()].sort((a, b) => a.name.localeCompare(b.name))
}
const todayInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function Purchases() {
  const toast = useToast()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, byStatus: { DRAFT: 0, ORDERED: 0, PARTIALLY_RECEIVED: 0, RECEIVED: 0, CANCELLED: 0 }, openValue: 0 })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [form, setForm] = useState<PurchaseForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)

  const [detail, setDetail] = useState<Purchase | null>(null)
  const [working, setWorking] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [profile, setProfile] = useState<DocProfile>(null)
  const [printing, setPrinting] = useState<Purchase | null>(null)
  const [receiving, setReceiving] = useState<Purchase | null>(null)
  const [paying, setPaying] = useState<Purchase | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (statusFilter !== 'all') query.set('status', statusFilter)
      const response = await api<{ purchases: Purchase[]; summary: Summary }>(`/purchases${query.size ? `?${query}` : ''}`)
      setPurchases(response.purchases)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load purchases'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, toast])

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t) }, [load])
  useEffect(() => {
    api<{ suppliers: Supplier[] }>('/suppliers?active=true').then((r) => setSuppliers(r.suppliers)).catch(() => {})
    api<{ products: Product[] }>('/products?active=true').then((r) => setProducts(r.products)).catch(() => {})
    api<{ profile: DocProfile }>('/business-profile').then((r) => setProfile(r.profile)).catch(() => {})
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
    api<{ methods: PaymentMethod[] }>('/payment-methods?activeOnly=true').then((r) => setPaymentMethods(r.methods)).catch(() => {})
  }, [])

  const productLabel = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]))
    return (id: string) => map.get(id)
  }, [products])
  const selectedSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === form.supplierId) ?? null, [suppliers, form.supplierId])

  function rememberSupplier(supplier: Supplier) {
    setSuppliers((current) => current.some((s) => s.id === supplier.id) ? current : [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const liveTotals = useMemo(() => {
    const rows = form.items.map((r) => {
      const product = products.find((p) => p.id === r.productId)
      const qty = Number(r.quantity) || 0
      const packSize = Number(product?.packSize) || 0
      const unitCost = Number(r.unitCost) || 0
      const discount = Number(r.discountPerUnit) || 0
      const baseAmount = costUnits(qty, packSize) * Math.max(0, unitCost - discount)
      const rate = Number(r.taxRate) || 0
      const taxAmount = r.taxTreatment === 'STANDARD' && rate > 0
        ? r.taxMode === 'EXCLUSIVE'
          ? baseAmount * (rate / 100)
          : baseAmount - baseAmount / (1 + rate / 100)
        : 0
      const lineTotal = r.taxMode === 'EXCLUSIVE' ? baseAmount + taxAmount : baseAmount
      return { lineTotal, taxAmount }
    })
    const total = rows.reduce((sum, r) => sum + r.lineTotal, 0)
    const taxAmount = rows.reduce((sum, r) => sum + r.taxAmount, 0)
    return { subtotal: total - taxAmount, taxAmount, total }
  }, [form.items, products])

  const productMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return []
    const chosen = new Set(form.items.map((i) => i.productId))
    return products.filter((p) => !chosen.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [productQuery, products, form.items])

  function addProduct(p: Product) {
    const tax = productTaxDefaults(p)
    const menuPriceUpdates = menuReferencesForProduct(p).map((item) => ({ menuItemId: item.id, sellingPrice: String(Number(item.price)) }))
    setForm((f) => (f.items.some((i) => i.productId === p.id) ? f : {
      ...f,
      items: [...f.items, {
        productId: p.id,
        quantity: '',
        unitCost: p.unitCost != null ? String(Number(p.unitCost)) : '',
        sellingPrice: p.sellingPrice != null ? String(Number(p.sellingPrice)) : '',
        discountPerUnit: '0',
        taxRate: tax.taxRate,
        taxMode: tax.taxMode,
        taxTreatment: tax.taxTreatment,
        menuPriceUpdates,
        note: '',
      }],
    }))
    setProductQuery('')
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, orderDate: todayInput(), locationId: locations.find((l) => l.type === 'STORE')?.id ?? '' })
    setProductQuery('')
    setFormError('')
    setShowForm(true)
  }

  function openEdit(purchase: Purchase) {
    setEditing(purchase)
    setProductQuery('')
    setForm({
      supplierId: purchase.supplier.id,
      locationId: purchase.location?.id ?? locations.find((l) => l.type === 'STORE')?.id ?? '',
      orderDate: toDateInput(purchase.orderDate),
      expectedDate: toDateInput(purchase.expectedDate),
      reference: purchase.reference ?? '',
      notes: purchase.notes ?? '',
      items: purchase.items.map((i) => ({
        productId: i.productId,
        quantity: String(Number(i.quantity)),
        unitCost: String(Number(i.unitCost)),
        sellingPrice: i.sellingPrice != null ? String(Number(i.sellingPrice)) : '',
        discountPerUnit: String(Number(i.discountPerUnit)),
        taxRate: String(Number(i.taxRate)),
        taxMode: i.taxMode,
        taxTreatment: i.taxTreatment,
        menuPriceUpdates: i.menuPriceUpdates.map((update) => ({ menuItemId: update.menuItemId, sellingPrice: String(Number(update.sellingPrice)) })),
        note: i.note ?? '',
      })),
    })
    setFormError('')
    setShowForm(true)
  }

  function setRow(index: number, patch: Partial<LineRow>) {
    setForm((f) => ({ ...f, items: f.items.map((r, i) => (i === index ? { ...r, ...patch } : r)) }))
  }
  const removeRow = (index: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))

  async function savePurchase(event: FormEvent, status?: 'DRAFT' | 'ORDERED') {
    event.preventDefault()
    const items = form.items
      .filter((r) => r.productId && Number(r.quantity) > 0)
      .map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost) || 0,
        sellingPrice: r.sellingPrice === '' ? undefined : Number(r.sellingPrice) || 0,
        discountPerUnit: Number(r.discountPerUnit) || 0,
        taxRate: Number(r.taxRate) || 0,
        taxMode: r.taxMode,
        taxTreatment: r.taxTreatment,
        menuPriceUpdates: r.menuPriceUpdates
          .filter((update) => update.menuItemId && update.sellingPrice !== '')
          .map((update) => ({ menuItemId: update.menuItemId, sellingPrice: Number(update.sellingPrice) || 0 })),
        note: r.note.trim() || undefined,
      }))
    if (!form.supplierId) { setFormError('Choose a supplier'); return }
    if (!items.length) { setFormError('Add at least one item with a quantity'); return }
    setSaving(true)
    setFormError('')
    setNotice('')
    try {
      const payload = {
        supplierId: form.supplierId,
        locationId: form.locationId || undefined,
        orderDate: form.orderDate || undefined,
        expectedDate: form.expectedDate || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        ...(editing || !status ? {} : { status }),
        items,
      }
      await api(editing ? `/purchases/${editing.id}` : '/purchases', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setNotice(editing ? 'Purchase updated.' : 'Purchase created.')
      toast.success(editing ? 'Purchase updated.' : 'Purchase created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save purchase'
      setFormError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(purchase: Purchase, to: Status) {
    const verb = to === 'CANCELLED' ? 'Cancel' : 'Mark as ordered'
    if (!window.confirm(`${verb} — ${purchase.purchaseNo}?`)) return
    setWorking(true)
    setNotice('')
    try {
      const { purchase: updated } = await api<{ purchase: Purchase }>(`/purchases/${purchase.id}/status`, { method: 'POST', body: JSON.stringify({ status: to }) })
      setNotice(`${purchase.purchaseNo} is now ${STATUS_META[to].label.toLowerCase()}.`)
      toast.success('Status updated.')
      setDetail((d) => (d && d.id === updated.id ? updated : d))
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not change status')
    } finally {
      setWorking(false)
    }
  }

  async function deletePurchase(purchase: Purchase) {
    if (!window.confirm(`Delete draft ${purchase.purchaseNo}? This cannot be undone.`)) return
    try {
      await api(`/purchases/${purchase.id}`, { method: 'DELETE' })
      setNotice('Draft purchase deleted.')
      toast.success('Draft purchase deleted.')
      setDetail(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete purchase')
    }
  }

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Inventory</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Purchases</h1>
          <p className="mt-2 text-sm text-muted-foreground">Purchase orders raised against a supplier. Receiving goods moves real stock into the location you choose.</p>
        </div>
        <Button onClick={openCreate}>
          <LuPlus /> New purchase
        </Button>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['Total', summary.total, <LuShoppingBag key="i" />],
          ['Draft', summary.byStatus.DRAFT, <LuPencil key="i" />],
          ['Ordered', summary.byStatus.ORDERED, <LuTruck key="i" />],
          ['Open value', formatKes(summary.openValue), <LuWallet key="i" />],
        ] as const).map(([label, value, icon], i) => (
          <StatCard key={label} index={i} label={label} value={value} icon={icon} />
        ))}
      </section>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
      {notice && <div className="mt-5 flex items-center gap-2 rounded-sm border border-success/25 bg-success/10 p-3 text-sm text-success"><LuCircleCheck />{notice}</div>}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO number, supplier or reference…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_META) as Status[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading purchases…</div>
        ) : purchases.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No purchases yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Purchase</th>
                  <th className="px-5 py-3">Supplier</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <button onClick={() => setDetail(p)} className="font-semibold text-secondary hover:underline">{p.purchaseNo}</button>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.orderDate).toLocaleDateString()}
                        {p.requisition && <> · from {p.requisition.requisitionNo}</>}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{p.supplier.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{p.items.length}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">{formatKes(Number(p.total))}</td>
                    <td className="px-5 py-4">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_META[p.status].className)}>{STATUS_META[p.status].label}</span>
                      <span className={cn('ml-1 rounded-full px-2 py-0.5 text-xs font-semibold', PAYMENT_META[p.paymentStatus].className)}>{PAYMENT_META[p.paymentStatus].label}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setPrinting(p)} title="Print / PDF" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPrinter /></button>
                        {(p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED') && (
                          <button onClick={() => setReceiving(p)} className="inline-flex items-center gap-1 rounded-sm border border-secondary/40 px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-secondary/10"><LuPackageCheck className="size-3.5" /> Receive</button>
                        )}
                        {(p.status === 'PARTIALLY_RECEIVED' || p.status === 'RECEIVED') && p.paymentStatus !== 'PAID' && (
                          <button onClick={() => setPaying(p)} className="inline-flex items-center gap-1 rounded-sm border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"><LuWallet className="size-3.5" /> Pay</button>
                        )}
                        {NEXT_ACTIONS[p.status].filter((a) => a.to !== 'CANCELLED').map((a) => (
                          <button key={a.to} onClick={() => void changeStatus(p, a.to)} disabled={working} className="rounded-sm border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">{a.label}</button>
                        ))}
                        {(p.status === 'DRAFT' || (p.status === 'ORDERED' && p.payments.length === 0 && p.items.every((i) => Number(i.receivedQuantity) <= 0))) && (
                          <>
                            <button onClick={() => openEdit(p)} title="Edit" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil /></button>
                            {p.status === 'DRAFT' && <button onClick={() => void deletePurchase(p)} title="Delete" className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>}
                          </>
                        )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={savePurchase} className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit purchase' : 'New purchase'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.purchaseNo : 'Raise a purchase order'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Buying, selling and VAT changes are saved on this order and applied to products only when goods are received.</p>
            </div>

            <FieldGroup title="Order">
              <Field label="Supplier" required>
                <button
                  type="button"
                  onClick={() => setSupplierPickerOpen(true)}
                  className="flex min-h-12 w-full items-center justify-between rounded-sm border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {selectedSupplier ? (
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{selectedSupplier.name}</span>
                      {(selectedSupplier.phone || selectedSupplier.contactPerson) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{selectedSupplier.phone ?? selectedSupplier.contactPerson}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select supplier</span>
                  )}
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-secondary">{selectedSupplier ? 'Change' : 'Select'}</span>
                </button>
              </Field>
              <Field label="Deliver to">
                <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Select location</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === 'STORE' ? ' (warehouse)' : ''}</option>)}
                </select>
              </Field>
              <Field label="Reference"><input placeholder="Supplier invoice / quote no." value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input" /></Field>
              <Field label="Order Date"><input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} className="input" /></Field>
              <Field label="Expected Date"><input type="date" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</p>

              <div className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search products to add…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                {productQuery.trim() && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border bg-card shadow-lg">
                    {productMatches.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No matching products.</p>
                    ) : productMatches.map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{p.packSize ? p.packLabel ?? p.unit : p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.items.length === 0 ? (
                <p className="mt-3 rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">No items yet — search above to add products.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-[1fr_8rem_6.5rem_6.5rem_6.5rem_10rem_6.5rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>Product</span><span>Qty</span><span>Buying</span><span>Selling</span><span>Discount</span><span>Tax</span><span className="text-right">Total</span><span />
                  </div>
                  {form.items.map((row, index) => {
                    const product = productLabel(row.productId)
                    const packSize = Number(product?.packSize) || 0
                    const unitLabel = product?.packUnit?.name ?? product?.unit ?? ''
                    const menuRefs = menuReferencesForProduct(product)
                    const baseAmount = costUnits(Number(row.quantity) || 0, packSize) * Math.max(0, (Number(row.unitCost) || 0) - (Number(row.discountPerUnit) || 0))
                    const rate = Number(row.taxRate) || 0
                    const taxAmount = row.taxTreatment === 'STANDARD' && rate > 0 ? (row.taxMode === 'EXCLUSIVE' ? baseAmount * (rate / 100) : baseAmount - baseAmount / (1 + rate / 100)) : 0
                    const lineTotal = row.taxMode === 'EXCLUSIVE' ? baseAmount + taxAmount : baseAmount
                    return (
                      <div key={row.productId} className="rounded-sm border p-2">
                        <div className="grid grid-cols-[1fr_8rem_6.5rem_6.5rem_6.5rem_10rem_6.5rem_2rem] items-start gap-2">
                        <div className="min-w-0 pt-2">
                          <p className="truncate text-sm font-medium">{product?.name ?? 'Unknown product'}</p>
                          {unitLabel && (
                            <p className="text-xs text-muted-foreground">
                              {packSize > 0 ? `priced per ${product?.packLabel || 'pack'}; stock in ${unitLabel}` : `per ${unitLabel}`}
                            </p>
                          )}
                        </div>
                        <PackQtyInput value={row.quantity} onChange={(v) => setRow(index, { quantity: v })} packSize={packSize} packLabel={product?.packLabel ?? ''} unitName={unitLabel} />
                        <input type="number" min="0" step="0.01" placeholder="Buying" value={row.unitCost} onChange={(e) => setRow(index, { unitCost: e.target.value })} className="input" />
                        <input type="number" min="0" step="0.01" placeholder="Selling" value={row.sellingPrice} onChange={(e) => setRow(index, { sellingPrice: e.target.value })} className="input" />
                        <input type="number" min="0" step="0.01" placeholder="Discount" value={row.discountPerUnit} onChange={(e) => setRow(index, { discountPerUnit: e.target.value })} className="input" />
                        <select
                          value={`${row.taxTreatment}:${row.taxRate}:${row.taxMode}`}
                          onChange={(e) => {
                            const [taxTreatment, taxRate, taxMode] = e.target.value.split(':') as [TaxTreatment, string, TaxMode]
                            setRow(index, { taxTreatment, taxRate, taxMode })
                          }}
                          className="input"
                        >
                          {taxOptions.map((option) => <option key={`${option.treatment}:${option.rate}:${option.mode}`} value={`${option.treatment}:${option.rate}:${option.mode}`}>{option.label}</option>)}
                        </select>
                        <span className="pt-2 text-right text-sm tabular-nums text-muted-foreground">{lineTotal ? formatKes(lineTotal) : '—'}</span>
                        <button type="button" onClick={() => removeRow(index)} title="Remove" className="rounded-sm p-1.5 pt-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuX className="size-4" /></button>
                        </div>
                        {menuRefs.length > 0 && (
                          <div className="mt-2 rounded-sm bg-muted/35 p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menu items using this product</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {menuRefs.map((item) => {
                                const value = row.menuPriceUpdates.find((update) => update.menuItemId === item.id)?.sellingPrice ?? String(Number(item.price))
                                return (
                                  <label key={item.id} className="grid grid-cols-[1fr_6.5rem] items-center gap-2 text-xs">
                                    <span className="truncate text-muted-foreground">{item.name}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={value}
                                      onChange={(e) => {
                                        const updates = row.menuPriceUpdates.some((update) => update.menuItemId === item.id)
                                          ? row.menuPriceUpdates.map((update) => update.menuItemId === item.id ? { ...update, sellingPrice: e.target.value } : update)
                                          : [...row.menuPriceUpdates, { menuItemId: item.id, sellingPrice: e.target.value }]
                                        setRow(index, { menuPriceUpdates: updates })
                                      }}
                                      className="input h-9"
                                    />
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal before tax</span><span className="tabular-nums">{formatKes(liveTotals.subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="tabular-nums">{formatKes(liveTotals.taxAmount)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatKes(liveTotals.total)}</span></div>
              </div>
            </div>

            <FieldGroup title="Notes">
              <Field label="Notes" className="sm:col-span-2"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" /></Field>
            </FieldGroup>

            {formError && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{formError}</div>}

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              {!editing && (
                <button type="button" disabled={saving} onClick={(event) => void savePurchase(event as unknown as FormEvent, 'DRAFT')} className="inline-flex items-center gap-2 rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60">
                  {saving && <LuLoaderCircle className="animate-spin" />}
                  Save draft
                </button>
              )}
              <button disabled={saving} onClick={(event) => !editing && void savePurchase(event as unknown as FormEvent, 'ORDERED')} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Save as ordered'}
              </button>
            </div>
          </form>
        </div>
      )}

      {supplierPickerOpen && (
        <SupplierPickerModal
          suppliers={suppliers}
          title="Choose Local Supplier"
          onClose={() => setSupplierPickerOpen(false)}
          onCreated={rememberSupplier}
          onSelect={(supplier) => {
            rememberSupplier(supplier)
            setForm((current) => ({ ...current, supplierId: supplier.id }))
          }}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-secondary">Purchase</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{detail.purchaseNo}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{detail.supplier.name} · ordered {new Date(detail.orderDate).toLocaleDateString()}{detail.requisition && <> · from requisition {detail.requisition.requisitionNo}</>}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_META[detail.status].className)}>{STATUS_META[detail.status].label}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PAYMENT_META[detail.paymentStatus].className)}>{PAYMENT_META[detail.paymentStatus].label}</span>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-sm border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Received</th><th className="px-4 py-2 text-right">Unit cost</th><th className="px-4 py-2 text-right">Line total</th></tr>
                </thead>
                <tbody>
                  {detail.items.map((i) => {
                    const received = Number(i.receivedQuantity)
                    const ordered = Number(i.quantity)
                    const packSize = Number(i.product.packSize) || 0
                    const unitLabel = i.product.packUnit?.name ?? i.product.unit
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="px-4 py-2">{i.product.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{packAndUnit(ordered, packSize, i.product.packLabel ?? '', unitLabel)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <span className={received >= ordered ? 'text-success' : received > 0 ? 'text-warning' : 'text-muted-foreground'}>{packAndUnit(received, packSize, i.product.packLabel ?? '', unitLabel)}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatKes(Number(i.unitCost))}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatKes(Number(i.lineTotal))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatKes(Number(detail.subtotal))}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="tabular-nums">{formatKes(Number(detail.taxAmount))}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatKes(Number(detail.total))}</span></div>
            </div>

            {detail.notes && <p className="mt-4 rounded-sm bg-muted/50 p-3 text-sm text-muted-foreground">{detail.notes}</p>}

            {detail.goodsReceipts.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receiving history</p>
                <div className="space-y-2">
                  {detail.goodsReceipts.map((r) => (
                    <div key={r.id} className="rounded-sm border bg-muted/30 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{r.receiptNo}</span>
                        <span className="text-xs text-muted-foreground">{r.location.name} · {new Date(r.receivedAt).toLocaleDateString()}{r.createdByEmployee && <> · {r.createdByEmployee.firstName} {r.createdByEmployee.lastName}</>}</span>
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {r.items.map((it) => (
                          <li key={it.id}>{packAndUnit(Number(it.quantity), Number(it.product.packSize) || 0, it.product.packLabel ?? '', it.product.packUnit?.name ?? it.product.unit)} {it.product.name} @ {formatKes(Number(it.unitCost))}</li>
                        ))}
                      </ul>
                      {r.note && <p className="mt-1.5 text-xs italic text-muted-foreground">{r.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.payments.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment history</p>
                <div className="space-y-2">
                  {detail.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between rounded-sm border bg-muted/30 p-3 text-sm">
                      <div>
                        <p className="font-semibold">{payment.paymentNo}</p>
                        <p className="text-xs text-muted-foreground">{payment.paymentMethod?.name ?? 'Payment'}{payment.reference && ` · ${payment.reference}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatKes(Number(payment.amount))}</p>
                        <p className="text-xs text-muted-foreground">{new Date(payment.paidAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              {detail.createdByEmployee && <>Created by {detail.createdByEmployee.firstName} {detail.createdByEmployee.lastName} on {new Date(detail.createdAt).toLocaleDateString()}</>}
              {detail.orderedAt && <> · ordered {new Date(detail.orderedAt).toLocaleDateString()}</>}
              {detail.receivedAt && <> · received {new Date(detail.receivedAt).toLocaleDateString()}</>}
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-5">
              <button onClick={() => setPrinting(detail)} className="mr-auto inline-flex items-center gap-1.5 rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><LuPrinter className="size-4" /> Print</button>
              <button onClick={() => setDetail(null)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Close</button>
              {(detail.status === 'DRAFT' || (detail.status === 'ORDERED' && detail.payments.length === 0 && detail.items.every((i) => Number(i.receivedQuantity) <= 0))) && <button onClick={() => { const d = detail; setDetail(null); openEdit(d) }} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Edit</button>}
              {(detail.status === 'ORDERED' || detail.status === 'PARTIALLY_RECEIVED') && (
                <button onClick={() => setReceiving(detail)} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><LuPackageCheck className="size-4" /> Receive goods</button>
              )}
              {(detail.status === 'PARTIALLY_RECEIVED' || detail.status === 'RECEIVED') && detail.paymentStatus !== 'PAID' && (
                <button onClick={() => setPaying(detail)} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><LuWallet className="size-4" /> Record payment</button>
              )}
              {NEXT_ACTIONS[detail.status].map((a) => (
                <button key={a.to} onClick={() => void changeStatus(detail, a.to)} disabled={working}
                  className={cn('rounded-sm px-4 py-2.5 text-sm font-semibold disabled:opacity-60', a.to === 'CANCELLED' ? 'border text-destructive hover:bg-destructive/10' : 'bg-primary text-primary-foreground')}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {printing && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-800/95 text-white"><LuLoaderCircle className="size-6 animate-spin" /></div>}>
          <DocumentViewer kind="purchase" data={printing} profile={profile} onClose={() => setPrinting(null)} />
        </Suspense>
      )}

      {receiving && (
        <ReceiveGoodsModal
          purchase={receiving}
          locations={locations}
          onClose={() => setReceiving(null)}
          onReceived={(result) => {
            setReceiving(null)
            setDetail((d) => (d && d.id === result.purchase.id ? result.purchase : d))
            toast.success(`${result.receiptNo} received.`)
            void load()
          }}
        />
      )}

      {paying && (
        <PurchasePaymentModal
          purchase={paying}
          paymentMethods={paymentMethods}
          onClose={() => setPaying(null)}
          onPaid={(updated) => {
            setPaying(null)
            setDetail((d) => (d && d.id === updated.id ? updated : d))
            toast.success('Payment recorded.')
            void load()
          }}
        />
      )}
    </div>
  )
}

type ReceiveLine = { purchaseItemId: string; productName: string; unit: string; packSize: number; packLabel: string; remaining: number; quantity: string; unitCost: string }

function ReceiveGoodsModal({ purchase, locations, onClose, onReceived }: {
  purchase: Purchase
  locations: Location[]
  onClose: () => void
  onReceived: (result: { id: string; receiptNo: string; purchase: Purchase }) => void
}) {
  const toast = useToast()
  const [locationId, setLocationId] = useState(purchase.location?.id ?? locations.find((l) => l.type === 'STORE')?.id ?? '')
  const [receivedAt, setReceivedAt] = useState(todayInput())
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<ReceiveLine[]>(() => purchase.items
    .map((i) => ({
      purchaseItemId: i.id,
      productName: i.product.name,
      unit: i.product.packUnit?.name ?? i.product.unit,
      packSize: Number(i.product.packSize) || 0,
      packLabel: i.product.packLabel ?? '',
      remaining: Number(i.quantity) - Number(i.receivedQuantity),
      unitCost: i.unitCost,
    }))
    .filter((l) => l.remaining > 0.0005)
    .map((l) => ({ ...l, quantity: String(l.remaining) })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setLine(purchaseItemId: string, patch: Partial<ReceiveLine>) {
    setLines((cur) => cur.map((l) => (l.purchaseItemId === purchaseItemId ? { ...l, ...patch } : l)))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const items = lines.filter((l) => Number(l.quantity) > 0).map((l) => ({ purchaseItemId: l.purchaseItemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) || 0 }))
    if (!locationId) { setError('Choose a location to receive into'); return }
    if (!items.length) { setError('Enter a quantity for at least one item'); return }
    setSaving(true)
    setError('')
    try {
      const { receipt, purchase: updated } = await api<{ receipt: { id: string; receiptNo: string }; purchase: Purchase }>(`/purchases/${purchase.id}/goods-receipts`, {
        method: 'POST',
        body: JSON.stringify({ locationId, receivedAt: receivedAt || undefined, note: note.trim() || undefined, items }),
      })
      onReceived({ id: receipt.id, receiptNo: receipt.receiptNo, purchase: updated })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not post this goods receipt'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
        <div>
          <p className="text-sm font-semibold text-secondary">Goods receipt</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Receive {purchase.purchaseNo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only enter what actually arrived — the rest stays outstanding and can be received later.</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Deliver into" required>
            <select required className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Select location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === 'STORE' ? ' (warehouse)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Received on"><input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="input" /></Field>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="grid flex-1 grid-cols-[1fr_6rem_6rem] gap-2 text-xs font-medium text-muted-foreground">
              <span>Product</span><span>Qty received</span><span>Unit cost</span>
            </div>
            <button type="button" onClick={() => setLines((cur) => cur.map((line) => ({ ...line, quantity: String(line.remaining) })))} className="text-xs font-semibold uppercase tracking-wide text-secondary hover:underline">Receive all</button>
          </div>
          {lines.length === 0 ? (
            <p className="rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">Nothing left to receive on this order.</p>
          ) : lines.map((l) => (
            <div key={l.purchaseItemId} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.productName}</p>
                <p className="text-xs text-muted-foreground">{packAndUnit(l.remaining, l.packSize, l.packLabel, l.unit)} outstanding</p>
              </div>
              <PackQtyInput value={l.quantity} onChange={(v) => setLine(l.purchaseItemId, { quantity: v })} packSize={l.packSize} packLabel={l.packLabel} unitName={l.unit} max={l.remaining} className="input" />
              <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => setLine(l.purchaseItemId, { unitCost: e.target.value })} className="input" />
            </div>
          ))}
        </div>

        <div className="mt-5">
          <Field label="Note" className="block"><input placeholder="e.g. 1 case arrived damaged, replaced next delivery" value={note} onChange={(e) => setNote(e.target.value)} className="input" /></Field>
        </div>

        {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="mt-6 flex justify-end gap-2 border-t pt-5">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button disabled={saving || lines.length === 0} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Post receipt
          </button>
        </div>
      </form>
    </div>
  )
}

function purchaseOutstanding(purchase: Purchase) {
  const receivedDebt = purchase.supplierBalanceEntries
    .filter((entry) => entry.type === 'GOODS_RECEIPT')
    .reduce((sum, entry) => sum + Number(entry.amount), 0)
  const paid = purchase.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  return Math.max(0, receivedDebt - paid)
}

function PurchasePaymentModal({ purchase, paymentMethods, onClose, onPaid }: {
  purchase: Purchase
  paymentMethods: PaymentMethod[]
  onClose: () => void
  onPaid: (purchase: Purchase) => void
}) {
  const toast = useToast()
  const outstanding = purchaseOutstanding(purchase)
  const [amount, setAmount] = useState(outstanding.toFixed(2))
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? '')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(todayInput())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const method = paymentMethods.find((m) => m.id === paymentMethodId) ?? null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!paymentMethodId) { setError('Choose a payment method'); return }
    if (method?.requiresReference && !reference.trim()) { setError(`${method.name} requires a reference number`); return }
    if (Number(amount) <= 0) { setError('Enter an amount paid'); return }
    if (Number(amount) > outstanding + 0.0005) { setError('Payment cannot be more than the outstanding balance'); return }
    setSaving(true)
    setError('')
    try {
      const { purchase: updated } = await api<{ purchase: Purchase }>(`/purchases/${purchase.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          paymentMethodId,
          reference: reference.trim() || undefined,
          paidAt: paidAt || undefined,
          note: note.trim() || undefined,
        }),
      })
      onPaid(updated)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record payment'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-lg rounded-sm border bg-card p-6 shadow-2xl">
        <div>
          <p className="text-sm font-semibold text-secondary">Supplier payment</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Pay {purchase.purchaseNo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Outstanding received balance: {formatKes(outstanding)}</p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required><input required type="number" min="0" max={outstanding} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" /></Field>
          <Field label="Payment method" required>
            <select required className="input" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
              <option value="">Select method</option>
              {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Reference"><input value={reference} onChange={(e) => setReference(e.target.value)} className="input" /></Field>
          <Field label="Paid on"><input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="input" /></Field>
          <Field label="Note" className="sm:col-span-2"><input value={note} onChange={(e) => setNote(e.target.value)} className="input" /></Field>
        </div>

        {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="mt-6 flex justify-end gap-2 border-t pt-5">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button disabled={saving || outstanding <= 0} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Record payment
          </button>
        </div>
      </form>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5">
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
