/**
 * Codebases, projects and issues, read from the forge and opened in this window.
 *
 * A codebase is a repository. Choosing one is choosing what the next run works
 * on. A project is a board of issues on one of those repositories. Choosing an
 * issue opens New with that codebase and the issue as the ask.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronDown, GitBranch, Plus, Settings, Workflow } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@hanzo/ui'
import { useEffect, useState, type ReactNode } from 'react'

import { revealAccount } from './account.tsx'
import { add, arm, flows, type Automation } from './api/auto.ts'
import { codebases, create, type Codebase } from './api/codebases.ts'
import { boards, issues, type Board, type Work } from './api/work.ts'
import { boardKey, pinBoard, pinCodebase, readPending, writePending } from './choice.ts'
import { useKept, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import type { Screen } from './route.ts'
import { path } from './route.ts'
import { Servers } from './mcp.tsx'
import { Sync } from './sync.tsx'
import { grants } from './api/github.ts'

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
  if (screen === 'mcp') return <Servers />
  if (screen === 'codebases') return <Codebases />
  if (screen === 'projects') return <Projects />
  return <Issues />
}

function Automations() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [q, setQ] = useState('')
  const [making, setMaking] = useState(false)
  const [tick, setTick] = useState(0)
  const [problem, setProblem] = useState('')
  const list = useRead(signed ? () => flows(t) : null, [] as Automation[], [t, signed, tick])
  const needle = q.trim().toLowerCase()
  const shown = list.value.filter((a) => !needle || a.name.toLowerCase().includes(needle))

  const flip = async (a: Automation) => {
    setProblem('')
    try {
      await arm(t, a.id, a.status !== 'ENABLED')
      setTick((n) => n + 1)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not change that automation')
    }
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6">
      <YStack width="100%" maxW={1040} mx="auto" gap="$4">
        <XStack justify="space-between" items="flex-start" gap="$4">
          <YStack gap="$1">
            <SizableText size="$6" fontWeight="500" color="$ink">
              Automations
            </SizableText>
            <SizableText size="$2" color="$soft">
              Repeating work for this organization. A new one starts off, so you can name it before it runs.
            </SizableText>
          </YStack>
          <Button size="sm" disabled={!signed} onPress={() => setMaking(true)}>
            <Plus size={14} />
            New automation
          </Button>
        </XStack>
        <XStack justify="flex-end">
          <YStack width={240}>
            <Input value={q} onChangeText={setQ} placeholder="Search…" aria-label="Search automations" disabled={!signed} />
          </YStack>
        </XStack>
        {problem ? <Note>{problem}</Note> : null}
        {list.error ? (
          <Note>{list.error.message}</Note>
        ) : !signed ? (
          <Empty says="Sign in to see this organization's automations." />
        ) : list.loading && list.value.length === 0 ? (
          <Empty says="Reading automations…" />
        ) : shown.length === 0 ? (
          <Empty says={list.value.length === 0 ? 'No automations yet.' : 'Nothing matches.'}>
            {list.value.length === 0 ? (
              <Button size="sm" onPress={() => setMaking(true)}>
                New automation
              </Button>
            ) : null}
          </Empty>
        ) : (
          <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
            <XStack px="$3" py="$2" gap="$3">
              <SizableText flex={1} size="$1" color="$soft">
                Name
              </SizableText>
              <SizableText size="$1" color="$soft" width={80} style={{ textAlign: 'right' }}>
                Status
              </SizableText>
              <SizableText size="$1" color="$soft" width={120} style={{ textAlign: 'right' }}>
                Updated
              </SizableText>
            </XStack>
            {shown.map((a) => (
              <XStack key={a.id} items="center" gap="$3" px="$3" py="$2.5" borderTopWidth={1} borderColor="$borderColor">
                <Workflow size={14} />
                <SizableText flex={1} size="$2" color="$ink" numberOfLines={1}>
                  {a.name}
                </SizableText>
                <XStack
                  render="button"
                  aria-label={a.status === 'ENABLED' ? `Turn off ${a.name}` : `Turn on ${a.name}`}
                  onPress={() => void flip(a)}
                  width={80}
                  justify="flex-end"
                >
                  <SizableText size="$1" color="$ink">
                    {a.status === 'ENABLED' ? 'On' : 'Off'}
                  </SizableText>
                </XStack>
                <SizableText size="$1" color="$soft" width={120} style={{ textAlign: 'right' }}>
                  {a.updated ? when(new Date(a.updated).toISOString()) : '—'}
                </SizableText>
              </XStack>
            ))}
          </YStack>
        )}
      </YStack>
      <NewAutomation
        open={making}
        onOpenChange={setMaking}
        onCreate={async (name) => {
          await add(t, name)
          setMaking(false)
          setTick((n) => n + 1)
        }}
      />
    </YStack>
  )
}

function Empty({ says, children }: { says: string; children?: ReactNode }) {
  return (
    <YStack borderWidth={1} borderColor="$borderColor" rounded="$4" px="$4" py="$8" gap="$3" items="center">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {says}
      </SizableText>
      {children}
    </YStack>
  )
}

function NewAutomation({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onCreate(name)
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that automation')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New automation</DialogTitle>
        <YStack gap="$3" pt="$3">
          <Input value={name} onChangeText={setName} placeholder="Name" aria-label="Automation name" />
          {error ? <Note>{error}</Note> : null}
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="outline" disabled={busy} onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !name.trim()} onPress={() => void submit()}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
  )
}

const PAGE = 25

function Codebases() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [q, setQ] = useState('')
  const [making, setMaking] = useState(false)
  const [sort, setSort] = useState<'name' | 'updated'>('name')
  const [page, setPage] = useState(0)
  const [landed, setLanded] = useState(0)
  useEffect(() => {
    setPage(0)
  }, [q, sort])
  const list = useRead(signed ? () => codebases(t) : null, [] as Codebase[], [t, signed, making, landed])
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

  const open = (c: Codebase) => {
    pinCodebase(host.org, c)
    host.go('')
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6">
      <YStack width="100%" maxW={1040} mx="auto" gap="$4">
        <XStack justify="space-between" items="flex-start" gap="$4">
          <YStack gap="$1">
            <SizableText size="$6" fontWeight="500" color="$ink">
              {host.org || 'Forge'}
            </SizableText>
            <SizableText size="$2" color="$soft">
              Create and browse this organization’s repositories.
            </SizableText>
          </YStack>
          <XStack
            render="button"
            aria-label="Settings"
            items="center"
            gap="$1.5"
            px="$2"
            py="$1"
            rounded="$3"
            hoverStyle={{ bg: '$hover' }}
            onPress={() => revealAccount()}
          >
            <Settings size={14} />
            <SizableText size="$2" color="$soft">
              Settings
            </SizableText>
          </XStack>
        </XStack>
        <XStack gap="$2" items="center">
          <XStack px="$2.5" py="$1.5" rounded="$3" borderWidth={1} borderColor="$borderColor">
            <SizableText size="$2" color="$ink">
              All repos
            </SizableText>
          </XStack>
          <YStack flex={1} />
          <YStack width={240} minW={0}>
            <Input value={q} onChangeText={setQ} placeholder="Find repo…" aria-label="Find a repository" disabled={!signed} />
          </YStack>
          <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: 'sync' }))}>
            Sync
          </Button>
          <Button size="sm" disabled={!signed} onPress={() => setMaking(true)}>
            <Plus size={14} />
            New
          </Button>
        </XStack>
        {list.error ? (
          <Note>{list.error.message}</Note>
        ) : !signed ? (
          <Note>Sign in to see this organization's repositories.</Note>
        ) : list.loading && list.value.length === 0 ? (
          <Note>Reading the forge…</Note>
        ) : shown.length === 0 ? (
          <Note>{list.value.length === 0 ? 'No repositories yet.' : 'Nothing matches.'}</Note>
        ) : (
          <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
            <XStack px="$3" py="$2" gap="$3" items="center">
              <XStack
                flex={1}
                render="button"
                aria-label="Sort by name"
                items="center"
                gap="$1"
                onPress={() => setSort('name')}
              >
                <SizableText size="$1" color="$soft">
                  Name
                </SizableText>
                {sort === 'name' ? <ChevronDown size={12} /> : null}
              </XStack>
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
                <SizableText flex={1} size="$2" color="$ink" numberOfLines={1}>
                  {c.name}
                </SizableText>
                <SizableText size="$1" color="$soft" width={140} style={{ textAlign: 'right' }}>
                  {syncing.has(c.name) ? 'Syncing…' : when(c.updated)}
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
      </YStack>
      <NewRepo
        open={making}
        onOpenChange={setMaking}
        onCreate={async (name, description) => {
          const row = await create(t, name, description)
          pinCodebase(host.org, row)
          setMaking(false)
          host.go('')
        }}
      />
    </YStack>
  )
}

function NewRepo({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreate: (name: string, description: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onCreate(name, description)
      setName('')
      setDescription('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that repository')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New repository</DialogTitle>
        <YStack gap="$3" pt="$3">
          <Input value={name} onChangeText={setName} placeholder="Name" aria-label="Repository name" />
          <Input value={description} onChangeText={setDescription} placeholder="Description" aria-label="Description" />
          {error ? <Note>{error}</Note> : null}
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="outline" disabled={busy} onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !name.trim()} onPress={() => void submit()}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
  )
}

function when(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const minutes = Math.round((Date.now() - t) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(t).toLocaleDateString()
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
          <Note>No boards yet. A repository shows up here once it has an issue.</Note>
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

function Issues() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [board, setBoard] = useKept<string>(boardKey(host.org), '')
  const list = useRead(signed ? () => issues(t, board) : null, [] as Work[], [t, signed, board])

  useEffect(() => {
    const on = () => {
      try {
        const raw = window.localStorage.getItem(boardKey(host.org))
        const next = raw === null ? '' : JSON.parse(raw)
        setBoard(typeof next === 'string' ? next : '')
      } catch {
        setBoard('')
      }
    }
    window.addEventListener('hanzo-board', on)
    return () => window.removeEventListener('hanzo-board', on)
  }, [host.org, setBoard])

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

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" items="center">
      <YStack width="100%" maxW={720} gap="$3">
        <Head
          title="Issues"
          says={board ? `Open work on ${board}. Choosing one starts the next run on that codebase.` : 'Open work across every board. Choosing one starts the next run on that codebase.'}
        />
        {board ? (
          <XStack render="button" onPress={() => setBoard('')} aria-label="Show every board" self="flex-start">
            <SizableText size="$1" color="$soft">
              All boards
            </SizableText>
          </XStack>
        ) : null}
        {list.error ? (
          <Note>{list.error.message}</Note>
        ) : !signed ? (
          <Note>Sign in to see this organization's issues.</Note>
        ) : list.loading && list.value.length === 0 ? (
          <Note>Reading the forge…</Note>
        ) : list.value.length === 0 ? (
          <Note>Nothing open.</Note>
        ) : (
          <YStack gap="$2">
            {list.value.map((w) => (
              <Row key={w.id} label={`Build ${w.identifier || w.title}`} onPress={() => open(w)}>
                <SizableText size="$1" color="$soft" width={88} numberOfLines={1}>
                  {w.identifier || w.kind}
                </SizableText>
                <SizableText size="$3" color="$ink" flex={1} minW={0} numberOfLines={1}>
                  {w.title}
                </SizableText>
                <SizableText size="$1" color="$soft">
                  {STATUS[w.status] ?? w.status}
                </SizableText>
              </Row>
            ))}
          </YStack>
        )}
      </YStack>
    </YStack>
  )
}
