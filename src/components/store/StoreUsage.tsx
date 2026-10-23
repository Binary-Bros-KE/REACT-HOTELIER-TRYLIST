import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { LuChartBar, LuCircleAlert, LuDownload, LuEye, LuLoaderCircle, LuPencil, LuPlus, LuSearch, LuTags, LuTrash2, LuWarehouse } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import PackQtyInput, { packAndUnit } from '@/components/ui/PackQtyInput'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportDocData } from '@/components/documents/pdf'
import { downloadCsvRows } from '@/lib/csv'
import { cn } from '@/lib/utils'

// Store usage: stock handed out of the store and used up there and then (staff
// meals, a conference, a complimentary event), grouped by usage categories so the
// month-end shows how much went where. Server: /store-usage.

type Location = { id: string; name: string; type: string | null }
type Category = { id: string; name: string; description: string | null; isActive: boolean; _count?: { usages: number } }
type UsageProduct = { id: string; unit: string; packSize: string | null; packLabel: string | null; packUnit: { name: string } | null }
type UsageItem = { id: string; productId: string; productName: string; quantity: string | number; unitCost: string | number | null; value: string | number; product: UsageProduct }
type Usage = {
  id: string
  usageNo: string
  category: { id: string; name: string }
  fromLocation: { id: string; name: string }
  usedAtLocation: { id: string; name: string } | null
  title: string | null
  note: string | null
  usedAt: string
  totalValue: string | number
  status: 'ACTIVE' | 'VOIDED'
  voidReason: string | null
  items: UsageItem[]
}
type Product = { id: string; name: string; unit: string; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null; stockByLocation: { locationId: string; quantity: string }[] }
type Report = {
  totals: { count: number; value: number }
  byCategory: { key: string; name: string; count: number; value: number }[]
  byLocation: { key: string; name: string; count: number; value: number }[]
  byProduct: { key: string; category: string; product: string; quantity: number; value: number; unit: string; packSize: number; packLabel: string }[]
  usages: Usage[]
}

const money = (v: string | number) => `KSh ${Number(v).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const day = (v: string) => new Date(v).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const itemQty = (item: UsageItem) => packAndUnit(Number(item.quantity), Number(item.product.packSize) || 0, item.product.packLabel ?? '', item.product.packUnit?.name ?? item.product.unit)

/** The Usage view of the Store page: the list of usages, with categories and the report. */
export function StoreUsagePanel({ refreshKey, search, locationFilter }: { refreshKey: number; search: string; locationFilter: string }) {
  const toast = useToast()
  const [usages, setUsages] = useState<Usage[]>([])
  const [summary, setSummary] = useState({ count: 0, value: 0 })
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<Usage | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const loadCategories = useCallback(() => api<{ categories: Category[] }>('/store-usage/categories').then((r) => setCategories(r.categories)).catch(() => {}), [])
  useEffect(() => { void loadCategories() }, [loadCategories])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (search.trim()) q.set('search', search.trim())
      if (locationFilter) q.set('locationId', locationFilter)
      if (categoryFilter) q.set('categoryId', categoryFilter)
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      const r = await api<{ usages: Usage[]; summary: { count: number; value: number } }>(`/store-usage${q.size ? `?${q}` : ''}`)
      setUsages(r.usages)
      setSummary(r.summary)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load store usage')
    } finally {
      setLoading(false)
    }
  }, [search, locationFilter, categoryFilter, from, to, toast])
  useEffect(() => { const t = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(t) }, [load, refreshKey])

  async function voidUsage(usage: Usage) {
    const reason = window.prompt(`Void ${usage.usageNo}? The stock goes back into ${usage.fromLocation.name}. Enter the reason.`)
    if (!reason?.trim()) return
    try {
      await api(`/store-usage/${usage.id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
      toast.success(`${usage.usageNo} voided - stock returned to ${usage.fromLocation.name}.`)
      setDetail(null)
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not void this usage')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 p-3">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input w-auto">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? '' : ' (off)'}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input w-auto" title="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input w-auto" title="To" />
        <span className="text-sm text-muted-foreground">{summary.count} usage{summary.count === 1 ? '' : 's'} · <b className="text-foreground">{money(summary.value)}</b></span>
        <div className="ml-auto flex gap-2">
          <ActionButton tone="neutral" icon={<LuTags />} onClick={() => setShowCategories(true)}>Categories</ActionButton>
          <ActionButton tone="neutral" icon={<LuChartBar />} onClick={() => setShowReport(true)}>Usage report</ActionButton>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading store usage…</div>
      ) : usages.length === 0 ? (
        <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No store usage recorded{categoryFilter || from || to ? ' for these filters' : ' yet'}. Use “Record usage” for stock used up straight from the store - staff meals, conferences, complimentary.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
              <tr>
                <th className="px-5 py-3">Usage</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">From → used at</th>
                <th className="px-5 py-3">Items</th>
                <th className="px-5 py-3 text-right">Value</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usages.map((u) => (
                <tr key={u.id} className={cn('border-t', u.status === 'VOIDED' && 'text-muted-foreground')}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold">{u.usageNo}{u.status === 'VOIDED' && <span className="ml-2 text-[10px] font-bold uppercase text-destructive">Voided</span>}</p>
                    <p className="text-xs text-muted-foreground">{day(u.usedAt)}{u.title ? ` · ${u.title}` : ''}</p>
                  </td>
                  <td className="px-5 py-3.5">{u.category.name}</td>
                  <td className="px-5 py-3.5">{u.fromLocation.name}{u.usedAtLocation ? ` → ${u.usedAtLocation.name}` : ''}</td>
                  <td className="px-5 py-3.5">{u.items.length} item{u.items.length === 1 ? '' : 's'}</td>
                  <td className={cn('px-5 py-3.5 text-right font-semibold tabular-nums', u.status === 'VOIDED' && 'line-through')}>{money(u.totalValue)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setDetail(u)} title="View" className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><LuEye /></button>
                      {u.status === 'ACTIVE' && <button onClick={() => void voidUsage(u)} title="Void (returns the stock)" className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <ModalShell size="md" kicker={detail.category.name} title={detail.usageNo} subtitle={`${day(detail.usedAt)} · ${detail.fromLocation.name}${detail.usedAtLocation ? ` → ${detail.usedAtLocation.name}` : ''}`} onClose={() => setDetail(null)}
          footer={detail.status === 'ACTIVE' ? <button type="button" onClick={() => void voidUsage(detail)} className="border-2 border-destructive/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10">Void usage</button> : undefined}>
          <div className="space-y-3 p-5 text-sm">
            {detail.title && <p className="font-semibold">{detail.title}</p>}
            {detail.note && <p className="text-muted-foreground">{detail.note}</p>}
            {detail.status === 'VOIDED' && <p className="border border-destructive/30 bg-destructive/5 p-2 text-destructive">Voided{detail.voidReason ? `: ${detail.voidReason}` : ''}. The stock went back into {detail.fromLocation.name}.</p>}
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="py-1.5">Product</th><th className="py-1.5 text-right">Quantity</th><th className="py-1.5 text-right">Value</th></tr></thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id} className="border-t"><td className="py-1.5">{item.productName}</td><td className="py-1.5 text-right">{itemQty(item)}</td><td className="py-1.5 text-right tabular-nums">{money(item.value)}</td></tr>
                ))}
                <tr className="border-t font-semibold"><td className="py-1.5">Total</td><td /><td className="py-1.5 text-right tabular-nums">{money(detail.totalValue)}</td></tr>
              </tbody>
            </table>
          </div>
        </ModalShell>
      )}
      {showCategories && <UsageCategoriesModal categories={categories} onChanged={() => void loadCategories()} onClose={() => setShowCategories(false)} />}
      {showReport && <UsageReportModal categories={categories} onClose={() => setShowReport(false)} />}
    </>
  )
}

/** Record stock taken out of the store and used up (not added to another location's stock). */
export function RecordUsageModal({ locations, onClose, onRecorded }: { locations: Location[]; onClose: () => void; onRecorded: (usage: Usage) => void }) {
  const toast = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    categoryId: '', fromLocationId: locations.find((l) => l.type === 'STORE')?.id ?? '', usedAtLocationId: '', title: '', note: '', usedAt: isoDay(new Date()),
  })
  const [lines, setLines] = useState<Record<string, string>>({})
  const set = (patch: Partial<typeof form>) => setForm((cur) => ({ ...cur, ...patch }))

  const loadCategories = useCallback(() => api<{ categories: Category[] }>('/store-usage/categories').then((r) => setCategories(r.categories)).catch(() => {}), [])
  useEffect(() => {
    void loadCategories()
    api<{ products: Product[] }>('/products?active=true').then((r) => setProducts(r.products)).catch(() => {}).finally(() => setLoading(false))
  }, [loadCategories])

  const onHand = useCallback((p: Product) => Number(p.stockByLocation?.find((s) => s.locationId === form.fromLocationId)?.quantity ?? 0), [form.fromLocationId])
  const visible = useMemo(
    () => products.filter((p) => onHand(p) > 0 && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))),
    [products, onHand, search],
  )
  const staged = products.filter((p) => Number(lines[p.id]) > 0)
  const activeCategories = categories.filter((c) => c.isActive)
  const canSave = Boolean(form.categoryId && form.fromLocationId && staged.length > 0 && !saving)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      const { usage } = await api<{ usage: Usage }>('/store-usage', {
        method: 'POST',
        body: JSON.stringify({ ...form, usedAt: form.usedAt || undefined, lines: staged.map((p) => ({ productId: p.id, quantity: Number(lines[p.id]) })) }),
      })
      toast.success(`${usage.usageNo} recorded - ${money(usage.totalValue)} used for ${usage.category.name}.`)
      onRecorded(usage)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the usage')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell size="xl" kicker="Store" title="Record usage" subtitle="Stock taken out of the store and used up - it isn't added to any other location's stock." onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <button form="store-usage-form" disabled={!canSave} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Record {staged.length > 0 ? `${staged.length} item${staged.length === 1 ? '' : 's'}` : ''}
          </button>
        </>
      }>
      <form id="store-usage-form" onSubmit={submit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Used for" required>
            <div className="flex gap-2">
              <select required className="input" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">{activeCategories.length ? 'Choose a category' : 'No categories yet - add one'}</option>
                {activeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowCategories(true)} title="Manage usage categories" className="shrink-0 border px-2.5 text-xs font-semibold hover:bg-muted"><LuTags /></button>
            </div>
          </Field>
          <Field label="From (store)" required>
            <select required className="input" value={form.fromLocationId} onChange={(e) => { set({ fromLocationId: e.target.value }); setLines({}) }}>
              <option value="">Choose the store</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === 'STORE' ? ' (store)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Used at">
            <select className="input" value={form.usedAtLocationId} onChange={(e) => set({ usedAtLocationId: e.target.value })}>
              <option value="">Not set</option>
              {locations.filter((l) => l.id !== form.fromLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Title" className="sm:col-span-2"><input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Staff lunch, ABC Ltd conference" /></Field>
          <Field label="Date used"><input type="date" className="input" value={form.usedAt} onChange={(e) => set({ usedAt: e.target.value })} /></Field>
          <Field label="Note" className="sm:col-span-3"><input className="input" value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" /></Field>
        </div>

        {form.fromLocationId ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <section>
              <label className="relative block">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products in this store…" className="input pl-9" />
              </label>
              <div className="mt-2 max-h-72 overflow-y-auto border">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
                ) : visible.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground"><LuWarehouse className="mx-auto mb-2 size-6" />No products with stock here.</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">In store</th><th className="px-3 py-2">Use</th></tr></thead>
                    <tbody>
                      {visible.map((p) => {
                        const max = onHand(p)
                        const unit = p.packUnit?.name ?? p.unit
                        return (
                          <tr key={p.id} className="border-t">
                            <td className="px-3 py-2 font-medium">{p.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{packAndUnit(max, Number(p.packSize) || 0, p.packLabel ?? '', unit)}</td>
                            <td className="px-3 py-2">
                              <PackQtyInput value={lines[p.id] ?? ''} onChange={(v) => setLines((cur) => ({ ...cur, [p.id]: v }))} packSize={Number(p.packSize) || 0} packLabel={p.packLabel ?? ''} unitName={unit} max={max} className="input w-24 py-1.5" />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
            <aside className="border bg-muted/20 p-3 text-sm">
              <p className="font-semibold">Taking out of {locations.find((l) => l.id === form.fromLocationId)?.name}</p>
              <div className="mt-2 space-y-1.5">
                {staged.length === 0 ? <p className="text-muted-foreground">Enter a quantity next to a product.</p> : staged.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 bg-card px-2.5 py-1.5 shadow-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="flex items-center gap-2 font-semibold">
                      {packAndUnit(Number(lines[p.id]), Number(p.packSize) || 0, p.packLabel ?? '', p.packUnit?.name ?? p.unit)}
                      <button type="button" onClick={() => setLines((cur) => ({ ...cur, [p.id]: '' }))} className="text-muted-foreground hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">Choose the store it comes from to pick products.</p>}
      </form>
      {showCategories && <UsageCategoriesModal categories={categories} onChanged={() => void loadCategories()} onClose={() => setShowCategories(false)} />}
    </ModalShell>
  )
}

/** Add, rename, switch off or delete usage categories. A used category can only be switched off. */
function UsageCategoriesModal({ categories, onChanged, onClose }: { categories: Category[]; onChanged: () => void; onClose: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(fn: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      onChanged()
      return true
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!draft.name.trim()) return
    if (await call(() => api('/store-usage/categories', { method: 'POST', body: JSON.stringify(draft) }), `“${draft.name.trim()}” added.`)) setDraft({ name: '', description: '' })
  }

  return (
    <ModalShell size="md" stacked="top" kicker="Store usage" title="Usage categories" subtitle="What store usage is grouped by at month-end." onClose={onClose}>
      <div className="space-y-4 p-5 text-sm">
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Staff meals" />
          <input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description (optional)" />
          <button disabled={busy || !draft.name.trim()} className="inline-flex items-center justify-center gap-1.5 bg-primary px-3 py-2 text-xs font-bold uppercase text-primary-foreground disabled:opacity-60"><LuPlus /> Add</button>
        </form>
        <div className="divide-y border">
          {categories.length === 0 && <p className="p-4 text-center text-muted-foreground">No categories yet.</p>}
          {categories.map((c) => editing?.id === c.id ? (
            <div key={c.id} className="grid gap-2 p-2.5 sm:grid-cols-[1fr_1fr_auto]">
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              <input className="input" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Description" />
              <div className="flex gap-1">
                <button type="button" disabled={busy || !editing.name.trim()} onClick={() => void call(() => api(`/store-usage/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name: editing.name, description: editing.description }) }), 'Category saved.').then((ok) => ok && setEditing(null))} className="bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60">Save</button>
                <button type="button" onClick={() => setEditing(null)} className="border px-3 py-2 text-xs font-semibold">Cancel</button>
              </div>
            </div>
          ) : (
            <div key={c.id} className={cn('flex items-center gap-2 p-2.5', !c.isActive && 'text-muted-foreground')}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}{!c.isActive && <span className="ml-2 text-[10px] font-bold uppercase">Off</span>}</p>
                {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
              </div>
              <span className="text-xs text-muted-foreground">{c._count?.usages ?? 0} used</span>
              <button type="button" disabled={busy} onClick={() => setEditing({ id: c.id, name: c.name, description: c.description ?? '' })} title="Rename" className="p-2 hover:bg-muted"><LuPencil /></button>
              <button type="button" disabled={busy} onClick={() => void call(() => api(`/store-usage/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !c.isActive }) }), c.isActive ? `“${c.name}” switched off.` : `“${c.name}” switched on.`)} className="border px-2.5 py-1 text-xs font-semibold hover:bg-muted">{c.isActive ? 'Switch off' : 'Switch on'}</button>
              {(c._count?.usages ?? 0) === 0 && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete “${c.name}”?`)) void call(() => api(`/store-usage/categories/${c.id}`, { method: 'DELETE' }), `“${c.name}” deleted.`) }} title="Delete" className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>}
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  )
}

/** Month-end: value used by category, by product, by location used, and every usage. Printable and exportable. */
function UsageReportModal({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const toast = useToast()
  const now = new Date()
  const [from, setFrom] = useState(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(isoDay(now))
  const [categoryId, setCategoryId] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const q = new URLSearchParams({ from, to })
    if (categoryId) q.set('categoryId', categoryId)
    api<Report>(`/store-usage/report?${q}`).then(setReport).catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load the report')).finally(() => setLoading(false))
  }, [from, to, categoryId, toast])

  const rangeLabel = `${day(from)} - ${day(to)}${categoryId ? ` · ${categories.find((c) => c.id === categoryId)?.name ?? ''}` : ''}`
  const productQty = (p: Report['byProduct'][number]) => packAndUnit(p.quantity, p.packSize, p.packLabel, p.unit)
  const usageItems = (u: Usage) => u.items.map((i) => `${i.productName} ${itemQty(i)}`).join(', ')

  function doc(r: Report): ReportDocData {
    return {
      reportTitle: 'Store Usage Report',
      kicker: 'Store',
      rangeLabel,
      generatedAt: new Date().toISOString(),
      cards: [
        { label: 'Value used', value: money(r.totals.value) },
        { label: 'Usages', value: String(r.totals.count) },
        ...r.byCategory.slice(0, 3).map((c) => ({ label: c.name, value: money(c.value) })),
      ],
      sections: [
        { title: 'By category', compact: true, columns: [{ label: 'Category', flex: 2 }, { label: 'Usages', align: 'right' }, { label: 'Value', align: 'right' }], rows: r.byCategory.map((c) => [c.name, c.count, money(c.value)]) },
        { title: 'By product', compact: true, columns: [{ label: 'Category', flex: 1.4 }, { label: 'Product', flex: 2 }, { label: 'Quantity', align: 'right' }, { label: 'Value', align: 'right' }], rows: r.byProduct.map((p) => [p.category, p.product, productQty(p), money(p.value)]) },
        { title: 'By location used', compact: true, columns: [{ label: 'Location', flex: 2 }, { label: 'Usages', align: 'right' }, { label: 'Value', align: 'right' }], rows: r.byLocation.map((l) => [l.name, l.count, money(l.value)]) },
        { title: 'Every usage', compact: true, columns: [{ label: 'Usage', flex: 1.1 }, { label: 'Date' }, { label: 'Category', flex: 1.2 }, { label: 'Items', flex: 3 }, { label: 'Value', align: 'right' }], rows: r.usages.map((u) => [`${u.usageNo}${u.title ? ` · ${u.title}` : ''}`, day(u.usedAt), u.category.name, usageItems(u), money(u.totalValue)]) },
      ],
    }
  }

  function exportCsv(r: Report) {
    const rows: (string | number)[][] = [['Section', 'Name', 'Detail', 'Usages / quantity', 'Value (KSh)']]
    for (const c of r.byCategory) rows.push(['By category', c.name, '', c.count, c.value])
    for (const p of r.byProduct) rows.push(['By product', p.product, p.category, productQty(p), p.value])
    for (const l of r.byLocation) rows.push(['By location used', l.name, '', l.count, l.value])
    for (const u of r.usages) rows.push(['Every usage', `${u.usageNo} ${day(u.usedAt)}${u.title ? ` - ${u.title}` : ''}`, `${u.category.name}: ${usageItems(u)}`, u.items.length, Number(u.totalValue)])
    downloadCsvRows('store-usage-report', rows)
  }

  return (
    <ModalShell size="xl" kicker="Store" title="Store usage report" subtitle={rangeLabel} onClose={onClose}
      footer={<>
        <ActionButton tone="neutral" icon={<LuDownload />} disabled={!report || loading} onClick={() => report && exportCsv(report)}>Export Excel</ActionButton>
        <PrintReportButton data={report ? doc(report) : null} disabled={loading} />
      </>}>
      <div className="space-y-5 p-5 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Category">
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {report && <p className="ml-auto text-base">Total used: <b>{money(report.totals.value)}</b> in {report.totals.count} usage{report.totals.count === 1 ? '' : 's'}</p>}
        </div>
        {loading || !report ? <div className="p-10 text-center text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div> : report.totals.count === 0 ? (
          <p className="flex items-center justify-center gap-2 border border-dashed p-10 text-muted-foreground"><LuCircleAlert /> No store usage in this period.</p>
        ) : (
          <>
            <ReportTable title="By category" head={['Category', 'Usages', 'Value']} rows={report.byCategory.map((c) => [c.name, c.count, money(c.value)])} />
            <ReportTable title="By product" head={['Category', 'Product', 'Quantity', 'Value']} rows={report.byProduct.map((p) => [p.category, p.product, productQty(p), money(p.value)])} />
            <ReportTable title="By location used" head={['Location', 'Usages', 'Value']} rows={report.byLocation.map((l) => [l.name, l.count, money(l.value)])} />
            <ReportTable title="Every usage" head={['Usage', 'Date', 'Category', 'Items', 'Value']} rows={report.usages.map((u) => [`${u.usageNo}${u.title ? ` · ${u.title}` : ''}`, day(u.usedAt), u.category.name, usageItems(u), money(u.totalValue)])} />
          </>
        )}
        <p className="text-xs text-muted-foreground">Values are at cost when the stock left the store. Voided usages are left out.</p>
      </div>
    </ModalShell>
  )
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <section className="border">
      <h3 className="border-b border-l-4 border-l-accent px-3 py-2 font-semibold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr>{head.map((h, i) => <th key={h} className={cn('px-3 py-2', i === head.length - 1 && 'text-right')}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((row, ri) => <tr key={ri} className="border-t">{row.map((cell, ci) => <td key={ci} className={cn('px-3 py-1.5', ci === row.length - 1 && 'text-right tabular-nums')}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}

function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block text-sm font-medium', className)}>
      <span className="mb-1.5 block">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  )
}
