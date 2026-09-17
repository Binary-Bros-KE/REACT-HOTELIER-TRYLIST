import { useEffect, useRef } from 'react'
import { useAppSelector } from '@/store/hooks'
import { api } from '@/lib/api'
import { getThermalSettings, buildReceiptBytes, sendLocal } from '@/lib/thermalPrinter'
import { listPendingPrintJobs, claimPrintJob, completePrintJob, failPrintJob } from '@/lib/printRelay'
import type { ReceiptOrder, ReceiptProfile } from '@/components/pos/OrderReceipt'

const POLL_MS = 3000

/**
 * Turns this device into a print-job host for its own working location,
 * automatically, with nothing to configure beyond the printer connection
 * that already has to be set up for this device to print locally at all.
 * While a real hardware connection (usb/bluetooth/bridge) is enabled here,
 * this polls for jobs OTHER devices at the same location queued (because
 * they have no printer of their own — most waiters' phones) and prints
 * them over this device's own connection. See src/lib/printRelay.ts.
 *
 * Mounted once, in AppShell, so it keeps running across the whole app for
 * as long as this tab stays open — not tied to any one POS page.
 */
export function usePrintRelayHost(): void {
  const user = useAppSelector((s) => s.auth.user)
  const locationId = user?.locations.length === 1 ? user.locations[0].id : (user?.defaultLocation?.id ?? null)
  const profileRef = useRef<ReceiptProfile | undefined>(undefined)
  const runningRef = useRef(false)

  useEffect(() => {
    if (!locationId) return

    let cancelled = false
    const timer = window.setInterval(() => { void tick() }, POLL_MS)

    async function tick() {
      if (cancelled || runningRef.current) return
      const s = getThermalSettings()
      if (!s.enabled || s.connection === 'relay' || s.connection === 'dialog') return
      runningRef.current = true
      try {
        const jobs = await listPendingPrintJobs(locationId!)
        for (const job of jobs) {
          if (cancelled) break
          const claimed = await claimPrintJob(job.id)
          if (!claimed) continue // another device's poll won the race — fine
          try {
            if (profileRef.current === undefined) {
              const { profile } = await api<{ profile: ReceiptProfile }>('/business-profile')
              profileRef.current = profile
            }
            const { order } = await api<{ order: ReceiptOrder }>(`/pos/orders/${claimed.orderId}`)
            const bytes = buildReceiptBytes(order, profileRef.current ?? null, s)
            await sendLocal(bytes, s)
            await completePrintJob(job.id)
          } catch (cause) {
            await failPrintJob(job.id, cause instanceof Error ? cause.message : 'Print failed').catch(() => {})
          }
        }
      } catch {
        // Transient — next tick tries again. Nothing for a background host to show.
      } finally {
        runningRef.current = false
      }
    }

    return () => { cancelled = true; window.clearInterval(timer) }
  }, [locationId])
}
