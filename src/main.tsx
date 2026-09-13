import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from '@/components/ui/Toast'
import { store } from '@/store'
import { slugFromHost } from '@/lib/tenant'
import { applyTheme } from '@/lib/theme'
import { applyBranding } from '@/lib/branding'
import { readCachedTheme } from '@/lib/themeCache'
import { installNumberInputWheelGuard } from '@/lib/numberInputWheelGuard'

installNumberInputWheelGuard()

// Synchronous, pre-paint: if this tenant's theme/branding is already cached
// from a previous visit, apply it before React even mounts so there is zero
// flash of the default look. The authoritative value from /tenant/resolve
// re-applies (and re-caches) once it lands, via the resolveTenant thunk.
const cached = readCachedTheme(slugFromHost() ?? 'dev')
if (cached) {
  applyTheme(cached)
  applyBranding(cached)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
