import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCheck, LuCircleAlert, LuCreditCard, LuFileText, LuLoaderCircle, LuPencil, LuPlus, LuPrinter, LuRefreshCw, LuSearch, LuSend, LuSignature, LuTrash2 } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import ActionButton from '@/components/ui/ActionButton'
import ModalShell from '@/components/ui/ModalShell'
import StatusPill from '@/components/ui/StatusPill'
import DocumentViewer from '@/components/documents/DocumentViewer'
import type { DocProfile } from '@/components/documents/pdf'
import { useWorkingLocation } from '@/lib/useWorkingLocation'

type DocType = 'QUOTATION' | 'INVOICE'
type Status = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID'
type TaxMode = 'INCLUSIVE' | 'EXCLUSIVE'
type TaxTreatment = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'
type LineSource = 'CUSTOM' | 'ROOM' | 'ROOM_STAY' | 'FOLIO' | 'SERVICE' | 'SERVICE_MEMBERSHIP' | 'POS_ORDER'
type Customer = { id: string; firstName: string; lastName: string | null; businessName: string | null; phone: string | null; email: string | null; billingPhone?: string | null; billingEmail?: string | null; address?: string | null }
type Location = { id: string; name: string; isActive?: boolean }
type PaymentMethod = { id: string; name: string; requiresReference: boolean }
type Line = { id?: string; source?: LineSource; sourceRefId?: string | null; description: string; details: string; quantity: string; unitLabel: string; unitPrice: string; discount: string; taxRate: string; taxMode: TaxMode; taxTreatment: TaxTreatment }
type SourceLine = { id: string; kind: string; label: string; description: string | null; price: number; unitLabel: string | null; source: LineSource; sourceRefId: string; taxRate: string | number; taxMode: TaxMode; taxTreatment: TaxTreatment }
type SourceFolio = { reservationId: string; folioId: string; reservationNo: string; folioNo: string; customerName: string; locationName: string | null; roomLabel: string; checkIn: string; checkOut: string; total: number; paid: number; balance: number }
type SourceOrder = { id: string; orderNumber: number; channel: string; customerName: string; locationName: string | null; total: number; paid: number; balance: number; createdAt: string }
type SourceOptions = { roomRates: SourceLine[]; services: SourceLine[]; folios: SourceFolio[]; orders: SourceOrder[] }
type DocumentRow = {
  id: string; documentNo: string; type: DocType; status: Status; title: string | null; intro: string | null; headerText: string | null; footerText: string | null
  customerId: string | null; customer: Customer | null; prospectName: string | null; prospectPhone: string | null; prospectEmail: string | null; prospectAddress: string | null
  locationId: string | null; location: Location | null; issuedAt: string | null; expiresAt: string | null; dueAt: string | null; depositRequired: string | number
  subtotal: string | number; net: string | number; taxAmount: string | number; total: string | number; paidAmount: string | number; balance: string | number
  lines: (Omit<Line, 'details' | 'quantity' | 'unitPrice' | 'discount' | 'taxRate'> & { source: LineSource; sourceRefId: string | null; details: string | null; quantity: string | number; unitPrice: string | number; discount: string | number; taxRate: string | number; lineSubtotal: string | number; netAmount: string | number; taxAmount: string | number; lineTotal: string | number })[]
  payments: { id: string; kind: 'DEPOSIT' | 'PAYMENT'; amount: string | number; reference: string | null; paidAt: string; paymentMethod: PaymentMethod }[]
  convertedDocuments: { id: string; documentNo: string; type: DocType; status: Status }[]
  sourceDocument: { id: string; documentNo: string; type: DocType; status: Status } | null
}
type Options = { customers: Customer[]; locations: Location[]; paymentMethods: PaymentMethod[]; tax: { taxRate: string | number; taxMode: TaxMode; taxTreatment: TaxTreatment } }

const money = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)
const blankLine = (tax?: Options['tax']): Line => ({ source: 'CUSTOM', sourceRefId: null, description: '', details: '', quantity: '1', unitLabel: '', unitPrice: '', discount: '0', taxRate: String(tax?.taxRate ?? 16), taxMode: tax?.taxMode ?? 'INCLUSIVE', taxTreatment: tax?.taxTreatment ?? 'STANDARD' })
const statusTone = (s: Status) => s === 'PAID' || s === 'ACCEPTED' ? 'success' : s === 'OVERDUE' || s === 'REJECTED' || s === 'VOID' ? 'danger' : s === 'PARTIALLY_PAID' || s === 'SENT' || s === 'ISSUED' ? 'warning' : s === 'CONVERTED' ? 'secondary' : 'muted'

export default function CommercialDocuments({ type }: { type: DocType }) {
  const toast = useToast()
  const isInvoice = type === 'INVOICE'
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [summary, setSummary] = useState({ total: 0, value: 0, paid: 0, balance: 0, overdue: 0 })
  const [options, setOptions] = useState<Options>({ customers: [], locations: [], paymentMethods: [], tax: { taxRate: 16, taxMode: 'INCLUSIVE', taxTreatment: 'STANDARD' } })
  const [sources, setSources] = useState<SourceOptions>({ roomRates: [], services: [], folios: [], orders: [] })
  const { fixed: fixedLocation, options: pickableLocations, setLocation, effectiveId } = useWorkingLocation(options.locations, { persist: false })
  const [profile, setProfile] = useState<DocProfile>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<DocumentRow | 'new' | null>(null)
  const [paying, setPaying] = useState<DocumentRow | null>(null)
  const [printing, setPrinting] = useState<DocumentRow | null>(null)
  const [sourcePicker, setSourcePicker] = useState<'folio' | 'order' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type })
      if (query.trim()) params.set('search', query.trim())
      if (status) params.set('status', status)
      const [docs, opts, sourceOpts, prof] = await Promise.all([
        api<{ documents: DocumentRow[]; summary: typeof summary }>(`/commercial-documents?${params}`),
        api<Options>('/commercial-documents/options'),
        api<SourceOptions>('/commercial-documents/source-options'),
        api<{ profile: NonNullable<DocProfile> | null }>('/business-profile'),
      ])
      setDocuments(docs.documents)
      setSummary(docs.summary)
      setOptions(opts)
      setSources(sourceOpts)
      setProfile(prof.profile)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : `Could not load ${isInvoice ? 'invoices' : 'quotations'}`)
    } finally {
      setLoading(false)
    }
  }, [type, query, status, toast, isInvoice])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  async function setDocStatus(doc: DocumentRow, next: Status) {
    try {
      const result = await api<{ document: DocumentRow }>(`/commercial-documents/${doc.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) })
      setDocuments((cur) => cur.map((d) => d.id === doc.id ? result.document : d))
      toast.success(`${doc.documentNo} marked ${next.toLowerCase().replaceAll('_', ' ')}.`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update status')
    }
  }

  async function convert(doc: DocumentRow) {
    try {
      const result = await api<{ document: DocumentRow }>(`/commercial-documents/${doc.id}/convert-to-invoice`, { method: 'POST' })
      toast.success(`${doc.documentNo} converted to ${result.document.documentNo}.`)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not convert quotation')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reception" title={isInvoice ? 'Invoices' : 'Quotations'} />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard index={0} icon={isInvoice ? <LuFileText /> : <LuSignature />} label={isInvoice ? 'Invoices' : 'Quotations'} value={summary.total} />
        <StatCard index={1} icon={<LuCreditCard />} label="Total value" value={money(summary.value)} />
        <StatCard index={2} icon={<LuCheck />} label={isInvoice ? 'Paid' : 'Deposits'} value={money(summary.paid)} />
        <StatCard tone={summary.overdue ? 'danger' : 'warn'} icon={<LuCircleAlert />} label={isInvoice ? 'Outstanding' : 'Open balance'} value={money(summary.balance)} hint={summary.overdue ? `${summary.overdue} overdue` : undefined} />
      </div>
      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">{isInvoice ? 'Invoice register' : 'Quotation register'}</h2>
            <p className="text-xs text-muted-foreground">{isInvoice ? 'Every issued invoice and payment stays here.' : 'Prepare quotes, collect deposits, and convert accepted quotes to invoices.'}</p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number or client..." className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-72" />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All statuses</option>
            {(isInvoice ? ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'] : ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'CONVERTED']).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select>
          {isInvoice && <ActionButton tone="neutral" icon={<LuFileText />} onClick={() => setSourcePicker('folio')}>From stay</ActionButton>}
          {isInvoice && <ActionButton tone="neutral" icon={<LuRefreshCw />} onClick={() => setSourcePicker('order')}>From sale</ActionButton>}
          <ActionButton tone="primary" icon={<LuPlus />} onClick={() => setEditor('new')}>{isInvoice ? 'New invoice' : 'New quotation'}</ActionButton>
        </div>
        {loading ? <div className="p-16 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground"><tr><th className="px-5 py-3">Document</th><th className="px-5 py-3">Client</th><th className="px-5 py-3">Dates</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Balance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y">
                {documents.map((doc) => (
                  <tr key={doc.id} className="even:bg-muted/30">
                    <td className="px-5 py-3.5"><button onClick={() => setPrinting(doc)} className="font-semibold text-secondary hover:underline">{doc.documentNo}</button><p className="text-xs text-muted-foreground">{doc.title || (isInvoice ? 'Invoice' : 'Quotation')}{doc.sourceDocument ? ` from ${doc.sourceDocument.documentNo}` : ''}</p></td>
                    <td className="px-5 py-3.5">{clientName(doc)}<p className="text-xs text-muted-foreground">{doc.location?.name ?? 'No location'}</p></td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{isInvoice ? `Due ${doc.dueAt ? new Date(doc.dueAt).toLocaleDateString() : '-'}` : `Expires ${doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : '-'}`}</td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{money(Number(doc.total))}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{money(Number(doc.balance))}</td>
                    <td className="px-5 py-3.5"><StatusPill tone={statusTone(doc.status)}>{doc.status.replaceAll('_', ' ')}</StatusPill></td>
                    <td className="px-5 py-3.5"><div className="flex justify-end gap-1.5">
                      <ActionButton tone="neutral" icon={<LuPrinter />} title="Print / download" onClick={() => setPrinting(doc)} />
                      {['DRAFT', 'SENT', 'ISSUED'].includes(doc.status) && <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => setEditor(doc)} />}
                      {doc.type === 'QUOTATION' && doc.status === 'DRAFT' && <ActionButton tone="neutral" icon={<LuSend />} title="Mark sent" onClick={() => void setDocStatus(doc, 'SENT')} />}
                      {doc.type === 'QUOTATION' && ['SENT', 'DRAFT'].includes(doc.status) && <ActionButton tone="neutral" icon={<LuCheck />} title="Accept" onClick={() => void setDocStatus(doc, 'ACCEPTED')} />}
                      {doc.type === 'QUOTATION' && doc.status === 'ACCEPTED' && <ActionButton tone="primary" icon={<LuRefreshCw />} title="Convert to invoice" onClick={() => void convert(doc)} />}
                      {doc.type === 'INVOICE' && doc.status === 'DRAFT' && <ActionButton tone="neutral" icon={<LuSend />} title="Issue" onClick={() => void setDocStatus(doc, 'ISSUED')} />}
                      {((doc.type === 'INVOICE' && !['DRAFT', 'PAID', 'CANCELLED', 'VOID'].includes(doc.status)) || doc.type === 'QUOTATION') && <ActionButton tone="primary" icon={<LuCreditCard />} title={doc.type === 'INVOICE' ? 'Record payment' : 'Record deposit'} onClick={() => setPaying(doc)} />}
                    </div></td>
                  </tr>
                ))}
                {documents.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No {isInvoice ? 'invoices' : 'quotations'} yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editor && <DocumentEditor type={type} document={editor === 'new' ? null : editor} options={options} sources={sources} fixedLocation={fixedLocation} locations={pickableLocations} selectedLocationId={effectiveId} setLocation={setLocation} onClose={() => setEditor(null)} onSaved={(doc) => { setEditor(null); setDocuments((cur) => editor === 'new' ? [doc, ...cur] : cur.map((d) => d.id === doc.id ? doc : d)); void load() }} />}
      {sourcePicker && <SourceInvoiceModal kind={sourcePicker} sources={sources} onClose={() => setSourcePicker(null)} onCreated={(doc) => { setSourcePicker(null); setDocuments((cur) => [doc, ...cur]); setPrinting(doc); void load() }} />}
      {paying && <PaymentModal doc={paying} methods={options.paymentMethods} onClose={() => setPaying(null)} onSaved={(doc) => { setPaying(null); setDocuments((cur) => cur.map((d) => d.id === doc.id ? doc : d)); void load() }} />}
      {printing && profile && <DocumentViewer kind="commercial-document" data={printing} profile={profile} onClose={() => setPrinting(null)} />}
    </div>
  )
}

function clientName(doc: DocumentRow) {
  if (doc.customer?.businessName) return doc.customer.businessName
  if (doc.customer) return `${doc.customer.firstName} ${doc.customer.lastName ?? ''}`.trim()
  return doc.prospectName ?? 'Prospect'
}

function SourceInvoiceModal({ kind, sources, onClose, onCreated }: { kind: 'folio' | 'order'; sources: SourceOptions; onClose: () => void; onCreated: (doc: DocumentRow) => void }) {
  const toast = useToast()
  const [savingId, setSavingId] = useState<string | null>(null)
  const items = kind === 'folio' ? sources.folios : sources.orders
  async function create(item: SourceFolio | SourceOrder) {
    setSavingId(kind === 'folio' ? (item as SourceFolio).folioId : (item as SourceOrder).id)
    try {
      const result = await api<{ document: DocumentRow }>(kind === 'folio' ? '/commercial-documents/from-folio' : '/commercial-documents/from-order', {
        method: 'POST',
        body: JSON.stringify(kind === 'folio' ? { folioId: (item as SourceFolio).folioId } : { orderId: (item as SourceOrder).id }),
      })
      toast.success(`${result.document.documentNo} created.`)
      onCreated(result.document)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not create invoice')
    } finally {
      setSavingId(null)
    }
  }
  return (
    <ModalShell size="lg" kicker="Generate invoice" title={kind === 'folio' ? 'Invoice a stay folio' : 'Invoice a completed sale'} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
        {items.map((item) => {
          const id = kind === 'folio' ? (item as SourceFolio).folioId : (item as SourceOrder).id
          const title = kind === 'folio' ? `${(item as SourceFolio).customerName} - ${(item as SourceFolio).reservationNo}` : `${(item as SourceOrder).customerName} - Order #${(item as SourceOrder).orderNumber}`
          const meta = kind === 'folio'
            ? `${(item as SourceFolio).roomLabel} · ${(item as SourceFolio).locationName ?? 'No location'}`
            : `${(item as SourceOrder).channel.replaceAll('_', ' ')} · ${(item as SourceOrder).locationName ?? 'No location'}`
          return (
            <div key={id} className="flex flex-col gap-3 border bg-card p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-xs text-muted-foreground">{meta}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total {money(item.total)} · Paid {money(item.paid)} · Balance {money(item.balance)}</p>
              </div>
              <button type="button" onClick={() => void create(item)} disabled={savingId === id} className="inline-flex items-center justify-center gap-2 bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {savingId === id && <LuLoaderCircle className="animate-spin" />}Create
              </button>
            </div>
          )
        })}
        {items.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{kind === 'folio' ? 'No unpaid stay folios available.' : 'No completed customer sales available.'}</p>}
      </div>
    </ModalShell>
  )
}

function DocumentEditor({ type, document, options, sources, fixedLocation, locations, selectedLocationId, setLocation, onClose, onSaved }: { type: DocType; document: DocumentRow | null; options: Options; sources: SourceOptions; fixedLocation: Location | null; locations: Location[]; selectedLocationId: string; setLocation: (id: string) => void; onClose: () => void; onSaved: (doc: DocumentRow) => void }) {
  const toast = useToast()
  const isInvoice = type === 'INVOICE'
  const [saving, setSaving] = useState(false)
  const [locationId, setLocationId] = useState(fixedLocation?.id ?? document?.locationId ?? selectedLocationId ?? '')
  const [form, setForm] = useState(() => ({
    customerId: document?.customerId ?? '',
    prospectName: document?.prospectName ?? '',
    prospectPhone: document?.prospectPhone ?? '',
    prospectEmail: document?.prospectEmail ?? '',
    prospectAddress: document?.prospectAddress ?? '',
    title: document?.title ?? '',
    intro: document?.intro ?? '',
    expiresAt: document?.expiresAt?.slice(0, 10) ?? '',
    dueAt: document?.dueAt?.slice(0, 10) ?? '',
    depositRequired: String(document?.depositRequired ?? 0),
    lines: document?.lines.map((l) => ({ source: l.source, sourceRefId: l.sourceRefId, description: l.description, details: l.details ?? '', quantity: String(l.quantity), unitLabel: l.unitLabel ?? '', unitPrice: String(l.unitPrice), discount: String(l.discount), taxRate: String(l.taxRate), taxMode: l.taxMode, taxTreatment: l.taxTreatment })) ?? [blankLine(options.tax)],
  }))
  const preview = useMemo(() => form.lines.reduce((sum, l) => sum + Math.max(0, Number(l.quantity || 0) * Number(l.unitPrice || 0) - Number(l.discount || 0)), 0), [form.lines])
  function setLine(index: number, patch: Partial<Line>) { setForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === index ? { ...l, ...patch } : l) })) }
  function addSourceLine(line: SourceLine) {
    const next: Line = {
      source: line.source,
      sourceRefId: line.sourceRefId,
      description: line.label,
      details: line.description ?? '',
      quantity: '1',
      unitLabel: line.unitLabel ?? '',
      unitPrice: String(line.price),
      discount: '0',
      taxRate: String(line.taxRate),
      taxMode: line.taxMode,
      taxTreatment: line.taxTreatment,
    }
    setForm((f) => ({ ...f, lines: f.lines.length === 1 && !f.lines[0].description.trim() ? [next] : [...f.lines, next] }))
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (isInvoice && !form.customerId) { toast.error('Choose a customer before creating an invoice'); return }
    setSaving(true)
    try {
      const body = {
        type,
        ...form,
        locationId: (fixedLocation?.id ?? locationId) || null,
        customerId: form.customerId || null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`) : null,
        dueAt: form.dueAt ? new Date(`${form.dueAt}T23:59:59`) : null,
        depositRequired: Number(form.depositRequired) || 0,
        lines: form.lines.map((l) => ({ ...l, source: l.source ?? 'CUSTOM', sourceRefId: l.sourceRefId ?? null, quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0, discount: Number(l.discount) || 0, taxRate: Number(l.taxRate) || 0 })),
      }
      const result = await api<{ document: DocumentRow }>(document ? `/commercial-documents/${document.id}` : '/commercial-documents', { method: document ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      toast.success(document ? 'Document updated.' : `${result.document.documentNo} created.`)
      onSaved(result.document)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save document')
    } finally { setSaving(false) }
  }
  return (
    <ModalShell size="xl" kicker={document ? 'Edit document' : isInvoice ? 'New invoice' : 'New quotation'} title={document?.documentNo ?? (isInvoice ? 'Create invoice' : 'Create quotation')} onClose={onClose} footer={<><button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button><button form="commercial-doc-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">{saving && <LuLoaderCircle className="animate-spin" />}Save</button></>}>
      <form id="commercial-doc-form" onSubmit={save} className="grid max-h-[72vh] gap-5 overflow-y-auto p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" required={isInvoice}><select required={isInvoice} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="input"><option value="">{isInvoice ? 'Select customer' : 'Walk-in / prospect'}</option>{options.customers.map((c) => <option key={c.id} value={c.id}>{c.businessName || `${c.firstName} ${c.lastName ?? ''}`}</option>)}</select></Field>
            <Field label="Location">{fixedLocation ? <div className="input bg-muted/50">{fixedLocation.name}</div> : <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setLocation(e.target.value) }} className="input"><option value="">Select location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}</Field>
            {!isInvoice && !form.customerId && <><Field label="Prospect name" required><input required value={form.prospectName} onChange={(e) => setForm({ ...form, prospectName: e.target.value })} className="input" /></Field><Field label="Prospect phone"><input value={form.prospectPhone} onChange={(e) => setForm({ ...form, prospectPhone: e.target.value })} className="input" /></Field></>}
            <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Wedding quotation" className="input" /></Field>
            <Field label={isInvoice ? 'Due date' : 'Expiry date'}><input type="date" min={today()} value={isInvoice ? form.dueAt : form.expiresAt} onChange={(e) => setForm({ ...form, [isInvoice ? 'dueAt' : 'expiresAt']: e.target.value })} className="input" /></Field>
            {!isInvoice && <Field label="Required deposit"><input type="number" min="0" step="0.01" value={form.depositRequired} onChange={(e) => setForm({ ...form, depositRequired: e.target.value })} className="input" /></Field>}
            <Field label="Intro paragraph" className="sm:col-span-2"><textarea rows={3} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} className="input" placeholder="Optional note shown above the lines." /></Field>
          </div>
          <div className="overflow-hidden border">
            <div className="flex flex-col gap-3 border-b bg-muted/40 p-3 lg:flex-row lg:items-center">
              <h3 className="font-semibold lg:mr-auto">Line items</h3>
              <select defaultValue="" onChange={(e) => { const found = sources.roomRates.find((line) => line.id === e.target.value); if (found) addSourceLine(found); e.currentTarget.value = '' }} className="input lg:w-56">
                <option value="">Add room / rate</option>
                {sources.roomRates.map((line) => <option key={`${line.kind}-${line.id}`} value={line.id}>{line.label} - {money(line.price)}</option>)}
              </select>
              <select defaultValue="" onChange={(e) => { const found = sources.services.find((line) => line.id === e.target.value); if (found) addSourceLine(found); e.currentTarget.value = '' }} className="input lg:w-56">
                <option value="">Add service</option>
                {sources.services.map((line) => <option key={`${line.kind}-${line.id}`} value={line.id}>{line.label} - {money(line.price)}</option>)}
              </select>
              <ActionButton tone="neutral" icon={<LuPlus />} onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, blankLine(options.tax)] }))}>Add line</ActionButton>
            </div>
            <div className="divide-y">
              {form.lines.map((line, index) => <div key={index} className="grid gap-3 p-3 lg:grid-cols-[1.4fr_.55fr_.55fr_.7fr_.8fr_auto]">
                <input required value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} placeholder="Description" className="input" />
                <input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value })} placeholder="Qty" className="input" />
                <input value={line.unitLabel} onChange={(e) => setLine(index, { unitLabel: e.target.value })} placeholder="Unit" className="input" />
                <input required type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => setLine(index, { unitPrice: e.target.value })} placeholder="Unit price" className="input" />
                <div className="grid grid-cols-3 gap-2"><input type="number" min="0" step="0.01" value={line.taxRate} onChange={(e) => setLine(index, { taxRate: e.target.value })} className="input" /><select value={line.taxMode} onChange={(e) => setLine(index, { taxMode: e.target.value as TaxMode })} className="input"><option value="INCLUSIVE">Inclusive</option><option value="EXCLUSIVE">Exclusive</option></select><select value={line.taxTreatment} onChange={(e) => setLine(index, { taxTreatment: e.target.value as TaxTreatment })} className="input"><option value="STANDARD">VAT</option><option value="ZERO_RATED">Zero-rated</option><option value="EXEMPT">Exempt</option></select></div>
                <button type="button" onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }))} disabled={form.lines.length === 1} className="rounded-sm border px-3 disabled:opacity-40"><LuTrash2 /></button>
                <textarea value={line.details} onChange={(e) => setLine(index, { details: e.target.value })} placeholder="Optional line note" className="input lg:col-span-6" rows={1} />
              </div>)}
            </div>
          </div>
        </div>
        <aside className="space-y-3">
          <div className="border bg-muted/30 p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick total</p><p className="mt-2 text-2xl font-semibold">{money(preview)}</p><p className="mt-1 text-xs text-muted-foreground">Final tax is calculated by the server from each line.</p></div>
          <div className="border bg-muted/30 p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rule</p><p className="mt-2 text-sm">{isInvoice ? 'Invoices require a saved customer. No walk-ins.' : 'Quotations can be for a customer or a walk-in prospect.'}</p></div>
        </aside>
      </form>
    </ModalShell>
  )
}

function PaymentModal({ doc, methods, onClose, onSaved }: { doc: DocumentRow; methods: PaymentMethod[]; onClose: () => void; onSaved: (doc: DocumentRow) => void }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ kind: doc.type === 'QUOTATION' ? 'DEPOSIT' : 'PAYMENT', paymentMethodId: '', amount: String(doc.type === 'INVOICE' ? doc.balance : doc.depositRequired || doc.balance), reference: '', note: '' })
  const method = methods.find((m) => m.id === form.paymentMethodId)
  async function save(e: FormEvent) {
    e.preventDefault(); setSaving(true)
    try {
      const result = await api<{ document: DocumentRow }>(`/commercial-documents/${doc.id}/payments`, { method: 'POST', body: JSON.stringify({ ...form, amount: Number(form.amount), reference: form.reference || null, note: form.note || null }) })
      toast.success(doc.type === 'INVOICE' ? 'Payment recorded.' : 'Deposit recorded.')
      onSaved(result.document)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not record payment') } finally { setSaving(false) }
  }
  return <ModalShell size="sm" kicker={doc.documentNo} title={doc.type === 'INVOICE' ? 'Record payment' : 'Record deposit'} onClose={onClose} footer={<><button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button><button form="doc-payment-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">{saving && <LuLoaderCircle className="animate-spin" />}Record</button></>}>
    <form id="doc-payment-form" onSubmit={save} className="space-y-4 p-5">
      <Field label="Payment method" required><select required value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} className="input"><option value="">Select method</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Amount" required><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" /></Field>
      <Field label={method?.requiresReference ? 'Reference' : 'Reference (optional)'} required={method?.requiresReference}><input required={method?.requiresReference} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input" /></Field>
      <Field label="Note"><textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" /></Field>
    </form>
  </ModalShell>
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return <label className={`text-sm font-medium ${className}`}><span className="mb-1.5 block">{label}{required && <span className="text-destructive"> *</span>}</span>{children}</label>
}
