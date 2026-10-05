import { useCallback, useEffect, useState } from 'react'
import { LuBanknote, LuDownload, LuLayers, LuUsers, LuWallet } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportDocData, ReportSection } from '@/components/documents/pdf'
import { downloadCsvRows } from '@/lib/csv'

type Totals = { count: number; basic: number; allowances: number; deductions: number; gross: number; net: number }
type Group = Totals & { key: string; name: string }
type SalaryReport = {
  range: { from: string | null; to: string | null }
  totals: Totals
  byEmployee: Group[]
  byLocation: Group[]
  byDepartment: Group[]
  byMonth: Group[]
}
type Option = { id: string; name: string }

const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const SECTIONS: { key: 'byEmployee' | 'byLocation' | 'byDepartment' | 'byMonth'; title: string; label: string }[] = [
  { key: 'byEmployee', title: 'By employee', label: 'Employee' },
  { key: 'byLocation', title: 'By location', label: 'Location' },
  { key: 'byDepartment', title: 'By department', label: 'Department' },
  { key: 'byMonth', title: 'By month', label: 'Month' },
]

const HEADINGS = ['Payslips', 'Basic', 'Allowances', 'Deductions', 'Gross', 'Net']
const groupCells = (g: Totals) => [g.count, formatKes(g.basic), formatKes(g.allowances), formatKes(g.deductions), formatKes(g.gross), formatKes(g.net)]

export default function SalariesReport() {
  const today = new Date()
  // A pay period is a whole month, so the report is picked by month.
  const [month, setMonth] = useState(isoDay(monthStart(today)).slice(0, 7))
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [locations, setLocations] = useState<Option[]>([])
  const [departments, setDepartments] = useState<Option[]>([])
  const [report, setReport] = useState<SalaryReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ locations: Option[] }>('/locations').then((r) => setLocations(r.locations ?? [])).catch(() => {})
    api<{ departments: Option[] }>('/departments').then((r) => setDepartments(r.departments ?? [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ month })
      if (locationId) query.set('locationId', locationId)
      if (departmentId) query.set('departmentId', departmentId)
      setReport(await api<SalaryReport>(`/employee-salaries/report?${query}`))
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : 'Could not load the salaries report')
    } finally {
      setLoading(false)
    }
  }, [month, locationId, departmentId])

  useEffect(() => { if (hasApiTenant()) void load() }, [load])

  function exportCsv(data: SalaryReport) {
    const rows: (string | number)[][] = [['Section', 'Name', ...HEADINGS]]
    rows.push(['Total', 'All', ...groupCells(data.totals)])
    for (const section of SECTIONS) {
      for (const group of data[section.key]) rows.push([section.title, group.name, ...groupCells(group)])
    }
    downloadCsvRows('salaries-report', rows)
  }

  function buildReportDoc(data: SalaryReport): ReportDocData {
    const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
    const sections: ReportSection[] = SECTIONS.map((section) => ({
      title: section.title,
      columns: [{ label: section.label }, ...HEADINGS.map((label) => ({ label, align: 'right' as const }))],
      rows: data[section.key].map((group) => [group.name, ...groupCells(group)]),
    }))
    return {
      reportTitle: 'Salaries Report',
      kicker: 'Reports',
      rangeLabel: monthName,
      generatedAt: new Date().toISOString(),
      cards: [
        { label: 'Net pay', value: formatKes(data.totals.net) },
        { label: 'Gross pay', value: formatKes(data.totals.gross) },
        { label: 'Allowances', value: formatKes(data.totals.allowances) },
        { label: 'Deductions', value: formatKes(data.totals.deductions) },
        { label: 'Payslips', value: String(data.totals.count) },
      ],
      sections,
    }
  }

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  const totals = report?.totals
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageBanner kicker="Reports" title="Salaries Report" />

      <div className="mt-6 space-y-3 rounded-sm border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pay month
            <input type="month" className="input mt-1 block" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location
            <select className="input mt-1 block" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department
            <select className="input mt-1 block" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            <ActionButton tone="primary" icon={<LuDownload />} disabled={!report || loading} onClick={() => report && exportCsv(report)}>Export Excel</ActionButton>
            <PrintReportButton data={report ? buildReportDoc(report) : null} disabled={loading} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Completed salaries for the chosen pay month. Export opens in Excel.</p>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {totals && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard index={0} label="Net pay" value={formatKes(totals.net)} icon={<LuBanknote className="size-4" />} />
            <StatCard index={1} label="Gross pay" value={formatKes(totals.gross)} icon={<LuWallet className="size-4" />} />
            <StatCard index={2} label="Allowances" value={formatKes(totals.allowances)} icon={<LuLayers className="size-4" />} />
            <StatCard index={3} label="Deductions" value={formatKes(totals.deductions)} icon={<LuLayers className="size-4" />} />
            <StatCard index={4} label="Payslips" value={String(totals.count)} icon={<LuUsers className="size-4" />} />
          </section>

          {SECTIONS.map((section) => (
            <section key={section.key} className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
              <header className="border-b border-l-4 border-l-accent p-4"><h2 className="font-display text-lg font-semibold leading-tight">{section.title}</h2></header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-primary text-xs uppercase text-primary-foreground">
                    <tr>
                      <th className="px-4 py-2.5">{section.label}</th>
                      {HEADINGS.map((h) => <th key={h} className="px-4 py-2.5 text-right">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {report![section.key].length === 0 && <tr><td colSpan={HEADINGS.length + 1} className="px-4 py-6 text-center text-muted-foreground">No completed salaries in this range.</td></tr>}
                    {report![section.key].map((group) => (
                      <tr key={group.key} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{group.name}</td>
                        {groupCells(group).map((cell, i) => <td key={i} className="px-4 py-2.5 text-right tabular-nums">{cell}</td>)}
                      </tr>
                    ))}
                    {report![section.key].length > 0 && (
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="px-4 py-2.5">Total</td>
                        {groupCells(totals).map((cell, i) => <td key={i} className="px-4 py-2.5 text-right tabular-nums">{cell}</td>)}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
