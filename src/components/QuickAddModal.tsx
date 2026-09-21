import { useState } from 'react'
import type { FormEvent } from 'react'
import { LuLoaderCircle, LuPlus } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'

export type QuickEntity = { id: string; name: string } & Record<string, unknown>

/**
 * The "+ New" button that sits on the same line as a select whose options must
 * exist before a form can be saved (category, unit of measure, department…).
 */
export function QuickNewButton({ onClick, title = 'Create a new one without leaving this form' }: { onClick: () => void; title?: string }) {
  return <ActionButton tone="neutral" icon={<LuPlus />} title={title} onClick={onClick} className="h-10 shrink-0">New</ActionButton>
}

/**
 * Small "create one on the spot" pop-up for name-only reference data. It calls
 * the same create endpoint as the full management screen, then hands the new
 * record back so the parent form can add it to its options and select it —
 * the user never has to close the form they were filling in.
 * Render it OUTSIDE the parent <form> (a sibling at the page root).
 */
export default function QuickAddModal({ kicker = 'Quick add', title, label = 'Name', placeholder, endpoint, responseKey, extraBody, onCreated, onClose }: {
  kicker?: string
  title: string
  label?: string
  placeholder?: string
  endpoint: string
  responseKey: string
  extraBody?: Record<string, unknown>
  onCreated: (entity: QuickEntity) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const response = await api<Record<string, QuickEntity>>(endpoint, { method: 'POST', body: JSON.stringify({ ...extraBody, name: name.trim() }) })
      toast.success(`${title.replace(/^New /, '').replace(/^./, (c) => c.toUpperCase())} created.`)
      onCreated(response[responseKey])
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create it')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      size="sm"
      kicker={kicker}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <button form="quick-add-form" disabled={saving || !name.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />}
            Create
          </button>
        </>
      }
    >
      <form id="quick-add-form" onSubmit={submit} className="p-5">
        <label className="block text-sm font-medium">
          {label} <span className="text-destructive">*</span>
          <input required autoFocus className="input mt-1.5" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="mt-3 text-xs text-muted-foreground">It's selected for you as soon as it's created — the form you were filling in stays exactly as it is.</p>
      </form>
    </ModalShell>
  )
}
