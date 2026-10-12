import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  LuArrowDownLeft,
  LuArrowUpRight,
  LuCircleAlert,
  LuHistory,
  LuLoaderCircle,
  LuMapPin,
  LuReceiptText,
  LuUserRound,
  LuX,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { packAndUnit } from '@/components/ui/PackQtyInput'

export type MovementType =
  | 'OPENING_STOCK' | 'PURCHASE' | 'SALE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RETURN'
  | 'DAMAGE_LOSS' | 'ADJUSTMENT' | 'ROOM_CONSUMPTION' | 'BORROWED_IN' | 'RETURNED_BORROWED_STOCK'
  | 'LENT_OUT' | 'LOAN_RETURNED' | 'ISSUE' | 'USAGE'

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  OPENING_STOCK: 'Opening stock', PURCHASE: 'Purchase', SALE: 'Sale', TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out', RETURN: 'Return', DAMAGE_LOSS: 'Damage / loss', ADJUSTMENT: 'Adjustment',
  ROOM_CONSUMPTION: 'Room consumption', BORROWED_IN: 'Borrowed in', RETURNED_BORROWED_STOCK: 'Returned borrowed',
  LENT_OUT: 'Lent out', LOAN_RETURNED: 'Loan returned', ISSUE: 'Issued', USAGE: 'Used',
}

type Movement = {
  id: string
  type: MovementType
  location: { id: string; name: string }
  quantity: string
  balanceBefore: string | null
  balanceAfter: string | null
  unitCost: string | null
  value: string | null
  note: string | null
  occurredAt: string
  employee: { firstName: string; lastName: string } | null
  // Set on goods-received movements: the purchase the stock arrived against.
  purchase: { purchaseId: string; purchaseNo: string; supplierName: string | null; receiptNo: string } | null
}

export type HistoryProduct = {
  id: string
  name: string
  unit: string
  packSize: string | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
}

const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const kes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

/** Every stock movement of one product, newest first, one card per movement. */
export default function ProductHistoryModal({ product, onClose }: { product: HistoryProduct; onClose: () => void }) {
  const [movements, setMovements] = useState<Movement[] | null>(null)
  const [error, setError] = useState('')
  const [locationId, setLocationId] = useState('')

  useEffect(() => {
    let live = true
    api<{ movements: Movement[] }>(`/products/${product.id}/movements`)
      .then((r) => { if (live) setMovements(r.movements) })
      .catch((cause) => { if (live) { setError(cause instanceof Error ? cause.message : 'Could not load the stock history'); setMovements([]) } })
    return () => { live = false }
  }, [product.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const locations = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of movements ?? []) seen.set(m.location.id, m.location.name)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [movements])
  const shown = (movements ?? []).filter((m) => !locationId || m.location.id === locationId)

  const packSize = Number(product.packSize) || 0
  const unitName = product.packUnit?.name ?? product.unit
  const qty = (value: number) => packAndUnit(value, packSize, product.packLabel ?? '', unitName)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-2xl flex-col border-2 border-foreground/25 bg-card shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="flex items-start justify-between gap-3 border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-secondary"><LuHistory /> Stock history</p>
            <h2 className="mt-1 truncate font-display text-2xl font-semibold">{product.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {movements === null ? 'Loading…' : `${shown.length} movement${shown.length === 1 ? '' : 's'}${locationId ? '' : ' across all locations'}`}
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="bg-black p-2 text-white transition hover:bg-black/80"><LuX className="size-4" /></button>
        </div>

        {locations.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b px-6 py-3">
            {[{ id: '', name: 'All locations' }, ...locations].map((l) => (
              <button
                key={l.id || 'all'}
                type="button"
                onClick={() => setLocationId(l.id)}
                className={cn('border px-3 py-1.5 text-xs font-semibold transition', locationId === l.id ? 'border-secondary bg-secondary text-secondary-foreground' : 'hover:bg-muted')}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {error && <p className="flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</p>}
          {movements === null && <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading history…</p>}
          {movements !== null && !error && shown.length === 0 && <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">No stock movements recorded yet.</p>}

          {shown.map((m) => {
            const amount = Number(m.quantity)
            const incoming = amount > 0
            const unitCost = m.unitCost != null ? Number(m.unitCost) : null
            const value = m.value != null ? Number(m.value) : null
            // A receipt's default note ("Goods receipt GRN-…") says nothing the purchase line doesn't.
            const note = m.note && !(m.purchase && m.note === `Goods receipt ${m.purchase.receiptNo}`) ? m.note : null
            return (
              <article key={m.id} className={cn('border-l-4 border bg-background p-4', incoming ? 'border-l-success' : amount < 0 ? 'border-l-destructive' : 'border-l-muted-foreground/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center', incoming ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                      {incoming ? <LuArrowDownLeft /> : <LuArrowUpRight />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{MOVEMENT_LABELS[m.type] ?? m.type}</p>
                      <p className="text-xs text-muted-foreground">{when(m.occurredAt)}</p>
                    </div>
                  </div>
                  <p className={cn('shrink-0 text-lg font-bold tabular-nums', incoming ? 'text-success' : amount < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {incoming ? '+' : ''}{qty(amount)}
                  </p>
                </div>

                {m.purchase && (
                  <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border border-secondary/30 bg-secondary/5 px-3 py-2 text-xs">
                    <LuReceiptText className="text-secondary" />
                    <span className="font-bold text-secondary">{m.purchase.purchaseNo}</span>
                    {m.purchase.supplierName && <span className="font-semibold">{m.purchase.supplierName}</span>}
                    <span className="text-muted-foreground">· delivery {m.purchase.receiptNo}</span>
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-3">
                  <Detail icon={<LuMapPin />}>{m.location.name}</Detail>
                  {m.balanceBefore != null && m.balanceAfter != null && (
                    <Detail>Balance {qty(Number(m.balanceBefore))} → <strong className="text-foreground">{qty(Number(m.balanceAfter))}</strong></Detail>
                  )}
                  {m.employee && <Detail icon={<LuUserRound />}>{m.employee.firstName} {m.employee.lastName}</Detail>}
                  {unitCost != null && unitCost > 0 && <Detail>Unit cost {kes(unitCost)}</Detail>}
                  {value != null && value !== 0 && <Detail>Value {kes(Math.abs(value))}</Detail>}
                </div>

                {note && <p className="mt-2 border-t pt-2 text-xs italic text-muted-foreground">{note}</p>}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Detail({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <span className="flex min-w-0 items-center gap-1.5">{icon}<span className="truncate">{children}</span></span>
}
