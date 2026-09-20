import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBellRing, LuCheck, LuCircleAlert, LuClock3, LuFlame, LuLoaderCircle, LuRefreshCw, LuSparkles } from 'react-icons/lu'

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
type Order = { id: string; orderNumber: number; table: { label: string } | null; notes: string | null; status: 'OPEN' | 'PREPARING' | 'READY' | 'SERVED'; createdAt: string; updatedAt: string; items: OrderItem[] }

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
  }), [orders])

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

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard index={4} label="New tickets" value={counts.new} icon={<LuClock3 />} />
        <StatCard index={0} label="In preparation" value={counts.preparing} icon={<LuFlame />} />
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
            {updatedOrders.map((order) => <UpdatedTicket key={order.id} order={order} acking={ackingId === order.id} onAck={() => void ackUpdates(order)} />)}
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
            {orders.map((order) => <Ticket key={order.id} order={order} now={clock} working={workingId === order.id} onAdvance={() => void advance(order)} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function Ticket({ order, now, working, onAdvance }: { order: Order; now: number; working: boolean; onAdvance: () => void }) {
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
        <button
          disabled={working}
          onClick={onAdvance}
          className={cn('mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wide transition hover:brightness-110 disabled:opacity-60', order.status === 'OPEN' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground')}
        >
          {working ? <LuLoaderCircle className="animate-spin" /> : order.status === 'OPEN' ? <LuFlame /> : <LuCheck />}
          {working ? 'Updating…' : order.status === 'OPEN' ? 'Start preparing' : 'Mark ready'}
        </button>
      </div>
    </article>
  )
}

const ORDER_STATUS_LABEL: Record<Order['status'], string> = { OPEN: 'New', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served' }

/** A ticket already known to kitchen/bar, now carrying at least one line the
 * waiter added since — only those flagged lines are shown, not the whole
 * order, so there's no need to re-scan what's already been made. */
function UpdatedTicket({ order, acking, onAck }: { order: Order; acking: boolean; onAck: () => void }) {
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
        <button disabled={acking} onClick={onAck} className="mt-4 flex w-full items-center justify-center gap-2 bg-success py-3 text-sm font-bold uppercase tracking-wide text-success-foreground transition hover:brightness-110 disabled:opacity-60">
          {acking ? <LuLoaderCircle className="animate-spin" /> : <LuCheck />}{acking ? 'Updating…' : 'Mark prepared'}
        </button>
      </div>
    </article>
  )
}
