import { Document, Page, Text, View } from '@react-pdf/renderer'
import { s, palette, dateTime } from './theme'
import type { DocProfile } from './theme'
import { Letterhead, MetaGrid, SignatureBlock, Footer } from './parts'
import { packAndUnit } from '@/components/ui/PackQtyInput'

type Employee = { firstName: string; lastName: string } | null
export type StockReceiptDocData = {
  receiptNo: string
  createdAt: string
  note: string | null
  location: { name: string }
  createdByEmployee: Employee
  items: {
    product: { name: string; unit: string; sku: string | null; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }
    quantity: string
    qtyBefore: string
    qtyAfter: string
  }[]
}

const fullName = (e: Employee) => (e ? `${e.firstName} ${e.lastName}` : '')

const col = {
  idx: { width: 18, textAlign: 'center' as const },
  name: { flex: 1 },
  num: { width: 105, textAlign: 'right' as const },
}

export default function StockReceiptDocument({ data, profile }: { data: StockReceiptDocData; profile: DocProfile }) {
  return (
    <Document title={`Goods Received ${data.receiptNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType="GOODS RECEIVED" docNo={data.receiptNo} status="RECORDED" />

        <MetaGrid
          cells={[
            { key: 'Destination', value: data.location.name },
            { key: 'Recorded by', value: fullName(data.createdByEmployee) || '—' },
            { key: 'Date', value: dateTime(data.createdAt) },
          ]}
        />

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, col.idx, s.divide]}>#</Text>
            <Text style={[s.thText, col.name, s.divide]}>PRODUCT</Text>
            <Text style={[s.thText, col.num, s.divide]}>RECEIVED</Text>
            <Text style={[s.thText, col.num, s.divide]}>BEFORE</Text>
            <Text style={[s.thText, col.num]}>AFTER</Text>
          </View>
          {data.items.map((item, i) => {
            const packSize = Number(item.product.packSize) || 0
            const unitLabel = item.product.packUnit?.name ?? item.product.unit
            const fmt = (v: string) => packAndUnit(Number(v), packSize, item.product.packLabel ?? '', unitLabel)
            return (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, col.idx, s.divide]}>{i + 1}</Text>
                <View style={[s.td, col.name, s.divide]}>
                  <Text>{item.product.name}</Text>
                  {item.product.sku ? <Text style={s.tdSub}>{item.product.sku}</Text> : null}
                </View>
                <Text style={[s.td, col.num, s.divide]}>{fmt(item.quantity)}</Text>
                <Text style={[s.td, col.num, s.divide]}>{fmt(item.qtyBefore)}</Text>
                <Text style={[s.td, col.num]}>{fmt(item.qtyAfter)}</Text>
              </View>
            )
          })}
        </View>

        {data.note ? <Text style={s.note}>Note: {data.note}</Text> : null}

        <SignatureBlock
          columns={[
            { role: 'Recorded by', name: fullName(data.createdByEmployee), date: dateTime(data.createdAt) },
            { role: 'Checked by', name: '', date: '' },
          ]}
        />

        <Text style={[s.footerText, { marginTop: 18, color: palette.faint }]}>
          Internal stock record — not a tax document.
        </Text>

        <Footer profile={profile} />
      </Page>
    </Document>
  )
}
