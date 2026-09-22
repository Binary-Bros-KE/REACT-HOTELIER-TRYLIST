import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { LuCheck, LuChevronDown, LuSearch } from 'react-icons/lu'
import { cn } from '@/lib/utils'

export type SearchableSelectOption = {
  value: string
  label: string
  hint?: string
  /** Extra terms matched on search but never shown — e.g. a phone number or ID that isn't in the label. */
  keywords?: string
}

type Props = {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  /** Extra classes for the trigger button. */
  className?: string
}

/**
 * A single-select dropdown with a type-to-filter search box. Same look as a
 * plain `.input` control when closed; opens a searchable, keyboard-navigable
 * list. Closes on outside click or Escape.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches.',
  disabled = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])
  useEffect(() => { setActive(0) }, [query])

  function choose(next: string) {
    onChange(next)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const opt = filtered[active]; if (opt) choose(opt.value) }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-sm border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60',
          !selected && 'text-muted-foreground',
          className,
        )}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
          {selected?.hint ? ` (${selected.hint})` : ''}
        </span>
        <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-sm border bg-card shadow-lg">
          <div className="border-b p-2">
            <span className="relative block">
              <LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-sm border bg-background py-1.5 pl-8 pr-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </span>
          </div>
          <div className="scrollbar-thin max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
            ) : filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                  i === active ? 'bg-muted' : 'hover:bg-muted',
                  o.value === value && 'font-semibold text-secondary',
                )}
              >
                <span className="truncate">
                  {o.label}
                  {o.hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">({o.hint})</span> : null}
                </span>
                {o.value === value && <LuCheck className="size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
