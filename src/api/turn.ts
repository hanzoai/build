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

function status(b: Record<string, unknown>, mode: string): string {
  const branch = str(b.branch)
  switch (str(b.status)) {
    case 'started':
      return branch ? `Started on ${branch}` : 'Started'
    case 'routed':
      return 'Sent to a machine'
    case 'done': {
      // A plan's answer IS its final status: the run read and wrote nothing.
      // Whether the run planned is the RECORD's word — any member of the org
      // can append an event saying `mode: plan`, and its text is not an answer.
      if (mode === 'plan') return str(b.plan) || 'Planned — the run answered with no plan'
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

/**
 * One event's sentence, or '' when it says nothing a person needs. `mode` is
 * the run's, from its record: a plan run's final status says the plan.
 */
export function said(e: Pick<Event, 'kind' | 'payload'>, mode = ''): string {
  const body = decode(e.payload)
  if (typeof body === 'string') return body
  if (!body) return ''
  if (e.kind === 'status') return status(body, mode)
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
  /** The last lifecycle status the run narrated, or ''. */
  status: string
  /**
   * That the pull request could not be opened, as narrated, or ''. Shown as a
   * fact only — its text comes from an event any member can write, so it is
   * never put on screen as the reason.
   */
  problem: string
}

/**
 * What the run narrated about how it ended, latest winning. Status text only:
 * the branch and the pull request are read from the run's record (`pull`).
 */
export function outcome(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): Outcome {
  const out: Outcome = { status: '', problem: '' }
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== 'status') continue
    const b = decode(e.payload)
    if (!b || typeof b === 'string') continue
    out.status = str(b.status) || out.status
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

/** The actor, short enough to label a block: `hanzo/2d4d67ab`, not the whole subject. */
export function who(actor: string): string {
  const cut = actor.indexOf('/')
  if (cut === -1) return actor.split('-')[0] || actor
  const head = actor.slice(cut + 1).split('-')[0] ?? ''
  return head ? `${actor.slice(0, cut)}/${head}` : actor
}

/**
 * A pull request address the builder will draw as a link: https, on GitHub or
 * the platform's own git, shaped like a pull request, and IN THE RUN'S OWN
 * REPOSITORY (`repo`, `owner/name`). Anything else is ''. Read from the run's
 * record, which the coding service writes — never from an event, which any
 * member of the org can append — and bound to the repository, because a record
 * can be moved into a project it did not work on.
 */
export function pull(url: string, repo: string): { href: string; label: string } {
  const m = /^https:\/\/(?:github\.com|git\.hanzo\.ai)\/([\w.-]+)\/([\w.-]+)\/pulls?\/(\d+)\/?$/.exec(url)
  if (!m || !repo || `${m[1]}/${m[2]}`.toLowerCase() !== repo.toLowerCase()) return { href: '', label: '' }
  return { href: url, label: `#${m[3]}` }
}
