/**
 * The suggestions under the composer (above it on a phone): up to three rows,
 * each the source's mark, what happened linked to where it happened (its
 * summary on hover or focus), then the next step. Choosing a row puts its
 * prompt in the composer; its × dismisses it, and the account remembers.
 *
 * `useSuggestions` reads the kept rows from the account (`suggest` in /v1/pref)
 * and, when they are due (suggest.ts `due`), reads the person's activity and
 * asks Hanzo's model for new ones. One document per page, read once per person
 * and org, shared by every composer on it.
 *
 *   GET  /v1/pref                         the kept rows, and callName, work, instructions
 *   GET  /v1/agents/chat/conversations    their conversations
 *   GET  /v1/task/board                   the org's issues and pull requests
 *   GET  /v1/agent/sessions?limit=20      Dev runs; their own are read
 *   GET  /v1/auto/automations             automations
 *   GET  /v1/library?scope=mine           their files
 *   POST /v1/iam/preferences {}           what signup kept (`onboarding`)
 *   POST /v1/chat/completions             the rows, as `MODEL` writes them
 *   PATCH /v1/pref {suggest}              the rows kept, and each dismissal
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import { ArrowUpRight, Bot, CalendarClock, FileText, Github, MessageSquare, X } from '@hanzogui/lucide-icons-2'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@hanzo/ui'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

import { automations } from './api/auto.ts'
import { call, Refusal, unwrap, type Target } from './api/call.ts'
import { conversations } from './api/conversations.ts'
import { items } from './api/library.ts'
import { read, save, type Prefs } from './api/pref.ts'
import { list } from './api/sessions.ts'
import { everything } from './api/work.ts'
import { claims } from './claims.ts'
import { Out } from './out.tsx'
import { answer, dismissed, due, inputs, request, seed, shown, sig, skip, stale, TAKE, type Icon, type Input, type Kept, type Seed, type Suggestion } from './suggest.ts'

/** A source that refuses this person (a 4xx other than an expired sign-in or a rate) has nothing for them; any other failure leaves it unknown. */
function soft<T>(p: Promise<T>, none: T): Promise<T> {
  return p.catch((e: unknown) => {
    if (e instanceof Refusal && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) return none
    throw e
  })
}

/** The person's activity and seed, or null when a source could not be read: rows are never made from half of it. */
async function gather(t: Target, p: Prefs): Promise<{ inputs: Input[]; seed: Seed } | null> {
  const c = claims(t.token())
  const me = typeof c?.owner === 'string' && typeof c?.sub === 'string' ? `${c.owner}/${c.sub}` : ''
  try {
    const [cs, is, rs, as, fs, iam] = await Promise.all([
      soft(conversations(t), []),
      soft(everything(t), []),
      soft(list(t, { limit: 20 }), []),
      soft(automations(t), []),
      soft(
        items(t, { scope: 'mine', limit: TAKE.file }).then((page) => page.data),
        [],
      ),
      soft(
        call<unknown>(t, 'POST', '/v1/iam/preferences', {}).then(unwrap),
        {} as unknown,
      ),
    ])
    return { inputs: inputs({ conversations: cs, issues: is, runs: rs, automations: as, files: fs, me }), seed: seed(p, iam) }
  } catch {
    return null
  }
}

// One document per page: the kept rows of whoever `loaded` names.
let doc: Kept | null = null
let loaded: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Read the kept rows, and make new ones when they are due. Each await checks it still speaks for `id`. */
async function refresh(t: Target, id: string): Promise<void> {
  const p = await read(t)
  if (loaded !== id) return
  doc = p.suggest ?? null
  emit()
  if (!stale(doc, Date.now())) return
  const got = await gather(t, p)
  if (loaded !== id || !got) return
  const fingerprint = sig(got.inputs, got.seed)
  if (!due(doc, fingerprint, Date.now())) return
  const ask = request(got.inputs, got.seed, skip(doc, got.inputs), new Date())
  const rows = ask ? answer(await call<unknown>(t, 'POST', '/v1/chat/completions', ask), got.inputs) : []
  if (loaded !== id) return
  // Dismissals made while the model wrote are the latest document's.
  const gone = doc?.dismissed ?? []
  doc = { at: new Date().toISOString(), sig: fingerprint, rows: rows.filter((r) => !gone.includes(r.id)), dismissed: gone }
  emit()
  await save(t, { suggest: doc })
}

/** Whose rows: the platform, the org and the person. Signed out is nobody, and has none. */
const whose = (t: Target): string => {
  const token = t.token()
  if (!token) return ''
  const sub = claims(token)?.sub
  return `${t.api}|${t.org ?? ''}|${typeof sub === 'string' ? sub : ''}`
}

function load(t: Target): Promise<void> {
  const id = whose(t)
  if (loaded === id) return Promise.resolve()
  loaded = id
  doc = null
  emit()
  return id ? refresh(t, id) : Promise.resolve()
}

export interface Suggested {
  /** The rows to draw: at most three, none dismissed. */
  rows: Suggestion[]
  /** Dismiss one, remembered by the account. */
  dismiss: (id: string) => void
  /** Why the rows could not be read, made or kept, in the platform's words. */
  error: string | null
}

const said = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'Suggestions could not be read.')

/** The person's suggestions. Signed out, or with nothing worth saying, there are none. */
export function useSuggestions(t: Target): Suggested {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    load(t).then(
      () => setError(null),
      (e: unknown) => setError(said(e)),
    )
  }, [t])
  const now = useSyncExternalStore(subscribe, () => doc, () => doc)
  const rows = useMemo(() => shown(now), [now])
  const dismiss = useCallback(
    (id: string) => {
      if (!doc) return
      doc = dismissed(doc, id)
      emit()
      if (t.token()) save(t, { suggest: doc }).then(() => setError(null), (e: unknown) => setError(said(e)))
    },
    [t],
  )
  return useMemo(() => ({ rows, dismiss, error }), [rows, dismiss, error])
}

const MARKS: Record<Icon, typeof Github> = {
  github: Github,
  agent: Bot,
  chat: MessageSquare,
  file: FileText,
  task: CalendarClock,
}

/** The row's pitch, px: a finger's on a phone, and the same at a desk. */
const PITCH = 44

export interface SuggestionsProps {
  rows: readonly Suggestion[]
  /** A row was chosen: its prompt, for the composer. */
  onPick: (prompt: string) => void
  onDismiss: (id: string) => void
}

/** The rows, or nothing when there are none. */
export function Suggestions({ rows, onPick, onDismiss }: SuggestionsProps) {
  // A phone has no hover: its × stays in sight.
  const touch = !useMedia().sm
  if (!rows.length) return null
  return (
    <YStack role="list" aria-label="Suggestions" data-slot="suggestions">
      {rows.map((r) => (
        <Row key={r.id} row={r} touch={touch} onPick={onPick} onDismiss={onDismiss} />
      ))}
    </YStack>
  )
}

/**
 * One row. The whole row is one button, laid under the row's content (which is
 * positioned after it, so it paints above, and lets presses through), and over
 * it the title's link and the × are their own: three stops for the keyboard,
 * none inside another.
 */
function Row({ row, touch, onPick, onDismiss }: { row: Suggestion; touch: boolean; onPick: (prompt: string) => void; onDismiss: (id: string) => void }) {
  const [near, setNear] = useState(false)
  const Mark = MARKS[row.icon]
  return (
    <XStack
      role="listitem"
      data-slot="suggestion"
      position="relative"
      items="center"
      gap="$3"
      minH={PITCH}
      px="$3"
      rounded="$4"
      hoverStyle={{ bg: '$hover' }}
      onPointerEnter={() => setNear(true)}
      onPointerLeave={() => setNear(false)}
    >
      <YStack
        render="button"
        aria-label={`${row.title}. ${row.action}`}
        onPress={() => onPick(row.prompt)}
        position="absolute"
        t={0}
        r={0}
        b={0}
        l={0}
        rounded="$4"
        cursor="pointer"
        focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
      />
      <XStack position="relative" flex={1} minW={0} items="center" gap="$3" pointerEvents="none">
        <Mark size={18} color="$soft" />
        <XStack flex={1} minW={0} items="center">
          <Title row={row} />
          <SizableText fontSize={15} color="$soft" numberOfLines={1} shrink={1} minW={0}>
            {`. ${row.action}`}
          </SizableText>
        </XStack>
      </XStack>
      <XStack
        render="button"
        aria-label={`Dismiss ${row.title}`}
        position="relative"
        onPress={() => onDismiss(row.id)}
        p="$1.5"
        rounded="$2"
        cursor="pointer"
        opacity={touch || near ? 1 : 0}
        hoverStyle={{ bg: '$hover' }}
        focusVisibleStyle={{ opacity: 1, outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
      >
        <X size={16} color="$soft" />
      </XStack>
    </XStack>
  )
}

/** What happened, linked to its source with a ↗ when it has one, its summary in a card above it. It keeps its words before the step does, up to 70% of the line. */
function Title({ row }: { row: Suggestion }) {
  const words = (
    <SizableText fontSize={15} color="$soft" numberOfLines={1} textDecorationLine={row.href ? 'underline' : 'none'} textDecorationStyle="dotted">
      {row.title}
    </SizableText>
  )
  const text: ReactNode = row.href ? (
    <Out href={row.href} label={`${row.title}, opens the source`}>
      {words}
      <ArrowUpRight size={12} color="$soft" />
    </Out>
  ) : (
    words
  )
  if (!row.summary) {
    return (
      <XStack shrink={0} maxW="70%" minW={0} pointerEvents="auto">
        {text}
      </XStack>
    )
  }
  return (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger shrink={0} maxW="70%" minW={0} pointerEvents="auto">
        {text}
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" sideOffset={8} width={470} maxW="calc(100vw - 32px)" rounded="$6" p="$4">
        <SizableText fontSize={16} lineHeight={26} color="$ink">
          {row.summary}
        </SizableText>
      </HoverCardContent>
    </HoverCard>
  )
}
