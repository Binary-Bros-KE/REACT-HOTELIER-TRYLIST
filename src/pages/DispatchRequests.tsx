import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBan, LuCircleAlert, LuLoaderCircle, LuPackageCheck, LuPencil, LuPrinter, LuRefreshCw, LuStore } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { printDispatchSlip, type DispatchSlip } from '@/lib/thermalPrinter'
import type { ReceiptProfile } from '@/components/pos/OrderReceipt'
import { useToast } from '@/components/ui/Toast'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import ModalShell from '@/components/ui/ModalShell'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import StatusPill from '@/components/ui/StatusPill'
import RecipeEditModal, { type RecipeDetail, type RecipeProduct } from '@/components/recipes/RecipeEditModal'

type Item = { id: string; productId: string; productName: string; requestedQty: string | number; dispatchedQty: string | number | null; storeQty?: number; product?: { unit: string } }
type Dish = {
  name: string
  quantity: number
  recipeId: string | null
  ingredients: { productId: string; name: string; quantity: number; unit: string; storeQty: number }[]
}
type Request = {
  id: string
  requestNo: string
  status: 'REQUESTED' | 'DISPATCHED' | 'REJECTED' | 'CANCELLED'
  orderNumber: number
  requestedAt: string
  requestedByName: string | null
  respondedAt: string | null
  respondedByName: string | null
  rejectReason: string | null
  note: string | null
  rungUpBy: string | null
  dishes: Dish[]
  items: Item[]
  fromLocation: { name: string }
  toLocation: { name: string }
  order: { table: { label: string } | null }
}
type Tab = 'pending' | 'history'
type RecipeEdit = { requestId: string; recipe: RecipeDetail; products: RecipeProduct[] }

const POLL_MS = 10_000
const qty = (value: string | number) => Number(value).toLocaleString('en-KE', { maximumFractionDigits: 3 })
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const STATUS_TONE = { REQUESTED: 'warning', DISPATCHED: 'success', REJECTED: 'danger', CANCELLED: 'muted' } as const
const STATUS_LABEL = { REQUESTED: 'Waiting', DISPATCHED: 'Dispatched', REJECTED: 'Rejected', CANCELLED: 'Cancelled' } as const

/**
 * The order read dish by dish: each dish, then the stock ingredients it takes,
 * with what the dish asks for and what the store holds. When `sending` is given,
 * each ingredient also gets the quantity the store will send (keyed by product,
 * so the same product in two dishes is one number).
 */
function DishList({
  dishes,
  requesting,
  sending,
  onEditRecipe,
}: {
  dishes: Dish[]
  requesting: boolean
  sending?: { quantities: Record<string, string>; onChange: (productId: string, value: string) => void }
  onEditRecipe?: (recipeId: string) => void
}) {
  // What the whole request asks of each product, across every dish.
  const totalAsked = useMemo(() => {
    const totals = new Map<string, number>()
    for (const dish of dishes) for (const g of dish.ingredients) totals.set(g.productId, (totals.get(g.productId) ?? 0) + g.quantity)
    return totals
  }, [dishes])
  if (dishes.length === 0) return null
  return (
    <div className="mt-3 space-y-4">
      {dishes.map((dish, index) => (
        <div key={index} className="border-l-4 border-accent pl-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{qty(dish.quantity)} × {dish.name}</p>
            {onEditRecipe && dish.recipeId && requesting && (
              <button type="button" onClick={() => onEditRecipe(dish.recipeId!)} className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline"><LuPencil className="size-3" /> Edit recipe</button>
            )}
          </div>
          {dish.ingredients.length === 0 ? (
            <p className="mt-1 text-xs italic text-muted-foreground">No stock ingredients</p>
          ) : (
            <table className="mt-1 w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1 font-semibold">Ingredient</th>
                  <th className="py-1 text-right font-semibold">Asked</th>
                  {requesting && <th className="py-1 text-right font-semibold">In store</th>}
                  {sending && <th className="w-24 py-1 text-right font-semibold">Send</th>}
                </tr>
              </thead>
              <tbody>
                {dish.ingredients.map((g) => {
                  const short = requesting && g.storeQty < (totalAsked.get(g.productId) ?? g.quantity)
                  return (
                    <tr key={g.productId} className="border-t border-dashed">
                      <td className="py-1">{g.name} <span className="text-xs text-muted-foreground">{g.unit}</span></td>
                      <td className="py-1 text-right tabular-nums">{qty(g.quantity)}</td>
                      {requesting && <td className={cn('py-1 text-right tabular-nums', short && 'font-semibold text-destructive')}>{qty(g.storeQty)}</td>}
                      {sending && (
                        <td className="py-1 text-right">
                          <input type="number" min="0" step="any" className="input h-7 w-20 text-right" value={sending.quantities[g.productId] ?? ''} onChange={(e) => sending.onChange(g.productId, e.target.value)} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

/** The store's inbox for kitchen ingredient requests: dispatch (a real stock transfer to the kitchen) or reject. */
export default function DispatchRequests() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [dispatching, setDispatching] = useState<Request | null>(null)
  const [rejecting, setRejecting] = useState<Request | null>(null)
  const [recipeEdit, setRecipeEdit] = useState<RecipeEdit | null>(null)
  const seen = useState(() => ({ ids: null as Set<string> | null }))[0]

  // Manual print: this device's thermal printer if it has one, else the browser print sheet.
  async function printSlip(request: Request) {
    const slip: DispatchSlip = {
      requestNo: request.requestNo,
      orderNumber: request.orderNumber,
      table: request.order.table?.label ?? null,
      from: request.fromLocation.name,
      to: request.toLocation.name,
      requestedByName: request.requestedByName,
      rungUpBy: request.rungUpBy,
      requestedAt: request.requestedAt,
      note: request.note,
      dishes: request.dishes.map((d) => ({ name: d.name, quantity: d.quantity, ingredients: d.ingredients.map((g) => ({ name: g.name, quantity: g.quantity, unit: g.unit })) })),
      items: request.items.map((i) => ({ name: i.productName, quantity: Number(i.requestedQty), unit: i.product?.unit ?? '' })),
    }
    try {
      const { profile } = await api<{ profile: ReceiptProfile }>('/business-profile').catch(() => ({ profile: null as unknown as ReceiptProfile }))
      await printDispatchSlip(slip, profile ?? null)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not print the slip') }
  }

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true)
    try {
      const data = await api<{ requests: Request[] }>(`/dispatch-requests${tab === 'history' ? '?status=history' : ''}`)
      if (tab === 'pending') {
        // Announce requests that arrived since the last poll.
        if (seen.ids) {
          const fresh = data.requests.filter((r) => !seen.ids!.has(r.id))
          if (fresh.length === 1) toast.info(`New request: order #${fresh[0].orderNumber} needs ingredients`)
          else if (fresh.length > 1) toast.info(`${fresh.length} new kitchen requests`)
        }
        seen.ids = new Set(data.requests.map((r) => r.id))
      }
      setRequests(data.requests); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load dispatch requests') }
    finally { setLoading(false); setRefreshing(false) }
  }, [tab, toast, seen])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load(true) }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  // Opens a dish's recipe for correction, from the card or the dispatch dialog.
  async function openRecipe(requestId: string, recipeId: string) {
    try {
      const [r, p] = await Promise.all([api<{ recipe: RecipeDetail }>(`/recipes/${recipeId}`), api<{ products: RecipeProduct[] }>('/products')])
      setRecipeEdit({ requestId, recipe: r.recipe, products: p.products })
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not open the recipe') }
  }

  // A corrected recipe rebuilds the waiting request from the order, so the store sees the new list.
  async function recipeSaved() {
    if (!recipeEdit) return
    const requestId = recipeEdit.requestId
    setRecipeEdit(null)
    try {
      const r = await api<{ request: Request }>(`/dispatch-requests/${requestId}/refresh`, { method: 'POST' })
      setDispatching((current) => (current && current.id === requestId ? r.request : current))
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not refresh the request') }
    void load(true)
  }

  const pendingCount = tab === 'pending' ? requests.length : null

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Dispatch Requests">
        <StatusPill tone="success">Live sync</StatusPill>
        <ActionButton tone="neutral" icon={<LuRefreshCw className={refreshing ? 'animate-spin' : ''} />} title="Refresh" onClick={() => void load(true)} />
      </PageBanner>

      <p className="mt-4 text-sm text-muted-foreground">Every order posted at a kitchen that uses the store lands here automatically. Dispatching takes the stock out of the store for the dishes and lets the chef start cooking. Print the slip to pick and hand over the items.</p>

      <div className="mt-5 flex w-fit border bg-card p-1">
        {([['pending', 'Waiting for you'], ['history', 'History']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={cn('px-4 py-2 text-sm font-semibold transition', tab === key ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted')}>{label}{key === 'pending' && pendingCount ? ` (${pendingCount})` : ''}</button>
        ))}
      </div>

      {tab === 'pending' && <section className="mt-5 grid gap-4 sm:grid-cols-2"><StatCard tone={requests.length ? 'warn' : undefined} index={0} label="Waiting for dispatch" value={requests.length} icon={<LuStore />} /></section>}

      {error && <div className="mt-4 flex items-center gap-2 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}

      {loading ? <div className="p-16 text-center"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        : requests.length === 0 ? <div className="mt-5 border border-dashed p-16 text-center text-sm text-muted-foreground">{tab === 'pending' ? 'No kitchen requests waiting. New ones appear here automatically.' : 'No dispatch history yet.'}</div>
        : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {requests.map((request) => {
              const waiting = request.status === 'REQUESTED'
              return (
                <article key={request.id} className="flex flex-col border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{request.requestNo}</p>
                      <h3 className="font-display text-lg font-semibold">Order #{request.orderNumber}{request.order.table ? ` · ${request.order.table.label}` : ''}</h3>
                      <p className="text-xs text-muted-foreground">{request.rungUpBy ? `Rung up by ${request.rungUpBy} · ` : ''}{request.fromLocation.name} → {request.toLocation.name}</p>
                    </div>
                    <StatusPill tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</StatusPill>
                  </div>
                  <DishList
                    dishes={request.dishes}
                    requesting={waiting}
                    onEditRecipe={waiting ? (recipeId) => void openRecipe(request.id, recipeId) : undefined}
                  />
                  {!waiting && request.dishes.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No dishes recorded.</p>}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Requested {when(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ''}
                    {request.status !== 'REQUESTED' && request.respondedAt ? ` · ${STATUS_LABEL[request.status].toLowerCase()} ${when(request.respondedAt)}${request.respondedByName ? ` by ${request.respondedByName}` : ''}` : ''}
                  </p>
                  {request.rejectReason && <p className="mt-1 text-xs text-destructive">Reason: {request.rejectReason}</p>}
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {waiting && <ActionButton tone="success" icon={<LuPackageCheck />} onClick={() => setDispatching(request)}>Dispatch</ActionButton>}
                    {waiting && <ActionButton tone="danger" icon={<LuBan />} onClick={() => setRejecting(request)}>Reject</ActionButton>}
                    <ActionButton tone="neutral" icon={<LuPrinter />} onClick={() => void printSlip(request)}>Print slip</ActionButton>
                  </div>
                </article>
              )
            })}
          </div>
        )}

      {dispatching && <DispatchModal request={dispatching} onClose={() => setDispatching(null)} onRecipe={(recipeId) => void openRecipe(dispatching.id, recipeId)} onDone={() => { setDispatching(null); toast.success('Dispatched to the kitchen'); void load(true) }} />}
      {rejecting && <RejectModal request={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); toast.success('Request rejected'); void load(true) }} />}
      {recipeEdit && <RecipeEditModal recipe={recipeEdit.recipe} products={recipeEdit.products} onClose={() => setRecipeEdit(null)} onSaved={() => void recipeSaved()} />}
    </div>
  )
}

function DispatchModal({ request, onClose, onDone, onRecipe }: { request: Request; onClose: () => void; onDone: () => void; onRecipe: (recipeId: string) => void }) {
  const toast = useToast()
  // Quantities are per product. A recipe correction can change the list, so anything not yet typed defaults to what was asked.
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const sendFor = (productId: string, asked: number) => (quantities[productId] !== undefined ? Number(quantities[productId]) : asked)
  const askedByProduct = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of request.items) totals.set(item.productId, Number(item.requestedQty))
    return totals
  }, [request.items])
  const partial = [...askedByProduct].some(([productId, asked]) => sendFor(productId, asked) < asked)
  const anything = [...askedByProduct].some(([productId, asked]) => sendFor(productId, asked) > 0)

  function setSend(productId: string, value: string) {
    setQuantities((q) => ({ ...q, [productId]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const items = request.items.map((i) => ({ itemId: i.id, quantity: sendFor(i.productId, Number(i.requestedQty)) || 0 }))
      await api(`/dispatch-requests/${request.id}/dispatch`, { method: 'POST', body: JSON.stringify({ items }) })
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not dispatch'); setSaving(false) }
  }

  // The sending view shows the same quantities the card did, plus the send column.
  const sending = { quantities: Object.fromEntries([...askedByProduct].map(([productId, asked]) => [productId, quantities[productId] ?? String(asked)])), onChange: setSend }

  return (
    <ModalShell kicker={request.requestNo} title={`Dispatch for order #${request.orderNumber}`} subtitle={`${request.fromLocation.name} → ${request.toLocation.name}${request.rungUpBy ? ` · rung up by ${request.rungUpBy}` : ''}`} onClose={onClose} size="md"
      footer={<Button onClick={() => void save()} disabled={!anything || saving}>{saving ? 'Dispatching…' : 'Dispatch to kitchen'}</Button>}>
      <div className="space-y-3 p-5">
        <DishList dishes={request.dishes} requesting sending={sending} onEditRecipe={onRecipe} />
        {partial && <p className="text-xs text-warning">You are sending less than was asked. The kitchen may not be able to finish the order.</p>}
        <p className="text-xs text-muted-foreground">This takes the sent items out of {request.fromLocation.name} and is recorded in the stock ledger.</p>
      </div>
    </ModalShell>
  )
}

function RejectModal({ request, onClose, onDone }: { request: Request; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api(`/dispatch-requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) })
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not reject'); setSaving(false) }
  }
  return (
    <ModalShell kicker={request.requestNo} title={`Reject order #${request.orderNumber}`} onClose={onClose} size="sm"
      footer={<Button variant="danger" onClick={() => void save()} disabled={reason.trim().length < 3 || saving}>{saving ? 'Rejecting…' : 'Reject request'}</Button>}>
      <div className="space-y-3 p-5">
        <label className="block text-sm font-medium">Reason for the kitchen
          <textarea rows={3} className="input mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock, expected tomorrow" />
        </label>
        <p className="text-xs text-muted-foreground">The chef sees this reason and can send a new request.</p>
      </div>
    </ModalShell>
  )
}
