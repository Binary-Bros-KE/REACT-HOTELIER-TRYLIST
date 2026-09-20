import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONES = {
  warning: 'border-warning/70 text-warning',
  secondary: 'border-secondary/70 text-secondary',
  success: 'border-success/70 text-success',
  muted: 'border-muted-foreground/50 text-muted-foreground',
  danger: 'border-destructive/70 text-destructive',
} as const

export type PillTone = keyof typeof TONES

/** Dashed-outline, unfilled, fully rounded status pill. `keep-round` opts out of the square-UI reset. */
export default function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={cn('keep-round inline-block border border-dashed px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', TONES[tone])}>{children}</span>
}
