/**
 * The suggestions under the composer (above it on a phone): up to three rows,
 * each the source's mark and one short action, its summary on hover. Pressing
 * a row DOES it (suggest.ts `Act`): it opens what it names, sends its prompt as
 * a new chat, starts its run, or makes its scheduled task. Nothing only fills
 * the composer. Its × dismisses it, and the account remembers.
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
 *   POST /v1/auto/automations             a `schedule` row's task
 */
import { SizableText, useMedia, XStack, YStack } from '@hanzo/gui'
import { Bot, CalendarClock, FileText, Github, MessageSquare, X } from '@hanzogui/lucide-icons-2'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@hanzo/ui'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { automations, create, type Automation, type Source } from './api/auto.ts'
import { call, Refusal, unwrap, type Target } from './api/call.ts'
import { conversations } from './api/conversations.ts'
import { items } from './api/library.ts'
import { read, save, type Prefs } from './api/pref.ts'
import { list } from './api/sessions.ts'
import { everything } from './api/work.ts'
import { claims } from './claims.ts'
import { answer, dismissed, due, fill, inputs, request, seed, sig, skip, stale, TAKE, type Act, type Icon, type Input, type Kept, type Seed, type Suggestion } from './suggest.ts'

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
  /** The rows to draw: three when any are, none dismissed. */
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
  // Filled to three with what Hanzo does, so a new account and a quiet one never see one lonely row.
  const rows = useMemo(() => fill(now), [now])
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

/** Where a row leaves its act for the product that does it. */
const HAND = 'hanzo.suggest.hand'

/**
 * Leave `prompt` for the product `kind` names, which does it on arrival, once:
 * Chat sends a `send` as a new chat, Dev starts a `task` as a run. Same-tab
 * session storage, written by the person's own press, so an address can never
 * carry one (a link is not consent to spend).
 */
export function hand(kind: 'send' | 'task', prompt: string): void {
  try {
    window.sessionStorage.setItem(HAND, JSON.stringify({ kind, prompt }))
  } catch {
    // Without storage the product opens without it.
  }
}

/** The prompt left for `kind`, taken so it is done once, or ''. */
export function taken(kind: 'send' | 'task'): string {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(HAND) ?? 'null') as { kind?: unknown; prompt?: unknown } | null
    if (v?.kind !== kind || typeof v.prompt !== 'string') return ''
    window.sessionStorage.removeItem(HAND)
    return v.prompt.trim()
  } catch {
    return ''
  }
}

/** Make a `schedule` row's task: on, asking before it acts, and notifying its person. */
export function book(t: Target, act: Extract<Act, { kind: 'schedule' }>, source: Source): Promise<Automation> {
  return create(t, {
    name: act.name || act.prompt.slice(0, 80),
    instructions: act.prompt,
    model: null,
    schedule: { ...act.schedule, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    permissions: 'ask',
    notify: true,
    postTo: [],
    enabled: true,
    source,
  })
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
  /** A row was pressed: do what it says. */
  onAct: (act: Act, row: Suggestion) => void
  onDismiss: (id: string) => void
}

/** The rows, or nothing when there are none. */
export function Suggestions({ rows, onAct, onDismiss }: SuggestionsProps) {
  // A phone has no hover: its × stays in sight.
  const touch = !useMedia().sm
  if (!rows.length) return null
  return (
    <YStack role="list" aria-label="Suggestions" data-slot="suggestions">
      {rows.map((r) => (
        <Row key={r.id} row={r} touch={touch} onAct={onAct} onDismiss={onDismiss} />
      ))}
    </YStack>
  )
}

/** One row: the whole of it one button that does the act, and its × beside it. Two stops for the keyboard, neither inside the other. */
function Row({ row, touch, onAct, onDismiss }: { row: Suggestion; touch: boolean; onAct: (act: Act, row: Suggestion) => void; onDismiss: (id: string) => void }) {
  const [near, setNear] = useState(false)
  const Mark = MARKS[row.icon]
  const button = (
    <XStack
      render="button"
      data-act={row.act.kind}
      aria-label={row.title}
      onPress={() => onAct(row.act, row)}
      flex={1}
      minW={0}
      self="stretch"
      items="center"
      gap="$3"
      pl="$3"
      rounded="$4"
      cursor="pointer"
      focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
    >
      <Mark size={18} color="$soft" />
      <SizableText fontSize={15} color="$soft" numberOfLines={1} shrink={1} minW={0}>
        {row.title}
      </SizableText>
    </XStack>
  )
  return (
    <XStack
      role="listitem"
      data-slot="suggestion"
      items="center"
      gap="$1"
      minH={PITCH}
      pr="$2"
      rounded="$4"
      hoverStyle={{ bg: '$hover' }}
      onPointerEnter={() => setNear(true)}
      onPointerLeave={() => setNear(false)}
    >
      {row.summary ? (
        <HoverCard openDelay={300} closeDelay={150}>
          <HoverCardTrigger flex={1} minW={0} self="stretch" flexDirection="row">
            {button}
          </HoverCardTrigger>
          <HoverCardContent side="top" align="start" sideOffset={8} width={470} maxW="calc(100vw - 32px)" rounded="$6" p="$4">
            <SizableText fontSize={16} lineHeight={26} color="$ink">
              {row.summary}
            </SizableText>
          </HoverCardContent>
        </HoverCard>
      ) : (
        button
      )}
      <XStack
        render="button"
        aria-label={`Dismiss ${row.title}`}
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
