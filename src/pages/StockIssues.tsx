import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuCircleAlert, LuLoaderCircle, LuMapPin } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import PageBanner from '@/components/ui/PageBanner'

// Stock that isn't taken off per dish. The storekeeper issues it to a kitchen
// (ISSUE_ONLY lines are used up on issue, PERIODIC_COUNT lines go to the
// kitchen's shelf), and the kitchen counts what's left at the close of a batch.
// Which products work this way is each product's own Stock tracking setting.

type Location = { id: string; name: string; type?: string }
type IssueRow = { id: string; name: string; unit: string; trackingMode: 'ISSUE_ONLY' | 'PERIODIC_COUNT'; onHand: number }
type CountRow = { id: string; name: string; unit: string; onHand: number }
type CountResult = { productId: string; name: string; expected: number; counted: number; used: number; found: number }

const MODE_LABEL: Record<IssueRow['trackingMode'], string> = {
  ISSUE_ONLY: 'Issued and used up',
  PERIODIC_COUNT: 'Counted at close',
}

export default function StockIssues() {
  const toast = useToast()
  const [tab, setTab] = useState<'issue' | 'count'>('issue')
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ locations: Location[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
  }, [])

  return (
    <div className="dashboard-square mx-auto max-w-5xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Inventory" title="Issues & Counts" />

      {error && <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <div className="mt-6 flex gap-1 border bg-card p-1 shadow-sm">
        {(['issue', 'count'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-1.5 text-xs font-bold uppercase tracking-wider', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {t === 'issue' ? 'Issue to kitchen' : 'Kitchen count'}
          </button>
        ))}
      </div>

      {tab === 'issue'
        ? <IssuePanel locations={locations} onError={setError} onDone={() => toast.success('Issued.')} />
        : <CountPanel locations={locations} onError={setError} onDone={() => toast.success('Count saved.')} />}
    </div>
  )
}

function LocationPicker({ label, value, onChange, locations, exclude }: { label: string; value: string; onChange: (id: string) => void; locations: Location[]; exclude?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <span className="flex items-center gap-1"><LuMapPin className="size-3.5" /> {label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input min-w-56 font-normal normal-case tracking-normal">
        <option value="">Choose a location</option>
        {locations.filter((l) => l.id !== exclude).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  )
}

function IssuePanel({ locations, onError, onDone }: { locations: Location[]; onError: (m: string) => void; onDone: () => void }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [rows, setRows] = useState<IssueRow[]>([])
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!fromId && locations.length) setFromId(locations.find((l) => l.type === 'STORE')?.id ?? '')
  }, [locations, fromId])

  const load = useCallback(async () => {
    if (!fromId) { setRows([]); return }
    setLoading(true)
    try {
      const r = await api<{ products: IssueRow[] }>(`/stock-issues/issue-sheet?fromLocationId=${fromId}`)
      setRows(r.products)
      setQuantities({})
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load the issue list')
    } finally {
      setLoading(false)
    }
  }, [fromId, onError])

  useEffect(() => { void load() }, [load])

  const lines = useMemo(() => rows
    .map((r) => ({ productId: r.id, quantity: Number(quantities[r.id]) }))
    .filter((l) => l.quantity > 0), [rows, quantities])

  async function submit() {
    if (!toId) { onError('Choose the kitchen to issue to'); return }
    if (lines.length === 0) { onError('Enter a quantity for at least one product'); return }
    setSaving(true)
    onError('')
    try {
      await api('/stock-issues/issue', { method: 'POST', body: JSON.stringify({ fromLocationId: fromId, toLocationId: toId, note: note.trim() || undefined, lines }) })
      setQuantities({})
      setNote('')
      onDone()
      void load()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not issue these items')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 overflow-hidden border bg-card shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b p-4">
        <LocationPicker label="Issue from" value={fromId} onChange={setFromId} locations={locations} exclude={toId} />
        <LocationPicker label="Issue to" value={toId} onChange={setToId} locations={locations} exclude={fromId} />
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Kitchen morning batch" className="input font-normal normal-case tracking-normal" />
        </label>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">Nothing is set up to be issued from this location. Set a product's Stock tracking to “Issued” or “Counted at close” on the Products page.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
              <tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">How it's tracked</th><th className="px-4 py-2.5 text-right">On hand</th><th className="px-4 py-2.5 text-right">Issue</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{MODE_LABEL[r.trackingMode]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.onHand}</td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" min="0" step="0.001" value={quantities[r.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [r.id]: e.target.value }))} className="input w-28 text-right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t p-4">
        <p className="text-xs text-muted-foreground">{lines.length} product{lines.length === 1 ? '' : 's'} to issue</p>
        <Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !toId}>
          {saving ? 'Issuing…' : 'Issue to kitchen'}
        </Button>
      </div>
    </section>
  )
}

function CountPanel({ locations, onError, onDone }: { locations: Location[]; onError: (m: string) => void; onDone: () => void }) {
  const [locationId, setLocationId] = useState('')
  const [rows, setRows] = useState<CountRow[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<CountResult[] | null>(null)

  const load = useCallback(async () => {
    if (!locationId) { setRows([]); return }
    setLoading(true)
    try {
      const r = await api<{ products: CountRow[] }>(`/stock-issues/count-sheet?locationId=${locationId}`)
      setRows(r.products)
      setCounts({})
      setResults(null)
      onError('')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load the count list')
    } finally {
      setLoading(false)
    }
  }, [locationId, onError])

  useEffect(() => { void load() }, [load])

  const lines = useMemo(() => rows
    .filter((r) => counts[r.id] !== undefined && counts[r.id] !== '')
    .map((r) => ({ productId: r.id, counted: Number(counts[r.id]) })), [rows, counts])

  async function submit() {
    setSaving(true)
    onError('')
    try {
      const r = await api<{ lines: CountResult[] }>('/stock-issues/count', { method: 'POST', body: JSON.stringify({ locationId, note: note.trim() || undefined, lines }) })
      setResults(r.lines)
      onDone()
      void load().then(() => setResults(r.lines))
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not save the count')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 overflow-hidden border bg-card shadow-sm">
      <div className="flex flex-wrap items-end gap-4 border-b p-4">
        <LocationPicker label="Kitchen" value={locationId} onChange={setLocationId} locations={locations} />
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Oil finished, discarded" className="input font-normal normal-case tracking-normal" />
        </label>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">No products are counted at this kitchen. Set a product's Stock tracking to “Counted at close” on the Products page.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
              <tr><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Expected</th><th className="px-4 py-2.5 text-right">Counted now</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.name} <span className="text-xs text-muted-foreground">{r.unit}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.onHand}</td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" min="0" step="0.001" placeholder="Leave blank to skip" value={counts[r.id] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [r.id]: e.target.value }))} className="input w-40 text-right" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div className="border-t p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Last count</p>
          <ul className="space-y-1 text-sm">
            {results.map((r) => (
              <li key={r.productId} className="flex justify-between gap-3">
                <span>{r.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.used > 0 ? `used ${r.used}` : r.found > 0 ? `found ${r.found} more` : 'matches the books'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t p-4">
        <p className="text-xs text-muted-foreground">{lines.length} product{lines.length === 1 ? '' : 's'} counted</p>
        <Button onClick={() => void submit()} disabled={saving || lines.length === 0 || !locationId}>
          {saving ? 'Saving…' : 'Save count'}
        </Button>
      </div>
    </section>
  )
}
