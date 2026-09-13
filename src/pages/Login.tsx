import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import { LuCircleAlert, LuIdCard, LuLoaderCircle, LuLock } from 'react-icons/lu'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { login } from '@/store/authSlice'
import { fetchTenantContext } from '@/store/tenantSlice'
import { useToast } from '@/components/ui/Toast'
import { getErrorMessage } from '@/lib/errors'
import { resolveLogoUrl } from '@/lib/api'
import PinInput from '@/components/ui/PinInput'

const businessTypeLabel: Record<string, string> = {
  HOTEL: 'Hotel',
  MOTEL: 'Motel',
  CAFE: 'Cafe',
  RESTAURANT: 'Restaurant',
}

// "Tue, 26/09" — weekday + day/month, no year.
function shortDateLabel(d = new Date()): string {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${weekday}, ${dd}/${mm}`
}

// The signature mesh — a faint 36px grid over the brand colour. Shared by
// the desktop side panel and the mobile header.
const MESH_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
  backgroundSize: '36px 36px',
}

export default function Login() {
  const dispatch = useAppDispatch()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAppSelector((s) => s.auth.user)
  const tenant = useAppSelector((s) => s.tenant)
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (user) {
    const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await dispatch(login({ employeeCode, pin })).unwrap()
      void dispatch(fetchTenantContext())
      const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/'
      navigate(redirectTo, { replace: true })
    } catch (cause) {
      const message = getErrorMessage(cause, 'Incorrect employee code or PIN')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      {/* Mobile identity header — the desktop side panel is hidden below lg,
          so the mobile view gets its own branded band. Fills the safe area
          so the brand colour runs up behind the status bar. */}
      <div
        className="relative overflow-hidden bg-primary px-6 pb-9 text-white lg:hidden"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.75rem)' }}
      >
        <div className="pointer-events-none absolute inset-0" style={MESH_STYLE} />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-12 -top-14 size-40 rounded-full border border-white/15" />
          <div className="absolute -bottom-16 left-8 size-32 rounded-full border border-white/10" />
        </div>

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src={resolveLogoUrl(tenant.logoUrl) ?? '/PRIMARY.png'}
              alt={tenant.shortName ?? 'Hotelier'}
              className="size-9 shrink-0 rounded-sm bg-white/10 object-contain p-1"
            />
            <p className="font-display text-sm font-bold leading-tight text-white">
              {tenant.shortName ?? 'HOTELIER'}
            </p>
          </div>
          <p className="shrink-0 pt-1 text-xs font-semibold text-white/80">{shortDateLabel()}</p>
        </div>

        <h1 className="relative mt-7 font-display text-[26px] font-extrabold leading-[1.15]">
          Welcome back.
        </h1>
      </div>

      <div className="relative hidden w-1/2 overflow-hidden bg-secondary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0" style={MESH_STYLE} />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 -top-16 size-64 rounded-full border border-white/20" />
          <div className="absolute right-10 top-24 size-32 rounded-full border border-white/20" />
          <div className="absolute -bottom-24 left-1/4 size-96 rounded-full border border-white/15" />
          <div className="absolute bottom-16 right-16 size-16 rounded-full bg-white/10" />
          <div className="absolute left-16 top-1/2 size-6 rounded-full bg-white/25" />
        </div>

        <div className="relative flex items-center gap-3">
          <img src={resolveLogoUrl(tenant.logoUrl) ?? '/PRIMARY.png'} alt={tenant.shortName ?? 'Hotelier'} className="size-10 rounded-sm object-contain" />
          <div>
            <p className="font-display text-base font-semibold leading-none text-white">{tenant.shortName ?? 'HOTELIER'}</p>
            <p className="mt-1 text-[11px] leading-none text-white/70">Hotel Management by TANZ</p>
          </div>
        </div>

        <div className="relative">
          <p className="text-sm font-medium text-white/80">Nice to see you again</p>
          <h1 className="mt-2 font-display text-[5rem] font-semibold leading-none text-white">
            {businessTypeLabel[tenant.businessType] ?? 'Hotel'}
            <br />
            Management
          </h1>
          <div className="mt-4 h-1 w-12 rounded-full bg-white/50" />
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/80">
            Sign in to manage reception, housekeeping, sales, and everything else running across your property today.
          </p>
        </div>
      </div>

      <div className="flex w-full flex-1 items-center justify-center bg-background px-6 py-10 lg:w-1/2 lg:py-12">
        {/* max-w-sm centred in the column; the orange accent overhangs a few
            px on the left but is decorative and doesn't shift the card. */}
        <div className="relative w-full max-w-sm">
          {/* Decorative node-line, sitting to the left of the card. */}
          <div className="pointer-events-none absolute -left-8 top-6 bottom-6 hidden sm:block" aria-hidden="true">
            <span className="absolute -left-[3px] -top-1.5 block size-3 rounded-full bg-secondary" />
            <span className="absolute top-0 bottom-0 left-0 w-px bg-secondary/40" />
            <span className="absolute -left-[3px] -bottom-1.5 block size-3 rounded-full bg-secondary" />
          </div>

          {/* Tilted accent behind the card's top-left corner, in the Hotelier favicon's orange. */}
          <div className="pointer-events-none absolute -left-3 -top-3 size-16 rotate-12 rounded-lg bg-[#f2921a] shadow-lg" aria-hidden="true" />

          <div className="relative rounded-lg border bg-card p-7 shadow-xl sm:p-8">
            <p className="text-sm font-semibold text-secondary">Login Account</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-foreground">Sign in to your workspace</h2>
            <p className="mt-2 text-sm text-muted-foreground">Enter your employee code and PIN to continue.</p>

            {error && (
              <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                <LuCircleAlert />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Employee Code
                <span className="relative mt-1.5 block">
                  <LuIdCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    required
                    type="text"
                    autoComplete="username"
                    placeholder="e.g. EMP-0007"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className="input pl-9!"
                  />
                </span>
              </label>
              <label className="block text-sm font-medium">
                PIN
                <span className="relative mt-1.5 block">
                  <LuLock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <PinInput required placeholder="Enter your PIN" value={pin} onChange={setPin} className="input pl-9!" />
                </span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-secondary py-2.5 text-sm font-semibold text-secondary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving && <LuLoaderCircle className="animate-spin" />}
                Sign In
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
