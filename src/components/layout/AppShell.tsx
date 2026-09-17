import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LuChevronsDown, LuChevronsUp, LuMenu, LuRefreshCw } from 'react-icons/lu'
import Sidebar from '@/components/layout/Sidebar'
import LicenseBanner from '@/components/layout/LicenseBanner'
import { useAppSelector } from '@/store/hooks'
import { resolveLogoUrl } from '@/lib/api'
import { usePrintRelayHost } from '@/lib/printRelayHost'

export default function AppShell() {
  const [mobileNav, setMobileNav] = useState(false)
  const logoUrl = useAppSelector((s) => s.tenant.logoUrl)
  const location = useLocation()
  // Runs for as long as this tab is open — turns this device into a print
  // host for its own location whenever it has a real printer connection
  // configured. See src/lib/printRelayHost.ts.
  usePrintRelayHost()

  const mainRef = useRef<HTMLElement>(null)
  const [jump, setJump] = useState({ scrollable: false, atTop: true, atBottom: true })

  // Small "jump to top / jump to bottom" buttons for mobile — a long scrollable
  // page (e.g. a POS product grid) otherwise leaves the order widget at the
  // very bottom with a long scroll to reach it. Only shown once content
  // actually overflows the viewport; a MutationObserver catches content that
  // grows in after mount (e.g. async-loaded product lists).
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let ticking = false
    const update = () => {
      ticking = false
      const scrollable = el.scrollHeight > el.clientHeight + 40
      const atTop = el.scrollTop <= 8
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      setJump({ scrollable, atTop, atBottom })
    }
    const schedule = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const mo = new MutationObserver(schedule)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      mo.disconnect()
    }
  }, [location.pathname])

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <LicenseBanner />

      {/* Mobile top bar — the sidebar is hidden below `lg`; the hamburger
          opens it as a drawer. Fills the safe area so the brand colour runs
          up behind the status bar. */}
      <header
        className="flex items-center gap-3 border-b border-sidebar-border bg-primary px-3 pb-2 text-primary-foreground lg:hidden"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <button
          type="button"
          onClick={() => setMobileNav(true)}
          aria-label="Open menu"
          className="rounded-sm p-1.5 transition-colors hover:bg-white/10"
        >
          <LuMenu className="size-5" />
        </button>
        <img
          src={resolveLogoUrl(logoUrl) ?? '/PRIMARY.png'}
          alt=""
          className="size-6 shrink-0 rounded-sm object-contain"
        />
        <span className="font-display text-sm font-extrabold tracking-tight">HOTELIER</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label="Refresh page"
          className="ml-auto rounded-sm p-1.5 transition-colors hover:bg-white/10"
        >
          <LuRefreshCw className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar className="hidden lg:flex" />

        <AnimatePresence>
          {mobileNav && (
            <motion.div
              className="fixed inset-0 z-50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
              <motion.div
                className="absolute inset-y-0 left-0"
                initial={{ x: -288 }}
                animate={{ x: 0 }}
                exit={{ x: -288 }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              >
                <Sidebar mobile onNavigate={() => setMobileNav(false)} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <main ref={mainRef} className="scrollbar-none relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <Outlet />
        </main>

        {jump.scrollable && (
          <div className="fixed bottom-24 right-4 z-30 flex flex-col gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              disabled={jump.atTop}
              aria-label="Scroll to top"
              className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-opacity disabled:opacity-40"
            >
              <LuChevronsUp className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: 'smooth' })}
              disabled={jump.atBottom}
              aria-label="Scroll to bottom"
              className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-opacity disabled:opacity-40"
            >
              <LuChevronsDown className="size-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
