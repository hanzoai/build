/**
 * The builder: the rail, and whichever pane the address names.
 *
 *   /            New — the empty state, a composer over the codebase it works on
 *   /sess_…      one run, live
 *   /-/automations repeating work
   /-/codebases the forge's repositories
 *   /-/sync      bring granted repositories onto the forge
 *   /-/projects  the forge's boards
 *   /-/issues    the forge's issues
 *   /-/artifacts what this org has built
 *   /-/templates the public starters
 *   /-/customize skills, connectors, plugins and agents
 *   /<slug>      a deployed project's workspace, in this same window
 *
 * The rail is the sessions rail every Hanzo surface shares: New, the builder's
 * places with the rest under More, the org's coding runs newest first with a
 * live status dot, and at the foot the offer of Hanzo in Slack and the account,
 * whose menu opens Settings, Usage, the plans, help and logging out (foot.tsx).
 * Its collapse is an explicit toggle kept per browser.
 *
 * A project's workspace takes the whole window — it has its own chat column,
 * bar and panes — and its mark leads back here.
 *
 * A host with a rail of its own mounts `<Builder rail={false}>` and draws the
 * builder's places and runs in that rail with `DevSection` (section.tsx): one
 * left column, never two.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Blocks, BookOpen, CircleDot, Cpu, FolderGit2, Kanban, LayoutTemplate, Menu, SlidersHorizontal, Workflow } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { SessionRail, type RailLink, type RailSession } from '@hanzo/ui/chat'
import { HanzoMark } from '@hanzo/ui/product'
import { useMemo, useState } from 'react'

import { pinBoard } from './choice.ts'
import { Customize } from './customize/index.tsx'
import { useKept, useRecents } from './data.ts'
import { Forge } from './forge.tsx'
import { HostProvider, useHost, useTarget, type Host } from './host.tsx'
import { Landing } from './landing.tsx'
import { PrefsProvider } from './prefs.tsx'
import { Project } from './project.tsx'
import { Plans } from './plans.tsx'
import { path, route } from './route.ts'
import { Run } from './run.tsx'
import { DOTS } from './section.tsx'
import { Artifacts, Templates } from './shelf.tsx'
import { Find } from './find.tsx'
import { DOCS, Slack, Who } from './foot.tsx'
import { Settings } from './settings/index.tsx'
import { Where } from './switch.tsx'

type Order = 'newest' | 'running'

function Shell() {
  const host = useHost()
  const t = useTarget()
  const r = route(host.path)
  const recents = useRecents(t, Boolean(host.person))
  const [collapsed, setCollapsed] = useKept('hanzo.build.rail', false)
  const [drawer, setDrawer] = useState(false)
  const [order, setOrder] = useState<Order>('newest')
  const [finding, setFinding] = useState(false)
  const [menu, setMenu] = useState(false)
  const [slack, setSlack] = useKept('hanzo.build.slack', false)

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
  // The top left: the organization switcher once there is an org to switch, the mark before.
  // Beside the rail from md up, beside the drawer's button below it — one place at a time.
  const switcher = Boolean(host.person && (host.org || (host.memberships?.length ?? 0) > 0))
  const top = switcher ? (
    <Where />
  ) : (
    <XStack render="button" aria-label="Hanzo" items="center" onPress={() => go('')}>
      <HanzoMark size={18} />
    </XStack>
  )
  const links: RailLink[] = [
    { id: 'projects', label: 'Projects', icon: <Kanban size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'projects' })), active: screen === 'projects' },
    { id: 'artifacts', label: 'Artifacts', icon: <Blocks size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'artifacts' })), active: screen === 'artifacts' },
    { id: 'customize', label: 'Customize', icon: <SlidersHorizontal size={16} />, onPress: () => go(path({ kind: 'customize', tab: 'skills' })), active: r.kind === 'customize' || screen === 'mcp' },
    { id: 'automations', label: 'Automations', icon: <Workflow size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'automations' })), active: screen === 'automations' },
  ]
  const more: RailLink[] = [
    { id: 'codebases', label: 'Codebase', icon: <FolderGit2 size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'codebases' })), active: screen === 'codebases' },
    {
      id: 'issues',
      label: 'Issues',
      icon: <CircleDot size={16} />,
      onPress: () => {
        pinBoard(host.org, '')
        go(path({ kind: 'screen', screen: 'issues' }))
      },
      active: screen === 'issues',
    },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={16} />, onPress: () => go(path({ kind: 'screen', screen: 'templates' })), active: screen === 'templates' },
    {
      id: 'machines',
      label: 'Machines',
      icon: <Cpu size={16} />,
      onPress: () => go(path({ kind: 'settings', section: 'machines' })),
      active: r.kind === 'settings' && r.section === 'machines',
    },
    { id: 'docs', label: 'Docs', icon: <BookOpen size={16} />, onPress: () => window.open(DOCS, '_blank', 'noopener,noreferrer') },
  ]

  return (
    <XStack flex={1} minH={0} minW={0} bg="$background">
      <YStack position="relative" shrink={0}>
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
        notice={
          host.person && !slack ? (
            <Slack onOpen={() => go(path({ kind: 'settings', section: 'integrations' }))} onDismiss={() => setSlack(true)} />
          ) : undefined
        }
        account={
          host.person
            ? {
                name: host.person.email || host.person.name,
                onPress: () => {
                  setDrawer(false)
                  setMenu(true)
                },
              }
            : { name: 'Sign in', onPress: () => host.signIn?.() }
        }
        onSettings={() => go(path({ kind: 'settings', section: 'general' }))}
        onSearch={() => setFinding(true)}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        mark={<Brand org={host.org} />}
        pt={collapsed ? undefined : switcher ? 80 : 40}
        open={drawer}
        onOpenChange={setDrawer}
        label="Runs"
      />
      {collapsed ? null : (
        <XStack position="absolute" t={8} l={8} r={8} z={2} items="center" $max-md={{ display: 'none' }}>
          {top}
        </XStack>
      )}
      {host.person ? <Who open={menu} onOpenChange={setMenu} narrow={collapsed} /> : null}
      </YStack>
      <YStack flex={1} minW={0} minH={0} position="relative">
        {/* Below md the rail is a drawer; this is the one control that opens it. */}
        {/* Its own row, in flow: laid over the pane it covered the heading's mark. */}
        <XStack height={44} px="$2" gap="$2" items="center" shrink={0} $md={{ display: 'none' }}>
          <Button variant="ghost" size="icon-sm" onPress={() => setDrawer(true)} aria-label="Open runs">
            <Menu size={18} />
          </Button>
          {top}
        </XStack>
        <Pane onStarted={() => recents.reload()} />
      </YStack>
      <Find open={finding} onOpenChange={setFinding} recents={rows} onOpen={(id) => { setFinding(false); go(id) }} />
    </XStack>
  )
}

/** Whichever pane the address names, beside a rail — the builder's or the host's. */
function Pane({ onStarted }: { onStarted?: (id: string) => void }) {
  const host = useHost()
  const r = route(host.path)
  if (r.kind === 'run') return <Run key={r.id} id={r.id} />
  if (r.kind === 'settings') return <Settings section={r.section} />
  if (r.kind === 'customize') return <Customize tab={r.tab} />
  if (r.kind === 'screen') {
    if (r.screen === 'artifacts') return <Artifacts />
    if (r.screen === 'templates') return <Templates />
    if (r.screen === 'plans') return <Plans />
    return <Forge key={r.screen} screen={r.screen} />
  }
  return (
    <Landing
      onStarted={(id) => {
        onStarted?.(id)
        host.go(id)
      }}
    />
  )
}

/** The Hanzo mark on a personal account. An organization shows its own initial. */
function Brand({ org }: { org: string | null }) {
  if (!org || org === 'hanzo') return <HanzoMark size={18} />
  const letter = org.trim().charAt(0).toUpperCase() || 'H'
  return (
    <XStack width={18} height={18} rounded="$1" items="center" justify="center" bg="$raised" aria-hidden>
      <SizableText size="$1" fontWeight="600" color="$ink">
        {letter}
      </SizableText>
    </XStack>
  )
}

function Screens({ rail }: { rail: boolean }) {
  const host = useHost()
  const r = route(host.path)
  if (r.kind === 'project') return <Project key={r.slug} slug={r.slug} />
  return rail ? <Shell /> : <Pane />
}

/**
 * The builder. Mount it under a gui root (`<Hanzo>`), in a box with a height.
 *
 * `rail={false}` leaves the left column to the host, which lists the builder's
 * places and runs in its own rail with `DevSection`.
 */
export function Builder({ host, rail = true }: { host: Host; rail?: boolean }) {
  return (
    <HostProvider host={host}>
      <PrefsProvider>
        <YStack flex={1} minH={0} minW={0} height="100%" bg="$background">
          <Screens rail={rail} />
        </YStack>
      </PrefsProvider>
    </HostProvider>
  )
}
