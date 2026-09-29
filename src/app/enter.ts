/**
 * Signing in, one way: this tab goes to hanzo.id and comes back.
 *
 * There is no popup. hanzo.id answers an authorize from a session it already
 * holds with a code and no screen (hanzoai/iam internal/oidc/prompt.go), so a
 * person signed in anywhere Hanzo signs people in is signed in here by a bounce;
 * anyone else signs in or up there and is returned. The address they were at
 * is written down on the way out and read back by the callback (callback.tsx),
 * and what they had typed on New waits in this tab (landing.tsx).
 *
 * sessionStorage, because the note belongs to this one trip and this one tab.
 * Every access is guarded: a browser that refuses storage is still signed in,
 * and lands on New.
 */
export interface Door {
  login: (params?: { additionalParams?: Record<string, string> }) => Promise<unknown>
}

const KEY = 'signin.destination'

/** Noted, with the time, when this tab followed a sign-out made in another. */
const FORM = 'signin.form'
/** How long the note holds: the reload that follows the sign-out reaches `enter` well inside it. */
const FORM_MS = 10_000

/** Where a return with nowhere written down lands: New. */
const HOME = '/'

/**
 * Write down where this tab is, and leave for hanzo.id: for the sign-in form
 * (`prompt=login`) when this tab has just followed a sign-out (`form`).
 */
export function enter(door: Door): void {
  try {
    const { pathname, search, hash } = window.location
    window.sessionStorage.setItem(KEY, `${pathname}${search}${hash}`)
  } catch {
    /* nowhere to write it; the return lands on New */
  }
  void door.login(formed() ? { additionalParams: { prompt: 'login' } } : undefined)
}

/**
 * This tab followed a sign-out made in another. The sign-out is still on its
 * way to hanzo.id, and until it lands the session there answers an ordinary
 * trip with a code and signs this tab straight back in, so this tab's next trip
 * asks for the sign-in form instead.
 */
export function form(): void {
  try {
    window.sessionStorage.setItem(FORM, String(Date.now()))
  } catch {
    /* nowhere to note it; the trip is an ordinary one */
  }
}

/** Read-once: whether `form` was noted moments ago in this tab. */
function formed(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(FORM))
    window.sessionStorage.removeItem(FORM)
    return Date.now() - at < FORM_MS
  } catch {
    return false
  }
}

/**
 * Read-once: where this sign-in started, when that is an address of this page
 * and not the callback itself (whose code is spent by the time anyone reads
 * this). `//host` and `/\host` begin with a slash and leave the origin, so a
 * path is a slash not followed by either.
 */
export function back(): string {
  let held: string | null = null
  try {
    held = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
  } catch {
    return HOME
  }
  if (!held || !held.startsWith('/') || held.startsWith('//') || held.startsWith('/\\')) return HOME
  if (/^\/auth\/callback\/?(?:[?#]|$)/.test(held)) return HOME
  return held
}
