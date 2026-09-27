/**
 * The builder as another host mounts it — the Hanzo app's Dev section, which
 * brings its own session and router, may bring its own rail, and leaves out
 * what `Host` marks optional (the org list, the switch, sign in and out).
 *
 * The spec names that host before the page loads (`window.given`, cov-forge.ts
 * `mount`), and this page mounts `<Builder>` with it under `/host/`, moving with
 * the history API the way a host's router would.
 */
import { Hanzo, YStack } from '@hanzo/ui'
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Builder } from '../builder.tsx'
import type { Host, Person } from '../host.tsx'

export interface Given {
  org: string | null
  memberships?: string[]
  person: Person | null
  admin: boolean
  rail: boolean
  token: string | null
}

const AT = '/host/'
const given = (window as { given?: Given }).given!
// Read at call time and stable across renders, as a host's bearer reader is.
const token = () => given.token

function Mount() {
  const [path, setPath] = useState(window.location.pathname.slice(AT.length))
  const host: Host = {
    name: 'Hanzo',
    api: window.location.origin,
    token,
    org: given.org,
    memberships: given.memberships,
    person: given.person,
    admin: given.admin,
    path,
    go: (p) => {
      window.history.pushState(null, '', `${AT}${p}`)
      setPath(p)
    },
    links: { github: '', customize: '', settings: '', home: '' },
    open: (href) => window.location.assign(href),
  }
  return <Builder host={host} rail={given.rail} />
}

createRoot(document.getElementById('root')!).render(
  <Hanzo theme="dark">
    <YStack flex={1} minW={0} bg="$background" style={{ height: '100dvh', overflow: 'hidden' }}>
      <Mount />
    </YStack>
  </Hanzo>,
)
