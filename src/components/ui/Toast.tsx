import type { ReactNode } from 'react'
import { Toaster, toast as sonnerToast } from 'sonner'
import { LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert } from 'react-icons/lu'

// A thin, themed wrapper around `sonner`. The rest of the app keeps calling
// `const toast = useToast()` → `toast.success(...)` / `toast.error(...)`
// exactly as before; only the engine underneath changed. For richer needs
// (promise, loading, custom, dismiss) import `toast` from here directly.

const DURATION = { success: 4000, info: 4000, warning: 6000, error: 6000 } as const

export type ToastApi = {
  success: (message: string, description?: string) => void
  error: (message: string, description?: string) => void
  warning: (message: string, description?: string) => void
  info: (message: string, description?: string) => void
}

const api: ToastApi = {
  success: (message, description) => sonnerToast.success(message, { description, duration: DURATION.success }),
  error: (message, description) => sonnerToast.error(message, { description, duration: DURATION.error }),
  warning: (message, description) => sonnerToast.warning(message, { description, duration: DURATION.warning }),
  info: (message, description) => sonnerToast.message(message, { description, duration: DURATION.info }),
}

/** Kept as a hook for a drop-in replacement of the old context API — it just
 *  returns the static, theme-styled sonner bindings. */
export function useToast(): ToastApi {
  return api
}

/** The raw sonner instance — `toast.promise`, `toast.loading`, `toast.dismiss`, … */
export { sonnerToast as toast }

/** Mounted once at the project entry (see main.tsx). Renders children plus the
 *  toast viewport so existing `<ToastProvider>` wrappers keep working. */
export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        offset={20}
        gap={10}
        visibleToasts={4}
        // Above every modal and overlay, so an error is never hidden behind one.
        style={{ zIndex: 2147483647 }}
        closeButton
        toastOptions={{
          classNames: {
            toast:
              'group !bg-card !text-foreground !border !border-l-4 !border-border !rounded-sm !shadow-lg !p-3.5 !gap-2.5 !w-full',
            title: '!text-sm !font-medium !text-foreground',
            description: '!text-xs !text-muted-foreground',
            icon: '!mt-0.5 !size-[18px] shrink-0',
            content: '!gap-0.5',
            closeButton:
              '!left-auto !right-1.5 !top-1.5 !translate-x-0 !translate-y-0 !border-transparent !bg-transparent !text-muted-foreground hover:!text-foreground hover:!bg-muted',
            success: '!border-l-success [&_[data-icon]]:!text-success',
            error: '!border-l-destructive [&_[data-icon]]:!text-destructive',
            warning: '!border-l-warning [&_[data-icon]]:!text-warning',
            info: '!border-l-secondary [&_[data-icon]]:!text-secondary',
            default: '!border-l-secondary [&_[data-icon]]:!text-secondary',
          },
        }}
        icons={{
          success: <LuCircleCheck className="size-[18px]" />,
          error: <LuCircleAlert className="size-[18px]" />,
          warning: <LuTriangleAlert className="size-[18px]" />,
          info: <LuInfo className="size-[18px]" />,
        }}
      />
    </>
  )
}
