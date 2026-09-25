import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  LuCircleAlert,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuWallet,
} from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import PageBanner from '@/components/ui/PageBanner'
import ModalShell from '@/components/ui/ModalShell'
import ActionButton from '@/components/ui/ActionButton'
import StatusPill, { type PillTone } from '@/components/ui/StatusPill'
import Avatar from '@/components/ui/Avatar'

const customerTypes = ['PERSONAL', 'BUSINESS'] as const
const customerStatuses = ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const
const genders = ['MALE', 'FEMALE', 'OTHER'] as const
const preferredLanguages = ['ENGLISH', 'SWAHILI', 'OTHER'] as const
const contactMethods = ['PHYSICAL', 'CALL', 'WHATSAPP', 'EMAIL'] as const
const currencies = ['KES', 'UGX', 'TZS', 'USD'] as const

type CustomerType = (typeof customerTypes)[number]
type CustomerStatus = (typeof customerStatuses)[number]
type Gender = (typeof genders)[number]
type PreferredLanguage = (typeof preferredLanguages)[number]
type ContactMethod = (typeof contactMethods)[number]
type Currency = (typeof currencies)[number]

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase()

type Customer = {
  id: string
  customerNo: string
  customerType: CustomerType
  firstName: string
  lastName: string | null
  email: string | null
  phone: string
  nationality: string | null
  idNumber: string | null
  occupation: string | null
  gender: Gender | null
  dob: string | null
  carModel: string | null
  carRegistration: string | null
  carColour: string | null
  status: CustomerStatus
  address: string | null
  notes: string | null
  businessName: string | null
  registrationNumber: string | null
  kraPin: string | null
  contactPerson: string | null
  billingPhone: string | null
  billingEmail: string | null
  website: string | null
  preferredLanguage: PreferredLanguage | null
  preferredCurrency: Currency | null
  contactMethod: ContactMethod | null
  marketingConsent: boolean
  loyaltyPoints: number
  balance?: string | number | null
  emergencyContactName: string | null
  emergencyContactRelationship: string | null
  emergencyContactPhone: string | null
  createdAt: string
  updatedAt: string
  createdByEmployee: { id: string; firstName: string; lastName: string } | null
  updatedByEmployee: { id: string; firstName: string; lastName: string } | null
  serviceGroupId: string | null
  serviceGroup: CustomerGroup | null
}

type CustomerGroup = { id: string; name: string; isActive: boolean }

type CustomerForm = {
  customerType: CustomerType
  firstName: string
  lastName: string
  email: string
  phone: string
  nationality: string
  idNumber: string
  occupation: string
  gender: Gender | ''
  dob: string
  carModel: string
  carRegistration: string
  carColour: string
  status: CustomerStatus
  address: string
  notes: string
  businessName: string
  registrationNumber: string
  kraPin: string
  contactPerson: string
  billingPhone: string
  billingEmail: string
  website: string
  preferredLanguage: PreferredLanguage | ''
  preferredCurrency: Currency | ''
  contactMethod: ContactMethod | ''
  marketingConsent: boolean
  loyaltyPoints: string
  emergencyContactName: string
  emergencyContactRelationship: string
  emergencyContactPhone: string
  serviceGroupId: string
}

const emptyForm: CustomerForm = {
  customerType: 'PERSONAL',
  firstName: '', lastName: '', email: '', phone: '',
  nationality: '', idNumber: '', occupation: '', gender: '', dob: '',
  carModel: '', carRegistration: '', carColour: '',
  status: 'ACTIVE', address: '', notes: '',
  businessName: '', registrationNumber: '', kraPin: '', contactPerson: '', billingPhone: '', billingEmail: '', website: '',
  preferredLanguage: '', preferredCurrency: '', contactMethod: '', marketingConsent: false, loyaltyPoints: '',
  emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '',
  serviceGroupId: '',
}

function formFromCustomer(customer: Customer): CustomerForm {
  return {
    customerType: customer.customerType,
    firstName: customer.firstName,
    lastName: customer.lastName ?? '',
    email: customer.email ?? '',
    phone: customer.phone,
    nationality: customer.nationality ?? '',
    idNumber: customer.idNumber ?? '',
    occupation: customer.occupation ?? '',
    gender: customer.gender ?? '',
    dob: customer.dob?.slice(0, 10) ?? '',
    carModel: customer.carModel ?? '',
    carRegistration: customer.carRegistration ?? '',
    carColour: customer.carColour ?? '',
    status: customer.status,
    address: customer.address ?? '',
    notes: customer.notes ?? '',
    businessName: customer.businessName ?? '',
    registrationNumber: customer.registrationNumber ?? '',
    kraPin: customer.kraPin ?? '',
    contactPerson: customer.contactPerson ?? '',
    billingPhone: customer.billingPhone ?? '',
    billingEmail: customer.billingEmail ?? '',
    website: customer.website ?? '',
    preferredLanguage: customer.preferredLanguage ?? '',
    preferredCurrency: customer.preferredCurrency ?? '',
    contactMethod: customer.contactMethod ?? '',
    marketingConsent: customer.marketingConsent,
    loyaltyPoints: String(customer.loyaltyPoints),
    emergencyContactName: customer.emergencyContactName ?? '',
    emergencyContactRelationship: customer.emergencyContactRelationship ?? '',
    emergencyContactPhone: customer.emergencyContactPhone ?? '',
    serviceGroupId: customer.serviceGroupId ?? '',
  }
}

const STATUS_TONE: Record<CustomerStatus, PillTone> = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
  BLOCKED: 'danger',
}
const TH = 'px-5 py-3 text-xs font-bold uppercase tracking-wider'

/** The same page is mounted under Reception, Housekeeping, Sales and Service Center. */
function useSectionKicker() {
  const path = useLocation().pathname
  if (path.startsWith('/reception')) return 'Reception'
  if (path.startsWith('/housekeeping')) return 'Housekeeping'
  if (path.startsWith('/sales')) return 'Sales'
  if (path.startsWith('/service-center')) return 'Service center'
  return 'Customers'
}

export default function Customers() {
  const toast = useToast()
  const kicker = useSectionKicker()
  const isServiceCenter = kicker === 'Service center'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [groups, setGroups] = useState<CustomerGroup[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [creditFor, setCreditFor] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (typeFilter) query.set('customerType', typeFilter)
      if (statusFilter) query.set('status', statusFilter)
      if (isServiceCenter && groupFilter) query.set('serviceGroupId', groupFilter)
      const [response, groupResponse] = await Promise.all([
        api<{ customers: Customer[] }>(`/customers${query.size ? `?${query}` : ''}`),
        isServiceCenter ? api<{ groups: CustomerGroup[] }>('/service-center/customer-groups') : Promise.resolve({ groups: [] }),
      ])
      setCustomers(response.customers)
      setGroups(groupResponse.groups)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load customers'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter, statusFilter, groupFilter, isServiceCenter, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(customer: Customer) {
    setEditing(customer)
    setForm(formFromCustomer(customer))
    setShowForm(true)
  }

  async function saveCustomer(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        ...form,
        // The backend's one required "name" field always doubles as the
        // display name — for a business customer that's the business name,
        // not a person, so there's no separate first/last name to collect.
        firstName: form.customerType === 'BUSINESS' ? form.businessName.trim() : form.firstName,
        lastName: form.customerType === 'BUSINESS' ? '' : form.lastName,
        loyaltyPoints: Number(form.loyaltyPoints) || 0,
      }
      await api(editing ? `/customers/${editing.id}` : '/customers', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      toast.success(editing ? 'Customer updated.' : 'Customer created.')
      setShowForm(false)
      await load()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save customer'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(`Permanently delete ${customer.firstName} ${customer.lastName ?? ''}?`)) return
    try {
      await api(`/customers/${customer.id}`, { method: 'DELETE' })
      toast.success('Customer deleted.')
      await load()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not delete customer')
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker={kicker} title="Customers" />

      {error && (
        <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="border-l-4 border-accent pl-3 lg:mr-auto">
            <h2 className="font-display text-xl font-semibold leading-tight">All customers</h2>
            <p className="text-xs text-muted-foreground">Contact details, preferences and credit history in one place.</p>
          </div>
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, customer no…"
              className="w-full border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring lg:w-72"
            />
          </label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All types</option>
            {customerTypes.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">All statuses</option>
            {customerStatuses.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
          {isServiceCenter && (
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">All groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>Add customer</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="animate-spin" /> Loading customers…
          </div>
        ) : customers.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No customers match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className={TH}>Customer</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Contact</th>
                  {isServiceCenter && <th className={TH}>Group</th>}
                  <th className={TH}>Status</th>
                  <th className={TH}>Loyalty</th>
                  <th className={cn(TH, 'text-right')}>Balance</th>
                  <th className={cn(TH, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((customer) => (
                  <tr key={customer.id} className="align-middle transition even:bg-muted/30 hover:bg-muted/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar size="md" />
                        <div>
                          <p className="font-semibold">{customer.firstName} {customer.lastName ?? ''}</p>
                          <p className="text-xs text-muted-foreground">{customer.customerNo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill tone="secondary">{titleCase(customer.customerType)}</StatusPill>
                      {customer.businessName && <p className="mt-1 text-xs text-muted-foreground">{customer.businessName}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      <p>{customer.phone}</p>
                      {customer.email && <p className="text-xs">{customer.email}</p>}
                    </td>
                    {isServiceCenter && (
                      <td className="px-5 py-3.5">
                        {customer.serviceGroup ? <StatusPill tone="secondary">{customer.serviceGroup.name}</StatusPill> : <span className="text-xs text-muted-foreground">No group</span>}
                      </td>
                    )}
                    <td className="px-5 py-3.5"><StatusPill tone={STATUS_TONE[customer.status]}>{titleCase(customer.status)}</StatusPill></td>
                    <td className="px-5 py-3.5 text-muted-foreground">{customer.loyaltyPoints} pts</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {Number(customer.balance ?? 0) > 0
                        ? <span className="font-semibold text-warning">KSh {Number(customer.balance).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <ActionButton tone="neutral" icon={<LuWallet />} title="Credit history" onClick={() => setCreditFor(customer)} />
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit customer" onClick={() => openEdit(customer)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete customer" onClick={() => void deleteCustomer(customer)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <ModalShell
          size="lg"
          kicker={editing ? 'Edit customer' : 'New customer'}
          title={editing ? `${editing.firstName} ${editing.lastName ?? ''}`.trim() : 'Add a customer'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button form="customer-form" disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create customer'}
              </button>
            </>
          }
        >
          <form id="customer-form" onSubmit={saveCustomer} className="px-5 pb-5">

            <FieldGroup title="Basics">
              <Field label="Customer Type" required>
                <select required className="input" value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value as CustomerType })}>
                  {customerTypes.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CustomerStatus })}>
                  {customerStatuses.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
              </Field>
              {form.customerType === 'BUSINESS' ? (
                <Field label="Business Name" required className="sm:col-span-2"><input required placeholder="e.g. Acme Traders Ltd" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="input" /></Field>
              ) : (
                <>
                  <Field label="First Name" required><input required placeholder="e.g. Faith" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" /></Field>
                  <Field label="Last Name"><input placeholder="e.g. Wanjiru" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" /></Field>
                </>
              )}
              <Field label="Phone" required><input required type="tel" placeholder="e.g. 0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></Field>
              <Field label="Email"><input type="email" placeholder="e.g. faith@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></Field>
              <Field label="Address" className="sm:col-span-2"><input placeholder="Physical address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" /></Field>
              {isServiceCenter && (
                <Field label="Service group" className="sm:col-span-2">
                  <select value={form.serviceGroupId} onChange={(e) => setForm({ ...form, serviceGroupId: e.target.value })} className="input">
                    <option value="">No group</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </Field>
              )}
            </FieldGroup>

            {form.customerType === 'BUSINESS' ? (
              <FieldGroup title="Business Details">
                <Field label="Contact Person"><input placeholder="e.g. Jane Doe" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="input" /></Field>
                <Field label="KRA PIN"><input placeholder="e.g. P051234567X" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} className="input" /></Field>
                <Field label="Registration Number"><input placeholder="e.g. BN-2024-104567" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} className="input" /></Field>
                <Field label="Website"><input placeholder="e.g. www.acme.co.ke" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" /></Field>
                <Field label="Billing Phone" className="text-muted-foreground"><input type="tel" placeholder="If different from above" value={form.billingPhone} onChange={(e) => setForm({ ...form, billingPhone: e.target.value })} className="input" /></Field>
                <Field label="Billing Email" className="text-muted-foreground"><input type="email" placeholder="If different from above" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} className="input" /></Field>
              </FieldGroup>
            ) : (
              <>
                <FieldGroup title="Identity">
                  <Field label="Nationality"><input placeholder="e.g. Kenyan" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className="input" /></Field>
                  <Field label="Passport / ID No"><input placeholder="e.g. 30112233" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} className="input" /></Field>
                  <Field label="Occupation"><input placeholder="e.g. Accountant" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} className="input" /></Field>
                  <Field label="Gender">
                    <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender | '' })}>
                      <option value="">Not set</option>
                      {genders.map((g) => <option key={g} value={g}>{titleCase(g)}</option>)}
                    </select>
                  </Field>
                  <Field label="Date of Birth"><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="input" /></Field>
                  <Field label="KRA PIN"><input placeholder="e.g. A012345678X" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} className="input" /></Field>
                </FieldGroup>

                <FieldGroup title="Car Details">
                  <Field label="Car Model"><input placeholder="e.g. Toyota Axio" value={form.carModel} onChange={(e) => setForm({ ...form, carModel: e.target.value })} className="input" /></Field>
                  <Field label="Registration No"><input placeholder="e.g. KDA 123A" value={form.carRegistration} onChange={(e) => setForm({ ...form, carRegistration: e.target.value })} className="input" /></Field>
                  <Field label="Colour"><input placeholder="e.g. Silver" value={form.carColour} onChange={(e) => setForm({ ...form, carColour: e.target.value })} className="input" /></Field>
                </FieldGroup>
              </>
            )}

            <FieldGroup title="Preferences">
              <Field label="Preferred Language">
                <select className="input" value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as PreferredLanguage | '' })}>
                  <option value="">Not set</option>
                  {preferredLanguages.map((l) => <option key={l} value={l}>{titleCase(l)}</option>)}
                </select>
              </Field>
              <Field label="Preferred Currency">
                <select className="input" value={form.preferredCurrency} onChange={(e) => setForm({ ...form, preferredCurrency: e.target.value as Currency | '' })}>
                  <option value="">Not set</option>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Contact Method">
                <select className="input" value={form.contactMethod} onChange={(e) => setForm({ ...form, contactMethod: e.target.value as ContactMethod | '' })}>
                  <option value="">Not set</option>
                  {contactMethods.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
                </select>
              </Field>
              <Field label="Loyalty Points"><input type="number" min="0" placeholder="0" value={form.loyaltyPoints} onChange={(e) => setForm({ ...form, loyaltyPoints: e.target.value })} className="input" /></Field>
              <label className="flex cursor-pointer items-center justify-between gap-4 border bg-background px-3 py-2.5 text-sm font-medium sm:col-span-2">
                Marketing consent
                <input type="checkbox" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} className="size-4 accent-secondary" />
              </label>
            </FieldGroup>

            <FieldGroup title="Emergency Contact">
              <Field label="Name"><input placeholder="e.g. John Doe" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className="input" /></Field>
              <Field label="Relationship"><input placeholder="e.g. Spouse" value={form.emergencyContactRelationship} onChange={(e) => setForm({ ...form, emergencyContactRelationship: e.target.value })} className="input" /></Field>
              <Field label="Phone" className="sm:col-span-2"><input type="tel" placeholder="e.g. 0722 000 000" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Notes">
              <Field label="Notes" className="sm:col-span-2">
                <textarea rows={3} placeholder="Anything worth remembering about this customer" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
              </Field>
            </FieldGroup>

            {editing && (editing.createdByEmployee || editing.updatedByEmployee) && (
              <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                {editing.createdByEmployee && <>Created by {editing.createdByEmployee.firstName} {editing.createdByEmployee.lastName} on {new Date(editing.createdAt).toLocaleDateString()}</>}
                {editing.createdByEmployee && editing.updatedByEmployee && ' · '}
                {editing.updatedByEmployee && <>Last updated by {editing.updatedByEmployee.firstName} {editing.updatedByEmployee.lastName} on {new Date(editing.updatedAt).toLocaleDateString()}</>}
              </p>
            )}

          </form>
        </ModalShell>
      )}

      {creditFor && <CreditHistoryModal customer={creditFor} onClose={() => setCreditFor(null)} />}
    </div>
  )
}

type CreditEntry = {
  id: string
  type: 'CREDIT' | 'REPAYMENT' | 'ADJUSTMENT'
  amount: string
  balanceAfter: string
  note: string | null
  createdAt: string
  order: { orderNumber: number } | null
}

function CreditHistoryModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [data, setData] = useState<{ balance: string; entries: CreditEntry[]; creditCount: number; totalCreditTaken: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const money = (v: string | number) => `KSh ${Number(v).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

  useEffect(() => {
    setLoading(true)
    api<{ balance: string; entries: CreditEntry[]; creditCount: number; totalCreditTaken: string }>(`/customers/${customer.id}/credit-entries`)
      .then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [customer.id])

  return (
    <ModalShell size="md" kicker="Credit history" title={`${customer.firstName} ${customer.lastName ?? ''}`.trim()} onClose={onClose}>
      <div className="p-5">
        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading…</div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Could not load the statement.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['Owes now', money(data.balance), Number(data.balance) > 0 ? 'bg-warning' : 'bg-success'],
                ['Times on credit', String(data.creditCount), 'bg-secondary'],
                ['Total taken', money(data.totalCreditTaken), 'bg-muted-foreground'],
              ] as const).map(([label, value, bar]) => (
                <div key={label} className="flex border bg-card">
                  <span className={cn('w-1.5 shrink-0', bar)} />
                  <div className="min-w-0 flex-1 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                    <p className="mt-1 truncate text-lg font-bold tabular-nums leading-tight">{value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 divide-y border">
              {data.entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No credit activity yet.</p>
              ) : data.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm even:bg-muted/30">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {e.type === 'CREDIT' ? 'Taken on credit' : e.type === 'REPAYMENT' ? 'Repayment' : 'Adjustment'}
                      {e.order && <span className="text-muted-foreground"> · order #{e.order.orderNumber}</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{new Date(e.createdAt).toLocaleString()}{e.note ? ` · ${e.note}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={cn('font-semibold', Number(e.amount) > 0 ? 'text-warning' : 'text-success')}>{Number(e.amount) > 0 ? '+' : ''}{money(e.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">bal {money(e.balanceAfter)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 border-t pt-5">
      <p className="mb-3 border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
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
