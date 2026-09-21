import { taxLabel, type TaxMode, type TaxTreatment } from '@/lib/tax'

export type LineTax = { rate: number; mode: TaxMode; treatment: TaxTreatment }
export type TaxBucket = { key: string; label: string; net: number; tax: number; gross: number }

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/**
 * Live mirror of the server's computeOrderFinancials (NODE lib/orderTotals.ts):
 * tax is worked out per line from the line's own treatment/rate/mode (the item's
 * override else the property default, already resolved by the API), the order
 * discount is apportioned by line value, and lines are bucketed for the
 * receipt-style breakdown. Shared by every till (food, services) so they can
 * never disagree with each other or with the server.
 */
export function computeFinancialsFromRows(rows: { sub: number; tax: LineTax }[], discountInput: string | number, complimentary = false) {
  const subtotal = rows.reduce((s, r) => s + r.sub, 0)
  const discount = Math.min(Number(discountInput) || 0, subtotal)

  const buckets = new Map<string, TaxBucket>()
  let net = 0
  let taxAmount = 0
  let total = 0

  for (const { sub, tax } of rows) {
    const share = subtotal > 0 ? sub - discount * (sub / subtotal) : 0
    let lineNet: number
    let lineTax: number
    if (tax.treatment === 'EXEMPT' || tax.treatment === 'ZERO_RATED' || tax.rate <= 0) {
      lineNet = share; lineTax = 0
    } else if (tax.mode === 'EXCLUSIVE') {
      lineNet = share; lineTax = lineNet * (tax.rate / 100)
    } else {
      lineNet = share / (1 + tax.rate / 100); lineTax = share - lineNet
    }
    const lineGross = lineNet + lineTax
    net += lineNet; taxAmount += lineTax; total += lineGross

    const label = taxLabel(tax)
    const bucket = buckets.get(label) ?? { key: label, label, net: 0, tax: 0, gross: 0 }
    bucket.net += lineNet; bucket.tax += lineTax; bucket.gross += lineGross
    buckets.set(label, bucket)
  }

  const taxLines = [...buckets.values()].map((b) => ({ ...b, net: round2(b.net), tax: round2(b.tax), gross: round2(b.gross) }))
  if (complimentary) return { subtotal: round2(subtotal), discount: round2(subtotal), net: 0, taxAmount: 0, total: 0, complimentaryValue: round2(subtotal), taxLines: [] as TaxBucket[] }
  return { subtotal: round2(subtotal), discount: round2(discount), net: round2(net), taxAmount: round2(taxAmount), total: round2(total), complimentaryValue: 0, taxLines }
}
