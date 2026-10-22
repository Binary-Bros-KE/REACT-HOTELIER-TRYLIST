import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'
import { cn } from '@/lib/utils'

export type CasualPayment = {
  id: string
  paymentNo: string
  workerName: string
  workerPhone: string | null
  workerIdNo: string | null
  job: string
  workDate: string
  location: { id: string; name: string } | null
  quantity: string | number | null
  unitLabel: string | null
  rate: string | number | null
  amount: string | number
  paymentMethod: string
  reference: string | null
  notes: string | null
  status: 'COMPLETE' | 'VOIDED' | 'DRAFT'
  voidReason: string | null
  paidAt: string
}

type Worker = { workerName: string; workerPhone: string | null; workerIdNo: string | null; rate: string | number | null; unitLabel: string | null }

const methods = ['CASH', 'MPESA', 'BANK_TRANSFER', 'CHEQUE', 'CARD'] as const
const methodLabel = (m: string) => m.toLowerCase().split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join(' ')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const money = (v: number) => `KSh ${v.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

/**
 * Records a casual labourer paid on the spot for a one-off job: not an
 * employee, no payslip cycle. Paid when saved (it counts as salaries in every
 * report). A labourer paid before is suggested by name, filling their phone, ID
 * and last rate.
 */
export default function CasualLabourModal({ locations, onClose, onSaved }: { locations: { id: string; name: string }[]; onClose: () => void; onSaved: (payment: CasualPayment) => void }) {
  const toast = useToast()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [units, setUnits] = useState<{ id: string; name: string }[]>([])
  const [byDays, setByDays] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    workerName: '', workerPhone: '', workerIdNo: '', job: '', workDate: today(), locationId: locations.length === 1 ? locations[0].id : '',
    amount: '', quantity: '', unitLabel: '', rate: '', paymentMethod: 'CASH', reference: '', notes: '',
  })
  const set = (patch: Partial<typeof form>) => setForm((cur) => ({ ...cur, ...patch }))

  useEffect(() => {
    api<{ workers: Worker[] }>('/employee-salaries/casual/workers').then((r) => setWorkers(r.workers)).catch(() => {})
    // "Days x rate" counts in one of the property's units of measure - Day(s) when there is one.
    api<{ units: { id: string; name: string }[] }>('/units-of-measure').then((r) => {
      setUnits(r.units)
      const day = r.units.find((u) => /^days?$/i.test(u.name.trim()))
      setForm((cur) => (cur.unitLabel ? cur : { ...cur, unitLabel: (day ?? r.units[0])?.name ?? '' }))
    }).catch(() => {})
  }, [])

  // Picking a known labourer fills in what we already know about them.
  function pickName(workerName: string) {
    const known = workers.find((w) => w.workerName.trim().toLowerCase() === workerName.trim().toLowerCase())
    set({
      workerName,
      ...(known ? {
        workerPhone: form.workerPhone || known.workerPhone || '',
        workerIdNo: form.workerIdNo || known.workerIdNo || '',
        ...(known.rate ? { rate: form.rate || String(Number(known.rate)), unitLabel: known.unitLabel || form.unitLabel } : {}),
      } : {}),
    })
    if (known?.rate && !form.amount) setByDays(true)
  }

  const computed = byDays ? (Number(form.quantity) || 0) * (Number(form.rate) || 0) : Number(form.amount) || 0
  const canSave = Boolean(form.workerName.trim() && form.job.trim() && form.workDate && computed > 0 && (!byDays || form.unitLabel) && !saving)

  async function submit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!canSave) return
    setSaving(true)
    try {
      const { payment } = await api<{ payment: CasualPayment }>('/employee-salaries/casual', {
        method: 'POST',
        body: JSON.stringify({
          workerName: form.workerName, workerPhone: form.workerPhone, workerIdNo: form.workerIdNo, job: form.job, workDate: form.workDate,
          locationId: form.locationId, paymentMethod: form.paymentMethod, reference: form.reference, notes: form.notes,
          ...(byDays ? { quantity: form.quantity, rate: form.rate, unitLabel: form.unitLabel } : { amount: form.amount }),
        }),
      })
      toast.success(`${payment.paymentNo} recorded - ${money(Number(payment.amount))} paid to ${payment.workerName}.`)
      onSaved(payment)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not record the payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      size="lg"
      kicker="Salaries"
      title="Record casual labour"
      subtitle="A one-off labourer paid for a job. Counts as salaries in every report."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
          <button form="casual-labour-form" disabled={!canSave} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
            {saving && <LuLoaderCircle className="animate-spin" />}
            Pay {computed > 0 ? money(computed) : ''}
          </button>
        </>
      }
    >
      <form id="casual-labour-form" onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Labourer's name" required>
          <input required autoFocus list="casual-workers" className="input" value={form.workerName} onChange={(e) => pickName(e.target.value)} placeholder="e.g. John Otieno" />
          <datalist id="casual-workers">{workers.map((w) => <option key={w.workerName} value={w.workerName}>{w.workerPhone ?? ''}</option>)}</datalist>
        </Field>
        <Field label="Phone"><input type="tel" className="input" value={form.workerPhone} onChange={(e) => set({ workerPhone: e.target.value })} placeholder="Optional" /></Field>
        <Field label="ID number"><input className="input" value={form.workerIdNo} onChange={(e) => set({ workerIdNo: e.target.value })} placeholder="Optional" /></Field>
        <Field label="Date worked" required><input required type="date" className="input" value={form.workDate} onChange={(e) => set({ workDate: e.target.value })} /></Field>
        <Field label="Job done" required className="sm:col-span-2"><input required className="input" value={form.job} onChange={(e) => set({ job: e.target.value })} placeholder="e.g. Offloading stock, slashing the compound" /></Field>
        <Field label="Location">
          <select className="input" value={form.locationId} onChange={(e) => set({ locationId: e.target.value })}>
            <option value="">Not set</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-2 flex w-fit border bg-card p-1">
            {([[false, 'Amount'], [true, 'Days x rate']] as const).map(([value, label]) => (
              <button key={label} type="button" onClick={() => setByDays(value)} className={cn('px-3 py-1.5 text-xs font-semibold transition', byDays === value ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
            ))}
          </div>
          {byDays ? (
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
              <Field label="How many" required><input type="number" min="0" step="0.5" className="input" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder="e.g. 3" /></Field>
              <Field label="Unit" required>
                <select required className="input" value={form.unitLabel} onChange={(e) => set({ unitLabel: e.target.value })}>
                  {!units.some((u) => u.name === form.unitLabel) && form.unitLabel && <option value={form.unitLabel}>{form.unitLabel}</option>}
                  {units.length === 0 && !form.unitLabel && <option value="">No units yet</option>}
                  {units.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Rate (KSh)" required><input type="number" min="0" step="0.01" className="input" value={form.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="e.g. 800" /></Field>
              <p className="col-span-3 text-sm font-semibold">Total: {money(computed)}</p>
            </div>
          ) : (
            <Field label="Amount paid (KSh)" required><input type="number" min="0" step="0.01" className="input" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="e.g. 1500" /></Field>
          )}
        </div>

        <Field label="Paid by" required>
          <select className="input" value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
            {methods.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
          </select>
        </Field>
        <Field label="Reference"><input className="input" value={form.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="e.g. M-Pesa code (optional)" /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" /></Field>
      </form>
    </ModalShell>
  )
}

function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block text-sm font-medium', className)}>
      <span className="mb-1.5 block">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  )
}
