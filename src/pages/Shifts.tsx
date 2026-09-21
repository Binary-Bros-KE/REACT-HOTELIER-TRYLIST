import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuClock4, LuLoaderCircle, LuPencil, LuPlus, LuTrash2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type ShiftTemplate = {
  id: string
  name: string
  startTime: string
  endTime: string
  graceMinutesBefore: number
  graceMinutesAfter: number
  isActive: boolean
}
type TemplateForm = { name: string; startTime: string; endTime: string; graceMinutesBefore: string; graceMinutesAfter: string; isActive: boolean }
const emptyTemplateForm: TemplateForm = { name: '', startTime: '06:00', endTime: '14:00', graceMinutesBefore: '15', graceMinutesAfter: '15', isActive: true }

type RotationSlot = { id: string; position: number; days: number; shiftTemplate: ShiftTemplate }
type Rotation = { id: string; anchorDate: string; cycleLengthDays: number; employee: { id: string; firstName: string; lastName: string; jobTitle: string }; slots: RotationSlot[] }

type Employee = { id: string; firstName: string; lastName: string; jobTitle: string; status: string }

type SlotForm = { shiftTemplateId: string; days: string }
type RotationForm = { anchorDate: string; slots: SlotForm[] }

export default function Shifts() {
  const toast = useToast()
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm)
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)

  const [rotationEmployee, setRotationEmployee] = useState<Employee | null>(null)
  const [rotationForm, setRotationForm] = useState<RotationForm | null>(null)
  const [savingRotation, setSavingRotation] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [t, r, e] = await Promise.all([
        api<{ templates: ShiftTemplate[] }>('/shifts/templates'),
        api<{ rotations: Rotation[] }>('/shifts/rotations'),
        api<{ employees: Employee[] }>('/employees'),
      ])
      setTemplates(t.templates)
      setRotations(r.rotations)
      setEmployees(e.employees.filter((emp) => emp.status === 'ACTIVE'))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load shifts'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const rotationByEmployee = useMemo(() => new Map(rotations.map((r) => [r.employee.id, r])), [rotations])

  function openCreateTemplate() {
    setEditingTemplate(null)
    setTemplateForm(emptyTemplateForm)
    setShowTemplateForm(true)
  }

  function openEditTemplate(template: ShiftTemplate) {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name, startTime: template.startTime, endTime: template.endTime,
      graceMinutesBefore: String(template.graceMinutesBefore), graceMinutesAfter: String(template.graceMinutesAfter),
      isActive: template.isActive,
    })
    setShowTemplateForm(true)
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault()
    setSavingTemplate(true)
    try {
      const payload = {
        name: templateForm.name.trim(), startTime: templateForm.startTime, endTime: templateForm.endTime,
        graceMinutesBefore: Number(templateForm.graceMinutesBefore) || 0, graceMinutesAfter: Number(templateForm.graceMinutesAfter) || 0,
        isActive: templateForm.isActive,
      }
      await api(editingTemplate ? `/shifts/templates/${editingTemplate.id}` : '/shifts/templates', { method: editingTemplate ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(editingTemplate ? 'Shift updated.' : 'Shift created.')
      setShowTemplateForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save this shift')
    } finally {
      setSavingTemplate(false)
    }
  }

  async function deleteTemplate(template: ShiftTemplate) {
    if (!window.confirm(`Delete "${template.name}"?`)) return
    try {
      await api(`/shifts/templates/${template.id}`, { method: 'DELETE' })
      toast.success('Shift deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete this shift')
    }
  }

  function openRotation(employee: Employee) {
    const existing = rotationByEmployee.get(employee.id)
    setRotationEmployee(employee)
    setRotationForm({
      anchorDate: existing ? existing.anchorDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      slots: existing && existing.slots.length > 0
        ? existing.slots.map((s) => ({ shiftTemplateId: s.shiftTemplate.id, days: String(s.days) }))
        : [{ shiftTemplateId: templates[0]?.id ?? '', days: '7' }],
    })
  }

  function updateSlot(index: number, patch: Partial<SlotForm>) {
    setRotationForm((f) => f && { ...f, slots: f.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  }
  function addSlot() {
    setRotationForm((f) => f && { ...f, slots: [...f.slots, { shiftTemplateId: templates[0]?.id ?? '', days: '7' }] })
  }
  function removeSlot(index: number) {
    setRotationForm((f) => f && { ...f, slots: f.slots.filter((_, i) => i !== index) })
  }

  async function saveRotation(event: FormEvent) {
    event.preventDefault()
    if (!rotationEmployee || !rotationForm) return
    setSavingRotation(true)
    try {
      const payload = {
        anchorDate: rotationForm.anchorDate,
        slots: rotationForm.slots.map((s) => ({ shiftTemplateId: s.shiftTemplateId, days: Number(s.days) || 1 })),
      }
      await api(`/shifts/employees/${rotationEmployee.id}/rotation`, { method: 'PUT', body: JSON.stringify(payload) })
      toast.success('Rotation saved.')
      setRotationEmployee(null)
      setRotationForm(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save this rotation')
    } finally {
      setSavingRotation(false)
    }
  }

  async function clearRotation() {
    if (!rotationEmployee) return
    if (!window.confirm(`Remove ${rotationEmployee.firstName}'s rotation? They'll be unrestricted (no shift enforcement) until a new one is set.`)) return
    setSavingRotation(true)
    try {
      await api(`/shifts/employees/${rotationEmployee.id}/rotation`, { method: 'DELETE' })
      toast.success('Rotation removed.')
      setRotationEmployee(null)
      setRotationForm(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not remove this rotation')
    } finally {
      setSavingRotation(false)
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-5xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Team" title="Shifts" />

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Work-hours windows</h2>
            <p className="text-xs text-muted-foreground">Shift templates. Outside their shift, an employee can't sign in — unless they're unrestricted (no rotation).</p>
          </div>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreateTemplate} className="shrink-0">New shift</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
        ) : templates.length === 0 ? (
          <div className="min-h-40 p-12 text-center text-sm text-muted-foreground">No shifts yet — add one, e.g. "Day Shift" 06:00–14:00.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th className="w-12" aria-label="Icon" />
                  <th>Shift</th>
                  <th>Hours</th>
                  <th>Grace</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {templates.map((t) => (
                  <tr key={t.id} className="align-middle transition hover:bg-muted/40">
                    <td className="px-4 py-3"><span className="flex size-9 items-center justify-center rounded-md border bg-secondary/10 text-secondary"><LuClock4 className="size-4" /></span></td>
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{t.startTime}–{t.endTime}{t.endTime <= t.startTime ? ' (overnight)' : ''}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">±{t.graceMinutesBefore}/{t.graceMinutesAfter} min</td>
                    <td className="px-4 py-3">
                      <span className={cn('keep-round inline-flex border border-dashed px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide', t.isActive ? 'border-success/70 text-success' : 'border-muted-foreground/50 text-muted-foreground')}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEditTemplate(t)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete" onClick={() => void deleteTemplate(t)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="border-b p-5">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Who's on which shift</h2>
            <p className="text-xs text-muted-foreground">Employee rotations.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
        ) : employees.length === 0 ? (
          <div className="min-h-40 p-12 text-center text-sm text-muted-foreground">No active employees yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th>Employee</th>
                  <th>Job title</th>
                  <th>Rotation</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {employees.map((emp) => {
                  const rotation = rotationByEmployee.get(emp.id)
                  return (
                    <tr key={emp.id} className="align-middle transition hover:bg-muted/40">
                      <td className="px-4 py-3 font-semibold">{emp.firstName} {emp.lastName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{emp.jobTitle}</td>
                      <td className="px-4 py-3">
                        {rotation ? (
                          <span className="text-xs">{rotation.slots.map((s) => `${s.shiftTemplate.name} (${s.days}d)`).join(' → ')}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unrestricted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ActionButton tone="neutral" icon={<LuClock4 />} onClick={() => openRotation(emp)}>{rotation ? 'Edit rotation' : 'Assign rotation'}</ActionButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showTemplateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveTemplate} className="w-full max-w-md border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="flex items-start justify-between -mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editingTemplate ? 'Edit shift' : 'New shift'}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{editingTemplate ? editingTemplate.name : 'Add a shift'}</h2>
              </div>
              <button type="button" onClick={() => setShowTemplateForm(false)} className="bg-black p-2 text-white transition hover:bg-black/80"><LuX /></button>
            </div>
            <div className="mt-6 space-y-4">
              <Field label="Name" required><input required autoFocus placeholder="e.g. Day Shift" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} className="input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start time" required><input required type="time" value={templateForm.startTime} onChange={(e) => setTemplateForm({ ...templateForm, startTime: e.target.value })} className="input" /></Field>
                <Field label="End time" required><input required type="time" value={templateForm.endTime} onChange={(e) => setTemplateForm({ ...templateForm, endTime: e.target.value })} className="input" /></Field>
              </div>
              <p className="text-xs text-muted-foreground">If end is earlier than (or equal to) start, the shift is treated as overnight — crossing midnight.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Grace before (min)"><input type="number" min="0" max="180" value={templateForm.graceMinutesBefore} onChange={(e) => setTemplateForm({ ...templateForm, graceMinutesBefore: e.target.value })} className="input" /></Field>
                <Field label="Grace after (min)"><input type="number" min="0" max="180" value={templateForm.graceMinutesAfter} onChange={(e) => setTemplateForm({ ...templateForm, graceMinutesAfter: e.target.value })} className="input" /></Field>
              </div>
              <label className="flex items-center justify-between rounded-sm border bg-background px-3 py-2.5 text-sm font-medium">
                Active
                <input type="checkbox" checked={templateForm.isActive} onChange={(e) => setTemplateForm({ ...templateForm, isActive: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowTemplateForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={savingTemplate || !templateForm.name.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {savingTemplate && <LuLoaderCircle className="animate-spin" />}
                {editingTemplate ? 'Save changes' : 'Create shift'}
              </button>
            </div>
          </form>
        </div>
      )}

      {rotationEmployee && rotationForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveRotation} className="w-full max-w-lg border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="flex items-start justify-between -mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Rotation</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{rotationEmployee.firstName} {rotationEmployee.lastName}</h2>
              </div>
              <button type="button" onClick={() => { setRotationEmployee(null); setRotationForm(null) }} className="bg-black p-2 text-white transition hover:bg-black/80"><LuX /></button>
            </div>

            {templates.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">Add a shift template first, then come back to assign a rotation.</p>
            ) : (
              <div className="mt-6 space-y-4">
                <Field label="Starts from" required>
                  <input required type="date" value={rotationForm.anchorDate} onChange={(e) => setRotationForm({ ...rotationForm, anchorDate: e.target.value })} className="input" />
                </Field>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Repeating pattern</p>
                  {rotationForm.slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={slot.shiftTemplateId} onChange={(e) => updateSlot(i, { shiftTemplateId: e.target.value })} className="input flex-1">
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.startTime}–{t.endTime})</option>)}
                      </select>
                      <input type="number" min="1" max="90" value={slot.days} onChange={(e) => updateSlot(i, { days: e.target.value })} className="input w-20" />
                      <span className="shrink-0 text-xs text-muted-foreground">days</span>
                      <button type="button" onClick={() => removeSlot(i)} disabled={rotationForm.slots.length <= 1} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><LuTrash2 className="size-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={addSlot} className="inline-flex items-center gap-1.5 text-xs font-semibold text-secondary hover:underline"><LuPlus className="size-3.5" /> Add another stretch</button>
                  <p className="text-xs text-muted-foreground">
                    Cycle length: {rotationForm.slots.reduce((sum, s) => sum + (Number(s.days) || 0), 0)} days, then it repeats. E.g. Day Shift 7 days → Night Shift 7 days repeats every 14 days.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t pt-5">
              <button type="button" onClick={() => void clearRotation()} disabled={savingRotation || !rotationByEmployee.get(rotationEmployee.id)} className="text-xs font-semibold text-destructive hover:underline disabled:opacity-30">
                Remove rotation (unrestrict)
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setRotationEmployee(null); setRotationForm(null) }} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
                <button disabled={savingRotation || templates.length === 0} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                  {savingRotation && <LuLoaderCircle className="animate-spin" />}
                  Save rotation
                </button>
              </div>
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
