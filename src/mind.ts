/**
 * Which model answers, and how hard it thinks: one store for Chat and Dev, and
 * the catalog both offer. The chip that changes it is `Tune` (prompt.tsx).
 *
 *   GET /v1/models   the catalog, read once per platform and shared
 *   hanzo.mind       the person's choice, in this browser: {model, effort}
 *
 * The effort is always under the composer; the model chip only where the host
 * shows it (Hanzo's Advanced settings › model selector, `Host.models`). Enso
 * routes every ask — a message in Chat, a step in Dev — so naming a model is an
 * override, and the panel says so before it offers one. A premium model is
 * picked for the screen it was picked on (`usePick`) and never kept, so the next
 * conversation or run opens on what was kept, Enso until something else is.
 *
 * The efforts are Auto, High, XHigh and Max, Chat's words (Hanzo's
 * ThinkingEffort), Auto until another is chosen. A coding run takes low, medium
 * or high (apps/coding `efforts`), so `level` is what a run names: medium for
 * Auto, what a run took before anyone chose, and high for the rest, the most it
 * takes. Auto names one rather than none, because a run that names none takes
 * an effort the person saved to their account once (apps/coding start.go) and
 * no screen shows any more.
 */
import { phrase } from '@hanzo/i18n'
import { parseModels } from '@hanzo/ui/models/catalog'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { Refusal, type Target } from './api/call.ts'
import { ENSO, models as read, type Model } from './api/models.ts'
import { usePick } from './pick.ts'

export type Effort = 'auto' | 'high' | 'xhigh' | 'max'

/** The efforts, in order, in English and marked (`phrase`): the composer draws each word through `t`. */
export const EFFORTS: readonly { id: Effort; label: string; note: string }[] = [
  { id: 'auto', label: phrase('Auto'), note: phrase('Adaptive reasoning based on task complexity') },
  { id: 'high', label: phrase('High'), note: phrase('Deep reasoning for complex problems') },
  { id: 'xhigh', label: phrase('XHigh'), note: phrase('Extended multi-step reasoning for hard tasks') },
  { id: 'max', label: phrase('Max'), note: phrase('Maximum compute and exhaustive verification') },
]

/** The effort a coding run names (apps/coding takes low, medium or high): medium for Auto, high for the rest. */
export const level = (effort: Effort): 'medium' | 'high' => (effort === 'auto' ? 'medium' : 'high')

/** What a person chose: the model (Enso routes) and the effort. */
export interface Choice {
  model: string
  effort: Effort
}

export const FIRST: Choice = { model: ENSO, effort: 'auto' }

/** What Free answers on: the catalog's free lane, Enso's first. `free` is an alias of it. */
export const FREE = 'enso-free'

/** Whether a plan grants only the free lane. An unknown plan is not taken for Free. */
export const isFree = (plan: string | null | undefined): boolean => plan === 'free'

const KEY = 'hanzo.mind'
const CHANGE = 'hanzo:mind'

const effortOf = (v: unknown): Effort => (EFFORTS.some((e) => e.id === v) ? (v as Effort) : FIRST.effort)

/** The store, or null where the browser gives none (a server render, blocked site data). */
function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

let raw: string | null | undefined
let held: Choice = FIRST
/** A choice the browser would not store, held for the page. */
let memo: Choice | null = null

/** The kept choice, Enso and Auto where nothing is kept. Stable while the stored text is. Low and Medium, offered once, read as Auto. */
export function kept(): Choice {
  if (memo) return memo
  let now: string | null = null
  try {
    now = store()?.getItem(KEY) ?? null
  } catch {
    now = null
  }
  if (now === raw) return held
  raw = now
  try {
    const v = JSON.parse(now ?? 'null') as Partial<Choice> | null
    held = { model: typeof v?.model === 'string' && v.model.trim() ? v.model : FIRST.model, effort: effortOf(v?.effort) }
  } catch {
    held = FIRST
  }
  return held
}

/** Keep a change, in this browser, for every surface that reads it. */
export function keep(patch: Partial<Choice>): void {
  const was = kept()
  const next = { ...was, ...patch, effort: patch.effort === undefined ? was.effort : effortOf(patch.effort) }
  try {
    store()?.setItem(KEY, JSON.stringify(next))
    memo = null
  } catch {
    // A browser that refuses storage keeps the choice for this page.
    memo = next
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE))
}

function subscribe(change: () => void): () => void {
  window.addEventListener(CHANGE, change)
  window.addEventListener('storage', change)
  return () => {
    window.removeEventListener(CHANGE, change)
    window.removeEventListener('storage', change)
  }
}

/** The kept choice and the way to change it. The server and the first render read the default. */
export function useChoice(): readonly [Choice, (patch: Partial<Choice>) => void] {
  return [useSyncExternalStore(subscribe, kept, () => FIRST), keep] as const
}

/** A model's name as the catalog spells it; Enso for the router. */
export function nameOf(model: string, catalog: readonly Model[]): string {
  if (model === ENSO) return 'Enso'
  if (model === 'free') return nameOf(FREE, catalog)
  const row = catalog.find((m) => m.id === model)
  return row?.name ?? spelled(model)
}

/** An id said as a name: its last path part, each word capitalised (`enso-flash` → Enso Flash). */
export function spelled(id: string): string {
  const tail = id.split('/').pop() ?? id
  return tail
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

/** The ids that are the router under another name: the picker's Enso row stands for all of them. */
export const ROUTER_IDS: ReadonlySet<string> = new Set([ENSO, 'enso', 'hanzo/enso', 'free'])

// The catalog, once per platform for the page: Chat and Dev read the same list.
const catalogs = new Map<string, Promise<Model[]>>()
const settled = new Map<string, Model[]>()

/** Where this browser keeps the last list it read. */
const LAST = 'hanzo.build.models'

/** The router alone: what a chooser offers before any list was ever read, so it reads "Enso" and not an id. */
const ROUTER: Model[] = parseModels([{ id: ENSO, name: 'Enso', family: 'enso', class: 'ours' }])

/** The last list this browser read, or none. */
function last(): Model[] {
  try {
    return parseModels(JSON.parse(store()?.getItem(LAST) ?? 'null'))
  } catch {
    return []
  }
}

/** Which catalog a target reads: the platform, and whether anyone is signed in. */
const shelf = (t: Target): string => `${t.api}|${t.token() ? 'in' : 'out'}`

/** `GET /v1/models` for a target, asked once and shared; a refusal is not kept, so the next ask goes again. */
export function catalog(t: Target): Promise<Model[]> {
  const at = shelf(t)
  let ask = catalogs.get(at)
  if (!ask) {
    ask = read(t).then((models) => {
      settled.set(at, models)
      try {
        if (models.length) store()?.setItem(LAST, JSON.stringify(models))
      } catch {
        // The next page reads the list again.
      }
      return models
    })
    catalogs.set(at, ask)
    ask.catch(() => catalogs.delete(at))
  }
  return ask
}

/** The catalog as a chooser draws it, and the list a kept pick is judged against. */
export interface Catalog {
  /** What the chooser offers: the list read, else the last one this browser kept, else Enso alone. */
  models: Model[]
  /** What was read, for a pick to stand on: empty when nothing was, so a kept pick stands. */
  list: Model[]
  loading: boolean
  /** Why there is no list to offer, in a reader's words; null when there is one. */
  error: string | null
  /** A list shown from before, because this read failed. */
  note: string
}

/**
 * The platform's catalog, as a hook: what was read already is there on the
 * first render. The gateway answers 429 once the org's quota is spent, and a
 * list that vanishes then leaves nothing to choose from, so a failed read shows
 * the last list this browser kept, with a note; with none kept, Enso alone, and
 * the reason in the chooser — never the platform's own words.
 */
export function useCatalog(t: Target): Catalog {
  const at = shelf(t)
  const [state, setState] = useState<{ at: string; models: Model[]; error: Error | null } | null>(() =>
    settled.has(at) ? { at, models: settled.get(at)!, error: null } : null,
  )
  useEffect(() => {
    let live = true
    catalog(t).then(
      (models) => live && setState({ at, models, error: null }),
      (e: Error) => live && setState({ at, models: [], error: e }),
    )
    return () => {
      live = false
    }
    // The target is read through `at`: the origin and whether anyone is signed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])
  const now = state?.at === at ? state : settled.has(at) ? { at, models: settled.get(at)!, error: null } : null
  if (!now?.error) return { models: now?.models ?? [], list: now?.models ?? [], loading: !now, error: null, note: '' }
  const kept = last()
  if (kept.length) return { models: kept, list: kept, loading: false, error: null, note: 'The model list could not be refreshed; these are the models as last read.' }
  const spent = now.error instanceof Refusal && now.error.status === 429
  return {
    models: ROUTER,
    list: [],
    loading: false,
    error: spent ? 'The model list is resting: this organization’s quota is spent.' : 'The model list could not be read right now.',
    note: '',
  }
}

/** Whether `model` is one this plan may send: on Free, the catalog's free class alone. */
export function grants(free: boolean, model: string, catalog: readonly Model[]): boolean {
  if (!free) return true
  return catalog.find((m) => m.id === model)?.class === 'free'
}

/** The chip's whole state: the catalog, what answers next, and how to change either. */
export interface Mind {
  model: string
  effort: Effort
  models: Model[]
  loading: boolean
  error: string | null
  /** A list shown from before, because this read failed. */
  note: string
  /** The plan grants only the free lane: anything else is an upgrade, never a pick. */
  free: boolean
  /** A premium pick holds for this screen; any other is kept. */
  pick: (id: string) => void
  pace: (effort: Effort) => void
}

/**
 * The model and effort for the plan `plan` names (`GET /v1/ai/limits` `plan`).
 * On Free the default is `FREE` and a kept pick outside the free lane is set
 * aside rather than sent — it comes back once the plan grants it.
 */
export function useMind(t: Target, plan?: string | null): Mind {
  const [choice, change] = useChoice()
  const { models, list, loading, error, note } = useCatalog(t)
  const free = isFree(plan)
  const [picked, pick] = usePick(choice.model, (id) => change({ model: id }), list)
  const model = free && !grants(true, picked, models) ? FREE : picked
  return {
    model,
    effort: choice.effort,
    models,
    loading,
    error,
    note,
    free,
    pick: (id) => {
      if (grants(free, id, models)) pick(id)
    },
    pace: (effort) => change({ effort }),
  }
}
