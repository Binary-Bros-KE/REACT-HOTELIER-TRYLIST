import { useState } from 'react'
import { LuMinus, LuPlus } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import ModalShell from '@/components/ui/ModalShell'
import { addonsFor, chargedPrice, isOverridden, lineKey, listPrice, type CartLine, type PosService, type PosServiceAddon } from './serviceTill'

const money = (v: number) => `KSh ${v.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/**
 * Choose how a service is sold: its option (30 / 60 mins, Saloon / SUV), the
 * add-ons (Hot stones, Engine wash), how many, and - if the price at the till
 * differs from the list - the new price and why. Used to add a line and to edit one.
 */
export default function ServiceOptionsModal({ service, allAddons, initial, onSave, onClose }: {
  service: PosService
  allAddons: PosServiceAddon[]
  initial?: CartLine
  onSave: (line: CartLine) => void
  onClose: () => void
}) {
  const offered = addonsFor(service, allAddons)
  const [variantId, setVariantId] = useState(initial?.variant?.id ?? '')
  const [addons, setAddons] = useState<Map<string, number>>(new Map((initial?.addons ?? []).map((a) => [a.addon.id, a.quantity])))
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const [price, setPrice] = useState(initial?.overridePrice ?? '')
  const [reason, setReason] = useState(initial?.overrideReason ?? '')

  const variant = service.variants.find((v) => v.id === variantId) ?? null
  const chosenAddons = offered.filter((a) => addons.has(a.id)).map((addon) => ({ addon, quantity: addons.get(addon.id) ?? 1 }))
  const draft: CartLine = { key: '', service, variant, addons: chosenAddons, quantity, overridePrice: price, overrideReason: reason }
  const overridden = isOverridden(draft)
  const needsVariant = service.variants.length > 0 && !variant
  const missingReason = overridden && reason.trim().length < 3
  const invalid = needsVariant || missingReason || quantity < 1

  const toggleAddon = (id: string) => setAddons((current) => { const next = new Map(current); if (next.has(id)) next.delete(id); else next.set(id, 1); return next })
  const setAddonQty = (id: string, qty: number) => setAddons((current) => new Map(current).set(id, Math.max(1, Math.min(20, qty))))

  return (
    <ModalShell
      kicker={service.category.name}
      title={service.name}
      subtitle={`Per ${service.unit.name}`}
      onClose={onClose}
      size="md"
      footer={
        <button
          type="button"
          disabled={invalid}
          onClick={() => onSave({ ...draft, key: lineKey(service.id, variant?.id ?? null, chosenAddons) + (overridden ? `::${price}` : '') })}
          className="bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >{initial ? 'Update line' : 'Add to sale'}</button>
      }
    >
      <div className="space-y-5 p-5">
        {service.variants.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Choose an option *</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {service.variants.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariantId(v.id)} className={cn('flex items-center justify-between border p-3 text-left text-sm transition', variantId === v.id ? 'border-secondary bg-secondary/10' : 'hover:bg-muted')}>
                  <span><span className="block font-semibold">{v.name}</span>{v.durationMinutes ? <span className="text-xs text-muted-foreground">{v.durationMinutes} min</span> : null}</span>
                  <span className="font-semibold tabular-nums">{money(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {offered.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Add-ons</p>
            <div className="space-y-1.5">
              {offered.map((a) => {
                const on = addons.has(a.id)
                return (
                  <div key={a.id} className={cn('flex items-center justify-between gap-3 border p-2.5 text-sm', on && 'border-secondary bg-secondary/5')}>
                    <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                      <input type="checkbox" checked={on} onChange={() => toggleAddon(a.id)} className="size-4 accent-secondary" />
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-muted-foreground">+ {money(a.price)}</span>
                    </label>
                    {on && (
                      <span className="flex items-center gap-1.5">
                        <button type="button" onClick={() => setAddonQty(a.id, (addons.get(a.id) ?? 1) - 1)} className="border bg-card p-1"><LuMinus className="size-3" /></button>
                        <span className="w-5 text-center text-sm font-medium">{addons.get(a.id)}</span>
                        <button type="button" onClick={() => setAddonQty(a.id, (addons.get(a.id) ?? 1) + 1)} className="border bg-card p-1"><LuPlus className="size-3" /></button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Quantity ({service.unit.name})</p>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="border bg-card p-2"><LuMinus className="size-3.5" /></button>
              <span className="w-8 text-center text-base font-semibold">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => Math.min(999, q + 1))} className="border bg-card p-2"><LuPlus className="size-3.5" /></button>
            </span>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Price per {service.unit.name}</span>
            <input type="number" min="0" step="0.01" placeholder={String(listPrice(draft))} value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
            <span className="mt-1 block text-[11px] text-muted-foreground">List price {money(listPrice(draft))}. Type a different price to override it.</span>
          </label>
        </div>

        {overridden && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-warning">Why is the price {chargedPrice(draft) > listPrice(draft) ? 'higher' : 'lower'}? *</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spa rate, agreed discount" className="input" maxLength={200} />
            <span className="mt-1 block text-[11px] text-muted-foreground">Kept with the sale so managers can review price changes. The receipt shows the price charged.</span>
          </label>
        )}

        {needsVariant && <p className="text-xs font-medium text-warning">Choose an option to continue.</p>}
      </div>
    </ModalShell>
  )
}
