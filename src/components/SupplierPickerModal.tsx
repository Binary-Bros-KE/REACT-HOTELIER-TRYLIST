import { useMemo, useState } from 'react'
import { LuLoaderCircle, LuPlus, LuSearch, LuX } from 'react-icons/lu'
import { api } from '@/lib/api'

export type SupplierOption = {
  id: string
  name: string
  contactPerson?: string | null
  phone?: string | null
}

type SupplierPickerModalProps = {
  suppliers: SupplierOption[]
  title?: string
  onClose: () => void
  onSelect: (supplier: SupplierOption) => void
  onCreated: (supplier: SupplierOption) => void
}

export default function SupplierPickerModal({ suppliers, title = 'Choose Supplier', onClose, onSelect, onCreated }: SupplierPickerModalProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return suppliers.slice(0, 50)
    return suppliers
      .filter((s) => [s.name, s.contactPerson, s.phone].some((value) => value?.toLowerCase().includes(needle)))
      .slice(0, 50)
  }, [query, suppliers])

  async function createSupplier() {
    if (!name.trim() || !contactPerson.trim() || !phone.trim()) {
      setError('Business name, contact person and phone are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await api<{ supplier: SupplierOption }>('/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          contactPerson: contactPerson.trim(),
          phone: phone.trim(),
        }),
      })
      onCreated(response.supplier)
      onSelect(response.supplier)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create supplier')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">{creating ? 'New Supplier' : title}</h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{creating ? 'Just enough to place an order.' : 'Search by name, contact or phone.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
        </div>

        {creating ? (
          <div className="mt-5 space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Business name *
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Nairobi Wholesalers Ltd" className="input mt-1.5" autoFocus />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact person *
              <input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} placeholder="e.g. John Kamau" className="input mt-1.5" />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Phone *
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 0712 345 678" className="input mt-1.5" />
            </label>
            {error && <p className="rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => { setCreating(false); setError('') }} className="rounded-sm border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void createSupplier()} disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                Create supplier
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <button type="button" onClick={() => setCreating(true)} className="mb-3 ml-auto flex items-center gap-1 text-sm font-semibold text-secondary hover:underline">
              <LuPlus className="size-4" /> New supplier
            </button>
            <div className="relative">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers..." className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" autoFocus />
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {matches.length === 0 ? (
                <p className="rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">No matching suppliers.</p>
              ) : matches.map((supplier) => (
                <button key={supplier.id} type="button" onClick={() => { onSelect(supplier); onClose() }} className="w-full rounded-sm border bg-card px-3 py-2.5 text-left hover:bg-muted">
                  <span className="block text-sm font-semibold">{supplier.name}</span>
                  {(supplier.phone || supplier.contactPerson) && <span className="mt-0.5 block text-xs text-muted-foreground">{supplier.phone ?? supplier.contactPerson}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
