import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuArchive, LuArchiveRestore, LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuLock, LuPencil, LuPlus, LuSearch, LuSettings2, LuTrash2, LuWallet } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import { useAppSelector } from '@/store/hooks'

const date = () => new Date().toISOString().slice(0, 10)
const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

type ExpenseCategory = { id: string; name: string; description: string | null; isActive: boolean; _count: { expenses: number } }
type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type Location = { id: string; name: string }
type Expense = {
  id: string
  expenseNo: string
  expenseDate: string
  amount: string | number
  reference: string | null
  description: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  category: { id: string; name: string }
  paymentMethod: { id: string; name: string; requiresReference: boolean }
  location: { id: string; name: string } | null
  createdByEmployee: { id: string; firstName: string; lastName: string } | null
}
type CategoryBucket = { name: string; count: number; total: number }

type ExpenseForm = {
  categoryId: string
  expenseDate: string
  amount: string
  paymentMethodId: string
  reference: string
  description: string
  locationId: string
}
const emptyForm: ExpenseForm = { categoryId: '', expenseDate: date(), amount: '', paymentMethodId: '', reference: '', description: '', locationId: '' }

export default function Expenses() {
  const toast = useToast()
  const currentUser = useAppSelector((s) => s.auth.user)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<{ total: number; byCategory: CategoryBucket[] }>({ total: 0, byCategory: [] })
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadLookups = useCallback(async () => {
    try {
      const [categoriesRes, methodsRes, locationsRes] = await Promise.all([
        api<{ categories: ExpenseCategory[] }>('/expense-categories'),
        api<{ methods: PaymentMethod[] }>('/payment-methods?activeOnly=true'),
        api<{ locations: Location[] }>('/locations'),
      ])
      setCategories(categoriesRes.categories)
      setMethods(methodsRes.methods)
      setLocations(locationsRes.locations)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load expense lookups')
    }
  }, [toast])

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (categoryFilter) query.set('categoryId', categoryFilter)
      if (statusFilter) query.set('status', statusFilter)
      const response = await api<{ expenses: Expense[]; summary: { total: number; byCategory: CategoryBucket[] } }>(`/expenses${query.size ? `?${query}` : ''}`)
      setExpenses(response.expenses)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load expenses'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, categoryFilter, statusFilter, toast])

  useEffect(() => { void loadLookups() }, [loadLookups])
  useEffect(() => {
    const timer = window.setTimeout(() => void loadExpenses(), 250)
    return () => window.clearTimeout(timer)
  }, [loadExpenses])

  const activeCategories = categories.filter((c) => c.isActive)
  const noLookups = activeCategories.length === 0 || methods.length === 0

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, categoryId: activeCategories[0]?.id ?? '', paymentMethodId: methods[0]?.id ?? '' })
    setShowForm(true)
  }

  function openEdit(expense: Expense) {
    setEditing(expense)
    setForm({
      categoryId: expense.category.id,
      expenseDate: expense.expenseDate.slice(0, 10),
      amount: String(expense.amount),
      paymentMethodId: expense.paymentMethod.id,
      reference: expense.reference ?? '',
      description: expense.description ?? '',
      locationId: expense.location?.id ?? '',
    })
    setShowForm(true)
  }

  const selectedMethod = methods.find((m) => m.id === form.paymentMethodId) ?? (editing ? { id: editing.paymentMethod.id, name: editing.paymentMethod.name, requiresReference: editing.paymentMethod.requiresReference } : undefined)

  async function saveExpense(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        categoryId: form.categoryId,
        expenseDate: form.expenseDate,
        amount: Number(form.amount),
        paymentMethodId: form.paymentMethodId,
        reference: form.reference || undefined,
        description: form.description || undefined,
        locationId: form.locationId || undefined,
      }
      await api(editing ? `/expenses/${editing.id}` : '/expenses', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      setNotice(editing ? 'Expense updated.' : 'Expense recorded.')
      toast.success(editing ? 'Expense updated.' : 'Expense recorded.')
      setShowForm(false)
      await loadExpenses()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save expense'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleArchive(expense: Expense) {
    try {
      await api(`/expenses/${expense.id}`, { method: 'PATCH', body: JSON.stringify({ status: expense.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' }) })
      toast.success(expense.status === 'ACTIVE' ? 'Expense archived.' : 'Expense restored.')
      await loadExpenses()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update expense')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">Daily Expenses</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold"><LuWallet className="text-accent" /> Daily Expenses</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Record incidental spending as it happens — tape, fare, a replacement part — each tagged with a category.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCategories(true)}>
            <LuSettings2 /> Manage categories
          </Button>
          <Button onClick={openCreate} disabled={noLookups}>
            <LuPlus /> Record expense
          </Button>
        </div>
      </header>

      {error && <Msg error text={error} />}
      {notice && <Msg text={notice} />}
      {!loading && noLookups && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <LuCircleAlert />
          {activeCategories.length === 0 ? 'Add an expense category first — click "Manage categories" above.' : 'No active payment methods are configured yet.'}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard tone="danger" icon={<LuWallet />} label="Total (active)" value={formatKes(summary.total)} />
        <div className="rounded-sm border bg-card p-4 shadow-sm sm:col-span-2">
          <p className="text-xs font-bold uppercase text-muted-foreground">By category</p>
          {summary.byCategory.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No expenses yet.</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {summary.byCategory.map((b) => (
                <span key={b.name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {b.name} <span className="text-muted-foreground">· {b.count}</span> · <span className="font-semibold">{formatKes(b.total)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <label className="relative min-w-56 flex-1">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expense no, reference, description…" className="w-full rounded-sm border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | 'ACTIVE' | 'ARCHIVED')} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="">All</option>
        </select>
      </div>

      <div className="mt-5 overflow-hidden rounded-sm border bg-card shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Expense</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Recorded by</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-t">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{expense.expenseNo}</p>
                      <p className="text-xs text-muted-foreground">{new Date(expense.expenseDate).toLocaleDateString()}{expense.description ? ` · ${expense.description}` : ''}</p>
                    </td>
                    <td className="px-5 py-4">{expense.category.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{expense.paymentMethod.name}{expense.reference ? ` · ${expense.reference}` : ''}</td>
                    <td className="px-5 py-4 text-muted-foreground">{expense.createdByEmployee ? `${expense.createdByEmployee.firstName} ${expense.createdByEmployee.lastName}` : '—'}</td>
                    <td className="px-5 py-4 text-right font-semibold">{formatKes(Number(expense.amount))}</td>
                    <td className="px-5 py-4">
                      <span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold', expense.status === 'ACTIVE' ? 'border-success/30 text-success' : 'border-muted-foreground/30 text-muted-foreground')}>
                        {expense.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(expense)} className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                        <button onClick={() => void toggleArchive(expense)} title={expense.status === 'ACTIVE' ? 'Archive' : 'Restore'} className="rounded-sm p-2 text-muted-foreground hover:bg-warning/10 hover:text-warning">
                          {expense.status === 'ACTIVE' ? <LuArchive className="size-4" /> : <LuArchiveRestore className="size-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No expenses found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveExpense} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-accent">{editing ? 'Edit expense' : 'New expense'}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.expenseNo : 'Record an expense'}</h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Category" required>
                <select required className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="" disabled>Select category</option>
                  {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Date" required><input required type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="input" /></Field>
              <Field label="Amount" required><input required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" /></Field>
              <Field label="Payment method" required>
                <select required className="input" value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}>
                  <option value="" disabled>Select method</option>
                  {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label={selectedMethod?.requiresReference ? 'Reference' : 'Reference (optional)'} required={selectedMethod?.requiresReference}>
                <input required={selectedMethod?.requiresReference} placeholder="e.g. M-Pesa code" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input" />
              </Field>
              <Field label="Location (optional)">
                <select className="input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                  <option value="">Not tied to a location</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Recorded by">
                <div className="input flex items-center gap-2 bg-muted/50 text-muted-foreground">
                  <LuLock className="size-3.5 shrink-0" />
                  {editing
                    ? editing.createdByEmployee ? `${editing.createdByEmployee.firstName} ${editing.createdByEmployee.lastName}` : 'Unknown'
                    : currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown'}
                </div>
              </Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} placeholder="What was this for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Record expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCategories && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={async () => { await loadLookups(); await loadExpenses(); }}
        />
      )}
    </div>
  )
}

function ManageCategoriesModal({ categories, onClose, onChanged }: { categories: ExpenseCategory[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<ExpenseCategory | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)

  async function addCategory(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api('/expense-categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      toast.success('Category added.')
      setName('')
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add category')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing || !editingName.trim()) return
    setSaving(true)
    try {
      await api(`/expense-categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingName.trim() }) })
      toast.success('Category updated.')
      setEditing(null)
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update category')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(category: ExpenseCategory) {
    try {
      await api(`/expense-categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !category.isActive }) })
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update category')
    }
  }

  async function removeCategory(category: ExpenseCategory) {
    if (!window.confirm(`Delete "${category.name}"?`)) return
    try {
      await api(`/expense-categories/${category.id}`, { method: 'DELETE' })
      toast.success('Category deleted.')
      await onChanged()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete category')
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-primary/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-sm bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Expense Categories</h2>
          <button onClick={onClose} className="text-sm font-semibold text-secondary">Done</button>
        </div>
        <form onSubmit={addCategory} className="mt-4 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Supplies" className="input flex-1" />
          <button disabled={saving || !name.trim()} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Add</button>
        </form>
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between rounded-sm border p-3">
              {editing?.id === category.id ? (
                <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                  <input required autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="input flex-1" />
                  <button disabled={saving} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-sm border px-3 py-2 text-xs font-semibold hover:bg-muted">Cancel</button>
                </form>
              ) : (
                <>
                  <div>
                    <p className={cn('text-sm font-medium', !category.isActive && 'text-muted-foreground')}>{category.name}{!category.isActive && ' (inactive)'}</p>
                    <p className="text-xs text-muted-foreground">{category._count.expenses} expense{category._count.expenses === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => void toggleActive(category)} title={category.isActive ? 'Disable' : 'Enable'} className="rounded-sm px-2 py-1 text-[10px] font-bold text-muted-foreground hover:bg-warning/10 hover:text-warning">{category.isActive ? 'DISABLE' : 'ENABLE'}</button>
                    <button onClick={() => { setEditing(category); setEditingName(category.name) }} className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                    <button onClick={() => void removeCategory(category)} disabled={category._count.expenses > 0} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><LuTrash2 className="size-4" /></button>
                  </div>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <p className="text-center text-sm text-muted-foreground">No categories yet.</p>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block text-sm font-medium', className)}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

function Msg({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className={cn('mt-5 flex items-center gap-2 rounded-sm p-3 text-sm', error ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
      {error ? <LuCircleAlert /> : <LuCircleCheck />}
      {text}
    </div>
  )
}
