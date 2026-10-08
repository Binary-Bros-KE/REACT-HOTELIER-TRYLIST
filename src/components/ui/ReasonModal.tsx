import { useState, type FormEvent } from 'react'
import { LuLoaderCircle, LuX } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { TouchTextarea } from './TouchInput'

/** A reason/note prompt with a touch keyboard, for machines with no keyboard
 * of their own — a styled drop-in for window.prompt(), which offers no
 * keyboard at all on a touch-only till. */
export default function ReasonModal({ title, message, placeholder, required = true, confirmLabel = 'Confirm', tone = 'default', busy, onCancel, onConfirm }: {
  title: string
  message?: string
  placeholder?: string
  required?: boolean
  confirmLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = reason.trim()
    if (required && !trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="-mx-6 -mt-6 flex items-start justify-between border-b-4 border-accent bg-muted/60 px-6 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onCancel} title="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-4" /></button>
        </div>
        {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
        <TouchTextarea
          autoFocus
          rows={3}
          value={reason}
          onValueChange={setReason}
          placeholder={placeholder ?? (required ? 'Reason…' : 'Optional note…')}
          className="input mt-3 w-full"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button
            disabled={busy || (required && !reason.trim())}
            className={cn(
              'inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold disabled:opacity-60',
              tone === 'danger' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
            )}
          >
            {busy && <LuLoaderCircle className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
