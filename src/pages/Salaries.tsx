import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import EmployeeSalaries from '@/pages/EmployeeSalaries'
import SalariesReport from '@/pages/SalariesReport'

type SalariesTab = 'payroll' | 'report'

/**
 * Salaries and the Salaries Report on one page. Both sidebar links (Finance >
 * Salaries and Reports > Salaries) open it - Finance on Payroll, Reports on
 * Report - so salaries can be recorded and reported from either. Each tab is
 * the existing page, unchanged. Switching tabs stays on the same URL, so
 * whoever can open either link sees both.
 */
export default function Salaries({ initial }: { initial: SalariesTab }) {
  const [tab, setTab] = useState<SalariesTab>(initial)
  useEffect(() => setTab(initial), [initial])

  const tabs = (
    <div className="mb-6 flex w-fit border bg-card p-1">
      {([['payroll', 'Payroll'], ['report', 'Report']] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={cn('px-4 py-2 text-sm font-semibold transition', tab === key ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted')}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return tab === 'payroll' ? <EmployeeSalaries tabs={tabs} /> : <SalariesReport tabs={tabs} />
}
