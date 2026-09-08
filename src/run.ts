/**
 * Starting a coding run, and where it runs.
 *
 * The contract, read off the served document:
 *   POST /v1/agents/coding → 202 {sessionId, repo, branch, routed, targetId}
 *
 * WHERE A RUN RUNS IS ONE FIELD. Omit `targetId` and the run goes to the
 * platform's own sandbox; name one and it is routed to a machine the org has
 * claimed. The answer comes back rather than being assumed: `routed` says
 * whether it reached a machine and `targetId` says which, so a caller that
 * asked for a machine and reads `routed: false` was given a sandbox and can say
 * so rather than draw a screen that claims otherwise.
 *
 * That is the whole of the browser-versus-desktop question. A browser has no
 * machine to offer, so it sends no target and gets a sandbox. Nothing here
 * sniffs a user agent to decide — the caller says what it has.
 *
 * A REFUSAL IS ANSWERED, NEVER SYNTHESISED. 401 is the credential and 403 is
 * permission, and neither is "try again", so neither says it. A run id this
 * module invented would open a pane of live controls over nothing.
 */
import { api } from '~/api'
import { scope } from '~/token'

/** What a coding run answers with. 202 — accepted, not finished. */
export interface Run {
  /** The session this run's activity hangs off. */
  session: string
  repo: string
  /** The branch the run works on; the platform picks one when `base` is empty. */
  branch: string
  /** Whether it reached a claimed machine. False means the sandbox took it. */
  routed: boolean
  /** Which machine, when one took it. Empty for a sandbox run. */
  target: string
}

export interface Ask {
  /** The task, in the words you would use with a colleague. */
  prompt: string
  /** Model to route the coding agent through. */
  model?: string
  /** `owner/name` in the caller's own org. */
  repo?: string
  /** Which harness runs the prompt. */
  tool?: string
  /** The branch to start from. Empty takes the repository's default. */
  base?: string
  /** Route to a claimed machine. OMITTED IS THE SANDBOX. */
  targetId?: string
}

export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Starts one autonomous coding run and answers the session it opened. */
export async function run(ask: Ask): Promise<Run> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const [k, v] of Object.entries(scope())) headers.set(k, v)

  const res = await fetch(`${api()}/v1/agents/coding`, {
    method: 'POST',
    body: JSON.stringify(ask),
    // A run is a fact about right now, and a cached refusal survives the fix —
    // it reads as the platform still being broken long after it is not.
    cache: 'no-store',
    headers,
  })

  if (res.status === 401)
    throw new Refusal(401, headers.has('Authorization') ? 'Your session expired — sign in again' : 'Sign in to start a run')
  if (res.status === 403) throw new Refusal(403, 'Your role cannot start runs in this organization')
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string }; msg?: string }
      detail = body?.error?.message || body?.msg || ''
    } catch {
      // A refusal with no JSON body is still a refusal; the status carries it.
    }
    throw new Refusal(res.status, detail || `Could not start the run (${res.status})`)
  }

  const body = (await res.json()) as Partial<{ sessionId: string; repo: string; branch: string; routed: boolean; targetId: string }>
  if (!body.sessionId) {
    // Accepted with no session is not a run anybody can watch. Say so rather
    // than hand back a half-value the caller renders as success.
    throw new Refusal(502, 'The run was accepted but named no session')
  }
  return {
    session: body.sessionId,
    repo: body.repo ?? '',
    branch: body.branch ?? '',
    routed: body.routed ?? false,
    target: body.targetId ?? '',
  }
}
