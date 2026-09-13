import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuBuilding2, LuCheck, LuChevronDown, LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuMapPin, LuMinus,
  LuPackage, LuPlus, LuSearch, LuTrash2, LuUserRound,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import { useAppSelector } from '@/store/hooks'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { cn } from '@/lib/utils'
import RetailCheckoutModal, { type CreatedOrder, type PaymentMethod } from '@/components/pos/RetailCheckoutModal'
import { packAndUnit } from '@/components/ui/PackQtyInput'

type ApiProduct = {
  id: string
  name: string
  sku: string | null
  sellingPrice: string | number
  unit: string
  availableQuantity: string | number
  packSize: string | number | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
  category: { id: string; name: string } | null
  taxRate: string | number | null
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE' | null
  taxTreatment: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | null
}
type RestaurantLocation = { id: string; name: string; type: string | null; isActive: boolean }
type BusinessProfile = { businessName: string; taxRate: string | null; taxMode: 'INCLUSIVE' | 'EXCLUSIVE'; taxTreatment: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' }
type PosProduct = Omit<ApiProduct, 'sellingPrice' | 'availableQuantity'> & { price: number; availableQuantity: number }
type CartItem = PosProduct & { quantity: number }

const formatKes = (price: number) => `KSh ${price.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

function computeFinancials(cart: CartItem[], discountInput: string, profile: BusinessProfile | null) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discount = Math.min(Number(discountInput) || 0, subtotal)
  const taxable = subtotal - discount
  const discountRatio = subtotal > 0 ? discount / subtotal : 0
  let taxAmount = 0
  let exclusiveTax = 0
  const rates = new Set<number>()
  for (const item of cart) {
    const gross = item.price * item.quantity * (1 - discountRatio)
    const treatment = item.taxTreatment ?? profile?.taxTreatment ?? 'STANDARD'
    const rate = item.taxRate != null ? Number(item.taxRate) : profile?.taxRate ? Number(profile.taxRate) : 0
    const mode = item.taxMode ?? profile?.taxMode ?? 'INCLUSIVE'
    if (treatment !== 'STANDARD' || rate <= 0) continue
    rates.add(rate)
    if (mode === 'EXCLUSIVE') {
      const tax = gross * (rate / 100)
      exclusiveTax += tax
      taxAmount += tax
    } else {
      taxAmount += gross - gross / (1 + rate / 100)
    }
  }
  return { subtotal, discount, taxable, rateLabel: [...rates].sort((a, b) => a - b).join(', '), taxAmount, total: taxable + exclusiveTax }
}

export default function ProductsPointOfSale() {
  const user = useAppSelector((s) => s.auth.user)
  const [products, setProducts] = useState<PosProduct[]>([])
  const [locations, setLocations] = useState<RestaurantLocation[]>([])
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [activeCategory, setActiveCategory] = useState('All items')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const categoryRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [discount, setDiscount] = useState('0')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<CreatedOrder | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  // Brief "added" pulse — the cart sits below the grid on mobile.
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const addedTimer = useRef<number | undefined>(undefined)

  // Pinned to exactly one location → fixed. Pinned to several → pick from
  // just those. Pinned to none → pick from all.
  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId, needsChoice: needsLocationChoice } = useWorkingLocation(locations)

  async function loadProducts() {
    const query = effectiveLocationId ? `?locationId=${effectiveLocationId}` : ''
    const response = await api<{ items: ApiProduct[] }>(`/pos/product-items${query}`)
    setProducts(response.items.map((item) => ({ ...item, price: Number(item.sellingPrice), availableQuantity: Number(item.availableQuantity) })))
  }

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [locationResponse, profileResponse, methodResponse] = await Promise.all([
        api<{ locations: RestaurantLocation[] }>('/locations'),
        api<{ profile: BusinessProfile | null }>('/business-profile'),
        api<{ methods: (PaymentMethod & { code: string })[] }>('/payment-methods?activeOnly=true'),
      ])
      await loadProducts()
      setLocations(locationResponse.locations)
      setProfile(profileResponse.profile)
      // Room Charge is a system method the backend resolves by code when
      // settling to a folio — it isn't a real "how did they pay" choice.
      setMethods(methodResponse.methods.filter((m) => m.code !== 'ROOM_CHARGE'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the products till')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])
  useEffect(() => { if (!loading) void loadProducts() }, [effectiveLocationId])
  useEffect(() => {
    if (!categoryOpen) return
    const onClick = (e: MouseEvent) => { if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [categoryOpen])

  const categories = useMemo(() => ['All items', ...Array.from(new Set(products.map((p) => p.category?.name ?? 'Uncategorized')))], [products])
  const filteredCategories = categories.filter((c) => c.toLowerCase().includes(categoryQuery.trim().toLowerCase()))
  const visibleItems = products.filter((p) => (activeCategory === 'All items' || (p.category?.name ?? 'Uncategorized') === activeCategory) && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())))
  const financials = useMemo(() => computeFinancials(cart, discount, profile), [cart, discount, profile])
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  function addItem(item: PosProduct) {
    setConfirmation(null)
    setCart((current) => {
      const match = current.find((c) => c.id === item.id)
      if (match) {
        if (match.quantity >= item.availableQuantity) return current
        return current.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return item.availableQuantity > 0 ? [...current, { ...item, quantity: 1 }] : current
    })
    setJustAdded(item.id)
    window.clearTimeout(addedTimer.current)
    addedTimer.current = window.setTimeout(() => setJustAdded(null), 850)
  }

  useEffect(() => () => window.clearTimeout(addedTimer.current), [])

  function changeQuantity(id: string, change: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== id) return [item]
      const quantity = Math.min(item.quantity + change, item.availableQuantity)
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  function resetSale() {
    setCart([])
    setDiscount('0')
  }

  return (
    <div className="mx-auto grid min-h-full max-w-7xl grid-cols-1 gap-0 px-6 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_24px_360px] lg:px-10">
      <section className="min-w-0">
        <div className="relative">
          <div className="pointer-events-none absolute -bottom-2 left-3 right-1 top-2 rotate-[0.6deg] rounded-sm border border-black/10 bg-white/70" aria-hidden="true" />
          <div className="pointer-events-none absolute -left-2.5 -top-2.5 size-12 rotate-12 rounded-sm bg-[#f2921a] shadow-lg" aria-hidden="true" />
          <div
            className="relative flex flex-wrap items-center justify-between gap-2.5 overflow-hidden rounded-sm border border-black/10 bg-[#faf7f0] px-4 py-3 text-slate-800 shadow-[0_1px_1px_rgba(2,6,23,0.05),0_3px_5px_rgba(2,6,23,0.06),0_12px_22px_-8px_rgba(2,6,23,0.18)] sm:gap-3 sm:px-5 sm:py-4"
            style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(2,6,23,0.055) 28px)' }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Checkout</p>
              <h1 className="mt-0.5 font-display text-sm font-semibold text-slate-900 sm:mt-1 sm:text-2xl">Products POS</h1>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600 sm:gap-4">
              <span className="hidden items-center gap-1.5 sm:flex"><LuBuilding2 className="size-3.5" /> {profile?.businessName ?? '—'}</span>
              <span className="flex items-center gap-1.5"><LuUserRound className="size-3.5" /> {user ? `${user.firstName} ${user.lastName}` : '—'}</span>
              {fixedLocation ? (
                <span className="flex items-center gap-1.5"><LuMapPin className="size-3.5" /> {fixedLocation.name}</span>
              ) : pickableLocations.length > 0 ? (
                <label className="flex items-center gap-1.5">
                  <LuMapPin className="size-3.5" />
                  <select value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="rounded-sm border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-700 outline-none">
                    <option value="">Select location…</option>
                    {pickableLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
        </div>

        {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
        {confirmation && <div className="mt-5 flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 p-3 text-sm font-medium text-accent"><LuCircleCheck />Sale #{confirmation.orderNumber} completed.</div>}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" className="w-full rounded-sm border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div ref={categoryRef} className="relative sm:w-64">
            <button type="button" onClick={() => { setCategoryOpen((v) => !v); setCategoryQuery('') }} className="flex w-full items-center justify-between gap-2 rounded-sm border bg-card px-3 py-2.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-ring">
              <span className="truncate">{activeCategory}</span>
              <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', categoryOpen && 'rotate-180')} />
            </button>
            {categoryOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-sm border bg-card shadow-lg">
                <div className="border-b p-2">
                  <input autoFocus value={categoryQuery} onChange={(e) => setCategoryQuery(e.target.value)} placeholder="Search categories…" className="w-full rounded-sm border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="scrollbar-thin max-h-56 overflow-y-auto py-1">
                  {filteredCategories.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No categories match.</p>
                  ) : filteredCategories.map((category) => (
                    <button key={category} type="button" onClick={() => { setActiveCategory(category); setCategoryOpen(false) }} className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted', activeCategory === category && 'bg-secondary/10 font-semibold text-secondary')}>
                      {category}
                      {activeCategory === category && <LuCheck className="size-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading products…</div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground">No sellable products set up for this location yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
              {visibleItems.map((item) => {
                const inCart = cart.find((c) => c.id === item.id)?.quantity ?? 0
                const remaining = item.availableQuantity - inCart
                const soldOut = remaining <= 0
                const stockLabel = packAndUnit(Math.max(0, remaining), Number(item.packSize) || 0, item.packLabel ?? '', item.packUnit?.name ?? item.unit)
                return (
                  <button key={item.id} onClick={() => addItem(item)} disabled={soldOut} className={cn('group relative flex flex-col overflow-hidden rounded-sm border bg-card p-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm sm:p-5', justAdded === item.id ? 'border-[#f2921a] ring-2 ring-[#f2921a]/40' : soldOut ? 'border-destructive/20 bg-destructive/5' : 'border-border')}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-accent/10 text-accent sm:size-11"><LuPackage className="size-5" /></span>
                      <span className="max-w-[55%] truncate rounded-sm bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.category?.name ?? 'Uncategorized'}</span>
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-foreground sm:mt-5 sm:text-base">{item.name}</h2>
                    <span className={cn('mt-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', soldOut ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success')}>
                      {soldOut ? 'Out of stock' : `${stockLabel} left`}
                    </span>
                    <div className="mt-3 border-t pt-3 sm:mt-4 sm:pt-4">
                      <span className="text-base font-bold text-foreground sm:text-lg">{formatKes(item.price)}</span>
                      <span className={cn('mt-3 flex w-full items-center justify-center gap-1.5 rounded-sm py-2 text-xs font-bold uppercase tracking-wide shadow-md transition group-hover:brightness-95', justAdded === item.id ? 'bg-[#f2921a] text-white' : 'bg-accent text-accent-foreground')}>
                        {justAdded === item.id ? <><LuCheck className="size-4" /> Added</> : soldOut ? 'Sold out' : <><LuPlus className="size-4" /> Add</>}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <div className="relative hidden lg:block" aria-hidden="true">
        <span className="absolute left-1/2 -top-1.5 block size-3 -translate-x-1/2 rounded-full bg-secondary" />
        <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-secondary/30" />
        <span className="absolute bottom-0 left-1/2 block size-3 -translate-x-1/2 -translate-y-1.5 rounded-full bg-secondary" />
      </div>

      <aside className="mt-8 flex h-fit min-w-0 flex-col gap-3 lg:mt-0">
        <div className="flex flex-col rounded-sm border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b p-4">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-dashed border-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
              <span className="size-1.5 rounded-full bg-accent" /> New Sale
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <LuPackage className="size-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Your sale is empty</p>
                <p className="mt-1 text-xs text-muted-foreground">Choose a product to begin.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="rounded-sm border bg-muted/40 p-3">
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.quantity} × {formatKes(item.price)}</p>
                      </div>
                      <button onClick={() => changeQuantity(item.id, -item.quantity)} className="shrink-0 text-muted-foreground hover:text-destructive"><LuTrash2 className="size-4" /></button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => changeQuantity(item.id, -1)} className="rounded-sm border bg-card p-1"><LuMinus className="size-3" /></button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                        <button onClick={() => changeQuantity(item.id, 1)} disabled={item.quantity >= item.availableQuantity} className="rounded-sm border bg-card p-1 disabled:opacity-40"><LuPlus className="size-3" /></button>
                      </div>
                      <span className="text-sm font-semibold">{formatKes(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t p-4">
            <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Discount (KES)
              <input type="number" min="0" step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 rounded-sm border bg-background px-2 py-1 text-right text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring" />
            </label>
          </div>

          <div className="space-y-1.5 border-t bg-muted/30 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatKes(financials.subtotal)}</span></div>
            {financials.discount > 0 && <div className="flex justify-between text-destructive"><span>Discount</span><span>-{formatKes(financials.discount)}</span></div>}
            {financials.taxAmount > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax{financials.rateLabel ? ` (${financials.rateLabel}%)` : ''}</span><span>{formatKes(financials.taxAmount)}</span></div>}
            <div className="flex justify-between border-t pt-1.5 text-base font-bold text-foreground"><span>Total</span><span>{formatKes(financials.total)}</span></div>
          </div>

          {needsLocationChoice && cart.length > 0 && (
            <p className="border-t bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning">Select which location this sale is for (top right) before checking out.</p>
          )}

          <div className="p-4 pt-0">
            <button disabled={cart.length === 0 || needsLocationChoice} onClick={() => setShowCheckout(true)} className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              Checkout · {formatKes(financials.total)}
            </button>
          </div>
        </div>

        <p className="px-1 text-center text-[11px] text-muted-foreground">{itemCount} item{itemCount === 1 ? '' : 's'} in this sale</p>
      </aside>

      {showCheckout && (
        <RetailCheckoutModal
          items={cart}
          total={financials.total}
          channel="PRODUCTS"
          locationId={effectiveLocationId || undefined}
          discount={financials.discount}
          methods={methods}
          onClose={() => setShowCheckout(false)}
          onComplete={(order) => {
            setShowCheckout(false)
            resetSale()
            setConfirmation(order)
            void loadAll()
          }}
        />
      )}
    </div>
  )
}
