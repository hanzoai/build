/**
 * WHERE THIS PAGE SIGNS IN, AND WHERE ITS PLATFORM IS: read from the page's own
 * address at call time, unless the build names others. A fork sets
 * `VITE_HANZO_CLIENT_ID`, `VITE_HANZO_IAM` and `VITE_HANZO_API`; the page hands
 * over `import.meta.env`.
 */
export type Env = { readonly [name: string]: string | undefined }

/**
 * The IAM client: `hanzo-app`, the Hanzo App's, which hanzo.ai signs in through
 * too — one product, one application. Under the estate's `<org>-<app>` scheme
 * the org is the name's first word, and the issuer returns a browser to
 * `/auth/callback` on this origin (the dev server's is registered on it).
 */
export function origin(env: Env) {
  const clientId = env.VITE_HANZO_CLIENT_ID || 'hanzo-app'
  return {
    serverUrl: (env.VITE_HANZO_IAM || 'https://hanzo.id').replace(/\/+$/, ''),
    clientId,
    redirectUri: `${window.location.origin}/auth/callback`,
    organization: clientId.split('-')[0]!,
  }
}

/**
 * The platform. `api.hanzo.ai` on a hanzo.ai host; this page's own origin
 * anywhere else, where the dev and preview servers proxy `/v1` — the gateway
 * admits an origin by allowlist and a localhost port is not on it.
 */
export function api(env: Env): string {
  if (env.VITE_HANZO_API) return env.VITE_HANZO_API.replace(/\/+$/, '')
  const host = window.location.hostname
  if (host === 'hanzo.ai' || host.endsWith('.hanzo.ai')) return 'https://api.hanzo.ai'
  return window.location.origin
}
