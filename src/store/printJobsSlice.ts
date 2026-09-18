import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/**
 * What usePrintRelayHost (src/lib/printRelayHost.ts) currently sees at its
 * own location — read by AppShell to show a small badge on whichever device
 * is actually acting as a print host. Devices not hosting (no local printer
 * connection configured) never touch this; it stays at its zero default.
 */
export type PrintJobsState = { pendingCount: number; nudgedCount: number }
const initialState: PrintJobsState = { pendingCount: 0, nudgedCount: 0 }

const printJobsSlice = createSlice({
  name: 'printJobs',
  initialState,
  reducers: {
    setPrintJobCounts(state, action: PayloadAction<PrintJobsState>) {
      state.pendingCount = action.payload.pendingCount
      state.nudgedCount = action.payload.nudgedCount
    },
  },
})

export const { setPrintJobCounts } = printJobsSlice.actions
export default printJobsSlice.reducer
