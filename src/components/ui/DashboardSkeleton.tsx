import { cn } from '@/lib/utils'

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-muted', className)} />
}

function StatSkeleton() {
  return (
    <div className="border bg-card p-5">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="size-8" />
      </div>
      <SkeletonBlock className="mt-4 h-7 w-32" />
      <SkeletonBlock className="mt-3 h-2.5 w-40" />
    </div>
  )
}

export function TablePanelSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden border bg-card', className)}>
      <div className="flex items-center justify-between border-b p-4">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <div className="h-9 animate-pulse bg-primary/15" />
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <SkeletonBlock className="h-3.5 flex-1" />
            <SkeletonBlock className="h-3.5 w-16" />
            <SkeletonBlock className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Placeholder shaped like the real dashboard so nothing jumps when data lands. */
export default function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="mt-7">
      <SkeletonBlock className="h-3 w-44" />
      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)}
      </div>
      <SkeletonBlock className="mt-6 h-3 w-28" />
      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <StatSkeleton key={i} />)}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TablePanelSkeleton />
        <TablePanelSkeleton />
      </div>
      <TablePanelSkeleton className="mt-6" rows={4} />
    </div>
  )
}
