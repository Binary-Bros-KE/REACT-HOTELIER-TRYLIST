import { useState } from 'react'
import { LuLoaderCircle, LuPlus, LuScissors, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { receiptItemName, receiptVariantSuffix } from '@/lib/receiptFields'
import type { ReceiptOrderItem } from './OrderReceipt'

const MAX_NEW_BILLS = 8
const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
// One unit of a line: its price plus its add-ons (add-ons are per unit).
const unitValue = (item: ReceiptOrderItem) => Number(item.unitPrice) + item.addons.reduce((sum, addon) => sum + Number(addon.unitPrice) * addon.quantity, 0)

/** Super Admin: share one served, unpaid bill out into separate bills - pick how many
 * of each item go to each new bill; whatever isn't moved stays on this one. */
export default function SplitBillModal<T>({ order, onClose, onSplit }: {
  order: { id: string; orderNumber: number; items: ReceiptOrderItem[] }
  onClose: () => void
  onSplit: (result: { order: T; newOrders: { orderNumber: number }[] }) => void
}) {
  const toast = useToast()
  // moves[bill][itemId] = how many of that item go to that new bill.
  const [moves, setMoves] = useState<Record<string, number>[]>([{}])
  const [saving, setSaving] = useState(false)

  const movedOf = (itemId: string, except?: number) => moves.reduce((sum, bill, index) => sum + (index === except ? 0 : bill[itemId] ?? 0), 0)
  const left = (item: ReceiptOrderItem) => item.quantity - movedOf(item.id)
  const billTotal = (bill: Record<string, number>) => order.items.reduce((sum, item) => sum + unitValue(item) * (bill[item.id] ?? 0), 0)
  const leftTotal = order.items.reduce((sum, item) => sum + unitValue(item) * left(item), 0)
  const leftCount = order.items.reduce((sum, item) => sum + left(item), 0)

  function setQty(billIndex: number, item: ReceiptOrderItem, raw: string) {
    const most = item.quantity - movedOf(item.id, billIndex)
    const qty = Math.max(0, Math.min(most, Math.floor(Number(raw) || 0)))
    setMoves((cur) => cur.map((bill, i) => (i === billIndex ? { ...bill, [item.id]: qty } : bill)))
  }

  const emptyBill = moves.findIndex((bill) => Object.values(bill).every((qty) => !qty))
  const problem = leftCount < 1 ? 'Leave at least one item on this bill.' : emptyBill >= 0 ? `New bill ${emptyBill + 1} has no items yet.` : null

  async function submit() {
    if (problem || saving) return
    setSaving(true)
    try {
      const bills = moves.map((bill) => ({ lines: Object.entries(bill).filter(([, qty]) => qty > 0).map(([itemId, quantity]) => ({ itemId, quantity })) }))
      const result = await api<{ order: T; newOrders: { orderNumber: number }[] }>(`/pos/orders/${order.id}/split`, { method: 'POST', body: JSON.stringify({ bills }) })
      toast.success(`Split into ${result.newOrders.map((o) => `#${o.orderNumber}`).join(', ')}.`)
      onSplit(result)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not split this bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Split bill</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Order #{order.orderNumber}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Choose how many of each item go on each new bill. Whatever you don't move stays on this bill.</p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-4" /></button>
        </div>

        <div className="overflow-auto p-4">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 text-left">Item</th>
                <th className="w-24 px-2 py-2 text-right">This bill</th>
                {moves.map((_, index) => (
                  <th key={index} className="w-28 px-2 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      New bill {index + 1}
                      {moves.length > 1 && <button type="button" title="Remove this bill" onClick={() => setMoves((cur) => cur.filter((__, i) => i !== index))} className="text-muted-foreground hover:text-destructive"><LuX className="size-3" /></button>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{receiptItemName(item)}{receiptVariantSuffix(item)}</span>
                    <span className="block text-xs text-muted-foreground">{item.quantity} × {formatKes(unitValue(item))}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{left(item)}</td>
                  {moves.map((bill, index) => (
                    <td key={index} className="px-2 py-2 text-right">
                      <input type="number" min={0} max={item.quantity} value={bill[item.id] || ''} placeholder="0" onChange={(e) => setQty(index, item, e.target.value)} className="input h-9 w-20 text-right tabular-nums" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-200 font-bold text-black">
                <td className="py-2 pr-3">Total</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatKes(leftTotal)}</td>
                {moves.map((bill, index) => <td key={index} className="px-2 py-2 text-right tabular-nums">{formatKes(billTotal(bill))}</td>)}
              </tr>
            </tfoot>
          </table>
          {moves.length < MAX_NEW_BILLS && (
            <button type="button" onClick={() => setMoves((cur) => [...cur, {}])} className="mt-3 inline-flex items-center gap-1.5 border-2 border-dashed px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-secondary hover:bg-secondary/5"><LuPlus className="size-3.5" /> Add a bill</button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          <p className="text-xs text-muted-foreground">{problem ?? 'Each new bill gets its own order number, to be paid and printed separately.'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
            <button type="button" disabled={Boolean(problem) || saving} onClick={() => void submit()} className="inline-flex items-center gap-2 bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground disabled:opacity-50">
              {saving ? <LuLoaderCircle className="animate-spin" /> : <LuScissors className="size-4" />} Split into {moves.length + 1} bills
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
