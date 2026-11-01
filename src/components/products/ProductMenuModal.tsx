import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { LuCircleCheck, LuLink, LuLoaderCircle, LuPlus } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import { cn } from '@/lib/utils'

export type MenuProduct = {
  id: string
  name: string
  unit: string
  packSize: string | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
  sellingPrice: string | null
  stockByLocation: { locationId: string; quantity: string }[]
}
export type MenuCategory = { id: string; name: string; isActive: boolean }
type Location = { id: string; name: string; type?: string; isActive?: boolean; canSellMenu?: boolean }
type MenuItem = {
  id: string
  name: string
  price: string
  productId: string | null
  recipeId: string | null
  stockQtyPerUnit: string | null
  product: { id: string; name: string } | null
  recipe: { id: string; name: string } | null
  menuCategory: { id: string; name: string }
  locations: { id: string; name: string }[]
  variants: { name: string; price: string; stockProductId: string | null }[]
  _count: { variants: number }
}

const money = (v: string | number) => `KSh ${Number(v).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

// Sizes, containers and filler words say nothing about *what* a thing is -
// "4TH Street White Wine 5L" and "4TH Street White 750ML" are the same wine.
const NOISE = new Set(['ml', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'tot', 'tots', 'bottle', 'bottles', 'btl', 'can', 'cans', 'glass', 'glasses', 'pkt', 'packet', 'piece', 'the', 'and', 'with'])
function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\d+(\.\d+)?\s*(ml|cl|ltrs?|litres?|l|kg|gms?|g)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w))
}
// "tequilla" / "tequila", "pineapple" / "pineapples" are the same word; "bull" / "bulleit" and "cola" / "cold" are not.
function sameWord(a: string, b: string) {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  const extra = long.length - short.length
  return short.length >= 4 && extra >= 1 && extra <= 2 && long.startsWith(short.slice(0, -1))
}
/** Which menu items look like the product, best first. Each product word counts by how rare it
 * is on the menu, so a brand ("Olmeca") outweighs a word half the menu shares ("clear", "white"). */
function similarItems<T extends { name: string }>(productName: string, items: T[]): T[] {
  const productWords = words(productName)
  const itemWords = items.map((item) => words(item.name))
  const weight = new Map(productWords.map((w) => [w, 1 / Math.max(1, itemWords.filter((iw) => iw.some((x) => sameWord(w, x))).length)]))
  const total = productWords.reduce((sum, w) => sum + (weight.get(w) ?? 0), 0)
  if (total === 0) return []
  return items
    .map((item, i) => ({ item, score: productWords.filter((w) => itemWords[i].some((x) => sameWord(w, x))).reduce((sum, w) => sum + (weight.get(w) ?? 0), 0) / total }))
    .filter((m) => m.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 8)
    .map((m) => m.item)
}

const usesProduct = (item: MenuItem, productId: string) => item.productId === productId || item.variants.some((v) => v.stockProductId === productId)
function stockText(item: MenuItem): string {
  if (item.product) return `Uses ${item.product.name}`
  if (item.recipe) return `Recipe: ${item.recipe.name}`
  if (item.variants.some((v) => v.stockProductId)) return 'Its sizes use their own products'
  return "Doesn't track stock"
}
// Linking sets the item's one product. Recipes and items with sizes are set up in Menu Items instead.
const canLink = (item: MenuItem) => !item.productId && !item.recipeId && item._count.variants === 0

/**
 * Products and menu items are separate layers: the bar sells a menu item, and
 * selling it takes a set amount of a product out of stock. This puts a product
 * on the menu from the product side, without making a duplicate: it shows the
 * menu items already using it, then ones with a similar name (an untracked one
 * can be linked right here), and only then offers a new menu item. Recipes stay
 * in Menu Items - this only covers "consumes a set amount of one product".
 */
export default function ProductMenuModal({ product, categories, locations, onClose }: {
  product: MenuProduct
  categories: MenuCategory[]
  locations: Location[]
  onClose: () => void
}) {
  const toast = useToast()
  const [items, setItems] = useState<MenuItem[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)
  const [linkQty, setLinkQty] = useState<Record<string, string>>({})
  const [linkingId, setLinkingId] = useState('')
  const stockUnit = product.packUnit?.name ?? product.unit
  const packHint = product.packSize && product.packUnit ? `1 ${product.packLabel || 'pack'} = ${Number(product.packSize).toLocaleString()} ${product.packUnit.name}` : null

  const sellingPoints = useMemo(() => locations.filter((l) => l.isActive !== false && l.canSellMenu !== false && l.type !== 'STORE'), [locations])
  const stocked = new Set(product.stockByLocation.filter((s) => Number(s.quantity) > 0).map((s) => s.locationId))
  const [form, setForm] = useState({
    name: product.name,
    menuCategoryId: '',
    price: product.sellingPrice ? String(Number(product.sellingPrice)) : '',
    qty: '1',
    // Start with the selling points that already hold this product.
    locationIds: sellingPoints.filter((l) => stocked.has(l.id)).map((l) => l.id),
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const r = await api<{ items: MenuItem[] }>('/menu-items')
      setItems(r.items)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Could not load the menu')
    }
  }
  useEffect(() => { void load() }, [])

  const linked = useMemo(() => (items ?? []).filter((item) => usesProduct(item, product.id)), [items, product.id])
  const similar = useMemo(() => similarItems(product.name, (items ?? []).filter((item) => !usesProduct(item, product.id))), [items, product.id, product.name])
  const showForm = creating || (items !== null && linked.length === 0 && similar.length === 0)

  async function link(item: MenuItem) {
    const qty = Number(linkQty[item.id] ?? '1')
    if (!(qty > 0)) { toast.error('Enter how much one sale uses'); return }
    setLinkingId(item.id)
    try {
      await api(`/menu-items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ productId: product.id, stockQtyPerUnit: qty }) })
      toast.success(`${item.name} now uses ${product.name}.`)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not link the menu item')
    } finally {
      setLinkingId('')
    }
  }

  const duplicateName = (items ?? []).find((item) => item.name.trim().toLowerCase() === form.name.trim().toLowerCase())
  const canSave = Boolean(form.name.trim() && form.menuCategoryId && form.price !== '' && Number(form.qty) > 0 && !duplicateName && !saving)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      await api('/menu-items', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          menuCategoryId: form.menuCategoryId,
          price: Number(form.price),
          productId: product.id,
          stockQtyPerUnit: Number(form.qty),
          locationIds: form.locationIds,
        }),
      })
      toast.success(`${form.name.trim()} added to the menu.`)
      setCreating(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create the menu item')
    } finally {
      setSaving(false)
    }
  }

  const toggleLocation = (id: string) => setForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }))

  return (
    <ModalShell
      size="lg"
      kicker="Sell on the menu"
      title={product.name}
      subtitle="Menu items are what the till sells; each sale takes a set amount of this product out of stock."
      onClose={onClose}
      footer={showForm ? (
        <>
          <button type="button" onClick={() => (creating ? setCreating(false) : onClose())} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">{creating ? 'Back' : 'Close'}</button>
          <button form="product-menu-form" disabled={!canSave} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />}
            Create menu item
          </button>
        </>
      ) : undefined}
    >
      {loadError ? (
        <p className="p-5 text-sm text-destructive">{loadError}</p>
      ) : items === null ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Checking the menu…</div>
      ) : showForm ? (
        <form id="product-menu-form" onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2">
          {linked.length === 0 && similar.length === 0 && (
            <p className="flex items-center gap-2 border bg-muted/40 p-3 text-sm text-muted-foreground sm:col-span-2"><LuCircleCheck className="shrink-0 text-success" /> No menu item uses this product or has a similar name, so a new one won't be a duplicate.</p>
          )}
          <Field label="Menu item name" required className="sm:col-span-2">
            <input required autoFocus className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {duplicateName && <span className="mt-1 block text-xs text-destructive">"{duplicateName.name}" is already on the menu - link it instead, or use a different name.</span>}
          </Field>
          <Field label="Menu category" required>
            <select required className="input" value={form.menuCategoryId} onChange={(e) => setForm({ ...form, menuCategoryId: e.target.value })}>
              <option value="">Select a category</option>
              {categories.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Selling price (KSh)" required>
            <input required type="number" min="0" step="0.01" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          <Field label="Each sale uses" required className="sm:col-span-2">
            <input required type="number" min="0" step="0.001" className="input" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            <span className="mt-1 block text-xs text-muted-foreground">In {stockUnit} of {product.name}{packHint ? ` - ${packHint}` : ''}</span>
          </Field>
          {sellingPoints.length > 0 && (
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Available at</span>
              <p className="mb-2 text-xs text-muted-foreground">Leave all unchecked to sell it everywhere. Ticked: where this product is in stock.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {sellingPoints.map((l) => (
                  <label key={l.id} className="flex items-center justify-between rounded-sm border bg-background px-3 py-2 text-sm">
                    <span>{l.name}{l.type ? <span className="text-muted-foreground"> ({l.type})</span> : null}</span>
                    <input type="checkbox" checked={form.locationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} className="size-4 accent-secondary" />
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground sm:col-span-2">Tax, photo, sizes and the rest can be set later under Menu Items.</p>
        </form>
      ) : (
        <div className="space-y-5 p-5">
          {linked.length > 0 && (
            <Section title="Already on the menu">
              {linked.map((item) => (
                <Row key={item.id} item={item}>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><LuCircleCheck /> Uses this product</span>
                </Row>
              ))}
            </Section>
          )}
          {similar.length > 0 && (
            <Section title="Similar menu items - is it one of these?">
              {similar.map((item) => (
                <Row key={item.id} item={item}>
                  {canLink(item) ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min="0" step="0.001" title={`How much one sale uses, in ${stockUnit}`}
                        value={linkQty[item.id] ?? '1'}
                        onChange={(e) => setLinkQty((q) => ({ ...q, [item.id]: e.target.value }))}
                        className="input h-9 w-20"
                      />
                      <span className="text-xs text-muted-foreground">{stockUnit}</span>
                      <button type="button" onClick={() => void link(item)} disabled={linkingId === item.id} className="inline-flex items-center gap-1.5 bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-secondary-foreground disabled:opacity-60">
                        {linkingId === item.id ? <LuLoaderCircle className="animate-spin" /> : <LuLink />} Link
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Change it in Menu Items</span>
                  )}
                </Row>
              ))}
              <p className="text-xs text-muted-foreground">If one of these already uses another product that is the same thing, that product may be a duplicate of this one.</p>
            </Section>
          )}
          <button type="button" onClick={() => setCreating(true)} className="inline-flex w-full items-center justify-center gap-2 border-2 border-dashed border-foreground/25 px-4 py-3 text-sm font-semibold hover:bg-muted">
            <LuPlus /> {linked.length > 0 ? 'Add another menu item for it (e.g. a tot and a bottle)' : 'None of these - create a new menu item'}
          </button>
        </div>
      )}
    </ModalShell>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ item, children }: { item: MenuItem; children: ReactNode }) {
  const where = item.locations.length ? item.locations.map((l) => l.name).join(', ') : 'All locations'
  return (
    <div className={cn('flex flex-col gap-2 border bg-background p-3 sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0">
        <p className="font-semibold">{item.name} <span className="font-normal text-muted-foreground">· {money(item.price)}</span></p>
        <p className="text-xs text-muted-foreground">{item.menuCategory.name} · {where} · {stockText(item)}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block text-sm font-medium', className)}>
      <span className="mb-1.5 block">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  )
}
