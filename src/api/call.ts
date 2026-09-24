/**
 * One request path to the platform.
 *
 * Every typed op below goes through `call`, so the bearer, the org scope, the
 * no-store cache rule and the reading of a refusal are decided once. The
 * platform answers a refusal as RFC 9457 problem details; older handlers still
 * answer `{error:{message}}` or `{msg}`, and all three read the same way here.
 */

/** Where the platform is and who is asking. The host supplies it. */
export interface Target {
  /** The platform origin, no trailing slash: calls are `${api}/v1/…`. */
  api: string
  /** The signed-in person's bearer, or null for nobody. */
  token: () => string | null
  /** The org every call is scoped to, sent as `X-Org-Id`. */
  org: string | null
}

/** A refusal: the status, and the platform's own sentence for it. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'Refusal'
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>

/** `?a=1&b=2` from the defined, non-empty entries of `q`, or ''. */
export function query(q: Query = {}): string {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue
    s.set(k, String(v))
  }
  const out = s.toString()
  return out ? `?${out}` : ''
}

/** The headers every call carries: the bearer and the org, when there are ones. */
export function headers(t: Target, extra?: HeadersInit): Headers {
  const h = new Headers(extra)
  const token = t.token()
  if (token && !h.has('Authorization')) h.set('Authorization', `Bearer ${token}`)
  if (t.org && !h.has('X-Org-Id')) h.set('X-Org-Id', t.org)
  return h
}

/** The sentence a refusal carries, whichever envelope it arrived in. */
export async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      detail?: string
      title?: string
      error?: { message?: string } | string
      msg?: string
      message?: string
    }
    const err = typeof body.error === 'string' ? body.error : body.error?.message
    return body.detail || err || body.msg || body.message || body.title || ''
  } catch {
    return ''
  }
}

/** A path segment, escaped. Ids and names from a row never compose a path raw. */
export const seg = (s: string): string => encodeURIComponent(s)

/**
 * One JSON call. Throws `Refusal` on any non-2xx, with the platform's reason, or
 * the status when it gave none. A 204 answers `undefined`.
 */
export async function call<T>(
  t: Target,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  init?: { signal?: AbortSignal },
): Promise<T> {
  const h = headers(t, body === undefined ? undefined : { 'Content-Type': 'application/json' })
  const res = await fetch(`${t.api}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    // A run, a repo list and a status are facts about now. A cached refusal
    // outlives the fix.
    cache: 'no-store',
    signal: init?.signal,
  })
  if (!res.ok) {
    const why = await reason(res)
    throw new Refusal(res.status, why || `${method} ${path.split('?')[0]} answered ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}
