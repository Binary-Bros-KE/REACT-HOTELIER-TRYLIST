import { Suspense, lazy, useEffect, useState } from 'react'
import { LuLoaderCircle, LuPrinter } from 'react-icons/lu'
import { api } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import type { DocProfile, ReportDocData } from './pdf'

const DocumentViewer = lazy(() => import('./DocumentViewer'))

// Drop onto any /reports/* page's toolbar: pass the same cards/breakdown
// data already rendered on screen, built into a ReportDocData with
// buildReportSection (see pdf/ReportDocument.tsx for the shape). Fetches the
// business profile itself so every report page doesn't have to.
export default function PrintReportButton({ data, disabled, label = 'Print Report' }: { data: ReportDocData | null; disabled?: boolean; label?: string }) {
  const [profile, setProfile] = useState<DocProfile>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { api<{ profile: DocProfile }>('/business-profile').then((r) => setProfile(r.profile)).catch(() => {}) }, [])

  return (
    <>
      <ActionButton tone="neutral" icon={<LuPrinter />} disabled={disabled || !data} onClick={() => setOpen(true)}>{label}</ActionButton>
      {open && data && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-800/95 text-white"><LuLoaderCircle className="size-6 animate-spin" /></div>}>
          <DocumentViewer kind="report" data={data} profile={profile} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
