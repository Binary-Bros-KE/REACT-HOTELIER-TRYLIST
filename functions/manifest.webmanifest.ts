// Cloudflare Pages Function — serves manifest.webmanifest per request instead
// of the static file vite-plugin-pwa builds into dist/. Pages Functions win
// over static assets at the same path, so this always runs.
//
// Why this needs to exist at all: once a PWA is installed on Android, Chrome
// generates a native "WebAPK" wrapper whose system status-bar colour is
// baked from manifest.webmanifest's theme_color at install/update time — it
// does not react to the app's own runtime meta[theme-color] changes (those
// only affect a normal browser tab or the desktop title bar). Since this one
// build serves every tenant by subdomain, the static manifest is necessarily
// one shared colour. Resolving the tenant from the request's hostname here
// and looking up its brand colour lets each tenant's installed app get its
// own correct status bar.

import { API_URL, resolveTenant, slugFromHost } from './_shared'

const FALLBACK_COLOR = '#0b1e3d'

type Hsl = { h: number; s: number; l: number }

function hexToHsl(hex: string): Hsl {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToHex({ h, s, l }: Hsl): string {
  const hh = (((h % 360) + 360) % 360) / 360
  const ss = Math.min(100, Math.max(0, s)) / 100
  const ll = Math.min(100, Math.max(0, l)) / 100
  let r: number
  let g: number
  let b: number
  if (ss === 0) {
    r = g = b = ll
  } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
    const p = 2 * ll - q
    r = hueToRgb(p, q, hh + 1 / 3)
    g = hueToRgb(p, q, hh)
    b = hueToRgb(p, q, hh - 1 / 3)
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Mirrors src/lib/theme.ts's light-mode --primary derivation exactly, so the
// status bar matches the colour actually rendered as the in-app top bar.
function brandPrimary(baseColor: string): string {
  const base = hexToHsl(baseColor)
  return hslToHex({ h: base.h, s: Math.min(100, Math.max(0, base.s - 8)), l: 14 })
}

const DEFAULT_ICONS = [
  { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
]

const ICON_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

// The installed app is named after the tenant's slug (the subdomain the owner
// signed up with) and wears the tenant's own logo, so several installs on one
// home screen can be told apart at a glance. The stock HOTELIER name/icon
// remain for the bare domain and for tenants without a usable logo.
function manifestBody(themeColor: string, tenant?: { slug: string; logoUrl?: string | null } | null): string {
  const ext = tenant?.logoUrl?.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  const type = ICON_TYPES[ext]
  const icons = tenant?.logoUrl && type
    ? [192, 512].map((size) => ({ src: `/tenant-icon?v=${encodeURIComponent(tenant.logoUrl ?? '')}`, sizes: `${size}x${size}`, type }))
    : DEFAULT_ICONS
  const name = tenant?.slug ?? 'HOTELIER'
  return JSON.stringify({
    name,
    short_name: name,
    description: 'Modular, multi-tenant hotel management platform by TANZ.',
    start_url: '/',
    display: 'standalone',
    background_color: themeColor,
    theme_color: themeColor,
    lang: 'en',
    scope: '/',
    icons,
  })
}

export const onRequestGet = async (context: { request: Request; env: Record<string, string> }): Promise<Response> => {
  const headers = { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=600' }
  const hostname = new URL(context.request.url).hostname
  const slug = slugFromHost(hostname)
  if (!slug) return new Response(manifestBody(FALLBACK_COLOR), { headers })

  try {
    const apiUrl = context.env.API_URL ?? API_URL
    const tenant = await resolveTenant(apiUrl, slug)
    const baseColor = tenant?.themeBaseColor
    const themeColor = baseColor ? brandPrimary(baseColor) : FALLBACK_COLOR
    return new Response(manifestBody(themeColor, tenant ? { slug, logoUrl: tenant.logoUrl } : null), { headers })
  } catch {
    return new Response(manifestBody(FALLBACK_COLOR), { headers })
  }
}
