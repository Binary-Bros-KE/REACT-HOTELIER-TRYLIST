import type { ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'accent'

const TONES: Record<Tone, { label: string; icon: string }> = {
  primary: { label: 'bg-primary text-primary-foreground', icon: 'text-primary' },
  success: { label: 'bg-success text-white', icon: 'text-success' },
  danger: { label: 'bg-destructive text-white', icon: 'text-destructive' },
  warning: { label: 'bg-warning text-white', icon: 'text-warning' },
  accent: { label: 'bg-accent text-accent-foreground', icon: 'text-accent' },
}

/**
 * Parallelogram "tab" button — a white icon block butted against a coloured
 * label block, both cut on the same slant. The wrapper carries the drop
 * shadow because clip-path would otherwise clip a box-shadow away.
 */
export default function SlantButton({
  icon, children, tone = 'primary', loading, disabled, onClick, title, className,
}: {
  icon: ReactNode
  children: ReactNode
  tone?: Tone
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  className?: string
}) {
  const t = TONES[tone]
  return (
    <span className={cn('inline-block drop-shadow-[0_1px_1px_rgba(2,6,23,0.35)]', (disabled || loading) && 'opacity-60', className)}>
      <button
        type="button"
        title={title}
        disabled={disabled || loading}
        onClick={onClick}
        className="group flex h-9 items-stretch text-[11px] font-bold uppercase tracking-wider transition enabled:hover:brightness-110 enabled:active:translate-y-px disabled:cursor-not-allowed [clip-path:polygon(10px_0,100%_0,calc(100%-10px)_100%,0_100%)]"
      >
        <span className={cn('flex w-11 items-center justify-center bg-white pl-2 text-base', t.icon)}>
          {loading ? <LuLoaderCircle className="size-4 animate-spin" /> : icon}
        </span>
        <span className={cn('flex items-center whitespace-nowrap pl-3 pr-5 [clip-path:polygon(8px_0,100%_0,100%_100%,0_100%)]', t.label)}>
          {children}
        </span>
      </button>
    </span>
  )
}
