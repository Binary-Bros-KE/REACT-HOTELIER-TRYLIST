import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuBan, LuBedDouble, LuBellRing, LuBuilding2, LuCheck, LuChevronDown, LuCircleAlert, LuCircleCheck, LuClipboardList, LuCoffee, LuGift, LuLoaderCircle, LuMapPin, LuMinus,
  LuPause, LuPencil, LuPlus, LuPrinter, LuReceiptText, LuSearch, LuSlidersHorizontal, LuTrash2, LuUserRound, LuX,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import { cn } from '@/lib/utils'
import CustomerSelectModal, { partyLabel, type SaleParty } from '@/components/pos/CustomerSelectModal'
import OrderSettlementPanel from '@/components/pos/OrderSettlementPanel'
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal'
import { type ReceiptOrder, type ReceiptProfile } from '@/components/pos/OrderReceipt'
import { getThermalSettings, printReceipt } from '@/lib/thermalPrinter'
import { taxLabel, type TaxMode, type TaxTreatment } from '@/lib/tax'

type StockProduct = { id: string; name: string; unit: string; packUnit: { id: string; name: string } | null }
type ApiVariant = {
  id: string
  name: string
  price: string | number
  sku: string | null
  stockQtyPerUnit: string | number | null
  stockProduct: StockProduct | null
  availableQuantity: number | null
  availabilityUnitLabel: string | null
}
type ApiCatalogAddon = {
  id: string
  name: string
  description: string | null
  price: string | number
  imageUrl: string | null
  menuCategoryId: string | null
  menuCategory: { id: string; name: string } | null
}
type ApiMenuItem = {
  id: string
  name: string
  description: string | null
  price: string | number
  temperature: 'HOT' | 'COLD' | 'OTHER'
  category: { id: string; name: string }
  variants: ApiVariant[]
  allowsAddons: boolean
  taxRate: string | number | null
  taxMode: TaxMode | null
  taxTreatment: TaxTreatment | null
  // null = untracked (no product/recipe link) — always orderable, no pill.
  availableQuantity: number | null
  availabilityUnitLabel: string | null
}
type RestaurantTable = { id: string; label: string; area: string | null; status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE' }
type Location = { id: string; name: string; type: string | null; isActive: boolean; serveMode: 'KITCHEN' | 'COUNTER' | 'DIRECT' }
type BusinessProfile = { businessName: string; taxRate: string | null; taxMode: TaxMode }

type LineTax = { rate: number; mode: TaxMode; treatment: TaxTreatment }
type Addon = { id: string; name: string; price: number }
// The flat add-on catalog — each add-on optionally tagged with a menu
// category the POS picker filters on.
type CatalogAddon = Addon & { categoryId: string | null; categoryName: string | null }
type Variant = {
  id: string
  name: string
  price: number
  stockQtyPerUnit: number | null
  stockProduct: StockProduct | null
  availableQuantity: number | null
  availabilityUnitLabel: string | null
}
type MenuItem = {
  id: string
  name: string
  description: string | null
  price: number
  temperature: 'HOT' | 'COLD' | 'OTHER'
  category: { id: string; name: string }
  variants: Variant[]
  allowsAddons: boolean
  tax: LineTax
  availableQuantity: number | null
  availabilityUnitLabel: string | null
}
// One configured line in the sale: an item, the chosen variant (size/option)
// if any, and the flattened set of chosen add-ons. Keyed by a generated id so
// the same item can sit on the cart twice with different options.
type CartLine = { key: string; item: MenuItem; variant: Variant | null; addons: Addon[]; quantity: number }
type CreatedOrder = { id: string; orderNumber: number }
type HeldSale = { key: string; heldNo: number; label: string; tableId: string; discount: string; notes: string; party: SaleParty; cart: CartLine[] }
type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type ComplimentarySession = { id: string; title: string; hostName: string; hostPhone: string | null; eventDate: string; status: 'OPEN' | 'CLOSED'; _count?: { orders: number } }
type ActiveOrder = {
  id: string; orderNumber: number; status: string; total: number
  createdBy: string | null
  customer: { firstName: string; lastName: string | null } | null
  table: { label: string } | null
  items: { id: string; quantity: number; menuItem: { name: string } | null; variant: { name: string } | null }[]
}
type CompletedOrder = ActiveOrder & { paid: number; paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID'; updatedAt: string }
type CancelledOrder = ActiveOrder & {
  statusBeforeCancel: string | null
  cancelReason: string | null
  cancelRequestedAt: string | null
  cancelDecidedAt: string | null
  cancelDecisionNote: string | null
}

const NON_FINAL_STATUSES = ['OPEN', 'PREPARING', 'READY', 'SERVED']
// Same cap used app-wide for "recent sales" style lists (Receipts, Approvals
// history) — see the note on Receipts.tsx's FETCH_LIMIT for the size math.
const FETCH_LIMIT = 100

const formatKes = (price: number) => `KSh ${price.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const toNumber = (value: string | number) => (typeof value === 'number' ? value : Number(value))

function normalizeMenuItem(raw: ApiMenuItem): MenuItem {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    price: toNumber(raw.price),
    temperature: raw.temperature,
    category: raw.category ?? { id: '', name: 'Uncategorised' },
    // Tolerate a shape drift between a deployed API and this bundle — a
    // missing list should degrade, not crash the whole POS.
    variants: (raw.variants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      price: toNumber(v.price),
      stockQtyPerUnit: v.stockQtyPerUnit != null ? toNumber(v.stockQtyPerUnit) : null,
      stockProduct: v.stockProduct ?? null,
      availableQuantity: v.availableQuantity ?? null,
      availabilityUnitLabel: v.availabilityUnitLabel ?? null,
    })),
    allowsAddons: raw.allowsAddons ?? false,
    tax: {
      rate: raw.taxRate != null ? toNumber(raw.taxRate) : 0,
      mode: raw.taxMode ?? 'INCLUSIVE',
      treatment: raw.taxTreatment ?? 'STANDARD',
    },
    availableQuantity: raw.availableQuantity ?? null,
    availabilityUnitLabel: raw.availabilityUnitLabel ?? null,
  }
}

/** Whether tapping the item opens the options step: it has sizes to pick, or
 * it's flagged as taking add-ons and the catalog has some. Otherwise it drops
 * straight onto the cart. */
const needsCustomize = (item: MenuItem, addonCount: number) => item.variants.length > 0 || (item.allowsAddons && addonCount > 0)

/** Same item + same variant + same multiset of add-ons is the same line. */
const configKey = (itemId: string, variantId: string | null, addonIds: string[]) =>
  `${itemId}::${variantId ?? ''}::${[...addonIds].sort().join(',')}`

const lineUnitPrice = (line: CartLine) => (line.variant?.price ?? line.item.price) + line.addons.reduce((sum, a) => sum + a.price, 0)
const lineTotal = (line: CartLine) => lineUnitPrice(line) * line.quantity

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

const formatQty = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 3 })

function availabilityLabel(quantity: number, unitLabel: string | null) {
  return unitLabel ? `${formatQty(quantity)} ${unitLabel}` : `${formatQty(quantity)} available`
}

function variantConsumptionLabel(variant: Variant) {
  if (!variant.stockProduct) return null
  const unit = variant.stockProduct.packUnit?.name ?? variant.stockProduct.unit
  return `${formatQty(variant.stockQtyPerUnit ?? 1)} ${unit} of ${variant.stockProduct.name}`
}

type TaxBucket = { key: string; label: string; net: number; tax: number; gross: number }

/** Live mirror of the server's computeOrderFinancials: tax is worked out per
 * line from the line's own treatment/rate/mode (menu-item override else the
 * property default, already resolved by the API), the order discount is
 * apportioned by line value, and lines are bucketed for the receipt-style
 * breakdown. Kept deliberately in step with lib/orderTotals.ts on the server. */
function computeFinancials(cart: CartLine[], discountInput: string, complimentary = false) {
  const rows = cart.map((line) => ({ sub: lineTotal(line), tax: line.item.tax }))
  const subtotal = rows.reduce((s, r) => s + r.sub, 0)
  const discount = Math.min(Number(discountInput) || 0, subtotal)

  const buckets = new Map<string, TaxBucket>()
  let net = 0
  let taxAmount = 0
  let total = 0

  for (const { sub, tax } of rows) {
    const share = subtotal > 0 ? sub - discount * (sub / subtotal) : 0
    let lineNet: number
    let lineTax: number
    if (tax.treatment === 'EXEMPT' || tax.treatment === 'ZERO_RATED' || tax.rate <= 0) {
      lineNet = share; lineTax = 0
    } else if (tax.mode === 'EXCLUSIVE') {
      lineNet = share; lineTax = lineNet * (tax.rate / 100)
    } else {
      lineNet = share / (1 + tax.rate / 100); lineTax = share - lineNet
    }
    const lineGross = lineNet + lineTax
    net += lineNet; taxAmount += lineTax; total += lineGross

    const label = taxLabel(tax)
    const bucket = buckets.get(label) ?? { key: label, label, net: 0, tax: 0, gross: 0 }
    bucket.net += lineNet; bucket.tax += lineTax; bucket.gross += lineGross
    buckets.set(label, bucket)
  }

  const taxLines = [...buckets.values()].map((b) => ({ ...b, net: round2(b.net), tax: round2(b.tax), gross: round2(b.gross) }))
  if (complimentary) return { subtotal: round2(subtotal), discount: round2(subtotal), net: 0, taxAmount: 0, total: 0, complimentaryValue: round2(subtotal), taxLines: [] }
  return { subtotal: round2(subtotal), discount: round2(discount), net: round2(net), taxAmount: round2(taxAmount), total: round2(total), complimentaryValue: 0, taxLines }
}

export default function PointOfSale() {
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  // Mirrors the server's canSeeAllOrders() (pos.routes.ts) purely for this
  // hint — the actual scoping happens server-side regardless of what the
  // client thinks, so this can never be a security check, just a label.
  const canSeeAllOrders = ['POS_VIEW_ALL_ORDERS', 'POS_APPROVE_COUNTER', 'POS_APPROVE_CANCELLATION'].some((p) => user?.role?.permissions.includes(p))
  const [tab, setTab] = useState<'NEW' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('NEW')
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [allAddons, setAllAddons] = useState<CatalogAddon[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [complimentarySessions, setComplimentarySessions] = useState<ComplimentarySession[]>([])
  const [saleType, setSaleType] = useState<'SALE' | 'COMPLIMENTARY'>('SALE')
  const [complimentarySessionId, setComplimentarySessionId] = useState('')
  const [complimentaryReason, setComplimentaryReason] = useState('')
  const [sessionModalOpen, setSessionModalOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All items')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const categoryRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customizing, setCustomizing] = useState<MenuItem | null>(null)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)
  // Brief "added" pulse on a menu card — the cart is off-screen (below) on
  // mobile, so a one-click add otherwise looks like nothing happened.
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const addedTimer = useRef<number | undefined>(undefined)
  const [tableId, setTableId] = useState('')
  const [party, setParty] = useState<SaleParty>({ kind: 'WALK_IN' })
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [discount, setDiscount] = useState('0')
  const [heldSales, setHeldSales] = useState<HeldSale[]>([])
  const holdSeq = useRef(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  // Success flash on the Send/Serve button after an order goes through.
  const [sentPulse, setSentPulse] = useState(false)
  const sentTimer = useRef<number | undefined>(undefined)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<CreatedOrder | null>(null)
  // First/last name per employee id — resolves an order's createdBy to a
  // "rung up by" name on the ready-to-serve cards, same convention the
  // Approvals page already uses for cancelRequestedBy/cancelDecidedBy.
  const [staffNames, setStaffNames] = useState<Record<string, string>>({})

  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])
  const [activeOrdersLoading, setActiveOrdersLoading] = useState(false)
  const [cancelledOrders, setCancelledOrders] = useState<CancelledOrder[]>([])
  const [cancelledLoading, setCancelledLoading] = useState(false)
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([])
  const [completedLoading, setCompletedLoading] = useState(false)
  const [completedFilter, setCompletedFilter] = useState<'ALL' | 'OWING' | 'PAID'>('ALL')
  const [settlementOrderId, setSettlementOrderId] = useState<string | null>(null)
  const [addItemsOrder, setAddItemsOrder] = useState<ActiveOrder | null>(null)
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null)
  const [servingId, setServingId] = useState<string | null>(null)

  const { fixed: fixedLocation, options: pickableLocations, selectedId: selectedLocationId, setLocation, effectiveId: effectiveLocationId, needsChoice: needsLocationChoice } = useWorkingLocation(locations)

  async function loadMenuItems() {
    const query = effectiveLocationId ? `?locationId=${effectiveLocationId}` : ''
    const menuResponse = await api<{ items: ApiMenuItem[] }>(`/pos/menu-items${query}`)
    setMenuItems((menuResponse.items ?? []).map(normalizeMenuItem))
  }

  // Tables are scoped per location (a Bar shouldn't see a Restaurant's dine-in
  // tables) — refetches whenever the effective location changes, and
  // auto-selects a "Counter" table for that location when the current
  // selection isn't valid there (covers first load and switching locations).
  async function loadTables() {
    const query = effectiveLocationId ? `?locationId=${effectiveLocationId}` : ''
    const response = await api<{ tables: RestaurantTable[] }>(`/tables${query}`)
    const rows = response.tables ?? []
    setTables(rows)
    setTableId((current) => {
      if (rows.some((t) => t.id === current)) return current
      return rows.find((t) => t.label.toLowerCase().startsWith('counter'))?.id ?? ''
    })
  }

  // `silent` skips the loading flag — used by the background 15s poll (and
  // by refreshes after an action already in flight) so the whole section
  // doesn't blank out to a spinner under someone's cursor. The spinner is
  // only for the real first load of a tab/location switch.
  async function loadActiveOrders(silent = false) {
    if (!silent) setActiveOrdersLoading(true)
    try {
      const query = effectiveLocationId ? `&locationId=${effectiveLocationId}` : ''
      const response = await api<{ orders: ActiveOrder[] }>(`/pos/orders?channel=FOOD${query}`)
      setActiveOrders((response.orders ?? []).filter((o) => NON_FINAL_STATUSES.includes(o.status)))
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : 'Could not load active orders')
    } finally {
      if (!silent) setActiveOrdersLoading(false)
    }
  }

  async function loadCancelledOrders() {
    setCancelledLoading(true)
    try {
      const query = effectiveLocationId ? `&locationId=${effectiveLocationId}` : ''
      const [cancelled, pending] = await Promise.all([
        api<{ orders: CancelledOrder[] }>(`/pos/orders?channel=FOOD&status=CANCELLED&limit=${FETCH_LIMIT}${query}`),
        api<{ orders: CancelledOrder[] }>(`/pos/orders?channel=FOOD&status=PENDING_CANCELLATION&limit=${FETCH_LIMIT}${query}`),
      ])
      setCancelledOrders([...(pending.orders ?? []), ...(cancelled.orders ?? [])])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load cancelled orders')
    } finally {
      setCancelledLoading(false)
    }
  }

  async function loadCompletedOrders() {
    setCompletedLoading(true)
    try {
      const query = effectiveLocationId ? `&locationId=${effectiveLocationId}` : ''
      const response = await api<{ orders: CompletedOrder[] }>(`/pos/orders?channel=FOOD&status=COMPLETED&limit=${FETCH_LIMIT}${query}`)
      setCompletedOrders(response.orders ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load completed orders')
    } finally {
      setCompletedLoading(false)
    }
  }

  async function loadPos() {
    setLoading(true)
    setError('')
    try {
      const [profileResponse, locationResponse, methodsResponse, addonResponse, compResponse] = await Promise.all([
        api<{ profile: BusinessProfile | null }>('/business-profile'),
        api<{ locations: Location[] }>('/locations'),
        api<{ methods: (PaymentMethod & { code: string })[] }>('/payment-methods?activeOnly=true'),
        api<{ addons: ApiCatalogAddon[] }>('/pos/addons'),
        api<{ sessions: ComplimentarySession[] }>('/pos/complimentary-sessions?activeOnly=true'),
      ])
      setProfile(profileResponse.profile)
      setLocations(locationResponse.locations ?? [])
      // Room Charge is a system method the backend resolves by code when
      // settling to a folio — it isn't a real "how did they pay" choice.
      setPaymentMethods((methodsResponse.methods ?? []).filter((m) => m.code !== 'ROOM_CHARGE'))
      setAllAddons((addonResponse.addons ?? []).map((a) => ({
        id: a.id, name: a.name, price: toNumber(a.price),
        categoryId: a.menuCategoryId ?? null, categoryName: a.menuCategory?.name ?? null,
      })))
      setComplimentarySessions(compResponse.sessions ?? [])
      await Promise.all([loadMenuItems(), loadTables(), loadActiveOrders()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the POS menu')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPos() }, [])
  useEffect(() => { if (!loading) { void loadMenuItems(); void loadTables(); void loadActiveOrders() } }, [effectiveLocationId])
  useEffect(() => { if (tab === 'CANCELLED') void loadCancelledOrders() }, [tab, effectiveLocationId])
  useEffect(() => { if (tab === 'COMPLETED') void loadCompletedOrders() }, [tab, effectiveLocationId])
  // Keeps activeOrders (and with it, the ready-to-serve priority section and
  // its tab badge) current while staff sit on the New Sale tab ringing up
  // other orders — a counter/kitchen order going READY elsewhere shouldn't
  // need a manual refresh to notice.
  useEffect(() => {
    const timer = window.setInterval(() => void loadActiveOrders(true), 15000)
    return () => window.clearInterval(timer)
  }, [effectiveLocationId])
  useEffect(() => {
    api<{ employees: { id: string; firstName: string; lastName: string | null }[] }>('/employees')
      .then((r) => setStaffNames(Object.fromEntries(r.employees.map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()]))))
      .catch(() => { /* Waiter name is a nicety on the ready cards, not load-critical. */ })
  }, [])
  useEffect(() => {
    if (!categoryOpen) return
    const onClick = (e: MouseEvent) => { if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [categoryOpen])

  const categories = useMemo(() => ['All items', ...Array.from(new Set(menuItems.map((item) => item.category.name)))], [menuItems])
  const filteredCategories = categories.filter((c) => c.toLowerCase().includes(categoryQuery.trim().toLowerCase()))
  const visibleItems = menuItems.filter((item) => (activeCategory === 'All items' || item.category.name === activeCategory) && (!search.trim() || `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())))
  const financials = useMemo(() => computeFinancials(cart, discount, saleType === 'COMPLIMENTARY'), [cart, discount, saleType])
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const serveMode = locations.find((l) => l.id === effectiveLocationId)?.serveMode ?? 'KITCHEN'
  // Orders waiting to be handed over — Kitchen tickets picked up at the pass,
  // or counter orders awaiting the approval-gated serve — get priority
  // placement in Active Orders ahead of everything still in progress.
  const readyActiveOrders = activeOrders.filter((o) => o.status === 'READY')
  const otherActiveOrders = activeOrders.filter((o) => o.status !== 'READY')
  const readyCount = readyActiveOrders.length
  const instantServe = serveMode === 'DIRECT'
  const sendsToCounter = serveMode === 'COUNTER'

  function addConfiguredLine(item: MenuItem, variant: Variant | null, addons: Addon[], quantity: number) {
    setConfirmation(null)
    setCart((current) => {
      const key = configKey(item.id, variant?.id ?? null, addons.map((a) => a.id))
      const match = current.find((line) => configKey(line.item.id, line.variant?.id ?? null, line.addons.map((a) => a.id)) === key)
      if (match) return current.map((line) => (line === match ? { ...line, quantity: line.quantity + quantity } : line))
      return [...current, { key: crypto.randomUUID(), item, variant, addons, quantity }]
    })
  }

  function onItemClick(item: MenuItem) {
    if (needsCustomize(item, allAddons.length)) { setCustomizing(item); return }
    addConfiguredLine(item, null, [], 1)
    setJustAdded(item.id)
    window.clearTimeout(addedTimer.current)
    addedTimer.current = window.setTimeout(() => setJustAdded(null), 850)
  }

  useEffect(() => () => { window.clearTimeout(addedTimer.current); window.clearTimeout(sentTimer.current) }, [])

  function changeQuantity(key: string, change: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.key !== key) return [line]
      const quantity = line.quantity + change
      return quantity > 0 ? [{ ...line, quantity }] : []
    }))
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key))
  }

  // Re-configure an existing cart line in place (size / add-ons / quantity).
  function replaceCartLine(key: string, variant: Variant | null, addons: Addon[], quantity: number) {
    setCart((current) => current.map((line) => (line.key === key ? { ...line, variant, addons, quantity } : line)))
  }

  function resetSale() {
    setCart([])
    setTableId('')
    setDiscount('0')
    setSaleType('SALE')
    setComplimentarySessionId('')
    setComplimentaryReason('')
    setConfirmation(null)
    setParty({ kind: 'WALK_IN' })
  }

  function holdSale() {
    if (!cart.length) return
    const table = tables.find((t) => t.id === tableId)
    holdSeq.current += 1
    setHeldSales((current) => [...current, { key: crypto.randomUUID(), heldNo: holdSeq.current, label: table?.label ?? 'Takeaway', tableId, discount, notes: '', party, cart }])
    resetSale()
    toast.info('Sale held', 'Resume it from the panel above the order.')
  }

  function resumeSale(held: HeldSale) {
    setCart(held.cart)
    setTableId(held.tableId)
    setDiscount(held.discount)
    setParty(held.party)
    setHeldSales((current) => current.filter((h) => h.key !== held.key))
  }

  function discardHeldSale(key: string) {
    setHeldSales((current) => current.filter((h) => h.key !== key))
  }

  async function autoPrint(orderId: string) {
    const s = getThermalSettings()
    if (!s.enabled || !s.autoPrint || s.connection === 'dialog') return
    try {
      const { order } = await api<{ order: ReceiptOrder }>(`/pos/orders/${orderId}`)
      await printReceipt(order, profile as ReceiptProfile)
      toast.success('Receipt sent to printer')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Auto-print failed — use the Print button')
    }
  }

  async function submitOrder() {
    if (!cart.length || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const response = await api<{ order: CreatedOrder }>('/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          tableId: tableId || undefined,
          locationId: effectiveLocationId || undefined,
          customerId: party.kind === 'WALK_IN' ? undefined : party.customer.id,
          reservationId: party.kind === 'ROOM' ? party.reservationId : undefined,
          discount: saleType === 'COMPLIMENTARY' ? 0 : financials.discount,
          saleType,
          complimentarySessionId: complimentarySessionId || undefined,
          complimentaryOrderRole: saleType === 'COMPLIMENTARY' ? 'HOST_COMP' : complimentarySessionId ? 'GUEST_SPEND' : undefined,
          complimentaryReason: complimentaryReason.trim() || undefined,
          items: cart.map((line) => ({
            menuItemId: line.item.id,
            variantId: line.variant?.id,
            quantity: line.quantity,
            addons: line.addons.map((addon) => ({ addonId: addon.id, quantity: 1 })),
          })),
        }),
      })
      resetSale()
      setConfirmation(response.order)
      const msg = instantServe ? `Order #${response.order.orderNumber} served` : sendsToCounter ? `Order #${response.order.orderNumber} sent to the counter` : `Order #${response.order.orderNumber} sent to the kitchen`
      toast.success(saleType === 'COMPLIMENTARY' ? `${msg} as complimentary` : msg)
      setSentPulse(true)
      window.clearTimeout(sentTimer.current)
      sentTimer.current = window.setTimeout(() => setSentPulse(false), 2000)
      void autoPrint(response.order.id)
      await loadPos()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the order')
    } finally {
      setSubmitting(false)
    }
  }

  async function serveOrder(orderId: string) {
    setServingId(orderId)
    try {
      await api(`/pos/orders/${orderId}/serve`, { method: 'PATCH' })
      void loadActiveOrders(true)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not mark the order served')
    } finally {
      setServingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <div className="relative">
        <div className="pointer-events-none absolute -bottom-2 left-3 right-1 top-2 rotate-[0.6deg] rounded-sm border border-black/10 bg-white/70" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-2.5 -top-2.5 size-12 rotate-12 rounded-sm bg-[#f2921a] shadow-lg" aria-hidden="true" />
        <div
          className="relative flex flex-wrap items-center justify-between gap-2.5 overflow-hidden rounded-sm border border-black/10 bg-[#faf7f0] px-4 py-3 text-slate-800 shadow-[0_1px_1px_rgba(2,6,23,0.05),0_3px_5px_rgba(2,6,23,0.06),0_12px_22px_-8px_rgba(2,6,23,0.18)] sm:gap-3 sm:px-5 sm:py-4"
          style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(2,6,23,0.055) 28px)' }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Checkout</p>
            <h1 className="mt-0.5 font-display text-sm font-semibold text-slate-900 sm:mt-1 sm:text-2xl">Point of Sale</h1>
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
      {confirmation && <div className="mt-5 flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 p-3 text-sm font-medium text-accent"><LuCircleCheck />{instantServe ? `Order #${confirmation.orderNumber} was served.` : sendsToCounter ? `Order #${confirmation.orderNumber} was sent to the counter.` : `Order #${confirmation.orderNumber} was saved and sent to the kitchen.`}</div>}

      <div className="mt-4 flex w-fit flex-wrap gap-2.5 sm:mt-6">
        {([
          ['NEW', <>New Sale</>, <LuPlus key="i" className="size-4" />],
          ['ACTIVE', (
            <>
              Active Orders{activeOrders.length > 0 ? ` (${activeOrders.length})` : ''}
              {readyCount > 0 && <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">{readyCount} to serve</span>}
            </>
          ), <LuClipboardList key="i" className="size-4" />],
          ['COMPLETED', <>Completed</>, <LuCircleCheck key="i" className="size-4" />],
          ['CANCELLED', <>Cancelled</>, <LuBan key="i" className="size-4" />],
        ] as const).map(([value, label, icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              'inline-flex items-center gap-2.5 rounded-md py-2.5 pl-2.5 pr-4 text-sm font-semibold transition',
              tab === value
                ? 'bg-amber-400 text-amber-950 shadow-[0_1px_2px_rgba(2,6,23,0.08),0_10px_20px_-8px_rgba(2,6,23,0.35)]'
                : 'bg-amber-400/15 text-amber-700 hover:bg-amber-400/25',
            )}
          >
            <span className={cn('flex size-6 items-center justify-center rounded', tab === value ? 'bg-amber-950/10' : 'bg-amber-400/25')}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {tab !== 'NEW' && !canSeeAllOrders && (
        <p className="mt-3 text-xs font-medium text-muted-foreground">Showing only the orders you rang up — ask a manager for the "see every order" capability if you need more.</p>
      )}

      {tab === 'COMPLETED' ? (
        <section className="mt-4 sm:mt-6">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {([['ALL', 'All'], ['OWING', 'Owing'], ['PAID', 'Fully paid']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setCompletedFilter(value)}
                className={cn('rounded-full border px-3 py-1 text-xs font-semibold', completedFilter === value ? 'border-secondary bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
                {label}
                {value === 'OWING' && completedOrders.some((o) => o.paymentStatus !== 'PAID') && ` (${completedOrders.filter((o) => o.paymentStatus !== 'PAID').length})`}
              </button>
            ))}
          </div>
          {completedLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
          ) : (() => {
            const rows = completedOrders.filter((o) => completedFilter === 'ALL' || (completedFilter === 'OWING' ? o.paymentStatus !== 'PAID' : o.paymentStatus === 'PAID'))
            if (rows.length === 0) return <div className="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground">No completed orders {completedFilter === 'OWING' ? 'still owing' : completedFilter === 'PAID' ? 'fully paid' : 'yet'}.</div>
            return (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((order) => {
                  const owed = Math.max(0, order.total - order.paid)
                  const badge = order.paymentStatus === 'PAID'
                    ? { label: 'Paid', cls: 'bg-success/10 text-success' }
                    : order.paymentStatus === 'PARTIAL'
                      ? { label: 'Part-paid', cls: 'bg-warning/15 text-warning' }
                      : { label: 'On credit', cls: 'bg-destructive/10 text-destructive' }
                  return (
                    <article key={order.id} className="rounded-sm border bg-card p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">Order #{order.orderNumber}</h3>
                        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', badge.cls)}>{badge.label}</span>
                      </div>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><LuUserRound className="size-3.5" /> {order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}` : 'Walk-in'} · {order.table?.label ?? 'Takeaway'}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{new Date(order.updatedAt).toLocaleString()}</p>
                      <p className="mt-2 text-lg font-bold">{formatKes(order.total)}</p>
                      {owed > 0.01 && <p className="text-xs font-semibold text-warning">Owing {formatKes(owed)} · paid {formatKes(order.paid)}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => setSettlementOrderId(order.id)} className={cn('inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold', owed > 0.01 ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted')}>
                          <LuReceiptText className="size-3.5" /> {owed > 0.01 ? 'Take payment' : 'View receipt'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )
          })()}
          {completedOrders.length >= 100 && (
            <p className="mt-4 text-center text-xs text-muted-foreground">Showing the 100 most recent. Older receipts are on the <span className="font-semibold">Receipts</span> page.</p>
          )}
        </section>
      ) : tab === 'CANCELLED' ? (
        <section className="mt-4 sm:mt-6">
          {cancelledLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
          ) : cancelledOrders.length === 0 ? (
            <div className="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground">No cancelled orders.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cancelledOrders.map((order) => {
                const pending = order.status === 'PENDING_CANCELLATION'
                return (
                  <article key={order.id} className="rounded-sm border bg-card p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">Order #{order.orderNumber}</h3>
                      <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', pending ? 'bg-warning/15 text-warning' : 'bg-destructive/10 text-destructive')}>
                        {pending ? 'Awaiting approval' : 'Cancelled'}
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><LuUserRound className="size-3.5" /> {order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}` : 'Walk-in'} · {order.table?.label ?? 'Takeaway'}</p>
                    <p className="mt-2 text-lg font-bold">{formatKes(order.total)}</p>
                    {order.items.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">{order.items.map((i) => `${i.quantity}× ${i.menuItem?.name ?? 'item'}${i.variant ? ` (${i.variant.name})` : ''}`).join(' · ')}</p>
                    )}
                    <div className="mt-3 rounded-sm bg-muted/40 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reason</p>
                      <p className="mt-0.5 text-xs">{order.cancelReason || <span className="italic text-muted-foreground">—</span>}</p>
                      {order.cancelDecisionNote && <p className="mt-1 text-[11px] text-muted-foreground">Admin note: {order.cancelDecisionNote}</p>}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      ) : tab === 'ACTIVE' ? (
        <section className="mt-4 sm:mt-6">
          {activeOrdersLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading active orders…</div>
          ) : activeOrders.length === 0 ? (
            <div className="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground">No orders in progress right now.</div>
          ) : (
            <>
              {readyActiveOrders.length > 0 && (
                <div className="mb-5 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-2.5">
                  <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-destructive">
                    <LuBellRing className="size-3.5" /> Awaiting service · {readyActiveOrders.length}
                  </p>
                  <div className="space-y-2">
                    {readyActiveOrders.map((order) => {
                      const count = order.items.reduce((s, i) => s + i.quantity, 0)
                      const waiter = order.createdBy ? staffNames[order.createdBy] : undefined
                      return (
                        <div key={order.id} className="flex flex-wrap items-center gap-2 rounded-sm border bg-card p-2.5 shadow-sm sm:flex-nowrap">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">#{order.orderNumber} · {order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}` : 'Walk-in'}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {count} item{count === 1 ? '' : 's'} · {order.table?.label ?? 'Takeaway'}{waiter ? ` · rung up by ${waiter}` : ''}
                            </p>
                          </div>
                          <button type="button" onClick={() => setReceiptOrderId(order.id)} title="Preview receipt" className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><LuPrinter className="size-4" /></button>
                          <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">Pending</span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{formatKes(order.total)}</span>
                          <button
                            type="button"
                            disabled={servingId === order.id}
                            onClick={() => void serveOrder(order.id)}
                            className="shrink-0 rounded-sm bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground disabled:opacity-50"
                          >
                            {servingId === order.id ? <LuLoaderCircle className="size-3.5 animate-spin" /> : 'Serve Now'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {otherActiveOrders.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {otherActiveOrders.map((order) => (
                    <article key={order.id} className="rounded-sm border bg-card p-5 shadow-sm">
                      <div className="flex items-start justify-between">
                        <h3 className="font-semibold">Order #{order.orderNumber}</h3>
                        <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">{order.status}</span>
                      </div>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><LuUserRound className="size-3.5" /> {order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}` : 'Walk-in'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.table?.label ?? 'Takeaway'}</p>
                      <p className="mt-3 text-lg font-bold">{formatKes(order.total)}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => setReceiptOrderId(order.id)} title="Receipt" className="inline-flex items-center justify-center rounded-sm border p-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"><LuPrinter className="size-3.5" /></button>
                        <button onClick={() => setAddItemsOrder(order)} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><LuPencil className="size-3.5" /> Manage</button>
                        {order.status === 'SERVED' && (
                          <button onClick={() => setSettlementOrderId(order.id)} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><LuReceiptText className="size-3.5" /> Complete & Pay</button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-0 sm:mt-6 lg:grid-cols-[minmax(0,1fr)_24px_360px]">
          <section className="min-w-0">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <label className="relative flex-1">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu…" className="w-full rounded-sm border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <div ref={categoryRef} className="relative sm:w-64">
                <button
                  type="button"
                  onClick={() => { setCategoryOpen((v) => !v); setCategoryQuery('') }}
                  className="flex w-full items-center justify-between gap-2 rounded-sm border bg-card px-3 py-2.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <span className="truncate">{activeCategory}</span>
                  <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', categoryOpen && 'rotate-180')} />
                </button>
                {categoryOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-sm border bg-card shadow-lg">
                    <div className="border-b p-2">
                      <input
                        autoFocus
                        value={categoryQuery}
                        onChange={(e) => setCategoryQuery(e.target.value)}
                        placeholder="Search categories…"
                        className="w-full rounded-sm border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="scrollbar-thin max-h-56 overflow-y-auto py-1">
                      {filteredCategories.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No categories match.</p>
                      ) : filteredCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => { setActiveCategory(category); setCategoryOpen(false) }}
                          className={cn('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted', activeCategory === category && 'bg-secondary/10 font-semibold text-secondary')}
                        >
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
                <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading menu…</div>
              ) : visibleItems.length === 0 ? (
                <div className="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground">No menu items match this view.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
                  {visibleItems.map((item) => {
                    const added = justAdded === item.id
                    const customize = needsCustomize(item, allAddons.length)
                    const outOfStock = item.availableQuantity != null && item.availableQuantity <= 0
                    return (
                      <button key={item.id} onClick={() => onItemClick(item)} disabled={outOfStock} className={cn('group relative flex flex-col overflow-hidden rounded-sm border bg-card p-3.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm sm:p-5', added ? 'border-[#f2921a] ring-2 ring-[#f2921a]/40' : outOfStock ? 'border-destructive/20 bg-destructive/5' : 'border-border')}>
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-sm sm:size-11', item.temperature === 'HOT' ? 'bg-warning/15 text-warning' : item.temperature === 'COLD' ? 'bg-secondary/10 text-secondary' : 'bg-accent/10 text-accent')}><LuCoffee className="size-5" /></span>
                          <span className="max-w-[55%] truncate rounded-sm bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{item.category.name}</span>
                        </div>
                        <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-foreground sm:mt-5 sm:text-base">{item.name}</h2>
                        {item.availableQuantity != null && (
                          <span className={cn('mt-1.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', outOfStock ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success')}>
                            {outOfStock ? 'Out of stock' : availabilityLabel(item.availableQuantity, item.availabilityUnitLabel)}
                          </span>
                        )}
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground sm:min-h-10">{item.description || item.category.name}</p>

                        <div className="mt-3 border-t pt-3 sm:mt-4 sm:pt-4">
                          {item.variants.length > 0 ? (
                            <ul className="space-y-0.5 text-[11px] leading-tight">
                              {item.variants.slice(0, 4).map((v) => (
                                <li key={v.id} className="flex items-baseline justify-between gap-2">
                                  <span className="truncate text-muted-foreground">
                                    {v.name}
                                    {v.availableQuantity != null && (v.availableQuantity <= 0 ? ' (out)' : ` (${availabilityLabel(v.availableQuantity, v.availabilityUnitLabel)})`)}
                                  </span>
                                  <span className="shrink-0 font-semibold text-foreground">{formatKes(v.price)}</span>
                                </li>
                              ))}
                              {item.variants.length > 4 && <li className="text-[10px] text-muted-foreground">+{item.variants.length - 4} more</li>}
                            </ul>
                          ) : (
                            <span className="text-base font-bold text-foreground sm:text-lg">{formatKes(item.price)}</span>
                          )}

                          {item.allowsAddons && allAddons.length > 0 && (
                            <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-wide text-accent">Has add-ons</span>
                          )}

                          <span className={cn('mt-3 flex w-full items-center justify-center gap-1.5 rounded-sm py-2 text-xs font-bold uppercase tracking-wide shadow-md transition group-hover:brightness-95', added ? 'bg-[#f2921a] text-white' : 'bg-accent text-accent-foreground')}>
                            {added ? <><LuCheck className="size-4" /> Added</> : outOfStock ? 'Out of stock' : customize ? <><LuSlidersHorizontal className="size-4" /> Options</> : <><LuPlus className="size-4" /> Add</>}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Node-line divider */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <span className="absolute left-1/2 -top-1.5 block size-3 -translate-x-1/2 rounded-full bg-secondary" />
            <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-secondary/30" />
            <span className="absolute bottom-0 left-1/2 block size-3 -translate-x-1/2 -translate-y-1.5 rounded-full bg-secondary" />
          </div>

          <aside className="mt-8 flex h-fit min-w-0 flex-col gap-3 lg:mt-0">
            {heldSales.length > 0 && (
              <div className="rounded-lg border-2 border-warning/40 bg-warning/5 p-2.5">
                <p className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-warning">
                  <LuPause className="size-3.5" /> Held sales · {heldSales.length}
                </p>
                <div className="space-y-2">
                  {heldSales.map((held) => {
                    const count = held.cart.reduce((s, i) => s + i.quantity, 0)
                    const heldTotal = computeFinancials(held.cart, held.discount).total
                    return (
                      <div key={held.key} className="flex items-center gap-2 rounded-sm border bg-card p-2.5 shadow-sm">
                        <button type="button" onClick={() => resumeSale(held)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-bold text-foreground">#{held.heldNo} · {partyLabel(held.party)}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{count} item{count === 1 ? '' : 's'} · {held.label}</p>
                          <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-warning"><LuPause className="size-3" /> Tap to resume</p>
                        </button>
                        <span className="shrink-0 rounded-full border border-warning/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">Held</span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{formatKes(heldTotal)}</span>
                        <button type="button" onClick={() => discardHeldSale(held.key)} title="Discard held sale" className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-4" /></button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col overflow-hidden rounded-lg border-2 border-secondary/40 bg-card shadow-md">
              <div className="flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Current Sale</p>
                  <button type="button" onClick={() => setCustomerModalOpen(true)} className="mt-1.5 flex max-w-full items-center gap-2 text-left">
                    {party.kind === 'ROOM'
                      ? <LuBedDouble className="size-4 shrink-0 text-secondary" />
                      : <LuUserRound className="size-4 shrink-0 text-primary" />}
                    <span className="truncate text-lg font-semibold text-foreground">{partyLabel(party)}</span>
                    <LuChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                  {party.kind === 'ROOM' && (
                    <p className="mt-1 text-xs font-semibold text-secondary">Charges to Room {party.roomNumber} at settlement</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex size-14 flex-col items-center justify-center rounded-full border-2 border-dashed border-secondary text-[9px] font-bold uppercase leading-none tracking-wide text-secondary">
                    <span>Open</span>
                    <span className="mt-0.5">Sale</span>
                  </span>
                  <button
                    type="button"
                    onClick={resetSale}
                    disabled={cart.length === 0 && party.kind === 'WALK_IN' && !tableId}
                    title="Clear this sale"
                    className="rounded-sm p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                  >
                    <LuTrash2 className="size-4" />
                  </button>
                </div>
              </div>

              <div className="border-b px-4 py-3">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Table</label>
                <select aria-label="Table" value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1.5 w-full rounded-sm border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Takeaway</option>
                  {/* A table can carry several separate orders at once — only
                      one actually out of service is unselectable. */}
                  {tables.map((t) => <option key={t.id} value={t.id} disabled={t.status === 'OUT_OF_SERVICE'}>{t.label}{t.area ? ` (${t.area})` : ''}{t.status === 'OCCUPIED' ? ' — in use' : t.status === 'OUT_OF_SERVICE' ? ' — out of service' : ''}</option>)}
                </select>
              </div>

              <div className="border-b px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setSaleType('SALE')} className={cn('rounded-sm border px-3 py-2 text-sm font-semibold', saleType === 'SALE' ? 'border-secondary bg-secondary text-secondary-foreground' : 'hover:bg-muted')}>Sale</button>
                  <button type="button" onClick={() => { setSaleType('COMPLIMENTARY'); setDiscount('0') }} className={cn('inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-semibold', saleType === 'COMPLIMENTARY' ? 'border-warning bg-warning text-warning-foreground' : 'hover:bg-muted')}><LuGift className="size-4" /> Complimentary</button>
                </div>
                <div className="mt-2 grid gap-2">
                  <div className="flex gap-2">
                    <select value={complimentarySessionId} onChange={(e) => setComplimentarySessionId(e.target.value)} className="input flex-1">
                      <option value="">No host/event session</option>
                      {complimentarySessions.map((session) => <option key={session.id} value={session.id}>{session.title} - {session.hostName}</option>)}
                    </select>
                    <button type="button" onClick={() => setSessionModalOpen(true)} className="rounded-sm border px-3 text-xs font-semibold text-secondary hover:bg-secondary/10">New</button>
                  </div>
                  {saleType === 'COMPLIMENTARY' && (
                    <input value={complimentaryReason} onChange={(e) => setComplimentaryReason(e.target.value)} placeholder="Reason, e.g. host bottle allocation" className="input" />
                  )}
                  {saleType === 'SALE' && complimentarySessionId && (
                    <p className="text-xs font-medium text-secondary">This paid sale will count as guest spend for the selected host/event.</p>
                  )}
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="flex h-40 flex-col items-center justify-center text-center">
                    <LuCoffee className="size-7 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Your order is empty</p>
                    <p className="mt-1 text-xs text-muted-foreground">Choose a menu item to begin.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((line) => (
                      <div key={line.key} className="rounded-sm border bg-muted/40 p-3">
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{line.item.name}</p>
                            {line.variant && <p className="text-xs font-medium text-secondary">{line.variant.name}</p>}
                            <p className="text-xs text-muted-foreground">{line.quantity} × {formatKes(line.variant?.price ?? line.item.price)}</p>
                          </div>
                          <div className="flex shrink-0 items-start gap-1">
                            {needsCustomize(line.item, allAddons.length) && (
                              <button onClick={() => setEditingLine(line)} title="Change size / add-ons" className="text-muted-foreground hover:text-secondary"><LuPencil className="size-3.5" /></button>
                            )}
                            <button onClick={() => removeLine(line.key)} title="Remove" className="text-muted-foreground hover:text-destructive"><LuTrash2 className="size-4" /></button>
                          </div>
                        </div>
                        {line.addons.length > 0 && (
                          <ul className="mt-2 space-y-0.5 border-t pt-2 text-[11px] text-muted-foreground">
                            {line.addons.map((addon) => (
                              <li key={addon.id} className="flex justify-between"><span>+ {addon.name}</span><span>{formatKes(addon.price)}</span></li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => changeQuantity(line.key, -1)} className="rounded-sm border bg-card p-1"><LuMinus className="size-3" /></button>
                            <span className="w-6 text-center text-sm font-medium">{line.quantity}</span>
                            <button onClick={() => changeQuantity(line.key, 1)} className="rounded-sm border bg-card p-1"><LuPlus className="size-3" /></button>
                          </div>
                          <span className="text-sm font-semibold">{formatKes(lineTotal(line))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t p-4">
                <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Discount (KES)
                  <input type="number" min="0" step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={saleType === 'COMPLIMENTARY'} className="w-24 rounded-sm border bg-background px-2 py-1 text-right text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50" />
                </label>
              </div>

              <div className="space-y-1.5 border-t bg-muted/30 p-4 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatKes(financials.subtotal)}</span></div>
                {financials.discount > 0 && <div className="flex justify-between text-destructive"><span>Discount</span><span>-{formatKes(financials.discount)}</span></div>}
                {saleType === 'COMPLIMENTARY' && <div className="flex justify-between text-warning"><span>Complimentary value</span><span>{formatKes(financials.complimentaryValue)}</span></div>}
                <div className="flex justify-between text-muted-foreground"><span>Net</span><span>{formatKes(financials.net)}</span></div>
                {financials.taxLines.map((t) => (
                  <div key={t.key} className="flex justify-between text-muted-foreground"><span>{t.label}</span><span>{formatKes(t.tax)}</span></div>
                ))}
                <div className="flex justify-between border-t pt-1.5 text-base font-bold text-foreground"><span>Total</span><span>{formatKes(financials.total)}</span></div>
              </div>

              {needsLocationChoice && cart.length > 0 && (
                <p className="border-t bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning">Select which location this sale is for (top right) before sending.</p>
              )}

              <div className="flex gap-2 p-4 pt-0">
                <button disabled={cart.length === 0} onClick={holdSale} className="flex items-center justify-center gap-1.5 rounded-sm border border-warning/50 px-3 py-2.5 text-xs font-bold text-warning transition hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-40">
                  <LuPause className="size-3.5" /> Hold
                </button>
                <button
                  disabled={sentPulse || cart.length === 0 || submitting || needsLocationChoice}
                  onClick={() => void submitOrder()}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-sm py-2.5 text-sm font-bold transition',
                    sentPulse
                      ? 'bg-success text-success-foreground'
                      : 'bg-primary text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {sentPulse ? <><LuCircleCheck className="size-4" /> {instantServe ? 'Served!' : 'Order sent!'}</>
                    : submitting ? <><LuLoaderCircle className="animate-spin" /> Sending…</>
                    : saleType === 'COMPLIMENTARY' ? (instantServe ? 'Serve complimentary' : 'Post complimentary')
                    : instantServe ? `Serve now · ${formatKes(financials.total)}`
                    : sendsToCounter ? `Post to Counter · ${formatKes(financials.total)}`
                    : `Post to Kitchen · ${formatKes(financials.total)}`}
                </button>
              </div>
            </div>

            <p className="px-1 text-center text-[11px] text-muted-foreground">{itemCount} item{itemCount === 1 ? '' : 's'} in this sale · payment is decided once the order is complete</p>
          </aside>
        </div>
      )}

      {customizing && (
        <CustomizeModal
          item={customizing}
          allAddons={allAddons}
          onClose={() => setCustomizing(null)}
          onSubmit={(variant, addons, quantity) => { addConfiguredLine(customizing, variant, addons, quantity); setCustomizing(null) }}
        />
      )}

      {editingLine && (
        <CustomizeModal
          item={editingLine.item}
          allAddons={allAddons}
          initial={{ variantId: editingLine.variant?.id ?? null, addonIds: editingLine.addons.map((a) => a.id), quantity: editingLine.quantity }}
          onClose={() => setEditingLine(null)}
          onSubmit={(variant, addons, quantity) => { replaceCartLine(editingLine.key, variant, addons, quantity); setEditingLine(null) }}
        />
      )}

      {customerModalOpen && (
        <CustomerSelectModal party={party} onChange={setParty} onClose={() => setCustomerModalOpen(false)} />
      )}

      {settlementOrderId && (
        <OrderSettlementPanel
          orderId={settlementOrderId}
          title="Active order"
          profile={profile as ReceiptProfile}
          paymentMethods={paymentMethods}
          onClose={() => setSettlementOrderId(null)}
          onChanged={() => { void loadActiveOrders(true); if (tab === 'COMPLETED') void loadCompletedOrders() }}
        />
      )}

      {addItemsOrder && (
        <AddItemsModal
          order={addItemsOrder}
          menuItems={menuItems}
          allAddons={allAddons}
          onClose={() => setAddItemsOrder(null)}
          onRefresh={() => void loadActiveOrders(true)}
          onAdded={() => { setAddItemsOrder(null); void loadActiveOrders(true) }}
        />
      )}

      {receiptOrderId && (
        <ReceiptPreviewModal
          orderId={receiptOrderId}
          profile={profile as ReceiptProfile}
          onClose={() => setReceiptOrderId(null)}
        />
      )}

      {sessionModalOpen && (
        <ComplimentarySessionModal
          onClose={() => setSessionModalOpen(false)}
          onCreated={(session) => {
            setComplimentarySessions((current) => [session, ...current.filter((row) => row.id !== session.id)])
            setComplimentarySessionId(session.id)
            setSessionModalOpen(false)
          }}
        />
      )}
    </div>
  )
}

/** The options step: pick a variant (size/option) if the item has any, then
 * attach add-ons from the flat catalog. The add-on list is filtered by menu
 * category (defaulting to the item's own), or "All". Tap to add, × to remove.
 * Shown whenever the item has variants or the catalog has add-ons. Passing
 * `initial` opens it pre-filled to edit an existing line (CTA reads Update). */
function CustomizeModal({ item, allAddons, initial, onClose, onSubmit }: {
  item: MenuItem
  allAddons: CatalogAddon[]
  initial?: { variantId: string | null; addonIds: string[]; quantity: number }
  onClose: () => void
  onSubmit: (variant: Variant | null, addons: Addon[], quantity: number) => void
}) {
  const [variantId, setVariantId] = useState(initial?.variantId ?? item.variants[0]?.id ?? '')
  const [selectedIds, setSelectedIds] = useState<string[]>(initial?.addonIds ?? [])
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const editing = !!initial

  // Category chips: "All" + every distinct category present in the catalog.
  const catOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of allAddons) if (a.categoryId && a.categoryName) seen.set(a.categoryId, a.categoryName)
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [allAddons])
  const [catFilter, setCatFilter] = useState<string>(() =>
    allAddons.some((a) => a.categoryId === item.category.id) ? item.category.id : 'ALL',
  )

  const variant = item.variants.find((v) => v.id === variantId) ?? null
  const filtered = catFilter === 'ALL' ? allAddons : allAddons.filter((a) => a.categoryId === catFilter)
  const selected = selectedIds.map((id) => allAddons.find((a) => a.id === id)!).filter(Boolean)

  const toggle = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const canAdd = item.variants.length === 0 || !!variant
  const chosenAddons: Addon[] = selected.map((a) => ({ id: a.id, name: a.name, price: a.price }))
  const unitPrice = (variant?.price ?? item.price) + chosenAddons.reduce((sum, a) => sum + a.price, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="grid max-h-[88vh] w-full max-w-lg grid-rows-[auto_1fr_auto] overflow-hidden rounded-sm border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.category.name}</p>
            <h2 className="truncate font-display text-xl font-semibold">{item.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          {item.variants.length > 0 && (
            <fieldset>
              <legend className="mb-2 flex items-center justify-between text-sm font-semibold">
                Option <span className="text-[11px] font-medium uppercase tracking-wide text-accent">Choose 1</span>
              </legend>
              <div className="space-y-1.5">
                {item.variants.map((v) => {
                  const consumption = variantConsumptionLabel(v)
                  return (
                    <label key={v.id} className={cn('flex cursor-pointer items-start justify-between gap-3 rounded-sm border px-3 py-2.5 text-sm', variantId === v.id ? 'border-secondary bg-secondary/10 font-semibold' : 'hover:bg-muted')}>
                      <span className="flex min-w-0 items-start gap-2.5">
                        <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} className="mt-0.5 accent-secondary" />
                        <span className="min-w-0">
                          <span className="block truncate">{v.name}</span>
                          {consumption && (
                            <span className="mt-0.5 block text-xs font-medium text-secondary">
                              Consumes {consumption}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0">{formatKes(v.price)}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {item.allowsAddons && allAddons.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Add-ons</p>
                {selected.length > 0 && <span className="text-[11px] font-medium text-muted-foreground">{selected.length} added</span>}
              </div>

              {catOptions.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {[{ id: 'ALL', name: 'All' }, ...catOptions].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCatFilter(c.id)}
                      className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', catFilter === c.id ? 'border-secondary bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted')}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {selected.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {selected.map((a) => (
                    <button key={a.id} type="button" onClick={() => toggle(a.id)} className="inline-flex items-center gap-1.5 rounded-full border border-secondary bg-secondary/10 px-2.5 py-1 text-xs font-medium text-secondary">
                      {a.name}{a.price > 0 ? ` · ${formatKes(a.price)}` : ''}
                      <LuX className="size-3" />
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                {filtered.length === 0 ? (
                  <p className="rounded-sm border border-dashed p-3 text-center text-xs text-muted-foreground">No add-ons in this category.</p>
                ) : filtered.map((addon) => {
                  const on = selectedIds.includes(addon.id)
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggle(addon.id)}
                      className={cn('flex w-full items-center justify-between gap-3 rounded-sm border px-3 py-2.5 text-left text-sm', on ? 'border-secondary bg-secondary/10 font-medium' : 'hover:bg-muted')}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn('flex size-5 items-center justify-center rounded-sm border', on ? 'border-secondary bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>
                          {on ? <LuCheck className="size-3.5" /> : <LuPlus className="size-3.5" />}
                        </span>
                        {addon.name}
                      </span>
                      <span className="text-muted-foreground">{addon.price > 0 ? `+ ${formatKes(addon.price)}` : 'Free'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="rounded-sm border bg-background p-1.5"><LuMinus className="size-3.5" /></button>
            <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
            <button onClick={() => setQuantity((q) => Math.min(50, q + 1))} className="rounded-sm border bg-background p-1.5"><LuPlus className="size-3.5" /></button>
          </div>
          <button
            disabled={!canAdd}
            onClick={() => onSubmit(variant, chosenAddons, quantity)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editing ? <LuCheck className="size-4" /> : <LuPlus className="size-4" />} {editing ? 'Update' : 'Add'} · {formatKes(unitPrice * quantity)}
          </button>
        </div>
      </div>
    </div>
  )
}

function ComplimentarySessionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (session: ComplimentarySession) => void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [hostName, setHostName] = useState('')
  const [hostPhone, setHostPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!title.trim() || !hostName.trim()) { setError('Enter a session title and host name'); return }
    setSaving(true)
    setError('')
    try {
      const { session } = await api<{ session: ComplimentarySession }>('/pos/complimentary-sessions', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), hostName: hostName.trim(), hostPhone: hostPhone.trim() || undefined, notes: notes.trim() || undefined }),
      })
      onCreated(session)
      toast.success('Complimentary session created.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not create complimentary session'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-secondary">Complimentary session</p>
            <h2 className="mt-1 font-display text-xl font-semibold">New host/event</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-muted"><LuX className="size-4" /></button>
        </div>
        <div className="mt-5 grid gap-3">
          <label className="text-sm font-medium">Title <span className="text-destructive">*</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DJ Lexx Saturday" className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Host name <span className="text-destructive">*</span><input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="e.g. DJ Lexx" className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Phone<input value={hostPhone} onChange={(e) => setHostPhone(e.target.value)} className="input mt-1.5" /></label>
          <label className="text-sm font-medium">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 bottles whiskey allocation" className="input mt-1.5" /></label>
        </div>
        {error && <div className="mt-4 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
        <div className="mt-6 flex justify-end gap-2 border-t pt-5">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  )
}


/** Manage an order already in progress: change or remove lines that are on it
 * (size / add-ons / quantity), and ring up more. Line edits go straight to
 * the server (PATCH/DELETE /pos/orders/:id/items/:itemId); the "adding" list
 * is batched and POSTed on "Add to order". */
type ExistingLine = {
  id: string
  menuItemId: string | null
  quantity: number
  unitPrice: number
  menuItemName: string
  variantId: string | null
  variantName: string | null
  addons: { id: string; name: string; price: number }[]
}

function AddItemsModal({ order, menuItems, allAddons, onClose, onRefresh, onAdded }: {
  order: ActiveOrder
  menuItems: MenuItem[]
  allAddons: CatalogAddon[]
  onClose: () => void
  onRefresh: () => void
  onAdded: () => void
}) {
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customizing, setCustomizing] = useState<MenuItem | null>(null)
  const [editingNew, setEditingNew] = useState<CartLine | null>(null)
  const [editingExisting, setEditingExisting] = useState<ExistingLine | null>(null)
  const [existing, setExisting] = useState<ExistingLine[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const menuById = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems])

  async function loadExisting() {
    try {
      const r = await api<{ order: { items: { id: string; menuItemId: string | null; quantity: number; unitPrice: string | number; menuItem: { name: string } | null; variant: { id: string; name: string } | null; addons: { addon: { id: string; name: string; price: string | number } }[] }[] } }>(`/pos/orders/${order.id}`)
      setExisting(r.order.items.map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        unitPrice: toNumber(i.unitPrice),
        menuItemName: i.menuItem?.name ?? 'Item',
        variantId: i.variant?.id ?? null,
        variantName: i.variant?.name ?? null,
        addons: i.addons.map((a) => ({ id: a.addon.id, name: a.addon.name, price: toNumber(a.addon.price) })),
      })))
    } catch { setExisting([]) }
  }
  useEffect(() => { void loadExisting() }, [order.id])

  const visibleItems = menuItems.filter((item) => !search.trim() || `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const addingTotal = cart.reduce((sum, line) => sum + lineTotal(line), 0)

  function addConfiguredLine(item: MenuItem, variant: Variant | null, addons: Addon[], quantity: number) {
    setCart((current) => {
      const key = configKey(item.id, variant?.id ?? null, addons.map((a) => a.id))
      const match = current.find((line) => configKey(line.item.id, line.variant?.id ?? null, line.addons.map((a) => a.id)) === key)
      if (match) return current.map((line) => (line === match ? { ...line, quantity: line.quantity + quantity } : line))
      return [...current, { key: crypto.randomUUID(), item, variant, addons, quantity }]
    })
  }
  function replaceNewLine(key: string, variant: Variant | null, addons: Addon[], quantity: number) {
    setCart((current) => current.map((line) => (line.key === key ? { ...line, variant, addons, quantity } : line)))
  }

  function onItemClick(item: MenuItem) {
    if (needsCustomize(item, allAddons.length)) { setCustomizing(item); return }
    addConfiguredLine(item, null, [], 1)
  }

  function changeNewQty(key: string, change: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.key !== key) return [line]
      const quantity = line.quantity + change
      return quantity > 0 ? [{ ...line, quantity }] : []
    }))
  }

  async function patchExisting(line: ExistingLine, body: { variantId?: string | null; quantity?: number; addons?: { addonId: string; quantity: number }[] }) {
    setBusyId(line.id); setError('')
    try {
      await api(`/pos/orders/${order.id}/items/${line.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      await loadExisting()
      onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this line')
    } finally { setBusyId(null) }
  }

  async function removeExisting(line: ExistingLine) {
    if (!window.confirm(`Remove ${line.quantity}× ${line.menuItemName} from this order?`)) return
    setBusyId(line.id); setError('')
    try {
      await api(`/pos/orders/${order.id}/items/${line.id}`, { method: 'DELETE' })
      await loadExisting()
      onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this line')
    } finally { setBusyId(null) }
  }

  function editExisting(line: ExistingLine) {
    if (!line.menuItemId || !menuById.has(line.menuItemId)) {
      setError('That item is no longer on the menu — remove and re-add it instead.')
      return
    }
    setEditingExisting(line)
  }

  async function submitAdds() {
    if (!cart.length || submitting) return
    setSubmitting(true); setError('')
    try {
      await api(`/pos/orders/${order.id}/items`, {
        method: 'POST',
        body: JSON.stringify({ items: cart.map((line) => ({ menuItemId: line.item.id, variantId: line.variant?.id, quantity: line.quantity, addons: line.addons.map((addon) => ({ addonId: addon.id, quantity: 1 })) })) }),
      })
      onAdded()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add these items')
    } finally {
      setSubmitting(false)
    }
  }

  const editingExistingItem = editingExisting?.menuItemId ? menuById.get(editingExisting.menuItemId) ?? null : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="grid max-h-[88vh] w-full max-w-3xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-sm border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <p className="text-sm font-semibold text-secondary">Order #{order.orderNumber}</p>
            <h2 className="font-display text-xl font-semibold">Manage order</h2>
          </div>
          <button onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
        </div>

        {error && <div className="mx-4 mt-3 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="grid gap-0 overflow-hidden lg:grid-cols-[1fr_320px]">
          <div className="overflow-y-auto p-4">
            <label className="relative block">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu to add…" className="w-full rounded-sm border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {visibleItems.map((item) => (
                <button key={item.id} onClick={() => onItemClick(item)} className="flex items-center justify-between gap-2 rounded-sm border bg-card p-3 text-left text-sm shadow-sm hover:border-accent/50">
                  <span className="min-w-0 truncate font-medium">{item.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    {needsCustomize(item, allAddons.length) && <LuSlidersHorizontal className="size-3.5 text-accent" />}
                    {item.variants.length > 0 ? `from ${formatKes(Math.min(...item.variants.map((v) => v.price)))}` : formatKes(item.price)}
                  </span>
                </button>
              ))}
              {visibleItems.length === 0 && <p className="col-span-2 py-6 text-center text-xs text-muted-foreground">No menu items match.</p>}
            </div>
          </div>

          <div className="flex flex-col overflow-y-auto border-t bg-muted/20 p-4 lg:border-l lg:border-t-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On this order</p>
            {existing.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {existing.map((line) => {
                  const mi = line.menuItemId ? menuById.get(line.menuItemId) : undefined
                  const canEdit = (mi?.variants.length ?? 0) > 0 || (!!mi?.allowsAddons && allAddons.length > 0)
                  return (
                    <div key={line.id} className={cn('rounded-sm border bg-card p-2.5', busyId === line.id && 'opacity-50')}>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{line.quantity}&times; {line.menuItemName}{line.variantName ? ` · ${line.variantName}` : ''}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {canEdit && <button disabled={busyId === line.id} onClick={() => editExisting(line)} title="Change size / add-ons" className="text-muted-foreground hover:text-secondary"><LuPencil className="size-3.5" /></button>}
                          <button disabled={busyId === line.id} onClick={() => void removeExisting(line)} title="Remove line" className="text-muted-foreground hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                        </div>
                      </div>
                      {line.addons.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">{line.addons.map((a) => a.name).join(', ')}</p>}
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button disabled={busyId === line.id || line.quantity <= 1} onClick={() => void patchExisting(line, { quantity: line.quantity - 1 })} className="rounded-sm border bg-background p-1 disabled:opacity-30"><LuMinus className="size-3" /></button>
                        <span className="w-5 text-center text-xs font-medium">{line.quantity}</span>
                        <button disabled={busyId === line.id} onClick={() => void patchExisting(line, { quantity: line.quantity + 1 })} className="rounded-sm border bg-background p-1"><LuPlus className="size-3" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {cart.length > 0 && (
              <>
                <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adding</p>
                <div className="space-y-2">
                  {cart.map((line) => (
                    <div key={line.key} className="rounded-sm border border-accent/40 bg-accent/5 p-2.5">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{line.item.name}{line.variant ? ` · ${line.variant.name}` : ''}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {needsCustomize(line.item, allAddons.length) && <button onClick={() => setEditingNew(line)} title="Change size / add-ons" className="text-muted-foreground hover:text-secondary"><LuPencil className="size-3.5" /></button>}
                          <button onClick={() => changeNewQty(line.key, -line.quantity)} className="text-muted-foreground hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                        </div>
                      </div>
                      {line.addons.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">{line.addons.map((a) => a.name).join(', ')}</p>}
                      <div className="mt-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => changeNewQty(line.key, -1)} className="rounded-sm border bg-background p-1"><LuMinus className="size-3" /></button>
                          <span className="w-5 text-center text-xs font-medium">{line.quantity}</span>
                          <button onClick={() => changeNewQty(line.key, 1)} className="rounded-sm border bg-background p-1"><LuPlus className="size-3" /></button>
                        </div>
                        <span className="text-xs font-semibold">{formatKes(lineTotal(line))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <span className="text-sm font-semibold">{cart.length > 0 ? `Adding: ${formatKes(addingTotal)}` : 'Line changes save as you make them'}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Done</button>
            <button disabled={!cart.length || submitting} onClick={() => void submitAdds()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {submitting && <LuLoaderCircle className="animate-spin" />} Add to order
            </button>
          </div>
        </div>
      </div>

      {customizing && (
        <CustomizeModal
          item={customizing}
          allAddons={allAddons}
          onClose={() => setCustomizing(null)}
          onSubmit={(variant, addons, quantity) => { addConfiguredLine(customizing, variant, addons, quantity); setCustomizing(null) }}
        />
      )}

      {editingNew && (
        <CustomizeModal
          item={editingNew.item}
          allAddons={allAddons}
          initial={{ variantId: editingNew.variant?.id ?? null, addonIds: editingNew.addons.map((a) => a.id), quantity: editingNew.quantity }}
          onClose={() => setEditingNew(null)}
          onSubmit={(variant, addons, quantity) => { replaceNewLine(editingNew.key, variant, addons, quantity); setEditingNew(null) }}
        />
      )}

      {editingExisting && editingExistingItem && (
        <CustomizeModal
          item={editingExistingItem}
          allAddons={allAddons}
          initial={{ variantId: editingExisting.variantId, addonIds: editingExisting.addons.map((a) => a.id), quantity: editingExisting.quantity }}
          onClose={() => setEditingExisting(null)}
          onSubmit={(variant, addons, quantity) => {
            const target = editingExisting
            setEditingExisting(null)
            void patchExisting(target, { variantId: variant?.id ?? null, quantity, addons: addons.map((a) => ({ addonId: a.id, quantity: 1 })) })
          }}
        />
      )}
    </div>
  )
}
