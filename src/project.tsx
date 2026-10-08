/**
 * A project's workspace, in the same window: the chat on the left, what it
 * built on the right.
 *
 * A project is a repository on the forge, addressed `<org>/<repo>`; the site it
 * publishes to, when it has one, is the org's project row on that repository
 * (or of the same name). A deployed site with no repository on the forge is
 * opened by its slug (Artifacts), and works the same way.
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
 * pull request is merged from beside its link. A build that failed, or that has
 * run past STALL, says so in the preview with the platform's reason and offers
 * Publish again, which builds the project's repository at its branch.
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
import { codebases, one, type Codebase } from './api/codebases.ts'
import { start, type Mode } from './api/coding.ts'
import { blob, tree } from './api/git.ts'
import { declare } from './api/platform.ts'
import { address, deployments, name as repoName, ours, templates, type Project as Row } from './api/projects.ts'
import { list, message, stop, type Session } from './api/sessions.ts'
import { decode, outcome, pull, said, who } from './api/turn.ts'
import { verdict as record } from './api/verdict.ts'
import { useKept, useProjects, useRead, useRun } from './data.ts'
import { Merge } from './git.tsx'
import { Grip } from './grip.tsx'
import { useHost, useTarget } from './host.tsx'
import { MODES } from './landing.tsx'
import { Out } from './out.tsx'
import { Publish, type Source } from './publish.tsx'
import { path } from './route.ts'
import { Attach, compose, Dictate, Files, type Attached } from './tools.tsx'

type ViewId = 'preview' | 'files' | 'code' | 'layers'

const LIVE = new Set(['running', 'paused'])

/** How often a project being published is read again, ms. */
const AGAIN = 5000

/** How long a build may run before the builder offers to publish again, s. A template's build takes a few minutes. */
const STALL = 10 * 60

/** The chat's width beside the work, px: its default, and the two it is kept between. */
const CHAT_WIDTH = 360
const CHAT_FLOOR = 300
const CHAT_CEIL = 640
/** The Workspace's gutter between the chat and the work, and its margin right of the work, px ($3). */
const GUTTER = 12
/** What the work keeps beside the chat however wide the chat was asked to be, px. */
const WORK = 400 + 2 * GUTTER

/** What a workspace is opened on: a repository on the forge, or a deployed site by its slug. */
export type Where = { slug: string } | { org: string; name: string }

/** Whether the site `p` is the repository `r`'s: built from it, or named as it is. */
export function siteOf(p: Row, r: { org: string; name: string }): boolean {
  const want = `${r.org}/${r.name}`.toLowerCase()
  return (p.repo !== '' && address(p.repo).toLowerCase() === want) || p.slug === r.name.toLowerCase()
}

/** A site's slug for a repository's name: lowercase letters, digits and hyphens, at most 40. */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

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

export function Project({ at }: { at: Where }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const all = useProjects(t, signed)
  // The repository the address names, and the forge's record of it.
  const named = 'slug' in at ? null : at
  const forge = useRead(named && signed ? () => one(t, named.name) : null, null as Codebase | null, [t, signed, named?.name])
  const project: Row | null = all.value.find((p) => (named ? siteOf(p, named) : 'slug' in at && p.slug === at.slug)) ?? null
  // The site this workspace publishes to: the project's, or the repository's name as one.
  const slug = project?.slug ?? ('slug' in at ? at.slug : slugOf(named?.name ?? ''))
  const title = project?.name ?? named?.name ?? slug
  // A project that has never served reads `building` while it is published, and
  // is read again until it is live or its build failed.
  const building = project?.status === 'building'
  const failed = project?.status === 'error'
  const { reload: again } = all
  // The clock a build is measured against, moved each time the project is read again.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!building) return
    const every = setInterval(() => {
      again()
      setNow(Date.now())
    }, AGAIN)
    return () => clearInterval(every)
  }, [building, again])
  // When the build began, and why it failed, are its latest deployment's to say.
  const failure = useRead(building || failed ? () => deployments(t, slug) : null, [], [t, slug, building, failed, project?.updated])
  const latest = failure.value[0]
  const began = latest?.status === 'building' ? latest.created : 0
  const ran = began ? Math.max(0, Math.floor(now / 1000) - began) : 0
  const stalled = building && ran > STALL
  // Publish again: the project's repository, built at its branch, the way Publish builds it.
  const [redo, setRedo] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' })
  // The repository's clone address: the forge's for a repository, the site's own otherwise.
  const clone = named ? (forge.value?.clone ?? '') : (project?.repo ?? '')
  const home = named ? (forge.value?.branch ?? 'main') : project?.branch || 'main'
  const retry = async () => {
    if (!clone || redo.busy) return
    setRedo({ busy: true, error: '' })
    try {
      await declare(t, { repo: clone, ref: home, name: slug, project: slug, mode: 'branch' })
      setNow(Date.now())
      again()
      setRedo({ busy: false, error: '' })
    } catch (e) {
      setRedo({ busy: false, error: (e as Error).message })
    }
  }

  // The site's runs, or the org's when the repository has no site yet.
  const sited = !named || Boolean(project)
  const listed = useRead(
    signed ? () => list(t, sited ? { kind: 'coding', project: slug, limit: 50 } : { kind: 'coding', limit: 50 }) : null,
    [] as Session[],
    [t, signed, slug, sited],
  )
  // Only the runs on this project's own repository: a record can be moved into
  // any project, and a run's branch is what Files, Code and Publish read.
  const mine = (r: Session) => (named ? ours(r.repo, `${named.org}/${named.name}`) && Boolean(r.repo) : ours(r.repo, project?.repo ?? ''))
  const runs = { ...listed, value: listed.value.filter(mine) }
  const ordered = useMemo(() => [...runs.value].reverse(), [listed.value, project?.repo, named?.org, named?.name])
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
  // A workspace too narrow for the chat at its floor and the work at its room
  // (a tablet beside the host's column) shows the work, and the chat when asked:
  // never both cut. Asked here is for this visit; the kept choice is the wide one's.
  const cramped = wide && room > 0 && room < CHAT_FLOOR + WORK
  const [asked, setAsked] = useState(false)
  const shut = cramped ? !asked : collapsed
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
  const repos = useRead(switcher && signed ? () => codebases(t) : null, [] as Codebase[], [t, switcher, signed])
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
  const repo = named ? named.name : project?.repo ? repoName(project.repo) : ''
  const ref = run.record?.branch || home
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
        // A repository with no site yet runs on the repository alone.
        project: project?.slug,
        repo,
        base: named ? forge.value?.branch : project?.branch,
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

  // A repository of another organization is opened in that one.
  if (named && host.org && named.org.toLowerCase() !== host.org.toLowerCase()) {
    const member = host.memberships?.some((m) => m.toLowerCase() === named.org.toLowerCase()) && host.chooseOrg
    return (
      <YStack flex={1} items="center" justify="center" gap="$3" px="$4">
        <SizableText size="$4" color="$ink" text="center">
          {`${named.org}/${named.name} is in ${named.org}, and you are working in ${host.org}.`}
        </SizableText>
        {member ? (
          <Button variant="outline" onPress={() => host.chooseOrg?.(named.org)}>
            {`Switch to ${named.org}`}
          </Button>
        ) : (
          <Button variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: 'projects' }))}>
            See this organization’s projects
          </Button>
        )}
      </YStack>
    )
  }

  if (named ? !forge.loading && !forge.value : !all.loading && !project && !all.error) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3" px="$4">
        <SizableText size="$4" color="$ink" text="center">
          {named
            ? forge.error && !/not found|404/i.test(forge.error.message)
              ? forge.error.message
              : `${named.org} has no repository named ${named.name}.`
            : host.org
              ? `${host.org} has no project named ${slug}.`
              : `There is no project named ${slug}.`}
        </SizableText>
        <Button variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: named ? 'projects' : 'artifacts' }))}>
          {named ? 'See this organization’s projects' : 'See what this organization has built'}
        </Button>
      </YStack>
    )
  }

  const chat = (
    <YStack data-slot="project-chat" flex={1} minH={0} position="relative">
      {/* Its first line sits level with the preview's toolbar beside it. */}
      <YStack flex={1} minH={0} overflow="scroll" px="$3" pt="$2" pb="$4" gap="$4" $md={{ pr: 0 }}>
        {ordered.length === 0 ? (
          <SizableText size="$2" color="$ink">
            {runs.loading
              ? 'Reading this project’s runs…'
              : project?.live
                ? `${project.name} is loaded — it is in the preview, and every run on it is under the clock above. Say what to change and it gets built.`
                : stalled
                  ? `${project?.name} has been publishing for ${Math.floor(ran / 60)} minutes without finishing. Publish it again from the preview, or say what to change and it gets built.`
                  : failed
                    ? `${project?.name} could not be published. Publish it again from the preview, or say what to change and it gets built.`
                    : building
                  ? `${project?.name} is being published — it appears in the preview when its build finishes. Say what to change and it gets built.`
                  : starter
                    ? `${project?.name} is loaded — the preview shows the ${starter.title} starter until your copy is published. Say what to change and it gets built.`
                    : project
                      ? `${project.name} is loaded and nothing is published yet. Say what to change and it gets built.`
                      : named
                        ? `${named.org}/${named.name} is open on ${home}. Say what to change and it gets built there.`
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
      {/* The ask: flush with the column's foot, as wide as the column less its gutter, the chips above it on the same edges. */}
      <YStack data-slot="project-ask" px="$3" pb="$3" gap="$2" minW={0} $md={{ pr: 0 }}>
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
      {wide && !shut ? (
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
        title={`${title} preview`}
        device={device}
        onBridge={onBridge}
        empty={
          <YStack items="center" gap="$2" p="$6">
            <SizableText size="$3" color="$ink">
              {stalled
                ? 'Publishing is taking too long'
                : building
                  ? project?.forked
                    ? 'Publishing your copy…'
                    : 'Publishing…'
                  : failed
                    ? 'Publishing failed'
                    : 'Nothing deployed yet'}
            </SizableText>
            <SizableText size="$2" color="$soft" text="center">
              {stalled
                ? `Its build started ${Math.floor(ran / 60)} minutes ago and has not finished.`
                : building
                  ? 'Its page appears here when the build finishes.'
                  : failed
                    ? why
                    : 'Publish this project and its page appears here.'}
            </SizableText>
            {(stalled || failed) && clone ? (
              <Button variant="outline" disabled={redo.busy} onPress={() => void retry()}>
                Publish again
              </Button>
            ) : null}
            {redo.error ? (
              <SizableText size="$2" color="$soft" text="center" role="alert">
                {redo.error}
              </SizableText>
            ) : null}
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
      repo && root.error ? (
        <SizableText size="$2" color="$soft" p="$4" role="status">
          {`Nothing to show for ${repo} at ${ref}: the forge answered “${root.error.message}”.`}
        </SizableText>
      ) : repo ? (
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
            <ProjectChip name={title} onPress={() => setSwitcher(true)} />
            <XStack render="button" aria-label="History" onPress={() => setHistory(true)} p="$1.5" rounded="$3" shrink={0} hoverStyle={{ bg: '$hover' }}>
              <Clock size={16} />
            </XStack>
            {/* The chat folds away beside the work; on a phone the views switch to it instead. */}
            <XStack
              render="button"
              aria-label={shut ? 'Show the chat' : 'Hide the chat'}
              aria-pressed={!shut}
              onPress={() => (cramped ? setAsked(!asked) : setCollapsed(!collapsed))}
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
            views={[CHAT, ...VIEWS]}
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
              aria-label="Publish"
              disabled={!clone || !slug}
              onPress={() => setPublish({ repo: clone, title, ref, name: slug, project: slug })}
            >
              <Upload size={14} />
              {/* A glyph alone on a phone, where the bar's middle needs the room. */}
              <SizableText size="$2" color="inherit" $max-md={{ display: 'none' }}>
                Publish
              </SizableText>
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
        collapsed={shut}
        pane={pane}
        width={across}
        onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
      >
        {preview}
        {body}
      </Workspace>

      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent maxW={480}>
          <DialogTitle>Runs on {title}</DialogTitle>
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
            {repos.error ? (
              <SizableText size="$2" color="$soft">
                {repos.error.message}
              </SizableText>
            ) : repos.loading && repos.value.length === 0 ? (
              <SizableText size="$2" color="$soft">
                Reading the forge…
              </SizableText>
            ) : (
              repos.value.map((c) => {
                const here = Boolean(named) && c.name === named?.name
                return (
                  <XStack
                    key={`${c.org}/${c.name}`}
                    render="button"
                    aria-label={`Open ${c.org}/${c.name}`}
                    aria-current={here ? 'page' : undefined}
                    onPress={() => {
                      setSwitcher(false)
                      host.go(path({ kind: 'repo', org: c.org || host.org || '', name: c.name }))
                    }}
                    px="$2"
                    py="$1.5"
                    rounded="$3"
                    bg={here ? '$hover' : undefined}
                    hoverStyle={{ bg: '$hover' }}
                  >
                    <SizableText size="$2" color="$ink" numberOfLines={1}>
                      {c.name}
                    </SizableText>
                  </XStack>
                )
              })
            )}
          </YStack>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              setSwitcher(false)
              host.go(path({ kind: 'screen', screen: 'projects' }))
            }}
          >
            All projects
          </Button>
        </DialogContent>
      </Dialog>

      <Publish source={publish} onClose={() => setPublish(null)} onLive={fresh} />
    </>
  )
}
