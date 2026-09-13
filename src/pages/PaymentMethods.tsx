import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuBan, LuCircleAlert, LuCircleCheck, LuCreditCard, LuLoaderCircle, LuLock, LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type PaymentMethod = {
  id: string
  name: string
  code: string
  description: string | null
  isSystem: boolean
  isActive: boolean
  requiresReference: boolean
  sortOrder: number
}
type MethodForm = { name: string; code: string; description: string; requiresReference: boolean; sortOrder: string }
const emptyForm: MethodForm = { name: '', code: '', description: '', requiresReference: false, sortOrder: '0' }

export default function PaymentMethods() {
  const toast = useToast()
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<MethodForm>(emptyForm)
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api<{ methods: PaymentMethod[] }>('/payment-methods')
      setMethods(res.methods)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load payment methods'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return methods
    return methods.filter((m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q))
  }, [methods, search])

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, sortOrder: String(methods.length) })
    setShowForm(true)
  }

  function openEdit(method: PaymentMethod) {
    setEditing(method)
    setForm({ name: method.name, code: method.code, description: method.description ?? '', requiresReference: method.requiresReference, sortOrder: String(method.sortOrder) })
    setShowForm(true)
  }

  async function saveMethod(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = { name: form.name, description: form.description || undefined, requiresReference: form.requiresReference, sortOrder: Number(form.sortOrder) || 0 }
      if (!editing) body.code = form.code
      await api(editing ? `/payment-methods/${editing.id}` : '/payment-methods', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      setNotice(editing ? 'Payment method updated.' : 'Payment method created.')
      toast.success(editing ? 'Payment method updated.' : 'Payment method created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save payment method'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(method: PaymentMethod) {
    try {
      await api(`/payment-methods/${method.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !method.isActive }) })
      toast.success(method.isActive ? 'Payment method disabled.' : 'Payment method enabled.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update payment method')
    }
  }

  async function deleteMethod(method: PaymentMethod) {
    if (!window.confirm(`Delete "${method.name}"?`)) return
    try {
      await api(`/payment-methods/${method.id}`, { method: 'DELETE' })
      toast.success('Payment method deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete payment method')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">Payment Methods</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold"><LuCreditCard className="text-accent" /> How customers can pay</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Enable, disable, or add the payment methods your checkout will offer.</p>
        </div>
        <Button onClick={openCreate}>
          <LuPlus /> New payment method
        </Button>
      </header>

      {error && <Msg error text={error} />}
      {notice && <Msg text={notice} />}

      <div className="mt-6">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search</label>
        <div className="relative mt-1.5 max-w-sm">
          <LuSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code, or description" className="input pl-9" />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-sm border bg-card shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((method) => (
                  <tr key={method.id} className="border-t">
                    <td className="px-5 py-4">
                      <span className="font-semibold">{method.name}</span>
                      {method.isSystem && <span className="ml-2 rounded-full border border-secondary/30 px-2 py-0.5 text-[10px] font-bold text-secondary">SYSTEM</span>}
                      {method.description && <p className="mt-0.5 text-xs text-muted-foreground">{method.description}</p>}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{method.code}</td>
                    <td className="px-5 py-4">
                      <span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold', method.requiresReference ? 'border-warning/30 text-warning' : 'border-border text-muted-foreground')}>
                        {method.requiresReference ? 'REQUIRED' : 'NOT REQUIRED'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold', method.isActive ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive')}>
                        {method.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(method)} className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                        <button onClick={() => void toggleActive(method)} title={method.isActive ? 'Disable' : 'Enable'} className="rounded-sm p-2 text-muted-foreground hover:bg-warning/10 hover:text-warning"><LuBan className="size-4" /></button>
                        {method.isSystem ? (
                          <span title="Built-in — can't be deleted" className="rounded-sm p-2 text-muted-foreground/50"><LuLock className="size-4" /></span>
                        ) : (
                          <button onClick={() => void deleteMethod(method)} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">No payment methods found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveMethod} className="w-full max-w-lg rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-accent">{editing ? 'Edit payment method' : 'New payment method'}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'How customers can pay'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">This determines what customers can select as a payment option during checkout.</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Name" required><input required placeholder="e.g. Airtel Money" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" /></Field>
              <Field label="Code" required>
                <input
                  required
                  disabled={Boolean(editing)}
                  placeholder="e.g. AIRTEL_MONEY"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="input disabled:opacity-60"
                />
              </Field>
              <Field label="Sort order"><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className="input" /></Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} placeholder="e.g. Mobile money payments via Airtel" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-sm border bg-muted/40 p-3">
              <input type="checkbox" checked={form.requiresReference} onChange={(e) => setForm({ ...form, requiresReference: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
              <span>
                <span className="block text-sm font-semibold">Requires Reference</span>
                <span className="block text-xs text-muted-foreground">Cashier must enter a transaction/reference number for this payment</span>
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create payment method'}
              </button>
            </div>
          </form>
        </div>
      )}
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
