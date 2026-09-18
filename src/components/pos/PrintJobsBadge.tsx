import { LuPrinter } from 'react-icons/lu'
import { useAppSelector } from '@/store/hooks'
import { cn } from '@/lib/utils'

/**
 * Shows on whichever device is currently acting as a print-job host (see
 * usePrintRelayHost) — the pending count for its own location, in red once
 * any of them have been nudged by a waiter waiting on it. Renders nothing
 * on a device that isn't hosting (pendingCount stays 0 there).
 */
export default function PrintJobsBadge({ className }: { className?: string }) {
  const { pendingCount, nudgedCount } = useAppSelector((s) => s.printJobs)
  if (pendingCount === 0) return null

  return (
    <span
      title={nudgedCount > 0 ? `${nudgedCount} unprinted receipt${nudgedCount === 1 ? '' : 's'} someone's waiting on` : `${pendingCount} receipt${pendingCount === 1 ? '' : 's'} waiting to print`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold',
        nudgedCount > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-white/15 text-current',
        className,
      )}
    >
      <LuPrinter className="size-3.5" /> {pendingCount}
    </span>
  )
}
