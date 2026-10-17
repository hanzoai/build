/**
 * The side panel, once, for Chat and Dev: tabs over what a conversation or a
 * run made, read and served (tabs.ts) — a browser's tabs beside the
 * conversation. The header shows them (`PanelToggle`, while they are hidden),
 * the strip's own toggle hides them, and Ctrl+Shift+B (⌘⇧B) or ⌘. / Ctrl+.
 * does either from anywhere but a field (`useKey`).
 *
 * The strip: the tabs, `+`, and at its end the surface's menu, pop-out and the
 * hide toggle. A page tab has a browser's bar — Back and Forward through the
 * addresses it went through, reload, the address, and its menu — and an empty
 * one offers the surface's suggestions.
 *
 * WHAT A PAGE CAN SHOW IS SAID, NOT FAKED. A host that draws pages itself
 * (`Host.browse`: Hanzo Desktop's native webviews) shows any address. A browser
 * page frames only what may be framed — this page's bytes and our own hosts
 * (`frames`) — and offers any other address in a new window instead of a frame
 * the site would refuse.
 *
 * The column the panel stands in is the host's: its width and edge. On a phone
 * the panel is a sheet over the page instead (`sheet`).
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ArrowLeft, ArrowRight, ChevronRight, Columns2, ExternalLink, Globe, Maximize2, Minus, MoreHorizontal, Pin, Plus, RotateCcw, RotateCw, SquarePlus, X } from '@hanzogui/lucide-icons-2'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@hanzo/ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useBrowse, useBrowser, type Browser } from './host.tsx'
import { destination, PAGE, type Deck, type Tab } from './tabs.ts'

/** A kind of tab the surface offers. */
export interface Kind {
  id: string
  label: string
  render: () => ReactNode
  /** Drawn edge to edge, scrolling itself: a terminal, a frame. */
  bleed?: boolean
  /** Its mark in the strip. */
  icon?: ReactNode
}

/** A place an empty tab offers. */
export interface Suggestion {
  title: string
  url: string
  /** An image of the place's own mark; its initial without one. */
  icon?: string
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** The tabs' shortcut, as this platform writes it. */
const KEYS = MAC ? '⌘⇧B' : 'Ctrl+Shift+B'

/** Every key that shows and hides the tabs (tabs.ts `useKey`). */
const SHORTCUTS = 'Control+Shift+B Meta+Shift+B Control+Period Meta+Period'

/** A tab's title where it has none of its own. */
const BLANK = 'New tab'

/** The row heights, px: the strip (the conversation header's row), and a page's bar. */
const STRIP = 56
const BAR = 48
/** A round control in a page's bar, px. */
const PILL = 34

/** A press on an icon control of the panel's: quiet until pointed at, lit while its thing is open. */
const quiet = (on = false, disabled = false) =>
  ({
    items: 'center',
    justify: 'center',
    shrink: 0,
    rounded: 8,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    bg: on ? '$hover' : 'transparent',
    hoverStyle: disabled ? undefined : ({ bg: '$hover' } as const),
    focusVisibleStyle: { outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' },
  }) as const

/**
 * The header's control for the tabs, while they are hidden: an icon among the
 * header's icons. Open, the strip's own toggle stands at the panel's end and
 * this one is not drawn, so the page carries one toggle at a time.
 */
export function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  if (open) return null
  return (
    <XStack
      render="button"
      role="button"
      data-slot="side-toggle"
      aria-label="Show tabs"
      aria-expanded={false}
      aria-keyshortcuts={SHORTCUTS}
      {...({ title: `Show tabs (${KEYS})` } as object)}
      onPress={onToggle}
      width={32}
      height={32}
      {...quiet()}
    >
      <SquarePlus size={16} />
    </XStack>
  )
}

/** Our own hosts: a page of theirs answers a frame on any of our pages. */
const OURS = ['hanzo.ai', 'hanzo.app', 'hanzo.bot']

/** Whether a browser page may frame an address: this page's bytes, this origin, and our own hosts. */
export function frames(url: string): boolean {
  let u: URL
  try {
    u = new URL(url, typeof window === 'undefined' ? 'https://hanzo.ai' : window.location.href)
  } catch {
    return false
  }
  if (u.protocol === 'blob:' || u.protocol === 'data:') return true
  if (typeof window !== 'undefined' && u.origin === window.location.origin) return true
  if (u.protocol !== 'https:') return false
  return OURS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
}

/** A site or a preview we host: a page under one of our hosts, not this page's own origin or our apexes. */
export function hosted(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || (typeof window !== 'undefined' && u.origin === window.location.origin)) return false
  return OURS.some((h) => u.hostname.endsWith(`.${h}`) && u.hostname !== `www.${h}`)
}

const suffix = (s: string): string => {
  const dot = s.lastIndexOf('.')
  return dot > 0 ? s.slice(dot + 1).toLowerCase() : ''
}

const PICTURES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg']
const FRAMED = ['html', 'htm', 'txt', 'md', 'json', 'csv', 'pdf', 'css', 'js', 'ts']

/** The address a tab can be opened at in a window of its own: its own, or its bytes. Null for a kind or a blank page. */
function outward(tab: Tab | null): string | null {
  if (!tab || tab.kind !== PAGE) return null
  if (tab.body !== undefined) return URL.createObjectURL(new Blob([tab.body], { type: tab.type || 'text/plain' }))
  return tab.url || null
}

/** Opens a tab's address or bytes in a new window. */
function popOut(tab: Tab | null): void {
  const href = outward(tab)
  if (href) window.open(href, '_blank', 'noopener,noreferrer')
}

/** A place's mark: its image, else its initial on a quiet tile. */
function Mark({ icon, title }: { icon?: string; title: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <XStack width={40} height={40} rounded={10} items="center" justify="center" bg="$edge" overflow="hidden" shrink={0}>
      {icon && !broken ? (
        <img src={icon} alt="" width={28} height={28} style={{ objectFit: 'contain' }} onError={() => setBroken(true)} />
      ) : (
        <SizableText size="$4" fontWeight="600" color="$ink" aria-hidden>
          {(title.trim()[0] ?? '·').toUpperCase()}
        </SizableText>
      )}
    </XStack>
  )
}

/** An empty page: the places the surface suggests, as cards in a row that scrolls sideways. */
function Suggested({ suggested, onGo }: { suggested: readonly Suggestion[]; onGo: (url: string) => void }) {
  return (
    <YStack data-slot="side-suggested" px="$4" pt="$4" gap="$3">
      <SizableText fontSize={13} color="$soft">
        Suggested
      </SizableText>
      {suggested.length ? (
        <XStack role="list" aria-label="Suggested" gap="$2" overflowX="auto" overflowY="hidden" pb="$2">
          {suggested.map((s) => (
            <YStack
              key={s.url}
              role="listitem"
              render="button"
              aria-label={s.title}
              onPress={() => onGo(s.url)}
              width={120}
              shrink={0}
              items="center"
              gap="$2"
              py="$2.5"
              px="$1.5"
              rounded={12}
              cursor="pointer"
              hoverStyle={{ bg: '$hover' }}
              focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
            >
              <Mark icon={s.icon} title={s.title} />
              <SizableText fontSize={13} color="$ink" numberOfLines={1} maxW="100%">
                {s.title}
              </SizableText>
            </YStack>
          ))}
        </XStack>
      ) : (
        <SizableText fontSize={13} color="$soft">
          No suggestions.
        </SizableText>
      )}
    </YStack>
  )
}

/** A remote address a browser page may not frame: what it is, and the one way to open it. */
function Elsewhere({ tab }: { tab: Tab }) {
  return (
    <YStack flex={1} items="center" justify="center" gap="$3" p="$5" data-slot="side-elsewhere">
      <Globe size={20} opacity={0.6} />
      <SizableText fontSize={13} color="$ink" numberOfLines={1} maxW="100%">
        {tab.title || tab.url}
      </SizableText>
      <XStack
        render="button"
        role="button"
        onPress={() => popOut(tab)}
        items="center"
        gap="$1.5"
        px="$3"
        height={32}
        rounded={999}
        borderWidth={1}
        borderColor="$borderColor"
        cursor="pointer"
        hoverStyle={{ bg: '$hover' }}
      >
        <ExternalLink size={13} />
        <SizableText fontSize={13} color="$ink">
          Open in a new window
        </SizableText>
      </XStack>
    </YStack>
  )
}

/** A page the menu acts on. */
export interface Here {
  url: string
  title: string
}

/** A page asked about, with what the reader had selected in it where a page can read that. */
export interface Asked extends Here {
  selection?: string
}

/** Something the surface can do with a page: a row of the menu's Skills. */
export interface Skill {
  id: string
  name: string
  run: (page: Here) => void
}

/** What the surface does with a page from its menu: each one draws its row. */
export interface Acts {
  /** Ask about this page: the conversation takes it, with what was selected. */
  onAsk?: (page: Asked) => void
  /** Open in Dev: a preview or a site we host (`hosted`), opened where it is built. */
  onDev?: (page: Here) => void
  /** Take a screenshot: the picture, handed to the surface (Chat attaches it). */
  onCapture?: (file: File, page: Here) => void
  skills?: readonly Skill[]
}

export interface PageProps extends Acts {
  tab: Tab
  /** Point the page at an address. */
  onGo: (url: string) => void
  onBack?: () => void
  onForward?: () => void
  /** The title the page gave itself. */
  onTitle?: (title: string) => void
  /** Pin the tab, or let it go. */
  onPin?: (on: boolean) => void
  suggested?: readonly Suggestion[]
}

/** A row of the page's menu, px: a browser's menu is denser than a form's. */
const ROW = 29

/** A browser's zoom steps, percent. */
const ZOOMS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300]

/** The next zoom step past `now`, one way. */
const zoomed = (now: number, way: 1 | -1): number => {
  const at = ZOOMS.findIndex((z) => z >= now)
  const i = at < 0 ? ZOOMS.length - 1 : ZOOMS[at] === now ? at + way : way > 0 ? at : at - 1
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))]!
}

/** A row of the menu: its words, and what stands at its end. */
function Row({ label, onSelect, disabled, end }: { label: string; onSelect: () => void; disabled?: boolean; end?: ReactNode }) {
  return (
    <DropdownMenuItem disabled={disabled} onSelect={onSelect} minH={ROW} py={0}>
      <SizableText fontSize={13} color="$ink" flex={1} numberOfLines={1}>
        {label}
      </SizableText>
      {end}
    </DropdownMenuItem>
  )
}

/** The zoom row: the level between − and +, and the way back to 100. Plain buttons, so a press keeps the menu open. */
function Zoom({ level, onLevel, disabled }: { level: number; onLevel: (percent: number) => void; disabled: boolean }) {
  const step = (way: 1 | -1) => () => onLevel(zoomed(level, way))
  const box = (label: string, onPress: () => void, child: ReactNode) => (
    <XStack render="button" role="button" aria-label={label} aria-disabled={disabled || undefined} onPress={disabled ? undefined : onPress} width={24} height={24} {...quiet(false, disabled)} rounded={6}>
      {child}
    </XStack>
  )
  return (
    <XStack data-slot="page-zoom" role="group" aria-label="Zoom" items="center" gap="$2" px={8} height={38} opacity={disabled ? 0.5 : 1}>
      <SizableText fontSize={13} color="$ink" flex={1}>
        Zoom
      </SizableText>
      <XStack items="center" gap={2} borderWidth={1} borderColor="$borderColor" rounded={8} px={2} height={28}>
        {box('Zoom out', step(-1), <Minus size={12} />)}
        <SizableText fontSize={12} color="$ink" width={40} text="center" aria-live="polite">
          {`${level}%`}
        </SizableText>
        {box('Zoom in', step(1), <Plus size={12} />)}
      </XStack>
      {box('Reset zoom', () => onLevel(100), <RotateCcw size={13} />)}
    </XStack>
  )
}

/**
 * Skills, a submenu. Its panel is mounted only while open: a closed one stays
 * laid out over the menu and takes its presses.
 */
function Skills({ skills, here }: { skills: readonly Skill[]; here: Here | null }) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenuSub open={open} onOpenChange={setOpen}>
      <DropdownMenuSubTrigger disabled={!here} minH={ROW} py={0}>
        <SizableText fontSize={13} color="$ink" flex={1}>
          Skills
        </SizableText>
      </DropdownMenuSubTrigger>
      {open ? (
        <DropdownMenuSubContent minW={200}>
          {skills.map((k) => (
            <Row key={k.id} label={k.name} onSelect={() => here && k.run(here)} />
          ))}
        </DropdownMenuSubContent>
      ) : null}
    </DropdownMenuSub>
  )
}

/**
 * The page's menu, in a browser's order: what we add first (ask about it, open
 * it in Dev, a skill, a new window, its link), then what is done to the page
 * (find, print, zoom, device toolbar, a screenshot), then the browser's own
 * (passwords, downloads, history, clearing) and its settings. A row is drawn
 * only where it can be done — by the host's browser (`Host.browser`), or by a
 * page itself for a frame it may reach — and one that needs a page is dim on
 * an empty tab.
 */
function Actions({
  tab,
  here,
  frame,
  framed,
  same,
  level,
  onLevel,
  acts,
  browser,
  onPin,
}: {
  tab: Tab
  /** The page shown, or null on an empty tab. */
  here: Here | null
  frame: React.RefObject<HTMLIFrameElement | null>
  /** The page is drawn in a frame or a picture this page holds. */
  framed: boolean
  /** That frame is this origin's, so this page can reach into it. */
  same: boolean
  level: number
  onLevel: (percent: number) => void
  acts: Acts
  browser: Browser | null
  onPin?: (on: boolean) => void
}) {
  const shown = here ? { id: tab.id, ...here } : null
  const none = !shown
  const pick = () => {
    if (!same) return undefined
    try {
      return frame.current?.contentWindow?.getSelection()?.toString() || undefined
    } catch {
      return undefined
    }
  }
  const ask = async () => {
    if (!shown || !acts.onAsk) return
    const selection = browser?.selection ? await browser.selection(shown).catch(() => '') : pick()
    acts.onAsk({ url: shown.url, title: shown.title, ...(selection ? { selection } : {}) })
  }
  const capture = async () => {
    if (!shown || !browser?.capture || !acts.onCapture) return
    const blob = await browser.capture(shown)
    const name = `Screenshot ${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.png`
    acts.onCapture(new File([blob], name, { type: blob.type || 'image/png' }), { url: shown.url, title: shown.title })
  }
  const print = browser?.print ?? (same ? () => frame.current?.contentWindow?.print() : undefined)
  const zoom = Boolean(browser?.zoom) || framed
  const ours = [
    acts.onAsk ? <Row key="ask" label="Ask about this page" disabled={none} onSelect={() => void ask()} /> : null,
    acts.onDev && shown && hosted(shown.url) ? <Row key="dev" label="Open in Dev" onSelect={() => acts.onDev?.({ url: shown.url, title: shown.title })} /> : null,
    acts.skills?.length ? <Skills key="skills" skills={acts.skills} here={here} /> : null,
    <Row key="out" label="Open in a new window" disabled={none} onSelect={() => popOut(tab)} />,
    <Row key="copy" label="Copy link" disabled={none || !tab.url} onSelect={() => tab.url && void navigator.clipboard?.writeText(tab.url)} />,
    onPin ? <Row key="pin" label={tab.pinned ? 'Unpin tab' : 'Pin tab'} onSelect={() => onPin(!tab.pinned)} /> : null,
  ].filter(Boolean)
  const page = [
    browser?.find ? <Row key="find" label="Find in page" disabled={none} onSelect={() => shown && browser.find?.(shown)} /> : null,
    print ? <Row key="print" label="Print" disabled={none} onSelect={() => shown && print(shown)} /> : null,
    zoom ? <Zoom key="zoom" level={level} onLevel={onLevel} disabled={none} /> : null,
    browser?.devices ? <Row key="devices" label="Show device toolbar" disabled={none} onSelect={() => shown && browser.devices?.(shown)} /> : null,
    browser?.capture && acts.onCapture ? <Row key="capture" label="Take a screenshot" disabled={none} onSelect={() => void capture()} /> : null,
  ].filter(Boolean)
  const own = [
    browser?.passwords ? <Row key="passwords" label="Passwords and autofill" onSelect={browser.passwords} end={<ChevronRight size={14} opacity={0.6} />} /> : null,
    browser?.downloads ? <Row key="downloads" label="Downloads" onSelect={browser.downloads} /> : null,
    browser?.history ? <Row key="history" label="History" onSelect={browser.history} /> : null,
    browser?.clear ? <Row key="clear" label="Clear browsing data" onSelect={browser.clear} /> : null,
  ].filter(Boolean)
  const settings = browser?.settings ? [<Row key="settings" label="Browser settings" onSelect={browser.settings} />] : []
  const groups = [ours, page, own, settings].filter((g) => g.length)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <XStack render="button" role="button" aria-label="Page actions" width={PILL} height={PILL} {...quiet()} rounded={999} bg="$edge">
          <MoreHorizontal size={16} />
        </XStack>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW={240} data-slot="page-menu">
        {groups.flatMap((g, i) => (i ? [<DropdownMenuSeparator key={`line-${i}`} />, ...g] : g))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A page tab: its bar, then an address, bytes rendered as their type, or the
 * suggestions of an empty tab.
 *
 * Two sandboxes. Bytes and an object URL take THIS page's origin, so a script
 * an answer wrote runs without `allow-same-origin`, never with our storage. A
 * remote page takes its own origin, and withholding same-origin breaks it.
 */
export function Page({ tab, onGo, onBack, onForward, onTitle, onPin, suggested = [], ...acts }: PageProps) {
  const Browse = useBrowse()
  const browser = useBrowser()
  const frame = useRef<HTMLIFrameElement | null>(null)
  // The page's zoom: the host's browser zooms its own; a frame here is scaled.
  const [level, setLevel] = useState(100)
  const own = tab.body !== undefined
  const src = useMemo(() => (own ? URL.createObjectURL(new Blob([tab.body!], { type: tab.type || 'text/plain' })) : (tab.url ?? '')), [own, tab.body, tab.type, tab.url])
  useEffect(() => () => (own ? URL.revokeObjectURL(src) : undefined), [own, src])
  const [round, again] = useState(0)
  const [typed, setTyped] = useState(tab.url ?? '')
  const [typing, setTyping] = useState(false)
  // A move the page made, Back or a suggestion is the bar's new address.
  useEffect(() => setTyped(tab.url ?? ''), [tab.url])
  const local = own || src.startsWith('blob:')
  const type = tab.type ?? ''
  const ext = suffix(tab.title)
  const picture = type.startsWith('image/') || PICTURES.includes(ext)
  const shows = !local || own || !type || type.startsWith('text/') || type === 'application/pdf' || type === 'application/json' || FRAMED.includes(ext)
  const back = Boolean(tab.back?.length && onBack)
  const ahead = Boolean(tab.ahead?.length && onForward)
  const go = () => {
    const to = destination(typed)
    if (to) onGo(to)
  }
  const native = !local && Boolean(Browse)
  const elsewhere = !local && !native && Boolean(src) && !frames(src)
  const framed = Boolean(src) && !native && !elsewhere
  const same = framed && !local && (() => {
    try {
      return new URL(src, window.location.href).origin === window.location.origin
    } catch {
      return false
    }
  })()
  const here = src ? { url: tab.url || src, title: tab.title } : null
  const zoomTo = (percent: number) => {
    setLevel(percent)
    if (browser?.zoom && native && here) browser.zoom({ id: tab.id, ...here }, percent)
  }
  // A frame scaled from its corner, its box grown to fill the panel at the scale.
  const scale = native || level === 100 ? null : ({ width: `${10000 / level}%`, height: `${10000 / level}%`, transform: `scale(${level / 100})`, transformOrigin: '0 0' } as const)

  return (
    <YStack flex={1} minH={0} data-slot="side-page">
      <XStack data-slot="side-bar" height={BAR} px="$2" gap="$2" items="center" borderBottomWidth={1} borderColor="$borderColor" shrink={0}>
        <XStack items="center" height={PILL} px={4} gap={2} rounded={999} bg="$edge" shrink={0}>
          <XStack render="button" role="button" aria-label="Back" aria-disabled={!back || undefined} onPress={back ? onBack : undefined} width={28} height={28} {...quiet(false, !back)} rounded={999}>
            <ArrowLeft size={15} />
          </XStack>
          <XStack render="button" role="button" aria-label="Forward" aria-disabled={!ahead || undefined} onPress={ahead ? onForward : undefined} width={28} height={28} {...quiet(false, !ahead)} rounded={999}>
            <ArrowRight size={15} />
          </XStack>
          <XStack render="button" role="button" aria-label="Reload this tab" onPress={() => again((n) => n + 1)} width={28} height={28} {...quiet()} rounded={999}>
            <RotateCw size={14} />
          </XStack>
        </XStack>
        <XStack
          flex={1}
          minW={0}
          items="center"
          height={PILL}
          px="$3.5"
          rounded={999}
          bg="$edge"
          borderWidth={1}
          // Focused, the address is the bar's one ringed thing, as a browser's is.
          borderColor={typing ? '$outlineColor' : 'transparent'}
          data-slot="side-address"
        >
          <input
            key={tab.id}
            value={own ? tab.title : typed}
            readOnly={own}
            placeholder="Search or enter a URL"
            aria-label="Address"
            spellCheck={false}
            autoFocus={!own && !tab.url}
            onFocus={(e) => {
              setTyping(true)
              e.currentTarget.select()
            }}
            onBlur={() => setTyping(false)}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go()
              if (e.key === 'Escape') setTyped(tab.url ?? '')
            }}
            style={{
              width: '100%',
              border: 0,
              outline: 'none',
              background: 'transparent',
              color: 'var(--foreground)',
              font: 'inherit',
              fontSize: 14,
              // The resting bar reads centred, as a browser's new tab does; typed in, it reads from the left.
              textAlign: typing || typed ? 'left' : 'center',
            }}
          />
        </XStack>
        <Actions
          tab={tab}
          here={here}
          frame={frame}
          framed={framed}
          same={same}
          level={level}
          onLevel={zoomTo}
          acts={acts}
          browser={browser}
          onPin={onPin}
        />
      </XStack>
      {!src ? (
        <Suggested suggested={suggested} onGo={onGo} />
      ) : native && Browse ? (
        <YStack key={round} flex={1} minH={0}>
          <Browse url={src} title={tab.title} onGo={onGo} onTitle={onTitle} />
        </YStack>
      ) : elsewhere ? (
        <Elsewhere tab={tab} />
      ) : picture && !own ? (
        <YStack flex={1} minH={0} items="center" justify="center" p="$3" overflowY="auto" overflowX="hidden">
          <img key={round} src={src} alt={tab.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', ...(scale ? { transform: scale.transform } : null) }} />
        </YStack>
      ) : shows ? (
        <YStack flex={1} minH={0} overflow="hidden" position="relative">
          <iframe
            ref={frame}
            key={round}
            src={src}
            title={tab.title}
            sandbox={local ? 'allow-scripts allow-popups allow-forms' : 'allow-same-origin allow-scripts allow-popups allow-forms allow-modals'}
            style={{ position: 'absolute', top: 0, left: 0, border: 0, width: '100%', height: '100%', display: 'block', background: 'var(--background)', ...scale }}
          />
        </YStack>
      ) : (
        <YStack flex={1} items="center" justify="center" p="$5" gap="$2">
          <SizableText size="$2" color="$soft">{`${(ext || type || 'This').toUpperCase()} previews aren’t supported yet.`}</SizableText>
          <SizableText size="$2" color="$soft">
            Open it in a new window to view it.
          </SizableText>
        </YStack>
      )}
    </YStack>
  )
}

const DRAG = 'text/x-hanzo-tab'

/**
 * One tab in the strip: its mark, its title, and its cross, or its pin when it
 * is pinned. Its own menu (a right press, or a long press on touch) pins it or
 * lets it go, and closes it, whatever kind it is.
 */
function Leaf({ tab, on, side, index, label, icon }: { tab: Tab; on: boolean; side: Deck; index: number; label: string; icon: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Strip tab={tab} on={on} side={side} index={index} label={label} icon={icon} />
      </ContextMenuTrigger>
      <ContextMenuContent minW={180} aria-label={`${label} tab`}>
        <ContextMenuItem onSelect={() => (tab.pinned ? side.unpin(tab.id) : side.pin(tab.id))}>{tab.pinned ? 'Unpin tab' : 'Pin tab'}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => side.shut(tab.id)}>Close tab</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The tab itself, as the strip draws it. */
function Strip({ tab, on, side, index, label, icon, ...rest }: { tab: Tab; on: boolean; side: Deck; index: number; label: string; icon: ReactNode }) {
  return (
    <XStack
      {...rest}
      data-slot="side-tab"
      data-tab={tab.id}
      items="center"
      gap="$1"
      pl="$2.5"
      pr="$1"
      height={30}
      // As wide as a title wants up to a browser tab's width, sharing the strip
      // as a browser's tabs do when there are many.
      flexBasis={236}
      shrink={1}
      minW={56}
      maxW={236}
      rounded={8}
      borderWidth={1}
      borderColor={on ? '$borderColor' : 'transparent'}
      bg={on ? '$edge' : 'transparent'}
      hoverStyle={{ bg: on ? '$edge' : '$hover' }}
      {...({
        // A middle press shuts any tab, as a browser's does; the chosen one also has its cross.
        onAuxClick: (e: React.MouseEvent) => {
          if (e.button !== 1 || tab.pinned) return
          e.preventDefault()
          side.shut(tab.id)
        },
        title: label,
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData(DRAG, tab.id)
          e.dataTransfer.effectAllowed = 'move'
        },
        onDragOver: (e: React.DragEvent) => {
          if (Array.from(e.dataTransfer.types).includes(DRAG)) e.preventDefault()
        },
        onDrop: (e: React.DragEvent) => {
          const id = e.dataTransfer.getData(DRAG)
          if (!id || id === tab.id) return
          e.preventDefault()
          side.move(id, index)
        },
      } as object)}
    >
      <XStack
        render="button"
        role="tab"
        id={`side-tab-${tab.id}`}
        aria-selected={on}
        aria-controls="side-body"
        tabIndex={on ? 0 : -1}
        onPress={() => side.pick(tab.id)}
        onKeyDown={(e: { key?: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault?: () => void }) => {
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (step && e.shiftKey && (e.metaKey || e.ctrlKey)) {
            e.preventDefault?.()
            side.move(tab.id, index + step)
            return
          }
          if (step) {
            e.preventDefault?.()
            const next = side.tabs[(index + step + side.tabs.length) % side.tabs.length]
            if (!next) return
            side.pick(next.id)
            queueMicrotask(() => document.getElementById(`side-tab-${next.id}`)?.focus())
            return
          }
          if ((e.key === 'Delete' || e.key === 'Backspace') && !tab.pinned) {
            e.preventDefault?.()
            side.shut(tab.id)
          }
        }}
        flex={1}
        minW={0}
        items="center"
        gap="$2"
        cursor="pointer"
      >
        {icon ? (
          <XStack aria-hidden shrink={0} opacity={on ? 1 : 0.7}>
            {icon}
          </XStack>
        ) : null}
        <SizableText fontSize={13} color={on ? '$ink' : '$soft'} numberOfLines={1}>
          {label}
        </SizableText>
      </XStack>
      {tab.pinned ? (
        // A pinned tab's end is its pin, always shown: pressing it lets the tab go.
        <XStack
          render="button"
          role="button"
          aria-label={`Unpin ${label}`}
          tabIndex={-1}
          onPress={() => side.unpin(tab.id)}
          width={22}
          height={22}
          items="center"
          justify="center"
          rounded={6}
          cursor="pointer"
          opacity={on ? 0.8 : 0.55}
          hoverStyle={{ bg: '$hover', opacity: 1 }}
        >
          <Pin size={12} />
        </XStack>
      ) : (
        <XStack
          render="button"
          role="button"
          aria-label={`Close ${label}`}
          tabIndex={-1}
          onPress={() => side.shut(tab.id)}
          width={22}
          height={22}
          items="center"
          justify="center"
          rounded={6}
          cursor="pointer"
          opacity={on ? 0.8 : 0.45}
          hoverStyle={{ bg: '$hover', opacity: 1 }}
          // The chosen tab's cross: the others keep their room for their titles when the strip is shared.
          display={on ? 'flex' : 'none'}
        >
          <X size={12} />
        </XStack>
      )}
    </XStack>
  )
}

export interface PanelProps extends Acts {
  side: Deck
  kinds: readonly Kind[]
  onHide: () => void
  /** A sheet over the page (a phone) rather than the host's column. */
  sheet?: boolean
  /** Under the strip, over every tab: a line about what they all read (Dev's sandbox). */
  bar?: ReactNode
  /** At the strip's end, before pop-out and hide: the surface's own menu. */
  menu?: ReactNode
  label?: string
  /** What an empty tab offers. */
  suggested?: readonly Suggestion[]
}

/** The panel: the strip, and the chosen tab. */
export function Panel({ side, kinds, onHide, sheet = false, bar, menu, label = 'Side panel', suggested, ...acts }: PanelProps) {
  const tab = side.tabs.find((t) => t.id === side.at) ?? null
  // The chosen tab is in view in a strip that scrolls: a tab just opened stands at its end.
  useEffect(() => {
    if (side.at) document.getElementById(`side-tab-${side.at}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [side.at, side.tabs.length])
  const kind = tab && tab.kind !== PAGE ? kinds.find((k) => k.id === tab.kind) : undefined
  const bleed = !tab || tab.kind === PAGE || Boolean(kind?.bleed)
  const closed = kinds.filter((k) => !side.tabs.some((t) => t.kind === k.id))
  const title = (t: Tab) => (t.kind === PAGE ? t.title || BLANK : (kinds.find((k) => k.id === t.kind)?.label ?? t.title))
  const mark = (t: Tab) => (t.kind === PAGE ? <Globe size={14} /> : (kinds.find((k) => k.id === t.kind)?.icon ?? null))
  const blank = () => side.open({ kind: PAGE, title: BLANK, url: '' })
  const poppable = tab?.kind === PAGE && (tab.body !== undefined || Boolean(tab.url))
  const plus = (
    <XStack render="button" role="button" aria-label="Open a tab" width={28} height={28} {...quiet()} onPress={closed.length ? undefined : blank}>
      <Plus size={16} />
    </XStack>
  )

  const body = (
    <YStack role="complementary" aria-label={label} data-slot="side" flex={1} minW={0} minH={0} overflow="hidden" style={{ borderRadius: 'inherit' }}>
      <XStack data-slot="side-strip" height={STRIP} px="$2" gap="$1.5" items="center" borderBottomWidth={1} borderColor="$borderColor" shrink={0}>
        {/* The strip scrolls sideways in a narrow panel; `+`, the menu, pop-out and hide stay put. */}
        <XStack role="tablist" aria-label="Tabs" shrink={1} minW={0} gap="$1" items="center" overflowX="auto" overflowY="hidden" $platform-web={{ scrollbarWidth: 'none' }}>
          {side.tabs.map((t, i) => (
            <Leaf key={t.id} tab={t} on={t.id === side.at} side={side} index={i} label={title(t)} icon={mark(t)} />
          ))}
        </XStack>
        {closed.length ? (
          <DropdownMenu
            trigger={plus}
            items={[
              ...closed.map((k) => ({ key: k.id, label: k.label, onSelect: () => side.open({ kind: k.id, title: k.label }) })),
              { key: PAGE, label: 'Page', description: 'An address, framed here', onSelect: blank },
            ]}
          />
        ) : (
          plus
        )}
        <XStack flex={1} />
        {menu}
        <XStack
          render="button"
          role="button"
          aria-label="Open this tab in a new window"
          aria-disabled={!poppable || undefined}
          onPress={poppable ? () => popOut(tab) : undefined}
          width={28}
          height={28}
          {...quiet(false, !poppable)}
        >
          <Maximize2 size={14} />
        </XStack>
        <XStack
          render="button"
          role="button"
          data-slot="side-toggle"
          aria-label="Hide tabs"
          aria-expanded
          aria-keyshortcuts={SHORTCUTS}
          {...({ title: `Hide tabs (${KEYS})` } as object)}
          onPress={onHide}
          width={32}
          height={32}
          {...quiet(true)}
        >
          <Columns2 size={16} />
        </XStack>
      </XStack>
      {bar}
      <YStack
        id="side-body"
        role="tabpanel"
        aria-labelledby={tab ? `side-tab-${tab.id}` : undefined}
        // What a tab lays over itself (a door's "Connecting…") stays inside it, under the strip.
        position="relative"
        flex={1}
        minH={0}
        overflowY={bleed ? 'hidden' : 'auto'}
        overflowX="hidden"
        px={bleed ? 0 : '$3'}
        py={bleed ? 0 : '$3'}
      >
        {!tab ? (
          <YStack flex={1} items="center" justify="center" p="$5">
            <SizableText fontSize={13} color="$soft">
              No tabs open.
            </SizableText>
          </YStack>
        ) : tab.kind === PAGE ? (
          <Page
            key={tab.id}
            tab={tab}
            onGo={(url) => side.go(tab.id, url)}
            onBack={() => side.back(tab.id)}
            onForward={() => side.forward(tab.id)}
            onTitle={(t) => side.rename(tab.id, t)}
            onPin={(on) => (on ? side.pin(tab.id) : side.unpin(tab.id))}
            suggested={suggested}
            {...acts}
          />
        ) : kind ? (
          kind.render()
        ) : (
          <SizableText size="$2" color="$soft">
            This tab is not offered here.
          </SizableText>
        )}
      </YStack>
    </YStack>
  )

  if (!sheet || typeof document === 'undefined') return body
  // A phone: a sheet from the foot of the window over a dim, the same panel in it.
  return createPortal(
    <YStack data-slot="side-sheet" position="fixed" t={0} r={0} b={0} l={0} z={60}>
      {/* The dim above the sheet: a press on it puts the sheet away. The strip's toggle is its control. */}
      <YStack aria-hidden onPress={onHide} position="absolute" t={0} r={0} l={0} height="12dvh" bg="var(--surface-scrim)" />
      <YStack
        position="absolute"
        l={0}
        r={0}
        b={0}
        height="88dvh"
        bg="$background"
        borderTopWidth={1}
        borderColor="$borderColor"
        style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
        overflow="hidden"
      >
        {body}
      </YStack>
    </YStack>,
    document.body,
  )
}
