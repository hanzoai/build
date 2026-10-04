/**
 * Automations: a task that runs itself, on a schedule or when asked.
 *
 *   GET    /v1/auto/automations            {data: [automation]}
 *   POST   /v1/auto/automations            create one: name and instructions
 *   GET    /v1/auto/automations/{id}       one
 *   PATCH  /v1/auto/automations/{id}       change it, or switch it on or off
 *   DELETE /v1/auto/automations/{id}       delete it, its schedule and its runs
 *   POST   /v1/auto/automations/{id}/run   {run: {id, status}}  one run, now
 *   GET    /v1/auto/automations/{id}/runs  {data: [run]}        newest first
 *
 * Each run is one Dev run in this organization, started as the person who last
 * saved what it does. A draft is a flow named and not yet told what to do: it
 * runs once its instructions are saved.
 */
import { call, seg, type Target } from './call.ts'

export type Kind = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'cron'
export type Permissions = 'ask' | 'auto'

/** When it runs, in the person's own words and zone. */
export interface Schedule {
  kind: Kind
  /** HH:MM, 24-hour, for daily, weekdays and weekly; 00:MM for hourly. */
  at?: string
  /** mon … sun, for weekly. */
  day?: string
  /** Five fields, for cron. */
  cron?: string
  /** An IANA zone; the platform reads an absent one as UTC. */
  tz?: string
}

/** What an automation is: what the editor holds and the platform keeps. */
export interface Draft {
  name: string
  instructions: string
  /** A model id, or null for Enso, the default. */
  model: string | null
  schedule: Schedule
  permissions: Permissions
  notify: boolean
  enabled: boolean
}

export interface Last {
  id: string
  status: string
  at: string
  summary: string
}

export interface Automation extends Draft {
  id: string
  project: string | null
  /** Named and not yet told what to do: it never runs until its instructions are saved. */
  draft: boolean
  /** When it runs next, RFC 3339, or null when it runs only when asked or is off. */
  next: string | null
  last: Last | null
  created: string
  updated: string
}

/** One run: succeeded, failed, running, queued, skipped or refused. */
export interface Run {
  id: string
  status: string
  at: string
  finished: string | null
  summary: string
  /** The Dev run it started, or null when it started none. */
  session: string | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const nullable = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const KINDS: readonly Kind[] = ['manual', 'hourly', 'daily', 'weekdays', 'weekly', 'cron']

function schedule(raw: unknown): Schedule {
  const o = obj(raw)
  const kind = KINDS.includes(o.kind as Kind) ? (o.kind as Kind) : 'manual'
  const out: Schedule = { kind }
  for (const k of ['at', 'day', 'cron', 'tz'] as const) if (str(o[k])) out[k] = str(o[k])
  return out
}

/** One automation as the platform answers it, or null for a row with no id. */
export function read(raw: unknown): Automation | null {
  const o = obj(raw)
  const id = str(o.id)
  if (!id) return null
  const last = obj(o.last)
  return {
    id,
    name: str(o.name) || id,
    instructions: str(o.instructions),
    project: nullable(o.project),
    model: nullable(o.model),
    schedule: schedule(o.schedule),
    permissions: o.permissions === 'auto' ? 'auto' : 'ask',
    notify: o.notify === true,
    enabled: o.enabled === true,
    draft: o.draft === true,
    next: nullable(o.next),
    last: str(last.id) ? { id: str(last.id), status: str(last.status), at: str(last.at), summary: str(last.summary) } : null,
    created: str(o.created),
    updated: str(o.updated),
  }
}

/** The Dev run a transcript link opens: `…/dev?run=sess_…`. */
function session(link: unknown): string | null {
  const m = str(link).match(/[?&]run=(sess_[0-9a-f]{32})\b/)
  return m ? m[1]! : null
}

const list = (raw: unknown): unknown[] => (Array.isArray(obj(raw).data) ? (obj(raw).data as unknown[]) : [])

export async function automations(t: Target): Promise<Automation[]> {
  return list(await call<unknown>(t, 'GET', '/v1/auto/automations'))
    .map(read)
    .filter((a): a is Automation => a !== null)
}

export async function automation(t: Target, id: string): Promise<Automation> {
  const a = read(await call<unknown>(t, 'GET', `/v1/auto/automations/${seg(id)}`))
  if (!a) throw new Error('The automation came back without an id')
  return a
}

export async function create(t: Target, d: Draft): Promise<Automation> {
  const a = read(await call<unknown>(t, 'POST', '/v1/auto/automations', d))
  if (!a) throw new Error('The automation was created and came back without an id')
  return a
}

/** What changed between two drafts, field by field: what a save sends. */
export function changes(was: Draft, now: Draft): Partial<Draft> {
  const out: Partial<Draft> = {}
  for (const k of Object.keys(now) as (keyof Draft)[]) {
    if (JSON.stringify(was[k]) !== JSON.stringify(now[k])) (out as Record<string, unknown>)[k] = now[k]
  }
  return out
}

/** Change an automation. A change to anything but `enabled` makes the caller the person it runs as. */
export async function save(t: Target, id: string, change: Partial<Draft>): Promise<Automation> {
  const a = read(await call<unknown>(t, 'PATCH', `/v1/auto/automations/${seg(id)}`, change))
  if (!a) throw new Error('The automation was saved and came back without an id')
  return a
}

export async function remove(t: Target, id: string): Promise<void> {
  await call(t, 'DELETE', `/v1/auto/automations/${seg(id)}`)
}

/** Start one run now. While one is going, the platform records this start as skipped. */
export async function start(t: Target, id: string): Promise<{ id: string; status: string }> {
  const run = obj(obj(await call<unknown>(t, 'POST', `/v1/auto/automations/${seg(id)}/run`)).run)
  return { id: str(run.id), status: str(run.status) }
}

export async function runs(t: Target, id: string): Promise<Run[]> {
  return list(await call<unknown>(t, 'GET', `/v1/auto/automations/${seg(id)}/runs`))
    .map((raw) => {
      const o = obj(raw)
      return { id: str(o.id), status: str(o.status), at: str(o.at), finished: nullable(o.finished), summary: str(o.summary), session: session(o.transcript) }
    })
    .filter((r) => r.id)
}

const DAYS: Record<string, string> = { mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays' }

/** A schedule the way a person says it. */
export function words(s: Schedule): string {
  const zone = ` · ${s.tz || 'UTC'}`
  switch (s.kind) {
    case 'manual':
      return 'When you run it'
    case 'hourly':
      return `Every hour at :${(s.at ?? '00:00').slice(3) || '00'}`
    case 'daily':
      return `Every day at ${s.at}${zone}`
    case 'weekdays':
      return `Weekdays at ${s.at}${zone}`
    case 'weekly':
      return `${DAYS[s.day ?? ''] ?? s.day} at ${s.at}${zone}`
    case 'cron':
      return `Cron ${s.cron}${zone}`
  }
}
