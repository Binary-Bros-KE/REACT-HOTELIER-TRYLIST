import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import InventoryOverview from '@/pages/InventoryOverview'
import StockMovementReport from '@/pages/StockMovementReport'

type InventoryTab = 'stock' | 'movements'

/**
 * The Inventory Report with the Stock Movements report folded in as a second
 * tab (one sidebar entry instead of two). Each tab is the existing page,
 * unchanged. The old /reports/stock-movements link lands here on Movements
 * (?tab=movements).
 */
export default function InventoryReport() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<InventoryTab>(params.get('tab') === 'movements' ? 'movements' : 'stock')

  const tabs = (
    <div className="mb-6 flex w-fit border bg-card p-1">
      {([['stock', 'Stock'], ['movements', 'Movements']] as const).map(([key, label]) => (
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

  return tab === 'stock' ? <InventoryOverview tabs={tabs} /> : <StockMovementReport tabs={tabs} />
}
