import { useCallback, useEffect, useState } from 'react'
import { LuCircleAlert, LuClock3, LuLoaderCircle, LuPlus, LuPrinter, LuReceiptText, LuTimerReset, LuWallet } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import ActionButton from '@/components/ui/ActionButton'
import ModalShell from '@/components/ui/ModalShell'
import StatusPill from '@/components/ui/StatusPill'
import OrderSettlementPanel from '@/components/pos/OrderSettlementPanel'
import ReceiptPreviewModal from '@/components/pos/ReceiptPreviewModal'
import type { ReceiptProfile } from '@/components/pos/OrderReceipt'
import type { PaymentMethod } from '@/components/pos/RetailCheckoutModal'

type TabItem = {
  id: string
  quantity: number
  unitPrice: string | number
  extendsItemId: string | null
  service: { name: string; durationMinutes: number | null; unit: { name: string } } | null
  serviceVariant: { name: string; durationMinutes: number | null } | null
  addons: { id: string; quantity: number; addon: { name: string } }[]
}
export type ServiceTab = {
  id: string
  orderNumber: number
  status: 'OPEN' | 'SERVED' | 'PENDING_CANCELLATION'
  notes: string | null
  createdAt: string
  customer: { firstName: string; lastName: string | null } | null
  items: TabItem[]
  total: number
  paid: number
}

const POLL_MS = 15_000
const money = (v: number) => `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** Minutes each unit of a line lasts: the option's own duration, else the service's. */
const unitMinutes = (item: TabItem) => item.serviceVariant?.durationMinutes ?? item.service?.durationMinutes ?? 0
/** Total minutes the customer has paid for across every line and extension. */
export const paidMinutes = (tab: ServiceTab) => tab.items.reduce((sum, item) => sum + unitMinutes(item) * item.quantity, 0)
const fmtMinutes = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
const itemLabel = (item: TabItem) => `${item.service?.name ?? 'Service'}${item.serviceVariant ? ` (${item.serviceVariant.name})` : ''}`

/**
 * The running services. Each card is a customer's open tab: a live timer against
 * the time paid for (when the service has a duration), Extend for another unit,
 * Add service for more, Complete to finish it, then it is paid with the same
 * settlement screen as any other sale (cash, room, credit) or cancelled through
 * the normal approval flow.
 */
export default function ActiveServicesTab({ methods, profile, onAddServices, onCount }: {
  methods: PaymentMethod[]
  profile: unknown
  onAddServices: (tab: { id: string; orderNumber: number; label: string }) => void
  onCount: (count: number) => void
}) {
  const toast = useToast()
  const [tabs, setTabs] = useState<ServiceTab[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [busyId, setBusyId] = useState('')
  const [extending, setExtending] = useState<ServiceTab | null>(null)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [running, awaiting] = await Promise.all([
        api<{ orders: ServiceTab[] }>('/pos/orders?channel=SERVICES&status=OPEN'),
        api<{ orders: ServiceTab[] }>('/pos/orders?channel=SERVICES&status=SERVED'),
      ])
      // Unpaid, finished services still need collecting; fully paid ones become COMPLETED and leave.
      const list = [...running.orders, ...awaiting.orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setTabs(list); onCount(list.length); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the running services') }
    finally { if (!quiet) setLoading(false) }
  }, [onCount])

  useEffect(() => {
    void load()
    const poll = window.setInterval(() => { if (!document.hidden) void load(true) }, POLL_MS)
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => { window.clearInterval(poll); window.clearInterval(clock) }
  }, [load])

  async function complete(tab: ServiceTab) {
    setBusyId(tab.id)
    try {
      await api(`/pos/orders/${tab.id}/complete-service`, { method: 'POST', body: JSON.stringify({}) })
      await load(true)
      setManagingId(tab.id) // straight on to payment
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not complete the service') }
    finally { setBusyId('') }
  }

  const managing = tabs.find((t) => t.id === managingId)

  return (
    <div>
      {error && <div className="mb-4 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading running services…</div>
      ) : tabs.length === 0 ? (
        <div className="border border-dashed p-12 text-center text-sm text-muted-foreground">No services running. Use <strong>Start service</strong> on the New sale tab to open one, then extend it and pay when it ends.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tabs.map((tab) => {
            const running = tab.status === 'OPEN'
            const elapsed = (now - new Date(tab.createdAt).getTime()) / 60_000
            const paid = paidMinutes(tab)
            const remaining = paid - elapsed
            const overdue = running && paid > 0 && remaining < 0
            const who = tab.notes || (tab.customer ? `${tab.customer.firstName} ${tab.customer.lastName ?? ''}`.trim() : 'Walk-in')
            const owing = Math.max(0, tab.total - tab.paid)
            return (
              <article key={tab.id} className={cn('flex flex-col border bg-card p-4 shadow-sm', overdue && 'border-destructive/60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">#{tab.orderNumber}{tab.notes && tab.customer ? ` · ${tab.customer.firstName}` : ''}</p>
                    <h3 className="truncate font-display text-lg font-semibold">{who}</h3>
                  </div>
                  <StatusPill tone={running ? (overdue ? 'danger' : 'secondary') : 'warning'}>{running ? (overdue ? 'Overdue' : 'Running') : 'Awaiting payment'}</StatusPill>
                </div>

                {running && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <LuClock3 className={cn('size-4', overdue ? 'text-destructive' : 'text-secondary')} />
                    <span className="font-semibold tabular-nums">{fmtMinutes(elapsed)}</span>
                    {paid > 0 && <span className={cn('text-xs', overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{overdue ? `over by ${fmtMinutes(-remaining)}` : `${fmtMinutes(remaining)} left of ${fmtMinutes(paid)}`}</span>}
                  </div>
                )}

                <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                  {tab.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{item.quantity} × {itemLabel(item)}{item.extendsItemId && <span className="ml-1.5 text-[10px] font-bold uppercase text-secondary">extension</span>}{item.addons.length > 0 && <span className="block truncate text-xs text-secondary">+ {item.addons.map((a) => a.addon.name).join(', ')}</span>}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{money(Number(item.unitPrice) * item.quantity)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">{running ? 'So far' : owing > 0.01 ? `${money(owing)} to collect` : 'Total'}</span>
                  <span className="text-lg font-bold tabular-nums">{money(tab.total)}</span>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {running && <ActionButton tone="secondary" icon={<LuTimerReset />} onClick={() => setExtending(tab)}>Extend</ActionButton>}
                  {running && <ActionButton tone="neutral" icon={<LuPlus />} onClick={() => onAddServices({ id: tab.id, orderNumber: tab.orderNumber, label: who })}>Add service</ActionButton>}
                  {running && <ActionButton tone="success" icon={<LuWallet />} loading={busyId === tab.id} onClick={() => void complete(tab)}>Complete &amp; pay</ActionButton>}
                  {!running && <ActionButton tone="success" icon={<LuWallet />} onClick={() => setManagingId(tab.id)}>Take payment</ActionButton>}
                  <ActionButton tone="neutral" icon={<LuReceiptText />} title="Manage, or cancel this service" onClick={() => setManagingId(tab.id)}>{running ? 'Manage' : 'Details'}</ActionButton>
                  <ActionButton tone="neutral" icon={<LuPrinter />} title="Receipt" onClick={() => setReceiptId(tab.id)} />
                </div>
              </article>
            )
          })}
        </div>
      )}

      {extending && <ExtendModal tab={extending} onClose={() => setExtending(null)} onDone={() => { setExtending(null); void load(true) }} />}
      {managingId && (
        <OrderSettlementPanel
          orderId={managingId}
          title={managing ? `Service #${managing.orderNumber}` : 'Service'}
          subtitle={managing?.notes ?? undefined}
          paymentMethods={methods}
          onClose={() => setManagingId(null)}
          onChanged={() => void load(true)}
        />
      )}
      {receiptId && <ReceiptPreviewModal orderId={receiptId} profile={profile as ReceiptProfile} onClose={() => setReceiptId(null)} />}
    </div>
  )
}

/** Extend a running service by more units of the same service and option. */
function ExtendModal({ tab, onClose, onDone }: { tab: ServiceTab; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  // Extensions attach to the line they extend, so only original lines are offered.
  const originals = tab.items.filter((i) => !i.extendsItemId && i.service)
  const [itemId, setItemId] = useState(originals[0]?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [saving, setSaving] = useState(false)
  const item = originals.find((i) => i.id === itemId)
  const extra = item ? unitMinutes(item) * quantity : 0

  async function save() {
    setSaving(true)
    try {
      await api(`/pos/orders/${tab.id}/extend`, { method: 'POST', body: JSON.stringify({ itemId, quantity }) })
      toast.success('Service extended')
      onDone()
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Could not extend'); setSaving(false) }
  }

  return (
    <ModalShell kicker={`Service #${tab.orderNumber}`} title="Extend" subtitle="Adds more of the same service to this tab, at the same price." onClose={onClose} size="sm"
      footer={<button type="button" disabled={!itemId || saving} onClick={() => void save()} className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50">{saving ? 'Extending…' : 'Extend'}</button>}>
      <div className="space-y-4 p-5">
        {originals.length > 1 && (
          <div className="space-y-1.5">
            {originals.map((i) => (
              <label key={i.id} className={cn('flex cursor-pointer items-center justify-between gap-3 border p-2.5 text-sm', itemId === i.id && 'border-secondary bg-secondary/10')}>
                <span className="flex items-center gap-2"><input type="radio" checked={itemId === i.id} onChange={() => setItemId(i.id)} className="accent-secondary" />{itemLabel(i)}</span>
                <span className="tabular-nums text-muted-foreground">{money(Number(i.unitPrice))}</span>
              </label>
            ))}
          </div>
        )}
        {originals.length === 1 && item && <p className="border bg-muted/40 p-2.5 text-sm font-medium">{itemLabel(item)} <span className="text-muted-foreground">at {money(Number(item.unitPrice))}</span></p>}
        <label className="block text-sm font-medium">More {item?.service?.unit.name ?? 'units'}
          <input type="number" min="1" max="999" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="input mt-1.5" />
        </label>
        {extra > 0 && <p className="text-xs text-muted-foreground">Adds {fmtMinutes(extra)} to the time paid for.</p>}
        {item && <p className="text-sm font-semibold">Adds {money(Number(item.unitPrice) * quantity)} to the bill.</p>}
      </div>
    </ModalShell>
  )
}
