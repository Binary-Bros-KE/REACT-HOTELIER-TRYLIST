import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LuBedDouble, LuCircleAlert, LuLoaderCircle, LuMapPin, LuPencil, LuPlus, LuSettings2, LuTrash2, LuTriangleAlert, LuWrench } from 'react-icons/lu'
import { api } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import ModalShell from '@/components/ui/ModalShell'
import PageBanner from '@/components/ui/PageBanner'
import SearchableSelect from '@/components/ui/SearchableSelect'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { useAppSelector } from '@/store/hooks'
import { cn } from '@/lib/utils'

type Condition = 'WORKING' | 'NEEDS_REPAIR' | 'UNDER_REPAIR' | 'BROKEN' | 'MISSING'
const CONDITIONS: { key: Condition; label: string }[] = [
  { key: 'WORKING', label: 'Working' },
  { key: 'NEEDS_REPAIR', label: 'Needs repair' },
  { key: 'UNDER_REPAIR', label: 'Being repaired' },
  { key: 'BROKEN', label: 'Broken' },
  { key: 'MISSING', label: 'Missing' },
]
const conditionLabel = (c: Condition) => CONDITIONS.find((x) => x.key === c)?.label ?? c

type FixedAsset = {
  id: string; assetNo: string; name: string; category: string | null; unit: string; quantity: number
  condition: Condition; affectedQuantity: number | null; conditionNote: string | null; conditionUpdatedAt: string | null; conditionUpdatedBy: string | null
}
type ConsumableStatus = 'OK' | 'EMPTY' | 'EXPIRED' | 'EXPIRING_SOON' | 'OVER_MAX' | 'NO_MAX'
type Consumable = {
  productId: string; name: string; unit: string; max: number | null; onHand: number; firstPlacedAt: string | null; lastReplacedAt: string | null
  shelfLifeDays: number | null; expiresAt: string | null; daysToExpiry: number | null; status: ConsumableStatus; needed: number
}
type Contents = {
  target: { kind: 'room' | 'location'; id: string; label: string; sub: string | null }
  fixedAssets: FixedAsset[]
  consumables: Consumable[]
  issues: { kind: 'ASSET' | 'CONSUMABLE'; severity: 'high' | 'medium'; title: string; detail: string }[]
  summary: { fixedAssets: number; notWorking: number; consumableLines: number; expired: number; expiringSoon: number; empty: number; issues: number }
}
type RoomOption = { id: string; number: string; name: string | null; roomType: { id: string; name: string } }
type LocationOption = { id: string; name: string; type?: string | null }

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')
const num = (n: number) => n.toLocaleString('en-KE', { maximumFractionDigits: 3 })

export default function RoomContents() {
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  const isSupervisor = Boolean(user?.isSupervisor) || user?.role?.name === 'Super Admin'
  const [mode, setMode] = useState<'room' | 'location'>('room')
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [targetId, setTargetId] = useState('')
  const [contents, setContents] = useState<Contents | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState<FixedAsset | null>(null)
  const [limitsOpen, setLimitsOpen] = useState(false)

  useEffect(() => {
    api<{ rooms: RoomOption[] }>('/rooms/rooms').then((r) => setRooms(r.rooms)).catch(() => {})
    api<{ locations: LocationOption[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!targetId) { setContents(null); return }
    setLoading(true); setError('')
    try {
      setContents(await api<Contents>(`/assets/contents?${mode === 'room' ? 'roomId' : 'locationId'}=${encodeURIComponent(targetId)}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load contents')
    } finally {
      setLoading(false)
    }
  }, [mode, targetId])
  useEffect(() => { void load() }, [load])

  const options = useMemo(() => (mode === 'room'
    ? rooms.map((r) => ({ value: r.id, label: `Room ${r.number}${r.name ? ` - ${r.name}` : ''}`, hint: r.roomType.name }))
    : locations.map((l) => ({ value: l.id, label: l.name, hint: l.type ?? undefined }))), [mode, rooms, locations])

  const s = contents?.summary
  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Housekeeping" title="Room & Location Contents" />

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-sm border bg-card p-4 shadow-sm">
        <div className="inline-flex rounded-sm border p-0.5">
          {(['room', 'location'] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setTargetId('') }} className={cn('inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {m === 'room' ? <LuBedDouble /> : <LuMapPin />} {m === 'room' ? 'Room' : 'Location'}
            </button>
          ))}
        </div>
        <div className="min-w-64 flex-1 sm:max-w-md">
          <SearchableSelect value={targetId} onChange={setTargetId} placeholder={mode === 'room' ? 'Choose a room' : 'Choose a location'} searchPlaceholder="Search..." emptyText="Nothing found" options={options} />
        </div>
        {isSupervisor && (
          <button onClick={() => setLimitsOpen(true)} className="ml-auto inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-semibold hover:bg-muted"><LuSettings2 /> Room supply limits</button>
        )}
      </div>

      {error && <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}
      {!targetId && <p className="mt-10 text-center text-sm text-muted-foreground">Choose a room or location to see everything that should be there and what needs attention.</p>}
      {loading && <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading...</div>}

      {contents && s && !loading && (
        <>
          <div className="mt-6">
            <h2 className="font-display text-2xl font-semibold">{contents.target.label}</h2>
            {contents.target.sub && <p className="text-sm text-muted-foreground">{contents.target.sub}</p>}
          </div>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="Fixed assets" value={String(s.fixedAssets)} icon={<LuWrench />} hint={s.notWorking ? `${s.notWorking} not working` : 'All working'} tone={s.notWorking ? 'danger' : undefined} />
            {contents.target.kind === 'room' && (
              <>
                <StatCard index={1} label="Consumables tracked" value={String(s.consumableLines)} icon={<LuSettings2 />} hint={s.empty ? `${s.empty} empty` : 'Stocked'} tone={s.empty ? 'warn' : undefined} />
                <StatCard index={2} label="Expired" value={String(s.expired)} icon={<LuTriangleAlert />} tone={s.expired ? 'danger' : undefined} hint={s.expiringSoon ? `${s.expiringSoon} expiring within a week` : 'Nothing expiring soon'} />
              </>
            )}
            <StatCard index={3} label="Needs attention" value={String(s.issues)} icon={<LuCircleAlert />} tone={s.issues ? 'warn' : 'success'} hint={s.issues ? 'See the list below' : 'Nothing to fix'} />
          </section>

          {contents.issues.length > 0 && (
            <section className="mt-5 overflow-hidden rounded-sm border border-warning/40 bg-warning/5">
              <header className="border-b border-warning/30 px-4 py-2.5 text-sm font-semibold text-warning">Needs attention ({contents.issues.length})</header>
              <ul className="divide-y">
                {contents.issues.map((i, idx) => (
                  <li key={idx} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase', i.severity === 'high' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning')}>{i.kind === 'ASSET' ? 'Fixed' : 'Consumable'}</span>
                    <span className="font-semibold">{i.title}</span>
                    <span className="text-muted-foreground">{i.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Section title="Fixed assets" note="Furniture, appliances and linen recorded here, with their condition. Report a problem the moment you notice it.">
            {contents.fixedAssets.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No fixed assets recorded for this {contents.target.kind}. Add them under Assets.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5">Condition</th><th className="px-4 py-2.5">Last update</th><th className="px-4 py-2.5"></th></tr></thead>
                  <tbody>
                    {contents.fixedAssets.map((a) => (
                      <tr key={a.id} className={cn('border-t', a.condition !== 'WORKING' && 'bg-destructive/5')}>
                        <td className="px-4 py-3"><span className="font-semibold">{a.name}</span><span className="block text-xs text-muted-foreground">{a.assetNo}</span></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{a.category ?? '-'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{num(a.quantity)} {a.unit}</td>
                        <td className="px-4 py-3"><ConditionBadge condition={a.condition} />{a.affectedQuantity != null && <span className="ml-2 text-xs text-muted-foreground">{num(a.affectedQuantity)} of {num(a.quantity)}</span>}{a.conditionNote && <span className="block text-xs text-muted-foreground">{a.conditionNote}</span>}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{a.conditionUpdatedAt ? `${date(a.conditionUpdatedAt)}${a.conditionUpdatedBy ? ` - ${a.conditionUpdatedBy}` : ''}` : '-'}</td>
                        <td className="px-4 py-3 text-right"><ActionButton tone="neutral" icon={<LuPencil />} title="Update condition" onClick={() => setReporting(a)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {contents.target.kind === 'room' && (
            <Section title="Consumables" note="What the room holds against its maximum. Expiry is the date last replaced plus the product's shelf life.">
              {contents.consumables.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No consumables are set up for this room type. A supervisor can set them under Room supply limits.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5 text-right">In room</th><th className="px-4 py-2.5 text-right">Max</th><th className="px-4 py-2.5">First placed</th><th className="px-4 py-2.5">Last replaced</th><th className="px-4 py-2.5">Expires</th><th className="px-4 py-2.5">Status</th></tr></thead>
                    <tbody>
                      {contents.consumables.map((c) => (
                        <tr key={c.productId} className={cn('border-t', (c.status === 'EXPIRED' || c.status === 'OVER_MAX') && 'bg-destructive/5')}>
                          <td className="px-4 py-3 font-semibold">{c.name}<span className="block text-xs font-normal text-muted-foreground">{c.unit}</span></td>
                          <td className="px-4 py-3 text-right tabular-nums">{num(c.onHand)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{c.max == null ? '-' : num(c.max)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{date(c.firstPlacedAt)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{date(c.lastReplacedAt)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{c.shelfLifeDays ? (c.expiresAt ? date(c.expiresAt) : '-') : 'No shelf life'}</td>
                          <td className="px-4 py-3"><ConsumableBadge status={c.status} days={c.daysToExpiry} needed={c.needed} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {reporting && <ConditionModal asset={reporting} onClose={() => setReporting(null)} onSaved={() => { setReporting(null); toast.success('Condition updated'); void load() }} />}
      {limitsOpen && <LimitsModal onClose={() => setLimitsOpen(false)} onSaved={() => { setLimitsOpen(false); toast.success('Room supply limits saved'); void load() }} />}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
      <header className="border-b border-l-4 border-l-accent p-4"><h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>{note && <p className="text-xs text-muted-foreground">{note}</p>}</header>
      {children}
    </section>
  )
}

function ConditionBadge({ condition }: { condition: Condition }) {
  const tone = condition === 'WORKING' ? 'border-success/30 bg-success/10 text-success' : condition === 'BROKEN' || condition === 'MISSING' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning'
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tone)}>{conditionLabel(condition)}</span>
}

function ConsumableBadge({ status, days, needed }: { status: ConsumableStatus; days: number | null; needed: number }) {
  const map: Record<ConsumableStatus, { text: string; tone: string }> = {
    OK: { text: needed > 0 ? `Below max (${num(needed)} to add)` : 'Full', tone: 'border-success/30 bg-success/10 text-success' },
    EMPTY: { text: 'Empty', tone: 'border-warning/30 bg-warning/10 text-warning' },
    EXPIRED: { text: 'Expired', tone: 'border-destructive/30 bg-destructive/10 text-destructive' },
    EXPIRING_SOON: { text: `Expires in ${days ?? 0}d`, tone: 'border-warning/30 bg-warning/10 text-warning' },
    OVER_MAX: { text: 'Over the maximum', tone: 'border-destructive/30 bg-destructive/10 text-destructive' },
    NO_MAX: { text: 'No maximum set', tone: 'border-muted bg-muted text-muted-foreground' },
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', map[status].tone)}>{map[status].text}</span>
}

function ConditionModal({ asset, onClose, onSaved }: { asset: FixedAsset; onClose: () => void; onSaved: () => void }) {
  const [condition, setCondition] = useState<Condition>(asset.condition)
  const [affected, setAffected] = useState(asset.affectedQuantity != null ? String(asset.affectedQuantity) : '')
  const [note, setNote] = useState(asset.conditionNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setSaving(true); setError('')
    try {
      await api(`/assets/${asset.id}/condition`, { method: 'PATCH', body: JSON.stringify({ condition, affectedQuantity: condition !== 'WORKING' && affected ? Number(affected) : undefined, note: note.trim() || undefined }) })
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update') } finally { setSaving(false) }
  }
  return (
    <ModalShell kicker="Fixed asset" title={asset.name} subtitle={`${num(asset.quantity)} ${asset.unit} on record`} onClose={onClose} size="md"
      footer={<ActionButton tone="success" loading={saving} onClick={() => void save()}>Save condition</ActionButton>}>
      <div className="space-y-4 p-5">
        {error && <div className="flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}
        <label className="block text-sm font-medium">Condition
          <select className="input mt-1.5" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>{CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </label>
        {condition !== 'WORKING' && asset.quantity > 1 && (
          <label className="block text-sm font-medium">How many of the {num(asset.quantity)} are affected? <span className="font-normal text-muted-foreground">(blank = all)</span>
            <input type="number" min="0" step="0.001" max={asset.quantity} className="input mt-1.5" value={affected} onChange={(e) => setAffected(e.target.value)} />
          </label>
        )}
        {condition !== 'WORKING' && (
          <label className="block text-sm font-medium">What is wrong?
            <textarea rows={2} className="input mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Screen cracked, remote missing" />
          </label>
        )}
      </div>
    </ModalShell>
  )
}

type LimitRow = { productId: string; name: string; unit: string; max: string }
function LimitsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [types, setTypes] = useState<{ id: string; name: string }[]>([])
  const [roomTypeId, setRoomTypeId] = useState('')
  const [rows, setRows] = useState<LimitRow[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; unit: string }[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api<{ types: { id: string; name: string }[] }>('/rooms/types').then((r) => setTypes(r.types)).catch(() => {}) }, [])
  useEffect(() => {
    if (!roomTypeId) { setRows([]); return }
    api<{ standards: { productId: string; quantity: string | number; product: { name: string; unit: string } }[] }>(`/room-consumables/standards?roomTypeId=${roomTypeId}`)
      .then((r) => setRows(r.standards.map((s) => ({ productId: s.productId, name: s.product.name, unit: s.product.unit, max: String(Number(s.quantity)) }))))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load'))
  }, [roomTypeId])
  useEffect(() => {
    const t = window.setTimeout(() => {
      api<{ products: { id: string; name: string; unit: string }[] }>(`/products?active=true${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`).then((r) => setProducts(r.products.slice(0, 50))).catch(() => {})
    }, 250)
    return () => window.clearTimeout(t)
  }, [search])

  const usedIds = new Set(rows.map((r) => r.productId))
  async function save() {
    setSaving(true); setError('')
    try {
      await api(`/room-consumables/standards/${roomTypeId}`, { method: 'PUT', body: JSON.stringify({ items: rows.map((r) => ({ productId: r.productId, quantity: Number(r.max) })) }) })
      onSaved()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save') } finally { setSaving(false) }
  }
  const valid = roomTypeId && rows.every((r) => Number(r.max) > 0)
  return (
    <ModalShell kicker="Supervisor" title="Room supply limits" subtitle="The most of each consumable a room of this type may hold. Housekeeping can never replace above it." onClose={onClose} size="xl"
      footer={<ActionButton tone="success" loading={saving} disabled={!valid} onClick={() => void save()}>Save limits</ActionButton>}>
      <div className="space-y-4 p-5">
        {error && <div className="flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert /> {error}</div>}
        <label className="block text-sm font-medium">Room type
          <select className="input mt-1.5 max-w-sm" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}><option value="">Choose a room type</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        {roomTypeId && (
          <>
            <div className="overflow-x-auto border">
              <table className="w-full text-left text-sm">
                <thead className="bg-primary text-xs uppercase text-primary-foreground"><tr><th className="px-4 py-2.5">Consumable</th><th className="px-4 py-2.5 w-40">Maximum per room</th><th className="w-12"></th></tr></thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.productId}>
                      <td className="px-4 py-2.5 font-semibold">{r.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{r.unit}</span></td>
                      <td className="px-4 py-2.5"><input type="number" min="0" step="0.001" className="input h-9" value={r.max} onChange={(e) => setRows((cur) => cur.map((x) => (x.productId === r.productId ? { ...x, max: e.target.value } : x)))} /></td>
                      <td className="px-2"><ActionButton tone="neutral" icon={<LuTrash2 />} title="Remove" onClick={() => setRows((cur) => cur.filter((x) => x.productId !== r.productId))} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">No consumables set for this room type yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Add a consumable</p>
              <input className="input max-w-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sugar, tea bags, soap..." />
              <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {products.filter((p) => !usedIds.has(p.id)).map((p) => (
                  <button key={p.id} type="button" onClick={() => setRows((cur) => [...cur, { productId: p.id, name: p.name, unit: p.unit, max: '' }])} className="inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs font-semibold hover:bg-muted"><LuPlus className="size-3" /> {p.name}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}
