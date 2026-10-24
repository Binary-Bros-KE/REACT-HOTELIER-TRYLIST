import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LuCircleAlert, LuDownload, LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import SearchableSelect from '@/components/ui/SearchableSelect'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportDocData } from '@/components/documents/pdf'
import { downloadCsvRows } from '@/lib/csv'
import { cn } from '@/lib/utils'

// Statement of account for a customer or a supplier: every bill with what was
// billed, paid and is still outstanding. Owing bills only by default; "All" adds
// the paid ones; an optional date range is on the bill date. Server:
// GET /customers/:id/statement, GET /suppliers/:id/statement.

type Kind = 'customer' | 'supplier'
type Line = { key: string; kind: 'ORDER' | 'STAY' | 'INVOICE' | 'PURCHASE' | 'ACCOUNT'; reference: string; description: string; date: string; billed: number; paid: number; outstanding: number }
type Statement = {
  party: { id: string; detail: string | null; name: string; phone: string | null; email: string | null; address: string | null }
  lines: Line[]
  totals: { billed: number; paid: number; outstanding: number }
  balance: number
}
type Party = { id: string; label: string; hint?: string }

const money = (v: number) => `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const day = (v: string) => new Date(v).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
const KIND_LABEL: Record<Line['kind'], string> = { ORDER: 'Sale', STAY: 'Stay', INVOICE: 'Invoice', PURCHASE: 'Purchase', ACCOUNT: 'Account' }

export default function StatementModal({ kind, initialId, onClose }: { kind: Kind; initialId?: string; onClose: () => void }) {
  const toast = useToast()
  const [parties, setParties] = useState<Party[]>([])
  const [partyId, setPartyId] = useState(initialId ?? '')
  const [show, setShow] = useState<'owing' | 'all'>('owing')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statement, setStatement] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(false)
  const noun = kind === 'customer' ? 'customer' : 'supplier'

  useEffect(() => {
    if (kind === 'customer') {
      api<{ customers: { id: string; customerNo?: string | null; firstName: string; lastName: string | null; businessName?: string | null; phone?: string | null; balance?: string | number }[] }>('/customers')
        .then((r) => setParties(r.customers.map((c) => ({ id: c.id, label: c.businessName || `${c.firstName} ${c.lastName ?? ''}`.trim(), hint: [c.phone, Number(c.balance ?? 0) > 0 ? `owes ${money(Number(c.balance))}` : null].filter(Boolean).join(' · ') }))))
        .catch(() => {})
    } else {
      api<{ suppliers: { id: string; name: string; phone?: string | null; balance?: string | number }[] }>('/suppliers')
        .then((r) => setParties(r.suppliers.map((s) => ({ id: s.id, label: s.name, hint: [s.phone, Number(s.balance ?? 0) > 0 ? `owed ${money(Number(s.balance))}` : null].filter(Boolean).join(' · ') }))))
        .catch(() => {})
    }
  }, [kind])

  useEffect(() => {
    if (!partyId) { setStatement(null); return }
    setLoading(true)
    const q = new URLSearchParams({ show })
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    api<Statement>(`/${kind === 'customer' ? 'customers' : 'suppliers'}/${partyId}/statement?${q}`)
      .then(setStatement)
      .catch((cause) => { setStatement(null); toast.error(cause instanceof Error ? cause.message : 'Could not load the statement') })
      .finally(() => setLoading(false))
  }, [kind, partyId, show, from, to, toast])

  const options = useMemo(() => parties.map((p) => ({ value: p.id, label: p.label, hint: p.hint })), [parties])
  const filterLabel = [show === 'owing' ? 'Unpaid bills' : 'All bills, paid and unpaid', from || to ? `${from ? day(from) : 'start'} to ${to ? day(to) : 'today'}` : null].filter(Boolean).join(' · ')
  const balanceLabel = kind === 'customer' ? 'Balance owed by customer' : 'Balance owed to supplier'

  function doc(s: Statement): ReportDocData {
    const contact = [s.party.detail, s.party.phone, s.party.email, s.party.address].filter(Boolean).join(' · ')
    return {
      reportTitle: kind === 'customer' ? 'Customer Statement' : 'Supplier Statement',
      kicker: 'Statement of account',
      rangeLabel: s.party.name,
      generatedAt: new Date().toISOString(),
      cards: [
        { label: 'Billed', value: money(s.totals.billed) },
        { label: 'Paid', value: money(s.totals.paid) },
        { label: 'Outstanding', value: money(s.totals.outstanding) },
        { label: balanceLabel, value: money(s.balance) },
      ],
      sections: [{
        title: filterLabel,
        note: contact || undefined,
        compact: true,
        columns: [{ label: 'Date' }, { label: 'Reference', flex: 1.2 }, { label: 'Details', flex: 2.4 }, { label: 'Billed', align: 'right' }, { label: 'Paid', align: 'right' }, { label: 'Outstanding', align: 'right' }],
        rows: s.lines.map((l) => [day(l.date), l.reference, l.description, money(l.billed), money(l.paid), money(l.outstanding)]),
        // The shaded, bold total row, like the salaries report's.
        totals: ['Total', '', '', money(s.totals.billed), money(s.totals.paid), money(s.totals.outstanding)],
      }],
    }
  }

  function exportCsv(s: Statement) {
    const rows: (string | number)[][] = [[`${kind === 'customer' ? 'Customer' : 'Supplier'} statement: ${s.party.name}`], [filterLabel], [], ['Date', 'Type', 'Reference', 'Details', 'Billed', 'Paid', 'Outstanding']]
    for (const l of s.lines) rows.push([day(l.date), KIND_LABEL[l.kind], l.reference, l.description, l.billed, l.paid, l.outstanding])
    rows.push(['', '', 'TOTAL', '', s.totals.billed, s.totals.paid, s.totals.outstanding], [], [balanceLabel, '', '', '', '', '', s.balance])
    downloadCsvRows(`statement-${s.party.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, rows)
  }

  return (
    <ModalShell size="xl" kicker="Statement of account" title={statement?.party.name ?? `${noun[0].toUpperCase()}${noun.slice(1)} statement`} subtitle={statement ? filterLabel : `Choose a ${noun} to see their bills.`} onClose={onClose}
      footer={<>
        <ActionButton tone="neutral" icon={<LuDownload />} disabled={!statement || loading} onClick={() => statement && exportCsv(statement)}>Export Excel</ActionButton>
        <PrintReportButton data={statement ? doc(statement) : null} disabled={loading || !statement} label="Print statement" />
      </>}>
      <div className="space-y-4 p-5 text-sm">
        <div className="grid gap-3 sm:grid-cols-[2fr_auto_1fr_1fr] sm:items-end">
          <Field label={noun === 'customer' ? 'Customer' : 'Supplier'}>
            <SearchableSelect options={options} value={partyId} onChange={setPartyId} placeholder={`Choose a ${noun}`} searchPlaceholder={`Search ${noun}s…`} emptyText={`No ${noun}s match.`} />
          </Field>
          <Field label="Show">
            <div className="flex border bg-card p-1">
              {([['owing', 'Unpaid'], ['all', 'All']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setShow(value)} className={cn('px-3 py-1.5 text-xs font-semibold transition', show === value ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
              ))}
            </div>
          </Field>
          <Field label="From"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>

        {!partyId ? (
          <p className="border border-dashed p-10 text-center text-muted-foreground">Choose a {noun} above to generate their statement.</p>
        ) : loading || !statement ? (
          <div className="p-10 text-center text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Card label="Billed" value={money(statement.totals.billed)} />
              <Card label="Paid" value={money(statement.totals.paid)} />
              <Card label="Outstanding" value={money(statement.totals.outstanding)} strong />
              <Card label={balanceLabel} value={money(statement.balance)} />
            </div>
            {statement.lines.length === 0 ? (
              <p className="flex items-center justify-center gap-2 border border-dashed p-10 text-muted-foreground"><LuCircleAlert /> {show === 'owing' ? `Nothing outstanding${from || to ? ' in this period' : ''}.` : 'No bills in this period.'}</p>
            ) : (
              <div className="overflow-x-auto border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase text-primary-foreground">
                    <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Billed</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Outstanding</th></tr>
                  </thead>
                  <tbody>
                    {statement.lines.map((l) => (
                      <tr key={l.key} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">{day(l.date)}</td>
                        <td className="px-3 py-2"><span className="font-semibold">{l.reference}</span><span className="ml-2 text-[10px] font-bold uppercase text-muted-foreground">{KIND_LABEL[l.kind]}</span></td>
                        <td className="px-3 py-2 text-muted-foreground">{l.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(l.billed)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(l.paid)}</td>
                        <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', l.outstanding > 0.004 ? 'text-destructive' : l.outstanding < -0.004 ? 'text-success' : 'text-muted-foreground')}>{money(l.outstanding)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="px-3 py-2" colSpan={3}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(statement.totals.billed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(statement.totals.paid)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(statement.totals.outstanding)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {kind === 'customer'
                ? 'Bills are credit sales, stays charged to the account and invoices. A negative outstanding is a payment in advance.'
                : 'Bills are purchases (goods received). A negative outstanding is a payment made ahead of goods.'}
            </p>
          </>
        )}
      </div>
    </ModalShell>
  )
}

function Card({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('border bg-card p-3', strong && 'border-destructive/40')}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', strong && 'text-destructive')}>{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}
