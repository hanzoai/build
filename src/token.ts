/**
 * WHERE THE SESSION IS KEPT, named once.
 *
 * The @hanzo/iam SDK owns these keys and publishes no reader a plain module can
 * call — `getSession()` needs `configureIam()`, and this app configures through
 * `IamProvider` instead. So the names are restated here, in ONE file, and
 * everything that needs the bearer asks this. Two derivations of one key name
 * never agree, and the disagreement is silent: a read of the wrong name answers
 * null, which is indistinguishable from nobody being signed in.
 *
 * Every access is guarded, because storage THROWS rather than answering null in
 * a browser that refuses it, and a caller reaching for the bearer is usually
 * about to make a request — one that should fail as unauthenticated, not as an
 * exception.
 */

/** The SDK's own keys, `hanzo_iam_`-prefixed. The far side of a boundary. */
const PREFIX = 'hanzo_iam_'
const ACCESS = `${PREFIX}access_token`

/** Who this browser's local state belongs to. */
const WHO = 'hanzo:who'

/** The SDK's per-person selections. Everything else under its prefix is the
 *  session's own machinery — tokens, the login in flight — and stays. */
const CHOSEN = [`${PREFIX}current_org`, `${PREFIX}current_project`]

/** What a change of person leaves in place. */
const kept = (key: string): boolean =>
  key === WHO || (key.startsWith(PREFIX) && !CHOSEN.includes(key))

/** The access token, or null. */
export function bearer(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACCESS)
  } catch {
    return null
  }
}

/** The claims the stored token carries, or null. */
function claims(): Record<string, unknown> | null {
  const token = bearer()
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * The subject the stored access token names, or undefined.
 *
 * Read off the claim rather than waited for from userinfo, which is what makes
 * `own` runnable BEFORE anything else reads storage: the token is in place from
 * the first line of the first script. Expiry is not consulted — a stale token
 * still says whose browser this is, and the SDK either refreshes it or clears
 * it, at which point the answer changes here too.
 */
export function subject(): string | undefined {
  const sub = claims()?.sub
  return typeof sub === 'string' && sub ? sub : undefined
}

/** Whether this browser holds a session. */
export function hasSession(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(bearer() || window.localStorage.getItem(WHO))
  } catch {
    return false
  }
}

/**
 * Bind everything this app keeps in the browser to ONE person.
 *
 * The starred projects and the SDK's current org are written per browser and
 * would otherwise be read by whoever signs in next. The subject is recorded
 * beside them, and when a different subject arrives — or nobody, which is a
 * sign-out — the last person's keys go before anything reads them. The SDK's
 * `hanzo_iam_*` keys are the arriving session itself and stay.
 *
 * Same subject, no work. Called where the providers mount, so a page's first
 * read of storage already sees a browser that is the reader's.
 */
export function own(sub: string | undefined): void {
  if (typeof window === 'undefined') return
  try {
    const store = window.localStorage
    if (store.getItem(WHO) === (sub ?? null)) return
    for (const key of Object.keys(store))
      if (key.startsWith('hanzo') && !kept(key)) store.removeItem(key)
    if (sub) store.setItem(WHO, sub)
    else store.removeItem(WHO)
  } catch {
    /* a browser that refuses storage kept nothing to remove */
  }
}

/**
 * The organizations the token says this person belongs to, home first. Empty
 * for an account that has not made one: the SDK's own list falls back to the
 * `owner` claim, which is the application's org and nobody's to work in.
 */
export function orgs(): string[] {
  const set = claims()?.orgs
  const out: string[] = []
  for (const ref of Array.isArray(set) ? set : []) {
    const o = (ref as { org?: unknown } | null)?.org
    if (typeof o === 'string' && o && !out.includes(o)) out.push(o)
  }
  return out
}

/**
 * The organization this browser works in: the SDK's selection, when it is one
 * of the token's. A sole organization is not a choice and is the answer from
 * the first render — waiting for a pick would build the client unscoped and
 * restart every read after first paint.
 */
export function org(): string | null {
  try {
    const mine = orgs()
    const chosen = window.localStorage.getItem(`${PREFIX}current_org`)
    if (chosen && mine.includes(chosen)) return chosen
    return mine.length === 1 ? mine[0]! : null
  } catch {
    return null
  }
}

/** The headers that scope a request to the signed-in person and their org. */
export function scope(): Record<string, string> {
  const h: Record<string, string> = {}
  const t = bearer()
  if (t) h.Authorization = `Bearer ${t}`
  const o = org()
  if (o) h['X-Org-Id'] = o
  return h
}
