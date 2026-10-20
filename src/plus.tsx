/**
 * The composer's `+`: files, then what the conversation works with — agents,
 * skills, connectors, a design system, plugins, a device — then the Research
 * and Memory switches. A row is drawn only when the surface hands it a shelf:
 * a shelf is what is there (`rows`), what picking one does, and the ways to
 * make, manage and find more. A row with nothing behind it is not drawn.
 *
 * On a laptop each shelf opens beside the menu; on a phone it is a page of the
 * same menu, with Back.
 */
import { SizableText, useMedia, XStack } from '@hanzo/gui'
import {
  Blocks,
  Bot,
  Briefcase,
  Brain,
  Monitor,
  Palette,
  Paperclip,
  Plug,
  Plus as PlusIcon,
  ScrollText,
  Telescope,
} from '@hanzogui/lucide-icons-2'
import {
  DropdownMenu,
  DropdownMenuBack,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuItem,
  DropdownMenuLoading,
  DropdownMenuPage,
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@hanzo/ui'
import { Check } from '@hanzogui/lucide-icons-2'
import { useMemo, useState, type ReactNode } from 'react'

/** One thing a shelf holds. `on` marks what the conversation already has. */
export interface Row {
  id: string
  label: string
  icon?: ReactNode
  /** A few dim words beside the label, where they help. */
  note?: string
  on?: boolean
}

export interface Link {
  label: string
  onPress: () => void
}

export interface Shelf {
  rows: Row[]
  pick: (id: string) => void
  loading?: boolean
  error?: string | null
  /** A search field over the rows, with this placeholder. */
  search?: string
  /** Said when there are no rows and nothing is loading. */
  empty?: string
  create?: Link
  manage?: Link
  browse?: Link
}

export interface Switch {
  on: boolean
  set: (on: boolean) => void
}

export interface PlusProps {
  /** Upload or add files (Ctrl+U). */
  upload?: () => void
  agents?: Shelf
  skills?: Shelf
  connectors?: Shelf
  design?: Shelf
  plugins?: Shelf
  devices?: Shelf
  research?: Switch
  memory?: Switch
  disabled?: boolean
}

const ICON = 16

/** The shelves, in the menu's order, with their names and marks. */
const SHELVES = [
  { key: 'agents', label: 'Agents', icon: <Bot size={ICON} /> },
  { key: 'skills', label: 'Skills', icon: <ScrollText size={ICON} /> },
  { key: 'connectors', label: 'Connectors', icon: <Blocks size={ICON} /> },
  { key: 'design', label: 'Design system', icon: <Palette size={ICON} /> },
  { key: 'plugins', label: 'Plugins', icon: <Plug size={ICON} /> },
  { key: 'devices', label: 'Devices', icon: <Monitor size={ICON} /> },
] as const

type Key = (typeof SHELVES)[number]['key']

/** A row's anatomy: its mark, its label, a dim note, and a check when it is on. */
function Line({ icon, label, note, on, tail }: { icon?: ReactNode; label: string; note?: string; on?: boolean; tail?: ReactNode }) {
  return (
    <XStack flex={1} minW={0} items="center" gap={10}>
      {icon ? (
        <XStack width={ICON} height={ICON} items="center" justify="center" shrink={0} aria-hidden>
          {icon}
        </XStack>
      ) : null}
      <SizableText fontSize={14} color="$ink" numberOfLines={1} shrink={0}>
        {label}
      </SizableText>
      {note ? (
        <SizableText fontSize={13} color="$hint" numberOfLines={1} flex={1} minW={0}>
          {note}
        </SizableText>
      ) : (
        <XStack flex={1} />
      )}
      {tail}
      {on ? <Check size={ICON} color="var(--primary)" aria-hidden /> : null}
    </XStack>
  )
}

/** A shelf's rows, its status, then its ways to more. */
function Contents({ shelf, name, close }: { shelf: Shelf; name: string; close: () => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = needle ? shelf.rows.filter((r) => `${r.label} ${r.note ?? ''}`.toLowerCase().includes(needle)) : shelf.rows
  const links = [shelf.create, shelf.manage, shelf.browse].filter((l): l is Link => Boolean(l))
  return (
    <>
      {shelf.search ? <DropdownMenuSearch value={q} onValueChange={setQ} placeholder={shelf.search} aria-label={`Search ${name.toLowerCase()}`} /> : null}
      {shelf.loading && !shelf.rows.length ? <DropdownMenuLoading>Reading {name.toLowerCase()}</DropdownMenuLoading> : null}
      {shelf.error ? <DropdownMenuEmpty>{shelf.error}</DropdownMenuEmpty> : null}
      {!shelf.loading && !shelf.error && !rows.length ? <DropdownMenuEmpty>{needle ? 'Nothing matches' : (shelf.empty ?? `No ${name.toLowerCase()} yet`)}</DropdownMenuEmpty> : null}
      {rows.map((r) => (
        <DropdownMenuItem key={r.id} preventCloseOnSelect onSelect={() => shelf.pick(r.id)} aria-checked={r.on ?? false} data-slot="plus-row">
          <Line icon={r.icon} label={r.label} note={r.note} on={r.on} />
        </DropdownMenuItem>
      ))}
      {links.length ? <DropdownMenuSeparator /> : null}
      {links.map((l, i) => (
        <DropdownMenuItem
          key={l.label}
          onSelect={() => {
            close()
            l.onPress()
          }}
        >
          <Line icon={l === shelf.manage ? <Briefcase size={ICON} /> : <PlusIcon size={ICON} />} label={l.label} />
        </DropdownMenuItem>
      ))}
    </>
  )
}

/** The `+` and its menu. */
export function Plus(p: PlusProps) {
  const media = useMedia()
  const wide = media.sm
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const shelves = useMemo(() => SHELVES.filter((s) => p[s.key as Key]), [p])
  const switches = [
    p.research ? { key: 'research', label: 'Research', icon: <Telescope size={ICON} />, s: p.research } : null,
    p.memory ? { key: 'memory', label: 'Memory', icon: <Brain size={ICON} />, s: p.memory } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)

  const main = (
    <>
      {p.upload ? (
        <DropdownMenuItem
          data-slot="plus-upload"
          onSelect={() => {
            close()
            p.upload?.()
          }}
        >
          <Line icon={<Paperclip size={ICON} />} label="Upload or add files" tail={<DropdownMenuShortcut>Ctrl+U</DropdownMenuShortcut>} />
        </DropdownMenuItem>
      ) : null}
      {p.upload && shelves.length ? <DropdownMenuSeparator /> : null}
      {shelves.map((s) =>
        wide ? (
          <DropdownMenuSub key={s.key}>
            <DropdownMenuSubTrigger data-slot={`plus-${s.key}`}>
              <Line icon={s.icon} label={s.label} />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent minW={200} maxW={340} maxH={420} style={{ overflowY: 'auto' }}>
              <Contents shelf={p[s.key as Key]!} name={s.label} close={close} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem key={s.key} page={s.key} data-slot={`plus-${s.key}`}>
            <Line icon={s.icon} label={s.label} />
          </DropdownMenuItem>
        ),
      )}
      {switches.length && (p.upload || shelves.length) ? <DropdownMenuSeparator /> : null}
      {switches.map((w) => (
        <DropdownMenuItem key={w.key} preventCloseOnSelect onSelect={() => w.s.set(!w.s.on)} role={'menuitemcheckbox' as never} aria-checked={w.s.on} data-slot={`plus-${w.key}`}>
          <Line icon={w.icon} label={w.label} on={w.s.on} />
        </DropdownMenuItem>
      ))}
    </>
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} {...(wide ? null : { defaultPage: 'main' })}>
      <DropdownMenuTrigger asChild disabled={p.disabled}>
        <XStack
          render="button"
          data-slot="plus"
          aria-label="Add files, agents, skills and more"
          width={32}
          height={32}
          rounded={8}
          items="center"
          justify="center"
          shrink={0}
          cursor={p.disabled ? 'default' : 'pointer'}
          opacity={p.disabled ? 0.4 : 1}
          bg={open ? '$hover' : 'transparent'}
          hoverStyle={{ bg: '$hover' }}
          focusVisibleStyle={{ outlineColor: '$outlineColor', outlineWidth: 2, outlineStyle: 'solid' }}
          $max-sm={{ width: 44, height: 44, rounded: 22 }}
        >
          <PlusIcon size={18} color="$ink" />
        </XStack>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" minW={240} data-slot="plus-menu">
        {wide ? (
          main
        ) : (
          <>
            <DropdownMenuPage id="main">{main}</DropdownMenuPage>
            {shelves.map((s) => (
              <DropdownMenuPage key={s.key} id={s.key}>
                <DropdownMenuBack>{s.label}</DropdownMenuBack>
                <Contents shelf={p[s.key as Key]!} name={s.label} close={close} />
              </DropdownMenuPage>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
