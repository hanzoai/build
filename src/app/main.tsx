import { Hanzo, YStack } from '@hanzo/ui'
// Zen, the face `--font-sans` names; @hanzo/ui's theme names it and ships no woff2.
import '@hanzo/font/css'
// The tokens, the reset and the glass material.
import '@hanzo/ui/theme.css'
// The rules the components assume (the grid-child `min-width: 0` floor).
import '@hanzo/ui/styles/motion.css'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { Callback } from './callback.tsx'
import { Identity, Mount } from './root.tsx'

/**
 * The ambient telemetry client, off: a page anyone can run and fork does not
 * beacon to somebody else's tenant on their behalf. Module scope, because the
 * client is built on first use during render.
 */
;(globalThis as { __HANZO_TELEMETRY__?: { enabled?: boolean } }).__HANZO_TELEMETRY__ = { enabled: false }

/** `/auth/callback` is where the issuer returns a browser; every other address is the builder's. */
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
  <StrictMode>
    <Hanzo theme="dark">
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {/* A flex column, not a Box: a block parent makes `flex: 1` inert below it. */}
        <YStack flex={1} minW={0} bg="$background" style={{ height: '100dvh', overflow: 'hidden' }}>
          <RouterProvider router={router} />
        </YStack>
      </ThemeProvider>
    </Hanzo>
  </StrictMode>,
)
