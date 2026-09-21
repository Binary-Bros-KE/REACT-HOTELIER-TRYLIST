import type { ReceiptOrder, ReceiptProfile } from '@/components/pos/OrderReceipt'
import { receiptFooterText, receiptHeaderText, receiptItemName, receiptPhone, servedByName, showsTaxAsAddedOn } from '@/lib/receiptFields'

const money = (v: number | string) => `KSh ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const RULE = '--------------------------------'

/** The receipt as a plain-text block for a WhatsApp / SMS / share message. */
export function receiptToText(order: ReceiptOrder, profile: ReceiptProfile, shareUrl?: string): string {
  const lines: string[] = []
  lines.push('🧾 RECEIPT', '')
  const isComplementary = order.saleType === 'COMPLIMENTARY'
  const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const owed = Math.max(0, order.financials.total - paid)
  const creditOverdue = !isComplementary && owed > 0.01 && order.creditExpectedAt ? new Date(order.creditExpectedAt).getTime() < Date.now() : false
  const statusText = isComplementary ? 'Complementary' : creditOverdue ? 'Overdue credit' : owed > 0.01 ? 'On credit' : order.status
  if (profile?.businessName) lines.push(profile.businessName.toUpperCase())
  const place = [profile?.address, profile?.city].filter(Boolean).join(', ')
  if (place) lines.push(place)
  if (order.location?.name) lines.push(order.location.name)
  const phone = receiptPhone(order, profile)
  if (phone) lines.push(phone)
  const header = receiptHeaderText(order)
  if (header) lines.push(header)
  lines.push(RULE)

  lines.push(`Receipt: ${order.orderNumber}`)
  lines.push(`Date: ${new Date(order.updatedAt).toLocaleString()}`)
  const served = servedByName(order)
  if (served) lines.push(`Served by: ${served}`)
  lines.push(`Status: ${statusText}`)
  lines.push(order.table ? `Table: ${order.table.label}` : 'Takeaway')
  if (isComplementary) lines.push(`Recipient: ${order.complimentaryRecipientName || (order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}`.trim() : 'Walk-in')}`)
  if (order.complimentarySession) lines.push(`Host/Event: ${order.complimentarySession.title}`)
  if (order.creditReason) lines.push(`Credit reason: ${order.creditReason}`)
  if (order.creditExpectedAt) lines.push(`Expected pay date: ${new Date(order.creditExpectedAt).toLocaleDateString()}`)
  lines.push(RULE)

  for (const item of order.items) {
    lines.push(`${receiptItemName(item)}${item.variant ? ` (${item.variant.name})` : ''}`)
    lines.push(`  ${item.quantity} x ${money(item.unitPrice)} = ${money(Number(item.unitPrice) * item.quantity)}`)
    for (const a of item.addons) {
      lines.push(`  + ${a.addon.name}  ${money(Number(a.unitPrice) * a.quantity)}`)
    }
  }
  const approvedReturns = (order.returnRequests ?? []).filter((request) => request.status === 'APPROVED')
  if (approvedReturns.length > 0) {
    lines.push(RULE)
    lines.push('Returns:')
    for (const request of approvedReturns) {
      lines.push(`  ${request.quantity} x ${request.orderItem.menuItem?.name ?? 'item'}${request.orderItem.variant ? ` (${request.orderItem.variant.name})` : ''} - approved`)
    }
  }
  lines.push(RULE)

  const f = order.financials
  lines.push(`Subtotal: ${money(f.subtotal)}`)
  if (f.discount > 0) lines.push(`Discount: -${money(f.discount)}`)
  if (showsTaxAsAddedOn(order)) lines.push(`Tax (${f.taxRate}%): +${money(f.taxAmount)}`)
  lines.push(`TOTAL: ${money(f.total)}`)
  lines.push(RULE)

  lines.push('Payments:')
  if (isComplementary) lines.push('Complementary order, no payment collected.')
  else if (order.payments.length === 0) lines.push('No payment recorded yet.')
  else for (const p of order.payments) lines.push(`${p.paymentMethod.name}: ${money(p.amount)}${p.reference ? ` (${p.reference})` : ''}`)
  lines.push(RULE)

  lines.push('Tax breakdown:')
  for (const t of f.taxLines ?? []) lines.push(`${t.label}: net ${money(t.net)} / tax ${money(t.tax)} / gross ${money(t.gross)}`)
  if ((f.zeroRatedAmount ?? 0) > 0) lines.push(`Includes zero-rated: ${money(f.zeroRatedAmount!)}`)
  if ((f.exemptAmount ?? 0) > 0) lines.push(`Includes exempt: ${money(f.exemptAmount!)}`)
  lines.push(RULE)

  lines.push(receiptFooterText(order))

  if (shareUrl) {
    lines.push(RULE)
    lines.push('View & download:')
    lines.push(shareUrl)
  }

  return lines.join('\n')
}

/** Open WhatsApp (native share sheet where available) with the receipt text. */
export async function shareReceipt(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}
