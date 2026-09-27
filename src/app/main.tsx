import { Hanzo, YStack } from '@hanzo/ui'
// Zen, the face `--font-sans` names; @hanzo/ui's theme names it and ships no woff2.
import '@hanzo/font/css'
// The tokens, the reset and the glass material.
import '@hanzo/ui/theme.css'
// The rules the components assume (the grid-child `min-width: 0` floor).
import '@hanzo/ui/styles/motion.css'
import { ThemeProvider, useTheme } from 'next-themes'
import { StrictMode, type ReactNode } from 'react'
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

/**
 * The gui root in whichever theme next-themes resolved — the person's choice,
 * kept in this browser and set from their saved settings — so the components
 * that resolve a colour in JS agree with the stylesheet the class selects.
 */
function Themed({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()
  return <Hanzo theme={resolvedTheme === 'light' ? 'light' : 'dark'}>{children}</Hanzo>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Themed>
        {/* A flex column, not a Box: a block parent makes `flex: 1` inert below it. */}
        <YStack flex={1} minW={0} bg="$background" style={{ height: '100dvh', overflow: 'hidden' }}>
          <RouterProvider router={router} />
        </YStack>
      </Themed>
    </ThemeProvider>
  </StrictMode>,
)
