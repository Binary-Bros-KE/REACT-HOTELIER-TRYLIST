export type TaxMode = 'INCLUSIVE' | 'EXCLUSIVE'
export type TaxTreatment = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'

export type TaxInput = {
  taxRate?: string | number | null
  taxMode?: TaxMode | null
  taxTreatment?: TaxTreatment | null
}

export function taxLabel(tax: { rate: number; mode: TaxMode; treatment: TaxTreatment }) {
  if (tax.treatment === 'EXEMPT') return 'Exempt'
  if (tax.treatment === 'ZERO_RATED' || tax.rate <= 0) return 'Zero-rated (0%)'
  return `VAT ${tax.rate}% ${tax.mode === 'EXCLUSIVE' ? 'exclusive' : 'inclusive'}`
}

export function resolveTax(input: TaxInput, fallback?: TaxInput | null) {
  const treatment = input.taxTreatment ?? fallback?.taxTreatment ?? 'STANDARD'
  const mode = input.taxMode ?? fallback?.taxMode ?? 'INCLUSIVE'
  const rate = input.taxRate != null ? Number(input.taxRate) : fallback?.taxRate != null ? Number(fallback.taxRate) : 16
  return { treatment, mode, rate: treatment === 'STANDARD' ? rate : 0 }
}

export function taxCategoryText(input: TaxInput, fallback?: TaxInput | null) {
  return taxLabel(resolveTax(input, fallback))
}
