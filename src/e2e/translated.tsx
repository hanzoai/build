/**
 * The builder's own app in a language, for translated.spec.ts: the same
 * router, identity and theme as src/app/main.tsx, inside @hanzo/i18n's
 * provider as a host mounts it.
 *
 * `window.lang` before the page loads: the locale, and the catalog the
 * provider loads for it (the spec writes its own, so it reads what it wrote).
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import '@hanzo/i18n/rtl.css'
import { I18nProvider } from '@hanzo/i18n/react'
import { Hanzo, Toaster, YStack } from '@hanzo/ui'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { Callback } from '../app/callback.tsx'
import { Identity, Mount } from '../app/root.tsx'
import type { Lang } from './language.tsx'

declare global {
  interface Window {
    lang: Lang
  }
}

;(globalThis as { __HANZO_TELEMETRY__?: { enabled?: boolean } }).__HANZO_TELEMETRY__ = { enabled: false }

const router = createBrowserRouter([
  {
    element: <Identity />,
    children: [
      { path: '/auth/callback', element: <Callback /> },
      { path: '*', element: <Mount /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <I18nProvider userId="acme/dave" initialLocale={window.lang.locale} loadCatalog={async () => window.lang.catalog}>
    <Hanzo theme="dark">
      <YStack flex={1} minW={0} bg="$background" height="100dvh" overflow="hidden">
        <RouterProvider router={router} />
      </YStack>
      <Toaster />
    </Hanzo>
  </I18nProvider>,
)
