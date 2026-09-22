import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuLock, LuLoaderCircle, LuPencil, LuPlus, LuRuler, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'

type MeasurementKind = 'HOURS' | 'MINUTES' | 'DAYS' | 'HEADCOUNT' | 'EACH'
type Unit = {
  id: string
  name: string
  systemKey: string | null
  measurementKind: MeasurementKind | null
  createdAt: string
  updatedAt: string
  _count: { services: number }
}
type Form = { name: string; measurementKind: MeasurementKind }
const emptyForm: Form = { name: '', measurementKind: 'EACH' }

// What each kind actually does — shown next to the picker so "Headcount" or
// "Each" isn't a guess. Kept in sync with src/lib/roomCharge.ts on the backend.
const KIND_INFO: Record<MeasurementKind, { label: string; hint: string }> = {
  HOURS: { label: 'Hours', hint: 'Auto-fills from check-in/check-out, in hours (e.g. 4.3) — editable before charging.' },
  MINUTES: { label: 'Minutes', hint: 'Auto-fills from check-in/check-out, in minutes — editable before charging.' },
  DAYS: { label: 'Days', hint: 'Auto-fills from check-in/check-out as whole days — any part of a day counts as one.' },
  HEADCOUNT: { label: 'Headcount', hint: 'Auto-fills from the number of people on the booking — editable before charging.' },
  EACH: { label: 'Each', hint: 'A flat quantity of 1 — a whole fixed-price package, no auto-calculation.' },
}
const KIND_ORDER: MeasurementKind[] = ['HOURS', 'MINUTES', 'DAYS', 'HEADCOUNT', 'EACH']

export default function UnitsOfMeasure() {
  const toast = useToast()
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form>(emptyForm)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ units: Unit[] }>('/units-of-measure')
      setUnits(response.units)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load units of measure'
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
  function openEdit(unit: Unit) {
    setEditing(unit)
    setForm({ name: unit.name, measurementKind: unit.measurementKind ?? 'EACH' })
    setShowForm(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), measurementKind: form.measurementKind }
      await api(editing ? `/units-of-measure/${editing.id}` : '/units-of-measure', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      toast.success(editing ? 'Unit updated.' : 'Unit created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save unit')
    } finally {
      setSaving(false)
    }
  }

  async function remove(unit: Unit) {
    if (!window.confirm(`Delete "${unit.name}"?`)) return
    try {
      await api(`/units-of-measure/${unit.id}`, { method: 'DELETE' })
      toast.success('Unit deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete unit')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-4xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Units of Measure" />

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">How you price things</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Used by Rooms, Services and Products — pick any name you like (Person, Bus Seat, Week…), and how it's measured decides
              whether it auto-calculates from a booking's dates, its headcount, or is just a flat quantity of 1.
              Hour, Night, Day, Person and Each come built in and can't be renamed or deleted.
            </p>
          </div>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate} className="shrink-0">New unit</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading units…</div>
        ) : units.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No units yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:text-xs [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide">
                  <th className="w-12" aria-label="Icon" />
                  <th>Unit</th>
                  <th>Measured by</th>
                  <th className="text-right">Used by</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr:last-child]:border-0">
                {units.map((unit) => (
                  <tr key={unit.id} className="align-middle transition hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className="flex size-9 items-center justify-center rounded-md border bg-secondary/10 text-secondary">
                        <LuRuler className="size-4" />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1.5 font-semibold">
                        {unit.name}
                        {unit.systemKey && <LuLock className="size-3 text-muted-foreground" title="Built in — can't be renamed or deleted" />}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{unit.measurementKind ? KIND_INFO[unit.measurementKind].label : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{unit._count.services}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPencil />} disabled={!!unit.systemKey} title={unit.systemKey ? "Built-in units can't be edited" : 'Edit'} onClick={() => openEdit(unit)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} disabled={!!unit.systemKey || unit._count.services > 0} title={unit.systemKey ? "Built-in units can't be deleted" : unit._count.services > 0 ? 'Reassign its services first' : 'Delete'} onClick={() => void remove(unit)} />
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
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit unit' : 'New unit'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.name : 'Add a unit'}</h2>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Name" required>
                <input required autoFocus placeholder="e.g. Bus Seat, Week, Guide" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
              </Field>
              <Field label="Measured by" required>
                <select required value={form.measurementKind} onChange={(e) => setForm({ ...form, measurementKind: e.target.value as MeasurementKind })} className="input">
                  {KIND_ORDER.map((kind) => <option key={kind} value={kind}>{KIND_INFO[kind].label}</option>)}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">{KIND_INFO[form.measurementKind].hint}</span>
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving || !form.name.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create unit'}
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
