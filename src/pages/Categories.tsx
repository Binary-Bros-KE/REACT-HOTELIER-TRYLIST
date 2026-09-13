import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuCircleCheck, LuFolderTree, LuLoaderCircle, LuPencil, LuPlus, LuTag, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'

const MAX_LEVEL = 3
export type CategoryScope = 'STORE' | 'RESTAURANT' | 'BAR' | 'GYM' | 'SPA' | 'ROOMS' | 'ASSETS'

type Category = {
  id: string
  name: string
  description: string | null
  parentId: string | null
  level: number
  isActive: boolean
  _count: { children: number; products: number; menuItems: number; assets: number }
}

type CategoryForm = { name: string; description: string; parentId: string; isActive: boolean }
const emptyForm: CategoryForm = { name: '', description: '', parentId: '', isActive: true }

type CategoriesProps = { scope?: CategoryScope; title?: string; subtitle?: string; embedded?: boolean }

export default function Categories({ scope = 'STORE', title = 'Categories', subtitle = 'Organize store products up to three levels deep.', embedded = false }: CategoriesProps = {}) {
  const toast = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [editing, setEditing] = useState<Category | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [presetParentId, setPresetParentId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ categories: Category[] }>(`/categories?scope=${scope}`)
      setCategories(response.categories)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load categories'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [scope, toast])

  useEffect(() => { void load() }, [load])

  const childrenOf = useMemo(() => {
    const map = new Map<string, Category[]>()
    for (const category of categories) {
      const key = category.parentId ?? 'root'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(category)
    }
    return map
  }, [categories])

  const descendantIds = useCallback((id: string): Set<string> => {
    const ids = new Set<string>()
    const walk = (parentId: string) => {
      for (const child of childrenOf.get(parentId) ?? []) {
        ids.add(child.id)
        walk(child.id)
      }
    }
    walk(id)
    return ids
  }, [childrenOf])

  const parentOptions = useMemo(() => {
    const excluded = editing ? new Set([editing.id, ...descendantIds(editing.id)]) : new Set<string>()
    return categories.filter((c) => c.level < MAX_LEVEL && !excluded.has(c.id))
  }, [categories, editing, descendantIds])

  function openCreate(parentId?: string) {
    setEditing(null)
    setForm({ ...emptyForm, parentId: parentId ?? '' })
    setPresetParentId(parentId ?? '')
    setError('')
    setShowForm(true)
  }

  function openEdit(category: Category) {
    setEditing(category)
    setForm({ name: category.name, description: category.description ?? '', parentId: category.parentId ?? '', isActive: category.isActive })
    setPresetParentId('')
    setError('')
    setShowForm(true)
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api(editing ? `/categories/${editing.id}` : '/categories', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(editing ? form : { ...form, scope }),
      })
      setNotice(editing ? 'Category updated.' : 'Category created.')
      toast.success(editing ? 'Category updated.' : 'Category created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save category'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Delete "${category.name}"?`)) return
    setError('')
    setNotice('')
    try {
      await api(`/categories/${category.id}`, { method: 'DELETE' })
      setNotice('Category deleted.')
      toast.success('Category deleted.')
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete category'
      setError(message)
      toast.error(message)
    }
  }

  const roots = childrenOf.get('root') ?? []
  const summary = {
    total: categories.length,
    topLevel: roots.length,
    inUse: categories.filter((c) => c._count.products + c._count.menuItems + c._count.assets > 0).length,
  }

  return (
    <div className={embedded ? '' : 'mx-auto max-w-5xl px-6 py-8 sm:px-8 lg:px-10'}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!embedded && <p className="text-sm font-semibold text-secondary">Inventory</p>}
          {embedded ? <h2 className="font-display text-xl font-semibold">{title}</h2> : <h1 className="mt-1 font-display text-3xl font-semibold">{title}</h1>}
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => openCreate()}>
          <LuPlus /> Add category
        </Button>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-3">
        {([
          ['Total categories', summary.total, <LuFolderTree key="a" />],
          ['Top-level categories', summary.topLevel, <LuTag key="b" />],
          ['In use', summary.inUse, <LuTag key="c" />],
        ] as const).map(([label, value, icon], i) => (
          <StatCard key={label} index={i} label={label} value={value} icon={icon} />
        ))}
      </section>

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

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="animate-spin" /> Loading categories…
          </div>
        ) : roots.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No categories yet. Add your first one to start organizing products.</div>
        ) : (
          <div className="divide-y">
            {roots.map((category) => (
              <CategoryNode
                key={category.id}
                category={category}
                childrenOf={childrenOf}
                onAddChild={openCreate}
                onEdit={openEdit}
                onDelete={(c) => void deleteCategory(c)}
              />
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm"
        >
          <form onSubmit={saveCategory} className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit category' : 'New category'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a category'}</h2>
            </div>
            <div className="mt-6 space-y-4">
              <Field label="Name" required>
                <input required className="input" placeholder="e.g. Beverages" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <input className="input" placeholder="e.g. Soft drinks, juices, and water" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Parent Category">
                <select
                  className="input"
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  disabled={Boolean(presetParentId)}
                >
                  <option value="">No parent — top level</option>
                  {parentOptions.map((c) => (
                    <option key={c.id} value={c.id}>{'— '.repeat(c.level - 1)}{c.name}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create category'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function CategoryNode({ category, childrenOf, onAddChild, onEdit, onDelete }: {
  category: Category
  childrenOf: Map<string, Category[]>
  onAddChild: (parentId: string) => void
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}) {
  const children = childrenOf.get(category.id) ?? []
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30" style={{ paddingLeft: `${1.25 + (category.level - 1) * 1.5}rem` }}>
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-sm', category.isActive ? 'bg-secondary/10 text-secondary' : 'bg-muted text-muted-foreground')}>
          <LuTag className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{category.name}</p>
            {!category.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>}
            {category._count.products > 0 && <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">{category._count.products} product{category._count.products === 1 ? '' : 's'}</span>}
            {category._count.menuItems > 0 && <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">{category._count.menuItems} menu item{category._count.menuItems === 1 ? '' : 's'}</span>}
            {category._count.assets > 0 && <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">{category._count.assets} asset{category._count.assets === 1 ? '' : 's'}</span>}
          </div>
          {category.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{category.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {category.level < MAX_LEVEL && (
            <button onClick={() => onAddChild(category.id)} title="Add subcategory" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary">
              <LuPlus className="size-4" />
            </button>
          )}
          <button onClick={() => onEdit(category)} title="Edit category" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary">
            <LuPencil className="size-4" />
          </button>
          <button onClick={() => onDelete(category)} title="Delete category" className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LuTrash2 className="size-4" />
          </button>
        </div>
      </div>
      {children.length > 0 && (
        <div className="divide-y border-t">
          {children.map((child) => (
            <CategoryNode key={child.id} category={child} childrenOf={childrenOf} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
