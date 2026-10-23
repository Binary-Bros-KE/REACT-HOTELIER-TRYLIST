// Operations a product can belong to. A product carries several (a soda is
// both BAR and RESTAURANT). Tags never come from stock, so a product with no
// stock still shows under the operation it belongs to.
export const PRODUCT_TAG_OPTIONS = [
  { value: 'BAR', label: 'Bar' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'STORE', label: 'Store' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping' },
  { value: 'RECEPTION', label: 'Reception' },
  { value: 'CAFE', label: 'Cafe' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'GYM', label: 'Gym' },
  { value: 'SPA', label: 'Spa' },
  { value: 'SHOP', label: 'Shop' },
] as const

export function productTagLabel(tag: string) {
  return PRODUCT_TAG_OPTIONS.find((option) => option.value === tag)?.label ?? tag
}

const PRODUCT_TAG_VALUES = new Set<string>(PRODUCT_TAG_OPTIONS.map((option) => option.value))

/** The operations this property actually runs: one option per type among its active
 * locations, named after the first such location (e.g. "Main Bar" for BAR), so no
 * Shop or Spa is offered to a hotel without one. */
export function operationOptionsFromLocations(locations: { name: string; type?: string | null; isActive?: boolean }[]) {
  const seen = new Set<string>()
  return locations
    .filter((location) => location.isActive !== false && location.type)
    .map((location) => ({ location, tag: location.type!.toUpperCase() }))
    .filter(({ tag }) => PRODUCT_TAG_VALUES.has(tag))
    .filter(({ tag }) => {
      if (seen.has(tag)) return false
      seen.add(tag)
      return true
    })
    .map(({ location, tag }) => ({ value: tag, label: location.name, hint: productTagLabel(tag) }))
}
