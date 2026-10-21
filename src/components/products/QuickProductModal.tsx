import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import { PRODUCT_TAG_OPTIONS } from '@/lib/productTags'
import { cn } from '@/lib/utils'
import PackQtyInput from '@/components/ui/PackQtyInput'
import { QuickNewButton } from '@/components/QuickAddModal'

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
type Location = { id: string; name: string; isActive?: boolean }

/**
 * Create a stock product without leaving the form that needs one (a menu item,
 * a recipe's ingredient). What a product needs to be usable straight away - name,
 * unit (a new one can be added inline), packs for bottles/kegs and opening
 * stock - the rest is filled in later under Products.
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
  // Stored in the measured unit (the pack unit when tracked in packs), like the Products page.
  const [openingStock, setOpeningStock] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [locationId, setLocationId] = useState('')
  // Which unit picker a new unit of measure is being typed for.
  const [newUnitFor, setNewUnitFor] = useState<'unit' | 'pack' | null>(null)
  const [newUnitName, setNewUnitName] = useState('')
  const [savingUnit, setSavingUnit] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ units: Unit[] }>('/units-of-measure').then((r) => {
      setUnits(r.units)
      setUnit((cur) => cur || (r.units.find((u) => u.name.toLowerCase() === 'each') ?? r.units[0])?.name || 'Each')
    }).catch(() => setUnit((cur) => cur || 'Each'))
    api<{ categories: Category[] }>('/categories?scope=STORE').then((r) => setCategories(r.categories)).catch(() => {})
    api<{ locations: Location[] }>('/locations').then((r) => {
      const active = r.locations.filter((l) => l.isActive !== false)
      setLocations(active)
      if (active.length === 1) setLocationId(active[0].id)
    }).catch(() => {})
  }, [])

  async function createUnit() {
    const unitName = newUnitName.trim()
    if (!unitName || savingUnit || !newUnitFor) return
    setSavingUnit(true)
    try {
      const { unit: created } = await api<{ unit: Unit }>('/units-of-measure', { method: 'POST', body: JSON.stringify({ name: unitName }) })
      setUnits((cur) => [...cur, created].sort((a, b) => a.name.localeCompare(b.name)))
      if (newUnitFor === 'unit') setUnit(created.name)
      else setPackUnitId(created.id)
      setNewUnitFor(null)
      setNewUnitName('')
      toast.success(`Unit "${created.name}" added.`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add the unit')
    } finally {
      setSavingUnit(false)
    }
  }

  const packSizeNum = inPacks ? Number(packSize) || 0 : 0
  const stockUnitName = (inPacks && units.find((u) => u.id === packUnitId)?.name) || unit
  const hasOpeningStock = Number(openingStock) > 0
  const packIncomplete = inPacks && (!packLabel.trim() || !(Number(packSize) > 0) || !packUnitId)
  const canSave = Boolean(name.trim() && unit && !packIncomplete && !(hasOpeningStock && !locationId) && !saving)

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
          openingStock: openingStock || 0,
          locationId: hasOpeningStock ? locationId : undefined,
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
          <div className="flex gap-2">
            <select required className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {!units.some((u) => u.name === unit) && unit && <option value={unit}>{unit}</option>}
              {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <QuickNewButton title="Add a unit of measure" onClick={() => { setNewUnitFor('unit'); setNewUnitName('') }} />
          </div>
        </Field>
        {newUnitFor && (
          <div className="flex items-end gap-2 border bg-muted/40 p-3 sm:col-span-2">
            <label className="min-w-0 flex-1 text-sm font-medium">
              <span className="mb-1.5 block">New unit of measure{newUnitFor === 'pack' ? ' (what one pack is measured in)' : ''}</span>
              <input
                autoFocus
                className="input"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                // Enter adds the unit - it must not submit the product form.
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createUnit() } }}
                placeholder="e.g. ml, kg, crate"
              />
            </label>
            <button type="button" onClick={() => setNewUnitFor(null)} className="h-10 shrink-0 border px-3 text-xs font-semibold hover:bg-muted">Cancel</button>
            <button type="button" onClick={() => void createUnit()} disabled={!newUnitName.trim() || savingUnit} className="inline-flex h-10 shrink-0 items-center gap-2 bg-primary px-3 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
              {savingUnit && <LuLoaderCircle className="animate-spin" />}
              Add unit
            </button>
          </div>
        )}
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
              <div className="flex gap-2">
                <select className="input" value={packUnitId} onChange={(e) => setPackUnitId(e.target.value)}>
                  <option value="">Select a unit of measure…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <QuickNewButton title="Add a unit of measure" onClick={() => { setNewUnitFor('pack'); setNewUnitName('') }} />
              </div>
            </Field>
          </>
        )}

        <Field label="Opening stock">
          <PackQtyInput value={openingStock} onChange={setOpeningStock} packSize={packSizeNum} packLabel={packLabel} unitName={stockUnitName} />
        </Field>
        <Field label="Received at" required={hasOpeningStock}>
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!hasOpeningStock}>
            <option value="">{hasOpeningStock ? 'Select a location' : 'Enter opening stock first'}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Unit cost (KSh)"><input type="number" min="0" step="0.01" className="input" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Optional" /></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">It's selected for you as soon as it's created. Reorder levels, supplier and the rest can be added later under Products.</p>
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
