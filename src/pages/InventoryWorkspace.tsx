import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { LuArrowRight, LuCircleAlert, LuEye, LuLoaderCircle, LuPackage, LuPackagePlus, LuPrinter, LuSearch, LuTrash2, LuTruck, LuWarehouse } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import Button from '@/components/ui/Button'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import type { DocProfile } from '@/components/documents/pdf'
import PackQtyInput, { packAndUnit } from '@/components/ui/PackQtyInput'

const DocumentViewer = lazy(() => import('@/components/documents/DocumentViewer'))

type Location = { id: string; name: string; type: string | null }
type Employee = { id: string; firstName: string; lastName: string }
type StockByLocation = { locationId: string; locationName: string; quantity: string }
type StockProduct = { id: string; name: string; unit: string; sku: string | null; packSize: string | null; packLabel: string | null; packUnit: { id: string; name: string } | null }
type Product = StockProduct & { stockByLocation: StockByLocation[] }
type TransferItem = {
  id: string
  quantity: string
  fromQtyBefore: string
  fromQtyAfter: string
  toQtyBefore: string
  toQtyAfter: string
  product: StockProduct
}
type StockTransfer = {
  id: string
  transferNo: string
  note: string | null
  createdAt: string
  fromLocation: { id: string; name: string }
  toLocation: { id: string; name: string }
  createdByEmployee: Employee | null
  items: TransferItem[]
}
type Summary = { total: number; lineItems: number; unitsTransferred: number }
type ReceiptItem = {
  id: string
  quantity: string
  qtyBefore: string
  qtyAfter: string
  product: StockProduct
}
type StockReceipt = {
  id: string
  receiptNo: string
  note: string | null
  createdAt: string
  location: { id: string; name: string }
  createdByEmployee: Employee | null
  items: ReceiptItem[]
}
type ReceiptSummary = { total: number; lineItems: number; unitsReceived: number }

function SetupMessage() {
  return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>
}

export default function InventoryWorkspace() {
  const toast = useToast()
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, lineItems: 0, unitsTransferred: 0 })
  const [receipts, setReceipts] = useState<StockReceipt[]>([])
  const [receiptSummary, setReceiptSummary] = useState<ReceiptSummary>({ total: 0, lineItems: 0, unitsReceived: 0 })
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [view, setView] = useState<'transfers' | 'receipts'>('transfers')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDistribute, setShowDistribute] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [detail, setDetail] = useState<StockTransfer | null>(null)
  const [receiptDetail, setReceiptDetail] = useState<StockReceipt | null>(null)
  const [profile, setProfile] = useState<DocProfile>(null)
  const [printing, setPrinting] = useState<StockTransfer | null>(null)
  const [printingReceipt, setPrintingReceipt] = useState<StockReceipt | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (locationFilter) query.set('locationId', locationFilter)
      const [transferResponse, receiptResponse] = await Promise.all([
        api<{ transfers: StockTransfer[]; summary: Summary }>(`/stock-transfers${query.size ? `?${query}` : ''}`),
        api<{ receipts: StockReceipt[]; summary: ReceiptSummary }>(`/stock-receipts${query.size ? `?${query}` : ''}`),
      ])
      setTransfers(transferResponse.transfers)
      setSummary(transferResponse.summary)
      setReceipts(receiptResponse.receipts)
      setReceiptSummary(receiptResponse.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load stock transfers'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, locationFilter, toast])

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t) }, [load])
  useEffect(() => {
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
    api<{ profile: DocProfile }>('/business-profile').then((r) => setProfile(r.profile)).catch(() => {})
  }, [])

  if (!hasApiTenant()) return <SetupMessage />

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Inventory</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold"><LuWarehouse className="text-secondary" /> Store</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Move stock between locations — every transfer is recorded as a printable receipt, with stock frozen at that exact moment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowReceive(true)}>
            <LuPackagePlus /> Receive goods
          </Button>
          <Button onClick={() => setShowDistribute(true)}>
            <LuTruck /> Distribute
          </Button>
        </div>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-3">
        <StatCard index={0} label="Goods receipts" value={receiptSummary.total} icon={<LuPackagePlus />} />
        <StatCard index={1} label="Line items received" value={receiptSummary.lineItems.toLocaleString()} icon={<LuPackage />} />
        <StatCard index={2} label="Transfers" value={summary.total} icon={<LuTruck />} />
      </section>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transfer #, destination or source…" className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div className="grid grid-cols-2 overflow-hidden rounded-sm border bg-background p-1 text-sm font-semibold">
            <button onClick={() => setView('transfers')} className={`rounded-sm px-3 py-1.5 ${view === 'transfers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Transfers</button>
            <button onClick={() => setView('receipts')} className={`rounded-sm px-3 py-1.5 ${view === 'receipts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>Goods received</button>
          </div>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading transfers…</div>
        ) : view === 'receipts' ? (
          receipts.length === 0 ? (
            <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No goods received records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Receipt</th>
                    <th className="px-5 py-3">Destination</th>
                    <th className="px-5 py-3">Items</th>
                    <th className="px-5 py-3">By</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                      <tr key={r.id} className="border-t transition hover:bg-muted/30">
                        <td className="px-5 py-4">
                          <button onClick={() => setReceiptDetail(r)} className="font-semibold text-secondary hover:underline">{r.receiptNo}</button>
                          <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                        </td>
                        <td className="px-5 py-4"><span className="rounded-sm border border-success/40 bg-success/5 px-2 py-0.5 text-xs font-medium text-success">{r.location.name}</span></td>
                        <td className="px-5 py-4 text-muted-foreground">{r.items.length} item{r.items.length === 1 ? '' : 's'}</td>
                        <td className="px-5 py-4 text-muted-foreground">{r.createdByEmployee ? `${r.createdByEmployee.firstName} ${r.createdByEmployee.lastName}` : '—'}</td>
                        <td className="px-5 py-4 text-right">
                          <button onClick={() => setReceiptDetail(r)} title="View" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuEye className="size-4" /></button>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : transfers.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No stock transfers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Transfer</th>
                  <th className="px-5 py-3">Route</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3">By</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                    <tr key={t.id} className="border-t transition hover:bg-muted/30">
                      <td className="px-5 py-4">
                        <button onClick={() => setDetail(t)} className="font-semibold text-secondary hover:underline">{t.transferNo}</button>
                        <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="rounded-sm border px-2 py-0.5 font-medium">{t.fromLocation.name}</span>
                          <LuArrowRight className="size-3 text-muted-foreground" />
                          <span className="rounded-sm border border-secondary/40 bg-secondary/5 px-2 py-0.5 font-medium text-secondary">{t.toLocation.name}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{t.items.length} item{t.items.length === 1 ? '' : 's'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{t.createdByEmployee ? `${t.createdByEmployee.firstName} ${t.createdByEmployee.lastName}` : '—'}</td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => setDetail(t)} title="View" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuEye className="size-4" /></button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showDistribute && (
        <DistributeModal
          locations={locations}
          onClose={() => setShowDistribute(false)}
          onRecorded={() => {
            setShowDistribute(false)
            toast.success('Stock distributed.')
            void load()
          }}
        />
      )}

      {showReceive && (
        <ReceiveGoodsModal
          locations={locations}
          onClose={() => setShowReceive(false)}
          onRecorded={(receipt) => {
            setShowReceive(false)
            setView('receipts')
            setReceiptDetail(receipt)
            toast.success('Goods received.')
            void load()
          }}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-secondary">Stock transfer</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{detail.transferNo}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Frozen at the moment of transfer — reflects exactly what was true then, even if stock has moved since.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-sm border px-2 py-0.5 font-medium">{detail.fromLocation.name}</span>
              <LuArrowRight className="size-3 text-muted-foreground" />
              <span className="rounded-sm border border-secondary/40 bg-secondary/5 px-2 py-0.5 font-medium text-secondary">{detail.toLocation.name}</span>
              <span className="text-muted-foreground">
                {detail.createdByEmployee ? `${detail.createdByEmployee.firstName} ${detail.createdByEmployee.lastName} · ` : ''}
                {new Date(detail.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-sm border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">{detail.fromLocation.name} before</th>
                    <th className="px-4 py-2 text-right">{detail.fromLocation.name} after</th>
                    <th className="px-4 py-2 text-right">{detail.toLocation.name} before</th>
                    <th className="px-4 py-2 text-right">{detail.toLocation.name} after</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((i) => {
                    const packSize = Number(i.product.packSize) || 0
                    const unitLabel = i.product.packUnit?.name ?? i.product.unit
                    const fmt = (v: string) => packAndUnit(Number(v), packSize, i.product.packLabel ?? '', unitLabel)
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="px-4 py-2">
                          <p className="font-medium">{i.product.name}</p>
                          {i.product.sku && <p className="text-xs text-muted-foreground">{i.product.sku}</p>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmt(i.quantity)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(i.fromQtyBefore)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(i.fromQtyAfter)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(i.toQtyBefore)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(i.toQtyAfter)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {detail.note && <p className="mt-4 rounded-sm bg-muted/50 p-3 text-sm text-muted-foreground">{detail.note}</p>}

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button onClick={() => setPrinting(detail)} className="inline-flex items-center gap-1.5 rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><LuPrinter className="size-4" /> Print</button>
              <button onClick={() => setDetail(null)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Close</button>
            </div>
          </div>
        </div>
      )}

      {receiptDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
            <p className="text-sm font-semibold text-secondary">Goods received</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">{receiptDetail.receiptNo}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Stock added into {receiptDetail.location.name} with balances frozen at the moment of receipt.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-sm border border-success/40 bg-success/5 px-2 py-0.5 font-medium text-success">{receiptDetail.location.name}</span>
              <span className="text-muted-foreground">
                {receiptDetail.createdByEmployee ? `${receiptDetail.createdByEmployee.firstName} ${receiptDetail.createdByEmployee.lastName} · ` : ''}
                {new Date(receiptDetail.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-sm border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2 text-right">Received</th>
                    <th className="px-4 py-2 text-right">Before</th>
                    <th className="px-4 py-2 text-right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptDetail.items.map((i) => {
                    const packSize = Number(i.product.packSize) || 0
                    const unitLabel = i.product.packUnit?.name ?? i.product.unit
                    const fmt = (v: string) => packAndUnit(Number(v), packSize, i.product.packLabel ?? '', unitLabel)
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="px-4 py-2">
                          <p className="font-medium">{i.product.name}</p>
                          {i.product.sku && <p className="text-xs text-muted-foreground">{i.product.sku}</p>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmt(i.quantity)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(i.qtyBefore)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(i.qtyAfter)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {receiptDetail.note && <p className="mt-4 rounded-sm bg-muted/50 p-3 text-sm text-muted-foreground">{receiptDetail.note}</p>}

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button onClick={() => setPrintingReceipt(receiptDetail)} className="inline-flex items-center gap-1.5 rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted"><LuPrinter className="size-4" /> Print</button>
              <button onClick={() => setReceiptDetail(null)} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Close</button>
            </div>
          </div>
        </div>
      )}

      {printing && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-800/95 text-white"><LuLoaderCircle className="size-6 animate-spin" /></div>}>
          <DocumentViewer kind="stock-transfer" data={printing} profile={profile} onClose={() => setPrinting(null)} />
        </Suspense>
      )}
      {printingReceipt && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-800/95 text-white"><LuLoaderCircle className="size-6 animate-spin" /></div>}>
          <DocumentViewer kind="stock-receipt" data={printingReceipt} profile={profile} onClose={() => setPrintingReceipt(null)} />
        </Suspense>
      )}
    </div>
  )
}

type BatchItem = { productId: string; name: string; unit: string; packSize: number; packLabel: string; quantity: string; maxAvailable: number }

function DistributeModal({ locations, onClose, onRecorded }: { locations: Location[]; onClose: () => void; onRecorded: () => void }) {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [fromLocationId, setFromLocationId] = useState(() => locations.find((l) => l.type === 'STORE')?.id ?? '')
  const [toLocationId, setToLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ products: Product[] }>('/products').then((r) => setProducts(r.products)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const availableAt = useMemo(() => {
    return (product: Product) => Number(product.stockByLocation.find((s) => s.locationId === fromLocationId)?.quantity ?? 0)
  }, [fromLocationId])

  const visibleProducts = products.filter((p) => availableAt(p) > 0 && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())))

  function setBatchQuantity(product: Product, quantity: string) {
    setBatch((current) => {
      const existing = current.find((b) => b.productId === product.id)
      if (!quantity || Number(quantity) <= 0) return current.filter((b) => b.productId !== product.id)
      const item: BatchItem = {
        productId: product.id,
        name: product.name,
        unit: product.packUnit?.name ?? product.unit,
        packSize: Number(product.packSize) || 0,
        packLabel: product.packLabel ?? '',
        quantity,
        maxAvailable: availableAt(product),
      }
      return existing ? current.map((b) => (b.productId === product.id ? item : b)) : [...current, item]
    })
  }

  function removeFromBatch(productId: string) {
    setBatch((current) => current.filter((b) => b.productId !== productId))
  }

  async function record() {
    if (!fromLocationId || !toLocationId || batch.length === 0) return
    setSaving(true)
    setError('')
    try {
      await api('/stock-transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromLocationId,
          toLocationId,
          items: batch.map((b) => ({ productId: b.productId, quantity: Number(b.quantity) })),
          note: note.trim() || undefined,
        }),
      })
      onRecorded()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record this transfer'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
        <p className="text-sm font-semibold text-secondary">New stock transfer</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Distribute stock</h2>
        <p className="mt-1 text-sm text-muted-foreground">Move several products from one location to another in one go — recorded as a single printable receipt.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            From
            <select className="input mt-1.5" value={fromLocationId} onChange={(e) => { setFromLocationId(e.target.value); setBatch([]) }}>
              <option value="">Select source location</option>
              {locations.map((l) => <option key={l.id} value={l.id} disabled={l.id === toLocationId}>{l.name}{l.type === 'STORE' ? ' (warehouse)' : ''}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            To
            <select className="input mt-1.5" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              <option value="">Select destination location</option>
              {locations.map((l) => <option key={l.id} value={l.id} disabled={l.id === fromLocationId}>{l.name}</option>)}
            </select>
          </label>
        </div>

        {fromLocationId && toLocationId ? (
          <div className="mt-5 grid gap-5">
            <section>
              <label className="relative block">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products at the source location…" className="w-full rounded-sm border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>

              <div className="mt-3 max-h-80 overflow-y-auto rounded-sm border">
                {loading ? (
                  <div className="p-10 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
                ) : visibleProducts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    <LuWarehouse className="mx-auto mb-2 size-6" />
                    No products with stock at this source location.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-primary text-xs uppercase text-primary-foreground">
                      <tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">On hand</th><th className="px-4 py-2.5">Send</th></tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => {
                        const max = availableAt(product)
                        const staged = batch.find((b) => b.productId === product.id)
                        const packSize = Number(product.packSize) || 0
                        const unitLabel = product.packUnit?.name ?? product.unit
                        return (
                          <tr key={product.id} className="border-t bg-card">
                            <td className="px-4 py-2.5 font-medium">{product.name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{packAndUnit(max, packSize, product.packLabel ?? '', unitLabel)}</td>
                            <td className="px-4 py-2.5">
                              <PackQtyInput
                                value={staged?.quantity ?? ''}
                                onChange={(v) => setBatchQuantity(product, v)}
                                packSize={packSize}
                                packLabel={product.packLabel ?? ''}
                                unitName={unitLabel}
                                max={max}
                                className="w-24 rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <label className="mt-3 block text-sm font-medium">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. weekly restock" className="input mt-1.5" />
              </label>
            </section>

            <aside className="rounded-sm border bg-muted/20 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {locations.find((l) => l.id === fromLocationId)?.name} <LuArrowRight className="size-3.5 text-muted-foreground" /> {locations.find((l) => l.id === toLocationId)?.name}
              </p>
              <div className="mt-3 space-y-2">
                {batch.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items staged yet — enter a quantity next to a product.</p>
                ) : batch.map((item) => (
                  <div key={item.productId} className="flex items-center justify-between rounded-sm bg-card px-3 py-2 text-sm shadow-sm">
                    <span className="truncate">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{packAndUnit(Number(item.quantity), item.packSize, item.packLabel, item.unit)}</span>
                      <button onClick={() => removeFromBatch(item.productId)} className="text-muted-foreground hover:text-destructive"><LuTrash2 className="size-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <div className="mt-5 flex min-h-40 flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-10 text-center">
            <LuWarehouse className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Choose a source and destination location to pick products.</p>
          </div>
        )}

        {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="mt-6 flex justify-end gap-2 border-t pt-5">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button
            disabled={batch.length === 0 || saving}
            onClick={() => void record()}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="animate-spin" />} Record {batch.length > 0 ? `${batch.length} item${batch.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiveGoodsModal({ locations, onClose, onRecorded }: { locations: Location[]; onClose: () => void; onRecorded: (receipt: StockReceipt) => void }) {
  const toast = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [locationId, setLocationId] = useState(() => locations.find((l) => l.type === 'STORE')?.id ?? locations[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ products: Product[] }>('/products').then((r) => setProducts(r.products)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const currentAt = useCallback((product: Product) => Number(product.stockByLocation.find((s) => s.locationId === locationId)?.quantity ?? 0), [locationId])
  const visibleProducts = products.filter((p) => !search.trim() || [p.name, p.sku ?? '', p.unit].join(' ').toLowerCase().includes(search.trim().toLowerCase()))

  function addProduct(product: Product) {
    setBatch((current) => {
      if (current.some((b) => b.productId === product.id)) return current
      return [...current, {
        productId: product.id,
        name: product.name,
        unit: product.packUnit?.name ?? product.unit,
        packSize: Number(product.packSize) || 0,
        packLabel: product.packLabel ?? '',
        quantity: '',
        maxAvailable: 0,
      }]
    })
  }

  function setBatchQuantity(productId: string, quantity: string) {
    setBatch((current) => current.map((item) => item.productId === productId ? { ...item, quantity } : item))
  }

  function removeFromBatch(productId: string) {
    setBatch((current) => current.filter((b) => b.productId !== productId))
  }

  async function record() {
    const items = batch.filter((b) => Number(b.quantity) > 0)
    if (!locationId || items.length === 0) return
    setSaving(true)
    setError('')
    try {
      const response = await api<{ receipt: StockReceipt }>('/stock-receipts', {
        method: 'POST',
        body: JSON.stringify({
          locationId,
          items: items.map((b) => ({ productId: b.productId, quantity: Number(b.quantity) })),
          note: note.trim() || undefined,
        }),
      })
      onRecorded(response.receipt)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record goods received'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
        <p className="text-sm font-semibold text-secondary">New goods received</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Receive stock</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add several products into one destination and keep a printable receipt of the batch.</p>

        <label className="mt-5 block text-sm font-medium">
          Destination
          <select className="input mt-1.5" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Select destination location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === 'STORE' ? ' (store)' : ''}</option>)}
          </select>
        </label>

        <div className="mt-5 grid gap-5">
          <section>
            <label className="relative block">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product by name or SKU..." className="w-full rounded-sm border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <div className="mt-3 max-h-60 overflow-y-auto rounded-sm border">
              {loading ? (
                <div className="p-10 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
              ) : visibleProducts.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No products match your search.</div>
              ) : (
                <div className="divide-y">
                  {visibleProducts.slice(0, 40).map((product) => {
                    const packSize = Number(product.packSize) || 0
                    const unitLabel = product.packUnit?.name ?? product.unit
                    return (
                      <button key={product.id} type="button" onClick={() => addProduct(product)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-muted/50">
                        <span>
                          <span className="block font-semibold">{product.name}</span>
                          <span className="block text-xs text-muted-foreground">{product.sku ?? 'No SKU'} · current {packAndUnit(currentAt(product), packSize, product.packLabel ?? '', unitLabel)}</span>
                        </span>
                        <LuPackagePlus className="shrink-0 text-secondary" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-sm border">
            <div className="grid grid-cols-[1fr_150px_44px] bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
              <span>Product</span>
              <span className="text-right">Qty received</span>
              <span />
            </div>
            {batch.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No products added yet.</p>
            ) : batch.map((item) => (
              <div key={item.productId} className="grid grid-cols-[1fr_150px_44px] items-center gap-3 border-t px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.packSize ? `${item.packLabel || 'Pack'} contains ${item.packSize.toLocaleString()} ${item.unit}` : item.unit}</p>
                </div>
                <PackQtyInput
                  value={item.quantity}
                  onChange={(v) => setBatchQuantity(item.productId, v)}
                  packSize={item.packSize}
                  packLabel={item.packLabel}
                  unitName={item.unit}
                  className="w-full rounded-sm border bg-background px-2 py-1.5 text-right text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="button" onClick={() => removeFromBatch(item.productId)} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 className="size-4" /></button>
              </div>
            ))}
          </section>

          <label className="block text-sm font-medium">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier or delivery note reference" className="input mt-1.5 min-h-20" />
          </label>
        </div>

        {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

        <div className="mt-6 flex justify-end gap-2 border-t pt-5">
          <button type="button" onClick={onClose} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
          <button
            disabled={!locationId || batch.every((b) => Number(b.quantity) <= 0) || saving}
            onClick={() => void record()}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="animate-spin" />} Receive goods
          </button>
        </div>
      </div>
    </div>
  )
}
