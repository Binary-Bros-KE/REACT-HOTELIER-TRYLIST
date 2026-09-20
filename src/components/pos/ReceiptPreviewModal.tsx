import { useEffect, useState } from 'react'
import { LuLoaderCircle, LuPrinter, LuShare2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { receiptToText, shareReceipt } from '@/lib/receipt'
import { printReceipt } from '@/lib/thermalPrinter'
import OrderReceipt, { type ReceiptOrder, type ReceiptProfile } from './OrderReceipt'
import { usePrintJobWatcher, PrintJobStatusBar } from './PrintJobStatus'

/**
 * Read-only receipt preview for an order, with Print + Share at the bottom.
 * Fetches the full order so it works from anywhere that only has an id.
 */
export default function ReceiptPreviewModal({
  orderId,
  profile,
  onClose,
}: {
  orderId: string
  profile: ReceiptProfile
  onClose: () => void
}) {
  const toast = useToast()
  const [order, setOrder] = useState<ReceiptOrder | null>(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const printJob = usePrintJobWatcher()

  useEffect(() => {
    let alive = true
    setOrder(null)
    setError('')
    api<{ order: ReceiptOrder }>(`/pos/orders/${orderId}`)
      .then((r) => { if (alive) setOrder(r.order) })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Could not load the receipt') })
    return () => { alive = false }
  }, [orderId])

  async function onPrint() {
    if (!order || printing) return
    setPrinting(true)
    try {
      const result = await printReceipt(order, profile)
      if (result.method === 'thermal') toast.success('Receipt sent to printer')
      else if (result.method === 'relay') {
        toast.success('Sent to the printer — printing shortly')
        if (result.jobId) printJob.watch(result.jobId)
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not print the receipt')
    } finally {
      setPrinting(false)
    }
  }

  async function onShare() {
    if (!order || sharing) return
    setSharing(true)
    try {
      let shareUrl: string | undefined
      try {
        const r = await api<{ url: string }>(`/pos/orders/${order.id}/share`, { method: 'POST', body: '{}' })
        shareUrl = r.url
      } catch { /* endpoint not available — share text only */ }
      await shareReceipt(receiptToText(order, profile, shareUrl))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not share the receipt')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between border-b-4 border-accent bg-muted/60 px-4 py-3 print:hidden">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Receipt</p>
          <button onClick={onClose} aria-label="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="p-8 text-center text-sm text-destructive">{error}</div>
          ) : !order ? (
            <div className="flex min-h-40 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading receipt…</div>
          ) : (
            <OrderReceipt order={order} profile={profile} />
          )}
        </div>

        <div className="border-t p-3 print:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={onPrint}
              disabled={!order || printing}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {printing ? <LuLoaderCircle className="size-3.5 animate-spin" /> : <LuPrinter className="size-3.5" />} Print
            </button>
            <button
              onClick={onShare}
              disabled={!order || sharing}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-accent px-3 py-2.5 text-xs font-bold text-accent-foreground disabled:opacity-50"
            >
              {sharing ? <LuLoaderCircle className="size-3.5 animate-spin" /> : <LuShare2 className="size-3.5" />} Share
            </button>
          </div>
          <PrintJobStatusBar watcher={printJob} />
        </div>
      </div>
    </div>
  )
}
