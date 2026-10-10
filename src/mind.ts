/**
 * Which model answers, and how hard it thinks: one store for Chat and Dev, and
 * the catalog both offer. The chip that changes it is `Tune` (prompt.tsx).
 *
 *   GET /v1/models   the catalog, read once per platform and shared
 *   hanzo.mind       the person's choice, in this browser: {model, effort}
 *
 * Effort is on the chip and the model is one press in. Enso routes every ask —
 * a message in Chat, a step in Dev — so naming a model is an override, and the
 * panel says so before it offers one. A premium model is picked for the screen
 * it was picked on (`usePick`) and never kept, so the next conversation or run
 * opens on what was kept, Enso until something else is.
 *
 * The efforts are the set both planes take: `reasoning_effort` on a completion
 * and `effort` on a coding run (apps/coding `efforts`). A model the catalog
 * lists as not reasoning offers none; Enso and a model the catalog does not
 * describe offer all three.
 */
import { modelName, parseModels } from '@hanzo/ui/models/catalog'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { Refusal, type Target } from './api/call.ts'
import { ENSO, models as read, type Model } from './api/models.ts'
import { usePick } from './pick.ts'

export type Effort = 'low' | 'medium' | 'high'

export const EFFORTS: readonly { id: Effort; label: string; note: string }[] = [
  { id: 'low', label: 'Low', note: 'A quick pass' },
  { id: 'medium', label: 'Medium', note: 'Thinks before it answers' },
  { id: 'high', label: 'High', note: 'Slow and careful, for hard problems' },
]

/** What a person chose: the model (Enso routes) and the effort. */
export interface Choice {
  model: string
  effort: Effort
}

export const FIRST: Choice = { model: ENSO, effort: 'medium' }

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

/** The kept choice, Enso and Medium where nothing is kept. Stable while the stored text is. */
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
  const next = { ...kept(), ...patch }
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

/** Whether `model` takes an effort: the router and an undescribed model do, a listed one only if it reasons. */
export function reasons(model: string, catalog: readonly Model[]): boolean {
  if (model === ENSO) return true
  const row = catalog.find((m) => m.id === model)
  return !row || row.supports_reasoning === true
}

/** A model's name as the catalog spells it; Enso for the router. */
export function nameOf(model: string, catalog: readonly Model[]): string {
  if (model === ENSO) return 'Enso'
  const row = catalog.find((m) => m.id === model)
  return modelName(row ?? { id: model })
}

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

/** The chip's whole state: the catalog, what answers next, and how to change either. */
export interface Mind {
  model: string
  effort: Effort
  models: Model[]
  loading: boolean
  error: string | null
  /** A list shown from before, because this read failed. */
  note: string
  /** A premium pick holds for this screen; any other is kept. */
  pick: (id: string) => void
  pace: (effort: Effort) => void
}

export function useMind(t: Target): Mind {
  const [choice, change] = useChoice()
  const { models, list, loading, error, note } = useCatalog(t)
  const [model, pick] = usePick(choice.model, (id) => change({ model: id }), list)
  return { model, effort: choice.effort, models, loading, error, note, pick, pace: (effort) => change({ effort }) }
}
