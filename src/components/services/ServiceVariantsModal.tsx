import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuChevronDown, LuChevronUp, LuLoaderCircle, LuPencil, LuPower, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import VariantStockEditor, { emptyVariantStock, stockFromVariant, stockPayload, type RecipeInfo, type VariantStock } from '@/components/menu/VariantStockEditor'

export type ServiceVariant = {
  id: string
  name: string
  sku: string | null
  price: string | number
  durationMinutes: number | null
  cost: string | number | null
  stockProductId: string | null
  stockQtyPerUnit: string | null
  recipeId: string | null
  recipe: { id: string; name: string } | null
  stockProduct: { id: string; name: string; unit: string } | null
  ingredientOverrides: { productId: string; quantity: string | number; isRemoved: boolean; product: { id: string; name: string; unit: string } }[]
  isActive: boolean
}
type Draft = { name: string; price: string; duration: string; cost: string; sku: string; stock: VariantStock }
const emptyDraft: Draft = { name: '', price: '', duration: '', cost: '', sku: '', stock: emptyVariantStock }
const money = (v: string | number) => `KSh ${Number(v).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

const payloadOf = (d: Draft) => ({
  name: d.name.trim(),
  price: Number(d.price),
  durationMinutes: d.duration.trim() === '' ? null : Number(d.duration),
  // Blank cost = not costed (null), never 0.
  cost: d.cost.trim() === '' ? null : Number(d.cost),
  sku: d.sku.trim() || undefined,
  ...stockPayload(d.stock),
})

/** Sizes/options of one service: Swedish massage 30 / 60 mins, car wash Saloon / SUV / Van. Each has its own price, optional duration, cost and stock. */
export default function ServiceVariantsModal({ service, productOptions, recipes, onClose, onChanged }: {
  service: { id: string; name: string; price: string | number }
  productOptions: { value: string; label: string; hint?: string }[]
  recipes: RecipeInfo[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const toast = useToast()
  const [variants, setVariants] = useState<ServiceVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)

  const load = useCallback(async () => {
    setLoading(true)
    try { setVariants((await api<{ variants: ServiceVariant[] }>(`/services/${service.id}/variants`)).variants) }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not load options') }
    finally { setLoading(false) }
  }, [service.id, toast])
  useEffect(() => { void load() }, [load])

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true)
    try { await action(); await load(); await onChanged() }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : failure) }
    finally { setBusy(false) }
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.name.trim() || draft.price === '') return
    void run(async () => { await api(`/services/${service.id}/variants`, { method: 'POST', body: JSON.stringify(payloadOf(draft)) }); setDraft(emptyDraft) }, 'Could not add the option')
  }
  const saveEdit = (id: string) => {
    if (!editDraft.name.trim() || editDraft.price === '') return
    void run(async () => { await api(`/services/${service.id}/variants/${id}`, { method: 'PATCH', body: JSON.stringify(payloadOf(editDraft)) }); setEditingId(null) }, 'Could not update the option')
  }
  const move = (index: number, delta: number) => {
    const ids = variants.map((v) => v.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void run(() => api(`/services/${service.id}/variants/reorder`, { method: 'POST', body: JSON.stringify({ orderedIds: ids }) }), 'Could not reorder')
  }

  const fields = (d: Draft, set: (d: Draft) => void) => (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem_6rem]">
        <label className="col-span-2 text-xs font-medium sm:col-span-1">Name<input required value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} placeholder="60 mins / SUV" className="input mt-1" /></label>
        <label className="text-xs font-medium">Price<input required type="number" min="0" step="0.01" value={d.price} onChange={(e) => set({ ...d, price: e.target.value })} className="input mt-1" /></label>
        <label className="text-xs font-medium">Minutes<input type="number" min="1" step="1" value={d.duration} onChange={(e) => set({ ...d, duration: e.target.value })} placeholder="opt." className="input mt-1" /></label>
        <label className="text-xs font-medium">Cost<input type="number" min="0" step="0.01" value={d.cost} onChange={(e) => set({ ...d, cost: e.target.value })} placeholder="opt." className="input mt-1" /></label>
      </div>
      <VariantStockEditor value={d.stock} onChange={(stock) => set({ ...d, stock })} productOptions={productOptions} recipes={recipes} label="Stock this option uses (e.g. a bottle of lotion)" />
    </div>
  )

  return (
    <ModalShell kicker="Options" title={service.name} subtitle="Sizes and durations with their own price. Not add-ons." onClose={onClose} size="lg">
      <div className="space-y-5 p-5">
        <form onSubmit={add} className="space-y-3 border bg-muted/20 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">New option</p>
          {fields(draft, setDraft)}
          <button disabled={busy || !draft.name.trim() || draft.price === ''} className="rounded-sm bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">Add option</button>
        </form>

        <div className="space-y-2">
          {loading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
            : variants.length === 0 ? <p className="border border-dashed p-4 text-center text-sm text-muted-foreground">No options: the base price of <span className="font-semibold text-foreground">{money(service.price)}</span> is used.</p>
            : variants.map((v, index) => (
              <div key={v.id} className={cn('border p-3', !v.isActive && 'opacity-60')}>
                {editingId === v.id ? (
                  <div className="space-y-3">
                    {fields(editDraft, setEditDraft)}
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => saveEdit(v.id)} className="rounded-sm bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} className="text-muted-foreground hover:bg-muted disabled:opacity-20"><LuChevronUp className="size-3.5" /></button>
                      <button type="button" onClick={() => move(index, 1)} disabled={busy || index === variants.length - 1} className="text-muted-foreground hover:bg-muted disabled:opacity-20"><LuChevronDown className="size-3.5" /></button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{v.name}{v.durationMinutes ? <span className="ml-2 text-xs font-normal text-muted-foreground">{v.durationMinutes} min</span> : null}</p>
                      {v.cost != null && <p className="text-xs text-muted-foreground">Cost {money(v.cost)}</p>}
                      {v.stockProduct && <p className="truncate text-xs text-secondary">→ {v.stockQtyPerUnit != null ? Number(v.stockQtyPerUnit).toLocaleString() : 1} {v.stockProduct.unit} of {v.stockProduct.name}</p>}
                      {v.recipe && <p className="truncate text-xs text-secondary">→ recipe: {v.recipe.name}{v.ingredientOverrides.length > 0 ? ` (${v.ingredientOverrides.length} changed)` : ''}</p>}
                    </div>
                    <span className="text-sm font-medium tabular-nums">{money(v.price)}</span>
                    <button type="button" title={v.isActive ? 'Deactivate' : 'Activate'} disabled={busy} onClick={() => void run(() => api(`/services/${service.id}/variants/${v.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !v.isActive }) }), 'Could not update')} className={cn('p-1.5 hover:bg-muted', v.isActive ? 'text-muted-foreground' : 'text-warning')}><LuPower className="size-3.5" /></button>
                    <button type="button" title="Edit" onClick={() => { setEditingId(v.id); setEditDraft({ name: v.name, price: String(Number(v.price)), duration: v.durationMinutes ? String(v.durationMinutes) : '', cost: v.cost != null ? String(Number(v.cost)) : '', sku: v.sku ?? '', stock: stockFromVariant(v) }) }} className="p-1.5 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-3.5" /></button>
                    <button type="button" title="Delete" onClick={() => { if (window.confirm(`Delete the "${v.name}" option?`)) void run(() => api(`/services/${service.id}/variants/${v.id}`, { method: 'DELETE' }), 'Could not delete') }} className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </ModalShell>
  )
}
