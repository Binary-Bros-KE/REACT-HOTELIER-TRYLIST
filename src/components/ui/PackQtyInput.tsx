/**
 * A quantity input for a pack-tracked product (bar bottles, kegs, cases) —
 * the main field stays in the product's real tracked unit (e.g. ml), with a
 * small paired "or enter N bottles" field beside it that converts either
 * way. Renders as a single plain input when the product isn't pack-tracked
 * (packSize <= 0). Used everywhere a quantity gets typed against a product:
 * opening stock, manual adjustments, single/batch transfers, goods receiving.
 */

export function pluralizePackLabel(label: string, count: number): string {
  const trimmed = label.trim()
  if (!trimmed) return count === 1 ? 'pack' : 'packs'
  if (count === 1) return trimmed
  return trimmed.toLowerCase().endsWith('s') ? trimmed : `${trimmed}s`
}

/** "7,500 ml (10 bottles)" when pack-tracked, else "7,500 Each". */
export function packAndUnit(qty: number, packSize: number, packLabel: string, unitName: string): string {
  const base = `${qty.toLocaleString()} ${unitName}`
  if (packSize > 0) {
    const packs = +(qty / packSize).toFixed(2)
    return `${base} (${packs.toLocaleString()} ${pluralizePackLabel(packLabel, packs)})`
  }
  return base
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
  const packs = value ? +(Number(value) / packSize).toFixed(3) : NaN
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
      {packSize > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{unitName} — or enter</span>
          <input
            type="number"
            step="0.001"
            max={max != null ? max / packSize : undefined}
            className="input h-8 w-24 text-xs"
            value={Number.isNaN(packs) ? '' : packs}
            onChange={(e) => onChange(e.target.value ? String(+(Number(e.target.value) * packSize).toFixed(3)) : '')}
          />
          <span>{pluralizePackLabel(packLabel, Number.isNaN(packs) ? 2 : packs)}</span>
        </div>
      )}
    </div>
  )
}
