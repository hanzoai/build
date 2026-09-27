/**
 * A host that has its own rail, mounted the way the README says the Hanzo app
 * mounts the builder at /dev: `DevSection` in the host's own sidebar beside
 * `<Builder rail={false}>`, both from the package entry. cov-app.spec.ts drives
 * it through the dev server at /src/e2e/host.html.
 *
 * The address under the mount lives in this page's state, and every move the
 * builder asks of the host, and every pick, is written out under the sidebar,
 * so a spec reads what the host was asked to do.
 *
 *   ?label=Dev    the runs section's label, instead of the default
 *   ?at=<path>    the address to start at
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { SizableText } from '@hanzo/gui'
import { Hanzo, XStack, YStack } from '@hanzo/ui'
import { Sidebar, SidebarItem } from '@hanzo/ui/chat'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { administers, Builder, DevSection, type Host } from '../index.ts'

const ORG = 'acme'
const bearer = () => window.localStorage.getItem('hanzo_iam_access_token')

function Page() {
  const q = new URLSearchParams(window.location.search)
  const [at, setAt] = useState(q.get('at') ?? '')
  const [moves, setMoves] = useState<string[]>([])
  const [picks, setPicks] = useState(0)
  const token = bearer()
  const host: Host = {
    api: window.location.origin,
    token: bearer,
    org: ORG,
    person: token ? { name: 'Dave', email: 'dave@acme.test', avatar: '' } : null,
    admin: administers(token, ORG),
    path: at,
    go: (p) => {
      setAt(p)
      setMoves((m) => [...m, p || '(new)'])
    },
    links: { github: '/dev/-/sync', customize: '/dev/-/customize', settings: '/settings', home: '/' },
    open: () => {},
  }
  const label = q.get('label')
  return (
    <XStack flex={1} minH={0} minW={0}>
      <Sidebar aria-label="Host rail">
        {label ? (
          <DevSection host={host} label={label} onPick={() => setPicks((n) => n + 1)}>
            <SidebarItem>The host’s own row</SidebarItem>
          </DevSection>
        ) : (
          <DevSection host={host} />
        )}
        <YStack flex={1} />
        <SizableText size="$1" color="$soft" aria-label="Moves">
          {moves.join(' | ')}
        </SizableText>
        <SizableText size="$1" color="$soft" aria-label="Picks">
          {String(picks)}
        </SizableText>
      </Sidebar>
      <Builder host={host} rail={false} />
    </XStack>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hanzo theme="dark">
      <YStack flex={1} minW={0} bg="$background" style={{ height: '100dvh', overflow: 'hidden' }}>
        <Page />
      </YStack>
    </Hanzo>
  </StrictMode>,
)
