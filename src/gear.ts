/**
 * What a conversation carries beside its words: the skills, connectors and
 * plugins picked from the composer's `+`, the design system, the device, the
 * Research and Memory switches and the mode. Chat and Dev keep it the same way.
 *
 *   GET   /v1/pref   {prefs: {gear, gears}}
 *   PATCH /v1/pref   {gear} — the person's default, what a new conversation opens with
 *                    {gears: {<key>: Gear}} — each conversation's own, newest first, at most `KEEP`
 *
 * Both live in the account, so a choice follows the person to every device. A
 * conversation that has none of its own reads the default; changing one writes
 * that conversation's, and "Keep as default" writes the default.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { Target } from './api/call.ts'
import { read, save } from './api/pref.ts'

/** What a run or a turn may do on its own: the permission mode. */
export type Mode = 'manual' | 'auto' | 'accept' | 'plan'

export const MODES: readonly { id: Mode; label: string; note: string }[] = [
  { id: 'manual', label: 'Manual', note: 'Hanzo asks before using new tools or opening new sites.' },
  { id: 'auto', label: 'Auto', note: 'Hanzo runs on its own and pauses to ask if anything looks unsafe.' },
  { id: 'accept', label: 'Accept edits', note: 'Hanzo makes edits and asks you to review them.' },
  { id: 'plan', label: 'Plan', note: 'Lays out the plan first and changes nothing until you say go.' },
]

export interface Gear {
  /** Skill names (`/v1/tool/skills`). */
  skills: string[]
  /** Connector ids (`/v1/tool/mcp/servers`). */
  connectors: string[]
  /** Plugin ids. */
  plugins: string[]
  /** Agents added to the chat. */
  agents: string[]
  /** A design system's id, or ''. */
  design: string
  /** A machine's id, or '' for none (Chat) or the sandbox (Dev). */
  device: string
  research: boolean
  memory: boolean
  mode: Mode
}

export const BARE: Gear = {
  skills: [],
  connectors: [],
  plugins: [],
  agents: [],
  design: '',
  device: '',
  research: false,
  memory: true,
  mode: 'auto',
}

/** How many conversations keep a choice of their own. */
export const KEEP = 100

const STORAGE_KEY = 'hanzo.gear.doc'

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [])
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A stored value as a Gear, a field the reader does not know read as unset. */
export function gearOf(raw: unknown, base: Gear = BARE): Gear {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    skills: 'skills' in o ? list(o.skills) : base.skills,
    connectors: 'connectors' in o ? list(o.connectors) : base.connectors,
    plugins: 'plugins' in o ? list(o.plugins) : base.plugins,
    agents: 'agents' in o ? list(o.agents) : base.agents,
    design: 'design' in o ? text(o.design) : base.design,
    device: 'device' in o ? text(o.device) : base.device,
    research: typeof o.research === 'boolean' ? o.research : base.research,
    memory: typeof o.memory === 'boolean' ? o.memory : base.memory,
    mode: MODES.some((m) => m.id === o.mode) ? (o.mode as Mode) : base.mode,
  }
}

/** `gears` with `key`'s entry first, cut to `KEEP`. */
export function shelve(gears: Record<string, Gear>, key: string, g: Gear): Record<string, Gear> {
  const out: Record<string, Gear> = { [key]: g }
  for (const [k, v] of Object.entries(gears)) {
    if (k === key) continue
    if (Object.keys(out).length >= KEEP) break
    out[k] = v
  }
  return out
}

// Load initial doc from localStorage if present
function initialDoc(): Doc {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as { gear?: unknown; gears?: unknown }
        const g = gearOf(parsed.gear)
        const all = parsed.gears && typeof parsed.gears === 'object' ? (parsed.gears as Record<string, unknown>) : {}
        return { gear: g, gears: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, gearOf(v, g)])) }
      }
    } catch {
      /* ignore */
    }
  }
  return { gear: BARE, gears: {} }
}

// One document per page, read once per target and shared by every composer on it.
interface Doc {
  gear: Gear
  gears: Record<string, Gear>
}
let doc: Doc = initialDoc()
let loaded: string | null = null
const listeners = new Set<() => void>()
const emit = () => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

function load(t: Target): void {
  const id = `${t.api}|${t.org ?? ''}|${t.token() ? 1 : 0}`
  if (loaded === id || !t.token()) return
  loaded = id
  void read(t)
    .then((p) => {
      const raw = p as unknown as { gear?: unknown; gears?: unknown }
      const gear = gearOf(raw.gear)
      const all = raw.gears && typeof raw.gears === 'object' ? (raw.gears as Record<string, unknown>) : {}
      doc = { gear, gears: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, gearOf(v, gear)])) }
      emit()
    })
    .catch(() => {
      loaded = null
    })
}

export interface GearState {
  gear: Gear
  /** Change this conversation's choice. */
  set: (patch: Partial<Gear>) => void
  /** Add or take out one id of a list. */
  toggle: (field: 'skills' | 'connectors' | 'plugins' | 'agents', id: string) => void
  /** Make this conversation's choice the person's default. */
  keep: () => void
  /** Whether a save was refused, in the platform's words. */
  error: string | null
}

/**
 * The gear of the conversation `key` names (`''` for one not begun: it reads and
 * writes the default until it has an id). Signed out, it lives for the page.
 */
export function useGear(t: Target, key = ''): GearState {
  useEffect(() => load(t), [t])
  const now = useSyncExternalStore(subscribe, () => doc, () => doc)
  const [error, setError] = useState<string | null>(null)
  const gear = key ? (now.gears[key] ?? now.gear) : now.gear

  const write = useCallback(
    (g: Gear) => {
      const fresh = key ? { ...doc, gears: shelve(doc.gears, key, g) } : { ...doc, gear: g }
      doc = fresh
      emit()
      if (!t.token()) return
      const patch = key ? { gears: fresh.gears } : { gear: g }
      save(t, patch as never).then(
        () => setError(null),
        (e: unknown) => setError(e instanceof Error ? e.message : 'Your choice was not saved.'),
      )
    },
    [key, t],
  )

  return useMemo(
    () => ({
      gear,
      error,
      set: (patch) => write({ ...gear, ...patch }),
      toggle: (field, id) => {
        const has = gear[field].includes(id)
        write({ ...gear, [field]: has ? gear[field].filter((x) => x !== id) : [...gear[field], id] })
      },
      keep: () => {
        doc = { ...doc, gear }
        emit()
        if (t.token()) save(t, { gear } as never).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Not saved.'))
      },
    }),
    [gear, error, write, t],
  )
}
