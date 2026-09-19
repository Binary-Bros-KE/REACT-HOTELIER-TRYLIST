import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  LuBanknote,
  LuCircleAlert,
  LuCircleCheck,
  LuEye,
  LuLoaderCircle,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuWalletCards,
  LuX,
} from 'react-icons/lu'

import Button from '@/components/ui/Button'
import ConfirmModal from '@/components/ui/ConfirmModal'
import StatCard from '@/components/ui/StatCard'
import { useToast } from '@/components/ui/Toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const paymentMethods = ['BANK_TRANSFER', 'MPESA', 'CASH', 'CHEQUE', 'CARD'] as const
const statuses = ['DRAFT', 'COMPLETE', 'VOIDED'] as const
const itemTypes = ['ALLOWANCE', 'DEDUCTION'] as const

type PaymentMethod = (typeof paymentMethods)[number]
type SalaryStatus = (typeof statuses)[number]
type ItemType = (typeof itemTypes)[number]

type Employee = {
  id: string
  firstName: string
  lastName: string
  employeeCode: string
  status: string
  salaryAmount: string | number
  salaryType: string
  paymentMethod: PaymentMethod
  department?: { id: string; name: string } | null
  defaultLocation?: { id: string; name: string } | null
}

type SalaryItem = {
  id: string
  type: ItemType
  label: string
  amount: string | number
}

type Salary = {
  id: string
  payslipNo: string
  employeeId: string
  employee: Employee
  payPeriod: string
  basicSalary: string | number
  totalAllowances: string | number
  totalDeductions: string | number
  carriedOverAmount?: string | number
  grossPay: string | number
  netPay: string | number
  paymentMethod: PaymentMethod | null
  reference: string | null
  notes: string | null
  status: SalaryStatus
  paidAt: string | null
  voidReason: string | null
  items: SalaryItem[]
  createdAt: string
}

type Summary = {
  count: number
  netPay: number
  allowances: number
  deductions: number
  byStatus: { status: SalaryStatus; count: number; netPay: number }[]
}

type LineDraft = { id?: string; label: string; amount: string }
type ProcessForm = {
  employeeId: string
  payPeriod: string
  basicSalary: string
  allowances: LineDraft[]
  deductions: LineDraft[]
  paymentMethod: PaymentMethod | ''
  reference: string
  notes: string
}

const money = (value: string | number) => `KSh ${Number(value).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const titleCase = (value: string) => value.toLowerCase().split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
const monthLabel = (value: string) => new Date(value).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
const monthValue = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const todayLabel = () => new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
const toApiMonth = (value: string) => `${value}-01`

const statusStyles: Record<SalaryStatus, string> = {
  DRAFT: 'border-warning/40 text-warning bg-warning/5',
  COMPLETE: 'border-success/40 text-success bg-success/5',
  VOIDED: 'border-muted-foreground/30 text-muted-foreground bg-muted',
}

const emptyProcess = (): ProcessForm => ({
  employeeId: '',
  payPeriod: monthValue(),
  basicSalary: '',
  allowances: [],
  deductions: [],
  paymentMethod: '',
  reference: '',
  notes: '',
})

export default function EmployeeSalaries() {
  const toast = useToast()
  const [salaries, setSalaries] = useState<Salary[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [summary, setSummary] = useState<Summary>({ count: 0, netPay: 0, allowances: 0, deductions: 0, byStatus: [] })
  const [search, setSearch] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [processOpen, setProcessOpen] = useState(false)
  const [detail, setDetail] = useState<Salary | null>(null)
  const [advanceForm, setAdvanceForm] = useState({ employeeId: '', payPeriod: monthValue(), deductions: [{ label: `Advance - ${todayLabel()}`, amount: '' }], notes: '' })
  const [processForm, setProcessForm] = useState<ProcessForm>(emptyProcess())
  // Completing a salary whose deductions exceed its gross pay: ask before
  // pushing the excess onto next month.
  const [carryPrompt, setCarryPrompt] = useState<{ excess: number; gross: number; deductions: number; monthName: string; retry: () => Promise<void> } | null>(null)
  const [newItem, setNewItem] = useState<{ type: ItemType; label: string; amount: string }>({ type: 'DEDUCTION', label: '', amount: '' })
  const [completeForm, setCompleteForm] = useState<{ paymentMethod: PaymentMethod | ''; reference: string; notes: string }>({ paymentMethod: '', reference: '', notes: '' })

  const activeEmployees = useMemo(() => employees.filter((employee) => employee.status === 'ACTIVE'), [employees])

  const loadSalaries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (year && !from && !to) query.set('year', year)
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      if (employeeFilter) query.set('employeeId', employeeFilter)
      if (locationFilter) query.set('locationId', locationFilter)
      if (statusFilter) query.set('status', statusFilter)
      const response = await api<{ salaries: Salary[]; summary: Summary }>(`/employee-salaries${query.size ? `?${query}` : ''}`)
      setSalaries(response.salaries)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load salaries'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [employeeFilter, from, locationFilter, search, statusFilter, to, toast, year])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSalaries(), 250)
    return () => window.clearTimeout(timer)
  }, [loadSalaries])

  useEffect(() => {
    api<{ employees: Employee[] }>('/employees')
      .then((response) => setEmployees(response.employees))
      .catch((cause) => toast.error(cause instanceof Error ? cause.message : 'Could not load employees'))
    api<{ locations: { id: string; name: string }[] }>('/locations')
      .then((response) => setLocations(response.locations))
      .catch(() => {})
  }, [toast])

  function existingDraft(employeeId: string, payPeriod: string) {
    return salaries.find((salary) => salary.employeeId === employeeId && salary.status === 'DRAFT' && salary.payPeriod.slice(0, 7) === payPeriod)
  }

  function updateProcess(next: Partial<ProcessForm>) {
    const merged = { ...processForm, ...next }
    const draft = existingDraft(merged.employeeId, merged.payPeriod)
    if (draft) {
      setProcessForm({
        ...merged,
        basicSalary: String(Number(draft.basicSalary) || ''),
        allowances: draft.items.filter((item) => item.type === 'ALLOWANCE').map((item) => ({ id: item.id, label: item.label, amount: String(item.amount) })),
        deductions: draft.items.filter((item) => item.type === 'DEDUCTION').map((item) => ({ id: item.id, label: item.label, amount: String(item.amount) })),
        paymentMethod: draft.paymentMethod ?? merged.paymentMethod,
        reference: draft.reference ?? merged.reference,
        notes: draft.notes ?? merged.notes,
      })
      return
    }
    if (next.employeeId) {
      const employee = employees.find((candidate) => candidate.id === next.employeeId)
      setProcessForm({ ...merged, basicSalary: employee ? String(Number(employee.salaryAmount) || '') : merged.basicSalary, paymentMethod: employee?.paymentMethod ?? merged.paymentMethod })
      return
    }
    setProcessForm(merged)
  }

  function openAdvance(employeeId = '') {
    setAdvanceForm({ employeeId, payPeriod: monthValue(), deductions: [{ label: `Advance - ${todayLabel()}`, amount: '' }], notes: '' })
    setAdvanceOpen(true)
    setError('')
  }

  function openProcess(employee?: Employee, salary?: Salary) {
    const base = emptyProcess()
    const next: ProcessForm = salary
      ? {
          employeeId: salary.employeeId,
          payPeriod: salary.payPeriod.slice(0, 7),
          basicSalary: String(Number(salary.basicSalary) || ''),
          allowances: salary.items.filter((item) => item.type === 'ALLOWANCE').map((item) => ({ id: item.id, label: item.label, amount: String(item.amount) })),
          deductions: salary.items.filter((item) => item.type === 'DEDUCTION').map((item) => ({ id: item.id, label: item.label, amount: String(item.amount) })),
          paymentMethod: salary.paymentMethod ?? salary.employee.paymentMethod ?? '',
          reference: salary.reference ?? '',
          notes: salary.notes ?? '',
        }
      : { ...base, employeeId: employee?.id ?? '', basicSalary: employee ? String(Number(employee.salaryAmount) || '') : '', paymentMethod: employee?.paymentMethod ?? '' }
    setProcessForm(next)
    setProcessOpen(true)
    setError('')
  }

  async function recordAdvance(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api('/employee-salaries/advance', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: advanceForm.employeeId,
          payPeriod: toApiMonth(advanceForm.payPeriod),
          deductions: cleanLines(advanceForm.deductions),
          notes: advanceForm.notes,
        }),
      })
      setNotice('Salary advance recorded as a draft deduction.')
      toast.success('Salary advance recorded.')
      setAdvanceOpen(false)
      await loadSalaries()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not record advance'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function processSalary(complete: boolean, carryOverDeductions = false) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api('/employee-salaries/process', {
        method: 'POST',
        body: JSON.stringify({
          ...processForm,
          payPeriod: toApiMonth(processForm.payPeriod),
          basicSalary: Number(processForm.basicSalary || 0),
          allowances: cleanLines(processForm.allowances),
          deductions: cleanLines(processForm.deductions),
          paymentMethod: processForm.paymentMethod || undefined,
          complete,
          carryOverDeductions,
        }),
      })
      setNotice(complete ? (carryOverDeductions ? 'Salary completed; excess deductions carried to next month.' : 'Salary completed and payment recorded.') : 'Salary draft saved.')
      toast.success(complete ? 'Salary completed.' : 'Salary draft saved.')
      setProcessOpen(false)
      await loadSalaries()
    } catch (cause) {
      if (askToCarryOver(cause, processForm.payPeriod, () => processSalary(true, true))) return
      const message = cause instanceof Error ? cause.message : 'Could not save salary'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault()
    if (!detail) return
    setSaving(true)
    try {
      const response = await api<{ salary: Salary }>(`/employee-salaries/${detail.id}/items`, { method: 'POST', body: JSON.stringify({ ...newItem, amount: Number(newItem.amount || 0) }) })
      setDetail(response.salary)
      setNewItem({ type: 'DEDUCTION', label: '', amount: '' })
      await loadSalaries()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not add salary item')
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(itemId: string) {
    if (!detail) return
    setSaving(true)
    try {
      const response = await api<{ salary: Salary }>(`/employee-salaries/${detail.id}/items/${itemId}`, { method: 'DELETE' })
      setDetail(response.salary)
      await loadSalaries()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not remove salary item')
    } finally {
      setSaving(false)
    }
  }

  function askToCarryOver(cause: unknown, payPeriod: string, retry: () => Promise<void>) {
    const failure = cause as { code?: string; data?: { excess: number; gross: number; deductions: number } }
    if (failure.code !== 'DEDUCTIONS_EXCEED' || !failure.data) return false
    const [year, month] = payPeriod.split('-').map(Number)
    const monthName = new Date(year, month, 1).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
    setCarryPrompt({ excess: failure.data.excess, gross: failure.data.gross, deductions: failure.data.deductions, monthName, retry })
    return true
  }

  async function completeDraft(event: FormEvent, carryOverDeductions = false) {
    event.preventDefault()
    if (!detail) return
    setSaving(true)
    try {
      const response = await api<{ salary: Salary }>(`/employee-salaries/${detail.id}/complete`, { method: 'POST', body: JSON.stringify({ ...completeForm, carryOverDeductions }) })
      setDetail(response.salary)
      toast.success(carryOverDeductions ? 'Salary completed; excess deductions carried to next month.' : 'Salary completed.')
      await loadSalaries()
    } catch (cause) {
      if (askToCarryOver(cause, detail.payPeriod.slice(0, 7), () => completeDraft(event, true))) return
      toast.error(cause instanceof Error ? cause.message : 'Could not complete salary')
    } finally {
      setSaving(false)
    }
  }

  async function voidSalary(salary: Salary) {
    const reason = window.prompt(`Void ${salary.payslipNo}? Enter the reason.`)
    if (!reason?.trim()) return
    try {
      await api(`/employee-salaries/${salary.id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
      toast.success('Salary voided.')
      setDetail(null)
      await loadSalaries()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not void salary')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-secondary">Team</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Employee Salaries</h1>
          <p className="mt-2 text-sm text-muted-foreground">Every processed payroll record, newest first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openAdvance()}>
            <LuWalletCards /> Record advance
          </Button>
          <Button onClick={() => openProcess()}>
            <LuPlus /> Process salary
          </Button>
        </div>
      </header>

      <section className="mt-7 grid gap-3 md:grid-cols-4">
        <StatCard icon={<LuBanknote />} label="Payroll records" value={summary.count} />
        <StatCard tone="success" icon={<LuCircleCheck />} label="Net pay" value={money(summary.netPay)} />
        <StatCard index={2} icon={<LuPlus />} label="Allowances" value={money(summary.allowances)} />
        <StatCard tone="danger" icon={<LuWalletCards />} label="Deductions" value={money(summary.deductions)} />
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1.5fr_8rem_1fr_1fr_1fr_1fr]">
          <label className="relative">
            <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search payslip #, employee..." className="input pl-10" />
          </label>
          <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className="input" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input">
            <option value="">All employees</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
          </select>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="input">
            <option value="">All storefronts</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input lg:col-start-6">
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LuLoaderCircle className="animate-spin" /> Loading salaries...
          </div>
        ) : salaries.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No salary records match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Payslip #</th>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Pay period</th>
                  <th className="px-5 py-3 text-right">Net pay</th>
                  <th className="px-5 py-3">Payment method</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((salary) => (
                  <tr key={salary.id} className="border-t transition hover:bg-muted/30">
                    <td className="px-5 py-4 font-semibold">{salary.payslipNo}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{salary.employee.firstName} {salary.employee.lastName}</p>
                      <p className="text-xs text-muted-foreground">{salary.employee.employeeCode}{salary.employee.defaultLocation ? ` · ${salary.employee.defaultLocation.name}` : ''}</p>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{monthLabel(salary.payPeriod)}</td>
                    <td className="px-5 py-4 text-right font-semibold">{money(salary.netPay)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{salary.paymentMethod ? titleCase(salary.paymentMethod) : '-'}</td>
                    <td className="px-5 py-4"><StatusBadge status={salary.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setDetail(salary); setCompleteForm({ paymentMethod: salary.paymentMethod ?? salary.employee.paymentMethod ?? '', reference: salary.reference ?? '', notes: salary.notes ?? '' }) }} title="View payslip" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuEye /></button>
                        {salary.status === 'DRAFT' && <button onClick={() => openProcess(salary.employee, salary)} title="Process draft" className="rounded-sm p-2 text-muted-foreground hover:bg-secondary/10 hover:text-secondary"><LuBanknote /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal
        open={carryPrompt !== null}
        tone="warning"
        title="Deductions exceed basic salary"
        message={carryPrompt ? `Deductions (${money(carryPrompt.deductions)}) are ${money(carryPrompt.excess)} more than this month's pay (${money(carryPrompt.gross)}). Do you wish to carry the extra ${money(carryPrompt.excess)} over to ${carryPrompt.monthName}?` : undefined}
        confirmLabel="Carry over deductions"
        cancelLabel="Not now"
        loading={saving}
        onCancel={() => setCarryPrompt(null)}
        onConfirm={() => { const prompt = carryPrompt; setCarryPrompt(null); if (prompt) void prompt.retry() }}
      />

      {advanceOpen && (
        <Modal title="Record Salary Advance" subtitle="Opens a draft payslip with this as a deduction. Nothing is paid out from here, and the full payslip is completed later at month-end." onClose={() => setAdvanceOpen(false)}>
          <form onSubmit={recordAdvance} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Employee" required>
                <select required value={advanceForm.employeeId} onChange={(e) => setAdvanceForm({ ...advanceForm, employeeId: e.target.value })} className="input">
                  <option value="">Select an employee</option>
                  {activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
                </select>
              </Field>
              <Field label="Pay period" required><input required type="month" value={advanceForm.payPeriod} onChange={(e) => setAdvanceForm({ ...advanceForm, payPeriod: e.target.value })} className="input" /></Field>
            </div>
            <LineEditor title="Deductions" lines={advanceForm.deductions} onChange={(lines) => setAdvanceForm({ ...advanceForm, deductions: lines })} addLabel="Add line" />
            <Field label="Notes"><textarea value={advanceForm.notes} onChange={(e) => setAdvanceForm({ ...advanceForm, notes: e.target.value })} className="input min-h-20" placeholder="Optional - how the advance was paid out, reason, etc." /></Field>
            <ModalActions saving={saving} onCancel={() => setAdvanceOpen(false)} primary="Record advance" />
          </form>
        </Modal>
      )}

      {processOpen && (
        <Modal title="Process Salary" subtitle="Creates or updates a monthly payslip. Save as draft while you are still collecting allowances and deductions, then complete payment at month-end." onClose={() => setProcessOpen(false)}>
          <form onSubmit={(event) => { event.preventDefault(); void processSalary(false) }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Employee" required>
                <select required value={processForm.employeeId} onChange={(e) => updateProcess({ employeeId: e.target.value })} className="input">
                  <option value="">Select an employee</option>
                  {activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
                </select>
              </Field>
              <Field label="Pay period" required><input required type="month" value={processForm.payPeriod} onChange={(e) => updateProcess({ payPeriod: e.target.value })} className="input" /></Field>
              <Field label="Basic salary" required><input required type="number" min="0" step="0.01" value={processForm.basicSalary} onChange={(e) => updateProcess({ basicSalary: e.target.value })} className="input" placeholder="0.00" /></Field>
              <Field label="Payment method">
                <select value={processForm.paymentMethod} onChange={(e) => updateProcess({ paymentMethod: e.target.value as PaymentMethod })} className="input">
                  <option value="">Select payment method</option>
                  {paymentMethods.map((method) => <option key={method} value={method}>{titleCase(method)}</option>)}
                </select>
              </Field>
            </div>
            <LineEditor title="Allowances" lines={processForm.allowances} onChange={(lines) => updateProcess({ allowances: lines })} addLabel="Add allowance" />
            <LineEditor title="Deductions" lines={processForm.deductions} onChange={(lines) => updateProcess({ deductions: lines })} addLabel="Add deduction" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reference"><input value={processForm.reference} onChange={(e) => updateProcess({ reference: e.target.value })} className="input" placeholder="Transaction code, cheque no..." /></Field>
              <Field label="Notes"><textarea value={processForm.notes} onChange={(e) => updateProcess({ notes: e.target.value })} className="input min-h-20" /></Field>
            </div>
            <div className="rounded-sm border bg-muted/40 p-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-4">
                <SummaryCell label="Gross" value={money(totalProcess().gross)} />
                <SummaryCell label="Allowances" value={money(totalProcess().allowances)} />
                <SummaryCell label="Deductions" value={money(totalProcess().deductions)} />
                <SummaryCell label="Net pay" value={money(totalProcess().net)} strong />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-5">
              <Button variant="secondary" onClick={() => setProcessOpen(false)}>Cancel</Button>
              <Button variant="secondary" type="submit" disabled={saving}>{saving && <LuLoaderCircle className="animate-spin" />} Save draft</Button>
              <Button onClick={() => void processSalary(true)} disabled={saving}>{saving && <LuLoaderCircle className="animate-spin" />} Complete payment</Button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.payslipNo} subtitle={`${detail.employee.firstName} ${detail.employee.lastName} - ${monthLabel(detail.payPeriod)}`} onClose={() => setDetail(null)}>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <SummaryCell label="Basic salary" value={money(detail.basicSalary)} />
              <SummaryCell label="Allowances" value={money(detail.totalAllowances)} />
              <SummaryCell label="Deductions" value={money(detail.totalDeductions)} />
              <SummaryCell label="Net pay" value={money(detail.netPay)} strong />
              {Number(detail.carriedOverAmount ?? 0) > 0 && <SummaryCell label="Carried to next month" value={money(detail.carriedOverAmount ?? 0)} />}
            </div>
            <div className="overflow-hidden rounded-sm border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/70 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr>
                </thead>
                <tbody>
                  {detail.items.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No allowances or deductions added.</td></tr>
                  ) : detail.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-3"><span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold', item.type === 'ALLOWANCE' ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive')}>{titleCase(item.type)}</span></td>
                      <td className="px-4 py-3 font-medium">{item.label}</td>
                      <td className="px-4 py-3 text-right">{money(item.amount)}</td>
                      <td className="px-4 py-3 text-right">{detail.status === 'DRAFT' && <button onClick={() => void removeItem(item.id)} className="rounded-sm p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><LuTrash2 /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.status === 'DRAFT' && (
              <form onSubmit={addItem} className="grid gap-3 rounded-sm border bg-muted/30 p-3 sm:grid-cols-[10rem_1fr_10rem_auto]">
                <select value={newItem.type} onChange={(e) => setNewItem({ ...newItem, type: e.target.value as ItemType })} className="input">{itemTypes.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}</select>
                <input required value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} className="input" placeholder="Description" />
                <input required type="number" min="0" step="0.01" value={newItem.amount} onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })} className="input" placeholder="0.00" />
                <Button type="submit" disabled={saving}><LuPlus /> Add</Button>
              </form>
            )}
            {detail.status === 'DRAFT' ? (
              <form onSubmit={completeDraft} className="space-y-4 border-t pt-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Payment method" required>
                    <select required value={completeForm.paymentMethod} onChange={(e) => setCompleteForm({ ...completeForm, paymentMethod: e.target.value as PaymentMethod })} className="input">
                      <option value="">Select payment method</option>
                      {paymentMethods.map((method) => <option key={method} value={method}>{titleCase(method)}</option>)}
                    </select>
                  </Field>
                  <Field label="Reference"><input value={completeForm.reference} onChange={(e) => setCompleteForm({ ...completeForm, reference: e.target.value })} className="input" /></Field>
                </div>
                <Field label="Notes"><textarea value={completeForm.notes} onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })} className="input min-h-20" /></Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => openProcess(detail.employee, detail)}>Edit draft</Button>
                  <Button type="submit" disabled={saving}>{saving && <LuLoaderCircle className="animate-spin" />} Complete salary</Button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between border-t pt-5">
                <div><StatusBadge status={detail.status} /> {detail.paymentMethod && <span className="ml-2 text-sm text-muted-foreground">{titleCase(detail.paymentMethod)}</span>}</div>
                {detail.status === 'COMPLETE' && <Button variant="secondary" onClick={() => void voidSalary(detail)}>Void payslip</Button>}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )

  function totalProcess() {
    const allowances = sumLines(processForm.allowances)
    const deductions = sumLines(processForm.deductions)
    const gross = Number(processForm.basicSalary || 0) + allowances
    return { allowances, deductions, gross, net: gross - deductions }
  }
}

function cleanLines(lines: LineDraft[]) {
  return lines.filter((line) => line.label.trim() && Number(line.amount) > 0).map((line) => ({ ...(line.id ? { id: line.id } : {}), label: line.label.trim(), amount: Number(line.amount) }))
}

function sumLines(lines: LineDraft[]) {
  return cleanLines(lines).reduce((sum, line) => sum + line.amount, 0)
}

function StatusBadge({ status }: { status: SalaryStatus }) {
  return <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase', statusStyles[status])}>{titleCase(status)}</span>
}

function Alert({ children, tone }: { children: ReactNode; tone: 'error' | 'success' }) {
  return (
    <div className={cn('mt-5 flex items-center gap-2 rounded-sm border p-3 text-sm', tone === 'error' ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-success/25 bg-success/10 text-success')}>
      {tone === 'error' ? <LuCircleAlert /> : <LuCircleCheck />}
      {children}
    </div>
  )
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/55 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-sm border bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">{title}</h2>
            {subtitle && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-sm p-2 text-muted-foreground hover:bg-muted"><LuX /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ saving, onCancel, primary }: { saving: boolean; onCancel: () => void; primary: string }) {
  return (
    <div className="flex justify-end gap-2 border-t pt-5">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving && <LuLoaderCircle className="animate-spin" />}{primary}</Button>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}<span className="mt-1.5 block">{children}</span></label>
}

function LineEditor({ title, lines, addLabel, onChange }: { title: string; lines: LineDraft[]; addLabel: string; onChange: (lines: LineDraft[]) => void }) {
  const update = (index: number, patch: Partial<LineDraft>) => onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <button type="button" onClick={() => onChange([...lines, { label: '', amount: '' }])} className="inline-flex items-center gap-1 text-sm font-semibold text-secondary"><LuPlus /> {addLabel}</button>
      </div>
      {lines.length === 0 ? <p className="text-sm text-muted-foreground">None added.</p> : (
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <input value={line.label} onChange={(e) => update(index, { label: e.target.value })} className="input" placeholder={`${title.slice(0, -1)} description`} />
              <input type="number" min="0" step="0.01" value={line.amount} onChange={(e) => update(index, { amount: e.target.value })} className="input" placeholder="0.00" />
              <button type="button" onClick={() => onChange(lines.filter((_, i) => i !== index))} className="rounded-sm border px-3 text-muted-foreground hover:bg-muted"><LuX /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-sm border bg-card p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display text-lg', strong && 'font-semibold')}>{value}</p>
    </div>
  )
}
