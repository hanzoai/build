/**
 * The Library: everything you made — in Chat, in Dev, in Studio and in
 * workflows — in one place, newest first (api/library.ts).
 *
 *   -/artifacts           the Library; `?item=<id>` opens one item's preview
 *
 * A tile opens its item in the side panel (panel.tsx), one tab per item, so a
 * few can be read side by side; on a phone the panel is a sheet. Each item
 * carries what can be done with it: open where it was made, download, share
 * with the org, copy its link, rename, move to a project, use in Studio or in
 * Chat, and delete. What a colleague shared is drawn with their name and offers
 * only what a reader may do with it.
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import {
  AudioLines,
  Box,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  Image as Picture,
  LayoutGrid,
  List,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Presentation,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Type,
  Video,
} from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, DropdownMenu, Input, type DropdownMenuProps } from '@hanzo/ui'
import { ChipSelect } from '@hanzo/ui/product'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ago } from './ago.ts'
import { change, days, get, items as list, remove, size, SOURCE, type Item, type Kind as ItemKind, type Scope, type Source } from './api/library.ts'
import { Confirm, Rename } from './ask.tsx'
import { useKept, useProjects, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { Panel, type Kind } from './panel.tsx'
import { gap, pane } from './pane.ts'
import { Sites } from './shelf.tsx'
import { useDeck } from './tabs.ts'

type MenuItems = NonNullable<DropdownMenuProps['items']>

/** The kinds a reader narrows to, in the order the chips draw them. */
const KINDS: readonly { id: ItemKind | ''; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Audio' },
  { id: 'document', label: 'Documents' },
  { id: 'slides', label: 'Slides' },
  { id: 'model', label: '3D' },
  { id: 'code', label: 'Code' },
  { id: 'file', label: 'Files' },
]

const FROM: readonly { id: Source | ''; label: string }[] = [
  { id: '', label: 'Anywhere' },
  { id: 'chat', label: 'Chat' },
  { id: 'dev', label: 'Dev' },
  { id: 'studio', label: 'Studio' },
  { id: 'workflow', label: 'Workflows' },
]

const WHOSE: readonly { id: Scope; label: string }[] = [
  { id: 'all', label: 'Mine and shared' },
  { id: 'mine', label: 'Mine' },
  { id: 'shared', label: 'Shared with me' },
]

/** How many items a page reads. */
const PAGE = 60

/** The side panel's scope: the items a reader opened, kept as they left them. */
const DECK = 'library'
const TAB = 'item:'

/** A kind's mark. */
function glyph(kind: ItemKind, n = 18): ReactNode {
  switch (kind) {
    case 'image':
      return <Picture size={n} />
    case 'video':
      return <Video size={n} />
    case 'audio':
      return <AudioLines size={n} />
    case 'document':
      return <FileText size={n} />
    case 'slides':
      return <Presentation size={n} />
    case 'type':
      return <Type size={n} />
    case 'model':
      return <Box size={n} />
    case 'code':
      return <Code2 size={n} />
    default:
      return <FileText size={n} />
  }
}

/** The still a tile shows: the item's preview, or an image's own bytes. */
const still = (x: Item): string => x.preview || (x.kind === 'image' && x.mime !== 'image/svg+xml' ? x.url : '')

/** One square: the still, or the kind's mark on a quiet ground. */
export function Thumb({ x, size: n }: { x: Item; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = still(x)
  return (
    <YStack width={n ?? '100%'} height={n} style={n ? undefined : { aspectRatio: '1 / 1' }} rounded="$3" overflow="hidden" bg="$raised" items="center" justify="center" shrink={0} aria-hidden>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <YStack opacity={0.7}>{glyph(x.kind, n ? Math.max(14, Math.round(n / 2.6)) : 28)}</YStack>
      )}
    </YStack>
  )
}

/** What a tile says under its name: where it came from, whose, and when. */
function meta(x: Item): string {
  return [SOURCE[x.source], x.mine ? '' : `shared by ${x.owner}`, ago(x.created)].filter(Boolean).join(' · ')
}

/** An item's link, to paste: this page with the item named. */
function linkTo(x: Item): string {
  const u = new URL(window.location.href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('item', x.id)
  return u.toString()
}

const ID = /^lib_[0-9a-f]{32}$/
/** Where a move into the Library leaves the item it should open. */
const WANT = 'hanzo.build.library.item'

/** Open the Library at one item: the move leaves its id for the screen to take. */
export function want(id: string): void {
  try {
    sessionStorage.setItem(WANT, id)
  } catch {
    // Without storage the Library opens without it.
  }
}

/** The item to open on arrival: one a move left, or the one `?item=` names. */
function named(): string {
  if (typeof window === 'undefined') return ''
  let left = ''
  try {
    left = sessionStorage.getItem(WANT) ?? ''
    sessionStorage.removeItem(WANT)
  } catch {
    left = ''
  }
  const id = left || new URLSearchParams(window.location.search).get('item') || ''
  return ID.test(id) ? id : ''
}

/** What can be done with one item, as menu rows. */
function useActs(onChanged: (x: Item) => void, onGone: (id: string) => void) {
  const host = useHost()
  const t = useTarget()
  const [renaming, setRenaming] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [moving, setMoving] = useState<Item | null>(null)
  const [note, setNote] = useState('')

  const act = async (work: () => Promise<void>) => {
    setNote('')
    try {
      await work()
    } catch (e) {
      setNote((e as Error).message)
    }
  }
  const copy = (text: string, said: string) =>
    act(async () => {
      await navigator.clipboard.writeText(text)
      setNote(said)
    })

  const rows = (x: Item): MenuItems => [
    ...(x.origin ? [{ key: 'open', label: 'Open where it was made', icon: <ExternalLink size={16} />, onSelect: () => host.open(x.origin) }] : []),
    ...(x.download ? [{ key: 'download', label: 'Download', icon: <Download size={16} />, onSelect: () => window.open(x.download, '_blank', 'noopener,noreferrer') }] : []),
    ...(x.mine
      ? [
          {
            key: 'share',
            label: x.shared ? 'Stop sharing' : 'Share with organization',
            icon: <Share2 size={16} />,
            description: x.shared ? 'Only you see it' : 'Everyone in it can open it',
            onSelect: () =>
              void act(async () => {
                const next = await change(t, x.id, { shared: !x.shared })
                onChanged(next)
                setNote(next.shared ? `${next.name} is shared with the organization` : `${next.name} is yours alone`)
              }),
          },
        ]
      : []),
    { key: 'link', label: 'Copy link', icon: <Copy size={16} />, onSelect: () => void copy(linkTo(x), 'Link copied') },
    ...(x.mine
      ? [
          { key: 'rename', label: 'Rename', icon: <Pencil size={16} />, onSelect: () => setRenaming(x) },
          { key: 'move', label: 'Move to project', icon: <FolderInput size={16} />, onSelect: () => setMoving(x) },
        ]
      : []),
    { key: 'studio', label: 'Use in Studio', icon: <Sparkles size={16} />, onSelect: () => host.open(`/studio?asset=${encodeURIComponent(x.id)}`) },
    { key: 'chat', label: 'Use in Chat', icon: <MessageSquare size={16} />, onSelect: () => host.open(`/chat?attach=${encodeURIComponent(x.id)}`) },
    ...(x.mine ? [{ key: 'delete', label: 'Delete', icon: <Trash2 size={16} />, onSelect: () => setDeleting(x) }] : []),
  ]

  const dialogs = (
    <>
      <Rename
        open={Boolean(renaming)}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename"
        name={renaming?.name ?? ''}
        run={async (name) => {
          const next = await change(t, renaming!.id, { name })
          onChanged(next)
        }}
      />
      <Confirm
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        says="It leaves the Library and its file is deleted. Anyone it was shared with loses it too."
        act="Delete"
        run={async () => {
          await remove(t, deleting!.id)
          onGone(deleting!.id)
        }}
      />
      <Move
        item={moving}
        onClose={() => setMoving(null)}
        onMoved={(next) => {
          onChanged(next)
          setNote(next.project ? `${next.name} is in ${next.project}` : `${next.name} is in no project`)
        }}
      />
    </>
  )
  return { rows, dialogs, note }
}

/** Choosing the project an item belongs to, or none. */
function Move({ item: x, onClose, onMoved }: { item: Item | null; onClose: () => void; onMoved: (x: Item) => void }) {
  const host = useHost()
  const t = useTarget()
  const projects = useProjects(t, Boolean(host.person) && Boolean(x))
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const pick = async (project: string) => {
    if (!x) return
    setBusy(true)
    setNote('')
    try {
      onMoved(await change(t, x.id, { project }))
      onClose()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={Boolean(x)} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent maxW={420}>
        <DialogTitle>Move to project</DialogTitle>
        <YStack gap="$1" maxH={320} overflow="scroll">
          {projects.loading && !projects.value.length ? (
            <SizableText size="$2" color="$soft">
              Reading projects…
            </SizableText>
          ) : projects.error ? (
            <SizableText size="$2" color="$soft">
              {projects.error.message}
            </SizableText>
          ) : (
            [{ slug: '', name: 'No project' }, ...projects.value].map((p) => (
              <XStack
                key={p.slug || 'none'}
                render="button"
                aria-label={p.slug ? `Move to ${p.name || p.slug}` : 'Move to no project'}
                aria-current={x?.project === p.slug ? 'true' : undefined}
                disabled={busy}
                onPress={() => void pick(p.slug)}
                px="$3"
                py="$2"
                rounded="$3"
                bg={x?.project === p.slug ? '$hover' : 'transparent'}
                hoverStyle={{ bg: '$hover' }}
                cursor="pointer"
              >
                <SizableText size="$2" color="$ink">
                  {p.name || p.slug}
                </SizableText>
              </XStack>
            ))
          )}
        </YStack>
        {note ? (
          <SizableText size="$1" color="$soft" role="status">
            {note}
          </SizableText>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** One item's menu, as a quiet control. */
function Acts({ x, rows }: { x: Item; rows: MenuItems }) {
  return (
    <DropdownMenu
      trigger={
        <XStack render="button" aria-label={`Actions for ${x.name}`} width={30} height={30} items="center" justify="center" rounded="$2" hoverStyle={{ bg: '$hover' }} cursor="pointer" shrink={0}>
          <MoreHorizontal size={16} />
        </XStack>
      }
      items={rows}
    />
  )
}

/** One tile of the grid: the still, then its name and where it came from; its menu beside the name. */
function Tile({ x, onOpen, rows }: { x: Item; onOpen: () => void; rows: MenuItems }) {
  return (
    <YStack role="listitem" gap="$2" minW={0}>
      <YStack
        render="button"
        aria-label={`Open ${x.name}`}
        onPress={onOpen}
        rounded="$4"
        overflow="hidden"
        cursor="pointer"
        hoverStyle={{ opacity: 0.88 }}
        focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
      >
        <Thumb x={x} />
      </YStack>
      <XStack items="flex-start" gap="$1" minW={0}>
        <YStack flex={1} minW={0} gap="$0.5">
          <SizableText size="$2" color="$ink" numberOfLines={1}>
            {x.name}
          </SizableText>
          <SizableText size="$1" color="$soft" numberOfLines={1}>
            {meta(x)}
          </SizableText>
        </YStack>
        <Acts x={x} rows={rows} />
      </XStack>
    </YStack>
  )
}

/** One row of the list: a small still, its name, where it came from, how large, and its menu. */
function Row({ x, onOpen, rows }: { x: Item; onOpen: () => void; rows: MenuItems }) {
  return (
    <XStack role="listitem" items="center" gap="$3" px="$2" py="$2" rounded="$3" hoverStyle={{ bg: '$hover' }} minW={0}>
      <XStack render="button" aria-label={`Open ${x.name}`} onPress={onOpen} flex={1} minW={0} items="center" gap="$3" cursor="pointer" style={{ textAlign: 'left' }}>
        <Thumb x={x} size={40} />
        <YStack flex={1} minW={0} gap="$0.5">
          <SizableText size="$2" color="$ink" numberOfLines={1}>
            {x.name}
          </SizableText>
          <SizableText size="$1" color="$soft" numberOfLines={1}>
            {meta(x)}
          </SizableText>
        </YStack>
        <SizableText size="$1" color="$soft" width={72} style={{ textAlign: 'right' }} $max-md={{ display: 'none' }}>
          {size(x.bytes)}
        </SizableText>
      </XStack>
      <Acts x={x} rows={rows} />
    </XStack>
  )
}

/** A chip: one choice among a few, lit when chosen. */
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <XStack
      render="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onPress={onPress}
      height={32}
      px="$3"
      items="center"
      rounded="$10"
      shrink={0}
      borderWidth={1}
      borderColor={on ? '$ink' : '$borderColor'}
      bg={on ? '$ink' : 'transparent'}
      hoverStyle={{ bg: on ? '$ink' : '$hover' }}
      cursor="pointer"
      focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
    >
      <SizableText size="$2" color={on ? '$background' : '$ink'}>
        {label}
      </SizableText>
    </XStack>
  )
}

/** One item, read fresh so its signed URLs are live: the thing itself, then what it is. */
export function Preview({ id, rows }: { id: string; rows?: (x: Item) => MenuItems }) {
  const t = useTarget()
  const host = useHost()
  const one = useRead(host.person ? () => get(t, id) : null, null as Item | null, [t, id, host.person])
  const x = one.value
  if (!x) {
    return (
      <SizableText size="$2" color="$soft">
        {!host.person ? 'Sign in to open it.' : one.error ? one.error.message : 'Reading…'}
      </SizableText>
    )
  }
  return (
    <YStack gap="$3" minH={0}>
      <Shown x={x} />
      <XStack items="flex-start" gap="$2">
        <YStack flex={1} minW={0} gap="$1">
          <SizableText size="$3" color="$ink">
            {x.name}
          </SizableText>
          <SizableText size="$1" color="$soft">
            {[meta(x), size(x.bytes), x.width && x.height ? `${x.width}×${x.height}` : '', x.project ? `in ${x.project}` : '', x.shared ? 'shared with the organization' : '']
              .filter(Boolean)
              .join(' · ')}
          </SizableText>
        </YStack>
        {rows ? <Acts x={x} rows={rows(x)} /> : null}
      </XStack>
      <XStack gap="$2" flexWrap="wrap" rowGap="$2">
        {x.origin ? (
          <Button size="sm" variant="outline" onPress={() => host.open(x.origin)}>
            <ExternalLink size={14} />
            Open where it was made
          </Button>
        ) : null}
        {x.download ? (
          <Button size="sm" variant="outline" onPress={() => window.open(x.download, '_blank', 'noopener,noreferrer')}>
            <Download size={14} />
            Download
          </Button>
        ) : null}
      </XStack>
    </YStack>
  )
}

/** The thing itself, drawn the way its kind is read. */
function Shown({ x }: { x: Item }) {
  const box = { width: '100%', maxHeight: '60vh', borderRadius: 12, display: 'block' } as const
  if (!x.url) return <Thumb x={x} />
  if (x.kind === 'image' && x.mime !== 'image/svg+xml') return <img src={x.url} alt={x.name} style={{ ...box, objectFit: 'contain' }} />
  if (x.kind === 'video') return <video src={x.url} poster={x.preview || undefined} controls preload="metadata" style={box} aria-label={x.name} />
  if (x.kind === 'audio') return <audio src={x.url} controls preload="metadata" style={{ width: '100%' }} aria-label={x.name} />
  if (x.mime === 'application/pdf') return <iframe src={x.url} title={x.name} style={{ ...box, height: '60vh', border: 0 }} />
  if (x.mime.startsWith('text/') || x.kind === 'code' || x.mime === 'application/json') return <Text x={x} />
  return <Thumb x={x} />
}

/** A text item's first 200 KB, as written; in a frame where the store does not answer this page's read. */
function Text({ x }: { x: Item }) {
  const read = useRead(
    async () => {
      const res = await fetch(x.url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`The file answered ${res.status}`)
      return (await res.text()).slice(0, 200_000)
    },
    '',
    [x.url],
  )
  if (read.error) return <iframe src={x.url} title={x.name} style={{ width: '100%', height: '60vh', border: 0, borderRadius: 12, background: 'white' }} />
  return (
    <YStack rounded="$3" bg="$raised" p="$3" maxH="60vh" overflow="scroll">
      <SizableText size="$1" color="$ink" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--f-mono, ui-monospace, monospace)' }}>
        {read.loading && !read.value ? 'Reading…' : read.value}
      </SizableText>
    </YStack>
  )
}

/** A run's outputs as small tiles: each opens in the Library. */
export function Outputs({ ids }: { ids: string[] }) {
  const host = useHost()
  const t = useTarget()
  const key = ids.join(',')
  const got = useRead(host.person && ids.length ? () => Promise.all(ids.slice(0, 12).map((id) => get(t, id).catch(() => null))) : null, [] as (Item | null)[], [t, key, host.person])
  const shown = got.value.filter((x): x is Item => x !== null)
  if (!ids.length) return null
  return (
    <XStack gap="$2" flexWrap="wrap" rowGap="$2" pt="$1.5" role="list" aria-label="What it made">
      {shown.map((x) => (
        <XStack key={x.id} role="listitem">
          <XStack
            render="button"
            aria-label={`Open ${x.name} in the Library`}
            onPress={() => {
              want(x.id)
              host.go('-/artifacts')
            }}
            items="center"
            gap="$2"
            pr="$2.5"
            rounded="$3"
            borderWidth={1}
            borderColor="$borderColor"
            overflow="hidden"
            hoverStyle={{ bg: '$hover' }}
            cursor="pointer"
            maxW={240}
          >
            <Thumb x={x} size={36} />
            <SizableText size="$1" color="$ink" numberOfLines={1}>
              {x.name}
            </SizableText>
          </XStack>
        </XStack>
      ))}
      {got.loading && !shown.length ? (
        <SizableText size="$1" color="$soft">
          {`Reading ${ids.length === 1 ? 'what it made' : `the ${ids.length} things it made`}…`}
        </SizableText>
      ) : null}
    </XStack>
  )
}

/** A list read page by page: the first on every change of filter, the next on reaching its end. */
function usePages(load: ((cursor: string, signal: AbortSignal) => Promise<{ data: Item[]; next: string }>) | null, key: string) {
  const [rows, setRows] = useState<Item[]>([])
  const [next, setNext] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(Boolean(load))
  const busy = useRef<AbortController | null>(null)
  const [tick, setTick] = useState(0)

  const read = useCallback(
    (cursor: string) => {
      if (!load) return
      busy.current?.abort()
      const ctl = new AbortController()
      busy.current = ctl
      setLoading(true)
      load(cursor, ctl.signal)
        .then((page) => {
          if (ctl.signal.aborted) return
          setRows((was) => (cursor ? [...was, ...page.data.filter((x) => !was.some((w) => w.id === x.id))] : page.data))
          setNext(page.next)
          setError(null)
        })
        .catch((e: unknown) => {
          if (!ctl.signal.aborted) setError(e as Error)
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false)
        })
    },
    [load],
  )

  useEffect(() => {
    setRows([])
    setNext('')
    read('')
    return () => busy.current?.abort()
    // `key` names the filter; `read` follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, Boolean(load)])

  const more = useCallback(() => {
    if (next && !loading) read(next)
  }, [next, loading, read])
  const patch = (x: Item) => setRows((was) => was.map((w) => (w.id === x.id ? x : w)))
  const drop = (id: string) => setRows((was) => was.filter((w) => w.id !== id))
  return { rows, next, error, loading, more, patch, drop, reload: () => setTick((n) => n + 1) }
}

/** Calls `on` when the element it is set on comes into view. */
function useEnd(on: () => void) {
  const seen = useRef(on)
  seen.current = on
  const [el, setEl] = useState<Element | null>(null)
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && seen.current(), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [el])
  return (node: unknown) => setEl(node instanceof Element ? node : null)
}

export function Library() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const wide = useMedia().md
  const [kind, setKind] = useState<ItemKind | ''>('')
  const [source, setSource] = useState<Source | ''>('')
  const [scope, setScope] = useState<Scope>('all')
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [view, setView] = useKept<'grid' | 'list'>('hanzo.build.library.view', 'grid')
  // One org's items are not another's: each org's open tabs are kept apart.
  const side = useDeck(`${DECK}.${host.org ?? ''}`, { tabs: [], at: null })
  const [shown, setShown] = useState(false)

  // A search is sent once the typing settles.
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 250)
    return () => clearTimeout(id)
  }, [typed])

  const load = useMemo(() => (signed ? (cursor: string, signal: AbortSignal) => list(t, { kind, source, scope, q, limit: PAGE, cursor }, { signal }) : null), [signed, t, kind, source, scope, q])
  const pages = usePages(load, `${kind}|${source}|${scope}|${q}|${t.org}`)
  const end = useEnd(pages.more)

  const look = useCallback(
    (x: { id: string; name: string }) => {
      side.open({ id: `${TAB}${x.id}`, kind: `${TAB}${x.id}`, title: x.name })
      setShown(true)
    },
    [side],
  )
  // An item a link named opens once, on arrival.
  const arrived = useRef(false)
  useEffect(() => {
    if (arrived.current || !signed) return
    arrived.current = true
    const id = named()
    if (id) get(t, id).then(look, () => look({ id, name: 'Item' }))
  }, [signed, t, look])

  const acts = useActs(
    (x) => {
      pages.patch(x)
      if (side.tabs.some((tab) => tab.kind === `${TAB}${x.id}`)) side.rename(`${TAB}${x.id}`, x.name)
    },
    (id) => {
      pages.drop(id)
      side.shut(`${TAB}${id}`)
    },
  )

  const kinds: Kind[] = side.tabs
    .filter((tab) => tab.kind.startsWith(TAB))
    .map((tab) => ({ id: tab.kind, label: tab.title, render: () => <Preview key={tab.kind} id={tab.kind.slice(TAB.length)} rows={acts.rows} /> }))
  const panel = (sheet: boolean) => <Panel side={side} kinds={kinds} sheet={sheet} onHide={() => setShown(false)} label="Item preview" />
  const open = shown && side.tabs.length > 0

  const groups = days(pages.rows)
  const narrowed = Boolean(kind || source || q || scope !== 'all')

  return (
    <XStack flex={1} minH={0} minW={0} width="100%">
      <YStack flex={1} minH={0} minW={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4', py: '$4' }}>
        <YStack width="100%" maxW={1120} mx="auto" gap="$4">
          <XStack items="center" gap="$3">
            <SizableText render="h1" size="$7" fontWeight="600" color="$ink" flex={1}>
              Library
            </SizableText>
            <XStack role="radiogroup" aria-label="View" gap="$1">
              <ViewMark label="Grid" on={view === 'grid'} onPress={() => setView('grid')}>
                <LayoutGrid size={16} />
              </ViewMark>
              <ViewMark label="List" on={view === 'list'} onPress={() => setView('list')}>
                <List size={16} />
              </ViewMark>
            </XStack>
          </XStack>

          <XStack items="center" gap="$2" maxW={480}>
            <Search size={16} opacity={0.6} />
            <YStack flex={1} minW={0}>
              <Input value={typed} onChangeText={setTyped} placeholder="Search your library" aria-label="Search your library" disabled={!signed} />
            </YStack>
          </XStack>

          <YStack gap="$2">
            <XStack role="radiogroup" aria-label="Kind" gap="$2" overflowX="auto" pb="$1" $platform-web={{ scrollbarWidth: 'none' }}>
              {KINDS.map((k) => (
                <Chip key={k.id || 'all'} label={k.label} on={kind === k.id} onPress={() => setKind(k.id)} />
              ))}
            </XStack>
            <XStack gap="$2" flexWrap="wrap" rowGap="$2">
              <ChipSelect
                name="From"
                label={FROM.find((f) => f.id === source)!.label}
                chosen={FROM.find((f) => f.id === source)}
                items={FROM}
                onChange={(f) => setSource(f.id)}
                placement="bottom-start"
                width={200}
              />
              <ChipSelect
                name="Whose"
                label={WHOSE.find((w) => w.id === scope)!.label}
                chosen={WHOSE.find((w) => w.id === scope)}
                items={WHOSE}
                onChange={(w) => setScope(w.id)}
                placement="bottom-start"
                width={220}
              />
            </XStack>
          </YStack>

          {acts.note ? (
            <SizableText size="$2" color="$soft" role="status">
              {acts.note}
            </SizableText>
          ) : null}

          {!signed ? (
            <Said says="Sign in to see your library.">
              <Button size="sm" onPress={() => host.signIn?.()}>
                Sign in
              </Button>
            </Said>
          ) : pages.error && !pages.rows.length ? (
            <Said says={pages.error.message}>
              <Button size="sm" variant="outline" onPress={pages.reload}>
                Try again
              </Button>
            </Said>
          ) : pages.loading && !pages.rows.length ? (
            <Said says="Reading…" />
          ) : !pages.rows.length ? (
            <Said says={narrowed ? 'Nothing matches.' : 'Nothing here yet. What you make in Chat, Dev and Studio lands here.'} />
          ) : (
            <YStack gap="$5">
              {groups.map((g) => (
                <YStack key={g.label} gap="$3" role="group" aria-label={g.label}>
                  <SizableText size="$2" color="$soft" fontWeight="500">
                    {g.label}
                  </SizableText>
                  {view === 'grid' ? (
                    <div role="list" aria-label={`Made ${g.label.toLowerCase()}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(46%, 168px), 1fr))', gap: 16 }}>
                      {g.rows.map((x) => (
                        <Tile key={x.id} x={x} onOpen={() => look(x)} rows={acts.rows(x)} />
                      ))}
                    </div>
                  ) : (
                    <YStack role="list" aria-label={`Made ${g.label.toLowerCase()}`} gap="$0.5">
                      {g.rows.map((x) => (
                        <Row key={x.id} x={x} onOpen={() => look(x)} rows={acts.rows(x)} />
                      ))}
                    </YStack>
                  )}
                </YStack>
              ))}
              <YStack ref={end} height={1} />
              {pages.loading ? (
                <SizableText size="$1" color="$soft">
                  Reading more…
                </SizableText>
              ) : pages.error ? (
                <SizableText size="$1" color="$soft" role="status">
                  {pages.error.message}
                </SizableText>
              ) : null}
            </YStack>
          )}
          {/* The org's deployed sites are Dev's builds: under the items, while nothing narrows them away. */}
          {signed && !q && !kind && (source === '' || source === 'dev') && scope !== 'shared' ? (
            <YStack pt="$6" borderTopWidth={1} borderColor="$borderColor">
              <Sites />
            </YStack>
          ) : null}
        </YStack>
      </YStack>
      {open && !wide ? panel(true) : null}
      {open && wide ? (
        <YStack data-slot="library-side" {...pane} ml={gap} shrink={0} minH={0} width={440} maxW="45%">
          {panel(false)}
        </YStack>
      ) : null}
      {acts.dialogs}
    </XStack>
  )
}

function ViewMark({ label, on, onPress, children }: { label: string; on: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <XStack
      render="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onPress={onPress}
      width={32}
      height={32}
      items="center"
      justify="center"
      rounded="$3"
      bg={on ? '$hover' : 'transparent'}
      hoverStyle={{ bg: '$hover' }}
      cursor="pointer"
      opacity={on ? 1 : 0.6}
    >
      {children}
    </XStack>
  )
}

function Said({ says, children }: { says: string; children?: ReactNode }) {
  return (
    <YStack rounded="$4" borderWidth={1} borderColor="$borderColor" px="$4" py="$10" gap="$3" items="center">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {says}
      </SizableText>
      {children}
    </YStack>
  )
}
