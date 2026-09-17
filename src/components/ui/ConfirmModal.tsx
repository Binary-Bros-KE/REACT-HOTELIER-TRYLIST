import type { ReactNode } from 'react'
import { LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu'
import { cn } from '@/lib/utils'

/**
 * The one confirm-before-you-do-it dialog for any destructive or hard-to-
 * undo action (ending a shift, rejecting something, deleting a record...).
 * A warning-toned icon + title + message, Cancel and a Confirm button in
 * the matching tone — never a bare `window.confirm()`, which is easy to
 * dismiss/click through without reading and gives no room to explain what's
 * about to happen.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'warning',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'warning' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  const toneStyle = tone === 'danger'
    ? { icon: 'bg-destructive/10 text-destructive', button: 'bg-destructive text-destructive-foreground hover:opacity-90' }
    : { icon: 'bg-warning/15 text-warning', button: 'bg-warning text-warning-foreground hover:opacity-90' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onCancel() }}
    >
      <div className="w-full max-w-sm rounded-sm border bg-card p-6 shadow-2xl">
        <span className={cn('flex size-11 items-center justify-center rounded-full', toneStyle.icon)}>
          <LuTriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
        {message && <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={loading} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} className={cn('inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold disabled:opacity-60', toneStyle.button)}>
            {loading && <LuLoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
