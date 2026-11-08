import { useCallback, useEffect, useState } from 'react'
import { LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import { useToast } from '@/components/ui/Toast'
import { ActivityRow, AREA_LABELS, type ActivityEntry } from '@/components/activity/ActivityHistory'

type Employee = { id: string; firstName: string; lastName: string | null }
const PAGE_SIZE = 50

type DateMode = 'date' | 'range'
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

const dayStamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Who did what, across the property: voids, cancellations, adjustments, setting changes. */
export default function ActivityLog() {
  const toast = useToast()
  // Date: one business day, run on the property's shift hours (e.g. 10:00 to 10:00). Range: from - to.
  const [mode, setMode] = useState<DateMode>('date')
  const [startHour, setStartHour] = useState(0)
  const [date, setDate] = useState(() => dayStamp(new Date()))
  const [from, setFrom] = useState(() => dayStamp(new Date(Date.now() - 6 * 86_400_000)))
  const [to, setTo] = useState(() => dayStamp(new Date()))
  const [actorId, setActorId] = useState('')
  const [area, setArea] = useState('')
  const [search, setSearch] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ profile: { businessDayStartHour?: number } | null }>('/business-profile')
      .then((r) => {
        const h = r.profile?.businessDayStartHour ?? 0
        setStartHour(h)
        // Before the start hour it is still the previous business day.
        setDate(dayStamp(new Date(Date.now() - h * 3_600_000)))
      })
      .catch(() => {})
    api<{ employees: Employee[] }>('/employees').then((r) => setEmployees(r.employees)).catch(() => {})
  }, [])

  const load = useCallback(async (nextPage: number) => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) })
      if (mode === 'date') { if (date) query.set('date', date) }
      else {
        if (from) query.set('from', from)
        if (to) query.set('to', to)
      }
      if (actorId) query.set('actorId', actorId)
      if (area) query.set('area', area)
      if (search.trim()) query.set('search', search.trim())
      const response = await api<{ entries: ActivityEntry[]; hasMore: boolean }>(`/activity?${query}`)
      setEntries((current) => (nextPage === 1 ? response.entries : [...current, ...response.entries]))
      setHasMore(response.hasMore)
      setPage(nextPage)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load the activity log')
    } finally {
      setLoading(false)
    }
  }, [mode, date, from, to, actorId, area, search, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1), 300)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="System" title="Activity Log" />
      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">Who did what</h2>
            <p className="text-xs text-muted-foreground">Voids, cancellations, returns, stock changes, stay changes and more, newest first.</p>
          </div>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Period
            <div className="mt-1 flex border">
              {(['date', 'range'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-2 text-xs font-bold uppercase tracking-wider ${mode === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{m === 'date' ? 'Date' : 'Range'}</button>
              ))}
            </div>
          </div>
          {mode === 'date' ? (
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="input mt-1 block font-normal normal-case tracking-normal" />
              <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal">{startHour ? `${hourLabel(startHour)} to ${hourLabel(startHour)} next day` : 'Whole day'}</span>
            </label>
          ) : (
            <>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 block font-normal normal-case tracking-normal" /></label>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 block font-normal normal-case tracking-normal" /></label>
            </>
          )}
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Person
            <select value={actorId} onChange={(e) => setActorId(e.target.value)} className="input mt-1 block font-normal normal-case tracking-normal">
              <option value="">Everyone</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{`${e.firstName} ${e.lastName ?? ''}`.trim()}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Area
            <select value={area} onChange={(e) => setArea(e.target.value)} className="input mt-1 block font-normal normal-case tracking-normal">
              <option value="">All areas</option>
              {Object.entries(AREA_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="relative lg:w-64">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, invoice, stay, product…" className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
        </div>
        {loading && entries.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading activity…</div>
        ) : entries.length === 0 ? (
          <p className="p-16 text-center text-sm text-muted-foreground">Nothing recorded for this view.</p>
        ) : (
          <div>{entries.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}</div>
        )}
        {hasMore && (
          <div className="border-t p-3 text-center">
            <button type="button" disabled={loading} onClick={() => void load(page + 1)} className="inline-flex items-center gap-2 rounded-sm border px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-60">
              {loading && <LuLoaderCircle className="animate-spin" />} Load more
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
