import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuBuilding2, LuCheck, LuChevronDown, LuCircleAlert, LuCircleCheck, LuConciergeBell, LuLoaderCircle, LuMapPin, LuMinus,
  LuPlus, LuSearch, LuTrash2, LuUserRound,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import { useAppSelector } from '@/store/hooks'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { cn } from '@/lib/utils'
import RetailCheckoutModal, { type CreatedOrder, type PaymentMethod } from '@/components/pos/RetailCheckoutModal'
import { resolveTax, taxLabel, type TaxMode, type TaxTreatment } from '@/lib/tax'

type ApiService = {
  id: string
  name: string
  price: string | number
  unit: { name: string }
  category: { id: string; name: string }
}
type RestaurantLocation = { id: string; name: string; type: string | null; isActive: boolean }
type BusinessProfile = { businessName: string; taxRate: string | null; taxMode: TaxMode; taxTreatment: TaxTreatment }
type PosService = Omit<ApiService, 'price'> & { price: number }
type CartItem = PosService & { quantity: number }

const formatKes = (price: number) => `KSh ${price.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

function computeFinancials(cart: CartItem[], discountInput: string, profile: BusinessProfile | null) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discount = Math.min(Number(discountInput) || 0, subtotal)
  const taxable = subtotal - discount
  const tax = resolveTax({}, profile)
  let taxAmount = 0
  let total = taxable
  if (tax.treatment === 'STANDARD' && tax.rate > 0) {
    if (tax.mode === 'EXCLUSIVE') { taxAmount = taxable * (tax.rate / 100); total = taxable + taxAmount }
    else { taxAmount = taxable - taxable / (1 + tax.rate / 100); total = taxable }
  }
  return { subtotal, discount, taxable, tax, taxAmount, total }
}

export default function ServicesPointOfSale() {
  const user = useAppSelector((s) => s.auth.user)
  const [services, setServices] = useState<PosService[]>([])
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

  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId, needsChoice: needsLocationChoice } = useWorkingLocation(locations)

  async function loadServices() {
    const query = effectiveLocationId ? `?locationId=${effectiveLocationId}` : ''
    const response = await api<{ items: ApiService[] }>(`/pos/service-items${query}`)
    setServices(response.items.map((item) => ({ ...item, price: Number(item.price) })))
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
      await loadServices()
      setLocations(locationResponse.locations)
      setProfile(profileResponse.profile)
      // Room Charge is a system method the backend resolves by code when
      // settling to a folio — it isn't a real "how did they pay" choice.
      setMethods(methodResponse.methods.filter((m) => m.code !== 'ROOM_CHARGE'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the services till')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])
  useEffect(() => { if (!loading) void loadServices() }, [effectiveLocationId])
  useEffect(() => {
    if (!categoryOpen) return
    const onClick = (e: MouseEvent) => { if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [categoryOpen])

  const categories = useMemo(() => ['All items', ...Array.from(new Set(services.map((s) => s.category.name)))], [services])
  const filteredCategories = categories.filter((c) => c.toLowerCase().includes(categoryQuery.trim().toLowerCase()))
  const visibleItems = services.filter((s) => (activeCategory === 'All items' || s.category.name === activeCategory) && (!search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())))
  const financials = useMemo(() => computeFinancials(cart, discount, profile), [cart, discount, profile])
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  function addItem(item: PosService) {
    setConfirmation(null)
    setCart((current) => {
      const match = current.find((c) => c.id === item.id)
      return match ? current.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c) : [...current, { ...item, quantity: 1 }]
    })
  }

  function changeQuantity(id: string, change: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== id) return [item]
      const quantity = item.quantity + change
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  function resetSale() {
    setCart([])
    setDiscount('0')
  }

  return (
    <div className="mx-auto grid min-h-full max-w-7xl gap-0 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24px_360px] lg:px-10">
      <section>
        <div className="relative">
          <div className="pointer-events-none absolute -left-2.5 -top-2.5 size-12 rotate-12 rounded-sm bg-accent shadow-lg" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-sm bg-secondary px-5 py-3.5 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Checkout</p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-white">Services POS</h1>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-white/80">
              <span className="flex items-center gap-1.5"><LuBuilding2 className="size-3.5" /> {profile?.businessName ?? '—'}</span>
              <span className="flex items-center gap-1.5"><LuUserRound className="size-3.5" /> {user ? `${user.firstName} ${user.lastName}` : '—'}</span>
              {fixedLocation ? (
                <span className="flex items-center gap-1.5"><LuMapPin className="size-3.5" /> {fixedLocation.name}</span>
              ) : pickableLocations.length > 0 ? (
                <label className="flex items-center gap-1.5">
                  <LuMapPin className="size-3.5" />
                  <select value={selectedLocationId} onChange={(e) => setLocation(e.target.value)} className="rounded-sm border border-white/30 bg-white/10 px-1.5 py-1 text-xs font-medium text-white outline-none [&>option]:text-foreground">
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services…" className="w-full rounded-sm border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
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
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading services…</div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground">No services available at this location.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <button key={item.id} onClick={() => addItem(item)} className="group relative overflow-hidden rounded-sm border border-border bg-card p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl">
                  <div className="flex items-start justify-between">
                    <span className="flex size-11 items-center justify-center rounded-sm bg-accent/10 text-accent"><LuConciergeBell className="size-5" /></span>
                    <span className="rounded-sm bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.category.name}</span>
                  </div>
                  <h2 className="mt-5 text-base font-semibold text-foreground">{item.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Per {item.unit.name}</p>
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <span className="text-lg font-bold text-foreground">{formatKes(item.price)}</span>
                    <span className="flex size-8 items-center justify-center rounded-sm bg-accent text-lg text-accent-foreground shadow-md transition group-hover:scale-110"><LuPlus /></span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="relative hidden lg:block" aria-hidden="true">
        <span className="absolute left-1/2 -top-1.5 block size-3 -translate-x-1/2 rounded-full bg-secondary" />
        <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-secondary/30" />
        <span className="absolute bottom-0 left-1/2 block size-3 -translate-x-1/2 -translate-y-1.5 rounded-full bg-secondary" />
      </div>

      <aside className="mt-8 flex h-fit flex-col gap-3 lg:mt-0">
        <div className="flex flex-col rounded-sm border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b p-4">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-dashed border-accent px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
              <span className="size-1.5 rounded-full bg-accent" /> New Sale
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <LuConciergeBell className="size-7 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Your sale is empty</p>
                <p className="mt-1 text-xs text-muted-foreground">Choose a service to begin.</p>
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
                        <button onClick={() => changeQuantity(item.id, 1)} className="rounded-sm border bg-card p-1"><LuPlus className="size-3" /></button>
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
            <div className="flex justify-between text-muted-foreground"><span>{taxLabel(financials.tax)}</span><span>{formatKes(financials.taxAmount)}</span></div>
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
          channel="SERVICES"
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
