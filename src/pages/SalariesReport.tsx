import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LuBanknote, LuDownload, LuLayers, LuUsers, LuWallet } from 'react-icons/lu'
import { api, hasApiTenant } from '@/lib/api'
import ActionButton from '@/components/ui/ActionButton'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import PrintReportButton from '@/components/documents/PrintReportButton'
import type { ReportBreakdownCell, ReportDocData, ReportSection } from '@/components/documents/pdf'
import { downloadCsvRows } from '@/lib/csv'

type Totals = { count: number; basic: number; allowances: number; deductions: number; gross: number; net: number }
type ItemLine = { label: string; amount: number }
// allowanceItems / deductionItems / carriedOver come only on byEmployee groups.
// casual comes only on byEmployee groups: an employee whose employment type is Casual.
type Group = Totals & { key: string; name: string; casual?: boolean; allowanceItems?: ItemLine[]; deductionItems?: ItemLine[]; carriedOver?: number }
type Workers = '' | 'OFFICIAL' | 'CASUAL'
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

// What the report shows, in order. With all workers, By employee is split into official
// employees and casual workers (employment type Casual), each with its own subtotal.
type ViewSection = { id: string; title: string; label: string; groups: Group[]; total: Totals; employees: boolean; subtotal: boolean }
const sumGroups = (groups: Group[]): Totals => groups.reduce(
  (t, g) => ({ count: t.count + g.count, basic: t.basic + g.basic, allowances: t.allowances + g.allowances, deductions: t.deductions + g.deductions, gross: t.gross + g.gross, net: t.net + g.net }),
  { count: 0, basic: 0, allowances: 0, deductions: 0, gross: 0, net: 0 },
)
function viewSections(data: SalaryReport, workers: Workers): ViewSection[] {
  return SECTIONS.flatMap((section): ViewSection[] => {
    if (section.key !== 'byEmployee') return [{ id: section.key, title: section.title, label: section.label, groups: data[section.key], total: data.totals, employees: false, subtotal: false }]
    const official = data.byEmployee.filter((g) => !g.casual)
    const casual = data.byEmployee.filter((g) => g.casual)
    const part = (id: string, title: string, groups: Group[], subtotal: boolean): ViewSection => ({ id, title, label: 'Employee', groups, total: sumGroups(groups), employees: true, subtotal })
    if (workers === 'OFFICIAL') return [part('official', 'Official employees', official, false)]
    if (workers === 'CASUAL') return [part('casual', 'Casual workers', casual, false)]
    return [part('official', 'Official employees', official, true), ...(casual.length ? [part('casual', 'Casual workers', casual, true)] : [])]
  })
}
const WORKERS_LABEL: Record<Workers, string> = { '': '', OFFICIAL: 'Official employees only', CASUAL: 'Casual workers only' }

const HEADINGS = ['Payslips', 'Basic', 'Allowances', 'Deductions', 'Gross', 'Net']
const groupCells = (g: Totals) => [g.count, formatKes(g.basic), formatKes(g.allowances), formatKes(g.deductions), formatKes(g.gross), formatKes(g.net)]

// An employee's allowance / deduction lines under the column total, one per line, for the printed report.
const plainKes = (value: number) => value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
function itemLines(items: ItemLine[] | undefined, extra?: ItemLine) {
  return [...(items ?? []), ...(extra && extra.amount > 0 ? [extra] : [])].map((item) => `${item.label}: ${plainKes(item.amount)}`)
}
const carriedLine = (g: Group) => ({ label: 'Carried to next month', amount: -(g.carriedOver ?? 0) })
// With lines, the total leads in bold as "TOTAL: KSh ..." so it stands out from them.
function breakdownCell(total: number, lines: string[]): string | ReportBreakdownCell {
  return lines.length ? { head: `TOTAL: ${formatKes(total)}`, lines } : formatKes(total)
}
// Wider name column so two names stay on one line; Payslips is just a small count.
const printColumns = (label: string) => [
  { label, flex: 2 },
  { label: 'Payslips', align: 'right' as const, flex: 0.7 },
  { label: 'Basic', align: 'right' as const },
  { label: 'Allowances', align: 'right' as const, flex: 1.4 },
  { label: 'Deductions', align: 'right' as const, flex: 1.4 },
  { label: 'Gross', align: 'right' as const },
  { label: 'Net', align: 'right' as const },
]

/** `tabs`: the Payroll / Report switch when shown inside the merged Salaries page. */
export default function SalariesReport({ tabs }: { tabs?: ReactNode } = {}) {
  const today = new Date()
  // A pay period is a whole month, so the report is picked by month.
  const [month, setMonth] = useState(isoDay(monthStart(today)).slice(0, 7))
  const [locationId, setLocationId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [workers, setWorkers] = useState<Workers>('')
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
      if (workers) query.set('workers', workers)
      setReport(await api<SalaryReport>(`/employee-salaries/report?${query}`))
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : 'Could not load the salaries report')
    } finally {
      setLoading(false)
    }
  }, [month, locationId, departmentId, workers])

  useEffect(() => { if (hasApiTenant()) void load() }, [load])

  function exportCsv(data: SalaryReport) {
    const rows: (string | number)[][] = [['Section', 'Name', ...HEADINGS, 'Allowance breakdown', 'Deduction breakdown']]
    rows.push(['Total', WORKERS_LABEL[workers] || 'All', ...groupCells(data.totals)])
    for (const section of viewSections(data, workers)) {
      for (const group of section.groups) {
        rows.push(section.employees
          ? [section.title, group.name, ...groupCells(group), itemLines(group.allowanceItems).join('; '), itemLines(group.deductionItems, carriedLine(group)).join('; ')]
          : [section.title, group.name, ...groupCells(group)])
      }
      if (section.subtotal && section.groups.length) rows.push([section.title, 'Subtotal', ...groupCells(section.total)])
    }
    downloadCsvRows('salaries-report', rows)
  }

  function buildReportDoc(data: SalaryReport): ReportDocData {
    const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
    const sections: ReportSection[] = viewSections(data, workers).map((section) => ({
      title: section.title,
      compact: true,
      columns: printColumns(section.label),
      rows: [...section.groups.map((group) => {
        if (!section.employees) return [group.name, ...groupCells(group)]
        const [count, basic, , , gross, net] = groupCells(group)
        return [
          group.name, count, basic,
          breakdownCell(group.allowances, itemLines(group.allowanceItems)),
          breakdownCell(group.deductions, itemLines(group.deductionItems, carriedLine(group))),
          gross, net,
        ]
      })],
      // Every table ends on its totals, printed grey and bold so they stand out.
      totals: section.groups.length ? [section.subtotal ? 'Subtotal' : 'Total', ...groupCells(section.total)] : undefined,
    }))
    return {
      reportTitle: 'Salaries Report',
      kicker: 'Reports',
      rangeLabel: WORKERS_LABEL[workers] ? `${monthName} · ${WORKERS_LABEL[workers]}` : monthName,
      generatedAt: new Date().toISOString(),
      // Gross first, then what comes off and goes on, then net.
      cards: [
        { label: 'Gross salaries', value: formatKes(data.totals.gross) },
        { label: 'Deductions', value: formatKes(data.totals.deductions) },
        { label: 'Allowances', value: formatKes(data.totals.allowances) },
        { label: 'Net pay', value: formatKes(data.totals.net) },
        { label: 'Payslips', value: String(data.totals.count) },
      ],
      sections,
    }
  }

  if (!hasApiTenant()) return <div className="mx-auto max-w-7xl px-6 py-16 text-center"><p className="text-sm text-muted-foreground">Workspace not resolved yet.</p></div>

  const totals = report?.totals
  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-8">
      {tabs}
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
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workers
            <select className="input mt-1 block" value={workers} onChange={(e) => setWorkers(e.target.value as Workers)}>
              <option value="">All workers</option>
              <option value="OFFICIAL">Official employees only</option>
              <option value="CASUAL">Casual workers only</option>
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

          {viewSections(report!, workers).map((section) => (
            <section key={section.id} className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
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
                    {section.groups.length === 0 && <tr><td colSpan={HEADINGS.length + 1} className="px-4 py-6 text-center text-muted-foreground">No completed salaries in this range.</td></tr>}
                    {section.groups.map((group) => (
                      <tr key={group.key} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{group.name}</td>
                        {groupCells(group).map((cell, i) => <td key={i} className="px-4 py-2.5 text-right tabular-nums">{cell}</td>)}
                      </tr>
                    ))}
                    {section.groups.length > 0 && (
                      <tr className="border-t-2 border-t-black bg-gray-200 font-bold text-black">
                        <td className="px-4 py-2.5">{section.subtotal ? 'Subtotal' : 'Total'}</td>
                        {groupCells(section.total).map((cell, i) => <td key={i} className="px-4 py-2.5 text-right tabular-nums">{cell}</td>)}
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
