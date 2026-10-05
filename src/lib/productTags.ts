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
