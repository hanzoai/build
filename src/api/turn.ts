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
 * `log` for a free line. A person's steering is a `control` {command, message}.
 *
 * `cards` is the transcript as it is drawn: the run's steps, and the agent's own
 * output read by what each part is (harness.ts). The output a card shows is what
 * the run's Terminal log already prints; a command's working directory, which is
 * the sandbox's layout, is dropped.
 */
import { harness } from './harness.ts'
import type { Event } from './sessions.ts'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The payload as an object. A live frame may carry it as a JSON string. */
export function decode(payload: unknown): Record<string, unknown> | string | null {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload !== 'string') return null
  const text = payload.trim()
  if (!text.startsWith('{')) return payload
  // JSON that opens with a brace is an object; anything else is prose that opens with one.
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return payload
  }
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
      // A setup is a plan put to one question, and answers the same way.
      if (mode === 'plan') return str(b.plan) || 'Planned — the run answered with no plan'
      if (mode === 'setup') return str(b.plan) || 'Set up — the run answered with no environment'
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
      return branch && b.changed ? `Paused — work kept on ${branch}` : 'Paused'
    case 'followed':
      // A run redirected from a chat thread is carried on by a follow-up (apps/coding steer.go).
      return str(b.next) ? 'Continued in a follow-up run' : 'The follow-up run could not start'
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

/** One line of the shell: a command the run started, or output that followed it. */
export interface ShellLine {
  role: 'cmd' | 'out'
  text: string
}

/**
 * The shell beside the transcript. A tool call is the command; a log line, and
 * any stdout or stderr the payload carried, is the output. Status stays in the
 * transcript. Each line is capped so a payload that carried a file body cannot
 * fill the pane.
 */
export function shell(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): ShellLine[] {
  const cap = 4000
  const clip = (s: string) => (s.length > cap ? `${s.slice(0, cap)}…` : s)
  const out: ShellLine[] = []
  const push = (role: ShellLine['role'], text: string) => {
    const line = clip(text)
    if (line) out.push({ role, text: line })
  }
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== 'log' && e.kind !== 'tool-call') continue
    const body = decode(e.payload)
    if (typeof body === 'string') {
      push('out', body)
      continue
    }
    if (!body) continue
    const step = str(body.step)
    const message = str(body.message) || str(body.text) || str(body.command)
    const stdout = str(body.stdout)
    const stderr = str(body.stderr)
    if (e.kind === 'tool-call' && step) push('cmd', step)
    if (message && message !== step) push('out', message)
    if (stdout) push('out', stdout)
    if (stderr) push('out', stderr)
  }
  return out.slice(-400)
}

/** A step the run named. Done is a step whose status has settled. */
export interface StepLine {
  name: string
  done: boolean
}

/**
 * Tool calls, in the order they were first named. A later status for the same
 * step wins, and a run's steps follow one another, so a step another has
 * followed is over. `exit` is not a step: it is how the sandbox says one command
 * in it ended (apps/sandbox work.go).
 */
export function steps(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): StepLine[] {
  const order: string[] = []
  const done = new Map<string, boolean>()
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== 'tool-call') continue
    const body = decode(e.payload)
    if (!body || typeof body === 'string') continue
    const name = str(body.step)
    if (!name || name === 'exit') continue
    if (!done.has(name)) order.push(name)
    const status = str(body.status)
    done.set(name, status === 'ok' || status === 'done' || status === 'error')
  }
  return order.map((name, i) => ({ name, done: i < order.length - 1 || done.get(name) === true }))
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
  const head = actor.slice(cut + 1).split('-')[0]!
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

/** How a card's work went. One still running once the run has ended was cut off. */
export type Ran = 'running' | 'done' | 'error' | 'cancelled'

/**
 * One piece of the transcript, drawn by what it is.
 *
 *   said   prose: the agent's messages (markdown), or a person's steering words
 *   shell  a command the agent ran, and what it printed
 *   edit   files the agent changed, with the diff when the harness printed one
 *   read   a file the agent read, drawn as a chip
 *   step   a step of the run itself (lease, clone, install, push), or a tool the agent called
 *   note   a lifecycle line: started, pushed, stopped
 *   plan   a plan run's answer, which can be approved into a build
 */
export type Card =
  | { kind: 'said'; key: string; who: 'person' | 'agent'; text: string }
  | { kind: 'shell'; key: string; command: string; output: string; ran: Ran }
  | { kind: 'edit'; key: string; files: string[]; patch: string; ran: Ran }
  | { kind: 'read'; key: string; file: string; ran: Ran }
  | { kind: 'step'; key: string; name: string; detail: string; output: string; ran: Ran }
  | { kind: 'note'; key: string; text: string }
  | { kind: 'plan'; key: string; text: string }

/** The platform's own words for the step that starts the agent (apps/coding sandboxrunner.go). */
const TASK = 'running the task'

/** What the run's own steps are called on a card. */
const NAMES: Record<string, string> = {
  lease: 'Sandbox',
  clone: 'Clone',
  secrets: 'Secrets',
  install: 'Install',
  start: 'Start',
  push: 'Push',
  keep: 'Keep the work',
}

/** Steps another card already says: `leased` finishes the lease, `done` is the final status, `ended` is housekeeping. */
const QUIET = new Set(['leased', 'done', 'ended'])

const ranOf = (status: string): Ran => (status === 'ok' || status === 'done' ? 'done' : status === 'error' ? 'error' : 'running')

/**
 * A run's events, as the cards its transcript draws. `mode` is the run's, from
 * its record: a plan's final status is its plan, and nothing else draws a plan.
 *
 * The run's own steps arrive as `tool-call` {step, message, status}; each
 * command in the sandbox narrates its output as `log` {message} chunks and ends
 * with `tool-call` {step: "exit"}. The output after the step that starts the
 * agent is the agent's, read by its harness's grammar (harness.ts); after any
 * other step it is that step's. Once the agent has exited, the commands the run
 * runs before it pushes commit its work.
 */
export function cards(events: Pick<Event, 'kind' | 'payload' | 'seq'>[], mode = ''): Card[] {
  const out: Card[] = []
  let seq = 0
  let n = 0
  const mint = () => `${seq}.${n++}`
  let phase: Extract<Card, { kind: 'step' }> | null = null
  let agent: ReturnType<typeof harness> | null = null
  // The agent has run and exited: output with no step of its own is the run's.
  let exited = false
  const settle = () => {
    agent?.end()
    agent = null
    phase = null
  }
  const answers = new Set<string>()
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    seq = e.seq
    n = 0
    const body = decode(e.payload)
    const b = body && typeof body === 'object' ? body : null
    switch (e.kind) {
      case 'log': {
        const text = typeof body === 'string' ? body : str(b?.message) || str(b?.text)
        if (!text) break
        if (agent) agent.feed(text)
        else if (phase) phase.output += text
        else if (exited) {
          phase = { kind: 'step', key: mint(), name: 'Commit', detail: 'committing the work', output: text, ran: 'running' }
          out.push(phase)
        } else {
          agent = harness(out, mint)
          agent.feed(text)
        }
        break
      }
      case 'tool-call': {
        if (!b) break
        const step = str(b.step)
        const message = str(b.message)
        if (step === 'exit') {
          // One command in the sandbox ended: `exit 0`, `exit 1`, or `ended: …`.
          if (agent) {
            settle()
            exited = true
          } else if (phase && phase.ran === 'running') phase.ran = message === 'exit 0' ? 'done' : 'error'
          break
        }
        if (message === TASK) {
          settle()
          exited = false
          agent = harness(out, mint)
          break
        }
        if (step === 'leased') {
          const lease = out.find((c): c is Extract<Card, { kind: 'step' }> => c.kind === 'step' && c.name === NAMES.lease)
          if (lease) lease.ran = 'done'
        }
        if (!step || QUIET.has(step)) break
        const name = NAMES[step] ?? step.charAt(0).toUpperCase() + step.slice(1)
        if (phase && phase.name === name) {
          phase.ran = ranOf(str(b.status))
          if (message) phase.detail = message
          break
        }
        settle()
        phase = { kind: 'step', key: mint(), name, detail: message, output: '', ran: ranOf(str(b.status)) }
        out.push(phase)
        break
      }
      case 'status': {
        settle()
        if (!b) break
        const text = str(b.plan)
        if (str(b.status) === 'done' && (mode === 'plan' || mode === 'setup') && text) {
          answers.add(text.trim())
          out.push(mode === 'plan' ? { kind: 'plan', key: mint(), text } : { kind: 'said', key: mint(), who: 'agent', text })
          break
        }
        const line = status(b, mode)
        if (line) out.push({ kind: 'note', key: mint(), text: line })
        break
      }
      case 'control': {
        if (!b) break
        const command = str(b.command)
        const said = str(b.message)
        if (command === 'message' && said) out.push({ kind: 'said', key: mint(), who: 'person', text: said })
        else if (command === 'pause') out.push({ kind: 'note', key: mint(), text: 'Pause asked' })
        else if (command === 'resume') out.push({ kind: 'note', key: mint(), text: 'Resume asked' })
        else if (command === 'stop') out.push({ kind: 'note', key: mint(), text: 'Stop asked' })
        break
      }
      case 'message': {
        const text = typeof body === 'string' ? body : str(b?.text) || str(b?.content) || str(b?.message)
        if (text) out.push({ kind: 'said', key: mint(), who: str(b?.role) === 'user' ? 'person' : 'agent', text })
        break
      }
    }
  }
  settle()
  // The answer the final status carries is also the agent's last message: draw it once, as the answer.
  let kept = false
  for (let i = out.length - 1; i >= 0; i--) {
    const c = out[i]!
    if (!((c.kind === 'said' && c.who === 'agent') || c.kind === 'plan') || !answers.has(c.text.trim())) continue
    if (kept) out.splice(i, 1)
    kept = true
  }
  return out
}

/** The plan a plan run answered with, from its final status, or ''. */
export function answer(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): string {
  let out = ''
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== 'status') continue
    const b = decode(e.payload)
    if (b && typeof b === 'object' && str(b.status) === 'done') out = str(b.plan)
  }
  return out
}

export interface Settled {
  /** The run has said how it ended, or that it paused: its work is where it will stay. */
  settled: boolean
  /** That work is on the run's own branch, which a follow-up can start from. */
  pushed: boolean
}

/**
 * Whether the run has kept its work yet, and whether that work is on its
 * branch. A stop or a pause commits and pushes AFTER it is asked, and says so
 * in its status (apps/coding coding.go interrupted): until then a follow-up
 * would clone a branch the push has not reached.
 */
export function settled(events: Pick<Event, 'kind' | 'payload' | 'seq'>[]): Settled {
  const out: Settled = { settled: false, pushed: false }
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind !== 'status') continue
    const b = decode(e.payload)
    if (!b || typeof b === 'string') continue
    const s = str(b.status)
    if (s === 'done' || s === 'error' || s === 'stopped' || s === 'paused') {
      out.settled = true
      out.pushed = b.changed === true
    }
  }
  return out
}
