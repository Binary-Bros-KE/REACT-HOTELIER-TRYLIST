import { taxCategoryText, type TaxMode, type TaxTreatment } from '@/lib/tax'

/**
 * The tax dropdown used wherever an item can override the business default
 * (menu items, services): "Business default" plus the four explicit choices.
 * One place so every form offers the same options and stores them the same way.
 */
export const TAX_CHOICES = [
  { key: 'INHERIT', label: 'Business default' },
  { key: 'STANDARD_INCLUSIVE', label: 'Standard — inclusive' },
  { key: 'STANDARD_EXCLUSIVE', label: 'Standard — exclusive' },
  { key: 'ZERO_RATED', label: 'Zero-rated (0%)' },
  { key: 'EXEMPT', label: 'Exempt' },
] as const
export type TaxChoice = (typeof TAX_CHOICES)[number]['key']
export type BizTax = { taxRate: string | null; taxMode: TaxMode; taxTreatment: TaxTreatment }

export function taxChoiceOf(item: { taxTreatment: TaxTreatment | null; taxMode: TaxMode | null }): TaxChoice {
  if (!item.taxTreatment) return 'INHERIT'
  if (item.taxTreatment === 'STANDARD') return item.taxMode === 'EXCLUSIVE' ? 'STANDARD_EXCLUSIVE' : 'STANDARD_INCLUSIVE'
  return item.taxTreatment
}

/** What the API stores for a choice (null = inherit the business default). */
export function taxPayload(choice: TaxChoice, rate: string) {
  const r = rate.trim() === '' ? null : Number(rate)
  switch (choice) {
    case 'STANDARD_INCLUSIVE': return { taxTreatment: 'STANDARD', taxMode: 'INCLUSIVE', taxRate: r }
    case 'STANDARD_EXCLUSIVE': return { taxTreatment: 'STANDARD', taxMode: 'EXCLUSIVE', taxRate: r }
    case 'ZERO_RATED': return { taxTreatment: 'ZERO_RATED', taxMode: null, taxRate: null }
    case 'EXEMPT': return { taxTreatment: 'EXEMPT', taxMode: null, taxRate: null }
    default: return { taxTreatment: null, taxMode: null, taxRate: null }
  }
}

export const describeBizTax = (biz: BizTax | null): string => (biz ? taxCategoryText(biz) : 'the property setting')

/** Label for an option in the dropdown, showing the effective rate for the standard ones. */
export function taxChoiceLabel(choice: (typeof TAX_CHOICES)[number], biz: BizTax | null): string {
  const rate = Number(biz?.taxRate ?? 16)
  if (choice.key === 'INHERIT') return `Business default (${describeBizTax(biz)})`
  return choice.key.startsWith('STANDARD') ? `${rate}% ${choice.label}` : choice.label
}
