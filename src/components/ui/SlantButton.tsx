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

/** Rectangular action button with a slightly darker icon block on the left. */
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
    <span className={cn('inline-block', (disabled || loading) && 'opacity-60', className)}>
      <button
        type="button"
        title={title}
        disabled={disabled || loading}
        onClick={onClick}
        className={cn('flex h-8 items-stretch text-[11px] font-bold uppercase tracking-wider transition enabled:hover:brightness-110 enabled:active:translate-y-px disabled:cursor-not-allowed shadow-sm', TONES[tone])}
      >
        <span className="flex w-9 items-center justify-center bg-black/15 text-sm">
          {loading ? <LuLoaderCircle className="size-4 animate-spin" /> : icon}
        </span>
        <span className="flex items-center whitespace-nowrap px-3.5">{children}</span>
      </button>
    </span>
  )
}
