import { createContext, useContext, useEffect, useState } from 'react'
import type { ShiftSession, ShiftSummary } from '@/components/shifts/ShiftSummaryModal'

export type ShiftRow = ShiftSession & { summary: ShiftSummary | null }

export type ShiftPayload = {
  serverNow: string
  user: { isSupervisor: boolean; role: { name: string } | null }
  session: ShiftSession | null
  summary: ShiftSummary | null
}

export type ConfirmAction = {
  title: string
  message: string
  confirmLabel: string
  tone?: 'warning' | 'danger'
  busyKey: string
  run: () => Promise<boolean>
}

export type ShiftCtx = {
  loaded: boolean
  state: ShiftPayload | null
  approvals: ShiftRow[]
  activeStaff: ShiftRow[]
  history: ShiftRow[]
  busyKey: string
  error: string
  isSuperAdmin: boolean
  isSupervisor: boolean
  post: (path: string, body?: object, key?: string) => Promise<boolean>
  ask: (action: ConfirmAction) => void
  askEndOwnShift: () => void
  openSummary: (session: ShiftSession & { summary?: ShiftSummary | null }, title: string, approval?: boolean) => void
  forceEnd: (session: ShiftRow) => void
}

export const ShiftContext = createContext<ShiftCtx | null>(null)

export function useShift() {
  const ctx = useContext(ShiftContext)
  if (!ctx) throw new Error('useShift must be used inside <ShiftProvider>')
  return ctx
}

/** Ticks once a second — kept local to the components that draw a clock so the rest of the page doesn't re-render. */
export function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
