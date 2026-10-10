/**
 * The side panel, once, for Chat and Dev: tabs over what a conversation or a
 * run made, read and served (tabs.ts), opened and shut in one press — the
 * header's Panel button (`PanelToggle`), or ⌘. / Ctrl+. (`useKey`).
 *
 * The column the panel stands in is the host's: its width and edge. On a phone
 * the panel is a sheet over the page instead (`sheet`).
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ExternalLink, PanelRight, PanelRightClose, Plus, RotateCw, X } from '@hanzogui/lucide-icons-2'
import { DropdownMenu } from '@hanzo/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { address, PAGE, type Deck, type Tab } from './tabs.ts'

/** A kind of tab the surface offers. */
export interface Kind {
  id: string
  label: string
  render: () => ReactNode
  /** Drawn edge to edge, scrolling itself: a terminal, a frame. */
  bleed?: boolean
}

/** The shortcut, as this platform writes it. */
const KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘.' : 'Ctrl+.'

/**
 * The header's Panel button: a word beside the mark while the panel is shut on
 * a laptop, because a glyph alone was a control nobody found; the mark alone
 * below `lg`, where the header has no room for the word, and while it is open,
 * when the panel and its own close are in view (below `lg` it steps aside).
 */
export function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <XStack
      render="button"
      role="button"
      data-slot="side-toggle"
      aria-label={open ? 'Close the side panel' : 'Open the side panel'}
      aria-pressed={open}
      aria-keyshortcuts="Meta+Period Control+Period"
      {...({ title: `${open ? 'Close' : 'Open'} the side panel (${KEY})` } as object)}
      onPress={onToggle}
      items="center"
      gap="$1.5"
      px="$2"
      $lg={{ px: open ? '$2' : '$2.5' }}
      // Open below `lg`, the panel's own close stands beside it and the header keeps its room for the title.
      $max-lg={open ? { display: 'none' } : undefined}
      height={30}
      rounded="$3"
      borderWidth={1}
      borderColor="$borderColor"
      bg={open ? '$hover' : 'transparent'}
      cursor="pointer"
      shrink={0}
      hoverStyle={{ bg: '$hover' }}
    >
      {open ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
      {open ? null : (
        // A tablet's run header has no room for the word beside a title, Share and a pull request.
        <SizableText size="$2" color="$ink" $max-lg={{ display: 'none' }}>
          Panel
        </SizableText>
      )}
    </XStack>
  )
}

const suffix = (s: string): string => {
  const dot = s.lastIndexOf('.')
  return dot > 0 ? s.slice(dot + 1).toLowerCase() : ''
}

const PICTURES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg']
const FRAMED = ['html', 'htm', 'txt', 'md', 'json', 'csv', 'pdf', 'css', 'js', 'ts']

/**
 * A page tab: an address with its bar, or bytes rendered as their type.
 *
 * Two sandboxes. Bytes and an object URL take THIS page's origin, so a script
 * an answer wrote runs without `allow-same-origin`, never with our storage. A
 * remote page takes its own origin, and withholding same-origin breaks it.
 */
export function Page({ tab, onGo }: { tab: Tab; onGo: (url: string) => void }) {
  const own = tab.body !== undefined
  const src = useMemo(() => (own ? URL.createObjectURL(new Blob([tab.body!], { type: tab.type || 'text/plain' })) : (tab.url ?? '')), [own, tab.body, tab.type, tab.url])
  useEffect(() => () => (own ? URL.revokeObjectURL(src) : undefined), [own, src])
  const [round, again] = useState(0)
  const [typed, setTyped] = useState(tab.url ?? '')
  const local = own || src.startsWith('blob:')
  const type = tab.type ?? ''
  const ext = suffix(tab.title)
  const picture = type.startsWith('image/') || PICTURES.includes(ext)
  const shows = !local || own || !type || type.startsWith('text/') || type === 'application/pdf' || type === 'application/json' || FRAMED.includes(ext)

  return (
    <YStack flex={1} minH={0} data-slot="side-page">
      <XStack px="$2" py="$1.5" gap="$1.5" items="center" borderBottomWidth={1} borderColor="$borderColor">
        <XStack render="button" role="button" aria-label="Reload this tab" onPress={() => again((n) => n + 1)} p="$1.5" rounded="$2" cursor="pointer" hoverStyle={{ bg: '$hover' }}>
          <RotateCw size={14} />
        </XStack>
        {local ? (
          <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1}>
            {tab.title}
          </SizableText>
        ) : (
          <XStack flex={1} minW={0} items="center" px="$2" height={28} rounded="$2" borderWidth={1} borderColor="$borderColor" bg="$raised">
            <input
              key={tab.id}
              defaultValue={tab.url ?? ''}
              placeholder="Type an address"
              aria-label="Address"
              spellCheck={false}
              autoFocus={!tab.url}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && address(typed)) onGo(address(typed))
              }}
              style={{ width: '100%', border: 0, outline: 'none', background: 'transparent', color: 'var(--foreground)', font: 'inherit', fontSize: 13 }}
            />
          </XStack>
        )}
        {src ? (
          <XStack render="button" role="button" aria-label="Open this tab in a new window" onPress={() => window.open(src, '_blank', 'noopener,noreferrer')} p="$1.5" rounded="$2" cursor="pointer" hoverStyle={{ bg: '$hover' }}>
            <ExternalLink size={14} />
          </XStack>
        ) : null}
      </XStack>
      {!src ? (
        <YStack flex={1} items="center" justify="center" p="$5">
          <SizableText size="$2" color="$soft">
            Type an address to open a page here.
          </SizableText>
        </YStack>
      ) : picture && !own ? (
        <YStack flex={1} minH={0} items="center" justify="center" p="$3" overflowY="auto" overflowX="hidden">
          <img key={round} src={src} alt={tab.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </YStack>
      ) : shows ? (
        <iframe
          key={round}
          src={src}
          title={tab.title}
          sandbox={local ? 'allow-scripts allow-popups allow-forms' : 'allow-same-origin allow-scripts allow-popups allow-forms'}
          style={{ border: 0, width: '100%', height: '100%', display: 'block', background: 'var(--background)' }}
        />
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

/** One tab in the strip: what you press, and its cross. */
function Leaf({ tab, on, side, index, label }: { tab: Tab; on: boolean; side: Deck; index: number; label: string }) {
  return (
    <XStack
      data-slot="side-tab"
      data-tab={tab.id}
      items="center"
      gap="$0.5"
      pl="$2.5"
      pr="$1"
      height={30}
      maxW={160}
      shrink={0}
      rounded="$3"
      bg={on ? '$edge' : 'transparent'}
      hoverStyle={{ bg: on ? '$edge' : '$hover' }}
      {...({
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
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault?.()
            side.shut(tab.id)
          }
        }}
        flex={1}
        minW={0}
        cursor="pointer"
      >
        <SizableText size="$2" color={on ? '$ink' : '$soft'} numberOfLines={1}>
          {label}
        </SizableText>
      </XStack>
      <XStack
        render="button"
        role="button"
        aria-label={`Close ${label}`}
        tabIndex={-1}
        onPress={() => side.shut(tab.id)}
        p="$1"
        rounded="$2"
        cursor="pointer"
        opacity={on ? 0.8 : 0.45}
        hoverStyle={{ bg: '$hover', opacity: 1 }}
      >
        <X size={12} />
      </XStack>
    </XStack>
  )
}

export interface PanelProps {
  side: Deck
  kinds: readonly Kind[]
  onHide: () => void
  /** A sheet over the page (a phone) rather than the host's column. */
  sheet?: boolean
  /** Under the tabs, over every tab: a line about what they all read (Dev's sandbox). */
  bar?: ReactNode
  /** At the strip's end, before hide: the surface's own menu. */
  menu?: ReactNode
  label?: string
}

/** The panel: the strip, and the chosen tab. */
export function Panel({ side, kinds, onHide, sheet = false, bar, menu, label = 'Side panel' }: PanelProps) {
  const tab = side.tabs.find((t) => t.id === side.at) ?? null
  const kind = tab && tab.kind !== PAGE ? kinds.find((k) => k.id === tab.kind) : undefined
  const bleed = !tab || tab.kind === PAGE || Boolean(kind?.bleed)
  const closed = kinds.filter((k) => !side.tabs.some((t) => t.kind === k.id))
  const title = (t: Tab) => (t.kind === PAGE ? t.title || 'New page' : (kinds.find((k) => k.id === t.kind)?.label ?? t.title))

  const body = (
    <YStack role="complementary" aria-label={label} data-slot="side" flex={1} minW={0} minH={0} overflow="hidden" style={{ borderRadius: 'inherit' }}>
      <XStack px="$2" py="$1.5" gap="$1" items="center" borderBottomWidth={1} borderColor="$borderColor" shrink={0}>
        {/* The strip scrolls sideways in a narrow panel; +, the menu and hide stay put. */}
        <XStack role="tablist" aria-label="Tabs" flex={1} minW={0} gap="$1" items="center" overflowX="auto" overflowY="hidden" $platform-web={{ scrollbarWidth: 'none' }}>
          {side.tabs.map((t, i) => (
            <Leaf key={t.id} tab={t} on={t.id === side.at} side={side} index={i} label={title(t)} />
          ))}
        </XStack>
        <DropdownMenu
          trigger={
            <XStack render="button" role="button" aria-label="Open a tab" p="$1.5" rounded="$2" cursor="pointer" hoverStyle={{ bg: '$hover' }}>
              <Plus size={16} />
            </XStack>
          }
          items={[
            ...closed.map((k) => ({ key: k.id, label: k.label, onSelect: () => side.open({ kind: k.id, title: k.label }) })),
            { key: PAGE, label: 'Page', description: 'An address, framed here', onSelect: () => side.open({ kind: PAGE, title: 'New page', url: '' }) },
          ]}
        />
        {menu}
        <XStack render="button" role="button" aria-label="Close the side panel" onPress={onHide} p="$1.5" rounded="$2" cursor="pointer" hoverStyle={{ bg: '$hover' }}>
          <PanelRightClose size={16} />
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
          <YStack flex={1} items="center" justify="center" gap="$2" p="$5">
            <SizableText size="$2" color="$soft">
              Nothing open here.
            </SizableText>
            <SizableText size="$2" color="$soft">
              Press + to open a tab.
            </SizableText>
          </YStack>
        ) : tab.kind === PAGE ? (
          <Page key={tab.id} tab={tab} onGo={(url) => side.go(tab.id, url)} />
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
      {/* The dim above the sheet, and a press on it puts the sheet away. It stops where the sheet starts. */}
      <YStack render="button" aria-label="Close the side panel" onPress={onHide} position="absolute" t={0} r={0} l={0} height="12dvh" bg="var(--surface-scrim)" />
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
