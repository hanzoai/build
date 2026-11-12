/**
 * One run, live: its transcript as it streams, the controls that reach it —
 * steer, pause, resume, stop — the pull request once it pushes one, and the
 * follow-up that continues it once it has finished.
 *
 * The detail read is the record and the stream adds to it; the two overlap
 * whenever a turn lands between the read and the subscribe, so turns are merged
 * by sequence. A reconnect after a drop re-reads the detail — the platform drops
 * a subscriber that falls behind, and frames missed then are only in the read.
 *
 * Steering a machine's run is a queue it drains between steps: a press is
 * confirmed as RECORDED, and the status is left to the feed to correct. A
 * sandbox run is steered through `POST /v1/agent/coding/{session}/steer`, which
 * stops it with its work kept and opens a follow-up with the words.
 *
 * A sandbox run is one agent invocation that takes its task on its command line
 * (apps/coding steer.go), so what continues it is a new run: a paused run is
 * carried on, and a finished one followed up, by `POST /v1/agent/coding` from
 * the branch its work was kept on — the platform's own continue, done here —
 * with the model and effort the composer shows (mind.tsx), which Chat and New share.
 *
 * It reads as a chat: the person's ask opens it, each thing the agent said can
 * be copied and judged (a verdict is `build.verdict` on the event bus, as a
 * project's turns send it), and the title is the menu of what can be done to
 * the run. Share opens its story to the public build route.
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import { phrase } from '@hanzo/i18n'
import { useI18n } from '@hanzo/i18n/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  FileDiff,
  Folder,
  GitPullRequest,
  Globe,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Share,
  SlidersHorizontal,
  SquareTerminal,
} from '@hanzogui/lucide-icons-2'
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Switch,
  type DropdownMenuProps,
} from '@hanzo/ui'
import { Steer, type Command } from '@hanzo/ui/agents'
import { Composer, Failure, measure } from '@hanzo/ui/chat'
import { useLimits } from '@hanzo/ui/product/useLimits'
import { useDictation, useVoice } from '@hanzo/voice'
import { useEffect, useMemo, useRef, useState } from 'react'

import { approve, followUp, headline, retry, start, steer, type Ask, type Earlier } from './api/coding.ts'
import { limits as readLimits } from './api/models.ts'
import { list, message, pause, publish, rename, resume, stop, story, took } from './api/sessions.ts'
import { answer, cards, followed, outcome, pull, settled, steps } from './api/turn.ts'
import { answer as reply, say as talk, talks } from './api/talk.ts'
import { verdict } from './api/verdict.ts'
import { useKept, useProjects, useRead, useRun, type RunState } from './data.ts'
import { Desk, SEED } from './desk.tsx'
import { useHost, useTarget } from './host.tsx'
import { level, pacing, useMind } from './mind.ts'
import { Out } from './out.tsx'
import { Gutter } from './gutter.tsx'
import { gap, pane } from './pane.ts'
import { useEar, useSpoken } from './voice.ts'
import { speaker, type Artifact } from './reply.tsx'
import { PanelToggle } from './panel.tsx'
import { schedule } from './scheduled.tsx'
import { SideProvider, useSplit } from './side.tsx'
import { PAGE, useDeck, useKey, usePanel } from './tabs.ts'
import { carrying, compose, pick, type Attached } from './tools.tsx'
import { Talk } from './talk.tsx'
import { Transcript, type QueuedMessage, type TranscriptView } from './transcript.tsx'

const LIVE = new Set(['running', 'paused', ''])

/** A run's status as the line under its title says it; one the service adds later is drawn as it comes. */
const STATUS: Record<string, string> = {
  running: phrase('running'),
  paused: phrase('paused'),
  done: phrase('done'),
  error: phrase('error'),
  stopped: phrase('stopped'),
}

type MenuItems = NonNullable<DropdownMenuProps['items']>

/** One session's page: a conversation (talk.tsx) or one run, as its record says. */
export function Run({ id }: { id: string }) {
  const host = useHost()
  const t = useTarget()
  // Signed out, there is nothing to read: the gateway answers a bare run with a refusal.
  const state = useRun(t, host.person ? id : null)
  return talks(state.record) ? <Talk id={id} state={state} /> : <Job id={id} state={state} />
}

function Job({ id, state: read }: { id: string; state: RunState }) {
  const { t: say } = useI18n()
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const { detail, record, events, status, refused } = read
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attached[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notify, setNotify] = useState(false)
  // The side panel: open or shut as Dev was left, its tabs as they were arranged.
  const wide = useMedia().md
  const [desk, setDesk] = usePanel('dev', true, wide)
  const side = useDeck('dev', SEED)
  useKey(() => setDesk(!desk))
  // The side panel's column: the person's width, the run hidden behind it, full screen (side.tsx).
  const split = useSplit(desk && wide, 'run', () => setDesk(false))
  // Stop was pressed here: the run keeps its work after it answers, and says so with its status.
  const [stopping, setStopping] = useState(false)
  // The working sandbox run words were said to here: its follow-up opens once it starts.
  const [steered, setSteered] = useState('')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState('')
  const [unfolded, setUnfolded] = useState(false)
  const [transcriptView, setTranscriptView] = useKept<TranscriptView>('hanzo.build.transcript.view', 'normal')
  const [outputStyle, setOutputStyle] = useKept<string>('hanzo.build.output.style', 'default')
  const [envColumn, setEnvColumn] = useState(false)
  const [splitPanes, setSplitPanes] = useState<string[]>([])
  const [queued, setQueued] = useState<QueuedMessage[]>([])
  const [keepAwake, setKeepAwake] = useState(false)
  const wakeLockRef = useRef<{ release?: () => Promise<void> } | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  // The model and effort a run started here uses: the one choice Chat and New share.
  const { limits } = useLimits(signed ? (signal) => readLimits(t, signal) : null, t)
  const mind = useMind(t, (limits as { plan?: string } | null)?.plan, host.topUp)
  const voice = useVoice({ speech: useEar(t), language: useSpoken(), ...useDictation(draft, setDraft) })
  const listen = useMemo(() => speaker(t), [t])

  const mode = record?.mode ?? ''
  // A run that narrated no ask of its own opens with the one its title records, once it has said anything.
  const shown = useMemo(() => {
    const drawn = cards(events, mode, say)
    const ask = record ? headline(record.title, record.repo) : ''
    const opens = drawn[0]?.kind === 'said' && drawn[0].who === 'person'
    return ask && drawn.length && !opens ? [{ kind: 'said' as const, key: 'ask', who: 'person' as const, text: ask }, ...drawn] : drawn
  }, [events, mode, record, say])
  const end = outcome(events)
  const plan = useMemo(() => steps(events), [events])
  const kept = useMemo(() => settled(events), [events])
  const next = useMemo(() => followed(events), [events])
  const state = status || end.status
  // Where the run's work is published: its project's own address, read again when
  // the run says it went live, never an address an event names.
  const built = useProjects(t, signed && Boolean(record?.project))
  const rebuilt = built.reload
  useEffect(() => {
    if (end.published) rebuilt()
  }, [end.published, rebuilt])
  // What a run publishes opens in the panel: the Preview, chosen and shown.
  useEffect(() => {
    if (!end.published) return
    side.open({ kind: 'preview', title: say('Preview') })
    setDesk(true)
    // On each publish, not on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end.published])
  const site = built.value.find((p) => p.slug === record?.project)?.live ?? ''
  const pr = pull(record?.pr ?? '', record?.repo ?? '')
  const live = LIVE.has(state)
  const running = signed && live && !detail.error
  const paused = running && state === 'paused'
  const finished = signed && !live && !detail.error && Boolean(record)
  // A sandbox run is held by the coding service, which pauses it with its work
  // kept and has no resume of its own; a machine drains its commands itself.
  const held = (record?.environment || 'sandbox') === 'sandbox'
  // Words go to the run while it works, unless it is a paused sandbox run, which a new run carries on.
  const steering = running && !(paused && held)
  // A follow-up clones what the run kept, so it waits until the run has said where that is.
  const waiting = (paused && held && !kept.settled) || (finished && stopping && !kept.settled)
  const title = record?.title || (detail.loading ? '' : say('Untitled run'))
  // A setup run explores and installs before it answers, which takes minutes.
  const setup = mode === 'setup'
  const [seen, setSeen] = useKept('hanzo.build.setup.seen', false)
  // How long setup runs have taken here: the ones this person can see, finished.
  const past = useRead(setup && running ? () => list(t, { kind: 'coding', status: 'done', limit: 500 }) : null, [], [t, setup, running])
  const span = took(past.value, 'setup')
  const earlier: Earlier | null = record
    ? {
        id,
        title,
        repo: record.repo,
        base: record.base,
        environment: record.environment,
        project: record.project,
        mode,
        pushed: kept.pushed,
      }
    : null
  const planned = mode === 'plan' && finished && state === 'done' ? answer(events) : ''
  // A failed run is tried again with the person's words as it recorded them.
  const failed = finished && state === 'error'
  const asked = shown.find((c) => c.kind === 'said' && c.who === 'person')
  const again = asked && asked.kind === 'said' ? asked.text : ''
  // What the recorded read left out: it carries the latest fifty turns.
  const hidden = Math.max(0, (detail.value?.events ?? 0) - (detail.value?.recent.length ?? 0))
  // Only a run still working is on a step.
  const current = running ? plan.find((x) => !x.done) : undefined

  // Asked for while it ran, said once when it stops. `notify` is only ever set
  // where Notification exists; the permission can be taken back since.
  useEffect(() => {
    if (!notify || running) return
    if (Notification.permission === 'granted') new Notification(record?.title || say('Run finished'), { body: say('This run has finished.') })
    setNotify(false)
  }, [notify, running, record?.title])

  const ask = async () => {
    if (typeof Notification === 'undefined') {
      setNote(say('This browser cannot send a notification.'))
      return
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm !== 'granted') {
      setNote(say('Notifications stay off until this browser allows them.'))
      return
    }
    setNotify(true)
    setNote('')
  }

  /** Something that answers a sentence for the note, or throws the reason. One at a time. */
  const act = async (work: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      setNote(await work())
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * A new run's ask with the model and effort the composer shows, Enso named as
   * itself: a run that names none takes the person's saved coding default
   * (apps/coding start.go), which is not what the composer shows.
   */
  const tuned = (a: Ask): Ask => ({ ...a, model: mind.model, effort: level(mind.effort) })

  // A setup run's work IS its environment: the panel opens on it.
  useEffect(() => {
    if (mode === 'setup') side.open({ kind: 'environment', title: say('Environment') })
    // Once the run says what it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  /** An answer's artifact, open in the panel as a page rendered from its own bytes. */
  const look = (a: Artifact) => {
    side.open({ kind: PAGE, title: a.name, body: a.body, type: a.mime })
    setDesk(true)
  }

  /**
   * A new run from this one's work, opened. A paused run it carries on is let go
   * first: the new run works in the same sandbox, where nothing else may be at work.
   */
  const carry = async (said: string, how: 'follow' | 'approve' | 'retry' = 'follow'): Promise<string> => {
    if (!earlier) throw new Error(say('This run is still being read'))
    if (paused) await stop(t, id, 'Continued in a follow-up run').catch(() => undefined)
    // A run a conversation started is carried on by the conversation (talk.ts): the
    // words go there, in its session, and so does the reader.
    if (record?.parent) {
      const words = how === 'approve' ? `Carry out this plan:\n\n${said.trim()}` : said.trim() || 'Continue where the run left off.'
      // Approving the plan is going ahead: the conversation leaves Plan for Auto, so
      // the run it starts builds.
      await talk(t, { session: record.parent, input: words, model: mind.model, effort: level(mind.effort), ...(how === 'approve' ? { mode: 'auto' as const } : {}) })
      setDraft('')
      setFiles([])
      host.go(record.parent)
      return ''
    }
    const ask = how === 'approve' ? approve(earlier, said) : how === 'retry' ? retry(earlier, said) : followUp(earlier, said)
    const run = await start(t, tuned(ask))
    setDraft('')
    setFiles([])
    host.go(run.session)
    return ''
  }

  /**
   * Words for the run while it works. A machine drains them between steps; a
   * sandbox run reads nothing after it starts, so the platform stops it with its
   * work kept and a follow-up takes the words on (api/coding.ts `steer`).
   */
  const tell = async (words: string): Promise<string> => {
    if (held) {
      await steer(t, id, words)
      setSteered(id)
      return say('Sent — the run stops with its work kept, and a follow-up takes it from here')
    }
    await message(t, id, words)
    return say('Sent — recorded on this run')
  }

  // The follow-up the words said here started: it is where the run goes on.
  useEffect(() => {
    if (steered === id && next) host.go(next)
    // On the follow-up's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steered, id, next])

  // The composer sends words, with any files fenced after them, and only while it is enabled.
  const send = () => {
    const words = compose(draft.trim(), files)
    if (steering) {
      void act(async () => {
        const said = await tell(words)
        setDraft('')
        setFiles([])
        return said
      })
      return
    }
    void act(() => carry(words))
  }

  const command = (c: Command) => {
    switch (c) {
      case 'stop':
        void act(async () => {
          await stop(t, id)
          setStopping(true)
          return say('Stop requested — the run keeps its work on its branch')
        })
        return
      case 'pause':
        void act(async () => {
          await pause(t, id)
          return held ? say('Pause requested — the run keeps its work on its branch and waits') : say('Pause asked — the machine pauses when it reads it')
        })
        return
      case 'resume':
        if (held) void act(() => carry(''))
        else
          void act(async () => {
            await resume(t, id)
            return say('Resume asked — the machine goes on when it reads it')
          })
        return
    }
  }

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
    } catch {
      setNote(say('This browser would not copy.'))
    }
  }

  const share = (on: boolean) =>
    act(async () => {
      await publish(t, id, on)
      detail.reload()
      return on ? say('Shared — anyone with the link can read this run’s story') : say('No longer shared')
    })

  // What the title's menu does to the run.
  const manage: MenuItems = [
    ...(signed && record
      ? [
          {
            key: 'rename',
            label: say('Rename'),
            icon: <Pencil size={16} />,
            onSelect: () => {
              setName(title)
              setNaming(true)
            },
          },
        ]
      : []),
    { key: 'copy', label: copied === 'id' ? say('Copied') : say('Copy run id'), icon: <Copy size={16} />, description: id, onSelect: () => void copy('id', id) },
    // What this run was asked, as a task that runs again on a schedule: the ask it opened with.
    ...(signed && record
      ? [
          {
            key: 'schedule',
            label: say('Schedule this'),
            icon: <Clock size={16} />,
            description: say('Run it again on a schedule'),
            onSelect: () => {
              const first = shown.find((c) => c.kind === 'said' && c.who === 'person')
              schedule(first && 'text' in first ? first.text : headline(record.title, record.repo), host.go)
            },
          },
        ]
      : []),
  ]
  // Sharing opens the public build route, which is addressed by the org and the project a run built.
  const link = record?.published ? story(t, record.org || host.org, record.project) : ''
  const sharing: MenuItems =
    signed && record?.project
      ? [
          record.published
            ? { key: 'unshare', label: say('Stop sharing'), icon: <Globe size={16} />, onSelect: () => void share(false) }
            : { key: 'share', label: say('Share publicly'), icon: <Globe size={16} />, description: say('Anyone with the link can read it'), onSelect: () => void share(true) },
          ...(link ? [{ key: 'link', label: copied === 'link' ? say('Copied') : say('Copy public link'), icon: <Copy size={16} />, description: link, onSelect: () => void copy('link', link) }] : []),
        ]
      : []

  const sendQueued = (qid: string) => {
    const item = queued.find((q) => q.id === qid)
    if (!item) return
    setQueued((prev) => prev.filter((q) => q.id !== qid))
    if (steering) {
      void act(() => tell(item.text))
      return
    }
    void act(() => carry(item.text))
  }

  const enqueue = () => {
    const words = compose(draft.trim(), files)
    if (!words) return
    setQueued((prev) => [...prev, { id: `q-${Date.now()}-${prev.length}`, text: words }])
    setDraft('')
    setFiles([])
  }

  useEffect(() => {
    if (!running || paused) return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running, paused])

  const toggleKeepAwake = async (on: boolean) => {
    setKeepAwake(on)
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
      if (on && nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen')
      } else if (!on && wakeLockRef.current?.release) {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    } catch {
      /* WakeLock API optional */
    }
  }

  const toggleDockPane = (kind: 'terminal' | 'preview' | 'diff' | 'files', label: string) => {
    if (!desk) setDesk(true)
    setSplitPanes((prev) => {
      if (prev.includes(kind)) {
        const next = prev.filter((k) => k !== kind)
        if (next.length === 1) {
          const single = next[0]!
          side.open({ kind: single, title: say(single.charAt(0).toUpperCase() + single.slice(1)) })
        }
        return next
      }
      const activeKind = side.tabs.find((x) => x.id === side.at)?.kind ?? ''
      const base = prev.length === 0 && activeKind && ['terminal', 'preview', 'diff', 'files'].includes(activeKind) && activeKind !== kind ? [activeKind] : prev
      const next = [...base, kind]
      if (next.length === 1) side.open({ kind, title: label })
      return next
    })
  }

  const elapsedSec = useMemo(() => {
    const startMs = record?.createdAt ? Date.parse(record.createdAt) : NaN
    if (!Number.isFinite(startMs)) return 0
    return Math.max(1, Math.floor((nowMs - startMs) / 1000))
  }, [record?.createdAt, nowMs])

  const elapsedLabel = useMemo(() => {
    const mins = Math.floor(elapsedSec / 60)
    const secs = elapsedSec % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }, [elapsedSec])

  const tokenLabel = useMemo(() => {
    const chars = events.reduce((sum, e) => sum + JSON.stringify(e.payload ?? '').length, 0)
    const tok = Math.max(100, Math.round(chars / 4))
    return tok >= 1000 ? `${(tok / 1000).toFixed(1)}k tokens` : `${tok} tokens`
  }, [events])

  const bgTaskCount = useMemo(
    () => shown.filter((c) => (c.kind === 'shell' || c.kind === 'step') && c.ran === 'running' && running).length,
    [shown, running],
  )

  const save = () =>
    void act(async () => {
      await rename(t, id, name)
      setNaming(false)
      detail.reload()
      return say('Renamed')
    })

  const placeholder = !signed
    ? say('Sign in to follow up')
    : waiting
      ? paused
        ? say('Pausing — the run is keeping its work…')
        : say('Stopping — the run is keeping its work…')
      : paused && held
        ? say('Continue this run with a follow up')
        : running
          ? setup
            ? say('Add a follow up for the setup agent')
            : say('Add a follow up')
          : finished
            ? record?.parent
              ? say('Follow up — continues the conversation')
              : say('Follow up — continues in a new run')
            : say('Reading this run…')

  const desk_ = (sheet: boolean) => (
    <Desk
      id={id}
      repo={record?.repo ?? ''}
      branch={record?.branch ?? ''}
      base={record?.base ?? ''}
      environment={record?.environment ?? ''}
      mode={mode}
      pr={pr}
      title={title}
      project={record?.project ?? ''}
      sandbox={record?.sandbox ?? ''}
      site={site}
      published={end.published}
      events={events}
      live={running}
      menu={[...manage, ...sharing]}
      refused={signed ? refused || (detail.error ? say(detail.error.message) : '') : say('Sign in to follow this run.')}
      retry={signed ? say('Retry') : say('Sign in')}
      onRetry={signed ? detail.reload : () => host.signIn?.()}
      side={side}
      sheet={sheet}
      onHide={() => setDesk(false)}
      envColumn={envColumn}
      splitPanes={splitPanes}
      onCloseSplitPane={(pid) => setSplitPanes((prev) => prev.filter((k) => k !== pid))}
      onExpandSplitPane={(pid) => {
        setSplitPanes([])
        side.open({ kind: pid, title: say(pid.charAt(0).toUpperCase() + pid.slice(1)) })
      }}
    />
  )

  const triggerButton = (
    <XStack
      render="button"
      aria-label={say('Manage this run')}
      items="center"
      gap="$1.5"
      maxW="100%"
      minW={0}
      px="$1.5"
      mx="$-1.5"
      py="$0.5"
      rounded="$2"
      hoverStyle={{ bg: '$hover' }}
    >
      <SizableText render="h1" size="$5" color="$ink" numberOfLines={1} minW={0}>
        {title}
      </SizableText>
      <ChevronDown size={14} opacity={0.7} />
    </XStack>
  )

  return (
    <XStack data-slot="run-split" display="grid" gridTemplateColumns="minmax(0, 1fr) auto" width="100%" height="100%" minH={0} minW={0}>
      <YStack data-slot="run" ref={split.main} {...pane} display="grid" gridTemplateRows="auto minmax(0, 1fr) auto" width="100%" height="100%" minH={0} minW={0}>
        <XStack px="$4" pt="$3" pb="$2" gap="$1.5" items="center" minH={44}>
          <YStack flex={1} minW={0} items="flex-start">
            <XStack items="center" gap="$1" maxW="100%" minW={0}>
              {signed && record ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>
                  <DropdownMenuContent align="start" minW={210}>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <SizableText size="$2" color="$ink" flex={1}>
                          {say('Open in')}
                        </SizableText>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent minW={170}>
                        <DropdownMenuItem
                          onSelect={() => {
                            window.open(`vscode://file/home/z/work/${record.repo.split('/').pop() || ''}`, '_blank')
                          }}
                        >
                          <SizableText size="$2" color="$ink">
                            VS Code
                          </SizableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            window.open(`cursor://file/home/z/work/${record.repo.split('/').pop() || ''}`, '_blank')
                          }}
                        >
                          <SizableText size="$2" color="$ink">
                            Cursor
                          </SizableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            side.open({ kind: 'terminal', title: say('Terminal') })
                            setDesk(true)
                          }}
                        >
                          <SizableText size="$2" color="$ink">
                            {say('Terminal')}
                          </SizableText>
                        </DropdownMenuItem>
                        {record.repo ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              window.open(pr.href || `https://github.com/${record.repo}`, '_blank', 'noopener,noreferrer')
                            }}
                          >
                            <SizableText size="$2" color="$ink">
                              GitHub
                            </SizableText>
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onSelect={() => void copy('path', record.repo || id)}>
                          <SizableText size="$2" color="$ink">
                            {say('Copy path')}
                          </SizableText>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      aria-label={say('Rename')}
                      onSelect={() => {
                        setName(title)
                        setNaming(true)
                      }}
                    >
                      <SizableText size="$2" color="$ink" flex={1}>
                        {say('Rename')}
                      </SizableText>
                      <DropdownMenuShortcut>R</DropdownMenuShortcut>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      aria-label={say('Fork')}
                      onSelect={() => {
                        void act(() => carry(again || headline(record.title, record.repo), 'follow'))
                      }}
                    >
                      <SizableText size="$2" color="$ink" flex={1}>
                        {say('Fork')}
                      </SizableText>
                      <DropdownMenuShortcut>F</DropdownMenuShortcut>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <SizableText size="$2" color="$ink" flex={1}>
                          {say('Transcript view')}
                        </SizableText>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent minW={160}>
                        {(
                          [
                            ['normal', say('Normal')],
                            ['thinking', say('Thinking')],
                            ['verbose', say('Verbose')],
                          ] as const
                        ).map(([val, label]) => (
                          <DropdownMenuItem key={val} onSelect={() => setTranscriptView(val)}>
                            <SizableText size="$2" color="$ink" flex={1}>
                              {label}
                            </SizableText>
                            {transcriptView === val ? <Check size={14} color="$blue10" /> : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <SizableText size="$2" color="$ink" flex={1}>
                          {say('Output style')}
                        </SizableText>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent minW={170}>
                        {(
                          [
                            ['default', say('Default')],
                            ['proactive', say('Proactive')],
                            ['concise', say('Concise')],
                            ['explanatory', say('Explanatory')],
                            ['learning', say('Learning')],
                          ] as const
                        ).map(([val, label]) => (
                          <DropdownMenuItem key={val} onSelect={() => setOutputStyle(val)}>
                            <SizableText size="$2" color="$ink" flex={1}>
                              {label}
                            </SizableText>
                            {outputStyle === val ? <Check size={14} color="$blue10" /> : null}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setOutputStyle('custom')}>
                          <SizableText size="$2" color="$ink" flex={1}>
                            {say('New style...')}
                          </SizableText>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onSelect={() => void copy('id', id)}>
                      <SizableText size="$2" color="$ink" flex={1}>
                        {copied === 'id' ? say('Copied') : say('Copy run id')}
                      </SizableText>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onSelect={() => {
                        const first = shown.find((c) => c.kind === 'said' && c.who === 'person')
                        schedule(first && 'text' in first ? first.text : headline(record.title, record.repo), host.go)
                      }}
                    >
                      <SizableText size="$2" color="$ink" flex={1}>
                        {say('Schedule this')}
                      </SizableText>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      aria-label={say('Archive')}
                      onSelect={() => {
                        if (running) void stop(t, id, 'Archived').catch(() => undefined)
                        host.go('')
                      }}
                    >
                      <SizableText size="$2" color="$ink" flex={1}>
                        {say('Archive')}
                      </SizableText>
                      <DropdownMenuShortcut>A</DropdownMenuShortcut>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      aria-label={say('Delete')}
                      variant="destructive"
                      onSelect={() => {
                        if (running) void stop(t, id, 'Deleted').catch(() => undefined)
                        host.go('')
                      }}
                    >
                      <SizableText size="$2" color="$red10" flex={1}>
                        {say('Delete')}
                      </SizableText>
                      <DropdownMenuShortcut>D</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DropdownMenu trigger={triggerButton} items={manage} />
              )}
            </XStack>
            <SizableText size="$1" color="$soft" numberOfLines={1} maxW="100%">
              {[state ? say(STATUS[state] ?? state) : detail.loading ? say('reading') : '', record?.repo, record?.branch, record?.published ? say('shared') : ''].filter(Boolean).join(' · ')}
            </SizableText>
          </YStack>
          {pr.href ? (
            // From the run's record, which the coding service writes; `pull` draws only a pull request address.
            <Out href={pr.href} label={say('Open pull request {pr}', { pr: pr.label })}>
              <XStack items="center" gap="$1.5" px="$2.5" py="$1.5" rounded="$3" borderWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                <GitPullRequest size={14} />
                <SizableText size="$2" color="$ink">
                  {pr.label}
                </SizableText>
                <ExternalLink size={12} opacity={0.6} />
              </XStack>
            </Out>
          ) : null}
          {sharing.length ? (
            <DropdownMenu
              trigger={
                <XStack render="button" aria-label={say('Share')} items="center" gap="$1.5" px="$2.5" py="$1.5" rounded="$3" borderWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                  <Share size={14} />
                  <SizableText size="$2" color="$ink">
                    {say('Share')}
                  </SizableText>
                </XStack>
              }
              items={sharing}
            />
          ) : null}
          {wide ? (
            <XStack items="center" gap="$0.5">
              <XStack
                render="button"
                aria-label={say('Toggle environment column')}
                aria-pressed={envColumn}
                onPress={() => {
                  if (!desk) setDesk(true)
                  setEnvColumn((v) => !v)
                }}
                p="$1.5"
                rounded="$2"
                bg={envColumn ? '$hover' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
              >
                <SlidersHorizontal size={15} opacity={envColumn ? 1 : 0.7} />
              </XStack>
              <XStack
                render="button"
                aria-label={say('Toggle terminal pane')}
                aria-pressed={splitPanes.includes('terminal')}
                onPress={() => toggleDockPane('terminal', say('Terminal'))}
                p="$1.5"
                rounded="$2"
                bg={splitPanes.includes('terminal') ? '$hover' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
              >
                <SquareTerminal size={15} opacity={splitPanes.includes('terminal') ? 1 : 0.7} />
              </XStack>
              <XStack
                render="button"
                aria-label={say('Toggle diff pane')}
                aria-pressed={splitPanes.includes('diff')}
                onPress={() => toggleDockPane('diff', say('Diff'))}
                p="$1.5"
                rounded="$2"
                bg={splitPanes.includes('diff') ? '$hover' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
              >
                <FileDiff size={15} opacity={splitPanes.includes('diff') ? 1 : 0.7} />
              </XStack>
              <XStack
                render="button"
                aria-label={say('Toggle browser pane')}
                aria-pressed={splitPanes.includes('preview')}
                onPress={() => toggleDockPane('preview', say('Preview'))}
                p="$1.5"
                rounded="$2"
                bg={splitPanes.includes('preview') ? '$hover' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
              >
                <Globe size={15} opacity={splitPanes.includes('preview') ? 1 : 0.7} />
              </XStack>
              <XStack
                render="button"
                aria-label={say('Toggle files pane')}
                aria-pressed={splitPanes.includes('files')}
                onPress={() => toggleDockPane('files', say('Files'))}
                p="$1.5"
                rounded="$2"
                bg={splitPanes.includes('files') ? '$hover' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
              >
                <Folder size={15} opacity={splitPanes.includes('files') ? 1 : 0.7} />
              </XStack>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <XStack render="button" aria-label={say('More workspace options')} p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
                    <MoreHorizontal size={15} opacity={0.7} />
                  </XStack>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" minW={220}>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!desk) setDesk(true)
                      setEnvColumn((v) => !v)
                    }}
                  >
                    <MessageSquare size={15} />
                    <SizableText size="$2" color="$ink" flex={1}>
                      {say('Side chat')}
                    </SizableText>
                    <DropdownMenuShortcut>Ctrl+;</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!desk) setDesk(true)
                      setEnvColumn(true)
                    }}
                  >
                    <Layers size={15} />
                    <SizableText size="$2" color="$ink" flex={1}>
                      {say('Background tasks')}
                    </SizableText>
                    <XStack px="$1.5" py="$0.5" rounded={99} bg="$hover">
                      <SizableText size="$1" color="$soft">
                        {String(bgTaskCount)}
                      </SizableText>
                    </XStack>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    preventCloseOnSelect
                    onSelect={() => {
                      void toggleKeepAwake(!keepAwake)
                    }}
                  >
                    <YStack flex={1} minW={0}>
                      <SizableText size="$2" color="$ink">
                        {say('Keep computer awake')}
                      </SizableText>
                      <SizableText size="$1" color="$soft">
                        {say('Only for this session')}
                      </SizableText>
                    </YStack>
                    <Switch checked={keepAwake} onCheckedChange={(v) => void toggleKeepAwake(v)} size="sm" aria-label={say('Keep computer awake')} />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </XStack>
          ) : null}
          <PanelToggle open={desk} onToggle={() => setDesk(!desk)} />
        </XStack>

        <Transcript
          cards={shown}
          view={transcriptView}
          queued={queued}
          onSendQueued={sendQueued}
          onOpen={look}
          onDiff={() => {
            side.open({ kind: 'diff', title: say('Diff') })
            setDesk(true)
          }}
          listen={signed ? listen : undefined}
          end={
            failed ? (
              <Failure onRetry={busy ? undefined : () => void act(() => carry(again, 'retry'))}>
                {end.problem
                  ? say('This run stopped before it finished.')
                  : // Only a run that pushed has work on its branch (turn.ts settled): one that failed before it
                    // changed anything left no branch, and Try again starts over from where it began.
                    kept.pushed
                    ? `${say('This run stopped with an error.')} ${say('Its work so far is on its branch.')}`
                    : `${say('This run stopped with an error.')} ${say('It saved nothing to its branch, so Try again starts over.')}`}
              </Failure>
            ) : null
          }
          // A paused run's agent was stopped where it stood; what it was running is cut off.
          live={running && !paused}
          header={
            hidden ? (
              <SizableText size="$1" color="$soft">
                {`${hidden === 1 ? say('{n} earlier turn is not shown.', { n: hidden }) : say('{n} earlier turns are not shown.', { n: hidden })} ${say('The run’s Git tab has everything it pushed.')}`}
              </SizableText>
            ) : null
          }
          onApprove={planned && earlier ? (p) => void act(() => carry(p, 'approve')) : undefined}
          // What dev asks its person while it works (its ask tool), answered here.
          onAnswer={signed ? (q, label) => void act(async () => (await reply(t, id, q, label, true), '')) : undefined}
          approving={busy}
          onVerdict={(v) => verdict(t, id, record?.project ?? '', v)}
          empty={
            signed ? (
              <SizableText size="$2" color="$soft">
                {detail.error
                  ? say(detail.error.message)
                  : detail.loading
                    ? say('Reading this run…')
                    : running
                      ? setup
                        ? say('Setting up environment')
                        : say('Starting…')
                      : say('Waiting for the run’s first step…')}
              </SizableText>
            ) : (
              <YStack gap="$3" items="flex-start">
                <SizableText size="$2" color="$soft">
                  {say('Sign in to follow this run.')}
                </SizableText>
                <Button size="sm" onPress={() => host.signIn?.()}>
                  {say('Sign in')}
                </Button>
              </YStack>
            )
          }
        />

        <YStack pb="$3" pt="$2" gap="$2">
          {/* At the text's width, like the composer under it. */}
          <YStack {...measure} gap="$2">
            {end.problem ? (
              <SizableText size="$1" color="$soft">
                {say('The branch is pushed, and the pull request could not be opened.')}
              </SizableText>
            ) : null}
            {note || (signed && refused) ? (
              <SizableText size="$1" color="$soft" role="status">
                {note || refused}
              </SizableText>
            ) : null}
            {plan.length ? (
              // One line until it is opened, so the steps never crowd the transcript.
              <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
                <XStack
                  render="button"
                  aria-label={say('Steps · {n}', { n: plan.length })}
                  aria-expanded={unfolded}
                  onPress={() => setUnfolded(!unfolded)}
                  px="$3"
                  py="$1.5"
                  gap="$2"
                  items="center"
                  hoverStyle={{ bg: '$hover' }}
                >
                  {unfolded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <SizableText size="$2" color="$ink">
                    {say('Steps · {n}', { n: plan.length })}
                  </SizableText>
                  {current && !unfolded ? (
                    <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1} text="end">
                      {current.name}
                    </SizableText>
                  ) : null}
                </XStack>
                {unfolded
                  ? plan.map((s) => {
                      const on = s === current
                      return (
                        <XStack key={s.name} items="center" gap="$2" px="$3" py="$1.5" borderTopWidth={1} borderColor="$borderColor">
                          <SizableText size="$2" color={s.done || on ? '$ink' : '$soft'}>
                            {s.done ? '✓' : on ? '●' : '○'}
                          </SizableText>
                          <SizableText size="$2" color={s.done ? '$soft' : '$ink'} numberOfLines={1}>
                            {s.name}
                          </SizableText>
                        </XStack>
                      )
                    })
                  : null}
              </YStack>
            ) : null}
            {setup && running && !seen ? <Onboarding onDone={() => setSeen(true)} /> : null}
            {running && !paused ? (
              <XStack items="center" gap="$2" px="$1">
                <SizableText size="$1" color="$orange10">
                  •·
                </SizableText>
                <SizableText size="$1" color="$soft">
                  {`${elapsedLabel} · ${tokenLabel} · ${say('Thinking')}`}
                </SizableText>
              </XStack>
            ) : null}
            {running ? (
              <XStack items="center" gap="$2" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor" flexWrap="wrap" rowGap="$1">
                <SizableText size="$2" color="$ink" flex={1} minW={160}>
                  {paused
                    ? kept.pushed
                      ? say('Paused — its work so far is on its branch.')
                      : say('Paused.')
                    : setup
                      ? span
                        ? say('Environment setup takes ~{minutes} minutes.', { minutes: span[0] === span[1] ? span[0] : `${span[0]}–${span[1]}` })
                        : say('Environment setup takes several minutes.')
                      : say('This run is still working.')}
                </SizableText>
                <Steer
                  onCommand={command}
                  withhold={[
                    ...(paused ? (['pause'] as const) : (['resume'] as const)),
                    ...(busy || waiting ? (['pause', 'resume', 'stop'] as const) : []),
                  ]}
                />
                <Button size="sm" disabled={notify} onPress={() => void ask()}>
                  {notify ? say('You will be notified') : say('Notify me')}
                </Button>
              </XStack>
            ) : null}
          </YStack>
          <Composer
            column
            value={draft}
            onChange={setDraft}
            onSend={send}
            ready={Boolean(draft.trim())}
            disabled={!signed || busy || waiting || !(running || finished)}
            placeholder={placeholder}
            label={steering ? say('Steer this run') : say('Follow up on this run')}
            field={{
              onKeyDown: (e: { key?: string; ctrlKey?: boolean; metaKey?: boolean; preventDefault?: () => void }) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && steering && draft.trim()) {
                  e.preventDefault?.()
                  enqueue()
                }
              },
            }}
            plus={{ upload: () => pick(files, setFiles, setNote, say) }}
            carried={carrying(files, setFiles)}
            // What a new run from here is made with; words that steer this run use neither.
            mind={signed && !steering ? mind : null}
            effort={signed && !steering ? pacing(mind) : null}
            limits={limits}
            voice={voice}
          />
        </YStack>
      </YStack>
      {desk && !wide ? desk_(true) : null}
      {desk && wide ? (
        <YStack
          data-slot="desk"
          ref={split.aside}
          {...pane}
          // A pane of its own beside the run's, the gutter between them (useSplit reads it as the inline-start margin).
          marginInlineStart={gap}
          position="relative"
          shrink={0}
          minH={0}
        >
          {split.grip ? (
            // In the gutter between the two panes, measured inside the pane's edge.
            <Gutter {...split.grip} label={say('Resize the side panel')} inset={pane.borderWidth} />
          ) : null}
          <SideProvider value={split.side}>{desk_(false)}</SideProvider>
        </YStack>
      ) : null}
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent maxW={480}>
          <DialogTitle>{say('Rename this run')}</DialogTitle>
          <Input
            autoFocus
            value={name}
            onChangeText={setName}
            aria-label={say('The run’s name')}
            maxLength={512}
            onKeyDown={(e: { key?: string }) => {
              if (e.key === 'Enter') save()
            }}
          />
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="outline" onPress={() => setNaming(false)}>
              {say('Cancel')}
            </Button>
            <Button size="sm" disabled={busy || !name.trim()} onPress={save}>
              {say('Save')}
            </Button>
          </XStack>
        </DialogContent>
      </Dialog>
    </XStack>
  )
}

/** What a setup run does, said once per browser the first time one is watched. */
function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const steps = [
    t('Explore, install and check the codebase'),
    t('Name the secrets it needs — you set their values'),
    t('Propose the environment for you to review and save'),
  ]
  return (
    <YStack gap="$3" p="$4" rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel">
      <SizableText size="$4" color="$ink">
        {t('Set up a cloud environment')}
      </SizableText>
      <SizableText size="$2" color="$soft">
        {[
          t('An environment lets every later run install, start, test and check its changes the way an engineer does.'),
          t('Setup is agent-led and takes several minutes.'),
          t('The agent will:'),
        ].join(' ')}
      </SizableText>
      <YStack gap="$1.5">
        {steps.map((s, i) => (
          <XStack key={s} gap="$3">
            <SizableText size="$2" color="$soft" width={12}>
              {String(i + 1)}
            </SizableText>
            <SizableText size="$2" color="$ink">
              {s}
            </SizableText>
          </XStack>
        ))}
      </YStack>
      <SizableText size="$2" color="$soft">
        {t('Interrupt anytime to steer the agent or ask it questions.')}
      </SizableText>
      <Button size="sm" onPress={onDone}>
        {t('Got it')}
      </Button>
    </YStack>
  )
}
