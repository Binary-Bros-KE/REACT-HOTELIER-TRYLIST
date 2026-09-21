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
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'
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
const TH = 'px-4 py-3 text-xs font-bold uppercase tracking-wider'

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
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Menu" title="Menu Categories" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">Organise the menu</h2>
            <p className="max-w-xl text-xs text-muted-foreground">
              The groups a menu item can sit under. Order sets how they appear on the menu; an inactive category is hidden but keeps its items.
            </p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-64" />
          </label>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>New category</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading categories…</div>
        ) : visible.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">{search.trim() ? 'No categories match your search.' : 'No menu categories yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={cn(TH, 'w-28 text-center')}>Order</th>
                  <th className="w-14" aria-label="Image" />
                  <th className={TH}>Category</th>
                  <th className={cn(TH, 'text-right')}>Items</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((category, index) => (
                  <tr key={category.id} className="align-middle transition even:bg-muted/30 hover:bg-muted/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <ActionButton tone="neutral" icon={<LuChevronUp />} title={search.trim() ? 'Clear search to reorder' : 'Move up'} disabled={reordering || index === 0 || !!search.trim()} onClick={() => void move(index, -1)} />
                        <ActionButton tone="neutral" icon={<LuChevronDown />} title={search.trim() ? 'Clear search to reorder' : 'Move down'} disabled={reordering || index === visible.length - 1 || !!search.trim()} onClick={() => void move(index, 1)} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex size-10 items-center justify-center overflow-hidden border bg-muted/50 text-muted-foreground">
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
                    <td className="px-4 py-3"><StatusPill tone={category.isActive ? 'success' : 'muted'}>{category.isActive ? 'Active' : 'Inactive'}</StatusPill></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(category)} />
                        <ActionButton tone="neutral" icon={<LuPower />} title={category.isActive ? 'Deactivate' : 'Activate'} onClick={() => void toggleActive(category)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title={category._count.menuItems > 0 ? 'In use — deactivate instead' : 'Delete'} disabled={category._count.menuItems > 0} onClick={() => void remove(category)} />
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
        <ModalShell
          size="sm"
          kicker={editing ? 'Edit category' : 'New category'}
          title={editing ? editing.name : 'Add a menu category'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="menu-category-form" disabled={saving || !form.name.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create category'}
              </button>
            </>
          }
        >
          <form id="menu-category-form" onSubmit={save} className="space-y-4 p-5">
            <Field label="Name" required>
              <input required autoFocus placeholder="e.g. Hot Drinks" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </Field>
            <Field label="Description">
              <input placeholder="Optional — a short note" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
            </Field>
            <Field label="Image URL">
              <input type="url" placeholder="https://…" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="input" />
              {form.imageUrl.trim() && (
                <span className="mt-2 flex size-20 items-center justify-center overflow-hidden border bg-muted/50">
                  <img src={form.imageUrl} alt="preview" className="size-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0.15' }} />
                </span>
              )}
            </Field>
            <label className="flex items-center justify-between border bg-background px-3 py-2.5 text-sm font-medium">
              Active
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
            </label>
          </form>
        </ModalShell>
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
