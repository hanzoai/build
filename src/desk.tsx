/**
 * The pane beside a run's transcript, as tabs: the Browser showing what the run's
 * sandbox serves (or where the run is published), its sandbox's Desktop and
 * Terminal, what it produced, its files, what it pushed, and its codebase's
 * environment.
 *
 * The sandbox outlives the run: kept when the run ends, parked while nobody
 * watches, retired a day after it parks. The bar under the tabs says which and
 * suspends or resumes it; a tab that needs it running resumes it (sandbox.ts).
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ExternalLink, Info, MoreHorizontal, PanelRightClose, RefreshCcw } from '@hanzogui/lucide-icons-2'
import { Button, DropdownMenu, type DropdownMenuProps } from '@hanzo/ui'
import { PreviewFrame, type PreviewHandle } from '@hanzo/ui/agents'
import { useCallback, useEffect, useRef, useState } from 'react'

import { park, ports as listening, preview, sandbox as look, wake, type Box, type Port } from './api/sandbox.ts'
import type { Event } from './api/sessions.ts'
import { failure, shell, type ShellLine } from './api/turn.ts'
import { Door } from './door.tsx'
import { Environment } from './environment.tsx'
import { Artifacts, Files } from './files.tsx'
import { Git } from './git.tsx'
import { useTarget } from './host.tsx'
import { away, Out } from './out.tsx'

type Tab = 'browser' | 'desktop' | 'terminal' | 'artifacts' | 'files' | 'git' | 'environment'

/** The tabs that are a surface of their own, drawn edge to edge. */
const BLEED: Tab[] = ['browser', 'desktop', 'terminal']

/** How often the sandbox's state, and what it serves, is read while the pane is open. */
const EVERY = 10_000
const PORTS = 5_000

export function Desk({
  id,
  repo,
  branch,
  base,
  environment,
  mode,
  pr,
  title,
  project,
  sandbox,
  site,
  published,
  events,
  live,
  menu,
  refused,
  retry,
  onRetry,
  onHide,
}: {
  id: string
  repo: string
  branch: string
  base: string
  environment: string
  mode: string
  pr: { href: string; label: string }
  title: string
  project: string
  /** The sandbox the run leased, or '' before it leases one and on a machine. */
  sandbox: string
  /** Where the run's work is published, or '' before it is. */
  site: string
  /** The run's latest publish, which loads the page again. */
  published: number
  events: Event[]
  live: boolean
  /** What can be done to the run — rename, share, copy its id — as its header offers it. */
  menu: NonNullable<DropdownMenuProps['items']>
  refused: string
  /** The refusal's one action: Retry, or Sign in when nobody is. */
  retry: string
  onRetry: () => void
  onHide: () => void
}) {
  // Until a tab is picked it follows the run: a setup run's work IS the
  // environment, a published run opens on its site, any other on its terminal.
  const [picked, setTab] = useState<Tab | null>(null)
  const tab = picked ?? (mode === 'setup' ? 'environment' : site ? 'browser' : 'terminal')
  const name = repo.split('/').filter(Boolean).pop() || repo
  const lines = shell(events)
  const failed = failure(events)
  const bleed = BLEED.includes(tab)
  const box = useBox(sandbox)
  // Nothing is said of the sandbox until it has been read.
  const held = box.value?.state ?? ''

  return (
    <YStack role="complementary" aria-label="Run details" flex={1} minW={0} minH={0} borderLeftWidth={1} borderColor="$borderColor">
      <XStack px="$2" py="$2" gap="$1" borderBottomWidth={1} borderColor="$borderColor" items="center">
        {/* The tabs scroll sideways in a narrow pane; hiding the pane and its menu stay put. */}
        <XStack flex={1} minW={0} gap="$1" overflow="scroll">
          <TabButton id="browser" tab={tab} onPick={setTab}>
            Browser
          </TabButton>
          <TabButton id="desktop" tab={tab} onPick={setTab}>
            Desktop
          </TabButton>
          <TabButton id="terminal" tab={tab} onPick={setTab}>
            Terminal
          </TabButton>
          <TabButton id="artifacts" tab={tab} onPick={setTab}>
            Artifacts
          </TabButton>
          <TabButton id="files" tab={tab} onPick={setTab}>
            Files
          </TabButton>
          <TabButton id="git" tab={tab} onPick={setTab}>
            Git
          </TabButton>
          <TabButton id="environment" tab={tab} onPick={setTab}>
            Environment
          </TabButton>
        </XStack>
        <XStack render="button" aria-label="Hide the side pane" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }} onPress={onHide}>
          <PanelRightClose size={16} />
        </XStack>
        <DropdownMenu
          trigger={
            <XStack render="button" aria-label="Run actions" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
              <MoreHorizontal size={16} />
            </XStack>
          }
          items={[...menu, { key: 'details', label: 'Details', icon: <Info size={16} />, onSelect: () => setTab('environment') }]}
        />
      </XStack>
      {sandbox ? <Held box={box} live={live} /> : null}
      <YStack flex={1} minH={0} overflow={bleed ? 'hidden' : 'scroll'} px={bleed ? 0 : '$3'} py={bleed ? 0 : '$3'}>
        {tab === 'environment' ? (
          <YStack gap="$2">
            <Environment repo={name} busy={live && mode === 'setup'} />
            <SizableText size="$2" color="$ink" pt="$4">
              This run
            </SizableText>
            <Fact label="Run" value={id} />
            <Fact label="Repository" value={name || '—'} />
            <Fact label="Branch" value={branch || '—'} />
            <Fact label="Base" value={base || '—'} />
            <Fact label="Runs on" value={environment || 'sandbox'} />
            <Fact label="Sandbox" value={sandbox || '—'} />
            <Fact label="Mode" value={mode || 'build'} />
          </YStack>
        ) : null}
        {tab === 'browser' ? <Browser key={published} sandbox={sandbox} held={held} site={site} live={live} /> : null}
        {tab === 'git' ? <Git session={id} title={title} live={live} /> : null}
        {tab === 'desktop' ? <Door which="screen" sandbox={sandbox} held={held} session={id} /> : null}
        {tab === 'terminal' ? (
          <Terminal id={id} sandbox={sandbox} held={held} lines={lines} live={live} failed={failed} refused={refused} retry={retry} onRetry={onRetry} />
        ) : null}
        {tab === 'artifacts' ? (
          <Artifacts session={id} sandbox={sandbox} repo={repo} branch={branch} mode={mode} project={project} site={site} pr={pr} onEnvironment={() => setTab('environment')} />
        ) : null}
        {tab === 'files' ? <Files session={id} repo={repo} branch={branch} sandbox={sandbox} live={held === 'running'} /> : null}
      </YStack>
    </YStack>
  )
}

interface Watch {
  value: Box | null
  busy: boolean
  note: string
  act: (how: 'park' | 'wake') => void
}

/**
 * The run's sandbox as it stands, and what moves it. It is read while the pane is
 * open and the page is in view, and no more once it has ended or failed.
 */
function useBox(id: string): Watch {
  const t = useTarget()
  const [value, setValue] = useState<Box | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    setValue(null)
    if (!id) return
    let gone = false
    let every: ReturnType<typeof setInterval> | undefined
    const read = () => {
      if (document.hidden) return
      look(t, id).then(
        (b) => {
          if (gone) return
          setValue(b)
          if (b.state === 'gone' || b.state === 'error') clearInterval(every)
        },
        (e: Error) => !gone && setNote(e.message),
      )
    }
    read()
    every = setInterval(read, EVERY)
    return () => {
      gone = true
      clearInterval(every)
    }
  }, [t, id])
  const act = useCallback(
    (how: 'park' | 'wake') => {
      setBusy(true)
      setNote('')
      ;(how === 'park' ? park(t, id) : wake(t, id)).then(setValue, (e: Error) => setNote(e.message)).finally(() => setBusy(false))
    },
    [t, id],
  )
  return { value, busy, note, act }
}

/** When a parked sandbox is retired, as a person reads it. */
const until = (ms: number): string => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * The sandbox's line under the tabs: where it is, and the one thing to do to it.
 * A sandbox a run is working in is not suspended from here.
 */
function Held({ box, live }: { box: Watch; live: boolean }) {
  const b = box.value
  const state = b?.state ?? 'pending'
  const says =
    state === 'running'
      ? 'Sandbox running'
      : state === 'parked'
        ? b?.ends
          ? `Sandbox suspended · its files are kept until ${until(b.ends)}`
          : 'Sandbox suspended · its files are kept'
        : state === 'pending'
          ? 'Sandbox starting…'
          : state === 'gone'
            ? 'Sandbox ended'
            : `Sandbox unavailable${b?.error ? ` · ${b.error}` : ''}`
  return (
    <XStack px="$3" py="$1.5" gap="$2" items="center" borderBottomWidth={1} borderColor="$borderColor" aria-label="Sandbox">
      <YStack width={7} height={7} rounded={99} bg={state === 'running' ? '$green10' : state === 'parked' ? '$soft' : '$borderColor'} />
      <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1}>
        {box.note || says}
      </SizableText>
      {state === 'running' && !live ? (
        <Button size="sm" variant="ghost" disabled={box.busy} onPress={() => box.act('park')}>
          Suspend
        </Button>
      ) : state === 'parked' ? (
        <Button size="sm" variant="outline" disabled={box.busy} onPress={() => box.act('wake')}>
          {box.busy ? 'Resuming…' : 'Resume'}
        </Button>
      ) : null}
    </XStack>
  )
}

/** What a preview page says of itself, when it cannot serve. */
const PREVIEW = 'hanzo-preview'

/** How often a preview is opened again on its own before Retry is the person's to press. */
const REMINTS = 2
const REMINT = 30_000

/** What a preview page's status means to the person looking at it, when it is not reopened. */
const SAYS: Record<number, (port: number) => string> = {
  401: () => 'This browser keeps the preview’s cookie out of a frame. Open it in a new tab.',
  502: (port) => `Nothing answered on port ${port}. Start the server, then Retry.`,
}

/**
 * The Browser tab: what the run's sandbox serves, one port at a time, framed at
 * its own origin; or, with nothing serving, where the run is published. Only a
 * running sandbox is shown: a suspended one is resumed from the bar, never by
 * looking. A preview that lost its sandbox (409) is opened again, at most twice
 * in a while; any other status is said, and Retry is the person's.
 */
function Browser({ sandbox, held, site, live }: { sandbox: string; held: Box['state'] | ''; site: string; live: boolean }) {
  const t = useTarget()
  const [open, setOpen] = useState<Port[]>([])
  const [port, setPort] = useState(0)
  const [src, setSrc] = useState('')
  const [why, setWhy] = useState('')
  const [attempt, setAttempt] = useState(0)
  const reopened = useRef<number[]>([])
  const frame = useRef<HTMLIFrameElement>(null)
  const running = Boolean(sandbox) && held === 'running'

  // What listens, read again while the sandbox runs: a dev server appears once it listens.
  useEffect(() => {
    if (!running) {
      setOpen([])
      setPort(0)
      return
    }
    let gone = false
    const read = () =>
      listening(t, sandbox).then(
        (ps) => {
          if (gone) return
          setOpen(ps)
          setPort((p) => (ps.some((x) => x.port === p) ? p : (ps[0]?.port ?? 0)))
        },
        () => undefined,
      )
    void read()
    const every = setInterval(read, PORTS)
    return () => {
      gone = true
      clearInterval(every)
    }
  }, [t, sandbox, running])

  // One address per port and attempt: its ticket is spent when the page opens it.
  useEffect(() => {
    setSrc('')
    setWhy('')
    if (!port || !sandbox) return
    let gone = false
    preview(t, sandbox, port).then(
      (u) => !gone && setSrc(u),
      (e: Error) => !gone && setWhy(e.message),
    )
    return () => {
      gone = true
    }
  }, [t, sandbox, port, attempt])

  // A preview that can no longer serve says so; one whose sandbox stopped is opened again, a little.
  useEffect(() => {
    if (!src) return
    const origin = new URL(src).origin
    const hear = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return
      const m = e.data as { source?: unknown; status?: unknown } | null
      if (m?.source !== PREVIEW || typeof m.status !== 'number') return
      const now = Date.now()
      reopened.current = reopened.current.filter((at) => now - at < REMINT)
      if (m.status === 409 && reopened.current.length < REMINTS) {
        reopened.current.push(now)
        setAttempt((a) => a + 1)
        return
      }
      const say = SAYS[m.status]
      if (say || m.status === 409) setWhy(say ? say(port) : 'The sandbox stopped serving. Retry to open it again.')
    }
    window.addEventListener('message', hear)
    return () => window.removeEventListener('message', hear)
  }, [src, port])

  const tab = () => away(preview(t, sandbox, port)).catch((e: Error) => setWhy(e.message))

  if (!running) return <Site site={site} live={live} held={held} />
  if (!port) return <Site site={site} live={live} held={held} />
  const host = open.find((p) => p.port === port)?.host ?? ''
  return (
    <YStack flex={1} minH={0}>
      <XStack px="$2" py="$1.5" gap="$1.5" items="center" borderBottomWidth={1} borderColor="$borderColor">
        <XStack render="button" aria-label="Reload the page" onPress={() => setAttempt((a) => a + 1)} p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <RefreshCcw size={14} />
        </XStack>
        {open.length > 1 ? (
          <XStack gap="$1">
            {open.map((p) => (
              <XStack key={p.port} render="button" aria-label={`Port ${p.port}`} onPress={() => setPort(p.port)} px="$2" py="$1" rounded="$2" bg={p.port === port ? '$hover' : 'transparent'}>
                <SizableText size="$1" color={p.port === port ? '$ink' : '$soft'}>
                  {String(p.port)}
                </SizableText>
              </XStack>
            ))}
          </XStack>
        ) : null}
        <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1} style={mono}>
          {host || `port ${port}`}
        </SizableText>
        <XStack render="button" aria-label="Open in a new tab" onPress={() => void tab()} p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <ExternalLink size={14} />
        </XStack>
      </XStack>
      {why ? (
        <YStack flex={1} items="center" justify="center" gap="$2" p="$6">
          <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
            {why}
          </SizableText>
          <XStack gap="$2">
            <Button size="sm" variant="outline" onPress={() => setAttempt((a) => a + 1)}>
              Retry
            </Button>
            <Button size="sm" variant="outline" onPress={() => void tab()}>
              Open in a new tab
            </Button>
          </XStack>
        </YStack>
      ) : src ? (
        <iframe
          ref={frame}
          src={src}
          title={`What the run serves on port ${port}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#fff' }}
        />
      ) : (
        <YStack flex={1} items="center" justify="center">
          <SizableText size="$2" color="$soft">
            {`Opening port ${port}…`}
          </SizableText>
        </YStack>
      )}
    </YStack>
  )
}

/**
 * Where the run published its work, framed, with its address, a reload and the
 * page in a tab of its own; or what keeps its sandbox from serving.
 */
function Site({ site, live, held }: { site: string; live: boolean; held: Box['state'] | '' }) {
  const frame = useRef<PreviewHandle | null>(null)
  return (
    <YStack flex={1} minH={0}>
      <XStack px="$2" py="$1.5" gap="$1.5" items="center" borderBottomWidth={1} borderColor="$borderColor">
        <XStack render="button" aria-label="Reload the page" onPress={() => frame.current?.reload()} p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <RefreshCcw size={14} />
        </XStack>
        <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1} style={mono}>
          {site || 'Nothing is serving yet'}
        </SizableText>
        {site ? (
          <Out href={site} label="Open in a new tab">
            <XStack p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
              <ExternalLink size={14} />
            </XStack>
          </Out>
        ) : null}
      </XStack>
      <PreviewFrame
        ref={frame}
        src={site}
        title="Where this run is published"
        device="desktop"
        empty={
          <YStack items="center" gap="$2" p="$6">
            <SizableText size="$3" color="$ink">
              Nothing is serving yet
            </SizableText>
            <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
              {held === 'parked'
                ? 'The run’s sandbox is suspended. Resume it to see what it serves.'
                : live
                  ? 'When the run starts a server in its sandbox, the page opens here.'
                  : 'Nothing listens in this run’s sandbox, and it published no site. Its work is on its branch.'}
            </SizableText>
          </YStack>
        }
      />
    </YStack>
  )
}

function TabButton({ id, tab, onPick, children }: { id: Tab; tab: Tab; onPick: (t: Tab) => void; children: string }) {
  const on = tab === id
  return (
    <XStack
      render="button"
      aria-label={children}
      aria-pressed={on}
      onPress={() => onPick(id)}
      px="$3"
      py="$1.5"
      rounded={999}
      shrink={0}
      bg={on ? '$edge' : 'transparent'}
      hoverStyle={{ bg: '$hover' }}
    >
      <SizableText size="$2" color={on ? '$ink' : '$soft'}>
        {children}
      </SizableText>
    </XStack>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <XStack gap="$3" items="baseline">
      <SizableText size="$1" color="$soft" width={96}>
        {label}
      </SizableText>
      <SizableText flex={1} size="$2" color="$ink" numberOfLines={2}>
        {value}
      </SizableText>
    </XStack>
  )
}

const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)', whiteSpace: 'pre' as const }

/**
 * The Terminal tab: a shell in the run's sandbox, in the same working tree as the
 * agent, while the sandbox is kept; and the agent's log, which outlives it. The
 * shell is a tmux session named for the run, so a reopened tab reattaches to it.
 */
function Terminal({
  id,
  sandbox,
  held,
  lines,
  live,
  failed,
  refused,
  retry,
  onRetry,
}: {
  id: string
  sandbox: string
  held: Box['state'] | ''
  lines: ShellLine[]
  live: boolean
  /** Why the run failed, as its last status says it, or ''. */
  failed: string
  refused: string
  retry: string
  onRetry: () => void
}) {
  const reachable = Boolean(sandbox) && held === 'running'
  // The shell while there is one, unless the log was asked for.
  const [log, setLog] = useState(false)
  const showShell = reachable && !log
  return (
    <YStack flex={1} minH={0} bg="$background">
      <XStack px="$2" py="$1.5" gap="$1" borderBottomWidth={1} borderColor="$borderColor" items="center">
        {reachable ? (
          <XStack render="button" aria-label="Shell" onPress={() => setLog(false)} px="$2" py="$1" rounded="$2" bg={showShell ? '$hover' : 'transparent'}>
            <SizableText size="$1" color={showShell ? '$ink' : '$soft'}>
              Shell
            </SizableText>
          </XStack>
        ) : null}
        <XStack render="button" aria-label="Agent log" onPress={() => setLog(true)} px="$2" py="$1" rounded="$2" bg={showShell ? 'transparent' : '$hover'}>
          <SizableText size="$1" color={showShell ? '$soft' : '$ink'}>
            Agent log
          </SizableText>
        </XStack>
      </XStack>
      {showShell ? <Door which="terminal" sandbox={sandbox} held={held} session={`run-${id.replace(/^sess_/, '').slice(0, 12)}`} /> : <Log lines={lines} live={live} failed={failed} refused={refused} retry={retry} onRetry={onRetry} />}
    </YStack>
  )
}

function Log({
  lines,
  live,
  failed,
  refused,
  retry,
  onRetry,
}: {
  lines: ShellLine[]
  live: boolean
  failed: string
  refused: string
  retry: string
  onRetry: () => void
}) {
  const prompt = 'workspace'
  const idle = lines.length === 0 && !live
  return (
    <YStack flex={1} minH={0}>
      <YStack flex={1} minH={0} overflow="scroll" px="$3" py="$3" gap="$1">
        {idle ? (
          <YStack flex={1} items="center" justify="center" gap="$3" py="$8">
            <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
              {refused || (failed ? `This run stopped before its first command: ${failed}` : 'This run finished without writing a command.')}
            </SizableText>
            {refused ? (
              <Button size="sm" variant="outline" onPress={onRetry}>
                {retry}
              </Button>
            ) : null}
          </YStack>
        ) : (
          lines.map((line, i) =>
            line.role === 'cmd' ? (
              <XStack key={i} gap="$2">
                <SizableText size="$1" color="$soft" style={mono}>
                  {`${prompt} $`}
                </SizableText>
                <SizableText flex={1} size="$1" color="$ink" style={mono}>
                  {line.text}
                </SizableText>
              </XStack>
            ) : (
              <SizableText key={i} size="$1" color="$ink" style={mono}>
                {line.text}
              </SizableText>
            ),
          )
        )}
        {live ? (
          <XStack gap="$2" items="center">
            <SizableText size="$1" color="$soft" style={mono}>
              {`${prompt} $`}
            </SizableText>
            <YStack width={7} height={14} bg="$ink" />
          </XStack>
        ) : null}
      </YStack>
      <XStack px="$3" py="$2" borderTopWidth={1} borderColor="$borderColor">
        <SizableText size="$1" color="$soft">
          Commands appear here as the run writes them.
        </SizableText>
      </XStack>
    </YStack>
  )
}
