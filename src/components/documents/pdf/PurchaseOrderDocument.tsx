import { Document, Page, Text, View } from '@react-pdf/renderer'
import { s, palette, money, shortDate } from './theme'
import type { DocProfile } from './theme'
import { Letterhead, Party, MetaGrid, ItemsTable, Totals, SignatureBlock, Footer } from './parts'
import type { DocLine } from './parts'
import { packAndUnit } from '@/components/ui/PackQtyInput'

type Employee = { firstName: string; lastName: string } | null
export type PurchaseOrderDocData = {
  purchaseNo: string
  status: string
  orderDate: string
  expectedDate: string | null
  reference: string | null
  notes: string | null
  taxRate: string
  subtotal: string
  taxAmount: string
  total: string
  supplier: { name: string }
  requisition: { requisitionNo: string } | null
  createdByEmployee: Employee
  items: { product: { name: string; unit: string; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }; quantity: string; unitCost: string; lineTotal: string; note: string | null }[]
}

const fullName = (e: Employee) => (e ? `${e.firstName} ${e.lastName}` : '')

export default function PurchaseOrderDocument({ data, profile }: { data: PurchaseOrderDocData; profile: DocProfile }) {
  const currency = profile?.currency ?? 'KES'
  const rate = Number(data.taxRate) || 0
  const lines: DocLine[] = data.items.map((i) => ({
    name: i.product.name,
    sub: i.note ?? undefined,
    qty: packAndUnit(Number(i.quantity), Number(i.product.packSize) || 0, i.product.packLabel ?? '', i.product.packUnit?.name ?? i.product.unit),
    unit: money(i.unitCost, currency),
    total: money(i.lineTotal, currency),
  }))

  return (
    <Document title={`Purchase Order ${data.purchaseNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType="PURCHASE ORDER" docNo={data.purchaseNo} status={data.status} />

        <Party label="SUPPLIER" name={data.supplier.name} />

        <MetaGrid
          cells={[
            { key: 'Order Date', value: shortDate(data.orderDate) },
            { key: 'Expected', value: shortDate(data.expectedDate) },
            { key: 'Reference', value: data.reference ?? '—' },
            { key: 'Status', value: data.status },
          ]}
        />

        {data.requisition ? <Text style={s.note}>Raised from requisition {data.requisition.requisitionNo}</Text> : null}

        <ItemsTable unitHeader="Unit price" lines={lines} />

        <Totals
          rows={[
            { key: 'Subtotal', value: money(data.subtotal, currency) },
            { key: `Tax (${rate}%)`, value: money(data.taxAmount, currency) },
          ]}
          grand={{ key: 'Total', value: money(data.total, currency) }}
        />

        {rate > 0 ? (
          <View>
            <Text style={s.breakLabel}>TAX BREAKDOWN</Text>
            <View style={s.table}>
              <View style={s.th}>
                <Text style={[s.thText, s.colName]}>CATEGORY</Text>
                <Text style={[s.thText, s.colMoney]}>NET</Text>
                <Text style={[s.thText, s.colMoney]}>TAX</Text>
                <Text style={[s.thText, s.colMoney]}>GROSS</Text>
              </View>
              <View style={[s.tr, { borderBottomWidth: 0 }]}>
                <Text style={[s.td, s.colName]}>Standard ({rate}%)</Text>
                <Text style={[s.td, s.colMoney]}>{money(data.subtotal, currency)}</Text>
                <Text style={[s.td, s.colMoney]}>{money(data.taxAmount, currency)}</Text>
                <Text style={[s.td, s.colMoney]}>{money(data.total, currency)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {data.notes ? <Text style={s.note}>Notes: {data.notes}</Text> : null}

        <SignatureBlock
          columns={[
            { role: 'Prepared by', name: fullName(data.createdByEmployee), date: shortDate(data.orderDate) },
            { role: 'Authorised by', name: '', date: '' },
          ]}
        />

        <Text style={[s.footerText, { marginTop: 18, color: palette.faint }]}>
          This is a purchase order, not a tax invoice. Goods to be delivered to {profile?.businessName ?? 'us'} at the address above.
        </Text>

        <Footer profile={profile} />
      </Page>
    </Document>
  )
}
