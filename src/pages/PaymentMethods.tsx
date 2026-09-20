import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LuBan, LuCircleAlert, LuLoaderCircle, LuLock, LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'

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
const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'

/** The same page is mounted under Reception, Sales and Service Center. */
function useSectionKicker() {
  const path = useLocation().pathname
  if (path.startsWith('/reception')) return 'Reception'
  if (path.startsWith('/sales')) return 'Sales'
  if (path.startsWith('/service-center')) return 'Service center'
  return 'Payments'
}

export default function PaymentMethods() {
  const toast = useToast()
  const kicker = useSectionKicker()
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker={kicker} title="Payment Methods" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">How customers can pay</h2>
            <p className="text-xs text-muted-foreground">Enable, disable or add the payment methods checkout offers.</p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or description" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-72" />
          </label>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>New method</ActionButton>
        </div>

        {loading ? (
          <div className="p-16 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Name</th>
                  <th className={TH}>Code</th>
                  <th className={TH}>Reference</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((method) => (
                  <tr key={method.id} className="align-middle even:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <span className="font-semibold">{method.name}</span>
                      {method.isSystem && <span className="ml-2 align-middle"><StatusPill tone="secondary">System</StatusPill></span>}
                      {method.description && <p className="mt-0.5 text-xs text-muted-foreground">{method.description}</p>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{method.code}</td>
                    <td className="px-5 py-3.5"><StatusPill tone={method.requiresReference ? 'warning' : 'muted'}>{method.requiresReference ? 'Required' : 'Not required'}</StatusPill></td>
                    <td className="px-5 py-3.5"><StatusPill tone={method.isActive ? 'success' : 'danger'}>{method.isActive ? 'Active' : 'Inactive'}</StatusPill></td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(method)} />
                        <ActionButton tone="neutral" icon={<LuBan />} title={method.isActive ? 'Disable' : 'Enable'} onClick={() => void toggleActive(method)} />
                        {method.isSystem ? (
                          <ActionButton tone="neutral" icon={<LuLock />} title="Built-in — can't be deleted" disabled />
                        ) : (
                          <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete" onClick={() => void deleteMethod(method)} />
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
      </section>

      {showForm && (
        <ModalShell
          size="md"
          kicker={editing ? 'Edit payment method' : 'New payment method'}
          title={editing ? editing.name : 'How customers can pay'}
          subtitle="Decides what customers can pick as a payment option at checkout."
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="method-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create method'}
              </button>
            </>
          }
        >
          <form id="method-form" onSubmit={saveMethod} className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
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

            <label className="mt-4 flex items-start gap-3 border border-l-4 border-l-warning bg-muted/40 p-3">
              <input type="checkbox" checked={form.requiresReference} onChange={(e) => setForm({ ...form, requiresReference: e.target.checked })} className="mt-0.5 size-4 accent-secondary" />
              <span>
                <span className="block text-sm font-semibold">Requires reference</span>
                <span className="block text-xs text-muted-foreground">Cashier must enter a transaction/reference number for this payment</span>
              </span>
            </label>
          </form>
        </ModalShell>
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
