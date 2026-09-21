import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuArrowDown, LuArrowUp, LuCircleAlert, LuLoaderCircle, LuPencil, LuPlus, LuSearch, LuTrash2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'
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
const TH = 'px-4 py-3 text-xs font-bold uppercase tracking-wider'
const emptyForm: RecipeForm = { name: '', description: '', estimatedMinutes: '', steps: [''], ingredients: [{ productId: '', quantity: '' }], isActive: true }

export default function Recipes() {
  const toast = useToast()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [usageFilter, setUsageFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [productFilter, setProductFilter] = useState('')
  const [timeFilter, setTimeFilter] = useState<'all' | 'quick' | 'medium' | 'long'>('all')
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
    try {
      const payload = {
        ...form,
        steps: form.steps.map((s) => s.trim()).filter(Boolean),
        ingredients: form.ingredients.filter((i) => i.productId && i.quantity),
      }
      await api(editing ? `/recipes/${editing.id}` : '/recipes', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
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
    try {
      await api(`/recipes/${recipe.id}`, { method: 'DELETE' })
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

  // Products that actually appear in a recipe — the ingredient filter only offers those.
  const usedProducts = useMemo(() => {
    const seen = new Map<string, string>()
    for (const recipe of recipes) for (const i of recipe.ingredients) seen.set(i.productId, i.product.name)
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name))
  }, [recipes])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recipes.filter((recipe) => {
      if (statusFilter === 'active' && !recipe.isActive) return false
      if (statusFilter === 'inactive' && recipe.isActive) return false
      if (usageFilter === 'linked' && recipe._count.menuItems === 0) return false
      if (usageFilter === 'unlinked' && recipe._count.menuItems > 0) return false
      if (productFilter && !recipe.ingredients.some((i) => i.productId === productFilter)) return false
      if (timeFilter !== 'all') {
        const minutes = recipe.estimatedMinutes
        if (minutes == null) return false
        if (timeFilter === 'quick' && minutes > 15) return false
        if (timeFilter === 'medium' && (minutes <= 15 || minutes > 45)) return false
        if (timeFilter === 'long' && minutes <= 45) return false
      }
      if (!q) return true
      return recipe.name.toLowerCase().includes(q) || (recipe.description ?? '').toLowerCase().includes(q) || recipe.ingredients.some((i) => i.product.name.toLowerCase().includes(q))
    })
  }, [recipes, search, statusFilter, usageFilter, productFilter, timeFilter])
  const filtersActive = Boolean(search.trim() || statusFilter !== 'all' || usageFilter !== 'all' || productFilter || timeFilter !== 'all')

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Kitchen" title="Recipes" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="border-l-4 border-accent pl-3 lg:mr-auto">
              <h2 className="font-display text-xl font-semibold leading-tight">How each dish is made</h2>
              <p className="text-xs text-muted-foreground">Steps, prep time and the products each recipe consumes.</p>
            </div>
            <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>New recipe</ActionButton>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Search
              <span className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recipe, description or ingredient…" className="input pl-9 font-normal normal-case tracking-normal" />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="input font-normal normal-case tracking-normal">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Used on menu
              <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value as typeof usageFilter)} className="input font-normal normal-case tracking-normal">
                <option value="all">All recipes</option>
                <option value="linked">On a menu item</option>
                <option value="unlinked">Not linked yet</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Ingredient
              <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="input font-normal normal-case tracking-normal">
                <option value="">Any ingredient</option>
                {usedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Prep time
              <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as typeof timeFilter)} className="input font-normal normal-case tracking-normal">
                <option value="all">Any time</option>
                <option value="quick">Quick (15 min or less)</option>
                <option value="medium">Medium (16–45 min)</option>
                <option value="long">Long (over 45 min)</option>
              </select>
            </label>
            {filtersActive && (
              <ActionButton tone="neutral" icon={<LuX />} onClick={() => { setSearch(''); setStatusFilter('all'); setUsageFilter('all'); setProductFilter(''); setTimeFilter('all') }}>Clear</ActionButton>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading recipes…</div>
        ) : visible.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">{recipes.length === 0 ? 'No recipes yet. Add your first one to start standardizing prep.' : 'No recipes match these filters.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Recipe</th>
                  <th className={TH}>Ingredients</th>
                  <th className={cn(TH, 'text-right')}>Prep</th>
                  <th className={cn(TH, 'text-right')}>Steps</th>
                  <th className={TH}>Menu items</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((recipe) => (
                  <tr key={recipe.id} className={cn('align-middle transition even:bg-muted/30 hover:bg-muted/60', !recipe.isActive && 'opacity-70')}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{recipe.name}</p>
                      {recipe.description && <p className="max-w-xs truncate text-xs text-muted-foreground">{recipe.description}</p>}
                    </td>
                    <td className="max-w-sm px-4 py-3 text-xs text-muted-foreground">
                      {recipe.ingredients.length > 0
                        ? <span title={recipe.ingredients.map((i) => `${i.product.name} ${Number(i.quantity)}${i.product.unit}`).join(' · ')} className="line-clamp-2">{recipe.ingredients.map((i) => `${i.product.name} ${Number(i.quantity)}${i.product.unit}`).join(' · ')}</span>
                        : <span className="italic">none</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">{recipe.estimatedMinutes != null ? `${recipe.estimatedMinutes} min` : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{recipe.steps.length}</td>
                    <td className="px-4 py-3">{recipe._count.menuItems > 0 ? <StatusPill tone="secondary">{recipe._count.menuItems} item{recipe._count.menuItems === 1 ? '' : 's'}</StatusPill> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3"><StatusPill tone={recipe.isActive ? 'success' : 'muted'}>{recipe.isActive ? 'Active' : 'Inactive'}</StatusPill></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(recipe)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete" onClick={() => void deleteRecipe(recipe)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && recipes.length > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Showing {visible.length} of {recipes.length} recipe{recipes.length === 1 ? '' : 's'}.</p>}
      </section>

      {showForm && (
        <ModalShell
          size="lg"
          kicker={editing ? 'Edit recipe' : 'New recipe'}
          title={editing ? editing.name : 'Add a recipe'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="recipe-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create recipe'}
              </button>
            </>
          }
        >
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
                      <select value={row.productId} onChange={(e) => updateIngredient(index, { productId: e.target.value })} className="input">
                        <option value="">Select product…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
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
      )}
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5 first:mt-6 first:border-t">
      <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
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
