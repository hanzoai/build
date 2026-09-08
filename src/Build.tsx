// The build surface: ask for an app, and the projects you already have.
//
// PLAN IS NOT BUILD, and the toggle is not decoration: Build asks for the
// thing, Plan asks what building it would involve. The mode rides with the
// prompt so the surface that answers knows which was asked rather than
// inferring it from the words.
//
// A PROJECT IS A REAL ROW. `/v1/projects` is the platform's own, the same one a
// deployed site is served from — so the list below is what the org actually has
// and creating one here creates it there, not in a draft store this pane owns.

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowUp,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCode,
  Folder,
  GitBranch,
  Hammer,
  ListTodo,
  Rocket,
  Star,
} from 'lucide-react'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { useIam } from '@hanzo/iam/react'
import { useAi } from '@hanzo/ai/react'
import { Beside } from '~/frame'
import { enter } from '~/enter'
import { openSession, useOpen } from '~/open'
import { Refusal, run } from '~/run'
import { say } from '~/say'
import { useStarred } from '~/stars'
import { Take } from '~/copy'
import { Pitch } from '~/pitch'
import { Tabs } from '~/tabs'

/**
 * One starter kit, as the public catalog publishes it.
 *
 * `/v1/templates` is reference content — no bearer, no org — which is why the
 * gallery below is drawn for a reader who has not signed in.
 */
interface Template {
  slug: string
  title: string
  category: string
  description: string
  framework: string
  /** The repository the starter is cut from. */
  source: string
}

interface Project {
  id: string
  name: string
  slug: string
  framework?: string
  status?: string
  /** Where the deployed site answers, when one has been deployed. */
  liveUrl?: string
  /** The object store the site's files live in. */
  bucket?: string
  /** "<org>/<slug>" — the deterministic prefix those files sit under. */
  space?: string
  /** WHICH deployment is serving. A deployment can be live without being this
   *  one, so a history that marks by status alone marks the wrong row. */
  currentDeploymentId?: string
  updatedAt?: number
}

/** One entry of a folder level, keys RELATIVE to the prefix listed. */
interface Entry {
  key: string
  isDir: boolean
  size: number
}

type Mode = 'build' | 'plan'

/** Where the whole catalog lives, laid out to be browsed rather than pushed
 *  along. The shelf here is the ten you can see; this is the rest. */
const GALLERY = 'https://gallery.hanzo.ai'

/** Where a template's capture is published, named once. Absolute, because this
 *  page is meant to be run and forked anywhere and a path resolved against a
 *  fork's own origin answers 404 for every card. */
const SHOTS = 'https://hanzo.ai/templates'

const MODES: { id: Mode; label: string; icon: typeof Hammer; asks: string }[] = [
  { id: 'build', label: 'Build', icon: Hammer, asks: 'Ask Hanzo to build…' },
  { id: 'plan', label: 'Plan', icon: ListTodo, asks: 'Ask Hanzo what it would take…' },
]

function Empty({ children }: { children: string }) {
  return (
    <YStack flex={1} items="center" justify="center" p="$6" gap="$2">
      <Text render="h1" fontSize="$5" fontWeight="600" color="$ink">
        Hanzo Build
      </Text>
      <Text fontSize="$3" color="$soft" text="center">
        {children}
      </Text>
    </YStack>
  )
}

/**
 * The project's files, as deployed.
 *
 * THE STORE IS THE SOURCE. A site's files live at "<org>/<slug>" in the object
 * store, so this reads what was actually deployed rather than a copy kept
 * beside it. What you see here is what the site is serving.
 *
 * Reading and writing are both TWO HOPS: the platform answers a presigned URL
 * rather than carrying the payload, so the browser talks to the store directly
 * and the signature covers exactly one bucket and one key.
 *
 * SAVING EDITS THE LIVE SITE. These are the files the site is serving, not a
 * draft beside them, so a save is visible to whoever loads the page next. The
 * bar says so — an editor that hides which copy it is writing is how somebody
 * edits production believing they are in a sandbox.
 */
function Files({ project }: { project: Project }) {
  const client = useAi()
  const [prefix, setPrefix] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [opened, setOpened] = useState<{ key: string; text: string } | null>(null)
  /** The draft, and the bytes it was opened from. Dirty is the difference —
   *  tracked rather than flagged, so an edit typed and undone is not a change. */
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<unknown>(null)

  const bucket = project.bucket ?? ''
  const root = project.space ? `${project.space}/` : ''

  useEffect(() => {
    if (!bucket) return
    let live = true
    setOpened(null)
    client.http
      .collection<Entry>('objects', {
        path: `/v1/s3/buckets/${encodeURIComponent(bucket)}/objects`,
        query: { prefix: root + prefix, delimiter: '/' },
      })
      .then((found) => live && setEntries(found))
      .catch((e: unknown) => live && setFailed(e))
    return () => {
      live = false
    }
  }, [client, bucket, root, prefix])

  const read = async (key: string) => {
    setFailed(null)
    try {
      const { url } = await client.http.json<{ url: string }>({
        path: `/v1/s3/buckets/${encodeURIComponent(bucket)}/objects/${root}${prefix}${key}`,
      })
      const text = await (await fetch(url)).text()
      setOpened({ key, text })
      setDraft(text)
    } catch (e) {
      setFailed(e)
    }
  }

  /**
   * Write the draft back to the key it came from.
   *
   * The presign is asked for BY KEY and the store honours the key the signature
   * covers, not the string sent.
   */
  const save = async () => {
    if (!opened || saving) return
    setSaving(true)
    setFailed(null)
    try {
      const { url } = await client.http.json<{ url: string; key: string }>({
        method: 'POST',
        path: `/v1/s3/buckets/${encodeURIComponent(bucket)}/objects`,
        body: { key: `${root}${prefix}${opened.key}` },
      })
      const put = await fetch(url, { method: 'PUT', body: draft })
      if (!put.ok) throw new Error(`the store refused the write (${put.status})`)
      setOpened({ key: opened.key, text: draft })
    } catch (e) {
      setFailed(e)
    } finally {
      setSaving(false)
    }
  }

  const dirty = Boolean(opened && draft !== opened.text)

  if (!bucket) {
    return (
      <YStack flex={1} items="center" justify="center" p="$6">
        <Text fontSize="$3" color="$soft">
          This project has no store yet.
        </Text>
      </YStack>
    )
  }

  return (
    <XStack flex={1} minH={0}>
      <YStack
        width={280}
        shrink={0}
        minH={0}
        overflow="scroll"
        borderRightWidth={1}
        borderColor="$borderColor"
      >
        {prefix ? (
          <Box
            render="button"
            onClick={() => setPrefix(prefix.replace(/[^/]+\/$/, ''))}
            width="100%"
            hoverStyle={{ bg: '$hover' }}
          >
            <XStack items="center" gap="$2" px="$3" py="$2">
              <ChevronLeft size={13} aria-hidden />
              <Text fontSize="$2" color="$soft">
                Up
              </Text>
            </XStack>
          </Box>
        ) : null}

        {(entries ?? []).map((entry) => (
          <Box
            key={entry.key}
            render="button"
            onClick={() => (entry.isDir ? setPrefix(`${prefix}${entry.key}`) : void read(entry.key))}
            width="100%"
            hoverStyle={{ bg: '$hover' }}
          >
            <XStack items="center" gap="$2" px="$3" py="$2">
              {entry.isDir ? <Folder size={13} aria-hidden /> : <FileCode size={13} aria-hidden />}
              <Text fontSize="$2" color="$ink" numberOfLines={1} flex={1}>
                {entry.key}
              </Text>
              {entry.isDir ? <ChevronRight size={12} aria-hidden /> : null}
            </XStack>
          </Box>
        ))}

        {entries && entries.length === 0 ? (
          <Text fontSize="$2" color="$soft" p="$3">
            Nothing here.
          </Text>
        ) : null}
      </YStack>

      <YStack flex={1} minW={0} minH={0} overflow="scroll" p="$3">
        {failed ? (
          <Text fontSize="$2" color="$soft">
            {say(failed, "this project's files")}
          </Text>
        ) : opened ? (
          <YStack flex={1} minH={0} gap="$2">
            <XStack items="center" gap="$2">
              <Text fontSize="$2" color="$soft" flex={1} numberOfLines={1}>
                {opened.key}
                {dirty ? ' · edited' : ''}
              </Text>
              {/* WHICH COPY THIS IS. Saving reaches the files the site serves,
                  and an editor that does not say so is how somebody edits
                  production believing they are in a sandbox. */}
              <Text fontSize="$1" color="$soft">
                live site
              </Text>
              <Box
                render="button"
                onClick={() => void save()}
                px="$3"
                py="$1"
                rounded="$2"
                borderWidth={1}
                borderColor="$borderColor"
                opacity={dirty ? 1 : 0.4}
                hoverStyle={{ bg: '$hover' }}
              >
                <Text fontSize="$2" color="$ink">
                  {saving ? 'Saving' : 'Save'}
                </Text>
              </Box>
            </XStack>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                resize: 'none',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'inherit',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            />
          </YStack>
        ) : (
          <YStack flex={1} items="center" justify="center">
            <Text fontSize="$2" color="$soft">
              Pick a file.
            </Text>
          </YStack>
        )}
      </YStack>
    </XStack>
  )
}

/**
 * A template's picture, named by the row's own slug.
 *
 * ONE ADDRESS. Every row in the catalog has a capture under `SHOTS`, so the
 * slug is the whole of the request and there is no second field to disagree
 * with it.
 *
 * THE NAME IS THE CARD UNDER THE PICTURE, not instead of it. The schematic is
 * laid out and the picture sits over it, so a slow load shows the name, a
 * painted one covers it, and an address that answers something other than an
 * image drops back to it on `error` rather than leaving an empty box.
 *
 * A LAZY IMAGE HAS TO BE DISPLAYED. `loading="lazy"` defers the fetch until the
 * image is near the viewport and one hidden with `display: none` never is, so
 * the picture stacks over the schematic instead of taking its place.
 */
function Shot({ slug }: { slug?: string }) {
  const [gone, setGone] = useState(false)

  return (
    <YStack
      height={150}
      bg="$hover"
      overflow="hidden"
      items="center"
      justify="center"
      position="relative"
    >
      <YStack items="center" justify="center" gap="$2" opacity={0.6}>
        <Boxes size={28} color="var(--soft)" />
        <Text fontSize="$1" color="$soft" textTransform="uppercase" letterSpacing={1}>
          {slug}
        </Text>
      </YStack>
      {slug && !gone ? (
        <img
          src={`${SHOTS}/${slug}.webp`}
          alt=""
          loading="lazy"
          onError={() => setGone(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: 150,
            objectFit: 'cover',
          }}
        />
      ) : null}
    </YStack>
  )
}

/**
 * A PROJECT'S OWN PAGE, FRAMED — under one policy, stated once.
 *
 * `src` is a deployment's address: not ours, and reachable by anyone who can
 * put a slug in front of a reader. Omitting `allow-top-navigation` is what
 * refuses the framed page moving the tab it sits in; `allow-same-origin` grants
 * it its OWN origin, which is a different one from this page.
 */
function Framed({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
      style={{ flex: 1, width: '100%', border: 0, background: 'transparent' }}
    />
  )
}

/**
 * WHAT YOU BUILT, RUNNING, beside the thing that builds it.
 *
 * The loop this surface is for ends in a page somebody can use, and until you
 * can see it a run is a list of steps claiming it worked. `liveUrl` is the
 * platform's own address for the deployment — not one composed here — so a
 * project that has never shipped has nothing to show and says that rather than
 * framing an error page.
 *
 * No width and no edge in here: the column it goes in owns both.
 */
function Preview({ project }: { project: Project | null }) {
  if (!project) {
    return (
      <YStack p="$3" gap="$2">
        <Text fontSize="$2" color="$ink">
          Nothing open
        </Text>
        <Text fontSize="$1" color="$soft">
          Open a project and the page it serves appears here.
        </Text>
      </YStack>
    )
  }
  const live = project.liveUrl
  if (!live) {
    return (
      <YStack p="$3" gap="$2">
        <Text fontSize="$2" color="$ink">
          Nothing to preview yet
        </Text>
        <Text fontSize="$1" color="$soft">
          Deploy {project.name} and what it serves appears here.
        </Text>
      </YStack>
    )
  }
  let host = live
  try {
    host = new URL(live).host
  } catch {
    // A liveUrl that is not a URL still names the deployment; show it whole.
  }
  return (
    <YStack flex={1} minH={0}>
      <XStack items="center" gap="$2" px="$3" py="$2" borderBottomWidth={1} borderColor="$borderColor">
        <Text fontSize="$1" color="$soft" flex={1} minW={0} numberOfLines={1}>
          {host}
        </Text>
      </XStack>
      <Framed src={live} title={`${project.name}, running`} />
    </YStack>
  )
}

/** One deployment attempt, as the history reads it. */
interface Deployment {
  id: string
  version: number
  status: string
  source: string
  commit?: string
  files: number
  bytes: number
  message?: string
  createdAt: number
}

/** Bytes as a size. A deployment that published nothing says so with a dash
 *  rather than "0 B", which reads like a measurement of something. */
const weigh = (bytes: number): string => {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

function Deployments({ project }: { project: Project }) {
  const client = useAi()
  const [rows, setRows] = useState<Deployment[] | null>(null)
  const [failed, setFailed] = useState<unknown>(null)

  useEffect(() => {
    let live = true
    client.http
      .collection<Deployment>('deployments', {
        path: `/v1/projects/${encodeURIComponent(project.slug)}/deployments`,
      })
      .then((found) => live && setRows(found))
      .catch((e: unknown) => live && setFailed(e))
    return () => {
      live = false
    }
  }, [client, project.slug])

  if (failed) {
    return (
      <YStack flex={1} items="center" justify="center" p="$6">
        <Text fontSize="$2" color="$soft">
          {say(failed, 'the deployment history')}
        </Text>
      </YStack>
    )
  }

  if (!rows) return <YStack flex={1} />

  if (rows.length === 0) {
    return (
      <YStack flex={1} items="center" justify="center" p="$6" gap="$2">
        <Text fontSize="$3" fontWeight="600" color="$ink">
          Never deployed
        </Text>
        <Text fontSize="$2" color="$soft">
          Deploy it, and every attempt is recorded here.
        </Text>
      </YStack>
    )
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll">
      {[...rows]
        .sort((a, b) => b.version - a.version)
        .map((one) => (
          <YStack key={one.id} gap="$1" p="$3" borderBottomWidth={1} borderColor="$borderColor">
            <XStack items="baseline" gap="$2">
              <Text fontSize="$3" color="$ink">
                v{one.version}
              </Text>
              <Text fontSize="$1" color="$soft" flex={1} numberOfLines={1}>
                {one.status}
                {one.source ? ` · ${one.source}` : ''}
                {one.commit ? ` · ${one.commit.slice(0, 7)}` : ''}
              </Text>
              {one.id === project.currentDeploymentId ? (
                <Text fontSize="$1" color="$ink">
                  serving
                </Text>
              ) : null}
            </XStack>
            <Text fontSize="$1" color="$soft" numberOfLines={2}>
              {one.message || `${one.files} files · ${weigh(one.bytes)}`}
            </Text>
          </YStack>
        ))}
    </YStack>
  )
}

// The views of an open project, named once: the strip reads this list and the
// switch under it reads the same names, so a fourth view is one entry here.
const VIEWS = [
  { id: 'preview', label: 'Preview' },
  { id: 'files', label: 'Files' },
  { id: 'deployments', label: 'Deployments' },
] as const

type View = (typeof VIEWS)[number]['id']

function Open({
  project,
  onBack,
  onDeploy,
  deploying,
}: {
  project: Project
  onBack: () => void
  onDeploy: () => void
  deploying: boolean
}) {
  const [looking, setLooking] = useState<View>(project.liveUrl ? 'preview' : 'files')
  // STARRED WHERE YOU ARE LOOKING AT IT. The set lives outside React, so the
  // star lights every reader of it in the same tick without a prop threaded
  // through the components between.
  const [starred, star] = useStarred('projects')

  return (
    <YStack flex={1} minH={0}>
      <XStack
        height={48}
        shrink={0}
        items="center"
        px="$3"
        gap="$2"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <Box render="button" onClick={onBack} aria-label="Back" p="$2" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <ChevronLeft size={16} aria-hidden />
        </Box>
        <Text fontSize="$3" fontWeight="500" color="$ink" numberOfLines={1} flex={1}>
          {project.name}
        </Text>
        <Box
          render="button"
          onClick={() => star(project.id)}
          aria-label={starred.has(project.id) ? 'Unstar this project' : 'Star this project'}
          aria-pressed={starred.has(project.id)}
          p="$2"
          rounded="$2"
          hoverStyle={{ bg: '$hover' }}
        >
          <Star size={15} aria-hidden fill={starred.has(project.id) ? 'currentColor' : 'none'} />
        </Box>
        <Text fontSize="$1" color="$soft">
          {project.framework ?? 'static'}
          {project.status ? ` · ${project.status}` : ''}
        </Text>
        {project.liveUrl ? (
          <>
            {/* THE ADDRESS IS THE SHARE. Sending somebody a site means sending
                them its address, and an address that exists only as an iframe's
                src is visible as a rendered page and impossible to hand over. */}
            <Take text={project.liveUrl} says="the site's address" label="Share" />
            {/* A plain anchor: `Box` styles a view and takes no href, and a
                button calling window.open is a link middle-click cannot follow. */}
            <a
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the live site"
              style={{ display: 'inline-flex', padding: 6, color: 'inherit' }}
            >
              <ExternalLink size={15} aria-hidden />
            </a>
          </>
        ) : null}
        <Box
          render="button"
          onClick={onDeploy}
          px="$3"
          py="$2"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$hover' }}
        >
          <XStack items="center" gap="$1">
            <Rocket size={13} aria-hidden />
            <Text fontSize="$2" color="$ink">
              {deploying ? 'Deploying' : 'Deploy'}
            </Text>
          </XStack>
        </Box>
      </XStack>

      {/* THREE VIEWS OF ONE THING: what the site serves, what it is made of,
          and what has been shipped. Files first for a project with nothing
          deployed, because a preview of nothing is a blank pane and the files
          are there either way. */}
      <Tabs tabs={VIEWS} chosen={looking} onPick={setLooking} />

      {looking === 'files' ? (
        <Files project={project} />
      ) : looking === 'deployments' ? (
        <Deployments project={project} />
      ) : project.liveUrl ? (
        <Framed src={project.liveUrl} title={project.name} />
      ) : (
        <YStack flex={1} items="center" justify="center" p="$6" gap="$2">
          <Text fontSize="$3" color="$soft" text="center">
            Not deployed yet.
          </Text>
          <Text fontSize="$2" color="$soft" text="center">
            Deploy it and the preview is the site itself.
          </Text>
        </YStack>
      )}
    </YStack>
  )
}

/**
 * The repository a project builds from.
 *
 * A clone address and the branch a push has to touch. The PROVIDER is not asked
 * for — the platform derives it from the URL, because which forge a URL belongs
 * to decides which webhook and which credential reach it, and a caller that
 * picked it could pick wrong.
 *
 * The name is taken from the repository rather than asked for twice: whoever
 * pastes github.com/acme/storefront has already said what to call it.
 */
function Import({ onDone }: { onDone: () => void }) {
  const client = useAi()
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const link = async () => {
    const clone = url.trim()
    if (!clone || busy) return
    setBusy(true)
    setFailed(null)
    try {
      const name =
        clone
          .replace(/\.git$/, '')
          .split('/')
          .filter(Boolean)
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 40) || 'imported'
      await client.http.json({
        method: 'POST',
        path: '/v1/projects',
        body: { name, repo: { url: clone, branch: branch.trim() || 'main' } },
      })
      setUrl('')
      onDone()
    } catch (e) {
      setFailed(say(e, 'that repository', 'save'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack width={720} maxW="100%" self="center" pt="$6" gap="$2">
      <Text fontSize="$2" color="$soft">
        Or import a repository
      </Text>
      <XStack gap="$2" items="center" flexWrap="wrap">
        <XStack
          flex={1}
          minW={240}
          height={34}
          items="center"
          gap="$2"
          px="$3"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <GitBranch size={13} aria-hidden />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void link()}
            placeholder="https://github.com/acme/storefront"
            aria-label="Repository to import"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'inherit',
              font: 'inherit',
              fontSize: 'var(--text-sm)',
            }}
          />
        </XStack>

        <XStack width={120} height={34} items="center" px="$3" rounded="$3" borderWidth={1} borderColor="$borderColor">
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            aria-label="Branch that rebuilds"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'inherit',
              font: 'inherit',
              fontSize: 'var(--text-sm)',
            }}
          />
        </XStack>

        <Box
          render="button"
          onClick={() => void link()}
          px="$3"
          py="$2"
          rounded="$3"
          borderWidth={1}
          borderColor="$borderColor"
          hoverStyle={{ bg: '$hover' }}
        >
          <Text fontSize="$2" color="$ink">
            {busy ? 'Importing' : 'Import'}
          </Text>
        </Box>
      </XStack>

      {/* What linking a repo buys, said once: a push to that branch rebuilds the
          project. A reader who does not know that reads Import as a one-time
          copy. */}
      <Text fontSize="$1" color="$soft">
        {failed ?? 'A push to that branch rebuilds the project.'}
      </Text>
    </YStack>
  )
}

export function Build() {
  const client = useAi()
  const door = useIam()
  const { user, isLoading } = door
  const [mode, setMode] = useState<Mode>('build')
  // WHICH PROJECT IS OPEN lives in the store, not here: it rides the address,
  // so a reload and a shared link both land on it.
  const { project: open, openProject: setOpen } = useOpen()
  const [templates, setTemplates] = useState<Template[] | null>(null)
  /** Which shelf of the gallery is showing. `null` is all of it. */
  const [shelf, setShelf] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [ask, setAsk] = useState('')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** An ask typed before signing in, waiting for the account it needs. */
  const [pending, setPending] = useState<string | null>(null)
  /** A template picked before signing in, waiting for the same thing. */
  const [pendingFork, setPendingFork] = useState<string | null>(null)

  const ready = Boolean(user)
  const asks = MODES.find((m) => m.id === mode)!.asks

  const reload = useCallback(() => {
    if (!ready) return
    client.http
      .json<Project[]>({ path: '/v1/projects' })
      .then(setProjects)
      .catch((e: unknown) => setFailed(say(e, 'your projects')))
  }, [client, ready])

  useEffect(reload, [reload])

  // The catalog is public, so it is read whether or not anybody is signed in —
  // and read once, because it is reference content that does not change while a
  // reader is looking at it.
  useEffect(() => {
    let live = true
    client.http
      .json<{ data?: Template[] }>({ path: '/v1/templates', anonymous: true })
      .then((page) => live && setTemplates(page.data ?? []))
      .catch(() => live && setTemplates([]))
    return () => {
      live = false
    }
  }, [client])

  /**
   * Turn one ask into a project AND the run that fills it.
   *
   * The sentence is the whole input; the name is derived from its first few
   * words, lowercased and hyphenated, and the project page renames it. Guessing
   * a starting name well is worth more than asking twice before anything exists.
   *
   * The project first, because it is where a deployment lands and it survives a
   * run that is refused. A project the platform will not create does not stop
   * the run: `run` works in a sandbox with no repo and no target, which is what
   * an ask with no code yet needs.
   *
   * Opening the run's session is what swaps this surface for the pane the run
   * narrates itself in — the half a reader was looking for when they typed.
   *
   * The caller has already established that there is an account to create in.
   */
  const create = useCallback(
    async (text: string) => {
      setBusy(true)
      setFailed(null)
      try {
        const name =
          text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .split(/\s+/)
            .slice(0, 4)
            .join('-')
            .slice(0, 40) || 'untitled'
        await client.http.json({ method: 'POST', path: '/v1/projects', body: { name } }).catch(() => {})
        const opened = await run({ prompt: text })
        setAsk('')
        reload()
        openSession(opened.session)
      } catch (e) {
        // A refusal from the coding plane says why — no credit, no capacity —
        // and that sentence is the reader's own situation. Anything else is the
        // platform talking to itself and `say` answers for it.
        setFailed(e instanceof Refusal ? e.message : say(e, 'this workspace', 'save'))
      } finally {
        setBusy(false)
      }
    },
    [client, reload],
  )

  // Takes the text to send, because a caller that has just set it cannot wait
  // for the state to come back around: `setAsk(x)` then `start()` in one handler
  // reads the ask from BEFORE the click and sends an empty string.
  const start = useCallback(
    async (override?: string) => {
      const text = (override ?? ask).trim()
      if (!text || busy) return
      if (!user) {
        setPending(text)
        if (!(await enter(door))) setPending(null)
        return
      }
      await create(text)
    },
    [user, door, ask, busy, create],
  )

  // The ask that was waiting on an account, now that there is one.
  useEffect(() => {
    if (!pending || !user) return
    const text = pending
    setPending(null)
    void create(text)
  }, [pending, user, create])

  /**
   * Open a template by taking a COPY of it.
   *
   * A card carries a repository — `source` on the catalog row, the starter the
   * template is cut from — and `POST /v1/projects/fork` is the door for it. It
   * resolves the slug against the SAME catalog this shelf was drawn from and
   * seeds a project whose repo is the template's own source, so what opens is
   * that template rather than a model's imitation of it. Name, description and
   * framework come off the row, so the slug is the whole request.
   */
  const forkTemplate = useCallback(
    async (slug: string) => {
      if (busy) return
      if (!user) {
        setPendingFork(slug)
        if (!(await enter(door))) setPendingFork(null)
        return
      }
      setBusy(true)
      setFailed(null)
      try {
        const made = await client.http.json<Project>({
          method: 'POST',
          path: '/v1/projects/fork',
          body: { slug },
        })
        if (made?.id) {
          // The open view resolves the project OUT OF THIS LIST rather than
          // re-fetching it, so seat the new row before opening it; `reload`
          // follows to reconcile with the platform's own.
          setProjects((was) => [made, ...(was ?? []).filter((x) => x.id !== made.id)])
          setOpen(made.id)
        }
        reload()
      } catch (e) {
        // An org that has already taken this template gets a 409, and the useful
        // answer to "open this template" is the copy it already has rather than
        // a refusal. The derived slug is the template's own, plus the
        // `-template` suffix the platform appends when the name collides with a
        // reserved host.
        const got = await client.http.json<Project[]>({ path: '/v1/projects' }).catch(() => [])
        const mine = Array.isArray(got) ? got : []
        const had = mine.find((x) => x.slug === slug || x.slug === `${slug}-template`)
        if (had) {
          setProjects(mine)
          setOpen(had.id)
        } else {
          setFailed(say(e, 'this template', 'save'))
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, user, door, client, reload, setOpen],
  )

  // The template that was waiting on an account, now that there is one.
  useEffect(() => {
    if (!pendingFork || !user) return
    const slug = pendingFork
    setPendingFork(null)
    void forkTemplate(slug)
  }, [pendingFork, user, forkTemplate])

  const deploy = async (slug: string) => {
    if (deploying) return
    setDeploying(true)
    setFailed(null)
    try {
      await client.http.json({ method: 'POST', path: `/v1/projects/${slug}/deploy`, body: {} })
      reload()
    } catch (e) {
      setFailed(say(e, 'this project', 'save'))
    } finally {
      setDeploying(false)
    }
  }

  if (isLoading && open) return <Empty>&nbsp;</Empty>

  // Resolved against the list rather than re-fetched: the row already carries
  // what this view draws.
  //
  // A NAME THAT MATCHES NOTHING IS NOT A PROJECT, and is never answered with an
  // invented row — a guessed `liveUrl` would put a third-party origin on the
  // page and then frame it.
  const opened: Project | null = open
    ? ((projects ?? []).find((one) => one.id === open || one.slug === open) ?? null)
    : null

  // Saying "not here" before the list arrives is a lie pointed the other way,
  // and a reader who is not signed in is not waiting for a list at all — so an
  // unmatched name is ignored until there is a workspace to miss from.
  if (open && !opened && ready) {
    return projects === null ? <Empty>&nbsp;</Empty> : <Empty>That project is not in this workspace.</Empty>
  }

  if (opened) {
    return (
      <>
        {/* The frame owns the column; this is what goes in it. */}
        <Beside>
          <Preview project={opened} />
        </Beside>
        <Open
          project={opened}
          onBack={() => setOpen(null)}
          onDeploy={() => void deploy(opened.slug)}
          deploying={deploying}
        />
      </>
    )
  }

  return (
    <YStack flex={1} minH={0}>
      {/* The column is open or it is not, and either way it says what it is
          for. Left empty here it reads as something failing to load rather than
          as nothing being open. */}
      <Beside>
        <Preview project={null} />
      </Beside>
      <YStack flex={1} minH={0} overflow="scroll">
        {/* THE ASK, and it is the page rather than a bar at the bottom: on this
            surface the composer is the product, not a way to comment on one. */}
        <YStack items="center" px="$4" pt="$9" gap="$4">
          {/* THE PAGE'S ONE HEADING. The ask IS the page here, so it is the
              heading rather than a bar's label. */}
          <Text render="h1" fontSize="$9" lineHeight="$9" fontWeight="500" color="$ink" text="center">
            What should we build?
          </Text>

          <YStack maxW={560} gap="$2">
            <Text fontSize="$3" color="$soft" text="center">
              Say what you want. Hanzo writes it, runs it, and puts it on a live URL — with the
              database, the sign-in and the storage already there.
            </Text>
            {/* The signed-out half, describing what sending really does: the ask
                is held, a sign-in opens, and the run begins on the account it
                comes back with. `user` is undefined until the IAM provider's
                effect runs, so this is what the served document carries. */}
            {user ? null : (
              <Text fontSize="$2" color="$soft" text="center">
                Sign in when you send, and the run opens here.
              </Text>
            )}
          </YStack>

          {/* THE SHAPE IS THE PACKAGE'S. @hanzo/ui's theme states the ring and
              the halo at `.hz-composer`, `.chrome` is the glass inside it, and
              `.hz-round` is the control. Drawn by hand these are a hairline
              rectangle that matches no other composer on the estate.

              The halo lives OUTSIDE the host (`::after`, negative inset), so the
              clipping moved in with the panel — hiding overflow on the ring
              would cut the glow off at the corner. */}
          <YStack
            className="hz-composer"
            width={720}
            maxW="100%"
            /* Controls sit in a row UNDER a paragraph field here, not beside a
               single line, which is the case the package sizes up for. */
            style={{ ['--hz-composer-control' as string]: '36px' }}
          >
            <YStack
              className="chrome"
              overflow="hidden"
              /* Concentric with the ring: the host's radius less the band it
                 pads by. Read, not retyped, so the two cannot drift. */
              style={{
                borderRadius: 'calc(var(--hz-composer-radius, 28px) - var(--hz-composer-band, 1px))',
              }}
            >
              <textarea
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void start()
                  }
                }}
                placeholder={asks}
                aria-label={asks}
                rows={3}
                style={{
                  width: '100%',
                  resize: 'none',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'inherit',
                  font: 'inherit',
                  fontSize: 'var(--text-base)',
                  padding: '12px 14px',
                }}
              />

              <XStack items="center" px="$2" pb="$2" gap="$2">
                {/* Build or Plan — one asks for the thing, the other for what it
                    would take. Two buttons rather than a menu, because it is the
                    choice this surface most wants a reader to see. */}
                <XStack
                  role="group"
                  aria-label="Build mode"
                  borderWidth={1}
                  borderColor="$borderColor"
                  rounded="$10"
                  overflow="hidden"
                >
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={m.label}
                      onClick={() => setMode(m.id)}
                      aria-pressed={mode === m.id}
                      style={{
                        background: mode === m.id ? 'var(--muted, rgba(255,255,255,0.08))' : 'transparent',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: 10,
                        cursor: 'pointer',
                      }}
                    >
                      <XStack items="center" gap="$1">
                        <m.icon size={13} aria-hidden />
                        <Text fontSize="$2" color={mode === m.id ? '$ink' : '$soft'}>
                          {m.label}
                        </Text>
                      </XStack>
                    </button>
                  ))}
                </XStack>

                <YStack flex={1} />

                {/* The package's round control, so send is the same circle here
                    as on every other composer. It sizes and shapes itself from
                    `--hz-composer-control`. */}
                <Box
                  render="button"
                  className="hz-round"
                  onClick={() => void start()}
                  aria-label="Start"
                  opacity={ask.trim() ? 1 : 0.4}
                  hoverStyle={{ bg: '$hover' }}
                >
                  <ArrowUp size={16} aria-hidden />
                </Box>
              </XStack>
            </YStack>
          </YStack>

          {failed ? (
            <Text fontSize="$2" color="$soft">
              {failed}
            </Text>
          ) : null}
        </YStack>

        {user ? <Import onDone={reload} /> : null}

        {/* THE STARTERS, drawn for everyone because the catalog is public.
            Picking one takes a COPY of that template rather than asking a model
            to reinvent a starter the platform already publishes.

            A TEMPLATE IS A PICTURE. You choose a starter by looking at it, so
            the card leads with the look and says the name underneath. */}
        {templates && templates.length > 0 ? (
          <YStack pt="$8" gap="$3">
            {/* The rule, with the words let into it. */}
            <XStack items="center" gap="$3" px="$4">
              <YStack flex={1} height={1} bg="$borderColor" />
              <Text fontSize="$2" color="$soft">
                or start from a template
              </Text>
              <YStack flex={1} height={1} bg="$borderColor" />
            </XStack>

            {/* The shelves stay. Sixty cards is a list nobody reads to the end,
                and the counts are real, so a kind nobody has built for is never
                offered. */}
            <XStack flexWrap="wrap" gap="$1" justify="center" px="$4">
              {[
                { id: null as string | null, label: `All ${templates.length}` },
                ...[...new Set(templates.map((t) => t.category))]
                  .map((c) => ({
                    id: c as string | null,
                    label: c,
                    n: templates.filter((t) => t.category === c).length,
                  }))
                  .sort((a, b) => b.n - a.n)
                  .map(({ id, label, n }) => ({ id, label: `${label} ${n}` })),
              ].map((one) => (
                <Box
                  key={one.id ?? 'all'}
                  render="button"
                  onClick={() => setShelf(one.id)}
                  aria-pressed={shelf === one.id}
                  borderWidth={0}
                  px="$2"
                  py="$1"
                  rounded="$2"
                  bg={shelf === one.id ? '$hover' : 'transparent'}
                  hoverStyle={{ bg: '$hover' }}
                >
                  <Text fontSize="$1" color={shelf === one.id ? '$ink' : '$soft'}>
                    {one.label}
                  </Text>
                </Box>
              ))}
            </XStack>

            {/* A ROW THAT SCROLLS, not a wall that wraps. A shelf reads as a
                shelf — you push along it — and it keeps the surface from growing
                a page of cards under a composer that is meant to be the point. */}
            <XStack overflow="scroll" gap="$3" px="$4" pb="$2">
              {templates
                .filter((t) => !shelf || t.category === shelf)
                .map((t) => (
                  <Box
                    key={t.slug}
                    render="button"
                    onClick={() => void forkTemplate(t.slug)}
                    borderWidth={1}
                    borderColor="$borderColor"
                    rounded="$4"
                    overflow="hidden"
                    width={260}
                    shrink={0}
                    bg="transparent"
                    hoverStyle={{ borderColor: '$ink' }}
                  >
                    <YStack>
                      {/* `alt` is empty because the name is printed directly
                          under it — a reader would otherwise hear the template
                          twice. */}
                      <Shot slug={t.slug} />
                      <YStack gap="$0.5" p="$3" items="flex-start">
                        <Text fontSize="$3" color="$ink">
                          {t.title}
                        </Text>
                        <Text fontSize="$2" color="$soft">
                          {t.category}
                        </Text>
                      </YStack>
                    </YStack>
                  </Box>
                ))}
            </XStack>

            <XStack justify="center">
              <a
                href={GALLERY}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: '8px 12px', color: 'var(--soft)', fontSize: 'var(--text-sm)' }}
              >
                Browse all templates →
              </a>
            </XStack>
          </YStack>
        ) : null}

        {/* WHAT THE ORG ALREADY HAS. Below the ask, because a returning reader
            comes back to a project and a new one starts above it. */}
        <YStack px="$4" pt="$8" pb="$6" gap="$3">
          {!user ? null : projects === null ? null : projects.length === 0 ? (
            <Text fontSize="$2" color="$soft" text="center">
              Nothing built yet.
            </Text>
          ) : (
            <YStack width={720} maxW="100%" self="center" gap="$2">
              <Text fontSize="$2" color="$soft">
                Projects
              </Text>
              <XStack flexWrap="wrap" gap="$3">
                {projects.map((p) => (
                  <Box
                    key={p.id}
                    render="button"
                    onClick={() => setOpen(p.id)}
                    width={224}
                    p="$3"
                    borderWidth={1}
                    borderColor="$borderColor"
                    rounded="$3"
                    hoverStyle={{ bg: '$hover' }}
                  >
                    <YStack gap="$1" width="100%">
                      <XStack items="center" gap="$2">
                        <Boxes size={14} aria-hidden />
                        <Text fontSize="$3" color="$ink" numberOfLines={1} flex={1}>
                          {p.name}
                        </Text>
                      </XStack>
                      <Text fontSize="$1" color="$soft" numberOfLines={1}>
                        {p.framework ?? 'static'}
                        {p.status ? ` · ${p.status}` : ''}
                      </Text>
                    </YStack>
                  </Box>
                ))}
              </XStack>
            </YStack>
          )}
        </YStack>

        {/* THE LANDING, and only for a visitor: a signed-in reader came here to
            build, not to be told what building is. */}
        {user ? null : <Pitch />}
      </YStack>
    </YStack>
  )
}
