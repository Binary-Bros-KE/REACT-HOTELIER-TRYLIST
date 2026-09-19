import { getSessionSnapshot } from '@/lib/session'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

// The API's own origin (no /api suffix) — needed to build absolute URLs for
// server-hosted assets like an uploaded logo, since those aren't under /api.
export const apiOrigin = apiUrl.replace(/\/api\/?$/, '')

export function resolveLogoUrl(logoUrl: string | null): string | null {
  return logoUrl ? `${apiOrigin}${logoUrl}` : null
}

export function hasApiTenant() {
  return Boolean(getSessionSnapshot().tenantId)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token, userId, tenantId } = getSessionSnapshot()
  if (!tenantId) throw new Error('Workspace not resolved yet.')
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const data = await response.json() as T & { error?: string; code?: string }
  if (!response.ok) {
    // Keep the machine-readable code (and any extra fields) so a caller can
    // react to a specific refusal — e.g. ask "carry over?" instead of just toasting.
    throw Object.assign(new Error(data.error ?? 'The request failed'), { code: data.code, data })
  }
  return data
}

// For multipart uploads — deliberately omits Content-Type so the browser
// sets the multipart boundary itself; api()'s hardcoded application/json
// would otherwise break the request.
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const { token, userId, tenantId } = getSessionSnapshot()
  if (!tenantId) throw new Error('Workspace not resolved yet.')
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    body: formData,
    headers: {
      'x-tenant-id': tenantId,
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? 'The request failed')
  return data
}
