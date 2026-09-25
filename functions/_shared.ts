// Shared by the Pages Functions in this folder. The leading underscore keeps
// this file from being treated as a route of its own.

export const APP_DOMAIN = 'hoteliermanagement.app'
export const API_URL = 'https://server.hoteliermanagement.app/api'

// Same rule as src/lib/tenant.ts's slugFromHost().
export function slugFromHost(hostname: string): string | null {
  if (hostname === APP_DOMAIN) return null
  if (!hostname.endsWith(`.${APP_DOMAIN}`)) return null
  return hostname.slice(0, -(APP_DOMAIN.length + 1))
}

export type ResolvedTenant = { slug?: string; themeBaseColor?: string; logoUrl?: string | null }

export async function resolveTenant(apiUrl: string, slug: string): Promise<ResolvedTenant | null> {
  const res = await fetch(`${apiUrl}/tenant/resolve?slug=${encodeURIComponent(slug)}`)
  if (!res.ok) return null
  const data = (await res.json()) as { tenant?: ResolvedTenant }
  return data.tenant ?? null
}

export const apiOrigin = (apiUrl: string) => apiUrl.replace(/\/api\/?$/, '')
