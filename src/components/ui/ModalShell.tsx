import type { ReactNode } from 'react'
import { LuX } from 'react-icons/lu'
import { cn } from '@/lib/utils'

/** Hard-edged modal chrome (light title bar with accent underline, black Close, optional footer bar). */
export default function ModalShell({ kicker, title, subtitle, onClose, footer, size = 'md', children }: {
  kicker: string
  title: string
  subtitle?: string
  onClose: () => void
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={cn(
        'flex max-h-[92vh] w-full flex-col overflow-hidden border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]',
        size === 'sm' ? 'max-w-md' : size === 'md' ? 'max-w-xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-4xl',
      )}>
        <div className="flex items-start justify-between gap-4 border-b-4 border-accent bg-muted/60 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{kicker}</p>
            <h2 className="mt-0.5 truncate font-display text-2xl font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex shrink-0 items-center gap-1.5 bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-black/80"><LuX className="size-4" /> Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-foreground/15 bg-muted/40 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}
