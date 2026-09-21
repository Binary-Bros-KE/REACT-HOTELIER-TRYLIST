import type { TaxMode, TaxTreatment } from '@/lib/tax'

/** Shapes and money rules of the Services till, shared by the page, the options picker and checkout. */
export type PosVariant = { id: string; name: string; price: number; durationMinutes: number | null }
export type PosServiceAddon = { id: string; name: string; price: number; serviceCategoryId: string | null }
export type PosService = {
  id: string
  name: string
  price: number
  unit: { name: string }
  category: { id: string; name: string }
  durationMinutes: number | null
  variants: PosVariant[]
  tax: { rate: number; mode: TaxMode; treatment: TaxTreatment }
}
export type CartLine = {
  key: string
  service: PosService
  variant: PosVariant | null
  addons: { addon: PosServiceAddon; quantity: number }[]
  quantity: number
  /** Blank = sell at the list price. A different number is a price override and needs a reason. */
  overridePrice: string
  overrideReason: string
}

/** The price list says: the option's price when one is chosen, else the service's. */
export const listPrice = (line: Pick<CartLine, 'service' | 'variant'>) => line.variant?.price ?? line.service.price
/** The price actually charged per unit (override, else list). Add-ons are priced on top. */
export const chargedPrice = (line: CartLine) => (line.overridePrice.trim() !== '' && Number.isFinite(Number(line.overridePrice)) ? Number(line.overridePrice) : listPrice(line))
export const isOverridden = (line: CartLine) => line.overridePrice.trim() !== '' && Math.abs(chargedPrice(line) - listPrice(line)) > 0.004
export const addonsPerUnit = (line: CartLine) => line.addons.reduce((sum, a) => sum + a.addon.price * a.quantity, 0)
export const lineTotal = (line: CartLine) => (chargedPrice(line) + addonsPerUnit(line)) * line.quantity

/** Same service + option + add-ons (and no price change) is the same line. */
export const lineKey = (serviceId: string, variantId: string | null, addons: { addon: { id: string }; quantity: number }[]) =>
  `${serviceId}::${variantId ?? ''}::${addons.map((a) => `${a.addon.id}x${a.quantity}`).sort().join(',')}`

/** A line as the API's /pos/retail-orders expects it. */
export function linePayload(line: CartLine) {
  return {
    serviceId: line.service.id,
    variantId: line.variant?.id,
    quantity: line.quantity,
    addons: line.addons.map((a) => ({ addonId: a.addon.id, quantity: a.quantity })),
    ...(isOverridden(line) ? { unitPrice: chargedPrice(line), overrideReason: line.overrideReason.trim() } : {}),
  }
}

/** The add-ons that may be offered with a service: tied to its category, or open to all. */
export const addonsFor = (service: PosService, all: PosServiceAddon[]) => all.filter((a) => !a.serviceCategoryId || a.serviceCategoryId === service.category.id)

/** Whether tapping the service must open the options step rather than dropping it straight on the sale. */
export const needsOptions = (service: PosService, all: PosServiceAddon[]) => service.variants.length > 0 || addonsFor(service, all).length > 0
