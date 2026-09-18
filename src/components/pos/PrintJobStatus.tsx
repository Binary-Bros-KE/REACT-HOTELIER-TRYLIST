import { useEffect, useRef, useState } from 'react'
import { LuBellRing, LuCircleCheck, LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu'
import { getPrintJobStatus, nudgePrintJob, type PrintJobStatus as JobStatus } from '@/lib/printRelay'

const STUCK_AFTER_MS = 8000
const POLL_MS = 2000
const STOP_AFTER_MS = 60_000

/**
 * Watches a relayed print job (see printRelay.ts) after it's queued, so the
 * requester isn't just left guessing. Most jobs are claimed and printed
 * within a second or two — this only starts showing anything once a job has
 * sat unclaimed for a while, which usually means the host device (whoever's
 * connected to the printer) has its tab closed, asleep, or lost its
 * connection, and someone should go check on it.
 */
export function usePrintJobWatcher() {
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [stuck, setStuck] = useState(false)
  const [nudged, setNudged] = useState(false)
  const [nudging, setNudging] = useState(false)
  const startRef = useRef(0)

  useEffect(() => {
    if (!jobId) return
    setStatus('PENDING')
    setStuck(false)
    setNudged(false)
    startRef.current = Date.now()
    let stopped = false
    const timer = window.setInterval(() => {
      void (async () => {
        if (stopped) return
        try {
          const job = await getPrintJobStatus(jobId)
          if (stopped) return
          setStatus(job.status)
          setNudged(!!job.nudgedAt)
          if (job.status === 'DONE' || job.status === 'FAILED') { stopped = true; window.clearInterval(timer); return }
          const elapsed = Date.now() - startRef.current
          if (elapsed > STUCK_AFTER_MS) setStuck(true)
          if (elapsed > STOP_AFTER_MS) { stopped = true; window.clearInterval(timer) }
        } catch { /* transient network blip — next tick tries again */ }
      })()
    }, POLL_MS)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [jobId])

  async function nudge() {
    if (!jobId || nudging) return
    setNudging(true)
    try {
      await nudgePrintJob(jobId)
      setNudged(true)
    } catch {
      // Already DONE/FAILED by the time this landed — the status poll above
      // will pick that up on its next tick, nothing to show here.
    } finally {
      setNudging(false)
    }
  }

  return { watch: setJobId, status, stuck, nudged, nudging, nudge }
}

export type PrintJobWatcher = ReturnType<typeof usePrintJobWatcher>

/** Inline status strip for a relayed print — renders nothing until a job
 * has actually been queued, and nothing once it's been waiting only
 * briefly (the common case: printed within a second or two). */
export function PrintJobStatusBar({ watcher }: { watcher: PrintJobWatcher }) {
  const { status, stuck, nudged, nudging, nudge } = watcher
  if (!status || status === 'DONE') return null

  if (status === 'FAILED') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <LuTriangleAlert className="size-3.5" /> Printing failed on the other end — try again, or print here instead.
      </p>
    )
  }

  if (!stuck) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <LuLoaderCircle className="size-3.5 animate-spin" /> Waiting for the printer…
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-warning/30 bg-warning/10 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <LuTriangleAlert className="size-3.5" /> Still waiting — the printer's device might not be open right now.
      </p>
      <button
        type="button"
        onClick={() => void nudge()}
        disabled={nudging || nudged}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-warning px-2.5 py-1.5 text-[11px] font-bold text-warning-foreground disabled:opacity-60"
      >
        {nudging ? <LuLoaderCircle className="size-3.5 animate-spin" /> : nudged ? <LuCircleCheck className="size-3.5" /> : <LuBellRing className="size-3.5" />}
        {nudged ? 'Nudged' : 'Nudge'}
      </button>
    </div>
  )
}
