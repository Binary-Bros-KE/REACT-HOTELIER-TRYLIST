import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LuArchive, LuArchiveRestore, LuBan, LuCalendarDays, LuCalendarRange, LuCircleAlert, LuLoaderCircle, LuLock, LuPencil, LuPlus, LuReceiptText, LuSearch, LuSettings2, LuTrash2, LuWallet } from 'react-icons/lu'
import { api } from '@/lib/api'
import QuickAddModal, { QuickNewButton } from '@/components/QuickAddModal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'
import { useAppSelector } from '@/store/hooks'

const date = () => new Date().toISOString().slice(0, 10)
const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'

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

/** The same page is mounted under Finance, Reception, Kitchen and Inventory. */
function useSectionKicker() {
  const path = useLocation().pathname
  if (path.startsWith('/reception')) return 'Reception'
  if (path.startsWith('/kitchen')) return 'Kitchen'
  if (path.startsWith('/inventory')) return 'Inventory'
  if (path.startsWith('/finance')) return 'Finance'
  return 'Expenses'
}

export default function Expenses() {
  const toast = useToast()
  const kicker = useSectionKicker()
  const currentUser = useAppSelector((s) => s.auth.user)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<{ total: number; byCategory: CategoryBucket[] }>({ total: 0, byCategory: [] })
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [quickCategory, setQuickCategory] = useState(false)
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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

  // Cards beyond the server total are worked out from what's on screen (active entries only).
  const activeExpenses = expenses.filter((e) => e.status === 'ACTIVE')
  const todayIso = date()
  const monthIso = todayIso.slice(0, 7)
  const spendToday = activeExpenses.filter((e) => e.expenseDate.slice(0, 10) === todayIso).reduce((sum, e) => sum + Number(e.amount), 0)
  const countToday = activeExpenses.filter((e) => e.expenseDate.slice(0, 10) === todayIso).length
  const spendMonth = activeExpenses.filter((e) => e.expenseDate.slice(0, 7) === monthIso).reduce((sum, e) => sum + Number(e.amount), 0)
  const averageSpend = activeExpenses.length > 0 ? activeExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / activeExpenses.length : 0
  const activeCategories = categories.filter((c) => c.isActive)
  const noLookups = activeCategories.length === 0 || methods.length === 0

  // Category and payment method start unselected — a hurried entry shouldn't quietly land on the first option.
  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, expenseDate: date() })
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
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker={kicker} title="Daily Expenses" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}
      {!loading && noLookups && (
        <div className="mt-5 flex items-center gap-2 border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
          <LuCircleAlert />
          {activeCategories.length === 0 ? 'Add an expense category first — use "Categories" above the table.' : 'No active payment methods are configured yet.'}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard tone="danger" icon={<LuWallet />} label="Total (active)" value={formatKes(summary.total)} />
        <StatCard index={4} icon={<LuCalendarDays />} label="Today" value={formatKes(spendToday)} hint={`${countToday} expense${countToday === 1 ? '' : 's'}`} />
        <StatCard index={0} icon={<LuCalendarRange />} label="This month" value={formatKes(spendMonth)} hint={new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} />
        <StatCard index={2} icon={<LuReceiptText />} label="Entries" value={String(activeExpenses.length)} hint={activeExpenses.length > 0 ? `Average ${formatKes(averageSpend)}` : 'Nothing recorded yet'} />
      </div>

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">Expense register</h2>
            <p className="text-xs text-muted-foreground">Incidental spending as it happens — each tagged with a category.</p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search no, reference, description…" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-64" />
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | 'ACTIVE' | 'ARCHIVED')} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
            <option value="">All</option>
          </select>
          <div className="flex gap-2">
            <ActionButton tone="neutral" icon={<LuSettings2 />} onClick={() => setShowCategories(true)}>Categories</ActionButton>
            <ActionButton tone="primary" icon={<LuPlus />} disabled={noLookups} onClick={openCreate}>Record expense</ActionButton>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Expense</th>
                  <th className={TH}>Category</th>
                  <th className={TH}>Method</th>
                  <th className={TH}>Recorded by</th>
                  <th className={cn(TH, 'text-right')}>Amount</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="align-middle even:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold">{expense.expenseNo}</p>
                      <p className="text-xs text-muted-foreground">{new Date(expense.expenseDate).toLocaleDateString()}{expense.description ? ` · ${expense.description}` : ''}</p>
                    </td>
                    <td className="px-5 py-3.5">{expense.category.name}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{expense.paymentMethod.name}{expense.reference ? ` · ${expense.reference}` : ''}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{expense.createdByEmployee ? `${expense.createdByEmployee.firstName} ${expense.createdByEmployee.lastName}` : '—'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatKes(Number(expense.amount))}</td>
                    <td className="px-5 py-3.5"><StatusPill tone={expense.status === 'ACTIVE' ? 'success' : 'muted'}>{expense.status === 'ACTIVE' ? 'Active' : 'Archived'}</StatusPill></td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(expense)} />
                        <ActionButton tone="neutral" icon={expense.status === 'ACTIVE' ? <LuArchive /> : <LuArchiveRestore />} title={expense.status === 'ACTIVE' ? 'Archive' : 'Restore'} onClick={() => void toggleArchive(expense)} />
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
      </section>

      {showForm && (
        <ModalShell
          size="md"
          kicker={editing ? 'Edit expense' : 'New expense'}
          title={editing ? editing.expenseNo : 'Record an expense'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="expense-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Record expense'}
              </button>
            </>
          }
        >
          <form id="expense-form" onSubmit={saveExpense} className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" required>
                <div className="flex gap-2"><select required className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="" disabled>Select category</option>
                  {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select><QuickNewButton onClick={() => setQuickCategory(true)} /></div>
              </Field>
              <Field label="Date" required><input required type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="input" /></Field>
              <Field label="Amount" required><input required type="number" min="0" step="0.01" placeholder="e.g. 500" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" /></Field>
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
          </form>
        </ModalShell>
      )}

      {showCategories && (
        <ManageCategoriesModal
          categories={categories}
          onClose={() => setShowCategories(false)}
          onChanged={async () => { await loadLookups(); await loadExpenses(); }}
        />
      )}
      {quickCategory && (
        <QuickAddModal title="New expense category" label="Category name" placeholder="e.g. Utilities" endpoint="/expense-categories" responseKey="category" onClose={() => setQuickCategory(false)}
          onCreated={(c) => { setCategories((cur) => [...cur, { id: c.id, name: c.name, description: null, isActive: true, _count: { expenses: 0 } }]); setForm((f) => ({ ...f, categoryId: c.id })); setQuickCategory(false) }} />
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
    <ModalShell size="sm" kicker="Expenses" title="Categories" onClose={onClose}>
      <div className="p-5">
        <form onSubmit={addCategory} className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Supplies" className="input flex-1" />
          <button disabled={saving || !name.trim()} className="bg-primary px-4 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-50">Add</button>
        </form>
        <div className="mt-4 max-h-80 divide-y overflow-y-auto border">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between gap-2 p-3 even:bg-muted/30">
              {editing?.id === category.id ? (
                <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                  <input required autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="input flex-1" />
                  <button disabled={saving} className="bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="border-2 border-foreground/20 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
                </form>
              ) : (
                <>
                  <div>
                    <p className={cn('text-sm font-medium', !category.isActive && 'text-muted-foreground')}>{category.name}{!category.isActive && ' (inactive)'}</p>
                    <p className="text-xs text-muted-foreground">{category._count.expenses} expense{category._count.expenses === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <ActionButton tone="neutral" icon={<LuBan />} title={category.isActive ? 'Disable' : 'Enable'} onClick={() => void toggleActive(category)} />
                    <ActionButton tone="neutral" icon={<LuPencil />} title="Rename" onClick={() => { setEditing(category); setEditingName(category.name) }} />
                    <ActionButton tone="neutral" icon={<LuTrash2 />} title={category._count.expenses > 0 ? 'In use — disable instead' : 'Delete'} disabled={category._count.expenses > 0} onClick={() => void removeCategory(category)} />
                  </div>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No categories yet.</p>}
        </div>
      </div>
    </ModalShell>
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
