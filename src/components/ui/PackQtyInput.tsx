/**
 * Quantity input/display helpers for products with a pack/container
 * conversion. Staff enter and read the pack label first (bottles, cans,
 * crates), while the system still stores the converted base stock amount.
 */

export function pluralizePackLabel(label: string, count: number): string {
  const trimmed = label.trim()
  if (!trimmed) return count === 1 ? 'pack' : 'packs'
  if (count === 1) return trimmed
  return trimmed.toLowerCase().endsWith('s') ? trimmed : `${trimmed}s`
}

const fmt = (value: number, digits = 3) =>
  value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: digits })

/** "10 Bottles" when pack-tracked, else "7,500 Millilitres". */
export function packAndUnit(qty: number, packSize: number, packLabel: string, unitName: string): string {
  if (packSize > 0) {
    const packs = +(qty / packSize).toFixed(2)
    return `${fmt(packs, 2)} ${pluralizePackLabel(packLabel, packs)}`
  }
  return `${fmt(qty)} ${unitName}`
}

/** Quiet base-unit hint for pack-tracked values, e.g. "7,500 Millilitres". */
export function packConversionHint(qty: number, packSize: number, unitName: string): string | null {
  if (packSize <= 0) return null
  return `${fmt(qty)} ${unitName}`
}

type Props = {
  value: string
  onChange: (value: string) => void
  packSize: number
  packLabel: string
  unitName: string
  autoFocus?: boolean
  required?: boolean
  allowNegative?: boolean
  max?: number
  className?: string
}

export default function PackQtyInput({ value, onChange, packSize, packLabel, unitName, autoFocus, required, allowNegative, max, className }: Props) {
  const numeric = Number(value)

  if (packSize > 0) {
    const packs = value ? +(numeric / packSize).toFixed(3) : NaN
    return (
      <div>
        <div className="flex items-center overflow-hidden rounded-sm border bg-background focus-within:ring-2 focus-within:ring-ring">
          <input
            required={required}
            autoFocus={autoFocus}
            type="number"
            min={allowNegative ? undefined : '0'}
            max={max != null ? max / packSize : undefined}
            step="0.001"
            value={Number.isNaN(packs) ? '' : packs}
            onChange={(e) => onChange(e.target.value ? String(+(Number(e.target.value) * packSize).toFixed(3)) : '')}
            className={className ? `${className} border-0 focus:ring-0` : 'input border-0 focus:ring-0'}
          />
          <span className="shrink-0 border-l px-2 text-xs font-medium text-muted-foreground">{pluralizePackLabel(packLabel, Number.isNaN(packs) ? 2 : packs)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{value ? `${fmt(numeric)} ${unitName}` : `Stored as ${unitName}`}</p>
      </div>
    )
  }

  return (
    <div>
      <input
        required={required}
        autoFocus={autoFocus}
        type="number"
        min={allowNegative ? undefined : '0'}
        max={max}
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? 'input'}
      />
    </div>
  )
}
