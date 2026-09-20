import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuPencil, LuPlus, LuRuler, LuTrash2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

type UnitRow = { id: string; name: string; systemKey: string | null; _count: { services: number } }

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * CRUD for the shared Units of Measure list ("per X" — item, night, hour, kg…).
 * Rendered as a pop-up wherever it's needed (currently from Products) rather
 * than living on its own sidebar tab.
 */
export default function UnitsOfMeasureModal({ open, onClose }: Props) {
  const toast = useToast()
  const [units, setUnits] = useState<UnitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<UnitRow | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api<{ units: UnitRow[] }>('/units-of-measure')
      setUnits(response.units)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load units'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!open) return
    void load()
    setName('')
    setEditing(null)
  }, [open, load])

  async function addUnit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api('/units-of-measure', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
      toast.success('Unit added.')
      setName('')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add unit')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing || !editingName.trim()) return
    setSaving(true)
    try {
      await api(`/units-of-measure/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name: editingName.trim() }) })
      toast.success('Unit updated.')
      setEditing(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update unit')
    } finally {
      setSaving(false)
    }
  }

  async function removeUnit(unit: UnitRow) {
    if (!window.confirm(`Delete "${unit.name}"?`)) return
    try {
      await api(`/units-of-measure/${unit.id}`, { method: 'DELETE' })
      toast.success('Unit deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete unit')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-secondary">System</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Units of Measure</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              A single set of units — item, person, night, hour, trip, kg — used wherever the system needs to say "per X."
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LuX className="size-5" />
          </button>
        </div>

        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            <LuCircleAlert />
            {error}
          </div>
        )}

        <form onSubmit={addUnit} className="mt-6 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. box" className="input flex-1" />
          <button disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <LuPlus /> Add unit
          </button>
        </form>

        {loading ? (
          <div className="mt-7 flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading units…</div>
        ) : units.length === 0 ? (
          <div className="mt-7 rounded-sm border bg-card p-12 text-center text-sm text-muted-foreground shadow-sm">No units yet. Add one above.</div>
        ) : (
          <div className="mt-6 space-y-2">
            {units.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between rounded-sm border bg-card p-4 shadow-sm">
                {editing?.id === unit.id ? (
                  <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                    <input required autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="input flex-1" />
                    <button disabled={saving} className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-sm border px-3 py-2 text-xs font-semibold hover:bg-muted">Cancel</button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-sm bg-secondary/10 text-secondary"><LuRuler className="size-4" /></span>
                      <div>
                        <p className="font-semibold">{unit.name}{unit.systemKey && <span className="ml-2 border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground" title="Built-in — used by room billing">Built-in</span>}</p>
                        <p className="text-xs text-muted-foreground">{unit._count.services} service{unit._count.services === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    {!unit.systemKey && <div className="flex gap-1">
                      <button onClick={() => { setEditing(unit); setEditingName(unit.name) }} title="Rename" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil className="size-4" /></button>
                      <button onClick={() => void removeUnit(unit)} title="Delete" className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-4" /></button>
                    </div>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
