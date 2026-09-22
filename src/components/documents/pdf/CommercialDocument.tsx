import { Document, Page, Text, View } from '@react-pdf/renderer'
import { s, money, shortDate } from './theme'
import type { DocProfile } from './theme'
import { Footer, Letterhead, MetaGrid, Party, SignatureBlock, Totals } from './parts'

export type CommercialDocData = {
  documentNo: string
  type: 'QUOTATION' | 'INVOICE'
  status: string
  title: string | null
  intro: string | null
  headerText: string | null
  footerText: string | null
  issuedAt: string | null
  expiresAt: string | null
  dueAt: string | null
  depositRequired: string | number
  customer: { firstName: string; lastName: string | null; businessName: string | null; phone: string | null; email: string | null; billingEmail?: string | null; billingPhone?: string | null; address?: string | null } | null
  prospectName: string | null
  prospectPhone: string | null
  prospectEmail: string | null
  prospectAddress: string | null
  location: { name: string } | null
  lines: { description: string; details: string | null; quantity: string | number; unitLabel: string | null; unitPrice: string | number; lineTotal: string | number; taxRate: string | number; taxMode: string; taxTreatment: string }[]
  payments: { amount: string | number; kind: string; reference: string | null; paidAt: string; paymentMethod: { name: string } }[]
  subtotal: string | number
  net: string | number
  taxAmount: string | number
  total: string | number
  paidAmount: string | number
  balance: string | number
}

const col = {
  idx: { width: 20, textAlign: 'center' as const },
  desc: { flex: 1 },
  qty: { width: 70, textAlign: 'right' as const },
  money: { width: 86, textAlign: 'right' as const },
}

function partyName(data: CommercialDocData) {
  if (data.customer?.businessName) return data.customer.businessName
  if (data.customer) return `${data.customer.firstName} ${data.customer.lastName ?? ''}`.trim()
  return data.prospectName ?? 'Prospect'
}

function partyLines(data: CommercialDocData) {
  if (data.customer) return [data.customer.billingPhone ?? data.customer.phone ?? '', data.customer.billingEmail ?? data.customer.email ?? '', data.customer.address ?? '']
  return [data.prospectPhone ?? '', data.prospectEmail ?? '', data.prospectAddress ?? '']
}

function taxLabel(line: CommercialDocData['lines'][number]) {
  if (line.taxTreatment === 'EXEMPT') return 'Exempt'
  if (line.taxTreatment === 'ZERO_RATED') return 'Zero-rated'
  return `VAT ${line.taxRate}% ${line.taxMode === 'EXCLUSIVE' ? 'exclusive' : 'inclusive'}`
}

export default function CommercialDocument({ data, profile }: { data: CommercialDocData; profile: DocProfile }) {
  const currency = profile?.currency ?? 'KES'
  const isInvoice = data.type === 'INVOICE'
  return (
    <Document title={`${isInvoice ? 'Invoice' : 'Quotation'} ${data.documentNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType={isInvoice ? 'INVOICE' : 'QUOTATION'} docNo={data.documentNo} status={data.status.replaceAll('_', ' ')} />
        {data.headerText ? <Text style={s.note}>{data.headerText}</Text> : null}
        <Party label={isInvoice ? 'BILL TO' : 'PREPARED FOR'} name={partyName(data)} lines={partyLines(data)} />
        <MetaGrid
          cells={[
            { key: 'Location', value: data.location?.name ?? '-' },
            { key: isInvoice ? 'Issued' : 'Created', value: shortDate(data.issuedAt ?? new Date().toISOString()) },
            { key: isInvoice ? 'Due date' : 'Expiry', value: shortDate(isInvoice ? data.dueAt : data.expiresAt) },
            { key: 'Status', value: data.status.replaceAll('_', ' ') },
          ]}
        />
        {data.title || data.intro ? (
          <View style={{ marginBottom: 10 }}>
            {data.title ? <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{data.title}</Text> : null}
            {data.intro ? <Text style={s.note}>{data.intro}</Text> : null}
          </View>
        ) : null}
        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={[s.thText, col.idx, s.divide]}>#</Text>
            <Text style={[s.thText, col.desc, s.divide]}>DESCRIPTION</Text>
            <Text style={[s.thText, col.qty, s.divide]}>QTY</Text>
            <Text style={[s.thText, col.money, s.divide]}>UNIT</Text>
            <Text style={[s.thText, col.money]}>TOTAL</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.td, col.idx, s.divide]}>{i + 1}</Text>
              <View style={[s.td, col.desc, s.divide]}>
                <Text>{line.description}</Text>
                <Text style={s.tdSub}>{[line.details, taxLabel(line)].filter(Boolean).join('  ·  ')}</Text>
              </View>
              <Text style={[s.td, col.qty, s.divide]}>{Number(line.quantity).toLocaleString('en-KE')}{line.unitLabel ? ` ${line.unitLabel}` : ''}</Text>
              <Text style={[s.td, col.money, s.divide]}>{money(Number(line.unitPrice), currency)}</Text>
              <Text style={[s.td, col.money]}>{money(Number(line.lineTotal), currency)}</Text>
            </View>
          ))}
        </View>
        <Totals
          rows={[
            { key: 'Subtotal', value: money(Number(data.subtotal), currency) },
            { key: 'Net', value: money(Number(data.net), currency) },
            { key: 'Tax', value: money(Number(data.taxAmount), currency) },
            ...(Number(data.paidAmount) > 0 ? [{ key: isInvoice ? 'Payments received' : 'Deposits received', value: `- ${money(Number(data.paidAmount), currency)}` }] : []),
          ]}
          grand={{ key: Number(data.balance) > 0 ? 'Balance' : 'Total', value: money(Number(data.balance) > 0 ? Number(data.balance) : Number(data.total), currency) }}
        />
        {!isInvoice && Number(data.depositRequired) > 0 ? <Text style={s.note}>Required deposit: {money(Number(data.depositRequired), currency)}. Balance after required deposit: {money(Math.max(0, Number(data.total) - Number(data.depositRequired)), currency)}.</Text> : null}
        {data.payments.length ? <Text style={s.note}>Payments/deposits recorded: {data.payments.map((p) => `${p.paymentMethod.name} ${money(Number(p.amount), currency)}${p.reference ? ` (${p.reference})` : ''}`).join('; ')}</Text> : null}
        {data.footerText ? <Text style={s.note}>{data.footerText}</Text> : null}
        <SignatureBlock columns={[{ role: 'Issued by' }, { role: isInvoice ? 'Received by' : 'Accepted by' }]} />
        <Footer profile={profile} />
      </Page>
    </Document>
  )
}
