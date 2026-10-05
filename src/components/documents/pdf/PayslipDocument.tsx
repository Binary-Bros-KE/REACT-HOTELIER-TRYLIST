import { Document, Page, Text, View } from '@react-pdf/renderer'
import { s, money, shortDate } from './theme'
import type { DocProfile } from './theme'
import { Footer, Letterhead, MetaGrid, Party, SignatureBlock, Totals } from './parts'

export type PayslipDocData = {
  payslipNo: string
  status: string
  periodLabel: string
  paidAt: string | null
  paymentMethod: string | null
  reference: string | null
  notes: string | null
  employee: { firstName: string; lastName: string | null; employeeCode: string; jobTitle: string | null; department: string | null; phone: string | null }
  basicSalary: string | number
  totalAllowances: string | number
  totalDeductions: string | number
  carriedOverAmount: string | number
  grossPay: string | number
  netPay: string | number
  items: { type: 'ALLOWANCE' | 'DEDUCTION'; label: string; amount: string | number }[]
}

const col = {
  desc: { flex: 1 },
  amount: { width: 110, textAlign: 'right' as const },
}

function Section({ title, rows, currency }: { title: string; rows: { key: string; label: string; amount: string | number }[]; currency: string }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={s.sectionLabel}>{title}</Text>
      <View style={s.table}>
        <View style={s.th} fixed>
          <Text style={[s.thText, col.desc, s.divide]}>DESCRIPTION</Text>
          <Text style={[s.thText, col.amount]}>AMOUNT</Text>
        </View>
        {rows.map((row) => (
          <View key={row.key} style={s.tr} wrap={false}>
            <Text style={[s.td, col.desc, s.divide]}>{row.label}</Text>
            <Text style={[s.td, col.amount]}>{money(Number(row.amount), currency)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function PayslipDocument({ data, profile }: { data: PayslipDocData; profile: DocProfile }) {
  const currency = profile?.currency ?? 'KES'
  const name = `${data.employee.firstName} ${data.employee.lastName ?? ''}`.trim()
  const allowances = data.items.filter((i) => i.type === 'ALLOWANCE')
  const deductions = data.items.filter((i) => i.type === 'DEDUCTION')
  const carried = Number(data.carriedOverAmount)
  return (
    <Document title={`Payslip ${data.payslipNo}`} author={profile?.businessName ?? 'HOTELIER'}>
      <Page size="A4" style={s.page}>
        <Letterhead profile={profile} docType="PAYSLIP" docNo={data.payslipNo} status={data.status} />
        <Party
          label="EMPLOYEE"
          name={name}
          lines={[
            [data.employee.jobTitle, data.employee.department].filter(Boolean).join(' · '),
            `Employee code: ${data.employee.employeeCode}`,
            data.employee.phone ?? '',
          ]}
        />
        <MetaGrid
          cells={[
            { key: 'Pay period', value: data.periodLabel },
            { key: 'Paid on', value: data.paidAt ? shortDate(data.paidAt) : '—' },
            { key: 'Payment method', value: data.paymentMethod ?? '—' },
            { key: 'Reference', value: data.reference ?? '—' },
          ]}
        />
        <Section
          title="EARNINGS"
          currency={currency}
          rows={[{ key: 'basic', label: 'Basic salary', amount: data.basicSalary }, ...allowances.map((a, i) => ({ key: `a${i}`, label: a.label, amount: a.amount }))]}
        />
        {deductions.length > 0 && (
          <Section title="DEDUCTIONS" currency={currency} rows={deductions.map((d, i) => ({ key: `d${i}`, label: d.label, amount: d.amount }))} />
        )}
        <Totals
          rows={[
            { key: 'Gross pay', value: money(Number(data.grossPay), currency) },
            { key: 'Total deductions', value: `- ${money(Number(data.totalDeductions), currency)}` },
            ...(carried > 0 ? [{ key: 'Carried to next month', value: money(carried, currency) }] : []),
          ]}
          grand={{ key: 'Net pay', value: money(Number(data.netPay), currency) }}
        />
        {data.notes ? <Text style={s.note}>{data.notes}</Text> : null}
        <View style={{ marginTop: 10 }}>
          <Text style={s.note}>This payslip shows the pay for {data.periodLabel}. Keep it for your records.</Text>
        </View>
        <SignatureBlock columns={[{ role: 'Prepared by' }, { role: 'Received by', name }]} />
        <Footer profile={profile} />
      </Page>
    </Document>
  )
}

