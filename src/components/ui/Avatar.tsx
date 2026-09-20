import { LuUserRound } from 'react-icons/lu'
import { cn } from '@/lib/utils'

const SIZES = { sm: 'size-8', md: 'size-10', lg: 'size-14' } as const
const ICONS = { sm: 'size-4', md: 'size-5', lg: 'size-7' } as const

/** Neutral grey profile placeholder — swap for a photo once employees have one. */
export default function Avatar({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center bg-muted text-muted-foreground', SIZES[size], className)} aria-hidden>
      <LuUserRound className={ICONS[size]} />
    </span>
  )
}
