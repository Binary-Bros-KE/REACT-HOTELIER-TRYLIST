import type { ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'

type Tone = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'accent'

const TONES: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  success: 'bg-success text-white',
  danger: 'bg-destructive text-white',
  warning: 'bg-warning text-white',
  accent: 'bg-accent text-accent-foreground',
}

/**
 * Parallelogram button: one slanted shape with a slightly darker icon block
 * on the left. The wrapper carries the drop shadow because clip-path would
 * otherwise clip a box-shadow away.
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
  return (
    <span className={cn('inline-block drop-shadow-[0_1px_1px_rgba(2,6,23,0.3)]', (disabled || loading) && 'opacity-60', className)}>
      <button
        type="button"
        title={title}
        disabled={disabled || loading}
        onClick={onClick}
        className={cn('flex h-8 items-stretch text-[11px] font-bold uppercase tracking-wider transition enabled:hover:brightness-110 enabled:active:translate-y-px disabled:cursor-not-allowed [clip-path:polygon(9px_0,100%_0,calc(100%-9px)_100%,0_100%)]', TONES[tone])}
      >
        <span className="flex w-9 items-center justify-center bg-black/15 pl-2 text-sm">
          {loading ? <LuLoaderCircle className="size-4 animate-spin" /> : icon}
        </span>
        <span className="flex items-center whitespace-nowrap pl-3 pr-5">{children}</span>
      </button>
    </span>
  )
}
