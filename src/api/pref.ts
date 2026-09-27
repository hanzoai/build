/**
 * The signed-in person's own settings, as the platform keeps them for every
 * Hanzo surface.
 *
 *   GET   /v1/pref → {prefs: {…}, updatedAt}   an empty document for someone who saved nothing
 *   PATCH /v1/pref   {key: value | null}        a shallow merge; null deletes the key
 *
 * The document is one object shared by every surface, keyed per person and per
 * org. This reads only the keys the builder owns and writes only those, so a
 * key another surface saved is left as it was. A value this version does not
 * recognise reads as unset rather than as a choice.
 */
import { call, type Target } from './call.ts'

export type Theme = 'system' | 'light' | 'dark'
export type Text = 'small' | 'medium' | 'large'
export type Motion = 'system' | 'reduced'

/** Where and how a new run starts when New has no choice of its own kept. */
export interface Code {
  model?: string
  effort?: 'low' | 'medium' | 'high'
  mode?: 'build' | 'plan'
  /** A machine's id, or '' for the sandbox. */
  place?: string
}

export interface Prefs {
  theme?: Theme
  text?: Text
  motion?: Motion
  /** The dictation language, as voice.ts names it. */
  language?: string
  /** What Hanzo calls the person. */
  callName?: string
  /** What best describes their work. */
  work?: string
  /** What every coding run is told about how they like to work. */
  instructions?: string
  code?: Code
}

/** A change: a key set to a value, or to null to delete it. */
export type Patch = { [K in keyof Prefs]?: Prefs[K] | null }

const THEMES: readonly Theme[] = ['system', 'light', 'dark']
const TEXTS: readonly Text[] = ['small', 'medium', 'large']
const MOTIONS: readonly Motion[] = ['system', 'reduced']
const EFFORTS = ['low', 'medium', 'high'] as const
const MODES = ['build', 'plan'] as const

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)
const one = <T extends string>(v: unknown, of: readonly T[]): T | undefined => (of.includes(v as T) ? (v as T) : undefined)

/** Drop the keys that say nothing, so a read and a merge compare cleanly. */
function defined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export function code(raw: unknown): Code | undefined {
  const c = obj(raw)
  const out = defined<Code>({
    model: text(c.model),
    effort: one(c.effort, EFFORTS),
    mode: one(c.mode, MODES),
    place: typeof c.place === 'string' ? c.place : undefined,
  })
  return Object.keys(out).length ? out : undefined
}

/** The builder's keys from a whole preference document. */
export function prefs(raw: unknown): Prefs {
  const p = obj(raw)
  return defined<Prefs>({
    theme: one(p.theme, THEMES),
    text: one(p.text, TEXTS),
    motion: one(p.motion, MOTIONS),
    language: text(p.language),
    callName: text(p.callName),
    work: text(p.work),
    instructions: text(p.instructions),
    code: code(p.code),
  })
}

/** What a document reads as once `patch` is merged into it — the platform's own rule. */
export function merge(base: Prefs, patch: Patch): Prefs {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k]
    else if (v !== undefined) out[k] = v
  }
  return prefs(out)
}

export async function read(t: Target): Promise<Prefs> {
  const r = await call<{ prefs?: unknown }>(t, 'GET', '/v1/pref')
  return prefs(r?.prefs)
}

export async function save(t: Target, patch: Patch): Promise<Prefs> {
  const r = await call<{ prefs?: unknown }>(t, 'PATCH', '/v1/pref', patch)
  return prefs(r?.prefs)
}
