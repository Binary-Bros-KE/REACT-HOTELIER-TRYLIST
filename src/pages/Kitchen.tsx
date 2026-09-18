import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBellRing, LuChefHat, LuCheck, LuCircleAlert, LuClock3, LuCoffee, LuFlame, LuGlassWater, LuLoaderCircle, LuPackageCheck, LuRefreshCw, LuSparkles, LuUtensilsCrossed } from 'react-icons/lu'

import { api } from '@/lib/api'
import StatCard from '@/components/ui/StatCard'

type Product = { id: string; name: string; unit: string; stocks: { quantity: string | number }[] }
type Ingredient = { quantity: string | number; product: Product }
type MenuItem = { id: string; name: string; temperature: 'HOT' | 'COLD' | 'OTHER'; category: { name: string }; product: Product | null; recipe: { ingredients: Ingredient[] } | null }
type OrderItem = { id: string; quantity: number; menuItem: MenuItem; variant: { name: string } | null; addons: { id: string; addon: { name: string } }[]; addedAfterSend: boolean }
type Order = { id: string; orderNumber: number; table: { label: string } | null; notes: string | null; status: 'OPEN' | 'PREPARING' | 'READY' | 'SERVED'; createdAt: string; updatedAt: string; items: OrderItem[] }
type Station = 'All' | 'Hot' | 'Cold' | 'Bakery'

function stationFor(item: MenuItem): Exclude<Station, 'All'> {
  if (item.temperature === 'HOT') return 'Hot'
  if (item.temperature === 'COLD') return 'Cold'
  return 'Bakery'
}

function elapsed(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000))
  return minutes < 1 ? 'Just now' : `${minutes} min ago`
}

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([])
  const [updatedOrders, setUpdatedOrders] = useState<Order[]>([])
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [activeStation, setActiveStation] = useState<Station>('All')
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
      const [orderResponse, updatedResponse, menuResponse] = await Promise.all([
        api<{ orders: Order[] }>('/kitchen/orders'),
        api<{ orders: Order[] }>('/kitchen/orders/updated'),
        api<{ items: MenuItem[] }>('/kitchen/menu-items'),
      ])
      setOrders(orderResponse.orders); setUpdatedOrders(updatedResponse.orders); setMenu(menuResponse.items); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the kitchen queue') }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    void load()
    const poll = window.setInterval(() => void load(true), 15000)
    const timer = window.setInterval(() => setClock(Date.now()), 30000)
    return () => { window.clearInterval(poll); window.clearInterval(timer) }
  }, [load])

  const visibleOrders = orders.filter((order) => activeStation === 'All' || order.items.some((item) => stationFor(item.menuItem) === activeStation))
  const counts = useMemo(() => ({
    new: orders.filter((order) => order.status === 'OPEN').length,
    preparing: orders.filter((order) => order.status === 'PREPARING').length,
    hot: orders.filter((order) => order.items.some((item) => item.menuItem.temperature === 'HOT')).length,
    cold: orders.filter((order) => order.items.some((item) => item.menuItem.temperature === 'COLD')).length,
  }), [orders])
  const offerings = useMemo(() => ({ Hot: menu.filter((item) => stationFor(item) === 'Hot'), Cold: menu.filter((item) => stationFor(item) === 'Cold'), Bakery: menu.filter((item) => stationFor(item) === 'Bakery') }), [menu])

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

  return <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
    <header className="relative overflow-hidden rounded-sm bg-linear-to-r from-primary via-primary to-[#173b67] p-7 text-white shadow-xl shadow-primary/15"><div className="absolute -right-10 -top-20 size-64 rounded-full bg-warning/20 blur-3xl" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-white/60"><LuChefHat /> Kitchen command centre</div><h1 className="mt-3 font-display text-3xl font-semibold">Every ticket, perfectly timed.</h1><p className="mt-2 max-w-xl text-sm text-white/65">Live orders from POS, recipes from Products, and stock updated when preparation is complete.</p></div><div className="flex items-center gap-3"><span className="flex items-center gap-2 rounded-full bg-success/20 px-3 py-1.5 text-xs font-semibold text-success"><span className="size-2 animate-pulse rounded-full bg-success" /> Live sync</span><button onClick={() => void load(true)} className="rounded-sm bg-white/10 p-2.5 text-white transition hover:bg-white/20" title="Refresh queue"><LuRefreshCw className={refreshing ? 'animate-spin' : ''} /></button></div></div></header>

    {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
    {notice && <div className="mt-5 flex items-center gap-2 rounded-sm border border-success/25 bg-success/10 p-3 text-sm text-success"><LuCheck />{notice}</div>}

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric index={0} label="New tickets" value={counts.new} icon={<LuClock3 />} tone="secondary" /><Metric index={1} label="In preparation" value={counts.preparing} icon={<LuFlame />} tone="warning" /><Metric index={2} label="Hot queue" value={counts.hot} icon={<LuCoffee />} tone="warning" /><Metric index={3} label="Cold queue" value={counts.cold} icon={<LuGlassWater />} tone="secondary" /></section>

    {updatedOrders.length > 0 && (
      <section className="mt-7">
        <div className="flex items-center gap-2"><LuBellRing className="text-warning" /><h2 className="font-display text-xl font-semibold">Updated orders</h2><span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{updatedOrders.length}</span></div>
        <p className="text-sm text-muted-foreground">A waiter added something to a ticket already in progress — only the new items are shown below.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {updatedOrders.map((order) => <UpdatedTicket key={order.id} order={order} acking={ackingId === order.id} onAck={() => void ackUpdates(order)} />)}
        </div>
      </section>
    )}

    <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-xl font-semibold">Active preparation queue</h2><p className="text-sm text-muted-foreground">Oldest tickets appear first.</p></div><div className="flex flex-wrap rounded-sm border bg-card p-1 shadow-sm">{(['All', 'Hot', 'Cold', 'Bakery'] as const).map((station) => <button key={station} onClick={() => setActiveStation(station)} className={`rounded-sm px-4 py-2 text-sm font-semibold transition ${activeStation === station ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>{station}</button>)}</div></div>

    <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><section>{loading ? <div className="flex min-h-72 items-center justify-center gap-2 rounded-sm border bg-card text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading live tickets…</div> : visibleOrders.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center rounded-sm border border-dashed bg-card text-center"><span className="flex size-14 items-center justify-center rounded-sm bg-success/10 text-success"><LuSparkles className="size-6" /></span><h3 className="mt-4 font-semibold">Kitchen is all caught up</h3><p className="mt-1 text-sm text-muted-foreground">New POS orders will appear automatically.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{visibleOrders.map((order) => <Ticket key={order.id} order={order} now={clock} working={workingId === order.id} onAdvance={() => void advance(order)} />)}</div>}</section>
      <aside className="space-y-4"><section className="rounded-sm border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-sm bg-accent/10 text-accent"><LuPackageCheck /></span><div><h3 className="font-semibold">Products connected</h3><p className="text-xs text-muted-foreground">Live recipe availability</p></div></div><div className="mt-4 space-y-3">{(['Hot', 'Cold', 'Bakery'] as const).map((station) => <div key={station} className="flex items-center justify-between rounded-sm bg-muted/50 px-3 py-2.5"><span className="text-sm font-medium">{station} menu</span><span className="rounded-full bg-card px-2 py-0.5 text-xs font-bold text-secondary">{offerings[station].length}</span></div>)}</div></section><section className="rounded-sm border bg-card p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><LuUtensilsCrossed className="text-secondary" /> Available menu</h3><div className="scrollbar-thin mt-4 max-h-80 space-y-2 overflow-y-auto">{menu.map((item) => { const ingredients = item.recipe?.ingredients.length ? item.recipe.ingredients : item.product ? [{ quantity: 1, product: item.product }] : []; const low = ingredients.some((ingredient) => ingredient.product.stocks.reduce((sum, s) => sum + Number(s.quantity), 0) < Number(ingredient.quantity)); return <div key={item.id} className="rounded-sm border p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item.name}</span><span className={`size-2 rounded-full ${low ? 'bg-warning' : 'bg-success'}`} title={low ? 'Low in stock' : 'Available in stock'} /></div><p className="mt-1 text-xs text-muted-foreground">{ingredients.length ? ingredients.map((ingredient) => ingredient.product.name).join(' · ') : 'No recipe linked'}</p></div> })}</div></section></aside>
    </div>
  </div>
}

const KITCHEN_TONE_INDEX: Record<'secondary' | 'warning', number> = { secondary: 4, warning: 0 }
function Metric({ label, value, icon, tone, index }: { label: string; value: number; icon: React.ReactNode; tone: 'secondary' | 'warning'; index?: number }) { return <StatCard index={index ?? KITCHEN_TONE_INDEX[tone]} icon={icon} label={label} value={value} /> }

function Ticket({ order, now, working, onAdvance }: { order: Order; now: number; working: boolean; onAdvance: () => void }) {
  const stations = Array.from(new Set(order.items.map((item) => stationFor(item.menuItem))) )
  const old = now - new Date(order.createdAt).getTime() > 10 * 60000
  return <article className={`overflow-hidden rounded-sm border bg-card shadow-sm transition hover:shadow-lg ${old ? 'border-warning/50' : ''}`}><div className={`h-1.5 ${order.status === 'OPEN' ? 'bg-secondary' : 'bg-warning'}`} /><div className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-display text-xl font-bold">#{order.orderNumber}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${order.status === 'OPEN' ? 'bg-secondary/10 text-secondary' : 'bg-warning/15 text-warning'}`}>{order.status === 'OPEN' ? 'New' : 'Preparing'}</span></div><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><LuClock3 />{order.table?.label || 'Takeaway'} · {elapsed(order.createdAt)}</p></div><div className="flex gap-1">{stations.map((station) => <span key={station} className="rounded-sm bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{station}</span>)}</div></div><div className="mt-4 space-y-3 border-y py-4">{order.items.map((item) => <div key={item.id} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-xs font-bold text-primary-foreground">{item.quantity}</span><div><p className="text-sm font-semibold">{item.menuItem.name}{item.variant ? <span className="ml-1.5 font-medium text-secondary">· {item.variant.name}</span> : null}</p>{item.addons.length > 0 && <p className="mt-0.5 text-xs text-secondary">+ {item.addons.map((addon) => addon.addon.name).join(', ')}</p>}<p className="mt-1 text-[11px] text-muted-foreground">{item.menuItem.recipe?.ingredients.length ? `Recipe: ${item.menuItem.recipe.ingredients.map((ingredient) => `${ingredient.product.name} ${ingredient.quantity}${ingredient.product.unit}`).join(' · ')}` : item.menuItem.product ? `Product: ${item.menuItem.product.name}` : 'No stock recipe linked'}</p></div></div>)}</div>{order.notes && <p className="mt-3 rounded-sm bg-warning/10 p-3 text-xs text-warning"><strong>Note:</strong> {order.notes}</p>}<button disabled={working} onClick={onAdvance} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-sm py-3 text-sm font-bold transition disabled:opacity-60 ${order.status === 'OPEN' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-success text-success-foreground hover:bg-success/90'}`}>{working ? <LuLoaderCircle className="animate-spin" /> : order.status === 'OPEN' ? <LuFlame /> : <LuCheck />}{working ? 'Updating…' : order.status === 'OPEN' ? 'Start preparing' : 'Mark ready'}</button></div></article>
}

const ORDER_STATUS_LABEL: Record<Order['status'], string> = { OPEN: 'New', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served' }

/** A ticket already known to kitchen/bar, now carrying at least one line the
 * waiter added since — only those flagged lines are shown, not the whole
 * order, so there's no need to re-scan what's already been made. */
function UpdatedTicket({ order, acking, onAck }: { order: Order; acking: boolean; onAck: () => void }) {
  const newItems = order.items.filter((item) => item.addedAfterSend)
  return <article className="overflow-hidden rounded-sm border border-warning/50 bg-card shadow-sm transition hover:shadow-lg"><div className="h-1.5 bg-warning" /><div className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><h3 className="font-display text-xl font-bold">#{order.orderNumber}</h3><span className="rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-warning">{ORDER_STATUS_LABEL[order.status]} · updated</span></div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><LuClock3 />{order.table?.label || 'Takeaway'}</p>
      </div>
    </div>
    <div className="mt-4 space-y-3 border-y py-4">
      {newItems.map((item) => <div key={item.id} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-warning text-xs font-bold text-warning-foreground">{item.quantity}</span><div><p className="text-sm font-semibold">{item.menuItem.name}{item.variant ? <span className="ml-1.5 font-medium text-secondary">· {item.variant.name}</span> : null}</p>{item.addons.length > 0 && <p className="mt-0.5 text-xs text-secondary">+ {item.addons.map((addon) => addon.addon.name).join(', ')}</p>}</div></div>)}
    </div>
    <button disabled={acking} onClick={onAck} className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm bg-success py-3 text-sm font-bold text-success-foreground transition hover:bg-success/90 disabled:opacity-60">{acking ? <LuLoaderCircle className="animate-spin" /> : <LuCheck />}{acking ? 'Updating…' : 'Mark prepared'}</button>
  </div></article>
}
