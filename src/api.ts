/**
 * WHERE THE PLATFORM IS, DERIVED ONCE.
 *
 * A FUNCTION, NOT A CONSTANT. A module-scope `const` is evaluated when the chunk
 * loads, which is before the page can say where it is. Called at use time it
 * answers for the document that is open.
 *
 * The local case is why this is not simply the absolute address. api.hanzo.ai
 * admits an origin by allowlist and by an https, portless DNS proof; a
 * localhost port satisfies neither, so a credentialed read to the absolute
 * address fails its preflight and the builder draws as though the org owned
 * nothing. `vite.config.ts` proxies `/v1` for exactly this, and same-origin is
 * what lets the proxy do its job.
 */

/** The gateway's origin, with no trailing slash: callers write `${api()}/v1/…`. */
export function api(): string {
  const set = import.meta.env.VITE_HANZO_API
  if (set) return set.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    // A host the gateway already admits can address it absolutely; anywhere
    // else asks its own origin and lets the proxy in front of it answer.
    if (host === 'hanzo.ai' || host.endsWith('.hanzo.ai')) return 'https://api.hanzo.ai'
    return window.location.origin
  }
  return 'https://api.hanzo.ai'
}

/**
 * Identity, likewise once. IAM issues the bearer every call above carries and
 * is not reached through the API host, so it is a second address rather than a
 * path on the first. It is not proxied and does not need to be — hanzo.id
 * admits localhost on authorize, token and userinfo.
 */
export function iam(): string {
  return (import.meta.env.VITE_HANZO_IAM || 'https://hanzo.id').replace(/\/+$/, '')
}
