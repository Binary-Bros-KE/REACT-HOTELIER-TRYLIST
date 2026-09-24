export type ReceiptOrderItem = {
  id: string
  quantity: number
  unitPrice: string
  // Set when the till sold this line at a price other than the list price (the list price it had).
  listPrice?: string | null
  // Exactly one of these is set, depending on what was sold.
  menuItem?: { name: string } | null
  service?: { name: string } | null
  product?: { name: string } | null
  variant: { name: string } | null
  serviceVariant?: { name: string } | null
  addons: { id: string; quantity: number; unitPrice: string; addon: { name: string } }[]
  returnRequests?: { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; quantity: number; reason?: string | null }[]
}
export type ReceiptPayment = { id: string; paymentMethod: { name: string }; amount: string; reference: string | null; createdAt: string }
export type ReceiptTaxLine = { key: string; label: string; net: number; tax: number; gross: number }
export type ReceiptFinancials = {
  subtotal: number
  discount: number
  taxRate: number
  taxMode: string
  taxAmount: number
  net: number
  total: number
  taxLines?: ReceiptTaxLine[]
  zeroRatedAmount?: number
  exemptAmount?: number
}
export type ReceiptLocation = {
  id: string
  name: string
  primaryPhone: string | null
  secondaryPhone: string | null
  receiptHeader: string | null
  receiptFooter: string | null
}
export type ReceiptOrder = {
  id: string
  orderNumber: number
  status: string
  saleType?: 'SALE' | 'COMPLIMENTARY'
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID'
  createdAt: string
  servedAt: string | null
  updatedAt: string
  table: { label: string } | null
  location: ReceiptLocation | null
  servedBy: { firstName: string; lastName: string } | null
  customer?: { firstName: string; lastName: string | null } | null
  complimentarySession?: { title: string; hostName: string; startsAt?: string | null; endsAt?: string | null } | null
  complimentaryOrderRole?: 'HOST_COMP' | 'GUEST_SPEND' | null
  complimentaryReason?: string | null
  complimentaryRecipientName?: string | null
  creditReason?: string | null
  creditExpectedAt?: string | null
  billedToRoomAt?: string | null
  roomBillSettledAt?: string | null
  roomBillSettlementLocation?: string | null
  roomBillSettlementMethod?: string | null
  roomBillSettlementReference?: string | null
  roomBillSettledByEmployee?: { firstName: string; lastName: string } | null
  reservation?: { room?: { number: string } | null } | null
  items: ReceiptOrderItem[]
  returnRequests?: { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; quantity: number; reason: string; orderItem: { menuItem: { name: string } | null; variant: { name: string } | null } }[]
  payments: ReceiptPayment[]
  financials: ReceiptFinancials
}
export type ReceiptProfile = { businessName: string; address: string | null; city: string | null; primaryPhone: string | null; kraPin: string | null } | null

import { receiptFooterText, receiptHeaderText, receiptItemName, receiptVariantSuffix, receiptPhone, servedByName, showsTaxAsAddedOn } from '@/lib/receiptFields'

const formatKes = (value: number | string) => `KSh ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function OrderReceipt({ order, profile }: { order: ReceiptOrder; profile: ReceiptProfile }) {
  const phone = receiptPhone(order, profile)
  const header = receiptHeaderText(order)
  const served = servedByName(order)
  const taxAddedOn = showsTaxAsAddedOn(order)
  const isComplementary = order.saleType === 'COMPLIMENTARY'
  const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const owed = Math.max(0, order.financials.total - paid)
  const creditOverdue = !isComplementary && owed > 0.01 && order.creditExpectedAt ? new Date(order.creditExpectedAt).getTime() < Date.now() : false
  const roomBilled = Boolean(order.billedToRoomAt)
  const statusText = isComplementary ? 'Complementary' : roomBilled && owed > 0.01 ? 'Billed to room' : creditOverdue ? 'Overdue credit' : owed > 0.01 ? 'On credit' : order.status
  const approvedReturns = (order.returnRequests ?? []).filter((request) => request.status === 'APPROVED')

  return (
    <div className="receipt-print-area mx-auto max-w-xs bg-white p-6 text-[13px] text-black">
      <div className="text-center">
        <p className="font-display text-xl font-extrabold uppercase tracking-wide">{profile?.businessName ?? 'Receipt'}</p>
        {(profile?.address || profile?.city) && <p className="mt-1 text-xs text-gray-600">{[profile?.address, profile?.city].filter(Boolean).join(', ')}</p>}
        {order.location?.name && <p className="mt-0.5 text-[11px] text-gray-500">{order.location.name}</p>}
        {phone && <p className="text-xs text-gray-600">{phone}</p>}
        {header && <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-600">{header}</p>}
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between"><span>Receipt</span><span>#{order.orderNumber}</span></div>
        <div className="flex justify-between"><span>Date</span><span>{new Date(order.updatedAt).toLocaleString()}</span></div>
        {served && <div className="flex justify-between"><span>Served by</span><span>{served}</span></div>}
        <div className="flex justify-between text-gray-600"><span>{order.table ? `Table: ${order.table.label}` : 'Takeaway'}</span><span>Status: {statusText}</span></div>
        {isComplementary && <div className="flex justify-between text-gray-600"><span>Recipient</span><span>{order.complimentaryRecipientName || (order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ''}`.trim() : 'Walk-in')}</span></div>}
        {order.complimentarySession && <div className="flex justify-between text-gray-600"><span>Host/Event</span><span>{order.complimentarySession.title}</span></div>}
        {roomBilled && <div className="flex justify-between text-gray-600"><span>Room bill</span><span>{order.reservation?.room?.number ? `Room ${order.reservation.room.number}` : 'Billed to room'}</span></div>}
        {order.creditReason && <div className="flex justify-between gap-3 text-gray-600"><span>Credit reason</span><span className="text-right">{order.creditReason}</span></div>}
        {order.creditExpectedAt && <div className="flex justify-between text-gray-600"><span>Expected pay date</span><span>{new Date(order.creditExpectedAt).toLocaleDateString()}</span></div>}
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="space-y-1.5">
        {order.items.map((item) => (
          <div key={item.id}>
            <div className="flex justify-between">
              <span>{item.quantity} × {receiptItemName(item)}{receiptVariantSuffix(item)}</span>
              <span>{formatKes(Number(item.unitPrice) * item.quantity)}</span>
            </div>
            {item.addons.map((a) => (
              <div key={a.id} className="flex justify-between pl-3 text-[11px] text-gray-600">
                <span>+ {a.addon.name}</span>
                <span>{formatKes(Number(a.unitPrice) * a.quantity)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {approvedReturns.length > 0 && (
        <>
          <div className="my-3 border-t border-dashed border-gray-400" />
          <div className="space-y-1 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Returns</p>
            {approvedReturns.map((request) => (
              <div key={request.id} className="flex justify-between gap-3 text-gray-600">
                <span>{request.quantity} x {request.orderItem.menuItem?.name ?? 'item'}{request.orderItem.variant ? ` (${request.orderItem.variant.name})` : ''}</span>
                <span className="text-right">Approved</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="space-y-1">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatKes(order.financials.subtotal)}</span></div>
        {order.financials.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatKes(order.financials.discount)}</span></div>}
        {taxAddedOn && <div className="flex justify-between"><span>Tax ({order.financials.taxRate}%)</span><span>+{formatKes(order.financials.taxAmount)}</span></div>}
        <div className="flex justify-between border-t border-gray-300 pt-1 text-sm font-bold"><span>Total</span><span>{formatKes(order.financials.total)}</span></div>
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Payments</p>
        {isComplementary ? (
          <p className="text-xs text-gray-500">Complementary order, no payment collected.</p>
        ) : order.payments.length === 0 ? (
          <p className="text-xs text-gray-500">No payment recorded yet.</p>
        ) : order.payments.map((p) => (
          <div key={p.id} className="flex justify-between text-xs">
            <span>{p.paymentMethod.name}{p.reference ? ` (${p.reference})` : ''}</span>
            <span>{formatKes(p.amount)}</span>
          </div>
        ))}
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tax breakdown</p>
        <div className="flex justify-between text-[11px] font-semibold text-gray-500">
          <span>Rate</span><span className="flex gap-3"><span className="w-16 text-right">Net</span><span className="w-14 text-right">Tax</span><span className="w-16 text-right">Gross</span></span>
        </div>
        {(order.financials.taxLines ?? []).map((t) => (
          <div key={t.key} className="flex justify-between text-xs">
            <span>{t.label}</span>
            <span className="flex gap-3"><span className="w-16 text-right">{formatKes(t.net)}</span><span className="w-14 text-right">{formatKes(t.tax)}</span><span className="w-16 text-right">{formatKes(t.gross)}</span></span>
          </div>
        ))}
        <div className="flex justify-between border-t border-gray-300 pt-1 text-xs font-bold">
          <span>Total</span>
          <span className="flex gap-3"><span className="w-16 text-right">{formatKes(order.financials.net)}</span><span className="w-14 text-right">{formatKes(order.financials.taxAmount)}</span><span className="w-16 text-right">{formatKes(order.financials.total)}</span></span>
        </div>
        {(order.financials.zeroRatedAmount ?? 0) > 0 && <p className="text-[10px] text-gray-500">Includes zero-rated: {formatKes(order.financials.zeroRatedAmount!)}</p>}
        {(order.financials.exemptAmount ?? 0) > 0 && <p className="text-[10px] text-gray-500">Includes exempt: {formatKes(order.financials.exemptAmount!)}</p>}
      </div>

      <div className="my-3 border-t border-dashed border-gray-400" />

      {order.roomBillSettledAt && (
        <>
          <p className="text-center text-[11px] text-gray-500">
            Room bill settled by {order.roomBillSettledByEmployee ? `${order.roomBillSettledByEmployee.firstName} ${order.roomBillSettledByEmployee.lastName}` : 'Reception'} via {order.roomBillSettlementMethod ?? 'payment'}{order.roomBillSettlementLocation ? ` at ${order.roomBillSettlementLocation}` : ''} on {new Date(order.roomBillSettledAt).toLocaleString('en-KE')}{order.roomBillSettlementReference ? ` (${order.roomBillSettlementReference})` : ''}.
          </p>
          <div className="my-3 border-t border-dashed border-gray-400" />
        </>
      )}

      <p className="whitespace-pre-wrap text-center text-xs text-gray-500">{receiptFooterText(order)}</p>
    </div>
  )
}
