/**
 * A host that has its own rail, mounted the way the README says the Hanzo app
 * mounts the builder at /dev: `DevSection` in the host's own sidebar beside
 * `<Builder rail={false}>`, both from the package entry. cov-app.spec.ts drives
 * it through the dev server at /src/e2e/host.html.
 *
 * The address under the mount lives in this page's state, and every move the
 * builder asks of the host, and every pick, is written out under the sidebar,
 * so a spec reads what the host was asked to do. The sidebar is sized by the
 * builder's own edge (`Grip`), and pulled past its floor it is put away until
 * "Show the rail" brings it back.
 *
 *   ?label=Dev    the runs section's label, instead of the default
 *   ?at=<path>    the address to start at
 *   ?local=<n>    the host has the computer (Hanzo Desktop's `local`), with n folders opened already; its folder dialog
 *                 answers /Users/dave/picked, and every run it is asked for is written out under the sidebar (Runs on this computer)
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { SizableText } from '@hanzo/gui'
import { Hanzo, XStack, YStack } from '@hanzo/ui'
import { Sidebar, SidebarItem } from '@hanzo/ui/chat'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { administers, Builder, DevSection, Grip, type Folder, type Host, type Local } from '../index.ts'

const ORG = 'acme'
const bearer = () => window.localStorage.getItem('hanzo_iam_access_token')

/** A computer with `n` folders opened (the last one used most recently), as Hanzo Desktop's `local` answers. */
function computer(n: number, ran: (line: string) => void): Local {
  let folders: Folder[] = Array.from({ length: n }, (_, i) => ({ path: `/Users/dave/f${i + 1}`, name: `f${i + 1}`, used: i + 1 }))
  const use = (path: string) => {
    const top = Math.max(0, ...folders.map((f) => f.used ?? 0)) + 1
    const known = folders.some((f) => f.path === path)
    folders = known ? folders.map((f) => (f.path === path ? { ...f, used: top } : f)) : [...folders, { path, name: path.split('/').pop() ?? path, used: top }]
  }
  return {
    folders: () => folders,
    pick: async () => {
      use('/Users/dave/picked')
      return folders.find((f) => f.path === '/Users/dave/picked') ?? null
    },
    use,
    run: async (folder, prompt) => {
      ran(`${folder} <- ${prompt}`)
      return { ok: true, output: `Edited README.md in ${folder}` }
    },
  }
}

function Page() {
  const q = new URLSearchParams(window.location.search)
  const [at, setAt] = useState(q.get('at') ?? '')
  const [moves, setMoves] = useState<string[]>([])
  const [picks, setPicks] = useState(0)
  const [width, setWidth] = useState(264)
  const [shut, setShut] = useState(false)
  const [ran, setRan] = useState<string[]>([])
  const [local] = useState(() => (q.has('local') ? computer(Number(q.get('local')) || 0, (line) => setRan((r) => [...r, line])) : undefined))
  const token = bearer()
  const host: Host = {
    name: 'Hanzo',
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
    ...(local ? { local } : {}),
  }
  const label = q.get('label')
  if (shut)
    return (
      <XStack flex={1} minH={0} minW={0}>
        <SidebarItem onPress={() => setShut(false)}>Show the rail</SidebarItem>
        <Builder host={host} rail={false} />
      </XStack>
    )
  return (
    <XStack flex={1} minH={0} minW={0}>
      <Sidebar aria-label="Host rail" width={width} position="relative">
        <Grip side="left" span={width} floor={200} ceil={480} reset={264} onSpan={setWidth} onShut={() => setShut(true)} label="Resize the rail" />
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
        <SizableText size="$1" color="$soft" aria-label="Runs on this computer">
          {ran.join(' | ')}
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
