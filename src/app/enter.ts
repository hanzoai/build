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
  login: () => Promise<unknown>
}

const KEY = 'signin.destination'

/** Where a return with nowhere written down lands: New. */
const HOME = '/'

/** Write down where this tab is, and leave for hanzo.id. */
export function enter(door: Door): void {
  try {
    const { pathname, search, hash } = window.location
    window.sessionStorage.setItem(KEY, `${pathname}${search}${hash}`)
  } catch {
    /* nowhere to write it; the return lands on New */
  }
  void door.login()
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
