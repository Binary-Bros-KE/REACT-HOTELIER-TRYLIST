import { useState, type FormEvent, type ReactNode } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import ModalShell from '@/components/ui/ModalShell'

/** Create a customer without leaving the form that needs one. Stacks above the modal that opened it. */
export default function QuickCustomerModal<T extends { id: string }>({ onClose, onCreated }: { onClose: () => void; onCreated: (customer: T) => void }) {
  const toast = useToast()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!firstName.trim() || !phone.trim()) return
    setSaving(true)
    try {
      const { customer } = await api<{ customer: T }>('/customers', {
        method: 'POST',
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() || undefined, phone: phone.trim() }),
      })
      toast.success('Customer created.')
      onCreated(customer)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      size="sm"
      stacked
      kicker="Customers"
      title="New customer"
      onClose={onClose}
      footer={
        <button form="quick-customer-form" disabled={saving || !firstName.trim() || !phone.trim()} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
          {saving && <LuLoaderCircle className="animate-spin" />}
          Create
        </button>
      }
    >
      <form id="quick-customer-form" onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="First name" required><input required autoFocus className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Faith" /></Field>
        <Field label="Last name"><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Wanjiru" /></Field>
        <Field label="Phone" required className="sm:col-span-2"><input required type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" /></Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">They're selected for you as soon as they're created — add email, ID or a service group later from Customers.</p>
      </form>
    </ModalShell>
  )
}

function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      <span className="mb-1.5 block">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  )
}
