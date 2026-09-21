import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LuLoaderCircle, LuShieldCheck } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import PageBanner from '@/components/ui/PageBanner'

type LicenseStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED'
type License = {
  id: string
  licenseKey: string
  licenseStatus: LicenseStatus
  subscriptionPlan: string
  subscriptionStart: string
  nextDueDate: string | null
  maxBranches: number
  maxUsers: number
  maxDevices: number
  lastLicenseCheck: string | null
  isActive: boolean
}

const APP_VERSION = '1.0.0'
const licenseStatusStyles: Record<LicenseStatus, string> = {
  TRIAL: 'border-warning/70 text-warning',
  ACTIVE: 'border-success/70 text-success',
  EXPIRED: 'border-destructive/70 text-destructive',
  SUSPENDED: 'border-destructive/70 text-destructive',
}
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'

function LicenseAndSubscription() {
  const toast = useToast()
  const [license, setLicense] = useState<License | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await api<{ license: License }>('/tenant/license')
        if (!cancelled) setLicense(response.license)
      } catch (cause) {
        if (!cancelled) toast.error(cause instanceof Error ? cause.message : 'Could not load license information')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [toast])

  return (
    <section className="border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-9 items-center justify-center bg-secondary/10 text-secondary"><LuShieldCheck className="size-4" /></span>
        <div className="border-l-4 border-accent pl-3">
          <h2 className="font-semibold text-foreground">License &amp; Subscription</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Read-only. Managed by TANZ for this workspace.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <LuLoaderCircle className="animate-spin" /> Loading license information…
        </div>
      ) : !license ? (
        <p className="mt-6 text-sm text-muted-foreground">License information is unavailable.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile label="Tenant ID" value={license.id} mono />
          <Tile label="License Key" value={license.licenseKey} mono />
          <Tile label="License Status">
            <span className={cn('keep-round inline-flex border border-dashed px-2.5 py-0.5 text-xs font-semibold', licenseStatusStyles[license.licenseStatus])}>
              {license.licenseStatus[0] + license.licenseStatus.slice(1).toLowerCase()}
            </span>
          </Tile>
          <Tile label="Subscription Plan">
            <span className="keep-round inline-flex border border-dashed border-secondary/70 px-2.5 py-0.5 text-xs font-semibold text-secondary">{license.subscriptionPlan}</span>
          </Tile>
          <Tile label="Subscription Start" value={formatDate(license.subscriptionStart)} />
          <Tile label="Next Due Date" value={formatDate(license.nextDueDate)} />
          <Tile label="Max Branches" value={String(license.maxBranches)} />
          <Tile label="Max Users" value={String(license.maxUsers)} />
          <Tile label="Max Devices" value={String(license.maxDevices)} />
          <Tile label="App Version" value={APP_VERSION} />
          <Tile label="Last License Check" value={formatDateTime(license.lastLicenseCheck)} />
          <Tile label="Suspended">
            <span className={cn('keep-round inline-flex border border-dashed px-2.5 py-0.5 text-xs font-semibold', license.isActive ? 'border-muted-foreground/50 text-muted-foreground' : 'border-destructive/70 text-destructive')}>
              {license.isActive ? 'No' : 'Yes'}
            </span>
          </Tile>
        </div>
      )}
    </section>
  )
}

function Tile({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: ReactNode }) {
  return (
    <div className="rounded-sm bg-muted/60 p-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn('mt-1.5 text-sm font-semibold text-foreground', mono && 'truncate font-mono text-xs font-medium')} title={mono ? value : undefined}>
        {children ?? value}
      </div>
    </div>
  )
}

export default function CafeSettings() {
  return (
    <div className="dashboard-square mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="System" title="Settings" />
      <p className="mb-6 mt-5 max-w-2xl text-sm text-muted-foreground">License and subscription details for this workspace. Looking for the receipt printer? That moved to Sales ▸ Printer Settings — every device sets its own, so it's no longer tucked away here.</p>

      <LicenseAndSubscription />
    </div>
  )
}
