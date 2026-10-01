/**
 * A project's workspace, in the same window: the chat on the left, what it
 * built on the right.
 *
 *   bar     mark · project · history · chat toggle | Preview Files Code Layers |
 *           Share · Publish
 *   left    the project's runs as a conversation, suggestions, and the ask
 *   right   the deployed page, framed under its own bar (reload · page · device
 *           · open), and kept loaded while another view is open; the repository
 *           at the run's branch as a tree and as read-only code; the element a
 *           person picked
 *   dock    the run's console — its steps and its log, as they stream
 *
 * The edge between left and right is dragged, or moved with the arrow keys, to
 * size the chat, and the width is kept per browser; the right side keeps room
 * for a page whatever the chat asked for.
 *
 * A chat turn IS a coding run: `POST /v1/agent/coding` with the project, the
 * mode, and the previous run as `after`, so the next ask builds on the branch
 * the last one pushed. Files and Code read native git at that branch. The
 * preview is the project's own deployed address; a run's sandbox serves no
 * address the platform publishes, and nothing here invents one.
 *
 * A project in a workspace the platform made is published by the platform: a
 * template taken there reads `building` until its copy is `live` or failed, and
 * is read again until then; a run that publishes what it pushed says so on its
 * final status, which reads the project again and loads the preview again. Its
 * pull request is merged from beside its link.
 *
 * Derived from the Hanzo App v2 editor (github.com/hanzoai/build-v2), itself
 * derived from OSW Studio and DeepSite (MIT). See NOTICE.
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import {
  Clock,
  ExternalLink,
  MousePointerClick,
  PanelLeft,
  RefreshCcw,
  Share2,
  Upload,
} from '@hanzogui/lucide-icons-2'
import {
  Attachments,
  CHAT,
  Console,
  DEVICES,
  Feedback,
  FileTabs,
  FileTree,
  ModeSelect,
  PageSelect,
  PreviewFrame,
  ProjectChip,
  Suggestions,
  SUGGESTIONS,
  VIEWS,
  Views,
  Workspace,
  fold,
  type Attachment,
  type FrameEvent,
  type Line,
  type OpenFile,
  type PreviewHandle,
  type Verdict,
} from '@hanzo/ui/agents'
import { Composer, Message } from '@hanzo/ui/chat'
import { Button, Dialog, DialogContent, DialogTitle } from '@hanzo/ui'
import { HanzoMark } from '@hanzo/ui/product'
import { useEffect, useMemo, useRef, useState } from 'react'

import { read as pushed, type Pull } from './api/changes.ts'
import { start, type Mode } from './api/coding.ts'
import { blob, tree } from './api/git.ts'
import { deployments, name as repoName, ours, templates, type Project as Row } from './api/projects.ts'
import { list, message, stop, type Session } from './api/sessions.ts'
import { decode, outcome, pull, said, who } from './api/turn.ts'
import { verdict as record } from './api/verdict.ts'
import { useKept, useProjects, useRead, useRun } from './data.ts'
import { Merge } from './git.tsx'
import { Grip } from './grip.tsx'
import { useHost, useTarget } from './host.tsx'
import { MODES } from './landing.tsx'
import { Out } from './out.tsx'
import { pane as cut } from './pane.ts'
import { Publish, type Source } from './publish.tsx'
import { Attach, compose, Dictate, Files, type Attached } from './tools.tsx'

type ViewId = 'preview' | 'files' | 'code' | 'layers'

const LIVE = new Set(['running', 'paused'])

/** How often a project being published is read again, ms. */
const AGAIN = 5000

/** The chat's width beside the work, px: its default, and the two it is kept between. */
const CHAT_WIDTH = 360
const CHAT_FLOOR = 300
const CHAT_CEIL = 640
/** The Workspace's gutter between the chat and the work, and its margin right of the work, px ($3). */
const GUTTER = 12
/** What the work keeps beside the chat however wide the chat was asked to be, px. */
const WORK = 400 + 2 * GUTTER

/** One run in the conversation: what was asked, and what it came to. */
function Turn({ run, open, onOpen, project }: { run: Session; open: boolean; onOpen: () => void; project: string }) {
  const t = useTarget()
  const [v, setV] = useState<Verdict>(null)
  const [note, setNote] = useState('')
  return (
    <YStack gap="$2">
      <Message role="user">
        <SizableText size="$2" color="$ink">
          {run.title || 'Untitled run'}
        </SizableText>
      </Message>
      <Message
        role="assistant"
        busy={LIVE.has(run.status)}
        actions={
          <XStack items="center" gap="$2">
            <Feedback
              text={run.title}
              verdict={v}
              onVerdict={(next) => {
                setV(next)
                record(t, run.id, project, next).catch((e: unknown) => {
                  setV(null)
                  setNote((e as Error).message)
                })
              }}
            />
            {note ? (
              <SizableText size="$1" color="$soft">
                {note}
              </SizableText>
            ) : null}
            {!open ? (
              <XStack render="button" onPress={onOpen} hitSlop={8}>
                <SizableText size="$1" color="$soft" textDecorationLine="underline">
                  Show steps
                </SizableText>
              </XStack>
            ) : null}
          </XStack>
        }
      >
        <SizableText size="$2" color="$ink">
          {run.status === 'done' ? 'Done.' : run.status === 'error' ? 'This run hit an error.' : run.status === 'stopped' ? 'Stopped.' : 'Working…'}
        </SizableText>
      </Message>
    </YStack>
  )
}

export function Project({ slug }: { slug: string }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const all = useProjects(t, signed)
  const project: Row | null = all.value.find((p) => p.slug === slug) ?? null
  // A project that has never served reads `building` while it is published, and
  // is read again until it is live or its build failed.
  const building = project?.status === 'building'
  const failed = project?.status === 'error'
  const { reload: again } = all
  useEffect(() => {
    if (!building) return
    const every = setInterval(again, AGAIN)
    return () => clearInterval(every)
  }, [building, again])
  // Why the build failed is its latest deployment's to say.
  const failure = useRead(failed ? () => deployments(t, slug) : null, [], [t, slug, failed, project?.updated])

  const listed = useRead(signed ? () => list(t, { kind: 'coding', project: slug, limit: 50 }) : null, [] as Session[], [t, signed, slug])
  // Only the runs on this project's own repository: a record can be moved into
  // any project, and a run's branch is what Files, Code and Publish read.
  const runs = { ...listed, value: listed.value.filter((r) => ours(r.repo, project?.repo ?? '')) }
  const ordered = useMemo(() => [...runs.value].reverse(), [listed.value, project?.repo])
  const [chosen, setChosen] = useState<string | null>(null)
  const current = chosen ?? runs.value[0]?.id ?? null
  const run = useRun(t, current)
  const end = outcome(run.events)
  const pr = pull(run.record?.pr ?? '', run.record?.repo ?? '')
  const running = LIVE.has(run.status || end.status)

  const [view, setView] = useKept<ViewId>(`hanzo.build.view.${slug}`, 'preview')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [collapsed, setCollapsed] = useKept('hanzo.build.chat', false)
  const [split, setSplit] = useKept('hanzo.build.split', CHAT_WIDTH)
  // The workspace's width, which bounds the chat so the work keeps its room.
  const [room, setRoom] = useState(0)
  const most = room ? Math.max(CHAT_FLOOR, Math.min(CHAT_CEIL, room - WORK)) : CHAT_CEIL
  const across = Math.min(most, Math.max(CHAT_FLOOR, split))
  // Below md the chat and the work take turns, and Chat is one more view to switch back to.
  const [pane, setPane] = useState<'chat' | 'view'>('chat')
  const wide = useMedia().md
  const [dock, setDock] = useKept('hanzo.build.dock', 36)
  const [dismissed, setDismissed] = useKept(`hanzo.build.hints.${slug}`, false)
  const [mode, setMode] = useKept<Mode>('hanzo.build.mode', 'build')
  const [page, setPage] = useState('/')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<Attachment[]>([])
  const [attached, setAttached] = useState<Attached[]>([])
  const [bridge, setBridge] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pageLines, setPageLines] = useState<Line[]>([])
  const [history, setHistory] = useState(false)
  const [publish, setPublish] = useState<Source | null>(null)
  const [switcher, setSwitcher] = useState(false)
  const frame = useRef<PreviewHandle | null>(null)

  // What was published may be new files at the same address: the project is read
  // for its address, and the frame loads again.
  const fresh = () => {
    again()
    frame.current?.reload()
  }

  // The open run's final status says when it published what it pushed. That is
  // narration, which any member can write, so it is the cue to read the project
  // and never the address framed; one already there when the run was first read
  // is not news.
  const heard = useRef<{ run: string | null; at: number }>({ run: null, at: 0 })
  useEffect(() => {
    if (!run.record) return
    if (heard.current.run !== current) {
      heard.current = { run: current, at: end.published }
      return
    }
    if (end.published <= heard.current.at) return
    heard.current.at = end.published
    fresh()
    // `fresh` reads what it needs when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, run.record, end.published])

  // Where the open run's pull request stands on the forge: Merge is offered while it is open.
  const proposal = useRead<{ run: string; pull: Pull | null } | null>(
    signed && current && pr.href ? () => pushed(t, current).then((c) => ({ run: current, pull: c.pull })) : null,
    null,
    [t, signed, current, pr.href],
  )
  const proposing = proposal.value?.run === current && proposal.value.pull?.state === 'open'
  // Files is drawn again after a merge, from what the forge holds now.
  const [round, setRound] = useState(0)

  // Files and Code: native git, at the branch the open run pushed (or the project's own).
  const repo = project?.repo ? repoName(project.repo) : ''
  const ref = run.record?.branch || project?.branch || 'main'
  const [files, setFiles] = useState<OpenFile[]>([])
  const [file, setFile] = useState<string | null>(null)
  useEffect(() => {
    setFiles([])
    setFile(null)
  }, [repo, ref])

  const openFile = async (path: string) => {
    setFile(path)
    setView('code')
    if (files.some((f) => f.path === path)) return
    setFiles((was) => [...was, { path, readOnly: true }])
    try {
      const b = await blob(t, repo, ref, path)
      const content = b.binary ? '' : b.truncated ? '' : b.text
      const error = b.binary ? 'A binary file — nothing to show as text.' : b.truncated ? 'Past the 1 MiB view cap — clone the repository to read it.' : undefined
      setFiles((was) => was.map((f) => (f.path === path ? { ...f, content, error } : f)))
    } catch (e) {
      setFiles((was) => was.map((f) => (f.path === path ? { ...f, error: (e as Error).message } : f)))
    }
  }

  // Pages: the HTML files at the repository's root, as the page picker's list.
  const root = useRead(repo ? () => tree(t, repo, ref, '') : null, [], [t, repo, ref])
  const pages = useMemo(
    () => [
      { id: '/', label: 'Homepage' },
      ...root.value
        .filter((e) => !e.dir && /\.html?$/i.test(e.name) && !/^index\.html?$/i.test(e.name))
        .map((e) => ({ id: `/${e.path}`, label: e.name.replace(/\.html?$/i, '') })),
    ],
    [root.value],
  )

  // A project taken from a starter, not published and not being, shows the
  // starter's own live page, which is what the copy is until its first publish.
  const forked = project && !project.live && !building && !failed ? project.forked : ''
  const starters = useRead(forked ? () => templates(t) : null, [], [t.api, forked])
  const starter = forked ? starters.value.find((s) => s.slug === forked && s.demo) : undefined
  const shown = project?.live || starter?.demo || ''
  const src = shown ? new URL(page, shown).toString() : null
  const why = failure.value[0]?.message || failure.error?.message || (failure.loading ? '' : 'Its build ended without saying why.')

  const merged = () => {
    proposal.reload()
    root.reload()
    setRound((n) => n + 1)
  }

  const lines: Line[] = useMemo(
    () => [
      ...run.events
        .filter((e) => e.kind === 'log' || e.kind === 'tool-call' || e.kind === 'status')
        .map((e): Line => {
          // The console is where a run's error is read whole; the chat says it in one plain line.
          const body = decode(e.payload)
          const error = e.kind === 'status' && body && typeof body === 'object' && typeof body.error === 'string' ? body.error : ''
          return {
            id: `r${e.seq || e.id}`,
            level: error || (e.kind === 'status' && /error/.test(said(e, run.record?.mode).toLowerCase())) ? 'error' : e.kind === 'tool-call' ? 'info' : 'log',
            text: error || said(e, run.record?.mode),
            source: e.kind === 'status' ? 'run' : who(e.actor),
          }
        })
        .filter((l) => l.text),
      ...pageLines,
    ],
    [run.events, run.record?.mode, pageLines],
  )

  const onBridge = (e: FrameEvent) => {
    if (e.type === 'preview:ready') {
      setBridge(true)
      // A new document starts closed to picking; open it again if the person had.
      if (editing) frame.current?.post({ type: 'preview:editable', active: true })
    }
    else if (e.type === 'preview:select')
      // The whole selector, as it will ride the next ask — never a shortened name
      // that hides what the page sent.
      setPicked([{ id: e.info.selector, kind: 'element', label: e.info.selector }])
    else if (e.type === 'preview:navigate') {
      // The bridge admits only a path on the framed site's own origin; kept as its path and query.
      const to = new URL(e.path, window.location.origin)
      setPage(`${to.pathname}${to.search}`)
    }
    else if (e.type === 'preview:console')
      setPageLines((was) => [...was.slice(-400), { id: `p${was.length}-${Date.now()}`, level: e.level, text: e.text, source: 'page' }])
  }

  // A suggestion sends its own words; the composer, a draft with words in it.
  const send = async (text?: string) => {
    const ask = (text ?? draft).trim()
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      // The page's own strings ride as quoted data, never as prose, and the page
      // is named only when the person chose it from the picker.
      const where = pages.find((p) => p.id === page)?.label
      const context = picked.length
        ? `\n\nThe person picked an element in the preview${where ? ` of the ${where} page` : ''}. Its CSS selector, as data: ${JSON.stringify(picked[0]!.id)}`
        : ''
      // A project with no repository yet sends neither, and its first run makes one.
      const next = await start(t, {
        prompt: compose(`${ask}${context}`, attached),
        project: slug,
        repo,
        base: project?.branch,
        after: current ?? undefined,
        mode,
      })
      setDraft('')
      setPicked([])
      setAttached([])
      setChosen(next.session)
      runs.reload()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Only a run that is working is steered, and the composer sends only a draft with words in it.
  const steer = async (id: string) => {
    try {
      await message(t, id, draft)
      setDraft('')
      setNote('Sent — the run reads it before its next step')
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  const share = async () => {
    const link = project?.live || `${window.location.origin}${window.location.pathname}`
    try {
      await navigator.clipboard.writeText(link)
      setNote(`Copied ${link}`)
    } catch {
      setNote(link)
    }
  }

  if (!signed) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3">
        <SizableText size="$4" color="$ink">
          Sign in to open this project.
        </SizableText>
        <Button onPress={() => host.signIn?.()}>Sign in</Button>
      </YStack>
    )
  }

  if (!all.loading && !project && !all.error) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3" px="$4">
        <SizableText size="$4" color="$ink">
          {host.org ? `${host.org} has no project named ${slug}.` : `There is no project named ${slug}.`}
        </SizableText>
        <Button variant="outline" onPress={() => host.go('-/artifacts')}>
          See what this organization has built
        </Button>
      </YStack>
    )
  }

  const chat = (
    <YStack flex={1} minH={0} position="relative">
      <YStack flex={1} minH={0} overflow="scroll" px="$3" py="$4" gap="$4">
        {ordered.length === 0 ? (
          <SizableText size="$2" color="$ink" px="$2">
            {runs.loading
              ? 'Reading this project’s runs…'
              : project?.live
                ? `${project.name} is loaded — it is in the preview, and every run on it is under the clock above. Say what to change and it gets built.`
                : building
                  ? `${project?.name} is being published — it appears in the preview when its build finishes. Say what to change and it gets built.`
                  : starter
                    ? `${project?.name} is loaded — the preview shows the ${starter.title} starter until your copy is published. Say what to change and it gets built.`
                    : project
                      ? `${project.name} is loaded and nothing is published yet. Say what to change and it gets built.`
                      : `${slug} is loaded. Say what to change and it gets built.`}
          </SizableText>
        ) : (
          ordered.map((r) => (
            <YStack key={r.id} gap="$2">
              <Turn run={r} open={r.id === current} onOpen={() => setChosen(r.id)} project={slug} />
              {r.id === current ? (
                <YStack gap="$1" pl="$2" borderLeftWidth={1} borderColor="$borderColor">
                  {fold(run.events.map((e) => ({ kind: e.kind, actor: who(e.actor), seq: e.seq, id: e.id, text: said(e, run.record?.mode) })).filter((b) => b.text)).map((b) => (
                    <SizableText key={b.key} size="$1" color="$soft">
                      {b.text}
                    </SizableText>
                  ))}
                  {pr.href ? (
                    <XStack items="center" gap="$2" flexWrap="wrap">
                      <Out href={pr.href} label={`Open pull request ${pr.label}`}>
                        <SizableText size="$1" color="$ink" textDecorationLine="underline">
                          Pull request {pr.label}
                        </SizableText>
                        <ExternalLink size={11} />
                      </Out>
                      <Merge session={r.id} open={proposing} onMerged={merged} />
                    </XStack>
                  ) : null}
                </YStack>
              ) : null}
            </YStack>
          ))
        )}
      </YStack>
      <YStack px="$3" pb="$3" gap="$2">
        {!dismissed && !running ? <Suggestions items={SUGGESTIONS} onPick={(s) => void send(s)} onDismiss={() => setDismissed(true)} /> : null}
        {/* A run from a workspace always runs in the sandbox, so every mode is honoured there. */}
        {note ? (
          <SizableText size="$1" color="$soft" role="status">
            {note}
          </SizableText>
        ) : null}
        {picked.length ? <Attachments items={picked} onRemove={() => setPicked([])} /> : null}
        {attached.length ? (
          <XStack gap={6} flexWrap="wrap">
            <Files files={attached} onFiles={setAttached} />
          </XStack>
        ) : null}
        <Composer
          {...cut}
          value={draft}
          onChange={setDraft}
          onSend={() => void (current && running ? steer(current) : send())}
          onStop={
            current
              ? () =>
                  void stop(t, current).then(
                    () => setNote('Stop requested — the run keeps its work on its branch'),
                    (e: unknown) => setNote((e as Error).message),
                  )
              : undefined
          }
          busy={busy || (running && !draft.trim())}
          rows={3}
          placeholder={running ? 'Steer this run' : 'Ask Hanzo for edits'}
          label="Ask Hanzo for edits"
        >
          <Attach files={attached} onFiles={setAttached} onNote={setNote} />
          <XStack flex={1} />
          <ModeSelect modes={MODES} value={mode} onChange={(m) => setMode(m as Mode)} self="center" />
          <Dictate onText={(said) => setDraft((d) => (d ? `${d} ${said}` : said))} onNote={setNote} />
        </Composer>
      </YStack>
      {/* In the gutter between the chat and the work. */}
      {wide && !collapsed ? (
        <Grip
          side="left"
          span={across}
          floor={CHAT_FLOOR}
          ceil={most}
          reset={CHAT_WIDTH}
          onSpan={setSplit}
          label="Resize the chat"
          r={-GUTTER}
          width={GUTTER}
        />
      ) : null}
    </YStack>
  )

  // The preview stays loaded while another view is open, so coming back to it
  // is the page as it was left.
  const preview = (
    <YStack data-slot="preview" flex={1} minH={0} minW={0} gap="$2" display={view === 'preview' ? 'flex' : 'none'}>
      {/* The framed page's own controls, beside it: reload, the page, the width, and the page in a tab of its own. */}
      <XStack data-slot="preview-bar" items="center" gap="$1.5" minW={0} shrink={0} $max-md={{ px: '$2' }}>
        <XStack render="button" aria-label="Reload the preview" onPress={() => frame.current?.reload()} p="$1.5" rounded="$3" hoverStyle={{ bg: '$hover' }}>
          <RefreshCcw size={16} />
        </XStack>
        <PageSelect pages={pages} value={page} onChange={setPage} shrink={1} />
        <XStack flex={1} />
        <Views views={DEVICES} value={device} onChange={(d) => setDevice(d as 'desktop' | 'mobile')} label="Device" labels="none" />
        {src ? (
          <Out href={src} label="Open in a new tab">
            <XStack p="$1.5" rounded="$3" hoverStyle={{ bg: '$hover' }}>
              <ExternalLink size={16} />
            </XStack>
          </Out>
        ) : null}
      </XStack>
      <PreviewFrame
        ref={frame}
        src={src}
        title={`${project?.name ?? slug} preview`}
        device={device}
        onBridge={onBridge}
        empty={
          <YStack items="center" gap="$2" p="$6">
            <SizableText size="$3" color="$ink">
              {building ? (project?.forked ? 'Publishing your copy…' : 'Publishing…') : failed ? 'Publishing failed' : 'Nothing deployed yet'}
            </SizableText>
            <SizableText size="$2" color="$soft" text="center">
              {building ? 'Its page appears here when the build finishes.' : failed ? why : 'Publish this project and its page appears here.'}
            </SizableText>
          </YStack>
        }
        toolbar={
          bridge ? (
            <XStack
              render="button"
              aria-pressed={editing}
              aria-label={editing ? 'Stop picking elements' : 'Pick an element to edit'}
              onPress={() => {
                const next = !editing
                setEditing(next)
                frame.current?.post({ type: 'preview:editable', active: next })
              }}
              p="$2"
              rounded="$10"
            >
              <MousePointerClick size={16} />
            </XStack>
          ) : undefined
        }
      />
    </YStack>
  )

  const body =
    view === 'preview' ? null : view === 'files' ? (
      repo ? (
        <FileTree
          key={round}
          load={async (dir) => (await tree(t, repo, ref, dir)).map((e) => ({ path: e.path, kind: e.dir ? ('dir' as const) : ('file' as const) }))}
          value={file}
          onSelect={(p) => void openFile(p)}
          label={`${repo} at ${ref}`}
        />
      ) : (
        <SizableText size="$2" color="$soft" p="$4">
          This project has no repository yet. Its first run creates one.
        </SizableText>
      )
    ) : view === 'code' ? (
      <FileTabs
        files={files}
        value={file}
        onSelect={setFile}
        onClose={(p) => {
          setFiles((was) => was.filter((f) => f.path !== p))
          if (file === p) setFile(null)
        }}
        empty={
          <SizableText size="$2" color="$soft" p="$4">
            Open a file from Files. Code here is read at {ref}; ask in the chat to change it.
          </SizableText>
        }
      />
    ) : (
      <YStack p="$4" gap="$2">
        {picked.length ? (
          picked.map((p) => (
            <SizableText key={p.id} size="$2" color="$ink">
              {p.label} — {p.id}
            </SizableText>
          ))
        ) : (
          <SizableText size="$2" color="$soft">
            {bridge
              ? 'Pick an element in the preview to see it here and attach it to your next ask.'
              : 'Layers are read through the preview bridge, and this page does not run it. Its elements cannot be listed from here.'}
          </SizableText>
        )}
      </YStack>
    )

  return (
    <>
      <Workspace
        start={
          // Shrinks with the bar, so the project's name truncates rather than
          // running under Publish on a phone.
          <XStack items="center" gap="$2" minW={0} shrink={1}>
            <XStack render="button" aria-label="All runs" onPress={() => host.go('')} p="$1" shrink={0}>
              <HanzoMark size={20} />
            </XStack>
            <ProjectChip name={project?.name ?? slug} onPress={() => setSwitcher(true)} />
            <XStack render="button" aria-label="History" onPress={() => setHistory(true)} p="$1.5" rounded="$3" shrink={0} hoverStyle={{ bg: '$hover' }}>
              <Clock size={16} />
            </XStack>
            {/* The chat folds away beside the work; on a phone the views switch to it instead. */}
            <XStack
              render="button"
              aria-label={collapsed ? 'Show the chat' : 'Hide the chat'}
              aria-pressed={!collapsed}
              onPress={() => setCollapsed(!collapsed)}
              p="$1.5"
              rounded="$3"
              shrink={0}
              hoverStyle={{ bg: '$hover' }}
              $max-md={{ display: 'none' }}
            >
              <PanelLeft size={16} />
            </XStack>
          </XStack>
        }
        middle={
          <Views
            views={[...VIEWS, CHAT]}
            value={pane === 'chat' && !wide ? 'chat' : view}
            onChange={(v) => {
              if (v === 'chat') return setPane('chat')
              setView(v as ViewId)
              setPane('view')
            }}
            label="View"
          />
        }
        end={
          <XStack items="center" gap="$2">
            {/* Share gives way on a phone, where Publish is the one that matters. */}
            <XStack display="none" $md={{ display: 'flex' }}>
              <Button variant="outline" size="sm" onPress={() => void share()}>
                <Share2 size={14} /> Share
              </Button>
            </XStack>
            <Button
              size="sm"
              disabled={!project?.repo}
              onPress={() =>
                project &&
                setPublish({ repo: project.repo, title: project.name, ref, name: project.slug, project: project.slug })
              }
            >
              <Upload size={14} /> Publish
            </Button>
          </XStack>
        }
        chat={chat}
        dock={
          <Console
            lines={lines}
            height={dock}
            onHeight={setDock}
            onClear={() => setPageLines([])}
            status={run.status || end.status || undefined}
            label="Console"
          />
        }
        collapsed={collapsed}
        pane={pane}
        width={across}
        onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
      >
        {preview}
        {body}
      </Workspace>

      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent maxW={480}>
          <DialogTitle>Runs on {project?.name ?? slug}</DialogTitle>
          <YStack gap="$1">
            {runs.value.length === 0 ? (
              <SizableText size="$2" color="$soft">
                No runs yet.
              </SizableText>
            ) : (
              runs.value.map((r) => (
                <XStack
                  key={r.id}
                  render="button"
                  onPress={() => {
                    setChosen(r.id)
                    setHistory(false)
                  }}
                  justify="space-between"
                  px="$2"
                  py="$1.5"
                  rounded="$3"
                  hoverStyle={{ bg: '$hover' }}
                >
                  <SizableText size="$2" color="$ink" numberOfLines={1} flex={1}>
                    {r.title || 'Untitled run'}
                  </SizableText>
                  <SizableText size="$1" color="$soft">
                    {r.status}
                  </SizableText>
                </XStack>
              ))
            )}
          </YStack>
        </DialogContent>
      </Dialog>

      <Dialog open={switcher} onOpenChange={setSwitcher}>
        <DialogContent maxW={420}>
          <DialogTitle>Projects</DialogTitle>
          <YStack gap="$1" maxH={420} overflow="scroll">
            {all.value.map((p) => (
              <XStack
                key={p.slug}
                render="button"
                onPress={() => {
                  setSwitcher(false)
                  host.go(p.slug)
                }}
                px="$2"
                py="$1.5"
                rounded="$3"
                bg={p.slug === slug ? '$hover' : undefined}
                hoverStyle={{ bg: '$hover' }}
              >
                <SizableText size="$2" color="$ink" numberOfLines={1}>
                  {p.name}
                </SizableText>
              </XStack>
            ))}
          </YStack>
        </DialogContent>
      </Dialog>

      <Publish source={publish} onClose={() => setPublish(null)} onLive={fresh} />
    </>
  )
}
