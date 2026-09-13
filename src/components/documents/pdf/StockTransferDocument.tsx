import { Document, Page, Text, View } from '@react-pdf/renderer'
import { s, palette, dateTime } from './theme'
import type { DocProfile } from './theme'
import { Letterhead, MetaGrid, SignatureBlock, Footer } from './parts'
import { packAndUnit } from '@/components/ui/PackQtyInput'

type Employee = { firstName: string; lastName: string } | null
export type StockTransferDocData = {
  transferNo: string
  createdAt: string
  note: string | null
  fromLocation: { name: string }
  toLocation: { name: string }
  createdByEmployee: Employee
  items: {
    product: { name: string; unit: string; sku: string | null; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }
    quantity: string
    fromQtyBefore: string
    fromQtyAfter: string
    toQtyBefore: string
    toQtyAfter: string
  }[]
}

const fullName = (e: Employee) => (e ? `${e.firstName} ${e.lastName}` : '')

const col = {
  idx: { width: 18, textAlign: 'center' as const },
  name: { width: 110 },
  num: { width: 90, textAlign: 'right' as const },
  loc: { flex: 1, textAlign: 'center' as const },
}

export default function StockTransferDocument({ data, profile }: { data: StockTransferDocData; profile: DocProfile }) {
  return (
    <Document title={`Stock Transfer ${data.transferNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType="STOCK TRANSFER" docNo={data.transferNo} status="RECORDED" />

        <MetaGrid
          cells={[
            { key: 'From', value: data.fromLocation.name },
            { key: 'To', value: data.toLocation.name },
            { key: 'Received by', value: fullName(data.createdByEmployee) || '—' },
            { key: 'Date', value: dateTime(data.createdAt) },
          ]}
        />

        <Text style={[s.note, { marginTop: 8 }]}>
          Frozen at the moment of transfer — reflects exactly what was true then, even if stock has moved since.
        </Text>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, col.idx, s.divide]}>#</Text>
            <Text style={[s.thText, col.name, s.divide]}>PRODUCT</Text>
            <Text style={[s.thText, col.num, s.divide]}>QTY</Text>
            <Text style={[s.thText, col.loc, s.divide]}>{data.fromLocation.name.toUpperCase()} (BEFORE → AFTER)</Text>
            <Text style={[s.thText, col.loc]}>{data.toLocation.name.toUpperCase()} (BEFORE → AFTER)</Text>
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
                <Text style={[s.td, col.loc, s.divide]}>{fmt(item.fromQtyBefore)} → {fmt(item.fromQtyAfter)}</Text>
                <Text style={[s.td, col.loc]}>{fmt(item.toQtyBefore)} → {fmt(item.toQtyAfter)}</Text>
              </View>
            )
          })}
        </View>

        {data.note ? <Text style={s.note}>Note: {data.note}</Text> : null}

        <SignatureBlock
          columns={[
            { role: 'Issued by', name: fullName(data.createdByEmployee), date: dateTime(data.createdAt) },
            { role: 'Received by', name: '', date: '' },
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
