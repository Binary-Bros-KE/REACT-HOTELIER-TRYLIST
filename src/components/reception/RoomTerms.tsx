import { cn } from '@/lib/utils'

/** How a room is being sold. PAID is the default; COMPLIMENTARY gives it free.
 * A paid room may carry a discount — a percentage of the room charges, or a
 * fixed amount off the whole stay. */
export type RoomTerms = {
  roomSaleType: 'PAID' | 'COMPLIMENTARY'
  complimentaryReason: string
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT'
  discountValue: string
  discountReason: string
}

export const defaultTerms = (): RoomTerms => ({ roomSaleType: 'PAID', complimentaryReason: '', discountType: 'NONE', discountValue: '', discountReason: '' })

/** Terms as the API wants them. */
export function termsPayload(t: RoomTerms) {
  if (t.roomSaleType === 'COMPLIMENTARY') return { roomSaleType: 'COMPLIMENTARY' as const, complimentaryReason: t.complimentaryReason.trim() || undefined }
  const discounted = t.discountType !== 'NONE' && Number(t.discountValue) > 0
  return {
    roomSaleType: 'PAID' as const,
    ...(discounted ? { discountType: t.discountType, discountValue: Number(t.discountValue), discountReason: t.discountReason.trim() || undefined } : {}),
  }
}

/** Terms from a saved reservation, to edit them. */
export function termsFromReservation(r: { roomSaleType?: 'PAID' | 'COMPLIMENTARY'; complimentaryReason?: string | null; discountType?: 'PERCENT' | 'AMOUNT' | null; discountValue?: string | number; discountReason?: string | null }): RoomTerms {
  return {
    roomSaleType: r.roomSaleType ?? 'PAID',
    complimentaryReason: r.complimentaryReason ?? '',
    discountType: r.discountType ?? 'NONE',
    discountValue: r.discountType && Number(r.discountValue) > 0 ? String(Number(r.discountValue)) : '',
    discountReason: r.discountReason ?? '',
  }
}

/** How much a set of terms takes off a room total (the whole total when complimentary). */
export function termsDiscount(t: RoomTerms, roomTotal: number): number {
  if (roomTotal <= 0) return 0
  if (t.roomSaleType === 'COMPLIMENTARY') return roomTotal
  const value = Number(t.discountValue)
  if (t.discountType === 'PERCENT' && value > 0) return Math.round(roomTotal * Math.min(value, 100)) / 100
  if (t.discountType === 'AMOUNT' && value > 0) return Math.min(value, roomTotal)
  return 0
}

export function termsInvalid(t: RoomTerms): string | null {
  if (t.roomSaleType === 'PAID' && t.discountType === 'PERCENT' && Number(t.discountValue) > 100) return 'A percentage discount can\'t exceed 100%'
  return null
}

const seg = (active: boolean, tone: 'secondary' | 'accent' = 'secondary') =>
  cn('px-3 py-2 text-xs font-bold uppercase tracking-wider transition', active ? (tone === 'accent' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground') : 'bg-card hover:bg-muted')

export default function RoomTermsFields({ value, onChange, roomTotal }: { value: RoomTerms; onChange: (next: RoomTerms) => void; roomTotal?: number }) {
  const set = (patch: Partial<RoomTerms>) => onChange({ ...value, ...patch })
  const off = roomTotal != null ? termsDiscount(value, roomTotal) : 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 border-2 border-foreground/20">
        <button type="button" onClick={() => set({ roomSaleType: 'PAID' })} className={seg(value.roomSaleType === 'PAID')}>Paid room</button>
        <button type="button" onClick={() => set({ roomSaleType: 'COMPLIMENTARY' })} className={seg(value.roomSaleType === 'COMPLIMENTARY', 'accent')}>Complimentary</button>
      </div>

      {value.roomSaleType === 'COMPLIMENTARY' ? (
        <label className="block text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span>
          <input className="input mt-1.5" value={value.complimentaryReason} onChange={(e) => set({ complimentaryReason: e.target.value })} placeholder="e.g. Owner's guest, staff, apology" maxLength={255} />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Discount
            <select className="input mt-1.5" value={value.discountType} onChange={(e) => set({ discountType: e.target.value as RoomTerms['discountType'] })}>
              <option value="NONE">No discount</option>
              <option value="PERCENT">Percentage off</option>
              <option value="AMOUNT">Fixed amount off the stay</option>
            </select>
          </label>
          {value.discountType !== 'NONE' && (
            <label className="block text-sm font-medium">{value.discountType === 'PERCENT' ? 'Percent (%)' : 'Amount (KSh)'}
              <input type="number" min="0" max={value.discountType === 'PERCENT' ? 100 : undefined} step="0.01" className="input mt-1.5" value={value.discountValue} onChange={(e) => set({ discountValue: e.target.value })} />
            </label>
          )}
          {value.discountType !== 'NONE' && (
            <label className="block text-sm font-medium sm:col-span-2">Reason <span className="font-normal text-muted-foreground">(optional)</span>
              <input className="input mt-1.5" value={value.discountReason} onChange={(e) => set({ discountReason: e.target.value })} placeholder="e.g. Loyal guest, corporate rate" maxLength={255} />
            </label>
          )}
        </div>
      )}
      {termsInvalid(value) && <p className="text-xs font-semibold text-destructive">{termsInvalid(value)}</p>}
      {roomTotal != null && off > 0 && <p className="text-xs text-muted-foreground">Takes KSh {off.toLocaleString('en-KE', { maximumFractionDigits: 2 })} off the room charges.</p>}
    </div>
  )
}

/** The two things a checkout on credit needs: why, and when payment is expected. */
export function CreditFields({ reason, expectedAt, onReason, onExpectedAt }: { reason: string; expectedAt: string; onReason: (v: string) => void; onExpectedAt: (v: string) => void }) {
  return (
    <div className="space-y-3 border-2 border-warning/50 bg-warning/5 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-warning">Completing on credit</p>
      <label className="block text-sm font-medium">Reason for credit *
        <input className="input mt-1.5" value={reason} onChange={(e) => onReason(e.target.value)} placeholder="e.g. Company will be invoiced" maxLength={255} />
      </label>
      <label className="block text-sm font-medium">Expected payment date *
        <input type="date" className="input mt-1.5" value={expectedAt} onChange={(e) => onExpectedAt(e.target.value)} />
      </label>
    </div>
  )
}
