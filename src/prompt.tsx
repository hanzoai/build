/**
 * The composer, once, for Chat and Dev: one pill. While the draft is a line,
 * the pill is one row — attach (`+`) and the surface's own tools at the start,
 * the field, then the model and effort (`Tune`), dictation, talk and send. A
 * draft longer than a line takes the pill's whole width above, and the
 * controls keep the bottom row. A note the surface owes every message (the
 * "can make mistakes" line) stands centred just above the pill.
 *
 * `prompt` builds @hanzo/ui's `Composer` props, so a surface that draws the
 * composer through `Chat` (its `composer` prop) and one that draws it directly
 * (`<Prompt>`) draw the same thing. What each surface sends, and what it puts
 * above the frame (`head`), stays its own.
 *
 * The frame is as wide as the text above it: the reading measure, less the
 * thread column's own gutters, centred (`measure`). A transcript reads at
 * `MEASURE` and this lines up with its words.
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import { ArrowUp, AudioLines, Check, ChevronDown, Mic, Plus, Square } from '@hanzogui/lucide-icons-2'
import { Control } from '@hanzo/composer'
import { Popover, PopoverContent, PopoverTrigger, Separator, Tooltip, TooltipContent, TooltipTrigger } from '@hanzo/ui'
import { Composer, type ComposerProps } from '@hanzo/ui/chat'
import { ModelPicker, type PauseSource } from '@hanzo/ui/models'
import { speech, Voice, type Machine, type Speech } from '@hanzo/voice'
import { useMemo, useState, type ReactNode } from 'react'

import type { Target } from './api/call.ts'
import { ENSO } from './api/models.ts'
import { EFFORTS, nameOf, reasons, type Mind } from './mind.ts'

/** The reading measure: @hanzo/design's prose width, which Width (appearance) retunes. */
export const MEASURE = 'var(--container-prose, 48rem)'

/** The space between turns, px: one rhythm for Chat and Dev. */
export const GAP = 20

/** The composer's width: the measure less the thread column's 0.75rem gutters, centred, so its edges are the text's. */
export const measure = { width: 'calc(100% - 1.5rem)', maxW: `calc(${MEASURE} - 1.5rem)`, mx: 'auto' } as const

/** The round controls' box, px: the pill's row less its padding. */
export const ROUND = 32

/** The pill's height on one line, px, and the corner a taller draft keeps. */
const PILL = 44
const CORNER = 22

/** About a line of draft at the measure: past it, or past a newline, the field takes the pill's width. */
const LINE = 72

/**
 * The frame as a pane of its own, floating on the pane it is drawn in: the
 * `--pane-*` cut on design's first paper rung (a second rung's drop reads as a
 * gradient through a translucent pane).
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
  /** The paperclip. Absent, there is none. */
  onAttach?: () => void
  /** After the paperclip: what this surface alone offers (Dev's mode). */
  tools?: ReactNode
  /** Dictation into the draft (@hanzo/voice `useVoice` + `useDictation`). */
  voice?: Machine
  /** A spoken conversation (@hanzo/voice `useTalk`). */
  talk?: Machine
  /** Drawn on a pane: the frame is cut as a pane of its own (`cut`). */
  framed?: boolean
  /** Centred just above the pill: what every message is sent under. */
  note?: ReactNode
  /** A phone: the field takes the pill's whole width above the controls, whatever the draft. */
  narrow?: boolean
}

/** Enso's mark: the ring. */
function Ring() {
  return <YStack aria-hidden width={12} height={12} rounded={99} borderWidth={1.5} borderColor="$ink" shrink={0} />
}

/**
 * The chip beside send, and the panel it opens: the effort, a sentence saying
 * what serves the ask, and the model.
 */
export function Tune({ mind, limits, disabled = false }: { mind: Mind; limits?: PauseSource | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const name = nameOf(mind.model, mind.models)
  const thinks = reasons(mind.model, mind.models)
  const pace = EFFORTS.find((e) => e.id === mind.effort)!
  const routed = mind.model === ENSO
  return (
    // Above the chip when there is no room below it, so the model list at its
    // foot stays on screen. Solid: it stands over a transcript that streams.
    <Popover open={open} onOpenChange={setOpen} allowFlip>
      <PopoverTrigger disabled={disabled}>
        <XStack
          data-slot="mind"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={thinks ? `Model and effort: ${name}, ${pace.label}` : `Model: ${name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          items="center"
          gap="$1.5"
          px="$2.5"
          height={ROUND}
          maxW={220}
          rounded={999}
          cursor={disabled ? 'default' : 'pointer'}
          hoverStyle={disabled ? undefined : { bg: '$hover' }}
          focusVisibleStyle={{ outlineColor: '$outlineColor', outlineWidth: 2, outlineStyle: 'solid' }}
          opacity={disabled ? 0.4 : 1}
          onKeyDown={(e: { key?: string; preventDefault?: () => void }) => {
            if (disabled || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
            e.preventDefault?.()
            setOpen(true)
          }}
        >
          {routed ? <Ring /> : null}
          <SizableText size="$1" color="$ink" fontWeight="600" numberOfLines={1} minW={0} shrink={1}>
            {name}
          </SizableText>
          {thinks ? (
            <SizableText size="$1" color="$soft" fontWeight="500" shrink={0}>
              {pace.label}
            </SizableText>
          ) : null}
          <ChevronDown size={12} color="$soft" aria-hidden />
        </XStack>
      </PopoverTrigger>

      <PopoverContent solid align="end" p={6} width={280}>
        <YStack gap="$1" data-slot="mind-panel" role="dialog" aria-label="Model and effort">
          {EFFORTS.map((e) => (
            <XStack
              key={e.id}
              render="button"
              role="button"
              aria-pressed={e.id === mind.effort}
              aria-disabled={!thinks || undefined}
              onPress={() => {
                if (!thinks) return
                mind.pace(e.id)
                setOpen(false)
              }}
              items="center"
              gap="$2"
              px="$2"
              py="$2"
              rounded="$3"
              width="100%"
              opacity={thinks ? 1 : 0.45}
              cursor={thinks ? 'pointer' : 'default'}
              hoverStyle={thinks ? { bg: '$hover' } : undefined}
            >
              {/* A menu row reads from the left; a button centres its text unless told. */}
              <YStack flex={1} minW={0} items="flex-start">
                <SizableText size="$2" color="$ink" style={{ textAlign: 'left' }}>
                  {e.label}
                </SizableText>
                <SizableText size="$1" color="$soft" style={{ textAlign: 'left' }}>
                  {e.note}
                </SizableText>
              </YStack>
              {e.id === mind.effort && thinks ? <Check size={14} aria-hidden /> : null}
            </XStack>
          ))}
          <Separator my="$1" />
          <YStack px="$2" pt="$1" pb="$2" gap="$2">
            <SizableText size="$1" color="$soft" data-slot="mind-note">
              {routed
                ? 'Enso picks the model for each message and step. Pick one to use it instead.'
                : `${name} answers every message and step${thinks ? '' : ', without an effort setting'}.`}
            </SizableText>
            {routed ? null : (
              // The way back to the router, which the catalog may not list as a row.
              <XStack
                render="button"
                role="button"
                aria-label="Use Enso"
                onPress={() => {
                  mind.pick(ENSO)
                  setOpen(false)
                }}
                items="center"
                gap="$2"
                px="$2"
                height={28}
                rounded="$3"
                self="flex-start"
                borderWidth={1}
                borderColor="$borderColor"
                cursor="pointer"
                hoverStyle={{ bg: '$hover' }}
              >
                <Ring />
                <SizableText size="$1" color="$ink">
                  Use Enso
                </SizableText>
              </XStack>
            )}
            <ModelPicker
              size="sm"
              name="Model"
              models={mind.models}
              limits={limits}
              // The router is named on the chip; a catalog that does not list it leaves the picker open.
              value={routed && !mind.models.some((m) => m.id === ENSO) ? undefined : mind.model}
              placeholder="Pick a model"
              onChange={(id) => {
                mind.pick(id)
                setOpen(false)
              }}
              loading={mind.loading}
              error={mind.error}
            />
          </YStack>
        </YStack>
      </PopoverContent>
    </Popover>
  )
}

/** The pill's `+`: files go with the message. Its name on hover. */
function Attach({ onAttach, disabled }: { onAttach: () => void; disabled: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Control type="button" size={ROUND} aria-label="Attach files" aria-disabled={disabled || undefined} onClick={disabled ? undefined : onAttach}>
          <Plus size={18} />
        </Control>
      </TooltipTrigger>
      <TooltipContent>
        <SizableText size="$2">Attach files</SizableText>
      </TooltipContent>
    </Tooltip>
  )
}

/** @hanzo/ui `Composer` props for the one composer. */
export function prompt(o: PromptOptions): ComposerProps {
  const lit = o.ready ?? Boolean(o.value.trim())
  const busy = Boolean(o.busy)
  const disabled = Boolean(o.disabled)
  const live = busy ? Boolean(o.onStop) : lit && !disabled
  // A draft past a line takes the pill's width above the controls. The same
  // field either way, moved by flex order alone: a different tree would remount
  // it and drop the caret mid-word.
  const tall = Boolean(o.narrow) || o.value.includes('\n') || o.value.length > LINE
  const head = o.head || o.note ? (
    <YStack {...measure} gap="$1.5" data-slot="prompt-head">
      {o.head}
      {o.note ? (
        <SizableText data-slot="prompt-note" fontSize={12} color="$soft" text="center" self="center">
          {o.note}
        </SizableText>
      ) : null}
    </YStack>
  ) : undefined
  return {
    value: o.value,
    onChange: o.onChange,
    onSend: o.onSend,
    ...(o.onStop ? { onStop: o.onStop } : {}),
    busy,
    disabled,
    ...(o.placeholder ? { placeholder: o.placeholder } : {}),
    ...(o.label ? { label: o.label } : {}),
    // The field: first and the pill's width on a tall draft, after `+` on a line.
    // inline-style: flex `order`, which no gui prop carries; the field keeps its node either way.
    // An empty field keeps its placeholder to the line, cut short rather than wrapped inside the pill.
    field: {
      ...o.field,
      style: { ...((o.field as { style?: object } | undefined)?.style ?? {}), order: tall ? 0 : 1, ...(o.value ? null : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) },
      ...(tall ? { width: '100%', flexBasis: '100%', px: '$2' } : null),
      // A phone keeps the field a readable width: what does not fit beside it goes to a second row.
      '$max-sm': { minW: 140 },
    },
    // Above the pill and at its width, so a chip lines up with the field's edge.
    head,
    inline: true,
    ...measure,
    minH: PILL,
    rounded: tall ? CORNER : 999,
    pl: 6,
    pr: 6,
    gap: 4,
    items: tall ? 'flex-end' : 'center',
    flexWrap: tall ? 'wrap' : 'nowrap',
    '$max-sm': { flexWrap: 'wrap', rounded: CORNER },
    borderColor: '$borderColor',
    bg: '$edge',
    ...(o.framed ? { boxShadow: 'var(--shadow-sheet-1)' } : null),
    children: (
      // inline-style: flex `order` (the field's comment says why).
      <XStack items="center" gap={2} data-slot="prompt-start" style={{ order: tall ? 1 : 0 }} shrink={0}>
        {o.onAttach ? <Attach onAttach={o.onAttach} disabled={disabled} /> : null}
        {o.tools}
      </XStack>
    ),
    send: (
      // inline-style: flex `order` (the field's comment says why).
      <XStack items="center" gap={2} data-slot="prompt-end" style={{ order: 2 }} ml={tall ? 'auto' : 0} $max-sm={{ ml: 'auto' }} shrink={0}>
        {o.mind ? <Tune mind={o.mind} limits={o.limits} disabled={disabled && !busy} /> : null}
        {o.voice ? (
          <Control asChild size={ROUND}>
            <Voice voice={o.voice} disabled={disabled} says={{ idle: 'Dictate', listening: 'Dictating — click to stop' }}>
              {(state) => <Mic size={15} fill={state === 'idle' ? 'none' : 'currentColor'} />}
            </Voice>
          </Control>
        ) : null}
        {o.talk ? (
          <Control asChild size={ROUND}>
            <Voice
              voice={o.talk}
              disabled={disabled}
              data-slot="composer-talk"
              says={{ idle: 'Talk with Hanzo', listening: 'In conversation — click to hang up', speaking: 'Hanzo is speaking — talk to interrupt' }}
            >
              {() => <AudioLines size={15} />}
            </Voice>
          </Control>
        ) : null}
        <Control
          type="button"
          size={ROUND}
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
          {busy ? <Square size={13} fill="currentColor" /> : <ArrowUp size={15} strokeWidth={2.5} />}
        </Control>
      </XStack>
    ),
  }
}

/** The composer drawn on its own. */
export function Prompt(o: PromptOptions) {
  const media = useMedia()
  return <Composer {...prompt({ ...o, narrow: o.narrow ?? !media.sm })} />
}
