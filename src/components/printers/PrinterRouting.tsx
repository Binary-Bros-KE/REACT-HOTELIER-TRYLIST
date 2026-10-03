import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LuLoaderCircle, LuPlus, LuPrinter } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import type { ThermalSettings } from '@/lib/thermalPrinter'

type Printer = { id: string; name: string; isActive: boolean; isDefault: boolean; locationId: string; location: { id: string; name: string } }
type Location = { id: string; name: string; isActive?: boolean }

/** Which printer this device's receipts go to, and which printer this computer drives for other devices. */
export default function PrinterRouting({ settings, onChange }: { settings: ThermalSettings; onChange: (patch: Partial<ThermalSettings>) => void }) {
  const toast = useToast()
  const [printers, setPrinters] = useState<Printer[] | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, places] = await Promise.all([
        api<{ printers: Printer[] }>('/pos/printers'),
        api<{ locations: Location[] }>('/locations'),
      ])
      setPrinters(list.printers)
      setLocations(places.locations.filter((l) => l.isActive !== false))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load printers')
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  async function addPrinter(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !locationId) return
    setSaving(true)
    try {
      await api('/pos/printers', { method: 'POST', body: JSON.stringify({ name: name.trim(), locationId }) })
      setName('')
      toast.success('Printer added.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add printer')
    } finally {
      setSaving(false)
    }
  }

  async function update(printer: Printer, patch: { isActive?: boolean; isDefault?: boolean }) {
    try {
      await api(`/pos/printers/${printer.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not update printer')
    }
  }

  const active = (printers ?? []).filter((p) => p.isActive)
  const hosted = active.find((p) => p.id === settings.hostPrinterId)

  return (
    <section className="mb-6 border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center bg-secondary/10 text-secondary"><LuPrinter className="size-4" /></span>
        <div className="border-l-4 border-accent pl-3">
          <h2 className="font-semibold text-foreground">Printers</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Pick once — it stays until you change it. Receipts go only to the printer you choose.</p>
        </div>
      </div>

      {printers === null ? (
        <div className="mt-5 flex justify-center"><LuLoaderCircle className="animate-spin" /></div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block">My receipts print to</span>
            <select value={settings.workingPrinterId} onChange={(e) => onChange({ workingPrinterId: e.target.value })} className="input">
              <option value="">Choose a printer</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.location.name} — {p.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            <span className="mb-1.5 block">This computer prints for</span>
            <select value={settings.hostPrinterId} onChange={(e) => onChange({ hostPrinterId: e.target.value })} className="input">
              <option value="">Nothing — this computer prints no one else&apos;s receipts</option>
              {active.map((p) => <option key={p.id} value={p.id}>{p.location.name} — {p.name}</option>)}
            </select>
            {hosted && <span className="mt-1.5 block text-xs text-muted-foreground">Receipts for {hosted.name} print from this computer while it stays open with its printer connected.</span>}
          </label>
        </div>
      )}

      {printers && (
        <div className="mt-6 border-t pt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Printers in this business</p>
          {printers.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No printers yet — add one below.</p>}
          <ul className="mt-2 divide-y border">
            {printers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  <b>{p.name}</b> <span className="text-muted-foreground">· {p.location.name}</span>
                  {!p.isActive && <span className="ml-2 text-xs font-bold uppercase text-destructive">Off</span>}
                  {p.isDefault && <span className="ml-2 text-xs font-bold uppercase text-secondary">Default</span>}
                </span>
                <span className="flex gap-2">
                  {p.isActive && !p.isDefault && <button type="button" onClick={() => update(p, { isDefault: true })} className="border px-2.5 py-1 text-xs font-semibold hover:bg-muted">Make default</button>}
                  <button type="button" onClick={() => update(p, { isActive: !p.isActive })} className="border px-2.5 py-1 text-xs font-semibold hover:bg-muted">{p.isActive ? 'Switch off' : 'Switch on'}</button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={addPrinter} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-sm font-medium"><span className="mb-1.5 block">New printer name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Bar thermal" className="input" /></label>
            <label className="block text-sm font-medium"><span className="mb-1.5 block">Location</span>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="input">
                <option value="">Choose location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={saving || !name.trim() || !locationId} className="inline-flex items-center justify-center gap-2 bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60"><LuPlus /> Add printer</button>
          </form>
        </div>
      )}
    </section>
  )
}
