import { Hanzo } from '@hanzo/ui'
// THE FACES. Zen is authored in `@hanzo/font`, which ships the woff2 the
// `@font-face` needs; `@hanzo/ui`'s theme names the family and nothing more, so
// without this the `--font-sans` token resolves to a system fallback.
import '@hanzo/font/css'
// THE MATERIAL AND THE TOKENS. `theme.css` is @hanzo/design's sheet, the reset,
// and the glass surfaces together.
import '@hanzo/ui/theme.css'
// THE RULES THE COMPONENTS ASSUME: the `min-width: 0` floor every Grid child
// needs, stated once by the package rather than inline on each component.
import '@hanzo/ui/styles/motion.css'
// THIS APP'S OWN LAYOUT — the column beside the pane, and the paint the
// composer's controls leave to their host.
import '~/build.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '~/app'

/**
 * THE AMBIENT TELEMETRY CLIENT, OFF.
 *
 * `@hanzo/ui` depends on `@hanzogui/telemetry`, whose `track` builds a client
 * the first time any shared component reports an interaction — zero config,
 * pageviews on by default, and an absolute ingest address it carries itself.
 * This surface measures nobody: a page anyone can run and fork does not beacon
 * to somebody else's tenant on their behalf, and with no key to send the
 * refusal is a console error on every visit besides.
 *
 * Module scope, not an effect: the ambient client is built on first use DURING
 * render, and this chunk is evaluated before any component runs.
 */
;(globalThis as { __HANZO_TELEMETRY__?: { enabled?: boolean } }).__HANZO_TELEMETRY__ = {
  enabled: false,
}

/**
 * The mount.
 *
 * `<Hanzo>` IS the root: it mounts the gui provider with the config the
 * `$background` / `$ink` / `$borderColor` tokens resolve against. There is no
 * config file here to keep in step with the components — a second config is how
 * two surfaces of one product end up different sizes.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hanzo theme="dark">
      <App />
    </Hanzo>
  </StrictMode>,
)
