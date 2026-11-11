/**
 * Dev's conversation, as the platform keeps it (apps/agents talk.go): one
 * session, every turn.
 *
 *   POST /v1/agent/turns {session?, input, model?, repo?, base?, target?, plan?, issue?}
 *        → {sessionId, runId}
 *
 * The first thing said opens the conversation; everything said after continues
 * the SAME session under a new run, once its last turn has answered — what is said
 * while a turn still works is that turn's next input (sessions.ts `message`). The
 * agent answers, and decides for itself when a turn needs a sandbox (leased on its
 * first use, kept for the conversation) or a coding run (which carries on the
 * conversation's last, in its sandbox and on its branch). A turn that only talks
 * uses neither.
 *
 * The repository, branch, machine, issue and Plan are what the person chose: a
 * coding run the agent starts works on them when it names none, and Plan makes it
 * a plan. Between turns the conversation's session rests `paused`.
 */
import { phrase } from '@hanzo/i18n'

import { call, Refusal, type Target } from './call.ts'
import type { Event, Session } from './sessions.ts'
import { decode } from './turn.ts'

/** The channel a conversation's session is on. */
export const TALK = 'app'

/** Whether a session is a conversation, rather than one run. */
export const talks = (s: Pick<Session, 'channel'> | null | undefined): boolean => s?.channel === TALK

export interface Say {
  /** The conversation to continue. Absent starts one. */
  session?: string
  /** What the person said. */
  input: string
  /** The model, by the id GET /v1/models lists. */
  model?: string
  /** The repository: its name in the org, or owner/name on GitHub. */
  repo?: string
  /** The branch a coding run starts from. */
  base?: string
  /** One of the org's machines. Absent is the sandbox. */
  target?: string
  /** Every coding run the turn starts is a plan. */
  plan?: boolean
  /** The issue on `repo` a coding run resolves. */
  issue?: number
}

export interface Said {
  /** The conversation: the same id on every turn. */
  session: string
  /** This turn's run within it. */
  run: string
}

/** The request body: only what was said, with no empty values sent. */
export function body(s: Say): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = { input: s.input.trim() }
  for (const k of ['session', 'model', 'repo', 'base', 'target'] as const) {
    const v = s[k]?.trim()
    if (v) out[k] = v
  }
  if (s.plan) out.plan = true
  if (s.issue && Number.isInteger(s.issue) && s.issue > 0) out.issue = s.issue
  return out
}

/** Say one thing in a conversation: a new one without `session`, that one with it. */
export async function say(t: Target, s: Say): Promise<Said> {
  if (!s.input.trim()) throw new Refusal(400, phrase('Say something'))
  const r = await call<Partial<Record<string, unknown>>>(t, 'POST', '/v1/agent/turns', body(s))
  const session = typeof r?.sessionId === 'string' ? r.sessionId : ''
  if (!session) throw new Refusal(502, phrase('The conversation answered with no session'))
  return { session, run: typeof r?.runId === 'string' ? r.runId : '' }
}

/** What a conversation's turn is doing now — its latest progress line — and the coding run it follows, if any. */
export function now(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): { doing: string; run: string } {
  let doing = ''
  let run = ''
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const b = decode(e.payload)
    if (!b || typeof b === 'string') continue
    if (e.kind === 'progress' && typeof b.activity === 'string') doing = b.activity
    if (e.kind === 'spawn' && typeof b.session === 'string') run = b.session
  }
  return { doing, run }
}
