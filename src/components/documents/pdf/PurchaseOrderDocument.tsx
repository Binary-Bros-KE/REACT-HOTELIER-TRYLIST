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
  // Always 0 on a purchase: tax is worked out per line (see items[].taxRate).
  taxRate: string
  subtotal: string
  taxAmount: string
  total: string
  supplier: { name: string }
  requisition: { requisitionNo: string } | null
  createdByEmployee: Employee
  items: { product: { name: string; unit: string; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }; quantity: string; unitCost: string; lineTotal: string; note: string | null; taxRate?: string; taxAmount?: string; taxTreatment?: string }[]
}

const fullName = (e: Employee) => (e ? `${e.firstName} ${e.lastName}` : '')

export default function PurchaseOrderDocument({ data, profile }: { data: PurchaseOrderDocData; profile: DocProfile }) {
  const currency = profile?.currency ?? 'KES'
  // Group the taxed lines by rate - the header rate is never set, so it can't
  // label the tax (it read "Tax (0%)" next to a VAT amount).
  const taxBands = [...data.items.reduce((bands, i) => {
    const tax = Number(i.taxAmount) || 0
    const rate = Number(i.taxRate) || 0
    if (tax <= 0 || rate <= 0 || (i.taxTreatment && i.taxTreatment !== 'STANDARD')) return bands
    const band = bands.get(rate) ?? { rate, net: 0, tax: 0, gross: 0 }
    band.tax += tax
    band.gross += Number(i.lineTotal) || 0
    band.net = band.gross - band.tax
    return bands.set(rate, band)
  }, new Map<number, { rate: number; net: number; tax: number; gross: number }>()).values()].sort((a, b) => a.rate - b.rate)
  const taxLabel = taxBands.length === 1 ? `VAT (${taxBands[0].rate}%)` : taxBands.length > 1 ? 'VAT' : 'Tax'
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
            { key: taxLabel, value: money(data.taxAmount, currency) },
          ]}
          grand={{ key: 'Total', value: money(data.total, currency) }}
        />

        {taxBands.length > 0 ? (
          <View>
            <Text style={s.breakLabel}>TAX BREAKDOWN</Text>
            <View style={s.table}>
              <View style={s.th}>
                <Text style={[s.thText, s.colName]}>CATEGORY</Text>
                <Text style={[s.thText, s.colMoney]}>NET</Text>
                <Text style={[s.thText, s.colMoney]}>TAX</Text>
                <Text style={[s.thText, s.colMoney]}>GROSS</Text>
              </View>
              {taxBands.map((band, index) => (
                <View key={band.rate} style={[s.tr, index === taxBands.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={[s.td, s.colName]}>Standard ({band.rate}%)</Text>
                  <Text style={[s.td, s.colMoney]}>{money(band.net, currency)}</Text>
                  <Text style={[s.td, s.colMoney]}>{money(band.tax, currency)}</Text>
                  <Text style={[s.td, s.colMoney]}>{money(band.gross, currency)}</Text>
                </View>
              ))}
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
