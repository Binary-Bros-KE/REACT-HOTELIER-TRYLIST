/**
 * Mirror of NODE src/lib/folioAllocation.ts - keep the two in step.
 *
 * Each charged bill (a POS order billed to the room) is its own pot; every other
 * line (room nights, adjustments, breakfast, extras) is one "room & stay" pot. A
 * payment aimed at a bill or at the room fills that pot first; any excess and every
 * unaimed payment fill the pots oldest first.
 */
export const ROOM_POT = 'ROOM'

type Line = { id: string; source: string; sourceRefId?: string | null; createdAt: string; label: string }
type Payment = { amount: string | number; appliesToLineId?: string | null; appliesToRoom?: boolean }
export type Pot = { key: string; label: string; total: number; paid: number; owing: number; lineIds: string[]; orderId: string | null }

const round2 = (value: number) => Math.round(value * 100) / 100

export function folioPots<L extends Line>(lines: L[], payments: Payment[], lineTotal: (line: L) => number) {
  const pots = new Map<string, Pot & { firstAt: number }>()
  for (const line of lines) {
    const key = line.source === 'POS_ORDER' ? line.id : ROOM_POT
    const pot = pots.get(key) ?? { key, label: line.source === 'POS_ORDER' ? line.label : 'Room & stay charges', total: 0, paid: 0, owing: 0, lineIds: [], orderId: line.source === 'POS_ORDER' ? line.sourceRefId ?? null : null, firstAt: new Date(line.createdAt).getTime() }
    pot.total = round2(pot.total + lineTotal(line))
    pot.lineIds.push(line.id)
    pot.firstAt = Math.min(pot.firstAt, new Date(line.createdAt).getTime())
    pots.set(key, pot)
  }
  const owing = (pot: Pot) => Math.max(0, round2(pot.total - pot.paid))
  let pool = 0
  for (const payment of payments) {
    const amount = Number(payment.amount)
    const key = payment.appliesToLineId && pots.has(payment.appliesToLineId) ? payment.appliesToLineId : payment.appliesToRoom && pots.has(ROOM_POT) ? ROOM_POT : null
    if (!key) { pool = round2(pool + amount); continue }
    const pot = pots.get(key)!
    const take = Math.min(owing(pot), amount)
    pot.paid = round2(pot.paid + take)
    pool = round2(pool + amount - take)
  }
  const ordered = [...pots.values()].sort((a, b) => a.firstAt - b.firstAt)
  for (const pot of ordered) {
    if (pool <= 0.005) break
    const take = Math.min(owing(pot), pool)
    pot.paid = round2(pot.paid + take)
    pool = round2(pool - take)
  }
  for (const pot of ordered) pot.owing = owing(pot)
  // Each line's pot, so a line can show whether what it belongs to is cleared.
  const potOfLine = new Map<string, Pot>()
  for (const pot of ordered) for (const id of pot.lineIds) potOfLine.set(id, pot)
  return { pots: ordered as Pot[], potOfLine }
}
