/**
 * The builder's addresses, under whatever path the host mounts it at.
 *
 *   ''              the empty state: a new run
 *   sess_<32 hex>   one run
 *   -/<screen>      a builder screen
 *   <slug>          a project's workspace
 *
 * Unambiguous by construction: a project slug is `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`,
 * so it can hold neither the `_` a session id carries nor start with `-`.
 * Anything else is not an address here and reads as the empty state.
 */
export type Screen = 'artifacts' | 'templates' | 'codebases' | 'projects' | 'issues' | 'automations' | 'sync' | 'mcp'

export type Route =
  | { kind: 'new' }
  | { kind: 'run'; id: string }
  | { kind: 'screen'; screen: Screen }
  | { kind: 'project'; slug: string }

export const SESSION = /^sess_[0-9a-f]{32}$/
export const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/
const SCREENS: readonly Screen[] = ['artifacts', 'templates', 'codebases', 'projects', 'issues', 'automations', 'sync', 'mcp']

export function route(path: string): Route {
  const p = path.replace(/^\/+|\/+$/g, '')
  if (SESSION.test(p)) return { kind: 'run', id: p }
  if (p.startsWith('-/')) {
    const s = p.slice(2) as Screen
    return SCREENS.includes(s) ? { kind: 'screen', screen: s } : { kind: 'new' }
  }
  if (SLUG.test(p)) return { kind: 'project', slug: p }
  return { kind: 'new' }
}

/** The path for a route — the inverse of `route`. */
export function path(r: Route): string {
  switch (r.kind) {
    case 'new':
      return ''
    case 'run':
      return r.id
    case 'screen':
      return `-/${r.screen}`
    case 'project':
      return r.slug
  }
}
