import { Document, Page, Text } from '@react-pdf/renderer'
import { s, money, shortDate } from './theme'
import type { DocProfile } from './theme'
import { Letterhead, Party, MetaGrid, ItemsTable, Totals, SignatureBlock, Footer } from './parts'
import type { DocLine } from './parts'

type Employee = { firstName: string; lastName: string } | null
export type RequisitionDocData = {
  requisitionNo: string
  status: string
  requisitionDate: string
  neededBy: string | null
  purpose: string | null
  notes: string | null
  // null means redacted — the viewer who printed this doesn't hold
  // REQUISITION_APPROVE, so cost was never sent to them at all.
  estimatedTotal: string | null
  suggestedSupplier: { name: string } | null
  createdByEmployee: Employee
  reviewedByEmployee: Employee
  reviewedAt: string | null
  reviewNote: string | null
  items: { product: { name: string; unit: string }; quantity: string; estimatedUnitCost: string | null; lineTotal: string | null; note: string | null }[]
}

const fullName = (e: Employee) => (e ? `${e.firstName} ${e.lastName}` : '')
const moneyOrDash = (v: string | null, currency: string) => (v == null ? '—' : money(v, currency))

export default function RequisitionDocument({ data, profile }: { data: RequisitionDocData; profile: DocProfile }) {
  const currency = profile?.currency ?? 'KES'
  const lines: DocLine[] = data.items.map((i) => ({
    name: i.product.name,
    sub: i.note ?? undefined,
    qty: `${Number(i.quantity)} ${i.product.unit}`,
    unit: moneyOrDash(i.estimatedUnitCost, currency),
    total: moneyOrDash(i.lineTotal, currency),
  }))

  return (
    <Document title={`Requisition ${data.requisitionNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType="PURCHASE REQUISITION" docNo={data.requisitionNo} status={data.status} />

        <Party label="REQUESTED BY" name={fullName(data.createdByEmployee) || '—'} />

        <MetaGrid
          cells={[
            { key: 'Requisition Date', value: shortDate(data.requisitionDate) },
            { key: 'Needed By', value: shortDate(data.neededBy) },
            { key: 'Suggested Supplier', value: data.suggestedSupplier?.name ?? 'No preference' },
            { key: 'Status', value: data.status },
          ]}
        />

        {data.purpose ? <Text style={s.note}>Purpose: {data.purpose}</Text> : null}

        <ItemsTable unitHeader="Est. unit cost" lines={lines} />

        <Totals rows={[]} grand={{ key: 'Estimated Total', value: moneyOrDash(data.estimatedTotal, currency) }} />

        {data.notes ? <Text style={s.note}>Notes: {data.notes}</Text> : null}

        {data.reviewNote ? (
          <Text style={[s.note, { color: data.status === 'REJECTED' ? '#b91c1c' : '#15803d' }]}>
            {data.status === 'REJECTED' ? 'Rejected' : 'Approved'}
            {data.reviewedByEmployee ? ` by ${fullName(data.reviewedByEmployee)}` : ''}
            {data.reviewedAt ? ` on ${shortDate(data.reviewedAt)}` : ''} — “{data.reviewNote}”
          </Text>
        ) : null}

        <SignatureBlock
          columns={[
            { role: 'Requested by', name: fullName(data.createdByEmployee), date: shortDate(data.requisitionDate) },
            {
              role: 'Approved by',
              name: data.status === 'APPROVED' || data.status === 'CONVERTED' ? fullName(data.reviewedByEmployee) : '',
              date: data.reviewedAt && (data.status === 'APPROVED' || data.status === 'CONVERTED') ? shortDate(data.reviewedAt) : '',
            },
          ]}
        />

        <Footer profile={profile} />
      </Page>
    </Document>
  )
}
