import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuCircleAlert,
  LuCircleCheck,
  LuClipboardList,
  LuHourglass,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuPrinter,
  LuRepeat,
  LuSearch,
  LuTrash2,
  LuX,
} from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import StatCard from '@/components/ui/StatCard'
import { useAppSelector } from '@/store/hooks'
import { cn } from '@/lib/utils'
import type { DocProfile } from '@/components/documents/pdf'
import SupplierPickerModal, { type SupplierOption } from '@/components/SupplierPickerModal'
import PackQtyInput, { packAndUnit } from '@/components/ui/PackQtyInput'

const DocumentViewer = lazy(() => import('@/components/documents/DocumentViewer'))

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED'
const STATUS_META: Record<Status, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  SUBMITTED: { label: 'Submitted', className: 'bg-accent/10 text-accent' },
  APPROVED: { label: 'Approved', className: 'bg-secondary/10 text-secondary' },
  REJECTED: { label: 'Rejected', className: 'bg-destructive/10 text-destructive' },
  CONVERTED: { label: 'Converted', className: 'bg-success/10 text-success' },
  CANCELLED: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

type Supplier = SupplierOption
type Product = { id: string; name: string; unit: string; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }
type Employee = { id: string; firstName: string; lastName: string }
// Cost fields come back null from the API for anyone without
// REQUISITION_APPROVE — the server redacts them, not just the UI.
type ReqItem = {
  id: string
  productId: string
  quantity: string
  estimatedUnitCost: string | null
  lineTotal: string | null
  note: string | null
  product: Product
}
type Requisition = {
  id: string
  requisitionNo: string
  status: Status
  requisitionDate: string
  neededBy: string | null
  purpose: string | null
  notes: string | null
  estimatedTotal: string | null
  suggestedSupplier: { id: string; name: string } | null
  submittedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
  reviewedByEmployee: Employee | null
  purchase: { id: string; purchaseNo: string; status: string } | null
  items: ReqItem[]
  createdAt: string
  createdByEmployee: Employee | null
  updatedByEmployee: Employee | null
}
type Summary = { total: number; byStatus: Record<Status, number>; awaitingReview: number }

// The raiser only ever deals in product + quantity — no cost field here at
// all. Cost gets set later, by whoever reviews it (see reviewCosts below).
type LineRow = { productId: string; quantity: string }
type ReqForm = { requisitionDate: string; neededBy: string; purpose: string; suggestedSupplierId: string; notes: string; items: LineRow[] }
const emptyForm: ReqForm = { requisitionDate: '', neededBy: '', purpose: '', suggestedSupplierId: '', notes: '', items: [] }

const formatKes = (v: number) => `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Cost values come back null (redacted) for anyone without REQUISITION_APPROVE.
const formatCost = (v: string | null) => (v == null ? '—' : formatKes(Number(v)))
const costUnits = (quantity: number, packSize: number) => (packSize > 0 ? quantity / packSize : quantity)
const stockQty = (quantity: number, product: Product) => packAndUnit(quantity, Number(product.packSize) || 0, product.packLabel ?? '', product.packUnit?.name ?? product.unit)
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const todayInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function PurchaseRequisitions() {
  const toast = useToast()
  const permissions = useAppSelector((s) => s.auth.user?.role?.permissions) ?? []
  const canCreate = permissions.includes('REQUISITION_CREATE')
  const canApprove = permissions.includes('REQUISITION_APPROVE')

  const [rows, setRows] = useState<Requisition[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, byStatus: { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, CONVERTED: 0, CANCELLED: 0 }, awaitingReview: 0 })
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Requisition | null>(null)
  const [form, setForm] = useState<ReqForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [supplierPickerFor, setSupplierPickerFor] = useState<'suggested' | 'convert' | null>(null)

  const [detail, setDetail] = useState<Requisition | null>(null)
  const [working, setWorking] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [profile, setProfile] = useState<DocProfile>(null)
  const [printing, setPrinting] = useState<Requisition | null>(null)

  const [converting, setConverting] = useState<Requisition | null>(null)
  const [convertForm, setConvertForm] = useState({ supplierId: '', taxRate: '0', expectedDate: '', reference: '', notes: '' })

  // Cost entry for a reviewer: keyed by item id, populated when opening a
  // SUBMITTED requisition for review. The raiser never set these — this is
  // where a reviewer with REQUISITION_APPROVE fills them in before deciding.
  const [reviewCosts, setReviewCosts] = useState<Record<string, string>>({})
  const reviewTotal = useMemo(
    () => (detail?.items ?? []).reduce((sum, i) => sum + costUnits(Number(i.quantity), Number(i.product.packSize) || 0) * (Number(reviewCosts[i.id]) || 0), 0),
    [detail, reviewCosts],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (statusFilter !== 'all') query.set('status', statusFilter)
      const response = await api<{ requisitions: Requisition[]; summary: Summary }>(`/purchase-requisitions${query.size ? `?${query}` : ''}`)
      setRows(response.requisitions)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load requisitions'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, toast])

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t) }, [load])
  useEffect(() => {
    api<{ suppliers: Supplier[] }>('/suppliers?active=true').then((r) => setSuppliers(r.suppliers)).catch(() => {})
    api<{ products: Product[] }>('/products?active=true').then((r) => setProducts(r.products)).catch(() => {})
    api<{ profile: DocProfile }>('/business-profile').then((r) => setProfile(r.profile)).catch(() => {})
  }, [])

  const productById = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]))
    return (id: string) => map.get(id)
  }, [products])
  const suggestedSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === form.suggestedSupplierId) ?? null, [suppliers, form.suggestedSupplierId])
  const convertSupplier = useMemo(() => suppliers.find((supplier) => supplier.id === convertForm.supplierId) ?? null, [suppliers, convertForm.supplierId])

  function rememberSupplier(supplier: Supplier) {
    setSuppliers((current) => current.some((s) => s.id === supplier.id) ? current : [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const productMatches = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return []
    const chosen = new Set(form.items.map((i) => i.productId))
    return products.filter((p) => !chosen.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [productQuery, products, form.items])

  function addProduct(p: Product) {
    setForm((f) => (f.items.some((i) => i.productId === p.id) ? f : { ...f, items: [...f.items, { productId: p.id, quantity: '' }] }))
    setProductQuery('')
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, requisitionDate: todayInput() })
    setProductQuery('')
    setFormError('')
    setShowForm(true)
  }
  function openEdit(r: Requisition) {
    setEditing(r)
    setProductQuery('')
    setForm({
      requisitionDate: toDateInput(r.requisitionDate),
      neededBy: toDateInput(r.neededBy),
      purpose: r.purpose ?? '',
      suggestedSupplierId: r.suggestedSupplier?.id ?? '',
      notes: r.notes ?? '',
      items: r.items.map((i) => ({ productId: i.productId, quantity: String(Number(i.quantity)) })),
    })
    setFormError('')
    setShowForm(true)
  }

  function setRow(index: number, patch: Partial<LineRow>) {
    setForm((f) => ({ ...f, items: f.items.map((r, i) => (i === index ? { ...r, ...patch } : r)) }))
  }
  const removeRow = (index: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))

  async function saveRequisition(event: FormEvent) {
    event.preventDefault()
    const items = form.items
      .filter((r) => r.productId && Number(r.quantity) > 0)
      .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }))
    if (!items.length) { setFormError('Add at least one item with a quantity'); return }
    setSaving(true)
    setFormError('')
    setNotice('')
    try {
      const payload = {
        requisitionDate: form.requisitionDate || undefined,
        neededBy: form.neededBy || undefined,
        purpose: form.purpose.trim() || undefined,
        suggestedSupplierId: form.suggestedSupplierId || undefined,
        notes: form.notes.trim() || undefined,
        items,
      }
      await api(editing ? `/purchase-requisitions/${editing.id}` : '/purchase-requisitions', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setNotice(editing ? 'Requisition updated.' : 'Requisition created.')
      toast.success(editing ? 'Requisition updated.' : 'Requisition created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save requisition'
      setFormError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(r: Requisition, to: Status, opts: { promptReason?: boolean } = {}) {
    let note: string | undefined
    if (opts.promptReason) {
      const reason = window.prompt(`Reason for rejecting ${r.requisitionNo}:`)?.trim()
      if (!reason) return
      note = reason
    } else if (!window.confirm(`Move ${r.requisitionNo} to ${STATUS_META[to].label}?`)) {
      return
    }
    setWorking(true)
    setNotice('')
    try {
      const { requisition } = await api<{ requisition: Requisition }>(`/purchase-requisitions/${r.id}/status`, { method: 'POST', body: JSON.stringify({ status: to, note }) })
      setNotice(`${r.requisitionNo} is now ${STATUS_META[to].label.toLowerCase()}.`)
      toast.success('Status updated.')
      setDetail((d) => (d && d.id === requisition.id ? requisition : d))
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not change status')
    } finally {
      setWorking(false)
    }
  }

  /** Reviewer's approve: the raiser never set a cost, so this first saves
   * whatever the reviewer just entered per line (PATCH, allowed on a
   * SUBMITTED requisition for a REQUISITION_APPROVE holder), then moves the
   * requisition to APPROVED. */
  async function approveWithCosts(r: Requisition) {
    if (!window.confirm(`Approve ${r.requisitionNo}?`)) return
    setWorking(true)
    setNotice('')
    try {
      const items = r.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), estimatedUnitCost: Number(reviewCosts[i.id]) || 0 }))
      await api(`/purchase-requisitions/${r.id}`, { method: 'PATCH', body: JSON.stringify({ items }) })
      const { requisition } = await api<{ requisition: Requisition }>(`/purchase-requisitions/${r.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'APPROVED' }) })
      setNotice(`${r.requisitionNo} is now approved.`)
      toast.success('Status updated.')
      setDetail((d) => (d && d.id === requisition.id ? requisition : d))
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not approve requisition')
    } finally {
      setWorking(false)
    }
  }

  async function deleteRequisition(r: Requisition) {
    if (!window.confirm(`Delete draft ${r.requisitionNo}?`)) return
    try {
      await api(`/purchase-requisitions/${r.id}`, { method: 'DELETE' })
      setNotice('Draft requisition deleted.')
      toast.success('Draft requisition deleted.')
      setDetail(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete requisition')
    }
  }

  function openDetail(r: Requisition) {
    setDetail(r)
    setReviewCosts(Object.fromEntries(r.items.map((i) => [i.id, i.estimatedUnitCost != null ? String(Number(i.estimatedUnitCost)) : ''])))
  }

  function openConvert(r: Requisition) {
    setConverting(r)
    setConvertForm({ supplierId: r.suggestedSupplier?.id ?? '', taxRate: '0', expectedDate: '', reference: '', notes: '' })
  }
  async function submitConvert(event: FormEvent) {
    event.preventDefault()
    if (!converting || !convertForm.supplierId) return
    setWorking(true)
    try {
      const { purchase } = await api<{ purchase: { purchaseNo: string } }>(`/purchase-requisitions/${converting.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: convertForm.supplierId,
          taxRate: Number(convertForm.taxRate) || 0,
          expectedDate: convertForm.expectedDate || undefined,
          reference: convertForm.reference.trim() || undefined,
          notes: convertForm.notes.trim() || undefined,
        }),
      })
      setNotice(`${converting.requisitionNo} converted to purchase ${purchase.purchaseNo}.`)
      toast.success(`Purchase ${purchase.purchaseNo} created.`)
      setConverting(null)
      setDetail(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not convert requisition')
    } finally {
      setWorking(false)
    }
  }

  function rowActions(r: Requisition): ReactNode {
    const btn = 'rounded-sm border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50'
    switch (r.status) {
      case 'DRAFT':
        return canCreate ? (
          <>
            <button onClick={() => void changeStatus(r, 'SUBMITTED')} disabled={working} className={btn}>Submit</button>
            <button onClick={() => openEdit(r)} title="Edit" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPencil /></button>
            <button onClick={() => void deleteRequisition(r)} title="Delete" className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>
          </>
        ) : null
      case 'SUBMITTED':
        // Approving needs a cost per line first (the raiser never set one) —
        // that happens in the detail view, not a one-click list action.
        return canApprove ? (
          <>
            <button onClick={() => openDetail(r)} className={btn}>Review</button>
            <button onClick={() => void changeStatus(r, 'REJECTED', { promptReason: true })} disabled={working} className={cn(btn, 'text-destructive')}>Reject</button>
          </>
        ) : <span className="text-xs text-muted-foreground">Awaiting review</span>
      case 'APPROVED':
        return canApprove ? <button onClick={() => openConvert(r)} disabled={working} className={btn}>Convert to purchase</button> : null
      case 'REJECTED':
        return canCreate ? <button onClick={() => void changeStatus(r, 'DRAFT')} disabled={working} className={btn}>Reopen</button> : null
      default:
        return null
    }
  }

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Inventory</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Purchase Requisitions</h1>
          <p className="mt-2 text-sm text-muted-foreground">Request items to be bought — product and quantity only. Whoever can approve sets the cost, then converts it to a purchase order.</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <LuPlus /> New requisition
          </Button>
        )}
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['Total', summary.total, <LuClipboardList key="i" />],
          ['Awaiting review', summary.awaitingReview, <LuHourglass key="i" />],
          ['Approved', summary.byStatus.APPROVED, <LuCircleCheck key="i" />],
          ['Converted', summary.byStatus.CONVERTED, <LuRepeat key="i" />],
        ] as const).map(([label, value, icon], i) => (
          <StatCard key={label} index={i} label={label} value={value} icon={icon} />
        ))}
      </section>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
      {notice && <div className="mt-5 flex items-center gap-2 rounded-sm border border-success/25 bg-success/10 p-3 text-sm text-success"><LuCircleCheck />{notice}</div>}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PR number or purpose…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | Status)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_META) as Status[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading requisitions…</div>
        ) : rows.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No requisitions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Requisition</th>
                  <th className="px-5 py-3">Purpose</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Est. total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <button onClick={() => openDetail(r)} className="font-semibold text-secondary hover:underline">{r.requisitionNo}</button>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.requisitionDate).toLocaleDateString()}
                        {r.purchase && <> · {r.purchase.purchaseNo}</>}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{r.purpose ?? '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground">{r.items.length}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">{formatCost(r.estimatedTotal)}</td>
                    <td className="px-5 py-4"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_META[r.status].className)}>{STATUS_META[r.status].label}</span></td>
                    <td className="px-5 py-4"><div className="flex items-center justify-end gap-1">
                      <button onClick={() => setPrinting(r)} title="Print / PDF" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuPrinter /></button>
                      {rowActions(r)}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={saveRequisition} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-secondary">{editing ? 'Edit requisition' : 'New requisition'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.requisitionNo : 'Raise a purchase requisition'}</h2>
            </div>

            <FieldGroup title="Details">
              <Field label="Purpose"><input placeholder="e.g. Restock dry store for October" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="input" /></Field>
              <Field label="Suggested Supplier">
                <button
                  type="button"
                  onClick={() => setSupplierPickerFor('suggested')}
                  className="flex min-h-12 w-full items-center justify-between rounded-sm border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {suggestedSupplier ? (
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{suggestedSupplier.name}</span>
                      {(suggestedSupplier.phone || suggestedSupplier.contactPerson) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{suggestedSupplier.phone ?? suggestedSupplier.contactPerson}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No preference</span>
                  )}
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-secondary">{suggestedSupplier ? 'Change' : 'Select'}</span>
                </button>
                {suggestedSupplier && (
                  <button type="button" onClick={() => setForm({ ...form, suggestedSupplierId: '' })} className="mt-1 text-xs font-semibold text-muted-foreground hover:text-destructive">
                    Clear preference
                  </button>
                )}
              </Field>
              <Field label="Requisition Date"><input type="date" value={form.requisitionDate} onChange={(e) => setForm({ ...form, requisitionDate: e.target.value })} className="input" /></Field>
              <Field label="Needed By"><input type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</p>

              <div className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search products to add…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                {productQuery.trim() && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border bg-card shadow-lg">
                    {productMatches.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No matching products.</p>
                    ) : productMatches.map((p) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{p.packSize ? p.packLabel ?? p.unit : p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.items.length === 0 ? (
                <p className="mt-3 rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">No items yet — search above to add products.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-[1fr_16rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
                    <span>Product</span><span>Qty</span><span />
                  </div>
                  {form.items.map((row, index) => {
                    const product = productById(row.productId)
                    return (
                      <div key={row.productId} className="grid grid-cols-[1fr_16rem_2rem] items-start gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{product?.name ?? 'Unknown product'}</p>
                          {product?.unit && (
                            <p className="text-xs text-muted-foreground">
                              {product.packSize ? `request by ${product.packLabel || 'pack'}; stock in ${product.packUnit?.name ?? product.unit}` : `per ${product.unit}`}
                            </p>
                          )}
                        </div>
                        <PackQtyInput
                          value={row.quantity}
                          onChange={(value) => setRow(index, { quantity: value })}
                          packSize={Number(product?.packSize) || 0}
                          packLabel={product?.packLabel ?? ''}
                          unitName={product?.packUnit?.name ?? product?.unit ?? ''}
                          className="input"
                        />
                        <button type="button" onClick={() => removeRow(index)} title="Remove" className="rounded-sm p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuX className="size-4" /></button>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">No cost here — whoever reviews this sets the estimated cost per item before approving.</p>
            </div>

            <FieldGroup title="Notes">
              <Field label="Notes" className="sm:col-span-2"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" /></Field>
            </FieldGroup>

            {formError && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{formError}</div>}

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create requisition'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-secondary">Requisition</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{detail.requisitionNo}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Raised {new Date(detail.requisitionDate).toLocaleDateString()}
                  {detail.createdByEmployee && <> by {detail.createdByEmployee.firstName} {detail.createdByEmployee.lastName}</>}
                  {detail.neededBy && <> · needed by {new Date(detail.neededBy).toLocaleDateString()}</>}
                </p>
              </div>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_META[detail.status].className)}>{STATUS_META[detail.status].label}</span>
            </div>

            {detail.purpose && <p className="mt-4 text-sm">{detail.purpose}</p>}

            {(() => {
              const reviewing = detail.status === 'SUBMITTED' && canApprove
              return (
                <>
                  <div className="mt-5 overflow-hidden rounded-sm border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2">Product</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Est. unit cost</th>
                          <th className="px-4 py-2 text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((i) => (
                          <tr key={i.id} className="border-t">
                            <td className="px-4 py-2">{i.product.name}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{stockQty(Number(i.quantity), i.product)}</td>
                            {reviewing ? (
                              <td className="px-4 py-2 text-right">
                                <input
                                  type="number" min="0" step="0.01" placeholder="0.00"
                                  value={reviewCosts[i.id] ?? ''}
                                  onChange={(e) => setReviewCosts((c) => ({ ...c, [i.id]: e.target.value }))}
                                  className="input h-8 w-24 text-right text-sm"
                                />
                              </td>
                            ) : (
                              <td className="px-4 py-2 text-right tabular-nums">{formatCost(i.estimatedUnitCost)}</td>
                            )}
                            <td className="px-4 py-2 text-right tabular-nums">
                              {reviewing ? formatKes(costUnits(Number(i.quantity), Number(i.product.packSize) || 0) * (Number(reviewCosts[i.id]) || 0)) : formatCost(i.lineTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex justify-between text-sm font-semibold">
                    <span>Estimated total</span>
                    <span className="tabular-nums">{reviewing ? formatKes(reviewTotal) : formatCost(detail.estimatedTotal)}</span>
                  </div>
                </>
              )
            })()}

            {detail.suggestedSupplier && <p className="mt-3 text-xs text-muted-foreground">Suggested supplier: {detail.suggestedSupplier.name}</p>}
            {detail.reviewedByEmployee && (
              <p className={cn('mt-3 rounded-sm p-3 text-sm', detail.status === 'REJECTED' ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 text-muted-foreground')}>
                {detail.status === 'REJECTED' ? 'Rejected' : 'Approved'} by {detail.reviewedByEmployee.firstName} {detail.reviewedByEmployee.lastName}
                {detail.reviewedAt && <> on {new Date(detail.reviewedAt).toLocaleDateString()}</>}
                {detail.reviewNote && <> — “{detail.reviewNote}”</>}
              </p>
            )}
            {detail.purchase && <p className="mt-3 text-sm text-success">Converted to purchase {detail.purchase.purchaseNo} ({detail.purchase.status.toLowerCase()}).</p>}
            {detail.notes && <p className="mt-3 rounded-sm bg-muted/50 p-3 text-sm text-muted-foreground">{detail.notes}</p>}

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-5">
              <button onClick={() => setPrinting(detail)} className="mr-auto inline-flex items-center gap-1.5 rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><LuPrinter className="size-4" /> Print</button>
              <button onClick={() => setDetail(null)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Close</button>
              {detail.status === 'DRAFT' && canCreate && (
                <>
                  <button onClick={() => { const d = detail; setDetail(null); openEdit(d) }} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Edit</button>
                  <button onClick={() => void changeStatus(detail, 'SUBMITTED')} disabled={working} className="rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">Submit</button>
                </>
              )}
              {detail.status === 'SUBMITTED' && canApprove && (
                <>
                  <button onClick={() => void changeStatus(detail, 'REJECTED', { promptReason: true })} disabled={working} className="rounded-sm border px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60">Reject</button>
                  <button onClick={() => void approveWithCosts(detail)} disabled={working} className="rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">Approve</button>
                </>
              )}
              {detail.status === 'APPROVED' && canApprove && (
                <button onClick={() => openConvert(detail)} disabled={working} className="rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">Convert to purchase</button>
              )}
              {detail.status === 'REJECTED' && canCreate && (
                <button onClick={() => void changeStatus(detail, 'DRAFT')} disabled={working} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60">Reopen</button>
              )}
            </div>
          </div>
        </div>
      )}

      {converting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <form onSubmit={submitConvert} className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-secondary">Convert to purchase</p>
            <h2 className="mt-1 font-display text-xl font-semibold">{converting.requisitionNo}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Creates a draft purchase order with these items. Estimated costs become the starting unit costs.</p>
            <div className="mt-5 space-y-4">
              <Field label="Supplier" required>
                <button
                  type="button"
                  onClick={() => setSupplierPickerFor('convert')}
                  className="flex min-h-12 w-full items-center justify-between rounded-sm border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {convertSupplier ? (
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{convertSupplier.name}</span>
                      {(convertSupplier.phone || convertSupplier.contactPerson) && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{convertSupplier.phone ?? convertSupplier.contactPerson}</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Select supplier</span>
                  )}
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-secondary">{convertSupplier ? 'Change' : 'Select'}</span>
                </button>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tax Rate (%)"><input type="number" min="0" max="100" step="0.01" value={convertForm.taxRate} onChange={(e) => setConvertForm({ ...convertForm, taxRate: e.target.value })} className="input" /></Field>
                <Field label="Expected Date"><input type="date" value={convertForm.expectedDate} onChange={(e) => setConvertForm({ ...convertForm, expectedDate: e.target.value })} className="input" /></Field>
              </div>
              <Field label="Reference"><input value={convertForm.reference} onChange={(e) => setConvertForm({ ...convertForm, reference: e.target.value })} className="input" /></Field>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setConverting(null)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button disabled={working || !convertForm.supplierId} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {working && <LuLoaderCircle className="animate-spin" />}
                Create purchase
              </button>
            </div>
          </form>
        </div>
      )}

      {supplierPickerFor && (
        <SupplierPickerModal
          suppliers={suppliers}
          title="Choose Local Supplier"
          onClose={() => setSupplierPickerFor(null)}
          onCreated={rememberSupplier}
          onSelect={(supplier) => {
            rememberSupplier(supplier)
            if (supplierPickerFor === 'suggested') {
              setForm((current) => ({ ...current, suggestedSupplierId: supplier.id }))
            } else {
              setConvertForm((current) => ({ ...current, supplierId: supplier.id }))
            }
          }}
        />
      )}

      {printing && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-800/95 text-white"><LuLoaderCircle className="size-6 animate-spin" /></div>}>
          <DocumentViewer kind="requisition" data={printing} profile={profile} onClose={() => setPrinting(null)} />
        </Suspense>
      )}
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('text-sm font-medium', className)}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
