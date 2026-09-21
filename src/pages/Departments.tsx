import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuNetwork, LuPencil, LuPlus, LuPower, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Department = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { employees: number }
}
type Form = { name: string; description: string; isActive: boolean }
const emptyForm: Form = { name: '', description: '', isActive: true }

export default function Departments() {
  const toast = useToast()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form>(emptyForm)
  const [editing, setEditing] = useState<Department | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ departments: Department[] }>('/departments')
      setDepartments(response.departments)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load departments'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(department: Department) {
    setEditing(department)
    setForm({ name: department.name, description: department.description ?? '', isActive: department.isActive })
    setShowForm(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || undefined, isActive: form.isActive }
      await api(editing ? `/departments/${editing.id}` : '/departments', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(editing ? 'Department updated.' : 'Department created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save department')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(department: Department) {
    try {
      await api(`/departments/${department.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !department.isActive }) })
      toast.success(department.isActive ? 'Department deactivated.' : 'Department activated.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update department')
    }
  }

  async function remove(department: Department) {
    if (!window.confirm(`Delete "${department.name}"?`)) return
    try {
      await api(`/departments/${department.id}`, { method: 'DELETE' })
      toast.success('Department deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete department')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-4xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Team" title="Departments" />

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Org units</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              The departments staff belong to. Rename freely — every employee keeps pointing at the same department. An inactive one drops out of the picker but stays on existing records.
            </p>
          </div>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate} className="shrink-0">New department</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading departments…</div>
        ) : departments.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No departments yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th className="w-12" aria-label="Icon" />
                  <th>Department</th>
                  <th className="text-right">Employees</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {departments.map((department) => (
                  <tr key={department.id} className="align-middle transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className="flex size-9 items-center justify-center rounded-md border bg-secondary/10 text-secondary">
                        <LuNetwork className="size-4" />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{department.name}</p>
                      {department.description && <p className="text-xs text-muted-foreground">{department.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{department._count.employees}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'keep-round inline-flex whitespace-nowrap border border-dashed px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        department.isActive ? 'border-success/70 text-success' : 'border-muted-foreground/50 text-muted-foreground',
                      )}>
                        {department.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(department)} />
                        <ActionButton tone={department.isActive ? 'neutral' : 'success'} icon={<LuPower />} title={department.isActive ? 'Deactivate' : 'Activate'} onClick={() => void toggleActive(department)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} disabled={department._count.employees > 0} title={department._count.employees > 0 ? 'Move its employees first' : 'Delete'} onClick={() => void remove(department)} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={save} className="w-full max-w-md border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit department' : 'New department'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a department'}</h2>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Name" required>
                <input required autoFocus placeholder="e.g. Front Office" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
              </Field>
              <Field label="Description">
                <input placeholder="Optional — what this department covers" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
              </Field>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving || !form.name.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create department'}
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
