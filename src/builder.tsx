/**
 * The builder: the rail, and whichever pane the address names.
 *
 *   /            New — the empty state, a composer over the repo it works on
 *   /sess_…      one run, live
 *   /-/artifacts what this org has built
 *   /-/templates the public starters
 *   /<slug>      a project's workspace, in this same window
 *
 * The rail is the sessions rail every Hanzo surface shares: New, the builder's
 * places, the org's coding runs newest first with a live status dot, and the
 * account. Its collapse is an explicit toggle kept per browser.
 *
 * A project's workspace takes the whole window — it has its own chat column,
 * bar and panes — and its mark leads back here.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Blocks, BookOpen, Cpu, LayoutTemplate, Menu, Puzzle } from '@hanzogui/lucide-icons-2'
import { SessionRail, type RailLink, type RailSession, type SessionStatus } from '@hanzo/ui/chat'
import { HanzoMark } from '@hanzo/ui/product'
import { useMemo, useState } from 'react'

import { useKept, useRecents } from './data.ts'
import { HostProvider, useHost, useTarget, type Host } from './host.tsx'
import { Landing } from './landing.tsx'
import { Project } from './project.tsx'
import { path, route } from './route.ts'
import { Run } from './run.tsx'
import { Artifacts, Templates } from './shelf.tsx'
import { Account, Find } from './account.tsx'

const DOTS: Record<string, SessionStatus> = {
  running: 'running',
  paused: 'paused',
  done: 'done',
  stopped: 'stopped',
  error: 'error',
}

type Order = 'newest' | 'running'

function Shell() {
  const host = useHost()
  const t = useTarget()
  const r = route(host.path)
  const recents = useRecents(t, Boolean(host.person))
  const [collapsed, setCollapsed] = useKept('hanzo.build.rail', false)
  const [drawer, setDrawer] = useState(false)
  const [order, setOrder] = useState<Order>('newest')
  const [account, setAccount] = useState(false)
  const [finding, setFinding] = useState(false)

  const go = (p: string) => {
    setDrawer(false)
    host.go(p)
  }

  const rows: RailSession[] = useMemo(() => {
    const list = recents.value.map((s) => ({ id: s.id, title: s.title || 'Untitled run', status: DOTS[s.status] ?? 'idle' }))
    if (order === 'running') list.sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'))
    return list
  }, [recents.value, order])

  const screen = r.kind === 'screen' ? r.screen : ''
  const links: RailLink[] = [
    { id: 'artifacts', label: 'Artifacts', icon: <Blocks size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'artifacts' })), active: screen === 'artifacts' },
    { id: 'customize', label: 'Customize', icon: <Puzzle size={16} />, onPress: () => host.open(host.links.customize) },
  ]
  const more: RailLink[] = [
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'templates' })), active: screen === 'templates' },
    { id: 'machines', label: 'Machines', icon: <Cpu size={16} />, onPress: () => host.open(`${host.links.home.replace(/\/+$/, '')}/platform/computers`) },
    { id: 'docs', label: 'Docs', icon: <BookOpen size={16} />, onPress: () => window.open('https://docs.hanzo.ai/docs/dev', '_blank', 'noopener,noreferrer') },
  ]

  return (
    <XStack flex={1} minH={0} minW={0} bg="$background">
      <SessionRail
        onNew={() => go('')}
        fresh={r.kind === 'new'}
        links={links}
        more={more}
        recents={rows}
        active={r.kind === 'run' ? r.id : null}
        onOpen={(id) => go(id)}
        onSort={() => setOrder(order === 'newest' ? 'running' : 'newest')}
        sortLabel={order === 'newest' ? 'Show running first' : 'Show newest first'}
        empty={
          <SizableText size="$1" color="$soft" px="$2">
            {!host.person ? 'Sign in to see your runs.' : recents.error ? recents.error.message : recents.loading ? 'Reading…' : 'No runs yet.'}
          </SizableText>
        }
        account={
          host.person
            ? { name: host.person.email || host.person.name, onPress: () => setAccount(true) }
            : { name: 'Sign in', onPress: () => host.signIn?.() }
        }
        onSettings={() => host.open(host.links.settings)}
        onSearch={() => setFinding(true)}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        mark={<HanzoMark size={18} />}
        open={drawer}
        onOpenChange={setDrawer}
        label="Runs"
      />
      <YStack flex={1} minW={0} minH={0} position="relative">
        {/* Below md the rail is a drawer; this is the one control that opens it. */}
        <XStack position="absolute" t="$2" l="$2" z={1} $md={{ display: 'none' }}>
          <XStack
            render="button"
            onPress={() => setDrawer(true)}
            aria-label="Open runs"
            width={36}
            height={36}
            items="center"
            justify="center"
            rounded="$3"
            hoverStyle={{ bg: '$hover' }}
          >
            <Menu size={18} />
          </XStack>
        </XStack>
        {r.kind === 'run' ? (
          <Run key={r.id} id={r.id} />
        ) : r.kind === 'screen' ? (
          r.screen === 'artifacts' ? <Artifacts /> : <Templates />
        ) : (
          <Landing onStarted={(id) => { recents.reload(); go(id) }} />
        )}
      </YStack>
      <Account open={account} onOpenChange={setAccount} />
      <Find open={finding} onOpenChange={setFinding} recents={rows} onOpen={(id) => { setFinding(false); go(id) }} />
    </XStack>
  )
}

function Screens() {
  const host = useHost()
  const r = route(host.path)
  return r.kind === 'project' ? <Project key={r.slug} slug={r.slug} /> : <Shell />
}

/** The builder. Mount it under a gui root (`<Hanzo>`), in a box with a height. */
export function Builder({ host }: { host: Host }) {
  return (
    <HostProvider host={host}>
      <YStack flex={1} minH={0} minW={0} height="100%">
        <Screens />
      </YStack>
    </HostProvider>
  )
}
