// Room pricing on the client — mirrors the server's lib/roomCharge.ts so the
// price shown while booking matches what lands on the folio.

export type RoomRateOption = { id: string; name: string; price: string | number; unit: { id: string; name: string } | null }

export type RatedRoom = {
  nightlyRate: string | number
  roomType: { name: string; rates?: RoomRateOption[]; priceUnit?: { id: string; name: string } | null }
}

const HOURLY = /\bhours?\b|\bhrs?\b/

export const isHourlyUnit = (unitName: string | null | undefined) => {
  const name = (unitName ?? '').toLowerCase()
  return HOURLY.test(name) && !/\b24\b/.test(name)
}

export const hasVariants = (room: RatedRoom) => (room.roomType.rates?.length ?? 0) > 0

/** Hours for an hourly unit, otherwise 24-hour days; at least 1 once the dates are valid, 0 if not. */
export function unitQuantity(unitName: string | null | undefined, checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return isHourlyUnit(unitName) ? Math.max(1, Math.ceil(ms / 3_600_000)) : Math.max(1, Math.ceil(ms / 86_400_000))
}

/** "per night" → "night", "Hour" → "hour". */
export const unitWord = (unitName: string | null | undefined) => (unitName ?? 'night').toLowerCase().replace(/^per\s+/, '')

export type RoomPricing = { unitPrice: number; unitName: string | null; quantity: number; total: number; rateName: string | null; hourly: boolean }

/**
 * The price of a stay. Returns null while a variant room has no variant picked
 * (the caller must force a choice); variant-less rooms use the room's own price.
 */
export function roomPricing(room: RatedRoom, rateId: string, checkIn: string, checkOut: string): RoomPricing | null {
  const rates = room.roomType.rates ?? []
  const rate = rates.length > 0 ? rates.find((r) => r.id === rateId) : undefined
  if (rates.length > 0 && !rate) return null
  const unitPrice = rate ? Number(rate.price) : Number(room.nightlyRate)
  const unitName = rate ? rate.unit?.name ?? null : room.roomType.priceUnit?.name ?? null
  const quantity = unitQuantity(unitName, checkIn, checkOut)
  return { unitPrice, unitName, quantity, total: unitPrice * quantity, rateName: rate?.name ?? null, hourly: isHourlyUnit(unitName) }
}

/** Date-only stays go as-is; date+time (hourly) values go as full ISO so the server sees the intended instant. */
export const toApiDate = (value: string) => (value.length > 10 ? new Date(value).toISOString() : value)

/** "From KSh X" / "KSh X / night" for room pickers. */
export function roomPriceHint(room: RatedRoom): string {
  const rates = room.roomType.rates ?? []
  if (rates.length > 0) {
    const min = Math.min(...rates.map((r) => Number(r.price)))
    return `${rates.length} rates · from KSh ${min.toLocaleString('en-KE')}`
  }
  const unit = room.roomType.priceUnit?.name
  return `KSh ${Number(room.nightlyRate).toLocaleString('en-KE')}${unit ? ` / ${unitWord(unit)}` : ''}`
}
