import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { pdf } from '@react-pdf/renderer'
import {
  LuChevronLeft,
  LuChevronRight,
  LuDownload,
  LuLoaderCircle,
  LuPrinter,
  LuX,
  LuZoomIn,
  LuZoomOut,
} from 'react-icons/lu'
import { buildDocument, documentMeta } from './pdf'
import type { DocData, DocKind, DocProfile } from './pdf'

type Props = {
  kind: DocKind
  data: DocData
  profile: DocProfile
  onClose: () => void
}

const MIN_ZOOM = 40
const MAX_ZOOM = 200
const STEP = 15

function countPages(pdfText: string): number {
  const byCount = pdfText.match(/\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/)
  if (byCount) return Math.max(1, Number(byCount[1]))
  const byType = pdfText.match(/\/Type\s*\/Page\b(?!s)/g)
  return byType ? Math.max(1, byType.length) : 1
}

export default function DocumentViewer({ kind, data, profile, onClose }: Props) {
  const { title, fileName } = documentMeta(kind, data)
  const [url, setUrl] = useState<string | null>(null)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [error, setError] = useState('')
  const printFrame = useRef<HTMLIFrameElement | null>(null)
  // Payments on a commercial document carry only the id of who took them;
  // look the names up once so the payments table can show "Received by".
  const [employeeNames, setEmployeeNames] = useState<Map<string, string> | null>(null)
  useEffect(() => {
    if (kind !== 'commercial-document') return
    api<{ employees: { id: string; firstName: string; lastName: string | null }[] }>('/employees')
      .then((r) => setEmployeeNames(new Map(r.employees.map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()]))))
      .catch(() => setEmployeeNames(new Map()))
  }, [kind])
  const viewData = useMemo<DocData>(() => {
    if (kind !== 'commercial-document' || !employeeNames) return data
    const doc = data as DocData & { payments?: { createdBy?: string | null }[] }
    if (!doc.payments) return data
    return { ...doc, payments: doc.payments.map((p) => ({ ...p, receivedBy: p.createdBy ? employeeNames.get(p.createdBy) ?? null : null })) } as DocData
  }, [kind, data, employeeNames])

  useEffect(() => {
    let revoked: string | null = null
    let cancelled = false
    setError('')
    setUrl(null)
    ;(async () => {
      try {
        const blob = await pdf(buildDocument(kind, viewData, profile)).toBlob()
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        revoked = objectUrl
        try { setPages(countPages(await blob.text())) } catch { setPages(1) }
        setUrl(objectUrl)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not render this document')
      }
    })()
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [kind, viewData, profile])

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const doPrint = useCallback(() => {
    if (!url) return
    // A throwaway iframe pointed at the raw blob (no #fragment) prints most
    // reliably across browsers — contentWindow.print() on the visible viewer
    // iframe is blocked by the PDF plugin in several of them.
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.src = url
    frame.onload = () => {
      try {
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch {
        window.open(url, '_blank')
      }
    }
    document.body.appendChild(frame)
    printFrame.current?.remove()
    printFrame.current = frame
  }, [url])

  const doDownload = useCallback(() => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [url, fileName])

  useEffect(() => () => { printFrame.current?.remove() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') setZoom((z) => clampZoom(z + STEP))
      else if (e.key === '-') setZoom((z) => clampZoom(z - STEP))
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(pages, p + 1))
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pages])

  // Chrome's PDF viewer only reads #zoom / #page on load, so remount the
  // iframe (via key) whenever they change — the blob URL stays valid.
  const frameSrc = url ? `${url}#toolbar=0&navpanes=0&statusbar=0&view=FitH&pagemode=none&zoom=${zoom}&page=${page}` : ''

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-800/95 backdrop-blur-sm">
      <header className="flex items-center gap-3 border-b border-black/20 bg-card px-4 py-2.5 text-foreground">
        <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold">{title}</p>

        <div className="flex items-center gap-1 rounded-sm border bg-background px-1 py-0.5">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded-sm p-1.5 hover:bg-muted disabled:opacity-30" title="Previous page"><LuChevronLeft className="size-4" /></button>
          <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">{page} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="rounded-sm p-1.5 hover:bg-muted disabled:opacity-30" title="Next page"><LuChevronRight className="size-4" /></button>
        </div>

        <div className="flex items-center gap-1 rounded-sm border bg-background px-1 py-0.5">
          <button onClick={() => setZoom((z) => clampZoom(z - STEP))} disabled={zoom <= MIN_ZOOM} className="rounded-sm p-1.5 hover:bg-muted disabled:opacity-30" title="Zoom out"><LuZoomOut className="size-4" /></button>
          <button onClick={() => setZoom(100)} className="min-w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground" title="Reset zoom">{zoom}%</button>
          <button onClick={() => setZoom((z) => clampZoom(z + STEP))} disabled={zoom >= MAX_ZOOM} className="rounded-sm p-1.5 hover:bg-muted disabled:opacity-30" title="Zoom in"><LuZoomIn className="size-4" /></button>
        </div>

        <button onClick={doPrint} disabled={!url} className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          <LuPrinter className="size-3.5" /> Print
        </button>
        <button onClick={doDownload} disabled={!url} className="inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
          <LuDownload className="size-3.5" /> Download
        </button>
        <button onClick={onClose} className="ml-1 inline-flex size-8 items-center justify-center rounded-sm bg-foreground text-background hover:opacity-90" title="Close (Esc)">
          <LuX className="size-4" />
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/80">
            <LuX className="size-6 text-destructive" />
            {error}
          </div>
        ) : !url ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/80">
            <LuLoaderCircle className="size-5 animate-spin" /> Rendering document…
          </div>
        ) : (
          <iframe key={`${zoom}-${page}`} title={title} src={frameSrc} className="h-full w-full border-0 bg-neutral-700" />
        )}
      </div>
    </div>
  )
}
