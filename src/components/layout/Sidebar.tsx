import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LuChevronLeft, LuChevronRight, LuLogOut, LuRefreshCw, LuX } from 'react-icons/lu'
import { IoPersonCircleSharp } from 'react-icons/io5'
import { navigation, navItemAllowed, navItemMatchesExactly, sectionModuleEnabled, type PermissionSection } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { logout } from '@/store/authSlice'
import { api, resolveLogoUrl } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

const EXPANDED_WIDTH = 264
const COLLAPSED_WIDTH = 80
const DEFAULT_SECTIONS: PermissionSection[] = ['OVERVIEW']
const HOUSEKEEPING_POLL_MS = 10_000

type SidebarProps = {
  className?: string
  /** Rendered as a slide-in drawer (mobile) — never collapsible, shows a
   *  close button, and closes itself on navigation. */
  mobile?: boolean
  onNavigate?: () => void
}

export default function Sidebar({ className, mobile = false, onNavigate }: SidebarProps) {
  const [collapsedState, setCollapsed] = useState(false)
  const [housekeepingBadge, setHousekeepingBadge] = useState(0)
  const collapsed = mobile ? false : collapsedState
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const user = useAppSelector((s) => s.auth.user)
  const logoUrl = useAppSelector((s) => s.tenant.logoUrl)
  const shortName = useAppSelector((s) => s.tenant.shortName)
  const allowedSections = useAppSelector((s) => s.auth.user?.role?.allowedSections) ?? DEFAULT_SECTIONS
  const permissions = useAppSelector((s) => s.auth.user?.role?.permissions) ?? []
  const moduleKeys = useAppSelector((s) => s.tenant.moduleKeys)
  const visibleNavigation = navigation
    .filter((group) => sectionModuleEnabled(group.section, moduleKeys))
    .map((group) => ({ ...group, items: group.items.filter((item) => navItemAllowed(item, allowedSections.includes(group.section), permissions)) }))
    .filter((group) => group.items.length > 0)
  const canSeeHousekeepingTasks = useMemo(() => visibleNavigation.some((group) => group.items.some((item) => item.href === '/housekeeping')), [visibleNavigation])
  const lastHousekeepingBadge = useRef<number | null>(null)

  useEffect(() => {
    if (!user || !canSeeHousekeepingTasks) {
      setHousekeepingBadge(0)
      lastHousekeepingBadge.current = null
      return
    }

    let cancelled = false
    async function loadCount(quiet = false) {
      try {
        const data = await api<{ badge: number }>('/housekeeping/tasks/count')
        if (cancelled) return
        const next = Number(data.badge) || 0
        const previous = lastHousekeepingBadge.current
        setHousekeepingBadge(next)
        if (previous != null && next > previous && !location.pathname.startsWith('/housekeeping')) {
          const added = next - previous
          toast.info(added === 1 ? 'New housekeeping task' : `${added} new housekeeping tasks`)
        }
        lastHousekeepingBadge.current = next
      } catch {
        if (!cancelled && !quiet) setHousekeepingBadge(0)
      }
    }

    void loadCount()
    const timer = window.setInterval(() => { if (!document.hidden) void loadCount(true) }, HOUSEKEEPING_POLL_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [canSeeHousekeepingTasks, location.pathname, toast, user])

  function handleLogout() {
    void dispatch(logout())
    onNavigate?.()
    navigate('/login', { replace: true })
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className={cn(
        'relative z-20 flex h-svh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      {!mobile && (
        <div className="absolute -right-3.5 top-8 z-30 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
          >
            {collapsed ? <LuChevronRight className="size-4" /> : <LuChevronLeft className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            title="Refresh page"
            className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
          >
            <LuRefreshCw className="size-4" />
          </button>
        </div>
      )}
      {/* Brand */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5',
          collapsed && 'justify-center px-0',
        )}
      >
        <img src={resolveLogoUrl(logoUrl) ?? '/PRIMARY.png'} alt={shortName ?? 'Hotelier'} className="size-10 shrink-0 rounded-sm object-contain" />
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <p className="font-display text-[15px] font-extrabold leading-none tracking-tight text-white">
                {shortName ?? 'HOTELIER'}
              </p>
              <p className="mt-1 text-[11px] leading-none text-sidebar-muted">
                Hotel Management by TANZ
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {mobile && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close menu"
            className="ml-auto shrink-0 rounded-sm p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white"
          >
            <LuX className="size-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="scrollbar-none flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {visibleNavigation.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden px-3 text-[10.5px] font-semibold uppercase tracking-wider text-white/80"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>
            <ul
              className={cn(
                'flex flex-col gap-0.5',
                !collapsed && 'relative mt-1.5',
              )}
            >
              {!collapsed && group.items.length > 1 && (
                <span className="absolute bottom-3.5 top-3.5 left-[12px] w-px bg-sidebar-border" />
              )}
              {group.items.map((item) => (
                <li key={item.href} className="relative">
                  <NavLink
                    to={item.href}
                    end={navItemMatchesExactly(item.href)}
                    onClick={mobile ? onNavigate : undefined}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 py-2 text-[13.5px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-white',
                        !collapsed && (group.items.length > 1 ? 'pl-7 pr-3' : 'px-3'),
                        collapsed && 'justify-center px-0 py-2.5',
                        isActive && 'bg-sidebar-accent text-white before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[color-mix(in_srgb,var(--primary)_45%,white)]',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {!collapsed && group.items.length > 1 && (
                          <span
                            className={cn(
                              'absolute left-[9px] size-[7px] shrink-0 rounded-full border-2 bg-sidebar transition-colors',
                              isActive
                                ? 'border-secondary'
                                : 'border-sidebar-border group-hover:border-sidebar-muted',
                            )}
                          />
                        )}
                        <span className="relative shrink-0">
                          <item.icon className="size-[18px]" />
                          {item.href === '/housekeeping' && housekeepingBadge > 0 && collapsed && (
                            <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground shadow-sm">
                              {housekeepingBadge > 9 ? '9+' : housekeepingBadge}
                            </span>
                          )}
                        </span>
                        <AnimatePresence initial={false}>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              transition={{ duration: 0.15 }}
                              className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
                            >
                              {item.label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        {item.href === '/housekeeping' && housekeepingBadge > 0 && !collapsed && (
                          <span className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm">
                            {housekeepingBadge > 99 ? '99+' : housekeepingBadge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer / signed-in user */}
      {user && (
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-sm bg-card p-2.5 shadow-sm',
              collapsed && 'flex-col gap-1.5 p-2',
            )}
          >
            <IoPersonCircleSharp className="size-9 shrink-0 text-secondary" />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0 flex-1 overflow-hidden"
                >
                  <p className="truncate text-[13px] font-semibold text-foreground">{user.firstName} {user.lastName}</p>
                  <p className="truncate text-[11.5px] font-medium text-muted-foreground">{user.role?.name ?? user.jobTitle}</p>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              className="shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <LuLogOut className="size-4" />
            </button>
          </div>
        </div>
      )}
    </motion.aside>
  )
}
