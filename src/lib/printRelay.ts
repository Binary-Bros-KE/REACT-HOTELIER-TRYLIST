import { api } from '@/lib/api'
import type { DispatchSlip } from '@/lib/thermalPrinter'

/**
 * A Bluetooth thermal printer only ever holds one connection — usually the
 * barman's own tablet, not a waiter's phone. The print-job relay lets any
 * device queue a print request for an order's location; any OTHER device at
 * that location already configured with a working printer connection polls
 * for pending jobs in the background and prints them over its own
 * connection. See NODE's PrintJob schema comment for the full design.
 */

export type PrintJobStatus = 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED'
export type PendingPrintJob = { id: string; orderId: string; kind: 'RECEIPT' | 'DISPATCH'; createdAt: string; nudgedAt: string | null }

export async function createPrintJob(orderId: string): Promise<{ id: string; status: PrintJobStatus }> {
  const response = await api<{ job: { id: string; status: PrintJobStatus; createdAt: string } }>(`/pos/orders/${orderId}/print-jobs`, { method: 'POST', body: '{}' })
  return response.job
}

export async function getPrintJobStatus(id: string): Promise<{ id: string; status: PrintJobStatus; error: string | null; nudgedAt: string | null }> {
  const response = await api<{ job: { id: string; status: PrintJobStatus; error: string | null; nudgedAt: string | null } }>(`/pos/print-jobs/${id}`)
  return response.job
}

export async function listPendingPrintJobs(locationId: string): Promise<PendingPrintJob[]> {
  const response = await api<{ jobs: PendingPrintJob[] }>(`/pos/print-jobs/pending?locationId=${locationId}`)
  return response.jobs
}

/** Flags a still-pending job as taking a while — surfaced to whichever
 * device is polling /pending. Throws (caller should ignore/toast) once the
 * job has already finished, which the server reports as 409. */
export async function nudgePrintJob(id: string): Promise<void> {
  await api(`/pos/print-jobs/${id}/nudge`, { method: 'POST', body: '{}' })
}

/** Atomically claims a job before printing it — returns null if another
 * device already claimed it first (a normal race, not an error). */
export async function claimPrintJob(id: string): Promise<{ id: string; orderId: string; kind: 'RECEIPT' | 'DISPATCH'; slip: DispatchSlip | null } | null> {
  try {
    const response = await api<{ job: { id: string; orderId: string; kind: 'RECEIPT' | 'DISPATCH' }; slip?: DispatchSlip | null }>(`/pos/print-jobs/${id}/claim`, { method: 'POST', body: '{}' })
    return { ...response.job, slip: response.slip ?? null }
  } catch {
    return null
  }
}

export async function completePrintJob(id: string): Promise<void> {
  await api(`/pos/print-jobs/${id}/complete`, { method: 'POST', body: '{}' })
}

export async function failPrintJob(id: string, error?: string): Promise<void> {
  await api(`/pos/print-jobs/${id}/fail`, { method: 'POST', body: JSON.stringify({ error }) })
}
