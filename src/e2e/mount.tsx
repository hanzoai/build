/**
 * The builder as another host mounts it — the Hanzo app's Dev section, or any
 * page that is not hanzo.build — for the specs that check what the builder does
 * with a host that offers less: no theme to repaint, no sign-in of its own, no
 * list of organizations or way to switch them.
 *
 * `mounted()` (mount.ts) serves this in place of the app's own entry, and the
 * spec describes the host in `window.mount` before the page loads. Where the
 * builder moves or links out is kept in `window.went`, for the spec to read.
 */
import { Hanzo } from '@hanzo/ui'
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Builder } from '../builder.tsx'
import type { Host } from '../host.tsx'
import type { Mount } from './mount.ts'

declare global {
  interface Window {
    mount: Mount
    went: string[]
  }
}

window.went = []

function Page() {
  const m = window.mount
  const [path, setPath] = useState(m.path)
  const host: Host = {
    api: window.location.origin,
    token: () => m.token,
    org: m.org,
    memberships: m.memberships,
    theme: m.theme,
    person: m.person,
    admin: m.admin,
    path,
    go: (p) => {
      window.went.push(p)
      setPath(p)
    },
    links: { github: '/-/sync', customize: '/-/customize', settings: '/-/settings', home: '/' },
    open: (href) => void window.went.push(href),
  }
  return (
    <div style={{ height: '100dvh', display: 'flex' }}>
      <Builder host={host} rail={false} />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <Hanzo theme="dark">
    <Page />
  </Hanzo>,
)
