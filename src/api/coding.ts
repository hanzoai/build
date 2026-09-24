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
 * `mode`, `model` and `effort` are this surface's asks of the contract: `plan`
 * is a run that plans and writes nothing, `build` edits, commits and pushes.
 * They are sent as asked and never simulated here — a run the platform has not
 * been told how to plan is not made to look like one.
 */
import { call, Refusal, type Target } from './call.ts'

export type Mode = 'build' | 'plan'

/**
 * The modes the platform honours today. `CodingStartIn` takes no `mode` yet, so
 * a plan run would edit, commit and push like any other — on a machine, with
 * that machine's credentials. Until the platform takes `plan`, a plan ask is
 * refused here rather than sent to become a build.
 */
export const HONOURED: readonly Mode[] = ['build']

/** Why a mode cannot be asked for yet, or '' when it can. */
export const unhonoured = (mode: Mode | undefined): string =>
  mode && !HONOURED.includes(mode)
    ? 'Plan needs the platform’s plan mode, which the coding API does not take yet — this ask would build. Switch to Build, or wait for Plan.'
    : ''

export interface Ask {
  /** The task, in the words you would use with a colleague. */
  prompt: string
  /** `owner/name`. Omitted starts something new, in a repository named for it. */
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

/** The request body: only what was asked, with no empty strings sent as values. */
export function body(ask: Ask): Record<string, string> {
  const out: Record<string, string> = { prompt: ask.prompt.trim() }
  for (const k of ['repo', 'base', 'targetId', 'project', 'after', 'mode', 'model', 'effort'] as const) {
    const v = ask[k]?.trim()
    if (v) out[k] = v
  }
  return out
}

export async function start(t: Target, ask: Ask): Promise<Run> {
  if (!ask.prompt.trim()) throw new Refusal(400, 'Say what the run should do')
  const why = unhonoured(ask.mode)
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
