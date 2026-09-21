import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBellRing, LuCheck, LuCircleAlert, LuClock3, LuFlame, LuLoaderCircle, LuPackageOpen, LuRefreshCw, LuSparkles, LuStore } from 'react-icons/lu'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill from '@/components/ui/StatusPill'

type Product = { id: string; name: string; unit: string; stocks: { quantity: string | number }[] }
type Ingredient = { quantity: string | number; product: Product }
type MenuItem = { id: string; name: string; category: { name: string }; product: Product | null; recipe: { ingredients: Ingredient[] } | null }
type OrderItem = { id: string; quantity: number; menuItem: MenuItem; variant: { name: string } | null; addons: { id: string; addon: { name: string } }[]; addedAfterSend: boolean }
// Where this ticket's ingredients stand with the store (only when its location requires store dispatch).
type Dispatch = { required: boolean; state: 'NOT_REQUIRED' | 'NOTHING_NEEDED' | 'NEEDS_REQUEST' | 'WAITING' | 'DISPATCHED'; clear: boolean; uncovered: number; waiting?: boolean; rejectReason: string | null }
type Order = { id: string; orderNumber: number; dispatch?: Dispatch; table: { label: string } | null; notes: string | null; status: 'OPEN' | 'PREPARING' | 'READY' | 'SERVED'; createdAt: string; updatedAt: string; items: OrderItem[] }

function elapsed(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
  return minutes < 1 ? 'Just now' : `${minutes} min ago`
}

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [updatedOrders, setUpdatedOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [ackingId, setAckingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [clock, setClock] = useState(Date.now())

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    try {
      const [orderResponse, updatedResponse] = await Promise.all([
        api<{ orders: Order[] }>('/kitchen/orders'),
        api<{ orders: Order[] }>('/kitchen/orders/updated'),
      ])
      setOrders(orderResponse.orders); setUpdatedOrders(updatedResponse.orders); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the kitchen queue') }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    void load()
    const poll = window.setInterval(() => void load(true), 15000)
    const timer = window.setInterval(() => setClock(Date.now()), 30000)
    return () => { window.clearInterval(poll); window.clearInterval(timer) }
  }, [load])

  const counts = useMemo(() => ({
    new: orders.filter((order) => order.status === 'OPEN').length,
    preparing: orders.filter((order) => order.status === 'PREPARING').length,
    awaitingStore: orders.filter((order) => order.dispatch?.required && !order.dispatch.clear).length,
  }), [orders])
  const usesStore = orders.some((order) => order.dispatch?.required) || updatedOrders.some((order) => order.dispatch?.required)

  async function dispatchAction(order: Order, action: 'request-dispatch' | 'cancel-dispatch') {
    setWorkingId(order.id); setError(''); setNotice('')
    try {
      await api(`/kitchen/orders/${order.id}/${action}`, { method: 'POST', body: JSON.stringify({}) })
      setNotice(action === 'request-dispatch' ? `Order #${order.orderNumber}: ingredients requested from the store.` : `Order #${order.orderNumber}: request withdrawn.`)
      await load(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the store request') }
    finally { setWorkingId('') }
  }

  async function advance(order: Order) {
    setWorkingId(order.id); setError(''); setNotice('')
    try {
      if (order.status === 'OPEN') {
        await api(`/kitchen/orders/${order.id}/start`, { method: 'PATCH' })
        setNotice(`Order #${order.orderNumber} is now being prepared.`)
      } else {
        await api(`/kitchen/orders/${order.id}/ready`, { method: 'PATCH' })
        setNotice(`Order #${order.orderNumber} is ready. The waiter has been notified.`)
      }
      await load(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this order') }
    finally { setWorkingId('') }
  }

  async function ackUpdates(order: Order) {
    setAckingId(order.id); setError(''); setNotice('')
    try {
      await api(`/kitchen/orders/${order.id}/ack-updates`, { method: 'PATCH' })
      setNotice(`Order #${order.orderNumber}'s new items are marked prepared.`)
      await load(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this order') }
    finally { setAckingId('') }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Kitchen" title="Active Orders">
        <StatusPill tone="success">Live sync</StatusPill>
        <ActionButton tone="neutral" icon={<LuRefreshCw className={refreshing ? 'animate-spin' : ''} />} title="Refresh queue" onClick={() => void load(true)} />
      </PageBanner>

      {error && <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
      {notice && <div className="mt-5 flex items-center gap-2 border border-success/25 bg-success/10 p-3 text-sm text-success"><LuCheck />{notice}</div>}

      <section className={cn('mt-6 grid gap-4 sm:grid-cols-2', usesStore && 'lg:grid-cols-3')}>
        <StatCard index={4} label="New tickets" value={counts.new} icon={<LuClock3 />} />
        <StatCard index={0} label="In preparation" value={counts.preparing} icon={<LuFlame />} />
        {usesStore && <StatCard tone={counts.awaitingStore ? 'warn' : undefined} index={2} label="Waiting on the store" value={counts.awaitingStore} icon={<LuStore />} />}
      </section>

      {updatedOrders.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3 border-l-4 border-accent pl-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold leading-tight"><LuBellRing className="text-warning" /> Updated orders</h2>
              <p className="text-xs text-muted-foreground">A waiter added something to a ticket already in progress — only the new items are shown.</p>
            </div>
            <span className="border bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">{updatedOrders.length}</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {updatedOrders.map((order) => <UpdatedTicket key={order.id} order={order} acking={ackingId === order.id} onAck={() => void ackUpdates(order)} working={workingId === order.id} onDispatch={(action) => void dispatchAction(order, action)} />)}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 border-l-4 border-accent pl-3">
          <h2 className="font-display text-lg font-semibold leading-tight">Active preparation queue</h2>
          <p className="text-xs text-muted-foreground">Oldest tickets appear first.</p>
        </div>
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-2 border bg-card text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading live tickets…</div>
        ) : orders.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center border border-dashed bg-card text-center">
            <span className="flex size-14 items-center justify-center bg-success/10 text-success"><LuSparkles className="size-6" /></span>
            <h3 className="mt-4 font-semibold">Kitchen is all caught up</h3>
            <p className="mt-1 text-sm text-muted-foreground">New POS orders will appear automatically.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => <Ticket key={order.id} order={order} now={clock} working={workingId === order.id} onAdvance={() => void advance(order)} onDispatch={(action) => void dispatchAction(order, action)} />)}
          </div>
        )}
      </section>
    </div>
  )
}

type DispatchAction = 'request-dispatch' | 'cancel-dispatch'

/** The store-dispatch step of a ticket: what the chef has to do before (or while) cooking. */
function DispatchPanel({ dispatch, working, onDispatch, compact }: { dispatch: Dispatch; working: boolean; onDispatch: (action: DispatchAction) => void; compact?: boolean }) {
  if (!dispatch.required || dispatch.state === 'NOTHING_NEEDED') return null
  if (dispatch.state === 'DISPATCHED') return <p className="mt-3 flex items-center gap-2 border border-success/30 bg-success/10 p-2.5 text-xs font-semibold text-success"><LuPackageOpen /> Ingredients dispatched by the store</p>
  if (dispatch.state === 'WAITING') {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 border border-warning/40 bg-warning/10 p-2.5 text-xs font-semibold text-warning">
        <span className="flex items-center gap-2"><LuStore /> Waiting for the store to dispatch…</span>
        <button type="button" disabled={working} onClick={() => onDispatch('cancel-dispatch')} className="underline disabled:opacity-60">Withdraw</button>
      </div>
    )
  }
  return (
    <div className="mt-3 space-y-2">
      {dispatch.rejectReason && <p className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"><LuCircleAlert className="mt-0.5 shrink-0" /><span><strong>Store said:</strong> {dispatch.rejectReason}</span></p>}
      {compact && <button type="button" disabled={working} onClick={() => onDispatch('request-dispatch')} className="flex w-full items-center justify-center gap-2 border border-secondary py-2 text-xs font-bold uppercase tracking-wide text-secondary hover:bg-secondary/10 disabled:opacity-60">{working ? <LuLoaderCircle className="animate-spin" /> : <LuStore />} Request from store</button>}
    </div>
  )
}

function Ticket({ order, now, working, onAdvance, onDispatch }: { order: Order; now: number; working: boolean; onAdvance: () => void; onDispatch: (action: DispatchAction) => void }) {
  const dispatch = order.dispatch
  const needsRequest = Boolean(dispatch?.required) && dispatch?.state === 'NEEDS_REQUEST'
  const waitingOnStore = Boolean(dispatch?.required) && dispatch?.state === 'WAITING'
  const old = now - new Date(order.createdAt).getTime() > 10 * 60000
  return (
    <article className={cn('overflow-hidden border bg-card shadow-sm transition hover:shadow-md', old && 'border-warning/60')}>
      <div className={cn('h-1.5', order.status === 'OPEN' ? 'bg-secondary' : 'bg-warning')} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl font-bold">#{order.orderNumber}</h3>
              <StatusPill tone={order.status === 'OPEN' ? 'secondary' : 'warning'}>{order.status === 'OPEN' ? 'New' : 'Preparing'}</StatusPill>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><LuClock3 />{order.table?.label || 'Takeaway'} · {elapsed(order.createdAt)}</p>
          </div>
          {old && <StatusPill tone="danger">Waiting</StatusPill>}
        </div>
        <div className="mt-4 space-y-3 border-y py-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center bg-primary text-xs font-bold text-primary-foreground">{item.quantity}</span>
              <div>
                <p className="text-sm font-semibold">{item.menuItem.name}{item.variant ? <span className="ml-1.5 font-medium text-secondary">· {item.variant.name}</span> : null}</p>
                {item.addons.length > 0 && <p className="mt-0.5 text-xs text-secondary">+ {item.addons.map((addon) => addon.addon.name).join(', ')}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">{item.menuItem.recipe?.ingredients.length ? `Recipe: ${item.menuItem.recipe.ingredients.map((ingredient) => `${ingredient.product.name} ${ingredient.quantity}${ingredient.product.unit}`).join(' · ')}` : item.menuItem.product ? `Product: ${item.menuItem.product.name}` : 'No stock recipe linked'}</p>
              </div>
            </div>
          ))}
        </div>
        {order.notes && <p className="mt-3 border border-warning/30 bg-warning/10 p-3 text-xs text-warning"><strong>Note:</strong> {order.notes}</p>}
        {dispatch && <DispatchPanel dispatch={dispatch} working={working} onDispatch={onDispatch} />}
        {waitingOnStore ? (
          <button disabled className="mt-4 flex w-full items-center justify-center gap-2 bg-muted py-3 text-sm font-bold uppercase tracking-wide text-muted-foreground"><LuStore /> Waiting for the store</button>
        ) : needsRequest ? (
          <button disabled={working} onClick={() => onDispatch('request-dispatch')} className="mt-4 flex w-full items-center justify-center gap-2 bg-secondary py-3 text-sm font-bold uppercase tracking-wide text-secondary-foreground transition hover:brightness-110 disabled:opacity-60">
            {working ? <LuLoaderCircle className="animate-spin" /> : <LuStore />}{working ? 'Requesting…' : order.status === 'OPEN' ? 'Request ingredients' : 'Request added items'}
          </button>
        ) : (
        <button
          disabled={working}
          onClick={onAdvance}
          className={cn('mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110 disabled:opacity-60', order.status === 'OPEN' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground')}
        >
          {working ? <LuLoaderCircle className="animate-spin" /> : order.status === 'OPEN' ? <LuFlame /> : <LuCheck />}
          {working ? 'Updating…' : order.status === 'OPEN' ? 'Start preparing' : 'Mark ready'}
        </button>
        )}
      </div>
    </article>
  )
}

const ORDER_STATUS_LABEL: Record<Order['status'], string> = { OPEN: 'New', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served' }

/** A ticket already known to kitchen/bar, now carrying at least one line the
 * waiter added since — only those flagged lines are shown, not the whole
 * order, so there's no need to re-scan what's already been made. */
function UpdatedTicket({ order, acking, onAck, working, onDispatch }: { order: Order; acking: boolean; onAck: () => void; working: boolean; onDispatch: (action: DispatchAction) => void }) {
  const newItems = order.items.filter((item) => item.addedAfterSend)
  return (
    <article className="overflow-hidden border border-warning/60 bg-card shadow-sm transition hover:shadow-md">
      <div className="h-1.5 bg-warning" />
      <div className="p-5">
        <div className="flex items-center gap-2"><h3 className="font-display text-xl font-bold">#{order.orderNumber}</h3><StatusPill tone="warning">{ORDER_STATUS_LABEL[order.status]} · updated</StatusPill></div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><LuClock3 />{order.table?.label || 'Takeaway'}</p>
        <div className="mt-4 space-y-3 border-y py-4">
          {newItems.map((item) => (
            <div key={item.id} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center bg-warning text-xs font-bold text-warning-foreground">{item.quantity}</span>
              <div>
                <p className="text-sm font-semibold">{item.menuItem.name}{item.variant ? <span className="ml-1.5 font-medium text-secondary">· {item.variant.name}</span> : null}</p>
                {item.addons.length > 0 && <p className="mt-0.5 text-xs text-secondary">+ {item.addons.map((addon) => addon.addon.name).join(', ')}</p>}
              </div>
            </div>
          ))}
        </div>
        {order.dispatch && <DispatchPanel dispatch={order.dispatch} working={working} onDispatch={onDispatch} compact />}
        <button disabled={acking} onClick={onAck} className="mt-4 flex w-full items-center justify-center gap-2 bg-success py-3 text-sm font-bold uppercase tracking-wide text-success-foreground transition hover:brightness-110 disabled:opacity-60">
          {acking ? <LuLoaderCircle className="animate-spin" /> : <LuCheck />}{acking ? 'Updating…' : 'Mark prepared'}
        </button>
      </div>
    </article>
  )
}
