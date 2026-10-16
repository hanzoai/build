/**
 * The side panel alone, under a host the spec describes, for the page menu's
 * specs (menu.spec.ts): a browser page's host, which draws pages in frames and
 * has no browser of its own, or a window's, whose browser can find, print,
 * zoom, capture and keep history (Hanzo Desktop's). The surface's own acts —
 * ask about a page, open it in Dev, a skill, a screenshot handed back — are
 * written into `window.went`, as is every call the host's browser takes.
 *
 * `window.tabs` before the page loads: `browser` names the capabilities the
 * host has, `theme` the scheme, `at` the address a page tab opens on.
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { Hanzo, YStack } from '@hanzo/ui'
import { createRoot } from 'react-dom/client'

import type { Browse, Browser, Host } from '../host.tsx'
import { HostProvider } from '../host.tsx'
import { Panel } from '../panel.tsx'
import { PAGE, useDeck } from '../tabs.ts'

export interface Tabs {
  browser?: (keyof Browser)[]
  theme?: 'light' | 'dark'
  at?: string
}

declare global {
  interface Window {
    tabs: Tabs
    went: string[]
  }
}

window.went = []
const said = (what: string) => void window.went.push(what)

/** A browser that does what it is asked by saying so, as a spec reads it. */
function browser(names: (keyof Browser)[]): Browser {
  const all: Browser = {
    find: (p) => said(`find ${p.url}`),
    print: (p) => said(`print ${p.url}`),
    zoom: (p, n) => said(`zoom ${p.url} ${n}`),
    devices: (p) => said(`devices ${p.url}`),
    capture: async (p) => {
      said(`capture ${p.url}`)
      return new Blob(['png'], { type: 'image/png' })
    },
    selection: async () => 'the selected words',
    passwords: () => said('passwords'),
    downloads: () => said('downloads'),
    history: () => said('history'),
    clear: () => said('clear'),
    settings: () => said('settings'),
  }
  return Object.fromEntries(names.map((n) => [n, all[n]])) as Browser
}

/** A window's page, as the host draws it outside the frame: here a box that names it. */
const Native: Browse = ({ url }) => (
  <YStack flex={1} items="center" justify="center" data-slot="native-page">
    <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>{`A native view of ${url}`}</span>
  </YStack>
)

function Page() {
  const t = window.tabs
  const side = useDeck('menu', { tabs: [{ id: 'p', kind: PAGE, title: 'New tab', url: t.at ?? '' }], at: 'p' })
  const host: Host = {
    name: 'Hanzo',
    api: window.location.origin,
    token: () => null,
    org: null,
    person: null,
    admin: false,
    path: '',
    go: () => {},
    links: { github: '', customize: '', settings: '', home: '/' },
    open: () => {},
    // A window's host draws its pages and has a browser; a browser page's has neither.
    ...(t.browser ? { browser: browser(t.browser), browse: Native } : {}),
  }
  return (
    <HostProvider host={host}>
      <YStack flex={1} minW={0} style={{ height: '100dvh' }} bg="$background">
        <Panel
          side={side}
          kinds={[]}
          onHide={() => said('hide')}
          label="Tabs"
          suggested={[
            { title: 'Hanzo AI', url: 'https://hanzo.ai' },
            { title: 'Docs', url: 'https://docs.hanzo.ai' },
            { title: 'Acme store', url: 'https://acme.hanzo.app' },
          ]}
          onAsk={(p) => said(`ask ${p.url}${p.selection ? ` [${p.selection}]` : ''}`)}
          onDev={(p) => said(`dev ${p.url}`)}
          onCapture={(f, p) => said(`captured ${f.name.endsWith('.png') ? 'png' : f.name} ${f.type} ${p.url}`)}
          skills={[{ id: 'summarize', name: 'Summarize', run: (p) => said(`skill summarize ${p.url}`) }]}
        />
      </YStack>
    </HostProvider>
  )
}

// The scheme's class on the document, as next-themes puts it there for the app.
document.documentElement.classList.remove('light', 'dark')
document.documentElement.classList.add(window.tabs.theme ?? 'dark')
document.documentElement.dataset.theme = window.tabs.theme ?? 'dark'

createRoot(document.getElementById('root')!).render(
  <Hanzo theme={window.tabs.theme ?? 'dark'}>
    <Page />
  </Hanzo>,
)
