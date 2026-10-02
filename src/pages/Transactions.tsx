import { useCallback, useEffect, useState } from 'react'
import { LuArrowDownLeft, LuArrowLeftRight, LuArrowUpRight, LuCircleAlert, LuLoaderCircle, LuSearch } from 'react-icons/lu'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import StatCard from '@/components/ui/StatCard'

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
const formatKes = (value: number) => `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`

type Direction = 'IN' | 'OUT'
type PaymentMethod = { id: string; name: string }
type Transaction = {
  id: string
  transactionNo: string
  direction: Direction
  source: 'FOLIO_DEPOSIT' | 'FOLIO_SETTLEMENT' | 'POS_SALE' | 'EXPENSE' | 'ASSET_PURCHASE'
  status: 'COMPLETE' | 'VOIDED'
  amount: string | number
  reference: string | null
  description: string | null
  createdAt: string
  paymentMethod: PaymentMethod | null
  customer: { id: string; firstName: string; lastName: string | null } | null
  location: { id: string; name: string } | null
  employee: { id: string; firstName: string; lastName: string } | null
}

export default function Transactions() {
  const toast = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'' | Direction>('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0, count: 0 })

  useEffect(() => {
    api<{ methods: PaymentMethod[] }>('/payment-methods').then((r) => setMethods(r.methods)).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (search.trim()) query.set('search', search.trim())
      if (direction) query.set('direction', direction)
      if (paymentMethodId) query.set('paymentMethodId', paymentMethodId)
      if (from) query.set('from', from)
      if (to) query.set('to', to)
      const response = await api<{ transactions: Transaction[]; summary: { totalIn: number; totalOut: number; count: number } }>(`/transactions${query.size ? `?${query}` : ''}`)
      setTransactions(response.transactions)
      setSummary(response.summary)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load transactions'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search, direction, paymentMethodId, from, to, toast])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
      <header>
        <p className="text-sm font-semibold text-secondary">Finance</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Transactions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Every payment recorded across the business — reception folios and POS sales alike.</p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard tone="success" icon={<LuArrowDownLeft />} label="Money in" value={formatKes(summary.totalIn)} />
        <StatCard tone="danger" icon={<LuArrowUpRight />} label="Money out" value={formatKes(summary.totalOut)} />
        <StatCard index={2} icon={<LuArrowLeftRight />} label="Transactions" value={summary.count} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <label className="relative min-w-56 flex-1">
          <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, reference, transaction no…" className="w-full rounded-sm border bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <select value={direction} onChange={(e) => setDirection(e.target.value as '' | Direction)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
          <option value="">All directions</option>
          <option value="IN">Money in</option>
          <option value="OUT">Money out</option>
        </select>
        <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none">
          <option value="">All payment methods</option>
          {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-sm border bg-card px-3 py-2.5 text-sm shadow-sm outline-none" />
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-sm border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <LuCircleAlert />
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-7 flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading transactions…</div>
      ) : transactions.length === 0 ? (
        <div className="mt-7 min-h-64 rounded-sm border bg-card p-16 text-center text-sm text-muted-foreground shadow-sm">No transactions match your filters.</div>
      ) : (
        <section className="mt-7 overflow-hidden rounded-sm border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-xs uppercase text-primary-foreground">
                <tr>
                  <th className="px-5 py-3"></th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">For</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-5 py-4">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold', t.direction === 'IN' ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive')}>
                        {t.direction === 'IN' ? <LuArrowDownLeft className="size-3" /> : <LuArrowUpRight className="size-3" />}
                        {t.direction}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{t.paymentMethod?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{t.transactionNo}{t.reference ? ` · ${t.reference}` : ''}</p>
                      <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString('en-KE')}</p>
                    </td>
                    <td className="px-5 py-4">
                      {t.customer ? <p className="font-medium">Customer: {t.customer.firstName} {t.customer.lastName ?? ''}</p> : <p className="font-medium">{t.description ?? titleCase(t.source)}</p>}
                      <p className="text-xs text-muted-foreground">
                        {[t.employee ? `${t.employee.firstName} ${t.employee.lastName}` : null, t.location?.name].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold">{formatKes(Number(t.amount))}</td>
                    <td className="px-5 py-4">
                      <span className={cn('rounded-full border px-2 py-1 text-[10px] font-bold', t.status === 'COMPLETE' ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive')}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
