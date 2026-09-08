import { YStack } from '@hanzo/ui'
import { ThemeProvider } from 'next-themes'
import { RouterProvider } from 'react-router/dom'

import { router } from '~/routes'

/**
 * The application.
 *
 * `<Hanzo>` sits above this (main.tsx) and is the design system; identity and
 * the platform client sit BELOW, as the layout route every screen shares
 * (routes.tsx), because the callback screen needs the router.
 *
 * THE ROOM IS A FLEX COLUMN AND SAYS SO. `YStack`, not `Box`: `Box` renders
 * `display: block`, and a block parent makes `flex: 1` inert on every descendant
 * — the frame under it then sizes to its own bar, the pane and the column
 * beside it measure zero high, and the builder paints a header over an empty
 * page with no error anywhere.
 *
 * The document IS the builder, so it states its size once and clips, and every
 * pane below scrolls inside it. `flex={1}` for the width and `100dvh` for the
 * height — `#root` is the flex parent, so width comes from growing into it and
 * height is the one thing only the document can answer. `dvh` rather than `vh`
 * so a phone's collapsing browser bar cannot crop the composer off.
 *
 * `ThemeProvider` is what a theme control writes to. `attribute="class"`
 * because that is the switch @hanzo/ui reads.
 */
export const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <YStack flex={1} minW={0} bg="$background" style={{ height: '100dvh', overflow: 'hidden' }}>
      <RouterProvider router={router} />
    </YStack>
  </ThemeProvider>
)
