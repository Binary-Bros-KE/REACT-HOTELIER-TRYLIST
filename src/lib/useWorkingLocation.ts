import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setDefaultLocation } from '@/store/authSlice'

type Loc = { id: string; name: string; isActive?: boolean }

/**
 * The location a till / POS-style screen should operate at, for the signed-in
 * employee:
 *  - pinned to exactly one  → `fixed` (locked; no picker)
 *  - pinned to several       → starts on their saved default; `options` is that
 *    set; changing it persists as the new default (so they pick once a day)
 *  - pinned to none          → starts on their saved default if any; `options`
 *    is every active location; changing it persists too
 *
 * Pass `{ persist: false }` on view-only screens (Receipts, Tables) so
 * changing the filter there doesn't move the employee's working location.
 * Add `startOnAll: true` for report-style screens that should open on "All
 * locations" (every location the employee may see) instead of the default.
 */
export function useWorkingLocation(allLocations: Loc[], { persist = true, startOnAll = false }: { persist?: boolean; startOnAll?: boolean } = {}) {
  const dispatch = useAppDispatch()
  const user = useAppSelector((s) => s.auth.user)
  const mine = user?.locations ?? []
  const fixed = mine.length === 1 ? mine[0] : null
  const options: Loc[] = mine.length > 1 ? mine : allLocations.filter((l) => l.isActive !== false)

  const defaultId = startOnAll ? '' : user?.defaultLocation?.id ?? ''
  const [selectedId, setSelectedId] = useState(defaultId)

  // Adopt the saved default if it arrives/changes after mount (e.g. session
  // restore) while the user hasn't picked anything this session.
  useEffect(() => {
    if (defaultId && !selectedId) setSelectedId(defaultId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultId])

  function setLocation(id: string) {
    setSelectedId(id)
    if (persist) void dispatch(setDefaultLocation(id || null))
  }

  const effectiveId = fixed?.id ?? selectedId
  return { fixed, options, selectedId, setLocation, effectiveId, needsChoice: !fixed && options.length > 0 && !selectedId }
}
