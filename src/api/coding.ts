/**
 * Starting a coding run.
 *
 *   POST /v1/agent/coding → 202 {sessionId, repo, branch, project, routed, targetId}
 *
 * 202 is ADMITTED, not finished: the answer is the session the run narrates
 * itself in, and the session stream is how it is watched.
 *
 * Where it runs is one field. No `targetId` is the platform's sandbox; a target
 * id routes it to one of the org's machines, and `routed` says whether it got
 * there.
 *
 * `mode` is what the run may do: `build` edits, commits and pushes its branch;
 * `plan` reads the repository with a credential that can only read and answers
 * with a plan, as its final status. A plan runs in the platform's sandbox only —
 * a claimed machine clones and pushes with its own credential — so a plan
 * routed to one is refused, here before sending as on the platform.
 *
 * `model` and `effort` are taken by the dev harness the builder runs (and by
 * codex); the builder names no other harness, so they are always honoured.
 *
 * `setup` is a plan's shape put to one question: how this codebase is installed,
 * started and checked. Its agent may install and run things in its sandbox, and
 * its answer is kept as the codebase's proposed environment (environment.ts).
 */
import { call, Refusal, type Target } from './call.ts'

export type Mode = 'build' | 'plan' | 'setup'

/** Why this mode cannot run where it is sent, or '' when it can. */
export const unhonoured = (mode: Mode | undefined, target?: string): string =>
  (mode === 'plan' || mode === 'setup') && target?.trim()
    ? `A ${mode} runs in the Hanzo sandbox: a machine clones and pushes with its own credential. Choose Cloud, or switch to Build.`
    : ''

export interface Ask {
  /** The task, in the words you would use with a colleague. */
  prompt: string
  /**
   * The repository: its name in the caller's org, or `owner/name` as a run's
   * record states it, which the engine resolves as it did for that run.
   * Omitted starts something new.
   */
  repo?: string
  /** The branch to start from. Omitted takes the repository's default. */
  base?: string
  /** One of the org's machines. Omitted is the sandbox. */
  targetId?: string
  /** The project slug the run works on. */
  project?: string
  /** An earlier run's session to continue from, on the branch it pushed. */
  after?: string
  mode?: Mode
  model?: string
  effort?: string
}

export interface Run {
  session: string
  repo: string
  branch: string
  project: string
  routed: boolean
  target: string
}

/**
 * The request body: only what was asked, with no empty strings sent as values.
 * A run in the sandbox asks for one with a desktop, so its Desktop tab has a
 * screen to show; a machine is whatever it is.
 */
export function body(ask: Ask): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { prompt: ask.prompt.trim() }
  for (const k of ['repo', 'base', 'targetId', 'project', 'after', 'mode', 'model', 'effort'] as const) {
    const v = ask[k]?.trim()
    if (v) out[k] = v
  }
  if (!out.targetId) out.desktop = true
  return out
}

export async function start(t: Target, ask: Ask): Promise<Run> {
  if (!ask.prompt.trim()) throw new Refusal(400, 'Say what the run should do')
  const why = unhonoured(ask.mode, ask.targetId)
  if (why) throw new Refusal(400, why)
  const r = await call<Partial<Record<string, unknown>>>(t, 'POST', '/v1/agent/coding', body(ask))
  const s = (k: string) => (typeof r?.[k] === 'string' ? (r[k] as string) : '')
  if (!s('sessionId')) throw new Refusal(502, 'The run was admitted but named no session')
  return {
    session: s('sessionId'),
    repo: s('repo'),
    branch: s('branch'),
    project: s('project'),
    routed: r?.routed === true,
    target: s('targetId'),
  }
}

/** A run a follow-up continues, as its record states it. */
export interface Earlier {
  id: string
  title: string
  /** `owner/name`, as the record states it. */
  repo: string
  /** The branch it started from, or '' for the repository's default. */
  base: string
  /** 'sandbox', or the id of the machine it ran on. */
  environment: string
  project: string
  mode: string
  /** Its work is on its own branch (turn.ts `settled`). */
  pushed: boolean
}

/**
 * The earlier run's ask, without the codebase its title leads with (`universe:
 * add the widget`), or the `new project:` the platform titles a run that made its
 * codebase with (apps/coding start.go).
 */
export function headline(title: string, repo: string): string {
  const name = repo.split('/').filter(Boolean).pop() ?? ''
  const t = title.trim()
  for (const lead of [name, 'new project']) if (lead && t.startsWith(`${lead}: `)) return t.slice(lead.length + 2).trim()
  return t
}

/**
 * The same codebase, place and project as the earlier run, starting from its
 * branch when it pushed one. `after` IS that branch as the base (BaseOf,
 * apps/coding coding.go), so it is named only then: a plan, a setup, or a build
 * that changed nothing pushed no branch to clone, and its follow-up starts where
 * it did.
 */
function from(e: Earlier): Omit<Ask, 'prompt'> {
  const place = e.environment && e.environment !== 'sandbox' ? e.environment : undefined
  return {
    repo: e.repo || undefined,
    project: e.project || undefined,
    targetId: place,
    ...(e.pushed ? { after: e.id } : { base: e.base || undefined }),
  }
}

const modeOf = (m: string): Mode => (m === 'plan' || m === 'setup' ? m : 'build')

/**
 * A new run continuing an earlier one in its mode: what the person said, and
 * which run it follows, because the new run's agent reads nothing else. With
 * nothing said it goes on with the earlier ask, in the words the platform uses
 * when it carries a paused run on (apps/coding steer.go followUp).
 */
export function followUp(e: Earlier, said: string): Ask {
  const head = headline(e.title, e.repo)
  const words = said.trim()
  let prompt: string
  if (words) {
    const was = head ? `This follows an earlier run on this codebase: “${head}”.` : 'This follows an earlier run on this codebase.'
    prompt = `${words}\n\n${was}${e.pushed ? ' Its work so far is on this branch; build on it.' : ''}`
  } else {
    const kept = e.pushed ? 'An earlier run already worked on this; its work so far is on this branch. Build on it. ' : ''
    prompt = `${head}\n\n${kept}Continue where the earlier run left off.`.trim()
  }
  return { ...from(e), prompt, mode: modeOf(e.mode) }
}

/** A build of what a plan run answered: its ask as the title, and the plan to carry out. */
export function approve(e: Earlier, plan: string): Ask {
  const head = headline(e.title, e.repo)
  const ask = `Carry out this plan:\n\n${plan.trim()}`
  return { ...from(e), prompt: head ? `${head}\n\n${ask}` : ask, mode: 'build' }
}

/**
 * The same ask again, where the earlier run worked and in its mode: what a failed
 * run's Try again starts. `ask` is the person's words as the run recorded them;
 * with none recorded, its title's.
 */
export function retry(e: Earlier, ask: string): Ask {
  return { ...from(e), prompt: ask.trim() || headline(e.title, e.repo), mode: modeOf(e.mode) }
}
