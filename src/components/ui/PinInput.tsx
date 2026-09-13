import type { CSSProperties } from 'react'

/**
 * A numeric PIN field — masked like a password visually, but deliberately
 * NOT `type="password"`. A PIN isn't a real account credential, and Chrome
 * doesn't know that: it offers to save it, then later flags it with "Check
 * your saved passwords" the moment a short numeric string matches its
 * breach list (which almost any 4-6 digit PIN eventually will). Masking via
 * `-webkit-text-security` instead keeps the same look without Chrome's
 * password manager ever getting involved.
 *
 * `-webkit-text-security` has no Firefox equivalent — there the PIN shows
 * in plain text while typing. Accepted trade-off for a short numeric PIN
 * (not a full password) on what is, in practice, an all-Chrome POS fleet.
 */
export default function PinInput({
  value,
  onChange,
  required,
  minLength = 4,
  maxLength = 8,
  placeholder,
  autoFocus,
  className,
  id,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  minLength?: number
  maxLength?: number
  placeholder?: string
  autoFocus?: boolean
  className?: string
  id?: string
}) {
  return (
    <input
      id={id}
      required={required}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      // Not a name/tag React's CSSProperties knows about — real, Chrome/
      // Safari-only property, hence the cast.
      style={{ WebkitTextSecurity: 'disc' } as CSSProperties}
      minLength={minLength}
      maxLength={maxLength}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, maxLength))}
      className={className}
    />
  )
}
