/**
 * Projects and issues, read from the forge and opened in this window.
 *
 * A project is a repository, linked from GitHub or started from a template;
 * choosing one opens its workspace, where every run works on it. Issues are
 * the forge's and the task index's, merged (merge.ts): the same issue read
 * from two boards is one row. A repository's GitHub issues sync onto it.
 * Choosing an issue opens New on the issue's own repository — its GitHub
 * address, or the forge repository it is filed on, never a board's key — with
 * the issue as the ask; an issue no project answers to asks which one.
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
  FolderGit2,
  GitBranch,
  Github,
  GitPullRequest,
  LayoutTemplate,
  RefreshCw,
  Settings,
} from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, DropdownMenu, Input } from '@hanzo/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { ago } from './ago.ts'
import { codebases, type Codebase } from './api/codebases.ts'
import { Automations } from './automations.tsx'
import { boards, everything, sources, type Board, type Sources } from './api/work.ts'
import { boardKey, pinRepo, readPending, writePending } from './choice.ts'
import { useKept, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import type { Screen } from './route.ts'
import { path } from './route.ts'
import { Customize } from './customize/index.tsx'
import { Sync } from './sync.tsx'
import { connect, connection, grants, syncIssues, type Connection } from './api/github.ts'
import { here, useBack } from './back.ts'
import { Out } from './out.tsx'
import { ask, assemble, attach, closes, facets, handle, home, keyOf, matches, pickProjects, place, type Issue, type Project } from './merge.ts'

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
  if (screen === 'projects') return <Projects />
  return <Issues />
}

const PAGE = 25

/**
 * The organization's projects: its repositories on the forge, which arrive one
 * of two ways — linked from GitHub, or started from a template. A project is a
 * repository; opening one opens its workspace at `<org>/<repo>`, and every run
 * there works on that repository. There is no project without one.
 */
function Projects() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'updated'>('updated')
  const [page, setPage] = useState(0)
  const [landed, setLanded] = useState(0)
  useEffect(() => {
    setPage(0)
  }, [q, sort])
  const list = useRead(signed ? () => codebases(t) : null, [] as Codebase[], [t, signed, landed])
  const needle = q.trim().toLowerCase()
  const pending = readPending(host.org)
  const pendingKey = pending.map((p) => p.fullName).join('\n')
  const syncing = new Set(pending.map((p) => p.name))

  // A repository asked for from GitHub is listed as syncing until the forge holds it.
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
    .filter((c) => !needle || `${c.org}/${c.name} ${c.description}`.toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => {
      if (sort === 'updated') {
        const d = (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0)
        if (d !== 0) return d
      }
      return a.name.localeCompare(b.name)
    })
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const safePage = Math.min(page, pages - 1)
  const slice = shown.slice(safePage * PAGE, safePage * PAGE + PAGE)
  const from = shown.length === 0 ? 0 : safePage * PAGE + 1
  const to = safePage * PAGE + slice.length
  const none = !list.loading && !list.error && list.value.length === 0 && pending.length === 0

  const open = (c: Codebase) => host.go(path({ kind: 'repo', org: c.org || host.org || '', name: c.name }))
  const link = () => host.go(path({ kind: 'screen', screen: 'sync' }))
  const template = () => host.go(path({ kind: 'screen', screen: 'templates' }))

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4' }}>
      <YStack width="100%" maxW={1040} mx="auto" gap="$4">
        <XStack justify="space-between" items="flex-start" gap="$4" flexWrap="wrap">
          <YStack gap="$1" flex={1} minW={240}>
            <SizableText render="h1" size="$6" fontWeight="500" color="$ink">
              Projects
            </SizableText>
            <SizableText size="$2" color="$soft">
              {`${host.org ? `${host.org}’s` : 'This organization’s'} repositories on the forge. Open one to work on it.`}
            </SizableText>
          </YStack>
          <XStack gap="$2" items="center" flexWrap="wrap">
            <Button size="sm" variant="outline" onPress={template}>
              <LayoutTemplate size={14} />
              Create from template
            </Button>
            <Button size="sm" variant="primary" onPress={link}>
              <Github size={14} />
              Link a GitHub repo
            </Button>
          </XStack>
        </XStack>
        {signed ? <GitHubLink onSync={link} /> : null}
        {list.error ? (
          <Note>{list.error.message}</Note>
        ) : !signed ? (
          <Note>Sign in to see this organization's projects.</Note>
        ) : list.loading && list.value.length === 0 && pending.length === 0 ? (
          <Note>Reading the forge…</Note>
        ) : none ? (
          <YStack gap="$3" py="$2">
            <Note>No projects yet. A project is a repository: link one from GitHub, or start one from a template.</Note>
            <XStack gap="$3" flexWrap="wrap">
              <Choice
                label="Link a GitHub repo"
                icon={<Github size={20} />}
                says="Mirror repositories you already have. They stay in step with GitHub, and their issues can come too."
                onPress={link}
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
              <YStack flex={1} $max-md={{ display: 'none' }} />
              <YStack width={320} minW={0} shrink={1} $max-md={{ width: 'auto', flex: 1 }}>
                <Input value={q} onChangeText={setQ} placeholder="Find a project…" aria-label="Find a project" />
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
                  <SizableText size="$1" color="$soft" width={120} $max-md={{ display: 'none' }}>
                    Branch
                  </SizableText>
                  <XStack render="button" aria-label="Sort by last updated" items="center" justify="flex-end" gap="$1" width={120} onPress={() => setSort('updated')}>
                    <SizableText size="$1" color="$soft">
                      Updated
                    </SizableText>
                    {sort === 'updated' ? <ChevronDown size={12} /> : null}
                  </XStack>
                </XStack>
                {slice.map((c) => (
                  <XStack
                    key={`${c.org}/${c.name}`}
                    render="button"
                    aria-label={`Open ${c.org ? `${c.org}/` : ''}${c.name}`}
                    onPress={() => open(c)}
                    style={{ textAlign: 'left' }}
                    items="center"
                    gap="$3"
                    px="$3"
                    py="$2.5"
                    borderTopWidth={1}
                    borderColor="$borderColor"
                    hoverStyle={{ bg: '$hover' }}
                    focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
                  >
                    <FolderGit2 size={15} color="$soft" />
                    <YStack flex={1} minW={0}>
                      <XStack minW={0} items="baseline">
                        {c.org ? (
                          <SizableText size="$2" color="$soft" numberOfLines={1} shrink={0}>
                            {`${c.org}/`}
                          </SizableText>
                        ) : null}
                        <SizableText size="$2" color="$ink" fontWeight="500" numberOfLines={1} shrink={1}>
                          {c.name}
                        </SizableText>
                      </XStack>
                      {c.description ? (
                        <SizableText size="$1" color="$soft" numberOfLines={1}>
                          {c.description}
                        </SizableText>
                      ) : null}
                    </YStack>
                    <XStack width={120} items="center" gap="$1.5" minW={0} $max-md={{ display: 'none' }}>
                      <GitBranch size={12} color="$soft" />
                      <SizableText size="$1" color="$soft" numberOfLines={1}>
                        {c.branch}
                      </SizableText>
                    </XStack>
                    <SizableText size="$1" color="$soft" width={120} style={{ textAlign: 'right' }}>
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

type State = 'open' | 'closed'
type Kind = 'all' | 'issue' | 'pr'
type Origin = 'all' | 'github' | 'hanzo'
type Order = 'newest' | 'oldest' | 'updated'

const KINDS: Record<Kind, string> = { all: 'Issues and pull requests', issue: 'Issues', pr: 'Pull requests' }
const ORIGINS: Record<Origin, string> = { all: 'Every source', github: 'GitHub', hanzo: 'Hanzo' }
const ORDERS: Record<Order, string> = { newest: 'Newest', oldest: 'Oldest', updated: 'Recently updated' }

/** Mirrored from GitHub: the task index carried it from GitHub (`extRef` github:…). */
const fromGitHub = (i: Issue): boolean => i.sources.includes('github')

/** Done and canceled are closed; every other column is open work. */
const closed = (i: Issue): boolean => i.state === 'closed'

/** An RFC 3339 time as milliseconds, 0 when there is none. */
const ms = (iso: string): number => Date.parse(iso) || 0

/** The repository an issue is for, once the projects have named it, else the forge's name for it, else its board. */
const projectOf = (i: Issue): string => i.repo || i.forge || i.board

/**
 * Whether `i` is filed under the project `key`: its board, its forge
 * repository, or its repository by address or by name — either case. A board
 * and the repository it is named for are one project, as the forge files them.
 */
function inProject(i: Issue, key: string): boolean {
  const k = key.toLowerCase()
  return [i.board, i.forge, i.repo, i.repo.split('/')[1] ?? ''].some((v) => v !== '' && v.toLowerCase() === k)
}

/** How a person refers to an issue: `owner/name#N` on its own repository, the board's handle otherwise, '' with neither. */
function ref(i: Issue): string {
  const tag = handle(i)
  const at = i.repo || i.forge
  return tag.startsWith('#') && at ? `${at}${tag}` : tag
}

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
        key: k || '*',
        label: options[k],
        icon: k === value ? <Check size={14} /> : <YStack width={14} />,
        onSelect: () => onPick(k),
      }))}
    />
  )
}

/** The words a list carries as a menu: every one of them, or `all`. */
const menu = (all: string, values: string[]): Record<string, string> => Object.fromEntries([['', all], ...values.map((v) => [v, v])])

function Mark({ i }: { i: Issue }) {
  if (i.pull) return <GitPullRequest size={16} color={closed(i) ? '$soft' : '$ink'} />
  if (i.status === 'canceled') return <CircleSlash size={16} color="$soft" />
  if (closed(i)) return <CircleCheck size={16} color="$soft" />
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

const NONE: Sources = { hub: [], linked: [], held: [], sites: [], owners: [], next: '', unread: [], missing: [] }

/**
 * Pressing an issue: New, on the issue's own repository, holding the issue. A
 * GitHub issue runs on GitHub, where its pull request closes it; a forge issue
 * on the forge. A repository not among the projects read so far is looked up by
 * its address; an issue no project answers to asks which one it is for — a
 * board's key or a Linear team's is never taken for a repository.
 */
function useOpen(list: Project[], work: Issue[]) {
  const host = useHost()
  const t = useTarget()
  const [asking, setAsking] = useState<Issue | null>(null)
  const [finding, setFinding] = useState('')
  const go = (i: Issue, p: Project) => {
    // A project the person picked for an issue that is not its own closes nothing there.
    const own = place(i, [p]) !== null
    const n = own ? closes(i, p) : 0
    pinRepo(host.org, p, ask(i, n), n, own ? home(i, p) : undefined)
    setAsking(null)
    host.go('')
  }
  const open = async (i: Issue) => {
    const p = place(i, list)
    if (p && (p.forge || p.linked)) return go(i, p)
    if (i.repo) {
      setFinding(i.key)
      const [owner = '', name = ''] = i.repo.split('/')
      const found = await sources(t, { q: name, owner })
        .then((s) => assemble({ granted: s.hub, linked: s.linked, held: s.held, sites: s.sites, work }).find((x) => x.key === keyOf(owner, name)) ?? null)
        .catch(() => null)
      setFinding('')
      if (found && (found.forge || found.linked)) return go(i, found)
    }
    setAsking(i)
  }
  const dialog = <Which issue={asking} list={list} onPick={(p) => asking && go(asking, p)} onClose={() => setAsking(null)} />
  return { open: (i: Issue) => void open(i), finding, dialog }
}

/** Asks which project an issue is for, from the org's own list: never a free string. */
function Which({ issue, list, onPick, onClose }: { issue: Issue | null; list: Project[]; onPick: (p: Project) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const shown = pickProjects(
    list.filter((p) => p.forge || p.linked),
    { q },
  ).slice(0, 50)
  const named = issue?.repo || issue?.hint || ''
  return (
    <Dialog open={issue !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent maxW={480} gap="$3">
        <DialogTitle>Which project is this for?</DialogTitle>
        <SizableText size="$2" color="$soft">
          {named
            ? `“${named}” is not one of this organization’s projects. Choose the repository the run works on.`
            : `This issue names no repository${issue?.board ? `: it is on the ${issue.board} board` : ''}. Choose the one the run works on.`}
        </SizableText>
        <Input value={q} onChangeText={setQ} placeholder="Find a project…" aria-label="Find a project" />
        <YStack gap="$1" maxH={320} overflow="scroll">
          {shown.length === 0 ? (
            <Note>{list.length ? 'Nothing matches.' : 'No projects are linked yet.'}</Note>
          ) : (
            shown.map((p) => (
              <XStack key={p.key} render="button" aria-label={`Work on ${p.owner}/${p.name}`} onPress={() => onPick(p)} px="$2.5" py="$2" rounded="$3" items="center" justify="flex-start" hoverStyle={{ bg: '$hover' }}>
                <SizableText size="$2" color="$soft" numberOfLines={1} shrink={0}>
                  {`${p.owner}/`}
                </SizableText>
                <SizableText size="$2" color="$ink" numberOfLines={1} shrink={1}>
                  {p.name}
                </SizableText>
              </XStack>
            ))
          )}
        </YStack>
        <XStack justify="flex-end">
          <Button size="sm" variant="outline" onPress={onClose}>
            Cancel
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Every project's issues, read the way GitHub reads them: open or closed, one
 * project or all of them, narrowed by words, kind, source, label and assignee,
 * and ordered. The same issue on two boards is one row. Each project syncs its
 * own issues from GitHub; choosing an issue starts the next run on the issue's
 * own repository with the issue as the ask.
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
  const [label, setLabel] = useState('')
  const [assignee, setAssignee] = useState('')
  const [q, setQ] = useState('')
  const [pulled, setPulled] = useState(0)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; connect?: boolean } | null>(null)
  const list = useRead(signed ? () => everything(t) : null, [] as Issue[], [t, signed, pulled])
  const known = useRead(signed ? () => boards(t) : null, [] as Board[], [t, signed])
  // What the org's projects are made from, so an issue is placed on its own repository.
  const made = useRead(signed ? () => sources(t) : null, NONE, [t, signed])
  const projects = useMemo(
    () => assemble({ granted: made.value.hub, linked: made.value.linked, held: made.value.held, sites: made.value.sites, work: list.value }),
    [made.value, list.value],
  )
  const work = useMemo(() => attach(list.value, projects), [list.value, projects])
  const { open, finding, dialog } = useOpen(projects, list.value)

  // Another screen chose the board (the rail's Issues chooses every board) while this one is open.
  useEffect(() => {
    const on = (e: Event) => setBoard((e as CustomEvent<string>).detail)
    window.addEventListener('hanzo-board', on)
    return () => window.removeEventListener('hanzo-board', on)
  }, [setBoard])
  useEffect(() => setSaid(null), [board])

  // The projects: every board the forge names, and every repository an issue is filed under that no board is named for.
  const column = new Map<string, { key: string; name: string; open: number }>()
  for (const b of known.value) column.set(b.key.toLowerCase(), { key: b.key, name: b.name, open: 0 })
  for (const i of work) {
    const key = projectOf(i)
    if (key && ![...column.values()].some((p) => inProject(i, p.key))) column.set(key.toLowerCase(), { key, name: key, open: 0 })
  }
  for (const p of column.values()) p.open = work.filter((i) => !closed(i) && inProject(i, p.key)).length
  const rows = [...column.values()].sort((a, b) => a.name.localeCompare(b.name))
  const current = board ? column.get(board.toLowerCase()) : undefined
  const title = current?.name ?? board

  const inBoard = work.filter((i) => !board || inProject(i, board))
  const { labels, assignees } = facets(inBoard)
  const scoped = inBoard
    .filter((i) => kind === 'all' || (kind === 'pr') === i.pull)
    .filter((i) => origin === 'all' || (origin === 'github') === fromGitHub(i))
    .filter((i) => !label || i.labels.some((l) => l.toLowerCase() === label.toLowerCase()))
    .filter((i) => !assignee || i.assignees.some((a) => a.toLowerCase() === assignee.toLowerCase()))
    .filter((i) => matches(q, i.title, ref(i), projectOf(i), ...i.assignees, ...i.labels))
  const opened = scoped.filter((i) => !closed(i))
  const shut = scoped.filter(closed)
  const shown = (state === 'open' ? opened : shut).slice().sort((a, b) => {
    if (order === 'updated') return ms(b.updated || b.created) - ms(a.updated || a.created)
    if (order === 'oldest') return ms(a.created) - ms(b.created)
    return ms(b.created) - ms(a.created)
  })
  const narrowed = q.trim() !== '' || kind !== 'all' || origin !== 'all' || label !== '' || assignee !== ''

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
              {board ? `Work on ${title}. Choosing an issue starts the next run on its own repository.` : 'Work across every project. Choosing an issue starts the next run on its own repository.'}
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
            {chip('', 'All projects', work.filter((i) => !closed(i)).length)}
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
                    <Pick label="Label" value={label} options={menu('Any label', labels)} onPick={setLabel} />
                    <Pick label="Assignee" value={assignee} options={menu('Anyone', assignees)} onPick={setAssignee} />
                    <Pick label="Kind" value={kind} options={KINDS} onPick={setKind} />
                    <Pick label="Source" value={origin} options={ORIGINS} onPick={setOrigin} />
                    <Pick label="Sort" value={order} options={ORDERS} onPick={setOrder} />
                  </XStack>
                </XStack>
                {shown.length === 0 ? (
                  <YStack px="$3" py="$6" gap="$3" items="center" borderTopWidth={1} borderColor="$borderColor">
                    <Note>{state === 'open' ? (narrowed ? 'No open issues match.' : 'Nothing open.') : 'Nothing closed.'}</Note>
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
                  shown.map((i) => {
                    const named = ref(i)
                    return (
                      <XStack key={i.key || `${i.board}:${i.title}`} items="center" gap="$2" pr="$3" borderTopWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                        <XStack
                          render="button"
                          aria-label={`Build ${named || i.title}`}
                          onPress={() => open(i)}
                          disabled={finding === i.key && i.key !== ''}
                          flex={1}
                          minW={0}
                          items="flex-start"
                          gap="$3"
                          pl="$3"
                          py="$2.5"
                          focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
                        >
                          <YStack pt={2}>
                            <Mark i={i} />
                          </YStack>
                          <YStack flex={1} minW={0} gap="$1" items="flex-start">
                            <XStack gap="$2" items="center" flexWrap="wrap" maxW="100%">
                              <SizableText size="$3" color="$ink" fontWeight="500" numberOfLines={1} shrink={1}>
                                {i.title}
                              </SizableText>
                              {STATUS[i.status] && !closed(i) && i.status !== 'todo' ? <Tag>{STATUS[i.status]}</Tag> : null}
                              {!STATUS[i.status] ? <Tag>{i.status}</Tag> : null}
                              {i.priority !== 'none' && i.priority ? <Tag>{i.priority}</Tag> : null}
                              {i.labels.slice(0, 4).map((l) => (
                                <Tag key={l}>{l}</Tag>
                              ))}
                            </XStack>
                            <SizableText size="$1" color="$soft" numberOfLines={1}>
                              {[
                                named || (i.pull ? 'pr' : i.kind),
                                !board && projectOf(i) && !named.startsWith(projectOf(i)) ? projectOf(i) : '',
                                i.created ? `opened ${ago(i.created)}` : '',
                                i.assignees.length ? `assigned to ${i.assignees.join(', ')}` : '',
                                fromGitHub(i) ? 'GitHub' : '',
                                finding === i.key && i.key !== '' ? 'opening…' : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </SizableText>
                          </YStack>
                        </XStack>
                        {i.url ? (
                          <Out href={i.url} label={`Open ${named || i.title} on ${fromGitHub(i) ? 'GitHub' : 'the forge'}`}>
                            <ExternalLink size={14} opacity={0.6} />
                          </Out>
                        ) : null}
                      </XStack>
                    )
                  })
                )}
              </YStack>
            )}
          </YStack>
        </XStack>
      </YStack>
      {dialog}
    </YStack>
  )
}
