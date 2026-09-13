import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuChefHat, LuCircleAlert, LuCircleCheck, LuClock3, LuListChecks, LuLoaderCircle, LuPencil, LuPlus, LuTrash2, LuUtensils } from 'react-icons/lu'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Product = { id: string; name: string; unit: string }
type RecipeIngredient = { id: string; productId: string; quantity: string; product: Product }
type Recipe = {
  id: string
  name: string
  description: string | null
  steps: string[]
  estimatedMinutes: number | null
  isActive: boolean
  ingredients: RecipeIngredient[]
  _count: { menuItems: number }
}

type IngredientRow = { productId: string; quantity: string }
type RecipeForm = { name: string; description: string; estimatedMinutes: string; steps: string[]; ingredients: IngredientRow[]; isActive: boolean }
const emptyForm: RecipeForm = { name: '', description: '', estimatedMinutes: '', steps: [''], ingredients: [{ productId: '', quantity: '' }], isActive: true }

export default function Recipes() {
  const toast = useToast()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<RecipeForm>(emptyForm)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ recipes: Recipe[] }>('/recipes')
      setRecipes(response.recipes)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load recipes'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    api<{ products: Product[] }>('/products')
      .then((r) => setProducts(r.products))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load products'))
  }, [toast])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(recipe: Recipe) {
    setEditing(recipe)
    setForm({
      name: recipe.name,
      description: recipe.description ?? '',
      estimatedMinutes: recipe.estimatedMinutes?.toString() ?? '',
      steps: recipe.steps.length ? recipe.steps : [''],
      ingredients: recipe.ingredients.length ? recipe.ingredients.map((i) => ({ productId: i.productId, quantity: i.quantity })) : [{ productId: '', quantity: '' }],
      isActive: recipe.isActive,
    })
    setError('')
    setShowForm(true)
  }

  async function saveRecipe(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...form,
        steps: form.steps.map((s) => s.trim()).filter(Boolean),
        ingredients: form.ingredients.filter((i) => i.productId && i.quantity),
      }
      await api(editing ? `/recipes/${editing.id}` : '/recipes', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setNotice(editing ? 'Recipe updated.' : 'Recipe created.')
      toast.success(editing ? 'Recipe updated.' : 'Recipe created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save recipe'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    if (!window.confirm(`Delete "${recipe.name}"?`)) return
    setError('')
    setNotice('')
    try {
      await api(`/recipes/${recipe.id}`, { method: 'DELETE' })
      setNotice('Recipe deleted.')
      toast.success('Recipe deleted.')
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete recipe'
      setError(message)
      toast.error(message)
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
    <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Kitchen</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Recipes</h1>
          <p className="mt-2 text-sm text-muted-foreground">How each dish is made — steps, prep time, and the products it consumes from the kitchen.</p>
        </div>
        <Button onClick={openCreate}>
          <LuPlus /> New recipe
        </Button>
      </header>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-success/25 bg-success/10 p-3 text-sm text-success">
          <LuCircleCheck />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading recipes…</div>
      ) : recipes.length === 0 ? (
        <div className="mt-7 min-h-64 rounded-sm border bg-card p-16 text-center text-sm text-muted-foreground shadow-sm">No recipes yet. Add your first one to start standardizing prep.</div>
      ) : (
        <section className="mt-7 grid gap-4 sm:grid-cols-2">
          {recipes.map((recipe) => (
            <article key={recipe.id} className="rounded-sm border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-secondary/10 text-secondary"><LuChefHat className="size-4" /></span>
                  <div>
                    <h2 className="font-semibold">{recipe.name}</h2>
                    {recipe.description && <p className="mt-0.5 text-xs text-muted-foreground">{recipe.description}</p>}
                  </div>
                </div>
                {!recipe.isActive && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {recipe.estimatedMinutes != null && <span className="flex items-center gap-1"><LuClock3 className="size-3.5" /> {recipe.estimatedMinutes} min</span>}
                <span className="flex items-center gap-1"><LuListChecks className="size-3.5" /> {recipe.steps.length} step{recipe.steps.length === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1"><LuUtensils className="size-3.5" /> {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'}</span>
                {recipe._count.menuItems > 0 && <span className="rounded-full bg-secondary/10 px-2 py-0.5 font-semibold text-secondary">{recipe._count.menuItems} menu item{recipe._count.menuItems === 1 ? '' : 's'}</span>}
              </div>

              {recipe.ingredients.length > 0 && (
                <p className="mt-3 truncate text-xs text-muted-foreground">{recipe.ingredients.map((i) => `${i.product.name} ${Number(i.quantity)}${i.product.unit}`).join(' · ')}</p>
              )}

              <div className="mt-4 flex gap-2">
                <button onClick={() => openEdit(recipe)} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><LuPencil className="size-3.5" /> Edit</button>
                <button onClick={() => void deleteRecipe(recipe)} className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"><LuTrash2 className="size-3.5" /> Delete</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveRecipe} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit recipe' : 'New recipe'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a recipe'}</h2>
            </div>

            <FieldGroup title="Overview">
              <Field label="Name" required className="sm:col-span-2"><input required placeholder="e.g. Chicken Tikka Masala" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Estimated Time (minutes)"><input type="number" min="0" placeholder="e.g. 25" value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })} className="input" /></Field>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
              <Field label="Description" className="sm:col-span-2"><input placeholder="Short note about this dish" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Steps">
              <div className="sm:col-span-2 space-y-2">
                {form.steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-xs font-bold text-secondary">{index + 1}</span>
                    <input placeholder={`Step ${index + 1}`} value={step} onChange={(e) => updateStep(index, e.target.value)} className="input flex-1" />
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="rounded-sm border px-2 py-2 text-xs hover:bg-muted disabled:opacity-30">&uarr;</button>
                      <button type="button" onClick={() => moveStep(index, 1)} disabled={index === form.steps.length - 1} className="rounded-sm border px-2 py-2 text-xs hover:bg-muted disabled:opacity-30">&darr;</button>
                      <button type="button" onClick={() => removeStep(index)} className="rounded-sm border border-destructive/30 p-2 text-destructive hover:bg-destructive/10"><LuTrash2 className="size-3.5" /></button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><LuPlus className="size-3.5" /> Add step</button>
              </div>
            </FieldGroup>

            <FieldGroup title="Ingredients">
              <div className="sm:col-span-2 space-y-2">
                {form.ingredients.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <select value={row.productId} onChange={(e) => updateIngredient(index, { productId: e.target.value })} className="input">
                        <option value="">Select product…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="number" min="0" step="0.001" placeholder="Qty" value={row.quantity} onChange={(e) => updateIngredient(index, { quantity: e.target.value })} className="input" />
                    </div>
                    <span className="w-10 shrink-0 text-xs text-muted-foreground">{products.find((p) => p.id === row.productId)?.unit ?? ''}</span>
                    <button type="button" onClick={() => removeIngredient(index)} className="shrink-0 rounded-sm border border-destructive/30 p-2 text-destructive hover:bg-destructive/10"><LuTrash2 className="size-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={addIngredient} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><LuPlus className="size-3.5" /> Add ingredient</button>
              </div>
            </FieldGroup>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create recipe'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5 first:mt-6 first:border-t">
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
