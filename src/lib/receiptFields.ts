import type { ReceiptOrder, ReceiptProfile } from '@/components/pos/OrderReceipt'

/**
 * Shared field-resolution rules for every receipt renderer (the on-screen
 * preview, the ESC/POS thermal build, and the WhatsApp text) so they never
 * drift from each other.
 */

/** The display name of a receipt line: a menu item, a service or a retail product. */
export function receiptItemName(item: { menuItem?: { name: string } | null; service?: { name: string } | null; product?: { name: string } | null }): string {
  return item.menuItem?.name ?? item.service?.name ?? item.product?.name ?? 'Item'
}

/** Location's own phone(s) — primary[/secondary] — else the business's. */
export function receiptPhone(order: ReceiptOrder, profile: ReceiptProfile): string | null {
  const loc = order.location
  const parts = [loc?.primaryPhone, loc?.secondaryPhone].filter((v): v is string => !!v)
  if (parts.length > 0) return parts.join('/')
  return profile?.primaryPhone ?? null
}

/** The employee who rang the order up. */
export function servedByName(order: ReceiptOrder): string | null {
  if (!order.servedBy) return null
  return [order.servedBy.firstName, order.servedBy.lastName].filter(Boolean).join(' ') || null
}

export function receiptHeaderText(order: ReceiptOrder): string | null {
  return order.location?.receiptHeader?.trim() || null
}

export function receiptFooterText(order: ReceiptOrder): string {
  return order.location?.receiptFooter?.trim() || 'Thank you for your visit!'
}

/** Exclusive tax is added on top of the subtotal, so the receipt should show
 * that addition explicitly. Inclusive (or no) tax is already baked into the
 * subtotal — showing it as a separate "+Tax" line would look like double
 * charging, so it's left out here (it's still fully disclosed in the
 * mandatory tax-breakdown table below). */
export function showsTaxAsAddedOn(order: ReceiptOrder): boolean {
  return order.financials.taxMode === 'EXCLUSIVE' && order.financials.taxAmount > 0
}
