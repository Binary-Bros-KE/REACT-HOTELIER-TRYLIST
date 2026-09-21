import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  LuCircleAlert,
  LuLoaderCircle,
  LuLock,
  LuPencil,
  LuPlus,
  LuShieldCheck,
  LuTrash2,
  LuUserCog,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import { PERMISSION_SECTIONS as sections, sectionLabels, type PermissionSection as Section } from '@/config/navigation'

// Action-level capabilities — separate from the sections above, which only
// hide sidebar/routes client-side. These are checked by the server on the
// specific actions they name, so unlike a section they actually reject a
// request.
type Capability =
  | 'POS_APPROVE_CANCELLATION' | 'POS_APPROVE_COUNTER' | 'POS_VIEW_ALL_ORDERS'
  | 'SHIFT_MANAGE' | 'ATTENDANCE_MANAGE' | 'SHIFT_EXEMPT'
  | 'REQUISITION_CREATE' | 'REQUISITION_APPROVE'
  | 'SHIFT_REVIEW' | 'SALARY_MANAGE' | 'STORE_DISPATCH'
const capabilities: Capability[] = [
  'POS_APPROVE_CANCELLATION', 'POS_APPROVE_COUNTER', 'POS_VIEW_ALL_ORDERS',
  'SHIFT_MANAGE', 'ATTENDANCE_MANAGE', 'SHIFT_EXEMPT',
  'REQUISITION_CREATE', 'REQUISITION_APPROVE',
  'SHIFT_REVIEW', 'SALARY_MANAGE', 'STORE_DISPATCH',
]
const capabilityLabels: Record<Capability, { label: string; hint: string }> = {
  POS_APPROVE_CANCELLATION: { label: 'Approve order cancellations', hint: 'Decide a waiter’s cancellation request (Sales ▸ Approvals) — approve or reject it.' },
  POS_APPROVE_COUNTER: { label: 'Approve counter orders', hint: 'Mark an order served at a Counter-mode location (Locations ▸ Order Handling) — the counter’s approval step.' },
  POS_VIEW_ALL_ORDERS: { label: 'See every order at a location', hint: 'Without this, Active Orders / Completed / Cancelled only show the orders this role’s own employees rang up. Also implied by the two capabilities above.' },
  SHIFT_MANAGE: { label: 'Manage shifts and rotations', hint: 'Create/edit shift templates (Team ▸ Shifts) and assign or change an employee’s rotation.' },
  ATTENDANCE_MANAGE: { label: 'Mark attendance', hint: 'Record an employee as present, absent, late, or on leave for a day (Team ▸ Attendance).' },
  SHIFT_EXEMPT: { label: 'Sign in outside shift hours', hint: 'This role can use the system anytime, regardless of any employee’s assigned shift — for owners/managers/accountants who aren’t shift workers. A Super Admin always has this, implicitly.' },
  REQUISITION_CREATE: { label: 'Raise purchase requisitions', hint: 'Create, edit, submit, and cancel a purchase requisition (Inventory ▸ Purchase Requisitions) — product and quantity only, never cost.' },
  REQUISITION_APPROVE: { label: 'Approve requisitions & convert to purchase', hint: 'Set the estimated cost on a submitted requisition, approve or reject it, and convert an approved one into a Purchase order. Reaches Purchase Requisitions even without Inventory section access.' },
  SHIFT_REVIEW: { label: 'Review & correct shift outcomes', hint: 'Change a finished shift from cleared to rejected (or back), and record or fix its cash discrepancy with a reason — for HR or whoever handles shift disputes.' },
  STORE_DISPATCH: { label: 'Approve store dispatches', hint: 'See the kitchen’s requests for ingredients (Inventory ▸ Dispatch Requests) and dispatch them to the kitchen or reject them. Typically the storekeeper.' },
  SALARY_MANAGE: { label: 'Record salary deductions & allowances', hint: 'Add a deduction or allowance to an employee’s monthly salary — including from a shift discrepancy — creating the month’s draft if it doesn’t exist yet.' },
}

type Role = {
  id: string
  name: string
  description: string | null
  isSystemRole: boolean
  allowedSections: Section[]
  permissions: Capability[]
  employeeCount: number
}
type Summary = { total: number; system: number; custom: number }
type RoleForm = { name: string; description: string; allowedSections: Section[]; permissions: Capability[] }
const emptyForm: RoleForm = { name: '', description: '', allowedSections: [], permissions: [] }

export default function RolesAndPermissions() {
  const toast = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, system: 0, custom: 0 })
  const [form, setForm] = useState<RoleForm>(emptyForm)
  const [editing, setEditing] = useState<Role | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const setNotice = (message: string) => { if (message) toast.success(message) }

  const loadRoles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ roles: Role[]; summary: Summary }>('/roles')
      setRoles(response.roles)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load roles'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void loadRoles() }, [loadRoles])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(role: Role) {
    setEditing(role)
    setForm({ name: role.name, description: role.description ?? '', allowedSections: role.allowedSections, permissions: role.permissions })
    setError('')
    setShowForm(true)
  }

  function toggleSection(section: Section) {
    setForm((f) => ({
      ...f,
      allowedSections: f.allowedSections.includes(section)
        ? f.allowedSections.filter((s) => s !== section)
        : [...f.allowedSections, section],
    }))
  }

  function toggleCapability(capability: Capability) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(capability)
        ? f.permissions.filter((p) => p !== capability)
        : [...f.permissions, capability],
    }))
  }

  async function saveRole(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api(editing ? `/roles/${editing.id}` : '/roles', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      })
      const message = editing ? 'Role updated.' : 'New role created.'
      setNotice(message)
      toast.success(message)
      setShowForm(false)
      await loadRoles()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save role'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`Permanently delete the "${role.name}" role?`)) return
    setError('')
    setNotice('')
    try {
      await api(`/roles/${role.id}`, { method: 'DELETE' })
      setNotice('Role deleted.')
      toast.success('Role deleted.')
      await loadRoles()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete role'
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Team" title="Roles & Permissions" />

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {([
          ['Total roles', summary.total, <LuShieldCheck key="all" />],
          ['System roles', summary.system, <LuLock key="system" />],
          ['Custom roles', summary.custom, <LuUserCog key="custom" />],
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

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Roles</h2>
            <p className="text-xs text-muted-foreground">Control which sidebar sections each role can see, and which server-enforced actions it can take.</p>
          </div>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>Add role</ActionButton>
        </div>
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="animate-spin" /> Loading roles…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Role</th>
                  <th className="px-5 py-3 font-bold">Visible Sections</th>
                  <th className="px-5 py-3 font-bold">Capabilities</th>
                  <th className="px-5 py-3 font-bold">Employees</th>
                  <th className="px-5 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{role.name}</p>
                        {role.isSystemRole && <span className="keep-round border border-dashed border-muted-foreground/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">System</span>}
                      </div>
                      {role.description && <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-md flex-wrap gap-1">
                        {role.allowedSections.length === 0
                          ? <span className="text-xs text-muted-foreground">No sections granted</span>
                          : role.allowedSections.map((s) => (
                            <span key={s} className="rounded-sm bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">{sectionLabels[s]}</span>
                          ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {role.permissions.length === 0
                          ? <span className="text-xs text-muted-foreground">None</span>
                          : role.permissions.map((p) => (
                            <span key={p} className="rounded-sm bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{capabilityLabels[p]?.label ?? p}</span>
                          ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{role.employeeCount}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit role" onClick={() => openEdit(role)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} disabled={role.isSystemRole} title={role.isSystemRole ? 'System roles cannot be deleted' : 'Delete role'} onClick={() => void deleteRole(role)} />
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <form onSubmit={saveRole} className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="overflow-y-auto p-6">
              <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit role' : 'New role'}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a role'}</h2>
              </div>

              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium">
                  Role Name <span className="text-destructive">*</span>
                  <input
                    required
                    disabled={editing?.isSystemRole}
                    placeholder="e.g. Night Auditor"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input mt-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {editing?.isSystemRole && <span className="mt-1 block text-xs text-muted-foreground">System roles can't be renamed — other logic in the app relies on this exact name.</span>}
                </label>
                <label className="block text-sm font-medium">
                  Description
                  <input placeholder="e.g. Overnight front desk and reconciliation" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input mt-1.5" />
                </label>
                <div>
                  <p className="text-sm font-medium">Visible Sections</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Choose which sidebar sections this role can see by default.</p>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {sections.map((section) => {
                      const checked = form.allowedSections.includes(section)
                      return (
                        <label
                          key={section}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium transition-colors',
                            checked ? 'border-secondary bg-secondary/10 text-secondary' : 'border-border text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleSection(section)} className="size-4 accent-secondary" />
                          {sectionLabels[section]}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Capabilities</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Specific actions this role is allowed to perform — enforced by the server, not just hidden in the sidebar.</p>
                  <div className="mt-2.5 space-y-2">
                    {capabilities.map((capability) => {
                      const checked = form.permissions.includes(capability)
                      const { label, hint } = capabilityLabels[capability]
                      return (
                        <label
                          key={capability}
                          className={cn(
                            'flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2.5 text-sm transition-colors',
                            checked ? 'border-secondary bg-secondary/10' : 'border-border hover:bg-muted',
                          )}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleCapability(capability)} className="mt-0.5 size-4 accent-secondary" />
                          <span>
                            <span className={cn('block font-medium', checked && 'text-secondary')}>{label}</span>
                            <span className="block text-xs text-muted-foreground">{hint}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t bg-card p-5">
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create role'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
