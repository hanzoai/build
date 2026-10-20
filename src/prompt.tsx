/**
 * The composer, once, for Chat and Dev. A frame: the field on top ("Type / for
 * skills"), and under it one row — `+` at the start, what the conversation
 * carries as small chips, then at the end dictation (the mic and its menu) and
 * one round button that is voice mode while the draft is empty, send once it
 * has words, and stop while a turn runs. Nothing else is in the frame.
 *
 * Under the frame, at its end, one quiet row: the model, the effort (dim) and
 * the mode as a pill, each opening its choices; Dev puts where the run goes
 * and its repository at the row's start (`where`). Under that, the person's
 * suggestions (`below`; above the frame on a phone).
 *
 * `/` opens the skills and `@` the plugins, in a list just above the frame.
 *
 * `prompt` builds @hanzo/ui's `Composer` props, so a surface that draws the
 * composer through `Chat` (its `composer` prop) and one that draws it directly
 * (`<Prompt>`) draw the same thing. The frame is as wide as the text above it
 * (`measure`).
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import { ArrowUp, AudioLines, Check, Square, X } from '@hanzogui/lucide-icons-2'
import { Control } from '@hanzo/composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSearch, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@hanzo/ui'
import { Composer, type ComposerProps } from '@hanzo/ui/chat'
import { groupModels, matchesModel, type PauseSource } from '@hanzo/ui/models'
import { speech, Voice, type Machine, type Speech } from '@hanzo/voice'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { Target } from './api/call.ts'
import { ENSO } from './api/models.ts'
import { MODES, type Mode } from './gear.ts'
import { Dictation } from './mic.tsx'
import { EFFORTS, grants, nameOf, reasons, ROUTER_IDS, type Mind } from './mind.ts'
import { Plus, type PlusProps, type Shelf } from './plus.tsx'

/** The reading measure: @hanzo/design's prose width, which Width (appearance) retunes. */
export const MEASURE = 'var(--container-prose, 48rem)'

/** The space between turns, px: one rhythm for Chat and Dev. */
export const GAP = 20

/** The composer's width: the measure less the thread column's 0.75rem gutters, centred, so its edges are the text's. */
export const measure = { width: 'calc(100% - 1.5rem)', maxW: `calc(${MEASURE} - 1.5rem)`, mx: 'auto' } as const

/** The round controls' box, px, and a phone's, a finger's width. */
export const ROUND = 32
const TAP = 44

/** The frame's corner, px: 12 on a laptop, 22 on a phone. */
const CORNER = 12
const CORNER_PHONE = 22

/** The ink on a filled round: the accent's own foreground (gui's icons default to the theme's text). */
const ON = 'var(--primary-foreground)'

/** A round control with no ground of its own until it is pointed at. */
const QUIET = { bg: 'transparent', color: 'var(--foreground)', hoverStyle: { bg: '$hover' } } as const

/** The model rows the menu draws before anything is typed. */
const SHOWN = 40

/** What every Composer placeholder says, unless a surface names who is listening. */
export const ASK = 'Type / for skills'

/**
 * The frame as a pane of its own, floating on the pane it is drawn in: the
 * `--pane-*` cut on design's first paper rung.
 */
export const cut = {
  bg: 'var(--pane-fill, var(--sheet-1))',
  rounded: 'var(--pane-round, var(--radius-xl))',
  borderWidth: 1,
  borderColor: 'var(--pane-edge, var(--white-08))',
  backdropFilter: 'var(--pane-blur, blur(20px) saturate(1.8))',
  boxShadow: 'var(--shadow-sheet-1)',
} as const

/** The platform's ear and voice for a target: dictation, talk and Listen all hear through it. */
export function useEar(t: Target): Speech {
  return useMemo(() => speech({ baseUrl: t.api, token: t.token, ...(t.org ? { org: t.org } : {}) }), [t])
}

/** One thing the conversation carries, shown after `+`. */
export interface Chip {
  id: string
  label: string
  icon?: ReactNode
  onRemove: () => void
}

export interface PromptOptions {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  /** Stop the turn in flight. Absent, busy only disables send. */
  onStop?: () => void
  busy?: boolean
  disabled?: boolean
  /** Whether send is lit. Default: the draft has words. */
  ready?: boolean
  placeholder?: string
  label?: string
  /** Above the frame, at its width: what the draft is sent with. */
  head?: ReactNode
  field?: ComposerProps['field']
  /** The model and effort. Null where the next send uses neither (steering a run). */
  mind?: Mind | null
  limits?: PauseSource | null
  /** A model the plan does not grant was asked for: the way to the plan that does. */
  onUpgrade?: (model: string) => void
  /** The `+` menu. Absent, there is none. */
  plus?: PlusProps
  /** What the conversation carries, as chips after `+`. */
  on?: Chip[]
  /** `/` lists these (the skills) above the frame. */
  slash?: Shelf
  /** `@` lists these (the plugins) above the frame. */
  at?: Shelf
  /** The mode, as the pill under the frame. */
  mode?: { value: Mode; set: (m: Mode) => void } | null
  /** At the start of the row under the frame: Dev's where and which repository. */
  where?: ReactNode
  /** Under the row (above the frame on a phone): the person's suggestions. */
  below?: ReactNode
  /** Dictation into the draft (@hanzo/voice `useVoice` + `useDictation`). */
  voice?: Machine
  /** The language dictation listens in, null for Auto, and how to change it. */
  language?: string | null
  onLanguage?: (id: string | null) => void
  /** A spoken conversation (@hanzo/voice `useTalk`): the round button while the draft is empty. */
  talk?: Machine
  /** Drawn on a pane: the frame is cut as a pane of its own (`cut`). */
  framed?: boolean
  /** Centred just above the frame: what every message is sent under. */
  note?: ReactNode
  /** A phone: suggestions go above the frame and every target is 44px. */
  narrow?: boolean
}

/** A text button in the row under the frame. */
function Word({ children, dim = false, label, open }: { children: ReactNode; dim?: boolean; label: string; open: boolean }) {
  return (
    <XStack
      render="button"
      aria-label={label}
      aria-expanded={open}
      items="center"
      height={24}
      px={6}
      rounded={6}
      cursor="pointer"
      bg={open ? '$hover' : 'transparent'}
      hoverStyle={{ bg: '$hover' }}
      focusVisibleStyle={{ outlineColor: '$outlineColor', outlineWidth: 2, outlineStyle: 'solid' }}
      $max-sm={{ height: 44, px: 8 }}
    >
      <SizableText fontSize={14} fontWeight={dim ? '400' : '500'} color={dim ? '$hint' : '$ink'} numberOfLines={1}>
        {children}
      </SizableText>
    </XStack>
  )
}

/** A titled list of choices, each with a line saying what it does and a check on the one in force. */
function Choices<T extends string>({
  title,
  items,
  value,
  onPick,
}: {
  title: string
  items: readonly { id: T; label: string; note: string; off?: boolean }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <YStack role={"listbox" as never} aria-label={title} gap={2} data-slot="choices">
      <SizableText fontSize={13} color="$hint" px={10} pt={6} pb={4}>
        {title}
      </SizableText>
      {items.map((c) => (
        <XStack
          key={c.id}
          render="button"
          role="option"
          aria-selected={c.id === value}
          aria-disabled={c.off || undefined}
          onPress={() => !c.off && onPick(c.id)}
          items="flex-start"
          gap={12}
          px={10}
          py={8}
          rounded={8}
          width="100%"
          cursor={c.off ? 'default' : 'pointer'}
          opacity={c.off ? 0.5 : 1}
          hoverStyle={c.off ? undefined : { bg: '$hover' }}
        >
          <YStack flex={1} minW={0} items="flex-start" gap={2}>
            <SizableText fontSize={14} color="$ink" style={{ textAlign: 'left' }}>
              {c.label}
            </SizableText>
            <SizableText fontSize={13} color="$hint" style={{ textAlign: 'left' }}>
              {c.note}
            </SizableText>
          </YStack>
          {c.id === value ? <Check size={16} color="var(--primary)" mt={2} aria-hidden /> : null}
        </XStack>
      ))}
    </YStack>
  )
}

/** A word in the row that opens a panel of choices. */
function Opens({ label, word, dim, children }: { label: string; word: ReactNode; dim?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} allowFlip placement="top-end">
      <PopoverTrigger asChild>
        <XStack>
          <Word label={label} dim={dim} open={open}>
            {word}
          </Word>
        </XStack>
      </PopoverTrigger>
      <PopoverContent solid p={6} width={288} maxW="calc(100vw - 24px)">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

/** The model's name, and the catalog behind it: Free's lane to pick from, the rest an upgrade. */
function Model({ mind, onUpgrade }: { mind: Mind; onUpgrade?: (model: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  // The catalog is hundreds long, and drawing all of it is what made the menu slow
  // to open: until something is typed, the first `SHOWN` rows, Hanzo's families
  // first, and a line saying the search reaches the rest.
  const { groups, more } = useMemo(() => {
    const list = mind.models.filter((m) => !ROUTER_IDS.has(m.id) && (m.outputs?.includes('text') ?? true) && (!q.trim() || matchesModel(m, q)))
    const all = groupModels(list)
    let room = q.trim() ? Infinity : SHOWN
    const cut = all
      .map((g) => {
        const models = g.models.slice(0, Math.max(0, room))
        room -= models.length
        return { ...g, models }
      })
      .filter((g) => g.models.length)
    return { groups: cut, more: list.length - cut.reduce((n, g) => n + g.models.length, 0) }
  }, [mind.models, q])
  const routed = mind.model === ENSO
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} placement="top-end">
      <DropdownMenuTrigger asChild>
        <XStack data-slot="mind">
          <Word label={`Model: ${nameOf(mind.model, mind.models)}`} open={open}>
            {nameOf(mind.model, mind.models)}
          </Word>
        </XStack>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW={280} data-slot="model-menu">
        <DropdownMenuSearch value={q} onValueChange={setQ} placeholder="Search models" />
        {/* The catalog is hundreds long: the rows scroll under the search, which stays. */}
        <YStack maxH="min(420px, 60vh)" overflowY="auto" overflowX="hidden" data-slot="model-rows">
        {!mind.free && !q.trim() ? (
          <DropdownMenuItem onSelect={() => mind.pick(ENSO)}>
            <XStack flex={1} items="center" gap={8}>
              <YStack flex={1}>
                <SizableText fontSize={14} color="$ink">
                  Enso
                </SizableText>
                <SizableText fontSize={12} color="$hint">
                  Picks the model for each message and step
                </SizableText>
              </YStack>
              {routed ? <Check size={14} color="var(--primary)" aria-hidden /> : null}
            </XStack>
          </DropdownMenuItem>
        ) : null}
        {groups.map((g) => (
          <YStack key={g.key} role="group" aria-label={g.label}>
            <SizableText fontSize={12} color="$hint" px={8} pt={8} pb={2}>
              {g.label}
            </SizableText>
            {g.models.map((m) => {
              const ok = grants(mind.free, m.id, mind.models)
              return (
                <DropdownMenuItem
                  key={m.id}
                  data-slot="model-row"
                  onSelect={() => (ok ? mind.pick(m.id) : onUpgrade?.(m.id))}
                >
                  <XStack flex={1} items="center" gap={8}>
                    <SizableText fontSize={14} color={ok ? '$ink' : '$hint'} numberOfLines={1} flex={1}>
                      {nameOf(m.id, mind.models)}
                    </SizableText>
                    {ok ? null : (
                      <SizableText fontSize={12} color="$hint" px={6} py={1} rounded={6} borderWidth={1} borderColor="$borderColor">
                        Upgrade
                      </SizableText>
                    )}
                    {m.id === mind.model ? <Check size={14} color="var(--primary)" aria-hidden /> : null}
                  </XStack>
                </DropdownMenuItem>
              )
            })}
          </YStack>
        ))}
        {more > 0 ? (
          <SizableText fontSize={12} color="$hint" px={8} py={8}>
            {`Type to search ${more} more models`}
          </SizableText>
        ) : null}
        </YStack>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The row under the frame: where (Dev), then the model, the effort and the mode. */
export function Tune({ mind, mode, where, onUpgrade }: { mind?: Mind | null; mode?: PromptOptions['mode']; where?: ReactNode; onUpgrade?: (model: string) => void }) {
  const thinks = mind ? reasons(mind.model, mind.models) : false
  const pace = mind ? EFFORTS.find((e) => e.id === mind.effort)! : null
  return (
    <XStack data-slot="tune" width="100%" items="center" gap={2} flexWrap="wrap" rowGap={4}>
      {where ? (
        // On a phone where the run goes takes its own line, and the model, effort and mode the next.
        <XStack items="center" gap={2} flexWrap="wrap" minW={0} $max-sm={{ width: '100%' }}>
          {where}
        </XStack>
      ) : null}
      <XStack flex={1} $max-sm={{ display: 'none' }} />
      <XStack items="center" gap={2} ml="auto" shrink={0}>
      {mind ? <Model mind={mind} onUpgrade={onUpgrade} /> : null}
      {mind && thinks && pace ? (
        <Opens label={`Effort: ${pace.label}`} word={pace.label} dim>
          {(close) => (
            <Choices
              title="Effort"
              items={EFFORTS}
              value={mind.effort}
              onPick={(e) => {
                mind.pace(e)
                close()
              }}
            />
          )}
        </Opens>
      ) : null}
      {mode ? (
        <Popover allowFlip placement="top-end">
          <PopoverTrigger asChild>
            <XStack
              render="button"
              data-slot="mode"
              aria-label={`Mode: ${MODES.find((m) => m.id === mode.value)?.label}`}
              items="center"
              height={24}
              px={8}
              ml={4}
              rounded={6}
              bg="$hover"
              cursor="pointer"
              hoverStyle={{ bg: '$raised' }}
              focusVisibleStyle={{ outlineColor: '$outlineColor', outlineWidth: 2, outlineStyle: 'solid' }}
              $max-sm={{ height: 44, px: 12 }}
            >
              <SizableText fontSize={14} color="$ink">
                {MODES.find((m) => m.id === mode.value)?.label}
              </SizableText>
            </XStack>
          </PopoverTrigger>
          <PopoverContent solid p={6} width={288} maxW="calc(100vw - 24px)">
            <Choices title="Mode" items={MODES} value={mode.value} onPick={mode.set} />
          </PopoverContent>
        </Popover>
      ) : null}
      </XStack>
    </XStack>
  )
}

/** The `/` or `@` the caret ends on, and the words typed after it. */
export function trigger(value: string): { char: '/' | '@'; query: string; at: number } | null {
  const m = /(^|\s)([/@])([^\s/@]*)$/.exec(value)
  return m ? { char: m[2] as '/' | '@', query: m[3]!.toLowerCase(), at: m.index + m[1]!.length } : null
}

/** The list `/` or `@` opens above the frame. */
function Mention({ shelf, rows, index, onPick, tag, name }: { shelf: Shelf; rows: Shelf['rows']; index: number; onPick: (id: string) => void; tag: string; name: string }) {
  return (
    <YStack
      role={"listbox" as never}
      aria-label={name}
      data-slot="mention"
      width="100%"
      maxH={240}
      overflowY="auto"
      overflowX="hidden"
      p={6}
      rounded={CORNER}
      borderWidth={1}
      borderColor="$borderColor"
      bg="$background"
      $max-sm={{ rounded: CORNER_PHONE }}
    >
      <SizableText fontSize={13} color="$hint" px={8} pt={4} pb={6}>
        {shelf.search ?? `Type to search ${name.toLowerCase()}`}
      </SizableText>
      {rows.length ? (
        rows.map((r, i) => (
          <XStack
            key={r.id}
            render="button"
            role="option"
            aria-selected={i === index}
            onPress={() => onPick(r.id)}
            items="center"
            gap={10}
            px={8}
            height={36}
            rounded={8}
            bg={i === index ? '$hover' : 'transparent'}
            hoverStyle={{ bg: '$hover' }}
            cursor="pointer"
            $max-sm={{ height: 46 }}
          >
            {r.icon ? (
              <XStack width={16} items="center" justify="center" aria-hidden>
                {r.icon}
              </XStack>
            ) : null}
            {/* A button centres its words unless told: a list reads from the left. */}
            <SizableText fontSize={15} color="$ink" numberOfLines={1} flex={1} style={{ textAlign: 'left' }}>
              {r.label}
            </SizableText>
            <SizableText fontSize={13} color="$hint">
              {r.on ? 'On' : tag}
            </SizableText>
          </XStack>
        ))
      ) : (
        <SizableText fontSize={14} color="$hint" px={8} py={8}>
          {shelf.loading ? 'Reading…' : 'Nothing matches'}
        </SizableText>
      )}
    </YStack>
  )
}

/** @hanzo/ui `Composer` props for the one composer. */
export function prompt(o: PromptOptions, state?: { index: number; closed: string | null }): ComposerProps {
  const lit = o.ready ?? Boolean(o.value.trim())
  const busy = Boolean(o.busy)
  const disabled = Boolean(o.disabled)
  const live = busy ? Boolean(o.onStop) : lit && !disabled
  const narrow = Boolean(o.narrow)

  // `/` and `@`: the shelf the caret's word opens, filtered by what follows it.
  const typed = trigger(o.value)
  const shelf = typed ? (typed.char === '/' ? o.slash : o.at) : undefined
  const listed = shelf && typed && state?.closed !== o.value ? shelf.rows.filter((r) => r.label.toLowerCase().includes(typed.query)).slice(0, 8) : null
  const index = Math.min(state?.index ?? 0, Math.max(0, (listed?.length ?? 1) - 1))
  const choose = (id: string) => {
    if (!typed || !shelf) return
    o.onChange(o.value.slice(0, typed.at).trimEnd() + (typed.at > 0 ? ' ' : ''))
    shelf.pick(id)
  }

  const mention =
    listed && shelf && typed ? (
      <Mention shelf={shelf} rows={listed} index={index} onPick={choose} tag={typed.char === '/' ? 'Skill' : 'Plugin'} name={typed.char === '/' ? 'Skills' : 'Plugins'} />
    ) : null

  const head =
    o.head || o.note || mention || (narrow && o.below) ? (
      <YStack {...measure} gap="$1.5" data-slot="prompt-head">
        {narrow ? o.below : null}
        {o.head}
        {mention}
        {o.note ? (
          <SizableText data-slot="prompt-note" fontSize={12} color="$soft" text="center" self="center">
            {o.note}
          </SizableText>
        ) : null}
      </YStack>
    ) : undefined

  const foot =
    o.mind || o.mode || o.where || (!narrow && o.below) ? (
      <YStack {...measure} gap={10} data-slot="prompt-foot">
        <Tune mind={o.mind} mode={o.mode} where={o.where} onUpgrade={o.onUpgrade} />
        {narrow ? null : o.below}
      </YStack>
    ) : undefined

  const round = (
    <Control
      type="button"
      size={narrow ? TAP : ROUND}
      fill
      rounded={999}
      data-slot="composer-send"
      aria-label={busy ? 'Stop' : 'Send'}
      aria-disabled={!live || undefined}
      opacity={live ? 1 : 0.4}
      onClick={() => {
        if (!live) return
        if (busy) o.onStop?.()
        else o.onSend()
      }}
    >
      {busy ? <Square size={13} color={ON} fill={ON} /> : <ArrowUp size={16} strokeWidth={2.5} color={ON} />}
    </Control>
  )

  return {
    value: o.value,
    onChange: o.onChange,
    onSend: () => {
      if (listed?.length) return choose(listed[index]!.id)
      o.onSend()
    },
    ...(o.onStop ? { onStop: o.onStop } : {}),
    busy,
    disabled,
    placeholder: o.placeholder ?? ASK,
    ...(o.label ? { label: o.label } : {}),
    rows: 2,
    field: {
      ...o.field,
      fontSize: 16,
      lineHeight: 24,
      px: 8,
      pt: 2,
      minH: 48,
      bg: 'transparent',
    },
    head,
    foot,
    ...measure,
    rounded: CORNER,
    p: 8,
    pt: 12,
    gap: 6,
    borderColor: '$borderColor',
    bg: '$edge',
    '$max-sm': { rounded: CORNER_PHONE },
    ...(o.framed ? { boxShadow: 'var(--shadow-sheet-1)' } : null),
    children: (
      <XStack items="center" gap={4} data-slot="prompt-start" flex={1} minW={0} flexWrap="wrap">
        {o.plus ? <Plus {...o.plus} disabled={disabled || o.plus.disabled} /> : null}
        {(o.on ?? []).map((c) => (
          <XStack key={c.id} data-slot="prompt-chip" items="center" gap={6} pl={8} pr={4} height={28} rounded={8} bg="$hover" maxW={180}>
            {c.icon ? <XStack aria-hidden>{c.icon}</XStack> : null}
            <SizableText fontSize={13} color="$ink" numberOfLines={1} shrink={1}>
              {c.label}
            </SizableText>
            <XStack render="button" aria-label={`Remove ${c.label}`} onPress={c.onRemove} width={20} height={20} rounded={6} items="center" justify="center" hoverStyle={{ bg: '$raised' }} cursor="pointer">
              <X size={12} color="$hint" />
            </XStack>
          </XStack>
        ))}
      </XStack>
    ),
    send: (
      <XStack items="center" gap={6} data-slot="prompt-end" shrink={0}>
        {o.voice ? <Dictation voice={o.voice} disabled={disabled} narrow={narrow} language={o.language ?? null} {...(o.onLanguage ? { onLanguage: o.onLanguage } : {})} /> : null}
        {!busy && !lit && o.talk ? (
          // Voice mode is a plain mark on a laptop, as the mic is, and the filled round on a phone.
          <Control asChild size={narrow ? TAP : ROUND} fill={narrow} rounded={999} {...(narrow ? null : QUIET)}>
            <Voice
              voice={o.talk}
              disabled={disabled}
              data-slot="composer-talk"
              says={{ idle: 'Voice mode', listening: 'In conversation — click to hang up', speaking: 'Hanzo is speaking — talk to interrupt' }}
            >
              {() => <AudioLines size={16} color={narrow ? ON : 'var(--foreground)'} />}
            </Voice>
          </Control>
        ) : (
          round
        )}
      </XStack>
    ),
  }
}

/** Ctrl+U (⌘U) uploads, while a composer with an upload is on the page. */
export function useUpload(upload: (() => void) | undefined): void {
  const now = useRef(upload)
  now.current = upload
  useEffect(() => {
    if (!upload) return
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        now.current?.()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [Boolean(upload)]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The composer's own state — which row of a `/` or `@` list is lit — and the
 * keys that move it. A surface that hands `prompt` to `Chat` calls this and
 * passes its answer through; `<Prompt>` does it for itself.
 */
export function useMention(o: PromptOptions): { state: { index: number; closed: string | null }; field: ComposerProps['field'] } {
  const [index, setIndex] = useState(0)
  const [closed, setClosed] = useState<string | null>(null)
  useUpload(o.plus?.upload)
  const typed = trigger(o.value)
  const shelf = typed ? (typed.char === '/' ? o.slash : o.at) : undefined
  const open = Boolean(shelf && closed !== o.value)
  useEffect(() => setIndex(0), [typed?.char, typed?.query])
  const field = {
    ...o.field,
    onKeyDown: (e: { key?: string; preventDefault?: () => void; nativeEvent?: { key?: string } }) => {
      const key = e.key ?? e.nativeEvent?.key
      if (open && key === 'ArrowDown') {
        e.preventDefault?.()
        setIndex((i) => i + 1)
      } else if (open && key === 'ArrowUp') {
        e.preventDefault?.()
        setIndex((i) => Math.max(0, i - 1))
      } else if (open && key === 'Escape') {
        e.preventDefault?.()
        setClosed(o.value)
      } else (o.field as { onKeyDown?: (e: unknown) => void } | undefined)?.onKeyDown?.(e)
    },
  } as ComposerProps['field']
  return { state: { index, closed }, field }
}

/** The composer drawn on its own. */
export function Prompt(o: PromptOptions) {
  const media = useMedia()
  const { state, field } = useMention(o)
  return <Composer {...prompt({ ...o, field, narrow: o.narrow ?? !media.sm }, state)} />
}
