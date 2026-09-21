import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { LuCircleAlert, LuCircleCheck, LuLoaderCircle, LuLock, LuPackageCheck, LuPencil, LuPlus, LuRotateCcw, LuSearch, LuTrash2, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'
import { useAppSelector } from '@/store/hooks'

const date = () => new Date().toISOString().slice(0, 10)

type Room = { id: string; number: string }
type LostFoundItem = {
  id: string
  itemNo: string
  itemName: string
  description: string | null
  room: { id: string; number: string } | null
  locationNote: string | null
  foundAt: string
  foundByEmployee: { id: string; firstName: string; lastName: string } | null
  status: 'UNCLAIMED' | 'COLLECTED'
  collectedByName: string | null
  collectedByContact: string | null
  collectedAt: string | null
  collectedByEmployee: { id: string; firstName: string; lastName: string } | null
  notes: string | null
}

type ItemForm = { itemName: string; description: string; roomId: string; locationNote: string; foundAt: string; notes: string }
const emptyForm: ItemForm = { itemName: '', description: '', roomId: '', locationNote: '', foundAt: date(), notes: '' }

export default function LostAndFound() {
  const toast = useToast()
  const currentUser = useAppSelector((s) => s.auth.user)
  const [items, setItems] = useState<LostFoundItem[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [unclaimedCount, setUnclaimedCount] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'UNCLAIMED' | 'COLLECTED' | 'ALL'>('UNCLAIMED')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<ItemForm>(emptyForm)
  const [editing, setEditing] = useState<LostFoundItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [collecting, setCollecting] = useState<LostFoundItem | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ rooms: Room[] }>('/rooms/rooms').then((r) => setRooms(r.rooms)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ status: statusFilter })
      if (search.trim()) query.set('search', search.trim())
      const response = await api<{ items: LostFoundItem[]; summary: { unclaimed: number } }>(`/lost-found?${query}`)
      setItems(response.items)
      setUnclaimedCount(response.summary.unclaimed)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load lost & found items'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(item: LostFoundItem) {
    setEditing(item)
    setForm({
      itemName: item.itemName,
      description: item.description ?? '',
      roomId: item.room?.id ?? '',
      locationNote: item.locationNote ?? '',
      foundAt: item.foundAt.slice(0, 10),
      notes: item.notes ?? '',
    })
    setShowForm(true)
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        itemName: form.itemName,
        description: form.description || undefined,
        roomId: form.roomId || undefined,
        locationNote: form.locationNote || undefined,
        foundAt: form.foundAt,
        notes: form.notes || undefined,
      }
      await api(editing ? `/lost-found/${editing.id}` : '/lost-found', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      toast.success(editing ? 'Item updated.' : 'Item logged.')
      toast.success(editing ? 'Item updated.' : 'Item logged.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save item'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function reopenItem(item: LostFoundItem) {
    if (!window.confirm(`Mark "${item.itemName}" as unclaimed again?`)) return
    try {
      await api(`/lost-found/${item.id}/reopen`, { method: 'PATCH' })
      toast.success('Item reopened.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reopen item')
    }
  }

  async function deleteItem(item: LostFoundItem) {
    if (!window.confirm(`Delete "${item.itemName}" from the log?`)) return
    try {
      await api(`/lost-found/${item.id}`, { method: 'DELETE' })
      toast.success('Item deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete item')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Housekeeping" title="Lost & Found" />

      {error && <Msg error text={error} />}

      <StatCard
        tone="warn"
        className="mt-6 sm:w-72"
        icon={<LuPackageCheck />}
        label="Awaiting collection"
        value={`${unclaimedCount} item${unclaimedCount === 1 ? '' : 's'}`}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <label className="relative min-w-56 flex-1">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, description, claimant…" className="w-full border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <div className="flex border bg-card shadow-sm">
          {(['UNCLAIMED', 'COLLECTED', 'ALL'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn('px-4 py-2.5 text-xs font-bold uppercase tracking-wider', statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {s === 'UNCLAIMED' ? 'Unclaimed' : s === 'COLLECTED' ? 'Collected' : 'All'}
            </button>
          ))}
        </div>
        <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate} className="self-center">Log found item</ActionButton>
      </div>

      <div className="mt-5 overflow-hidden border bg-card shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-sm text-muted-foreground"><LuLoaderCircle className="mx-auto animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs font-bold uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Found</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y [&>tr:nth-child(even)]:bg-muted/30">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{item.itemName}</p>
                      <p className="text-xs text-muted-foreground">{item.itemNo}{item.description ? ` · ${item.description}` : ''}</p>
                      {item.status === 'COLLECTED' && (
                        <p className="mt-1 text-xs text-success">
                          Collected by {item.collectedByName}{item.collectedByContact ? ` (${item.collectedByContact})` : ''} on {item.collectedAt ? new Date(item.collectedAt).toLocaleDateString() : ''}
                          {item.collectedByEmployee ? ` · handled by ${item.collectedByEmployee.firstName} ${item.collectedByEmployee.lastName}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {new Date(item.foundAt).toLocaleDateString()}
                      {item.room ? ` · Room ${item.room.number}` : ''}
                      {item.locationNote ? ` · ${item.locationNote}` : ''}
                      {item.foundByEmployee && <p>By {item.foundByEmployee.firstName} {item.foundByEmployee.lastName}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('keep-round border border-dashed px-2 py-1 text-[10px] font-bold', item.status === 'UNCLAIMED' ? 'border-warning/70 text-warning' : 'border-success/70 text-success')}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        {item.status === 'UNCLAIMED' ? (
                          <>
                            <ActionButton tone="neutral" icon={<LuPencil />} title="Edit" onClick={() => openEdit(item)} />
                            <ActionButton tone="neutral" icon={<LuPackageCheck />} title="Mark as collected" onClick={() => setCollecting(item)} />
                            <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete" onClick={() => void deleteItem(item)} />
                          </>
                        ) : (
                          <ActionButton tone="neutral" icon={<LuRotateCcw />} title="Undo collection" onClick={() => void reopenItem(item)} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">No items found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={saveItem} className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit item' : 'New item'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? editing.itemName : 'Log a found item'}</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Item" required className="sm:col-span-2"><input required placeholder="e.g. Black leather wallet" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} className="input" /></Field>
              <Field label="Found on" required><input required type="date" value={form.foundAt} onChange={(e) => setForm({ ...form, foundAt: e.target.value })} className="input" /></Field>
              <Field label="Room (optional)">
                <select className="input" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}>
                  <option value="">Not room-specific</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.number}</option>)}
                </select>
              </Field>
              <Field label="Where exactly (optional)" className="sm:col-span-2"><input placeholder="e.g. Under the bed, Lobby sofa" value={form.locationNote} onChange={(e) => setForm({ ...form, locationNote: e.target.value })} className="input" /></Field>
              <Field label="Description" className="sm:col-span-2"><textarea rows={2} placeholder="Distinguishing details" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" /></Field>
              <Field label="Notes" className="sm:col-span-2"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" /></Field>
              <Field label="Found by" className="sm:col-span-2">
                <div className="input flex items-center gap-2 bg-muted/50 text-muted-foreground">
                  <LuLock className="size-3.5 shrink-0" />
                  {editing
                    ? editing.foundByEmployee ? `${editing.foundByEmployee.firstName} ${editing.foundByEmployee.lastName}` : 'Unknown'
                    : currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown'}
                </div>
              </Field>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Log item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {collecting && (
        <CollectModal item={collecting} onClose={() => setCollecting(null)} onCollected={() => { setCollecting(null); void load(); }} />
      )}
    </div>
  )
}

function CollectModal({ item, onClose, onCollected }: { item: LostFoundItem; onClose: () => void; onCollected: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await api(`/lost-found/${item.id}/collect`, { method: 'PATCH', body: JSON.stringify({ collectedByName: name, collectedByContact: contact || undefined }) })
      toast.success('Item marked as collected.')
      onCollected()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record collection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-sm border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
        <div className="flex items-start justify-between -mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">Mark as collected</p>
            <h2 className="mt-1 font-display text-xl font-semibold">{item.itemName}</h2>
            <p className="text-xs text-muted-foreground">{item.itemNo}</p>
          </div>
          <button type="button" onClick={onClose} className="bg-black p-2 text-white transition hover:bg-black/80"><LuX /></button>
        </div>
        <label className="mt-5 block text-sm font-medium">
          Collected by <span className="text-destructive">*</span>
          <input required autoFocus placeholder="Guest or claimant's name" value={name} onChange={(e) => setName(e.target.value)} className="input mt-1.5" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Contact (optional)
          <input placeholder="Phone or room number" value={contact} onChange={(e) => setContact(e.target.value)} className="input mt-1.5" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <button disabled={saving || !name.trim()} className="inline-flex items-center gap-2 bg-success px-5 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />} Confirm collected
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block text-sm font-medium', className)}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

function Msg({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className={cn('mt-5 flex items-center gap-2 border p-3 text-sm', error ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-success/25 bg-success/10 text-success')}>
      {error ? <LuCircleAlert /> : <LuCircleCheck />}
      {text}
    </div>
  )
}
