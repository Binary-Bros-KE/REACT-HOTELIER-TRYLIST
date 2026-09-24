import { useCallback, useEffect, useMemo, useState } from 'react'
import { LuBoxes, LuCircleAlert, LuLoaderCircle, LuMapPin, LuPackage, LuPackageX, LuSearch, LuShoppingCart, LuTriangleAlert } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useWorkingLocation } from '@/lib/useWorkingLocation'
import PageBanner from '@/components/ui/PageBanner'
import StatCard from '@/components/ui/StatCard'
import { packAndUnit } from '@/components/ui/PackQtyInput'
import { useAppSelector } from '@/store/hooks'

type LocationOption = { id: string; name: string; isActive?: boolean }
type CategoryOption = { id: string; name: string }
type StockFilter = 'ALL' | 'LOW' | 'OUT'
type ProductStockRow = {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  brand: string | null
  category: CategoryOption | null
  unit: string
  quantity: number
  reorderLevel: number
  maxStockLevel: number | null
  sellingPrice: number | null
  sellsDirectly: boolean
  packSize: number | null
  packLabel: string | null
  packUnit: { id: string; name: string } | null
  low: boolean
  out: boolean
  stockByLocation: { locationId: string; locationName: string; quantity: number }[]
}
type StockResponse = {
  products: ProductStockRow[]
  categories: CategoryOption[]
  summary: { totalProducts: number; totalUnits: number; lowStock: number; outOfStock: number }
}

const formatKes = (value: number | null) => value == null ? '-' : `KSh ${value.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`
const quantityLabel = (product: ProductStockRow) => packAndUnit(product.quantity, Number(product.packSize) || 0, product.packLabel ?? '', product.packUnit?.name ?? product.unit)

export default function ReceptionProductStock() {
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const { fixed: fixedLocation, options: pickableLocations, selectedId, setLocation, effectiveId } = useWorkingLocation(locations, { persist: false })
  const assignedLocationCount = user?.locations.length ?? 0
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [stock, setStock] = useState<StockFilter>('ALL')
  const [data, setData] = useState<StockResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fixedLocation && assignedLocationCount > 0 && !selectedId && pickableLocations[0]) setLocation(pickableLocations[0].id)
  }, [assignedLocationCount, fixedLocation, pickableLocations, selectedId, setLocation])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ stock })
      if (effectiveId) query.set('locationId', effectiveId)
      if (search.trim()) query.set('search', search.trim())
      if (categoryId) query.set('categoryId', categoryId)
      const response = await api<StockResponse>(`/pos/product-stock?${query}`)
      setData(response)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load product stock'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [categoryId, effectiveId, search, stock, toast])

  useEffect(() => { api<{ locations: LocationOption[] }>('/locations').then((r) => setLocations(r.locations)).catch(() => {}) }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(timer)
  }, [load])

  const products = data?.products ?? []
  const categories = useMemo(() => data?.categories ?? [], [data])

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="Reception" title="Products Stock">
        {fixedLocation ? (
          <span className="flex items-center gap-1.5"><LuMapPin className="size-3.5" /> {fixedLocation.name}</span>
        ) : pickableLocations.length > 0 ? (
          <label className="flex items-center gap-1.5">
            <LuMapPin className="size-3.5" />
            <select value={selectedId} onChange={(e) => setLocation(e.target.value)} className="rounded-sm border border-slate-300 bg-white px-1.5 py-1 text-xs font-medium text-slate-700 outline-none">
              {assignedLocationCount === 0 && <option value="">All locations</option>}
              {pickableLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        ) : null}
      </PageBanner>

      {error && <div className="mt-5 flex items-center gap-2 border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><LuCircleAlert />{error}</div>}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} icon={<LuPackage />} label="Products" value={(data?.summary.totalProducts ?? 0).toLocaleString()} />
        <StatCard index={1} icon={<LuBoxes />} label="Units on hand" value={(data?.summary.totalUnits ?? 0).toLocaleString('en-KE')} />
        <StatCard tone={(data?.summary.lowStock ?? 0) > 0 ? 'warn' : 'success'} icon={<LuTriangleAlert />} label="Low stock" value={(data?.summary.lowStock ?? 0).toLocaleString()} />
        <StatCard tone={(data?.summary.outOfStock ?? 0) > 0 ? 'danger' : 'success'} icon={<LuPackageX />} label="Out of stock" value={(data?.summary.outOfStock ?? 0).toLocaleString()} />
      </section>

      <section className="mt-6 overflow-hidden border bg-card shadow-sm">
        <div className="border-b p-4">
          <div className="border-l-4 border-accent pl-3">
            <h2 className="font-display text-xl font-semibold leading-tight">Location product list</h2>
            <p className="text-xs text-muted-foreground">Stock visibility for the working location. This is view-only for front desk users.</p>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Search
              <span className="relative">
                <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product, SKU, barcode, brand..." className="input pl-9 font-normal normal-case tracking-normal" />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Category
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input min-w-48 font-normal normal-case tracking-normal">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Stock
              <select value={stock} onChange={(e) => setStock(e.target.value as StockFilter)} className="input font-normal normal-case tracking-normal">
                <option value="ALL">All products</option>
                <option value="LOW">Low stock</option>
                <option value="OUT">Out of stock</option>
              </select>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><LuLoaderCircle className="animate-spin" /> Loading products...</div>
        ) : products.length === 0 ? (
          <div className="min-h-64 p-16 text-center text-sm text-muted-foreground">No products match this view.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-primary text-xs uppercase tracking-wider text-primary-foreground">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">SKU / barcode</th>
                  <th className="px-5 py-3 text-right">Stock</th>
                  <th className="px-5 py-3 text-right">Reorder</th>
                  <th className="px-5 py-3 text-right">Selling price</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((product) => (
                  <tr key={product.id} className="align-middle even:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold">{product.name}</p>
                      {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{product.category?.name ?? '-'}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {product.sku ?? '-'}
                      {product.barcode && <span className="block text-xs">{product.barcode}</span>}
                    </td>
                    <td className={cn('px-5 py-3.5 text-right font-semibold tabular-nums', product.out && 'text-destructive', product.low && 'text-warning')}>{quantityLabel(product)}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">{product.reorderLevel.toLocaleString('en-KE')}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {product.sellsDirectly ? <span className="inline-flex items-center justify-end gap-1"><LuShoppingCart className="size-3.5 text-muted-foreground" /> {formatKes(product.sellingPrice)}</span> : '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn('inline-flex border border-dashed px-2 py-1 text-[11px] font-bold uppercase tracking-wide', product.out ? 'border-destructive/70 text-destructive' : product.low ? 'border-warning/70 text-warning' : 'border-success/70 text-success')}>
                        {product.out ? 'Out' : product.low ? 'Low' : 'In stock'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
