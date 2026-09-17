import { useEffect, useState } from 'react'
import { LuLoaderCircle, LuPrinter, LuShare2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { receiptToText, shareReceipt } from '@/lib/receipt'
import { printReceipt } from '@/lib/thermalPrinter'
import OrderReceipt, { type ReceiptOrder, type ReceiptProfile } from './OrderReceipt'

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
      else if (result.method === 'relay') toast.success('Sent to the printer — printing shortly')
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-sm bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b p-3 print:hidden">
          <p className="text-sm font-semibold text-secondary">Receipt</p>
          <button onClick={onClose} aria-label="Close" className="rounded-sm p-1.5 text-muted-foreground hover:bg-muted"><LuX className="size-4" /></button>
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

        <div className="flex items-center gap-2 border-t p-3 print:hidden">
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
      </div>
    </div>
  )
}
