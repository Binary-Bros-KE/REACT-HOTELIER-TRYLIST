import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import { PRODUCT_TAG_OPTIONS } from '@/lib/productTags'
import { cn } from '@/lib/utils'

export type QuickProduct = {
  id: string
  name: string
  unit: string
  packSize: string | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
}

type Unit = { id: string; name: string }
type Category = { id: string; name: string }

/**
 * Create a stock product without leaving the form that needs one (a menu item,
 * a recipe's ingredient). Only what a product can't do without - name and unit,
 * plus packs for bottles/kegs - the rest is filled in later under Products.
 * Saves through the same POST /products the Products page uses and opens above
 * any other modal ("top" layer), since it can be launched from a stacked one.
 */
export default function QuickProductModal({ initialName = '', onClose, onCreated }: { initialName?: string; onClose: () => void; onCreated: (product: QuickProduct) => void }) {
  const toast = useToast()
  const [units, setUnits] = useState<Unit[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState(initialName)
  const [unit, setUnit] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [inPacks, setInPacks] = useState(false)
  const [packLabel, setPackLabel] = useState('')
  const [packSize, setPackSize] = useState('')
  const [packUnitId, setPackUnitId] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ units: Unit[] }>('/units-of-measure').then((r) => {
      setUnits(r.units)
      setUnit((cur) => cur || (r.units.find((u) => u.name.toLowerCase() === 'each') ?? r.units[0])?.name || 'Each')
    }).catch(() => setUnit((cur) => cur || 'Each'))
    api<{ categories: Category[] }>('/categories?scope=STORE').then((r) => setCategories(r.categories)).catch(() => {})
  }, [])

  const packIncomplete = inPacks && (!packLabel.trim() || !(Number(packSize) > 0) || !packUnitId)
  const canSave = Boolean(name.trim() && unit && !packIncomplete && !saving)

  async function submit(event: FormEvent) {
    event.preventDefault()
    // Opened from inside another form - don't let this submit reach it.
    event.stopPropagation()
    if (!canSave) return
    setSaving(true)
    try {
      const { product } = await api<{ product: QuickProduct }>('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          unit,
          categoryId: categoryId || undefined,
          tags,
          unitCost: unitCost || undefined,
          ...(inPacks ? { packLabel: packLabel.trim(), packSize, packUnitId } : {}),
        }),
      })
      toast.success(`${product.name} created.`)
      onCreated(product)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create the product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      size="md"
      stacked="top"
      kicker="Quick add"
      title="New product"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <button form="quick-product-form" disabled={!canSave} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />}
            Create product
          </button>
        </>
      }
    >
      <form id="quick-product-form" onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input required autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tusker Lager 500ml" />
        </Field>
        <Field label="Unit of measure" required>
          <select required className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {!units.some((u) => u.name === unit) && unit && <option value={unit}>{unit}</option>}
            {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">Used at</span>
          <div className="flex flex-wrap gap-1.5">
            {PRODUCT_TAG_OPTIONS.map((option) => {
              const on = tags.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTags((cur) => (on ? cur.filter((t) => t !== option.value) : [...cur, option.value]))}
                  className={cn('border px-2.5 py-1 text-xs font-semibold', on ? 'border-secondary bg-secondary/10 text-secondary' : 'hover:bg-muted')}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium sm:col-span-2">
          <input type="checkbox" checked={inPacks} onChange={(e) => setInPacks(e.target.checked)} className="size-4 accent-secondary" />
          Tracked in packs (bottles, cans, kegs)
        </label>
        {inPacks && (
          <>
            <Field label="Pack label" required><input className="input" value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="e.g. bottle" /></Field>
            <Field label="Contains (per pack)" required><input type="number" min="0" step="0.001" className="input" value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="e.g. 750" /></Field>
            <Field label="Measured in" required className="sm:col-span-2">
              <select className="input" value={packUnitId} onChange={(e) => setPackUnitId(e.target.value)}>
                <option value="">Select a unit of measure…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </>
        )}

        <Field label="Unit cost (KSh)"><input type="number" min="0" step="0.01" className="input" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Optional" /></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">It's selected for you as soon as it's created. Add stock, reorder levels and the rest later under Products.</p>
      </form>
    </ModalShell>
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
