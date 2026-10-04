/**
 * Codebases, projects and issues, read from the forge and opened in this window.
 *
 * A codebase is a repository, synced from GitHub or started from a template.
 * Choosing one is choosing what the next run works on. A project is a board of
 * issues on one of those repositories, and its GitHub issues sync onto it.
 * Choosing an issue opens New with that codebase and the issue as the ask.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CircleDot,
  CircleSlash,
  ExternalLink,
  GitBranch,
  Github,
  GitPullRequest,
  LayoutTemplate,
  RefreshCw,
  Settings,
} from '@hanzogui/lucide-icons-2'
import { Button, DropdownMenu, Input } from '@hanzo/ui'
import { useEffect, useState, type ReactNode } from 'react'

import { ago } from './ago.ts'
import { codebases, type Codebase } from './api/codebases.ts'
import { Automations } from './automations.tsx'
import { environments, type Environment } from './api/environment.ts'
import { boards, closed, inProject, issues, projectOf, type Board, type Work } from './api/work.ts'
import { boardKey, pinBoard, pinCodebase, readPending, writePending } from './choice.ts'
import { useKept, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import type { Screen } from './route.ts'
import { path } from './route.ts'
import { Customize } from './customize/index.tsx'
import { Sync } from './sync.tsx'
import { connect, connection, grants, syncIssues, type Connection } from './api/github.ts'
import { here, useBack } from './back.ts'
import { Out } from './out.tsx'

function Head({ title, says }: { title: string; says: string }) {
  return (
    <YStack gap="$1" pb="$4">
      <SizableText render="h1" size="$6" color="$ink">
        {title}
      </SizableText>
      <SizableText size="$2" color="$soft">
        {says}
      </SizableText>
    </YStack>
  )
}

function Row({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <XStack
      render="button"
      onPress={onPress}
      aria-label={label}
      items="center"
      gap="$3"
      px="$3"
      py="$2.5"
      rounded="$3"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$panel"
      hoverStyle={{ borderColor: '$edge', bg: '$hover' }}
      focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
    >
      {children}
    </XStack>
  )
}

function Note({ children }: { children: string }) {
  return (
    <SizableText size="$2" color="$soft">
      {children}
    </SizableText>
  )
}

const STATUS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  canceled: 'Canceled',
}

export function Forge({ screen }: { screen: Exclude<Screen, 'artifacts' | 'templates'> }) {
  if (screen === 'automations') return <Automations />
  if (screen === 'sync') return <Sync />
  // The fleet's native servers are Connectors → Discover now; the old address lands there.
  if (screen === 'mcp') return <Customize tab="connectors" view="discover" />
  if (screen === 'codebases') return <Codebases />
  if (screen === 'projects') return <Projects />
  return <Issues />
}

const PAGE = 25

/**
 * The organization's code, which arrives one of two ways: mirrored from GitHub,
 * or started from a template. There is no blank repository here — a codebase
 * with nothing in it gives a run nothing to work on.
 */
function Codebases() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'updated'>('name')
  const [filter, setFilter] = useState<'all' | 'ready' | 'syncing'>('all')
  const [page, setPage] = useState(0)
  const [landed, setLanded] = useState(0)
  useEffect(() => {
    setPage(0)
  }, [q, sort, filter])
  const list = useRead(signed ? () => codebases(t) : null, [] as Codebase[], [t, signed, landed])
  // Which codebases have an environment. A codebase absent here has none.
  const envs = useRead(signed ? () => environments(t) : null, [] as Environment[], [t, signed])
  const envOf = new Map(envs.value.map((e) => [e.repo, e.state]))
  const needle = q.trim().toLowerCase()
  const pending = readPending(host.org)
  const pendingKey = pending.map((p) => p.fullName).join('\n')
  const syncing = new Set(pending.map((p) => p.name))

  useEffect(() => {
    const waiting = readPending(host.org)
    if (!signed || waiting.length === 0) return
    let stop = false
    grants(t)
      .then((g) => {
        if (stop) return
        const done = new Set(g.repos.filter((r) => r.imported).map((r) => r.fullName))
        const left = waiting.filter((p) => !done.has(p.fullName))
        if (left.length !== waiting.length) {
          writePending(host.org, left)
          setLanded((n) => n + 1)
        }
      })
      .catch(() => {})
    return () => {
      stop = true
    }
  }, [signed, t, host.org, pendingKey])

  const shown = [
    ...list.value,
    ...pending
      .filter((p) => !list.value.some((c) => c.name === p.name))
      .map(
        (p): Codebase => ({
          org: host.org ?? '',
          name: p.name,
          description: '',
          branch: 'main',
          public: false,
          clone: '',
          updated: '',
          branches: ['main'],
        }),
      ),
  ]
    .filter((c) => {
      if (filter === 'ready') return envOf.get(c.name) === 'ready'
      if (filter === 'syncing') return syncing.has(c.name)
      return true
    })
    .filter((c) => !needle || `${c.org}/${c.name} ${c.description}`.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => {
      if (sort === 'updated') {
        const d = Date.parse(b.updated) - Date.parse(a.updated)
        if (Number.isFinite(d) && d !== 0) return d
      }
      return a.name.localeCompare(b.name)
    })
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const safePage = Math.min(page, pages - 1)
  const slice = shown.slice(safePage * PAGE, safePage * PAGE + PAGE)
  const from = shown.length === 0 ? 0 : safePage * PAGE + 1
  const to = safePage * PAGE + slice.length
  const none = !list.loading && !list.error && list.value.length === 0 && pending.length === 0

  const open = (c: Codebase) => {
    pinCodebase(host.org, c)
    host.go('')
  }
  const sync = () => host.go(path({ kind: 'screen', screen: 'sync' }))
  const template = () => host.go(path({ kind: 'screen', screen: 'templates' }))

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4' }}>
      <YStack width="100%" maxW={1040} mx="auto" gap="$4">
        <XStack justify="space-between" items="flex-start" gap="$4" flexWrap="wrap">
          <YStack gap="$1" flex={1} minW={240}>
            <SizableText render="h1" size="$6" fontWeight="500" color="$ink">
              {host.org || 'Forge'}
            </SizableText>
            <SizableText size="$2" color="$soft">
              Sync this organization’s repositories from GitHub, or start one from a template.
            </SizableText>
          </YStack>
          <XStack gap="$2" items="center" flexWrap="wrap">
            <XStack
              render="button"
              aria-label="Settings"
              shrink={0}
              items="center"
              gap="$1.5"
              px="$2"
              py="$1"
              rounded="$3"
              hoverStyle={{ bg: '$hover' }}
              onPress={() => host.go('-/settings/environments')}
            >
              <Settings size={14} />
              <SizableText size="$2" color="$soft">
                Settings
              </SizableText>
            </XStack>
            <Button size="sm" variant="outline" onPress={template}>
              <LayoutTemplate size={14} />
              Create from template
            </Button>
            <Button size="sm" variant="primary" onPress={sync}>
              <Github size={14} />
              Sync from GitHub
            </Button>
          </XStack>
        </XStack>
        {signed ? <GitHubLink onSync={sync} /> : null}
        {list.error ? (
          <Note>{list.error.message}</Note>
        ) : !signed ? (
          <Note>Sign in to see this organization's repositories.</Note>
        ) : list.loading && list.value.length === 0 && pending.length === 0 ? (
          <Note>Reading the forge…</Note>
        ) : none ? (
          <YStack gap="$3" py="$2">
            <Note>No repositories yet.</Note>
            <XStack gap="$3" flexWrap="wrap">
              <Choice
                label="Sync from GitHub"
                icon={<Github size={20} />}
                says="Mirror repositories you already have. They stay in step with GitHub, and their issues can come too."
                onPress={sync}
              />
              <Choice
                label="Create from template"
                icon={<LayoutTemplate size={20} />}
                says="Start from a finished product — a site, an app, a store — and make it yours."
                onPress={template}
              />
            </XStack>
          </YStack>
        ) : (
          <>
            <XStack gap="$2" items="center">
              <XStack
                render="button"
                aria-label="Filter repositories"
                onPress={() => setFilter((f) => (f === 'all' ? 'ready' : f === 'ready' ? 'syncing' : 'all'))}
                px="$2.5"
                py="$1.5"
                rounded="$3"
                borderWidth={1}
                borderColor="$borderColor"
                shrink={0}
                hoverStyle={{ bg: '$hover' }}
                $max-md={{ display: 'none' }}
              >
                <SizableText size="$2" color="$ink">
                  {filter === 'ready' ? 'Ready env' : filter === 'syncing' ? 'Syncing' : 'All repos'}
                </SizableText>
              </XStack>
              <YStack flex={1} $max-md={{ display: 'none' }} />
              <YStack width={280} minW={0} shrink={1} $max-md={{ width: 'auto', flex: 1 }}>
                <Input value={q} onChangeText={setQ} placeholder="Find repo…" aria-label="Find a repository" />
              </YStack>
            </XStack>
            {shown.length === 0 ? (
              <Note>Nothing matches.</Note>
            ) : (
              <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
                <XStack px="$3" py="$2" gap="$3" items="center" bg="$panel">
                  <XStack flex={1} render="button" aria-label="Sort by name" items="center" gap="$1" onPress={() => setSort('name')}>
                    <SizableText size="$1" color="$soft">
                      Name
                    </SizableText>
                    {sort === 'name' ? <ChevronDown size={12} /> : null}
                  </XStack>
                  <SizableText size="$1" color="$soft" width={96} $max-md={{ display: 'none' }}>
                    Environment
                  </SizableText>
                  <XStack
                    render="button"
                    aria-label="Sort by last updated"
                    items="center"
                    justify="flex-end"
                    gap="$1"
                    width={140}
                    onPress={() => setSort('updated')}
                  >
                    <SizableText size="$1" color="$soft">
                      Last updated
                    </SizableText>
                    {sort === 'updated' ? <ChevronDown size={12} /> : null}
                  </XStack>
                </XStack>
                {slice.map((c) => (
                  <XStack
                    key={`${c.org}/${c.name}`}
                    render="button"
                    aria-label={`Work on ${c.name}`}
                    onPress={() => open(c)}
                    items="center"
                    gap="$3"
                    px="$3"
                    py="$2.5"
                    borderTopWidth={1}
                    borderColor="$borderColor"
                    hoverStyle={{ bg: '$hover' }}
                    focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
                  >
                    <GitBranch size={14} />
                    <YStack flex={1} minW={0}>
                      <SizableText size="$2" color="$ink" numberOfLines={1}>
                        {c.name}
                      </SizableText>
                      {c.description ? (
                        <SizableText size="$1" color="$soft" numberOfLines={1}>
                          {c.description}
                        </SizableText>
                      ) : null}
                    </YStack>
                    <SizableText size="$1" color="$soft" width={96} $max-md={{ display: 'none' }}>
                      {envOf.get(c.name) === 'ready' ? 'Ready' : envOf.get(c.name) === 'proposed' ? 'To review' : '—'}
                    </SizableText>
                    <SizableText size="$1" color="$soft" width={140} style={{ textAlign: 'right' }}>
                      {syncing.has(c.name) ? 'Syncing…' : ago(c.updated)}
                    </SizableText>
                  </XStack>
                ))}
                <XStack px="$3" py="$2" justify="space-between" items="center" borderTopWidth={1} borderColor="$borderColor">
                  <SizableText size="$1" color="$soft">
                    {`Showing ${from}–${to} of ${shown.length}`}
                  </SizableText>
                  <XStack gap="$3" items="center">
                    <XStack render="button" aria-label="Previous page" disabled={safePage === 0} onPress={() => setPage(safePage - 1)}>
                      <SizableText size="$1" color={safePage === 0 ? '$soft' : '$ink'}>
                        Prev
                      </SizableText>
                    </XStack>
                    <SizableText size="$1" color="$soft">
                      {`${safePage + 1} / ${pages}`}
                    </SizableText>
                    <XStack render="button" aria-label="Next page" disabled={safePage >= pages - 1} onPress={() => setPage(safePage + 1)}>
                      <SizableText size="$1" color={safePage >= pages - 1 ? '$soft' : '$ink'}>
                        Next
                      </SizableText>
                    </XStack>
                  </XStack>
                </XStack>
              </YStack>
            )}
          </>
        )}
      </YStack>
    </YStack>
  )
}

/** One of the two ways in, as a card you press. */
function Choice({ label, icon, says, onPress }: { label: string; icon: ReactNode; says: string; onPress: () => void }) {
  return (
    <YStack
      render="button"
      aria-label={label}
      onPress={onPress}
      flex={1}
      minW={240}
      gap="$2"
      p="$4"
      rounded="$4"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$panel"
      items="flex-start"
      hoverStyle={{ borderColor: '$edge', bg: '$hover' }}
      focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
    >
      {icon}
      <XStack items="center" gap="$1.5">
        <SizableText size="$4" color="$ink" fontWeight="500">
          {label}
        </SizableText>
        <ArrowRight size={14} />
      </XStack>
      <SizableText size="$2" color="$soft" style={{ textAlign: 'left' }}>
        {says}
      </SizableText>
    </YStack>
  )
}

/**
 * The person's GitHub connection, in one line: who it is connected as and the
 * way to sync, or the one press that connects it. GitHub returns here, and this
 * page finishes the connect (../back.ts).
 */
function GitHubLink({ onSync }: { onSync: () => void }) {
  const host = useHost()
  const t = useTarget()
  const me = useRead(() => connection(t), null as Connection | null, [t])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useBack(t, true, setNote, me.reload)
  const c = me.value
  // A connection that cannot be read says nothing here: Sync from GitHub above still works.
  if (me.error || !c || !c.configured) return note ? <Note>{note}</Note> : null

  const link = async () => {
    setBusy(true)
    setNote('')
    try {
      host.open(await connect(t, here()))
    } catch (e) {
      setNote((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <XStack
      items="center"
      gap="$3"
      px="$3"
      py="$2.5"
      rounded="$3"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$panel"
      flexWrap="wrap"
    >
      <Github size={16} />
      <YStack flex={1} minW={200}>
        <SizableText size="$2" color="$ink">
          {c.connected ? `GitHub connected as @${c.login}` : 'Connect GitHub to bring your repositories here'}
        </SizableText>
        <SizableText size="$1" color="$soft">
          {note || (c.connected ? 'Choose repositories to mirror; each stays in step with GitHub.' : 'One step on GitHub, then pick the repositories to sync.')}
        </SizableText>
      </YStack>
      {c.connected ? (
        <Button size="sm" variant="outline" onPress={onSync}>
          <RefreshCw size={14} />
          Sync repositories
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={busy} onPress={() => void link()}>
          <Github size={14} />
          {busy ? 'Opening GitHub…' : 'Connect GitHub'}
        </Button>
      )}
    </XStack>
  )
}

function Projects() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => boards(t) : null, [] as Board[], [t, signed])

  const open = (b: Board) => {
    pinBoard(host.org, b.key)
    host.go(path({ kind: 'screen', screen: 'issues' }))
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" items="center">
      <YStack width="100%" maxW={720} gap="$3">
        <Head title="Projects" says="Boards on the forge. A board is a repository that has work on it." />
        {list.error ? (
          <Note>{list.error.message}</Note>
        ) : !signed ? (
          <Note>Sign in to see this organization's boards.</Note>
        ) : list.loading && list.value.length === 0 ? (
          <Note>Reading the forge…</Note>
        ) : list.value.length === 0 ? (
          <YStack gap="$3" py="$2">
            <Note>No boards yet. A repository shows up here once it has an issue.</Note>
            <XStack gap="$2" pt="$1">
              <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: 'codebases' }))}>
                View repositories
              </Button>
              <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: 'sync' }))}>
                Sync from GitHub
              </Button>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$2">
            {list.value.map((b) => (
              <Row key={b.key} label={`Open ${b.name}`} onPress={() => open(b)}>
                <YStack flex={1} minW={0} gap="$1">
                  <SizableText size="$3" color="$ink" numberOfLines={1}>
                    {b.name}
                  </SizableText>
                  {b.description ? (
                    <SizableText size="$1" color="$soft" numberOfLines={1}>
                      {b.description}
                    </SizableText>
                  ) : (
                    <SizableText size="$1" color="$soft">
                      {b.key}
                    </SizableText>
                  )}
                </YStack>
              </Row>
            ))}
          </YStack>
        )}
      </YStack>
    </YStack>
  )
}

type State = 'open' | 'closed'
type Kind = 'all' | 'issue' | 'pr'
type Origin = 'all' | 'github' | 'hanzo'
type Order = 'newest' | 'oldest' | 'updated'

const KINDS: Record<Kind, string> = { all: 'Issues and pull requests', issue: 'Issues', pr: 'Pull requests' }
const ORIGINS: Record<Origin, string> = { all: 'Every source', github: 'GitHub', hanzo: 'Hanzo' }
const ORDERS: Record<Order, string> = { newest: 'Newest', oldest: 'Oldest', updated: 'Recently updated' }

/** Mirrored from GitHub: filed by the forge's `git` source with its page on github.com. */
const fromGitHub = (w: Work): boolean => /^https:\/\/github\.com\//.test(w.url)

/** A dropdown that picks one of `options`, its trigger naming the choice. */
function Pick<K extends string>({ label, value, options, onPick }: { label: string; value: K; options: Record<K, string>; onPick: (k: K) => void }) {
  return (
    <DropdownMenu
      trigger={
        <XStack render="button" aria-label={label} items="center" gap="$1" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <SizableText size="$2" color="$soft" numberOfLines={1}>
            {options[value]}
          </SizableText>
          <ChevronDown size={12} />
        </XStack>
      }
      items={(Object.keys(options) as K[]).map((k) => ({
        key: k,
        label: options[k],
        icon: k === value ? <Check size={14} /> : <YStack width={14} />,
        onSelect: () => onPick(k),
      }))}
    />
  )
}

function Mark({ w }: { w: Work }) {
  if (w.kind === 'pr') return <GitPullRequest size={16} color={closed(w) ? '$soft' : '$ink'} />
  if (w.status === 'canceled') return <CircleSlash size={16} color="$soft" />
  if (w.status === 'done') return <CircleCheck size={16} color="$soft" />
  return <CircleDot size={16} color="$ink" />
}

function Tag({ children }: { children: string }) {
  return (
    <XStack px="$2" py={1} rounded={999} borderWidth={1} borderColor="$borderColor" shrink={0}>
      <SizableText size="$1" color="$soft" numberOfLines={1}>
        {children}
      </SizableText>
    </XStack>
  )
}

/**
 * Every project's issues, read the way GitHub reads them: open or closed, one
 * project or all of them, narrowed by words, kind, source and order. Each project
 * syncs its own issues from GitHub; choosing an issue starts the next run on its
 * codebase with the issue as the ask.
 */
function Issues() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [board, setBoard] = useKept<string>(boardKey(host.org), '')
  const [state, setState] = useState<State>('open')
  const [kind, setKind] = useState<Kind>('all')
  const [origin, setOrigin] = useState<Origin>('all')
  const [order, setOrder] = useState<Order>('newest')
  const [q, setQ] = useState('')
  const [pulled, setPulled] = useState(0)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; connect?: boolean } | null>(null)
  const list = useRead(signed ? () => issues(t) : null, [] as Work[], [t, signed, pulled])
  const known = useRead(signed ? () => boards(t) : null, [] as Board[], [t, signed])

  // Another screen chose the board (the rail's Issues chooses every board) while this one is open.
  useEffect(() => {
    const on = (e: Event) => setBoard((e as CustomEvent<string>).detail)
    window.addEventListener('hanzo-board', on)
    return () => window.removeEventListener('hanzo-board', on)
  }, [setBoard])
  useEffect(() => setSaid(null), [board])

  // The projects: every board the forge names, and every repository an issue is filed under.
  const projects = new Map<string, { key: string; name: string; open: number }>()
  for (const b of known.value) projects.set(b.key.toLowerCase(), { key: b.key, name: b.name, open: 0 })
  for (const w of list.value) {
    const key = projectOf(w)
    if (!key) continue
    const p = projects.get(key.toLowerCase()) ?? { key, name: key, open: 0 }
    if (!closed(w)) p.open++
    projects.set(key.toLowerCase(), p)
  }
  const rows = [...projects.values()].sort((a, b) => a.name.localeCompare(b.name))
  const current = board ? projects.get(board.toLowerCase()) : undefined
  const title = current?.name ?? board

  const needle = q.trim().toLowerCase()
  const scoped = list.value
    .filter((w) => !board || inProject(w, board))
    .filter((w) => kind === 'all' || (kind === 'pr' ? w.kind === 'pr' : w.kind !== 'pr'))
    .filter((w) => origin === 'all' || (origin === 'github') === fromGitHub(w))
    .filter((w) => !needle || [w.title, w.identifier, w.assignee, projectOf(w), ...w.labels].join(' ').toLowerCase().includes(needle))
  const opened = scoped.filter((w) => !closed(w))
  const shut = scoped.filter(closed)
  const shown = (state === 'open' ? opened : shut).slice().sort((a, b) => {
    if (order === 'updated') return (b.updated || b.created) - (a.updated || a.created)
    if (order === 'oldest') return a.created - b.created
    return b.created - a.created
  })

  const pull = async () => {
    setBusy(true)
    setSaid(null)
    try {
      const s = await syncIssues(t, board)
      const where = board ? title : `${s.repos} ${s.repos === 1 ? 'repository' : 'repositories'}`
      const parts = [`${s.issues} ${s.issues === 1 ? 'issue' : 'issues'} synced from ${where}`, `${s.created} new`, `${s.updated} updated`]
      if (s.failed) parts.push(`${s.failed} failed`)
      setSaid({ text: `${parts.join(' · ')}.${s.truncated ? ' More remain — sync again to continue.' : ''}` })
      setPulled((n) => n + 1)
    } catch (e) {
      const text = (e as Error).message
      setSaid({ text, connect: /not connected/i.test(text) })
    } finally {
      setBusy(false)
    }
  }

  const link = async () => {
    try {
      host.open(await connect(t, here()))
    } catch (e) {
      setSaid({ text: (e as Error).message })
    }
  }

  const open = (w: Work) => {
    const name = w.repo || w.project
    if (name) {
      pinCodebase(host.org, {
        org: host.org ?? '',
        name,
        description: '',
        branch: 'main',
        public: false,
        clone: '',
        updated: '',
        branches: ['main'],
      }, `${w.identifier ? `${w.identifier} ` : ''}${w.title}`.trim())
    }
    host.go('')
  }

  const chip = (key: string, name: string, count: number | null) => {
    const on = key.toLowerCase() === board.toLowerCase()
    return (
      <XStack
        key={key || '*'}
        render="button"
        aria-label={key ? `Show ${name}` : 'Show every project'}
        aria-pressed={on}
        onPress={() => setBoard(key)}
        items="center"
        gap="$2"
        px="$2.5"
        py="$1.5"
        rounded="$3"
        bg={on ? '$hover' : 'transparent'}
        hoverStyle={{ bg: '$hover' }}
        shrink={0}
      >
        <SizableText flex={1} size="$2" color={on ? '$ink' : '$soft'} numberOfLines={1} style={{ textAlign: 'left' }}>
          {name}
        </SizableText>
        {count ? (
          <SizableText size="$1" color="$soft">
            {count}
          </SizableText>
        ) : null}
      </XStack>
    )
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4' }}>
      <YStack width="100%" maxW={1120} mx="auto" gap="$4">
        <XStack justify="space-between" items="flex-start" gap="$4" flexWrap="wrap">
          <YStack gap="$1" flex={1} minW={240}>
            <SizableText render="h1" size="$6" fontWeight="500" color="$ink">
              {board ? `Issues · ${title}` : 'Issues'}
            </SizableText>
            <SizableText size="$2" color="$soft">
              {board ? `Work on ${title}. Choosing an issue starts the next run on that codebase.` : 'Work across every project. Choosing an issue starts the next run on that codebase.'}
            </SizableText>
          </YStack>
          <Button size="sm" variant="outline" disabled={!signed || busy} onPress={() => void pull()}>
            <Github size={14} />
            {busy ? 'Syncing…' : board ? `Sync ${title} from GitHub` : 'Sync all from GitHub'}
          </Button>
        </XStack>
        {said ? (
          <XStack items="center" gap="$3" flexWrap="wrap">
            <Note>{said.text}</Note>
            {said.connect ? (
              <Button size="sm" variant="primary" onPress={() => void link()}>
                <Github size={14} />
                Connect GitHub
              </Button>
            ) : null}
          </XStack>
        ) : null}
        <XStack gap="$5" items="flex-start" $max-md={{ flexDirection: 'column', gap: '$3' }}>
          <YStack
            render="nav"
            aria-label="Projects"
            width={220}
            shrink={0}
            gap="$0.5"
            $max-md={{ width: '100%', flexDirection: 'row', overflow: 'scroll', gap: '$1' }}
          >
            <SizableText size="$1" color="$soft" px="$2.5" pb="$1" $max-md={{ display: 'none' }}>
              Projects
            </SizableText>
            {chip('', 'All projects', list.value.filter((w) => !closed(w)).length)}
            {rows.map((p) => chip(p.key, p.name, p.open))}
          </YStack>
          <YStack flex={1} minW={0} gap="$3" width="100%">
            <Input value={q} onChangeText={setQ} placeholder="Search issues" aria-label="Search issues" disabled={!signed} />
            {list.error ? (
              <Note>{list.error.message}</Note>
            ) : !signed ? (
              <Note>Sign in to see this organization's issues.</Note>
            ) : list.loading && list.value.length === 0 ? (
              <Note>Reading the forge…</Note>
            ) : (
              <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
                <XStack px="$3" py="$2" gap="$3" items="center" bg="$panel" flexWrap="wrap">
                  <XStack gap="$3" items="center" flex={1} minW={0}>
                    <XStack render="button" aria-label="Open issues" aria-pressed={state === 'open'} items="center" gap="$1.5" onPress={() => setState('open')}>
                      <CircleDot size={14} color={state === 'open' ? '$ink' : '$soft'} />
                      <SizableText size="$2" color={state === 'open' ? '$ink' : '$soft'} fontWeight={state === 'open' ? '500' : '400'}>
                        {`${opened.length} Open`}
                      </SizableText>
                    </XStack>
                    <XStack render="button" aria-label="Closed issues" aria-pressed={state === 'closed'} items="center" gap="$1.5" onPress={() => setState('closed')}>
                      <Check size={14} color={state === 'closed' ? '$ink' : '$soft'} />
                      <SizableText size="$2" color={state === 'closed' ? '$ink' : '$soft'} fontWeight={state === 'closed' ? '500' : '400'}>
                        {`${shut.length} Closed`}
                      </SizableText>
                    </XStack>
                  </XStack>
                  <XStack gap="$1" items="center" flexWrap="wrap" shrink={1} minW={0}>
                    <Pick label="Kind" value={kind} options={KINDS} onPick={setKind} />
                    <Pick label="Source" value={origin} options={ORIGINS} onPick={setOrigin} />
                    <Pick label="Sort" value={order} options={ORDERS} onPick={setOrder} />
                  </XStack>
                </XStack>
                {shown.length === 0 ? (
                  <YStack px="$3" py="$6" gap="$3" items="center" borderTopWidth={1} borderColor="$borderColor">
                    <Note>
                      {state === 'open'
                        ? needle || kind !== 'all' || origin !== 'all'
                          ? 'No open issues match.'
                          : 'Nothing open.'
                        : 'Nothing closed.'}
                    </Note>
                    {list.value.length === 0 ? (
                      <XStack gap="$2" flexWrap="wrap" justify="center">
                        <Button size="sm" variant="outline" disabled={busy} onPress={() => void pull()}>
                          <Github size={14} />
                          Sync from GitHub
                        </Button>
                        <Button size="sm" onPress={() => host.go('')}>
                          Start a new run
                        </Button>
                      </XStack>
                    ) : null}
                  </YStack>
                ) : (
                  shown.map((w) => (
                    <XStack key={w.id} items="center" gap="$2" pr="$3" borderTopWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                      <XStack
                        render="button"
                        aria-label={`Build ${w.identifier || w.title}`}
                        onPress={() => open(w)}
                        flex={1}
                        minW={0}
                        items="flex-start"
                        gap="$3"
                        pl="$3"
                        py="$2.5"
                        focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
                      >
                        <YStack pt={2}>
                          <Mark w={w} />
                        </YStack>
                        <YStack flex={1} minW={0} gap="$1" items="flex-start">
                          <XStack gap="$2" items="center" flexWrap="wrap" maxW="100%">
                            <SizableText size="$3" color="$ink" fontWeight="500" numberOfLines={1} shrink={1}>
                              {w.title}
                            </SizableText>
                            {STATUS[w.status] && !closed(w) && w.status !== 'todo' ? <Tag>{STATUS[w.status]}</Tag> : null}
                            {!STATUS[w.status] ? <Tag>{w.status}</Tag> : null}
                            {w.priority !== 'none' && w.priority ? <Tag>{w.priority}</Tag> : null}
                            {w.labels.slice(0, 4).map((l) => (
                              <Tag key={l}>{l}</Tag>
                            ))}
                          </XStack>
                          <SizableText size="$1" color="$soft" numberOfLines={1}>
                            {[
                              w.identifier || w.kind,
                              !board && projectOf(w) ? projectOf(w) : '',
                              w.created ? `opened ${ago(new Date(w.created).toISOString())}` : '',
                              w.assignee ? `assigned to ${w.assignee}` : '',
                              fromGitHub(w) ? 'GitHub' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </SizableText>
                        </YStack>
                      </XStack>
                      {w.url ? (
                        <Out href={w.url} label={`Open ${w.identifier || w.title} on ${fromGitHub(w) ? 'GitHub' : 'the forge'}`}>
                          <ExternalLink size={14} opacity={0.6} />
                        </Out>
                      ) : null}
                    </XStack>
                  ))
                )}
              </YStack>
            )}
          </YStack>
        </XStack>
      </YStack>
    </YStack>
  )
}
