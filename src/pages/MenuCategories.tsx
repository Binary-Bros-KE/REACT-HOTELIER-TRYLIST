import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuChevronDown,
  LuChevronUp,
  LuCircleAlert,
  LuImageOff,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuPower,
  LuSearch,
  LuTrash2,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type MenuCategory = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { menuItems: number }
}
type Form = { name: string; description: string; imageUrl: string; isActive: boolean }
const emptyForm: Form = { name: '', description: '', imageUrl: '', isActive: true }

export default function MenuCategories() {
  const toast = useToast()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<Form>(emptyForm)
  const [editing, setEditing] = useState<MenuCategory | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ categories: MenuCategory[] }>('/menu-categories')
      setCategories(response.categories)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load menu categories'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories
  }, [categories, search])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(category: MenuCategory) {
    setEditing(category)
    setForm({ name: category.name, description: category.description ?? '', imageUrl: category.imageUrl ?? '', isActive: category.isActive })
    setShowForm(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined, imageUrl: form.imageUrl.trim() || undefined, isActive: form.isActive }
      await api(editing ? `/menu-categories/${editing.id}` : '/menu-categories', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(editing ? 'Category updated.' : 'Category created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save category')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(category: MenuCategory) {
    try {
      await api(`/menu-categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !category.isActive }) })
      toast.success(category.isActive ? 'Category deactivated.' : 'Category activated.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update category')
    }
  }

  async function remove(category: MenuCategory) {
    if (!window.confirm(`Delete "${category.name}"?`)) return
    try {
      await api(`/menu-categories/${category.id}`, { method: 'DELETE' })
      toast.success('Category deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete category')
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= categories.length || search.trim()) return
    const next = [...categories]
    ;[next[index], next[target]] = [next[target], next[index]]
    setCategories(next) // optimistic
    setReordering(true)
    try {
      await api('/menu-categories/reorder', { method: 'POST', body: JSON.stringify({ orderedIds: next.map((c) => c.id) }) })
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reorder')
      await load()
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary">{categories.length} · Menu</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Menu Categories</h1>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-secondary">Categories</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Organise the menu</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              The groups a menu item can sit under — Hot Drinks, Bakery, Cocktails. Order sets how they appear on the menu; an inactive category is hidden but keeps its items.
            </p>
          </div>
          <Button onClick={openCreate} className="shrink-0">
            <LuPlus /> New category
          </Button>
        </div>

        <div className="border-b p-4">
          <label className="relative block">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading categories…</div>
        ) : visible.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">{search.trim() ? 'No categories match your search.' : 'No menu categories yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th className="w-16 text-center">Order</th>
                  <th className="w-14" aria-label="Image" />
                  <th>Category</th>
                  <th className="text-right">Items</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {visible.map((category, index) => (
                  <tr key={category.id} className="align-middle transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => void move(index, -1)}
                          disabled={reordering || index === 0 || !!search.trim()}
                          title={search.trim() ? 'Clear search to reorder' : 'Move up'}
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted disabled:opacity-25"
                        >
                          <LuChevronUp className="size-4" />
                        </button>
                        <button
                          onClick={() => void move(index, 1)}
                          disabled={reordering || index === visible.length - 1 || !!search.trim()}
                          title={search.trim() ? 'Clear search to reorder' : 'Move down'}
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted disabled:opacity-25"
                        >
                          <LuChevronDown className="size-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted/50 text-muted-foreground">
                        {category.imageUrl
                          ? <img src={category.imageUrl} alt="" className="size-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          : <LuImageOff className="size-4" />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{category.name}</p>
                      {category.description && <p className="max-w-sm truncate text-xs text-muted-foreground">{category.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{category._count.menuItems}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        category.isActive ? 'border-success/40 text-success' : 'border-muted-foreground/30 text-muted-foreground',
                      )}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(category)} title="Edit" className="rounded-md p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                        <button onClick={() => void toggleActive(category)} title={category.isActive ? 'Deactivate' : 'Activate'} className={cn('rounded-md p-2 hover:bg-muted', category.isActive ? 'text-muted-foreground' : 'text-success')}><LuPower className="size-4" /></button>
                        <button
                          onClick={() => void remove(category)}
                          disabled={category._count.menuItems > 0}
                          title={category._count.menuItems > 0 ? 'In use — deactivate instead' : 'Delete'}
                          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        >
                          <LuTrash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={save} className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit category' : 'New category'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a menu category'}</h2>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Name" required>
                <input required autoFocus placeholder="e.g. Hot Drinks" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
              </Field>
              <Field label="Description">
                <input placeholder="Optional — a short note" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
              </Field>
              <Field label="Image URL">
                <input type="url" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="input" />
                {form.imageUrl.trim() && (
                  <span className="mt-2 flex size-20 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                    <img src={form.imageUrl} alt="preview" className="size-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0.15' }} />
                  </span>
                )}
              </Field>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving || !form.name.trim()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
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

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
