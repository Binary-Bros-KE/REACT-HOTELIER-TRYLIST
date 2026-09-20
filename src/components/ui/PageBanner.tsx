import type { ReactNode } from 'react'
import { LuBuilding2, LuUserRound } from 'react-icons/lu'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAppSelector } from '@/store/hooks'

/**
 * The "paper" page banner used by Point of Sale: kicker + title on the left;
 * business name, signed-in employee and any `children` (e.g. a location
 * picker) on the right.
 */
export default function PageBanner({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user)
  const [businessName, setBusinessName] = useState('')
  useEffect(() => {
    api<{ profile: { businessName: string } | null }>('/business-profile').then((r) => setBusinessName(r.profile?.businessName ?? '')).catch(() => {})
  }, [])
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -bottom-2 left-3 right-1 top-2 rotate-[0.6deg] border border-black/10 bg-white/70" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-2.5 -top-2.5 size-12 rotate-12 bg-[#f2921a] shadow-lg" aria-hidden="true" />
      <div
        className="relative flex flex-wrap items-center justify-between gap-2.5 overflow-hidden border border-black/10 bg-[#faf7f0] px-4 py-3 text-slate-800 shadow-[0_1px_1px_rgba(2,6,23,0.05),0_3px_5px_rgba(2,6,23,0.06),0_12px_22px_-8px_rgba(2,6,23,0.18)] sm:gap-3 sm:px-5 sm:py-4"
        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(2,6,23,0.055) 28px)' }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{kicker}</p>
          <h1 className="mt-0.5 font-display text-sm font-semibold text-slate-900 sm:mt-1 sm:text-2xl">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600 sm:gap-4">
          <span className="hidden items-center gap-1.5 sm:flex"><LuBuilding2 className="size-3.5" /> {businessName || '—'}</span>
          <span className="flex items-center gap-1.5"><LuUserRound className="size-3.5" /> {user ? `${user.firstName} ${user.lastName}` : '—'}</span>
          {children}
        </div>
      </div>
    </div>
  )
}
