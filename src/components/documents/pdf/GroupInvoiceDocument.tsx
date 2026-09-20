import { Document, Page, Text, View } from '@react-pdf/renderer'
import { s, palette, money, shortDate } from './theme'
import type { DocProfile } from './theme'
import { Letterhead, Party, MetaGrid, Totals, SignatureBlock, Footer } from './parts'

export type GroupInvoiceDocData = {
  groupNo: string
  name: string
  issuedAt: string
  customer: { name: string; phone: string | null; email: string | null }
  /** Earliest date payment is expected, when the group was checked out on credit. */
  expectedBy: string | null
  creditReason: string | null
  rooms: {
    room: string
    roomType: string
    guests: string[]
    checkIn: string
    checkOut: string
    charges: number
    discounts: number
    total: number
  }[]
  totals: { charges: number; discounts: number; total: number; paid: number; balance: number }
}

const col = {
  idx: { width: 18, textAlign: 'center' as const },
  name: { flex: 1 },
  money: { width: 84, textAlign: 'right' as const },
}

export default function GroupInvoiceDocument({ data, profile }: { data: GroupInvoiceDocData; profile: DocProfile }) {
  const currency = profile?.currency ?? 'KES'
  const due = data.totals.balance > 0.01
  return (
    <Document title={`Invoice ${data.groupNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType="INVOICE" docNo={data.groupNo} status={due ? 'DUE' : 'PAID'} />

        <Party label="BILL TO" name={data.customer.name} lines={[data.customer.phone ?? '', data.customer.email ?? '']} />

        <MetaGrid
          cells={[
            { key: 'Group', value: data.name },
            { key: 'Issued', value: shortDate(data.issuedAt) },
            { key: 'Rooms', value: String(data.rooms.length) },
            { key: 'Payment due', value: due ? shortDate(data.expectedBy) : 'Paid in full' },
          ]}
        />

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, col.idx, s.divide]}>#</Text>
            <Text style={[s.thText, col.name, s.divide]}>ROOM / GUESTS</Text>
            <Text style={[s.thText, col.money, s.divide]}>CHARGES</Text>
            <Text style={[s.thText, col.money, s.divide]}>DISCOUNT</Text>
            <Text style={[s.thText, col.money]}>TOTAL</Text>
          </View>
          {data.rooms.map((room, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.td, col.idx, s.divide]}>{i + 1}</Text>
              <View style={[s.td, col.name, s.divide]}>
                <Text>Room {room.room} — {room.roomType}</Text>
                <Text style={s.tdSub}>{shortDate(room.checkIn)} to {shortDate(room.checkOut)}{room.guests.length ? `  ·  ${room.guests.join(', ')}` : ''}</Text>
              </View>
              <Text style={[s.td, col.money, s.divide]}>{money(room.charges, currency)}</Text>
              <Text style={[s.td, col.money, s.divide]}>{room.discounts > 0 ? `- ${money(room.discounts, currency)}` : '—'}</Text>
              <Text style={[s.td, col.money]}>{money(room.total, currency)}</Text>
            </View>
          ))}
        </View>

        <Totals
          rows={[
            { key: 'Charges', value: money(data.totals.charges, currency) },
            ...(data.totals.discounts > 0 ? [{ key: 'Discounts', value: `- ${money(data.totals.discounts, currency)}` }] : []),
            { key: 'Invoice total', value: money(data.totals.total, currency) },
            { key: 'Payments received', value: `- ${money(data.totals.paid, currency)}` },
          ]}
          grand={{ key: due ? 'Balance due' : 'Balance', value: money(data.totals.balance, currency) }}
        />

        {due ? (
          <Text style={s.note}>
            Payment is expected by {shortDate(data.expectedBy)}.{data.creditReason ? `  Reason for credit: ${data.creditReason}.` : ''}
          </Text>
        ) : null}

        <SignatureBlock columns={[{ role: 'Issued by' }, { role: 'Received by (customer)' }]} />

        <Text style={[s.footerText, { marginTop: 18, color: palette.faint }]}>Thank you for staying with us.</Text>

        <Footer profile={profile} />
      </Page>
    </Document>
  )
}
