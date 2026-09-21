import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuBriefcaseBusiness,
  LuCircleAlert,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuUserCheck,
  LuUsers,
} from 'react-icons/lu'

import { api } from '@/lib/api'
import PageBanner from '@/components/ui/PageBanner'
import ActionButton from '@/components/ui/ActionButton'
import { useToast } from '@/components/ui/Toast'
import StatCard from '@/components/ui/StatCard'
import PinInput from '@/components/ui/PinInput'

const genders = ['MALE', 'FEMALE', 'OTHER'] as const
const employmentTypes = ['FULL_TIME', 'PART_TIME', 'CASUAL', 'CONTRACT', 'INTERN'] as const
const statuses = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'] as const
const salaryTypes = ['MONTHLY', 'DAILY', 'HOURLY'] as const
const paymentMethods = ['BANK_TRANSFER', 'MPESA', 'CASH', 'CHEQUE'] as const

type Gender = (typeof genders)[number]
type DeptOption = { id: string; name: string; isActive: boolean }
type EmploymentType = (typeof employmentTypes)[number]
type Status = (typeof statuses)[number]
type SalaryType = (typeof salaryTypes)[number]
type PaymentMethod = (typeof paymentMethods)[number]

type Employee = {
  id: string
  firstName: string
  lastName: string
  gender: Gender | null
  dateOfBirth: string | null
  nationalId: string | null
  phone: string
  alternativePhone: string | null
  email: string | null
  address: string | null
  departmentId: string
  department: { id: string; name: string }
  jobTitle: string
  employmentType: EmploymentType
  status: Status
  dateHired: string
  supervisorId: string | null
  supervisor: { id: string; firstName: string; lastName: string } | null
  isSupervisor: boolean
  roleId: string | null
  role: { id: string; name: string } | null
  locations: { id: string; name: string }[]
  salaryType: SalaryType
  salaryAmount: string
  paymentMethod: PaymentMethod
  bankName: string | null
  bankAccountNumber: string | null
  mpesaNumber: string | null
  kraPin: string | null
  nssfNumber: string | null
  shaNumber: string | null
  employeeCode: string
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  createdAt: string
}

type Summary = { total: number; active: number; onLeave: number; suspended: number; terminated: number }

type EmployeeForm = {
  firstName: string
  lastName: string
  gender: Gender | ''
  dateOfBirth: string
  nationalId: string
  phone: string
  alternativePhone: string
  email: string
  address: string
  departmentId: string
  jobTitle: string
  employmentType: EmploymentType
  status: Status
  dateHired: string
  supervisorId: string
  isSupervisor: boolean
  roleId: string
  locationIds: string[]
  salaryType: SalaryType
  salaryAmount: string
  paymentMethod: PaymentMethod
  bankName: string
  bankAccountNumber: string
  mpesaNumber: string
  kraPin: string
  nssfNumber: string
  shaNumber: string
  employeeCode: string
  pin: string
  confirmPin: string
  emergencyContactName: string
  emergencyContactPhone: string
}

const emptyForm: EmployeeForm = {
  firstName: '', lastName: '', gender: '', dateOfBirth: '', nationalId: '',
  phone: '', alternativePhone: '', email: '', address: '',
  departmentId: '', jobTitle: '', employmentType: 'FULL_TIME', status: 'ACTIVE', dateHired: '', supervisorId: '', isSupervisor: false, roleId: '', locationIds: [],
  salaryType: 'MONTHLY', salaryAmount: '', paymentMethod: 'BANK_TRANSFER', bankName: '', bankAccountNumber: '', mpesaNumber: '',
  kraPin: '', nssfNumber: '', shaNumber: '',
  employeeCode: '', pin: '', confirmPin: '',
  emergencyContactName: '', emergencyContactPhone: '',
}

const titleCase = (value: string) => value.toLowerCase().split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')

const statusStyles: Record<Status, string> = {
  ACTIVE: 'border-success/70 text-success',
  ON_LEAVE: 'border-warning/70 text-warning',
  SUSPENDED: 'border-destructive/70 text-destructive',
  TERMINATED: 'border-muted-foreground/50 text-muted-foreground',
}

const salarySuffix: Record<SalaryType, string> = { MONTHLY: '/mo', DAILY: '/day', HOURLY: '/hr' }

export default function Employees() {
  const toast = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<DeptOption[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, onLeave: 0, suspended: 0, terminated: 0 })
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (departmentFilter) query.set('departmentId', departmentFilter)
      if (statusFilter) query.set('status', statusFilter)
      const response = await api<{ employees: Employee[]; summary: Summary }>(`/employees${query.size ? `?${query}` : ''}`)
      setEmployees(response.employees)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load employees'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [departmentFilter, search, statusFilter, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadEmployees(), 250)
    return () => window.clearTimeout(timer)
  }, [loadEmployees])

  useEffect(() => {
    api<{ roles: { id: string; name: string }[] }>('/roles')
      .then((response) => setRoles(response.roles))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load roles'))
    api<{ locations: { id: string; name: string }[] }>('/locations')
      .then((response) => setLocations(response.locations))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load locations'))
    api<{ departments: DeptOption[] }>('/departments')
      .then((response) => setDepartmentOptions(response.departments))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load departments'))
  }, [toast])

  const initials = useMemo(() => (employee: Employee) => `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`.toUpperCase(), [])
  const supervisorOptions = useMemo(() => employees.filter((e) => e.id !== editing?.id), [employees, editing])
  const toggleLocation = (id: string) =>
    setForm((f) => ({ ...f, locationIds: f.locationIds.includes(id) ? f.locationIds.filter((x) => x !== id) : [...f.locationIds, id] }))

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setShowForm(true)
  }

  function openEdit(employee: Employee) {
    setEditing(employee)
    setForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      gender: employee.gender ?? '',
      dateOfBirth: employee.dateOfBirth?.slice(0, 10) ?? '',
      nationalId: employee.nationalId ?? '',
      phone: employee.phone,
      alternativePhone: employee.alternativePhone ?? '',
      email: employee.email ?? '',
      address: employee.address ?? '',
      departmentId: employee.departmentId,
      jobTitle: employee.jobTitle,
      employmentType: employee.employmentType,
      status: employee.status,
      dateHired: employee.dateHired.slice(0, 10),
      supervisorId: employee.supervisorId ?? '',
      isSupervisor: employee.isSupervisor,
      roleId: employee.roleId ?? '',
      locationIds: employee.locations.map((l) => l.id),
      salaryType: employee.salaryType,
      salaryAmount: employee.salaryAmount,
      paymentMethod: employee.paymentMethod,
      bankName: employee.bankName ?? '',
      bankAccountNumber: employee.bankAccountNumber ?? '',
      mpesaNumber: employee.mpesaNumber ?? '',
      kraPin: employee.kraPin ?? '',
      nssfNumber: employee.nssfNumber ?? '',
      shaNumber: employee.shaNumber ?? '',
      employeeCode: employee.employeeCode,
      pin: '',
      confirmPin: '',
      emergencyContactName: employee.emergencyContactName ?? '',
      emergencyContactPhone: employee.emergencyContactPhone ?? '',
    })
    setError('')
    setShowForm(true)
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault()
    if (form.pin && form.pin !== form.confirmPin) { setError("PIN and confirmation don't match"); return }
    setSaving(true)
    setError('')
    try {
      const { confirmPin: _confirmPin, ...rest } = form
      const payload = { ...rest, ...(editing && !form.pin ? { pin: undefined } : {}) }
      await api(editing ? `/employees/${editing.id}` : '/employees', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      const message = editing ? 'Employee record updated.' : 'New employee added.'
      toast.success(message)
      setShowForm(false)
      await loadEmployees()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save employee'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEmployee(employee: Employee) {
    if (!window.confirm(`Permanently delete ${employee.firstName} ${employee.lastName}?`)) return
    setError('')
    try {
      await api(`/employees/${employee.id}`, { method: 'DELETE' })
      toast.success('Employee deleted.')
      await loadEmployees()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete employee'
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Team" title="Employees" />

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {([
          ['Total employees', summary.total, <LuUsers key="all" />],
          ['Active', summary.active, <LuUserCheck key="active" />],
          ['On leave', summary.onLeave, <LuBriefcaseBusiness key="leave" />],
        ] as const).map(([label, value, icon], i) => (
          <StatCard key={label} index={i} label={label} value={value} icon={icon} />
        ))}
      </section>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
          <label className="relative flex-1">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, phone…"
              className="w-full rounded-sm border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none">
            <option value="">All departments</option>
            {departmentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-sm border bg-background px-3 py-2.5 text-sm outline-none">
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
          <ActionButton tone="primary" icon={<LuPlus />} onClick={openCreate}>Add employee</ActionButton>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="animate-spin" /> Loading employees…
          </div>
        ) : employees.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No employees match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Employee</th>
                  <th className="px-5 py-3 font-bold">Department / Role</th>
                  <th className="px-5 py-3 font-bold">Contact</th>
                  <th className="px-5 py-3 font-bold">Supervisor</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 font-bold">Salary</th>
                  <th className="px-5 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-full bg-linear-to-br from-secondary to-accent text-xs font-bold text-white">
                          {initials(employee)}
                        </span>
                        <div>
                          <p className="font-semibold">{employee.firstName} {employee.lastName}</p>
                          <p className="text-xs text-muted-foreground">{employee.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-sm bg-secondary/10 px-2.5 py-1 text-xs font-semibold text-secondary">{employee.department.name}</span>
                      <p className="mt-1 text-xs text-muted-foreground">{employee.jobTitle}</p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{employee.phone}</td>
                    <td className="px-5 py-4">
                      {employee.isSupervisor ? (
                        <span className="keep-round border border-dashed border-secondary/70 px-2.5 py-1 text-xs font-semibold text-secondary">Yes</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`keep-round border border-dashed px-2.5 py-1 text-xs font-semibold ${statusStyles[employee.status]}`}>{titleCase(employee.status)}</span>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      KES {Number(employee.salaryAmount).toLocaleString('en-KE')}{salarySuffix[employee.salaryType]}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <ActionButton tone="neutral" icon={<LuPencil />} title="Edit employee" onClick={() => openEdit(employee)} />
                        <ActionButton tone="neutral" icon={<LuTrash2 />} title="Delete employee" onClick={() => void deleteEmployee(employee)} />
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <form onSubmit={saveEmployee} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto border-2 border-foreground/25 bg-card p-6 shadow-[8px_8px_0_0_rgba(0,0,0,0.25)]">
            <div className="-mx-6 -mt-6 mb-5 border-b-4 border-accent bg-muted/60 px-6 py-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary">{editing ? 'Edit employee' : 'New employee'}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{editing ? `${editing.firstName} ${editing.lastName}` : 'Add a team member'}</h2>
            </div>

            <FieldGroup title="Personal">
              <Field label="First Name" required><input required placeholder="e.g. Faith" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="input" /></Field>
              <Field label="Last Name" required><input required placeholder="e.g. Wanjiru" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="input" /></Field>
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })} className="input">
                  <option value="">Select gender</option>
                  {genders.map((g) => <option key={g} value={g}>{titleCase(g)}</option>)}
                </select>
              </Field>
              <Field label="Date of Birth"><input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="input" /></Field>
              <Field label="National ID" className="sm:col-span-2"><input placeholder="e.g. 30123456" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Contact">
              <Field label="Phone" required><input required type="tel" placeholder="e.g. 0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></Field>
              <Field label="Alternative Phone"><input type="tel" placeholder="e.g. 0733 987 654" value={form.alternativePhone} onChange={(e) => setForm({ ...form, alternativePhone: e.target.value })} className="input" /></Field>
              <Field label="Email"><input type="email" placeholder="e.g. faith@hotel.co.ke" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></Field>
              <Field label="Address"><input placeholder="e.g. Ngong Road, Nairobi" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Employment">
              <Field label="Department" required>
                <select required value={form.departmentId} onChange={(e) => {
                  const departmentId = e.target.value
                  const isHousekeeping = departmentOptions.find((d) => d.id === departmentId)?.name.toLowerCase() === 'housekeeping'
                  const housekeepingRole = roles.find((r) => r.name === 'Housekeeping')
                  // Housekeeping staff normally get the Housekeeping role; only pre-fill when none is chosen yet.
                  setForm({ ...form, departmentId, ...(isHousekeeping && housekeepingRole && !form.roleId ? { roleId: housekeepingRole.id } : {}) })
                }} className="input">
                  <option value="" disabled>Select department</option>
                  {departmentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}{d.isActive ? '' : ' (inactive)'}</option>)}
                </select>
              </Field>
              <Field label="Job Title" required><input required placeholder="e.g. Chef, Storekeeper" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className="input" /></Field>
              <Field label="Employment Type">
                <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })} className="input">
                  {employmentTypes.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })} className="input">
                  {statuses.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </select>
              </Field>
              <Field label="Date Hired" required><input required type="date" value={form.dateHired} onChange={(e) => setForm({ ...form, dateHired: e.target.value })} className="input" /></Field>
              <Field label="Supervisor">
                <select value={form.supervisorId} onChange={(e) => setForm({ ...form, supervisorId: e.target.value })} className="input">
                  <option value="">No supervisor</option>
                  {supervisorOptions.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </Field>
              <Field label="Is supervisor">
                <label className="flex items-center gap-2 rounded-sm border bg-muted/40 px-3 py-2 text-sm font-medium">
                  <input type="checkbox" checked={form.isSupervisor} onChange={(e) => setForm({ ...form, isSupervisor: e.target.checked })} className="size-4 accent-secondary" />
                  {departmentOptions.find((d) => d.id === form.departmentId)?.name.toLowerCase() === 'housekeeping'
                    ? 'Housekeeping supervisor: sees every task, assigns work, approves shifts'
                    : 'Can approve shift starts and handovers'}
                </label>
              </Field>
              <Field label="Role" required>
                <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="input">
                  <option value="" disabled>Select a role</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Working Locations" className="sm:col-span-2">
                {locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No locations set up — staff work anywhere by default.</p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {locations.map((l) => (
                        <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-sm border bg-muted/40 px-3 py-2 text-sm">
                          <input type="checkbox" checked={form.locationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} className="size-4 accent-secondary" />
                          {l.name}
                        </label>
                      ))}
                    </div>
                    <span className="mt-1.5 block text-xs text-muted-foreground">
                      {form.locationIds.length === 0
                        ? 'None selected — can work at any location (the POS asks which each time).'
                        : form.locationIds.length === 1
                          ? 'Pinned to one location — the POS uses it automatically.'
                          : 'Pinned to several — the POS lets them pick one of these per sale.'}
                    </span>
                  </>
                )}
              </Field>
            </FieldGroup>

            <FieldGroup title="Compensation">
              <Field label="Salary Type">
                <select value={form.salaryType} onChange={(e) => setForm({ ...form, salaryType: e.target.value as SalaryType })} className="input">
                  {salaryTypes.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </select>
              </Field>
              <Field label="Salary Amount (KES)" required><input required type="number" min="0" step="1" placeholder="e.g. 45000" value={form.salaryAmount} onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })} className="input" /></Field>
              <Field label="Payment Method">
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })} className="input">
                  {paymentMethods.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}
                </select>
              </Field>
              <Field label="Bank Name"><input placeholder="e.g. Equity Bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="input" /></Field>
              <Field label="Bank Account Number"><input placeholder="e.g. 0123456789" value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} className="input" /></Field>
              <Field label="M-Pesa Number"><input placeholder="e.g. 0712 345 678" value={form.mpesaNumber} onChange={(e) => setForm({ ...form, mpesaNumber: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Statutory">
              <Field label="KRA PIN"><input placeholder="e.g. A123456789X" value={form.kraPin} onChange={(e) => setForm({ ...form, kraPin: e.target.value })} className="input" /></Field>
              <Field label="NSSF Number"><input placeholder="e.g. 123456789" value={form.nssfNumber} onChange={(e) => setForm({ ...form, nssfNumber: e.target.value })} className="input" /></Field>
              <Field label="SHA / NHIF Number"><input placeholder="e.g. 987654321" value={form.shaNumber} onChange={(e) => setForm({ ...form, shaNumber: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <FieldGroup title="Till Login">
              <Field label="Employee Code" required>
                <input required placeholder="e.g. EMP-001" value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} className="input" />
              </Field>
              <div />
              <Field label={editing ? 'New PIN (optional)' : 'Login PIN'} required={!editing}>
                <PinInput required={!editing} placeholder="e.g. 4821" value={form.pin} onChange={(v) => setForm({ ...form, pin: v })} className="input" />
              </Field>
              <Field label={editing ? 'Confirm New PIN' : 'Confirm PIN'} required={!editing || form.pin !== ''}>
                <PinInput required={!editing || form.pin !== ''} placeholder="Re-enter the PIN" value={form.confirmPin} onChange={(v) => setForm({ ...form, confirmPin: v })} className="input" />
                {form.pin && form.confirmPin && form.pin !== form.confirmPin && (
                  <span className="mt-1 block text-xs text-destructive">Doesn't match the PIN above.</span>
                )}
              </Field>
            </FieldGroup>

            <FieldGroup title="Emergency Contact">
              <Field label="Contact Name"><input placeholder="e.g. Jane Wanjiru" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className="input" /></Field>
              <Field label="Contact Phone"><input type="tel" placeholder="e.g. 0712 345 678" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} className="input" /></Field>
            </FieldGroup>

            <div className="mt-6 flex justify-end gap-2 border-t pt-5">
              <button type="button" onClick={() => setShowForm(false)} className="border-2 border-foreground/20 bg-card px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted">Cancel</button>
              <button disabled={saving} className="inline-flex items-center gap-2 bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-60">
                {saving && <LuLoaderCircle className="animate-spin" />}
                {editing ? 'Save changes' : 'Create employee'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
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
    <label className={`text-sm font-medium ${className ?? ''}`}>
      {label}
      {required && <span className="text-destructive"> *</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}
