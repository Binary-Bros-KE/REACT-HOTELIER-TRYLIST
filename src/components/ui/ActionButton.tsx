import type { ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'accent'

const TONES: Record<Tone, string> = {
  neutral: 'bg-gray-200 text-gray-800 enabled:hover:bg-gray-300',
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  success: 'bg-success text-white',
  danger: 'bg-destructive text-white',
  warning: 'bg-warning text-white',
  accent: 'bg-accent text-accent-foreground',
}

/**
 * Rectangular action button. Pass only `icon` (with a `title` for the
 * tooltip / screen readers) for a compact icon button, or `icon` + children
 * for icon-and-label. `tone` sets both blocks; `iconClassName` and
 * `labelClassName` override the background/text of each block independently
 * (e.g. iconClassName="bg-black text-white").
 */
export default function ActionButton({
  icon, children, tone = 'primary', iconClassName, labelClassName, loading, disabled, onClick, title, className,
}: {
  icon: ReactNode
  children?: ReactNode
  tone?: Tone
  iconClassName?: string
  labelClassName?: string
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  title?: string
  className?: string
}) {
  const iconOnly = children == null || children === false
  return (
    <button
      type="button"
      title={title}
      aria-label={iconOnly ? title : undefined}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-stretch overflow-hidden text-[11px] font-bold uppercase tracking-wider shadow-sm transition enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60',
        TONES[tone],
        !iconOnly && 'enabled:hover:brightness-110',
        labelClassName,
        className,
      )}
    >
      <span className={cn('flex items-center justify-center text-sm', iconOnly ? 'w-9' : 'w-9 bg-black/15', iconClassName)}>
        {loading ? <LuLoaderCircle className="size-4 animate-spin" /> : icon}
      </span>
      {!iconOnly && <span className="flex items-center whitespace-nowrap px-3.5">{children}</span>}
    </button>
  )
}
