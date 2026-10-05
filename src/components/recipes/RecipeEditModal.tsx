import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuArrowDown, LuArrowUp, LuLoaderCircle, LuPlus, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

// The one recipe editor. Used by Kitchen > Recipes and by the store's dispatch screen,
// so a correction made at dispatch is the same edit as one made on the Recipes page.

export type RecipeProduct = { id: string; name: string; unit: string }
export type RecipeDetail = {
  id: string
  name: string
  description: string | null
  steps: string[]
  estimatedMinutes: number | null
  isActive: boolean
  ingredients: { id: string; productId: string; quantity: string; product: RecipeProduct }[]
}

type IngredientRow = { productId: string; quantity: string }
type RecipeForm = { name: string; description: string; estimatedMinutes: string; steps: string[]; ingredients: IngredientRow[]; isActive: boolean }
const emptyForm: RecipeForm = { name: '', description: '', estimatedMinutes: '', steps: [''], ingredients: [{ productId: '', quantity: '' }], isActive: true }

function formFrom(recipe: RecipeDetail | null): RecipeForm {
  if (!recipe) return emptyForm
  return {
    name: recipe.name,
    description: recipe.description ?? '',
    estimatedMinutes: recipe.estimatedMinutes?.toString() ?? '',
    steps: recipe.steps.length ? recipe.steps : [''],
    ingredients: recipe.ingredients.length ? recipe.ingredients.map((i) => ({ productId: i.productId, quantity: i.quantity })) : [{ productId: '', quantity: '' }],
    isActive: recipe.isActive,
  }
}

export default function RecipeEditModal({ recipe, products, onClose, onSaved }: { recipe: RecipeDetail | null; products: RecipeProduct[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState<RecipeForm>(() => formFrom(recipe))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveRecipe(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        steps: form.steps.map((s) => s.trim()).filter(Boolean),
        ingredients: form.ingredients.filter((i) => i.productId && i.quantity),
      }
      await api(recipe ? `/recipes/${recipe.id}` : '/recipes', { method: recipe ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(recipe ? 'Recipe updated.' : 'Recipe created.')
      onSaved()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save recipe'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  function updateStep(index: number, value: string) {
    setForm({ ...form, steps: form.steps.map((s, i) => (i === index ? value : s)) })
  }
  function addStep() { setForm({ ...form, steps: [...form.steps, ''] }) }
  function removeStep(index: number) { setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) }) }
  function moveStep(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= form.steps.length) return
    const steps = [...form.steps]
    ;[steps[index], steps[target]] = [steps[target], steps[index]]
    setForm({ ...form, steps })
  }

  function updateIngredient(index: number, patch: Partial<IngredientRow>) {
    setForm({ ...form, ingredients: form.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
  }
  function addIngredient() { setForm({ ...form, ingredients: [...form.ingredients, { productId: '', quantity: '' }] }) }
  function removeIngredient(index: number) { setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== index) }) }

  return (
    <ModalShell
      size="lg"
      kicker={recipe ? 'Edit recipe' : 'New recipe'}
      title={recipe ? recipe.name : 'Add a recipe'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <button form="recipe-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />}
            {recipe ? 'Save changes' : 'Create recipe'}
          </button>
        </>
      }
    >
      {error && <div className="mx-5 mt-4 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <form id="recipe-form" onSubmit={saveRecipe} className="px-5 pb-5">
        <FieldGroup title="Overview">
          <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Chicken Tikka Masala" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
          <Field label="Estimated Time (minutes)"><input type="number" min="0" placeholder="e.g. 25" value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })} className="input" /></Field>
          <label className="flex items-center justify-between border bg-background px-3 py-2.5 text-sm font-medium">
            Active
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
          </label>
          <Field label="Description" className="sm:col-span-2"><input placeholder="Short note about this dish" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
        </FieldGroup>

        <FieldGroup title="Steps">
          <div className="space-y-2 sm:col-span-2">
            {form.steps.map((step, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="mt-2 flex size-7 shrink-0 items-center justify-center bg-secondary/15 text-xs font-bold text-secondary">{index + 1}</span>
                <input placeholder={`Step ${index + 1}`} value={step} onChange={(e) => updateStep(index, e.target.value)} className="input flex-1" />
                <div className="flex shrink-0 gap-1">
                  <ActionButton tone="neutral" icon={<LuArrowUp />} title="Move up" disabled={index === 0} onClick={() => moveStep(index, -1)} />
                  <ActionButton tone="neutral" icon={<LuArrowDown />} title="Move down" disabled={index === form.steps.length - 1} onClick={() => moveStep(index, 1)} />
                  <ActionButton tone="neutral" icon={<LuTrash2 />} title="Remove step" onClick={() => removeStep(index)} />
                </div>
              </div>
            ))}
            <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 border-2 border-dashed px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-secondary hover:bg-secondary/5"><LuPlus className="size-3.5" /> Add step</button>
          </div>
        </FieldGroup>

        <FieldGroup title="Ingredients">
          <div className="space-y-2 sm:col-span-2">
            {form.ingredients.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <SearchableSelect
                    value={row.productId}
                    onChange={(productId) => updateIngredient(index, { productId })}
                    options={products.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select product…"
                    searchPlaceholder="Search products..."
                    emptyText="No products match."
                  />
                </div>
                <div className="w-28 shrink-0">
                  <input type="number" min="0" step="0.001" placeholder="Qty" value={row.quantity} onChange={(e) => updateIngredient(index, { quantity: e.target.value })} className="input" />
                </div>
                <span className="w-10 shrink-0 text-xs text-muted-foreground">{products.find((p) => p.id === row.productId)?.unit ?? ''}</span>
                <ActionButton tone="neutral" icon={<LuTrash2 />} title="Remove ingredient" onClick={() => removeIngredient(index)} />
              </div>
            ))}
            <button type="button" onClick={addIngredient} className="inline-flex items-center gap-1.5 border-2 border-dashed px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-secondary hover:bg-secondary/5"><LuPlus className="size-3.5" /> Add ingredient</button>
          </div>
        </FieldGroup>
      </form>
    </ModalShell>
  )
}

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5 first:mt-6 first:border-t">
      <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

export function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('text-sm font-medium', className)}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
