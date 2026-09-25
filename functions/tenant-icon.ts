// Cloudflare Pages Function — serves the calling tenant's own logo from the
// app's own origin, so the manifest can point its install icon at it. Serving
// it same-origin (instead of pointing the manifest at the API host directly)
// avoids any cross-origin surprises when Chrome mints the home-screen icon.
// Falls back to the stock HOTELIER icon when the tenant has no usable logo.

import { API_URL, apiOrigin, resolveTenant, slugFromHost } from './_shared'

export const onRequestGet = async (context: { request: Request; env: Record<string, string> }): Promise<Response> => {
  const url = new URL(context.request.url)
  const fallback = () => Response.redirect(`${url.origin}/android-chrome-512x512.png`, 302)
  const slug = slugFromHost(url.hostname)
  if (!slug) return fallback()

  try {
    const apiUrl = context.env.API_URL ?? API_URL
    const tenant = await resolveTenant(apiUrl, slug)
    if (!tenant?.logoUrl) return fallback()
    const upstream = await fetch(`${apiOrigin(apiUrl)}${tenant.logoUrl}`)
    if (!upstream.ok) return fallback()
    return new Response(upstream.body, {
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'image/png',
        // The manifest adds ?v=<logo path>, so a new logo is a new URL — safe to cache hard.
        'cache-control': 'public, max-age=86400',
      },
    })
  } catch {
    return fallback()
  }
}
