import { useMemo, useState } from 'react'
import { LuPlus, LuRotateCcw, LuX } from 'react-icons/lu'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { cn } from '@/lib/utils'

export type RecipeInfo = { id: string; name: string; ingredients?: { quantity: string | number; product: { id: string; name: string; unit: string } }[] }
type Override = { productId: string; name: string; unit: string; quantity: string; isRemoved: boolean }
export type VariantStock = {
  mode: 'none' | 'product' | 'recipe'
  stockProductId: string
  stockQtyPerUnit: string
  recipeId: string
  /** Only what differs from the recipe: a changed quantity, a removed ingredient, or an extra one. */
  overrides: Override[]
}
export const emptyVariantStock: VariantStock = { mode: 'none', stockProductId: '', stockQtyPerUnit: '', recipeId: '', overrides: [] }

/** Exactly what the API stores for a variant's stock. */
export function stockPayload(stock: VariantStock) {
  if (stock.mode === 'product' && stock.stockProductId) {
    return { stockProductId: stock.stockProductId, stockQtyPerUnit: stock.stockQtyPerUnit !== '' ? Number(stock.stockQtyPerUnit) : null, recipeId: null, ingredientOverrides: [] }
  }
  if (stock.mode === 'recipe' && stock.recipeId) {
    return {
      stockProductId: null, stockQtyPerUnit: null, recipeId: stock.recipeId,
      ingredientOverrides: stock.overrides.map((o) => ({ productId: o.productId, quantity: o.isRemoved ? 0 : Number(o.quantity) || 0, isRemoved: o.isRemoved })),
    }
  }
  return { stockProductId: null, stockQtyPerUnit: null, recipeId: null, ingredientOverrides: [] }
}

type ApiVariantStock = {
  stockProductId: string | null
  stockQtyPerUnit: string | null
  recipeId?: string | null
  ingredientOverrides?: { productId: string; quantity: string | number; isRemoved: boolean; product: { id: string; name: string; unit: string } }[]
}
export function stockFromVariant(v: ApiVariantStock): VariantStock {
  if (v.recipeId) {
    return {
      mode: 'recipe', stockProductId: '', stockQtyPerUnit: '', recipeId: v.recipeId,
      overrides: (v.ingredientOverrides ?? []).map((o) => ({ productId: o.productId, name: o.product.name, unit: o.product.unit, quantity: String(Number(o.quantity)), isRemoved: o.isRemoved })),
    }
  }
  if (v.stockProductId) return { mode: 'product', stockProductId: v.stockProductId, stockQtyPerUnit: v.stockQtyPerUnit != null ? String(Number(v.stockQtyPerUnit)) : '', recipeId: '', overrides: [] }
  return emptyVariantStock
}

const num = (v: string | number) => Number(v).toLocaleString('en-KE', { maximumFractionDigits: 3 })

/**
 * One variant's stock: nothing, one product and an amount (a 25 ml tot), or a
 * recipe. With a recipe, every ingredient shows its own quantity for THIS
 * variant - change it, remove it, or add another - so a Large is whatever you
 * type, never a multiple of the base recipe. Different recipe per size works too:
 * just pick another recipe.
 */
export default function VariantStockEditor({ value, onChange, productOptions, recipes, allowOverrides = true, label = 'Stock this variant uses' }: {
  value: VariantStock
  onChange: (next: VariantStock) => void
  productOptions: { value: string; label: string; hint?: string }[]
  recipes: RecipeInfo[]
  /** Off for a service's own stock: it just picks a recipe, with no per-ingredient changes. */
  allowOverrides?: boolean
  label?: string
}) {
  const [extraProduct, setExtraProduct] = useState('')
  const recipe = recipes.find((r) => r.id === value.recipeId)
  const recipeOptions = useMemo(() => recipes.map((r) => ({ value: r.id, label: r.name })), [recipes])
  const overrideOf = (productId: string) => value.overrides.find((o) => o.productId === productId)
  const setOverride = (next: Override | null, productId: string) =>
    onChange({ ...value, overrides: [...value.overrides.filter((o) => o.productId !== productId), ...(next ? [next] : [])] })
  const recipeIds = new Set((recipe?.ingredients ?? []).map((i) => i.product.id))
  const extras = value.overrides.filter((o) => !recipeIds.has(o.productId))

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium">{label}
        <select className="input mt-1" value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as VariantStock['mode'], overrides: [] })}>
          <option value="none">Doesn&apos;t change stock (uses the item&apos;s own)</option>
          <option value="product">A set amount of one product (e.g. 25 ml tot)</option>
          <option value="recipe">A recipe, with this variant&apos;s own quantities</option>
        </select>
      </label>

      {value.mode === 'product' && (
        <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
          <label className="text-xs font-medium">Product
            <span className="mt-1 block">
              <SearchableSelect options={productOptions} value={value.stockProductId} onChange={(v) => onChange({ ...value, stockProductId: v })} placeholder="Select a product" searchPlaceholder="Search products…" emptyText="No products match." />
            </span>
          </label>
          <label className="text-xs font-medium">Consumes
            <input type="number" min="0" step="0.001" placeholder="e.g. 25" value={value.stockQtyPerUnit} onChange={(e) => onChange({ ...value, stockQtyPerUnit: e.target.value })} className="input mt-1" />
          </label>
        </div>
      )}

      {value.mode === 'recipe' && (
        <div className="space-y-2 border bg-muted/30 p-3">
          <label className="block text-xs font-medium">Recipe
            <span className="mt-1 block">
              <SearchableSelect options={recipeOptions} value={value.recipeId} onChange={(v) => onChange({ ...value, recipeId: v, overrides: [] })} placeholder={recipeOptions.length ? 'Select a recipe' : 'No recipes yet - add one under Kitchen > Recipes'} searchPlaceholder="Search recipes…" emptyText="No recipes match." />
            </span>
          </label>

          {recipe && allowOverrides && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ingredients for this variant</p>
                {value.overrides.length > 0 && <button type="button" onClick={() => onChange({ ...value, overrides: [] })} className="flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"><LuRotateCcw className="size-3" /> Reset to recipe</button>}
              </div>
              <div className="divide-y border bg-card">
                {(recipe.ingredients ?? []).map((ing) => {
                  const o = overrideOf(ing.product.id)
                  const removed = o?.isRemoved ?? false
                  const shown = o && !o.isRemoved ? o.quantity : String(Number(ing.quantity))
                  return (
                    <div key={ing.product.id} className={cn('flex items-center gap-2 px-2.5 py-1.5 text-sm', removed && 'bg-muted/50')}>
                      <span className={cn('min-w-0 flex-1 truncate', removed && 'text-muted-foreground line-through')}>{ing.product.name}</span>
                      {removed ? (
                        <button type="button" onClick={() => setOverride(null, ing.product.id)} className="text-xs font-semibold text-secondary hover:underline">Restore</button>
                      ) : (
                        <>
                          <input
                            type="number" min="0" step="0.001" value={shown}
                            onChange={(e) => setOverride(e.target.value === String(Number(ing.quantity)) ? null : { productId: ing.product.id, name: ing.product.name, unit: ing.product.unit, quantity: e.target.value, isRemoved: false }, ing.product.id)}
                            className={cn('input h-8 w-24 text-right', o && 'border-secondary')}
                          />
                          <span className="w-10 text-xs text-muted-foreground">{ing.product.unit}</span>
                          <button type="button" title="Leave this ingredient out" onClick={() => setOverride({ productId: ing.product.id, name: ing.product.name, unit: ing.product.unit, quantity: '0', isRemoved: true }, ing.product.id)} className="text-muted-foreground hover:text-destructive"><LuX className="size-4" /></button>
                        </>
                      )}
                      {!removed && o && <span className="w-16 text-right text-[10px] text-muted-foreground">recipe: {num(ing.quantity)}</span>}
                    </div>
                  )
                })}
                {extras.map((o) => (
                  <div key={o.productId} className="flex items-center gap-2 bg-secondary/5 px-2.5 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{o.name} <span className="text-[10px] uppercase text-secondary">extra</span></span>
                    <input type="number" min="0" step="0.001" value={o.quantity} onChange={(e) => setOverride({ ...o, quantity: e.target.value }, o.productId)} className="input h-8 w-24 border-secondary text-right" />
                    <span className="w-10 text-xs text-muted-foreground">{o.unit}</span>
                    <button type="button" title="Remove this extra" onClick={() => setOverride(null, o.productId)} className="text-muted-foreground hover:text-destructive"><LuX className="size-4" /></button>
                  </div>
                ))}
                {(recipe.ingredients ?? []).length === 0 && extras.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">This recipe has no ingredients yet.</p>}
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <label className="text-xs font-medium">Add an ingredient this recipe doesn&apos;t have
                  <span className="mt-1 block">
                    <SearchableSelect options={productOptions.filter((p) => !recipeIds.has(p.value) && !overrideOf(p.value))} value={extraProduct} onChange={setExtraProduct} placeholder="Select a product" searchPlaceholder="Search products…" emptyText="No products match." />
                  </span>
                </label>
                <button
                  type="button" disabled={!extraProduct}
                  onClick={() => {
                    const p = productOptions.find((x) => x.value === extraProduct)
                    if (!p) return
                    setOverride({ productId: p.value, name: p.label, unit: p.hint ?? '', quantity: '1', isRemoved: false }, p.value)
                    setExtraProduct('')
                  }}
                  className="flex items-center gap-1 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                ><LuPlus className="size-3.5" /> Add</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
