import { useEffect, useRef, useState } from 'react'
import { LuCheck, LuLoaderCircle } from 'react-icons/lu'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import PageBanner from '@/components/ui/PageBanner'
import { useToast } from '@/components/ui/Toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setTenantTheme } from '@/store/tenantSlice'
import { applyTheme } from '@/lib/theme'
import { writeCachedTheme } from '@/lib/themeCache'
import { FONT_OPTIONS } from '@/lib/fonts'

const BRAND_PRESETS = [
  { label: 'Ocean Blue', hex: '#1c74d1' },
  { label: 'Forest Green', hex: '#1c9b5e' },
  { label: 'Coffee Brown', hex: '#6f4527' },
  { label: 'Royal Slate', hex: '#4b3f72' },
  { label: 'Sunset Orange', hex: '#c2540a' },
  { label: 'Charcoal', hex: '#26292e' },
]

const ACCENT_PRESETS = [
  { label: 'Green', hex: '#43a047' },
  { label: 'Teal', hex: '#0f9488' },
  { label: 'Amber', hex: '#dc9a12' },
  { label: 'Rose', hex: '#c2410c' },
]

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

export default function ThemeCustomizer() {
  const toast = useToast()
  const dispatch = useAppDispatch()
  const slug = useAppSelector((s) => s.tenant.tenantSlug)
  const branding = useAppSelector((s) => ({
    logoUrl: s.tenant.logoUrl,
    shortName: s.tenant.shortName,
    businessType: s.tenant.businessType,
  }))
  const saved = useAppSelector((s) => ({
    baseColor: s.tenant.themeBaseColor,
    accentColor: s.tenant.themeAccentColor,
    font: s.tenant.themeFont,
  }))

  const [baseColor, setBaseColor] = useState(saved.baseColor)
  const [accentColor, setAccentColor] = useState(saved.accentColor)
  const [font, setFont] = useState(saved.font)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const savedRef = useRef(saved)
  savedRef.current = saved

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await api<{ profile: { themeBaseColor: string; themeAccentColor: string; themeFont: string } | null }>('/business-profile')
        if (cancelled) return
        if (response.profile) {
          setBaseColor(response.profile.themeBaseColor)
          setAccentColor(response.profile.themeAccentColor)
          setFont(response.profile.themeFont)
        }
      } catch (cause) {
        if (!cancelled) toast.error(cause instanceof Error ? cause.message : 'Could not load the current theme')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live preview: every change repaints the real app chrome (sidebar,
  // buttons, headers) immediately, including on other pages if the user
  // navigates away without saving — it's a preview of the current pick,
  // not a commitment, and a reload naturally falls back to the last-saved
  // theme (main.tsx re-applies the cached/authoritative value from scratch),
  // so nothing "leaks" longer than the current browser session.
  useEffect(() => {
    if (loading) return
    if (HEX_PATTERN.test(baseColor) && HEX_PATTERN.test(accentColor)) {
      applyTheme({ baseColor, accentColor, font })
    }
  }, [baseColor, accentColor, font, loading])

  async function handleSave() {
    setSaving(true)
    try {
      await api('/business-profile/theme', {
        method: 'PATCH',
        body: JSON.stringify({ themeBaseColor: baseColor, themeAccentColor: accentColor, themeFont: font }),
      })
      dispatch(setTenantTheme({ baseColor, accentColor, font }))
      if (slug) writeCachedTheme(slug, { baseColor, accentColor, font, ...branding })
      applyTheme({ baseColor, accentColor, font })
      toast.success('Theme saved.')
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not save theme')
      applyTheme({ baseColor: savedRef.current.baseColor, accentColor: savedRef.current.accentColor, font: savedRef.current.font })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <LuLoaderCircle className="animate-spin" /> Loading appearance settings…
      </div>
    )
  }

  return (
    <div className="dashboard-square mx-auto max-w-7xl px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
      <PageBanner kicker="System" title="Appearance" />

      <div className="mt-6 border bg-card shadow-sm">
        <ColorSection
          title="Brand Color"
          description="Drives the sidebar, page headers, buttons, and active states — all as one consistent color family."
          presets={BRAND_PRESETS}
          value={baseColor}
          onChange={setBaseColor}
        />
        <ColorSection
          title="Accent Color"
          description="Used for success badges and highlights, like order temperature tags."
          presets={ACCENT_PRESETS}
          value={accentColor}
          onChange={setAccentColor}
        />

        <div className="border-t p-6 sm:p-8">
          <p className="border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Font</p>
          <p className="mt-1 text-sm text-muted-foreground">Applies to headings and body text everywhere in the system.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FONT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFont(option.key)}
                className={cn(
                  'flex items-center justify-between rounded-sm border p-4 text-left transition-colors',
                  font === option.key ? 'border-secondary bg-secondary/10' : 'hover:bg-muted',
                )}
              >
                <span style={{ fontFamily: option.family }} className="text-lg">{option.label}</span>
                {font === option.key && <LuCheck className="size-4 shrink-0 text-secondary" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t bg-muted/30 px-6 py-4 sm:px-8">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !HEX_PATTERN.test(baseColor) || !HEX_PATTERN.test(accentColor)}
            className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            {saving && <LuLoaderCircle className="animate-spin" />}
            Save Theme
          </button>
        </div>
      </div>
    </div>
  )
}

function ColorSection({
  title, description, presets, value, onChange,
}: {
  title: string
  description: string
  presets: { label: string; hex: string }[]
  value: string
  onChange: (hex: string) => void
}) {
  const [hexInput, setHexInput] = useState(value)

  useEffect(() => { setHexInput(value) }, [value])

  function commitHex(next: string) {
    setHexInput(next)
    if (HEX_PATTERN.test(next)) onChange(next)
  }

  return (
    <div className="border-t p-6 first:border-t-0 sm:p-8">
      <p className="border-l-4 border-accent pl-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {presets.map((preset) => (
          <PresetSwatch key={preset.hex} label={preset.label} hex={preset.hex} active={value.toLowerCase() === preset.hex.toLowerCase()} onClick={() => { onChange(preset.hex); setHexInput(preset.hex) }} />
        ))}

        <label className="flex size-10 cursor-pointer items-center justify-center rounded-sm border border-dashed" title="Custom color">
          <input type="color" value={HEX_PATTERN.test(value) ? value : '#000000'} onChange={(e) => commitHex(e.target.value)} className="size-6 cursor-pointer border-0 bg-transparent p-0" />
        </label>

        <input
          value={hexInput}
          onChange={(e) => commitHex(e.target.value)}
          placeholder="#1c74d1"
          className="input w-32 font-mono text-sm"
        />
      </div>
    </div>
  )
}

function PresetSwatch({ label, hex, active, onClick }: { label: string; hex: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn('relative flex size-10 items-center justify-center rounded-sm border-2 transition-transform', active ? 'border-foreground' : 'border-transparent hover:scale-105')}
      style={{ backgroundColor: hex }}
    >
      {active && <LuCheck className="size-4" color="#ffffff" />}
    </button>
  )
}
