/**
 * What a run's events SAY, as text a person reads.
 *
 * A curated projection, never a dump: an event carries the machinery a run
 * happened on — hosts, paths, whole file bodies — and printing it would put
 * someone's filesystem in front of anyone who can read the run. Each kind gets a
 * sentence built from the few fields that describe the outcome; the rest is
 * dropped by omission, because a projection cannot leak a field it never reads.
 *
 * Every string here is rendered as TEXT by the transcript. Nothing is HTML.
 *
 * The coding plane's vocabulary (apps/coding): `status` for a lifecycle move
 * (started, routed, done, error, stopped, paused), `tool-call` for a step,
 * `log` for a free line. A steering message a person sent is a `message`.
 */
import type { Event } from './sessions.ts'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The payload as an object. A live frame may carry it as a JSON string. */
export function decode(payload: unknown): Record<string, unknown> | string | null {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload !== 'string') return null
  const text = payload.trim()
  if (!text.startsWith('{')) return payload
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    /* prose that opens with a brace */
  }
  return payload
}

/** A file's name, never the host path it sat at. */
const base = (path: string): string => {
  const cut = path.replace(/\/+$/, '')
  return cut.slice(cut.lastIndexOf('/') + 1)
}

function status(b: Record<string, unknown>): string {
  const branch = str(b.branch)
  switch (str(b.status)) {
    case 'started':
      return branch ? `Started on ${branch}` : 'Started'
    case 'routed':
      return 'Sent to a machine'
    case 'done': {
      if (b.changed === false) return 'Done — nothing to change'
      const pr = str(b.pr)
      const tail = str(b.prError) ? ' — the pull request could not be opened' : pr ? ` — ${pr}` : ''
      return branch ? `Pushed ${branch}${tail}` : `Done${tail}`
    }
    case 'error':
      return str(b.error) || 'The run hit an error'
    case 'stopped':
      return branch && b.changed ? `Stopped — work kept on ${branch}` : 'Stopped'
    case 'paused':
      return 'Paused'
  }
  return str(b.status)
}

/** One event's sentence, or '' when it says nothing a person needs. */
export function said(e: Pick<Event, 'kind' | 'payload'>): string {
  const body = decode(e.payload)
  if (typeof body === 'string') return body
  if (!body) return ''
  if (e.kind === 'status') return status(body)
  for (const key of ['message', 'text', 'content', 'result', 'command']) {
    const v = body[key]
    if (typeof v === 'string' && v) return v
  }
  if (str(body.type) === 'done' && Array.isArray(body.changed)) {
    const names = body.changed.map((f) => base(str(f))).filter(Boolean)
    return names.length === 0
      ? 'Done — no files changed'
      : names.length <= 3
        ? `Done — changed ${names.join(', ')}`
        : `Done — changed ${names.length} files`
  }
  if (str(body.type) === 'error') return str(body.error) || 'The run hit an error'
  return str(body.step) || str(body.name)
}

export interface Outcome {
  /** The last lifecycle status the run reported, or ''. */
  status: string
  branch: string
  /** The pull request's https address, or ''. */
  pr: string
  /** The pull request's identifier ("#42", "hanzo/cloud#42"), or ''. */
  label: string
  /** Why the pull request could not be opened, or ''. */
  problem: string
}

/** What the run has come to, read from its status events, latest winning. */
export function outcome(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): Outcome {
  const out: Outcome = { status: '', branch: '', pr: '', label: '', problem: '' }
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== 'status') continue
    const b = decode(e.payload)
    if (!b || typeof b === 'string') continue
    out.status = str(b.status) || out.status
    out.branch = str(b.branch) || out.branch
    const url = str(b.url)
    if (/^https:\/\/[^\s]+$/.test(url)) out.pr = url
    out.label = str(b.pr) || out.label
    out.problem = str(b.prError) || out.problem
  }
  return out
}

/** The turns, ordered and deduped: a recorded read and the live feed overlap. */
export function merge<T extends Pick<Event, 'id' | 'seq'>>(...lists: T[][]): T[] {
  const seen = new Map<string, T>()
  for (const list of lists) for (const e of list) seen.set(e.seq ? `s${e.seq}` : `i${e.id}`, e)
  return [...seen.values()].sort((a, b) => a.seq - b.seq)
}
