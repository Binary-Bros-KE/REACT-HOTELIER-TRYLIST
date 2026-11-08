import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// One fetch per session, shared by every customer form. The server enforces the rule
// either way (lib/customerRules in NODE); this only sets the field's label and checks.
let cached: Promise<boolean> | null = null
const load = () => (cached ??= api<{ profile: { requireCustomerPhone?: boolean } | null }>('/business-profile')
  .then((r) => Boolean(r.profile?.requireCustomerPhone))
  .catch(() => { cached = null; return false }))

/** Forget the cached value - after the Super Admin flips the setting. */
export function resetCustomerPhoneRequired() { cached = null }

/** Whether this property requires a real phone number on customers (Settings ▸ Customers). */
export function useCustomerPhoneRequired() {
  const [required, setRequired] = useState(false)
  useEffect(() => {
    let alive = true
    void load().then((value) => { if (alive) setRequired(value) })
    return () => { alive = false }
  }, [])
  return required
}
