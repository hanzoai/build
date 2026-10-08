/**
 * The builder's addresses, under whatever path the host mounts it at.
 *
 *   ''              the empty state: a new run
 *   sess_<32 hex>   one run
 *   -/<screen>      a builder screen
 *   -/automations/<id>      one automation's editor and runs; `new` writes one
 *   -/settings[/<section>]  a section of Settings
 *   -/customize[/<tab>]     skills, connectors and plugins: what the agent brings to a run
 *   -/plans                 the plans an organization can be on
 *   <org>/<repo>    a repository's workspace: a project is a repository on the forge
 *   <slug>          a deployed site's workspace (Artifacts)
 *
 * Unambiguous by construction: a project slug is `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`,
 * so it can hold neither the `_` a session id carries nor start with `-`, and a
 * repository is the one address with two segments, each starting with a letter
 * or a digit. Anything else is not an address here and reads as the empty state.
 */
export type Screen = 'artifacts' | 'templates' | 'projects' | 'issues' | 'automations' | 'sync' | 'mcp' | 'plans'

/** Settings, one section each. Every setting the builder has lives on this page, none elsewhere. */
export const SECTIONS = [
  'general',
  'account',
  'privacy',
  'billing',
  'usage',
  'capabilities',
  'memory',
  'code',
  'environments',
  'machines',
  'keys',
  'members',
  'integrations',
  'notifications',
] as const
export type Section = (typeof SECTIONS)[number]

/** Customize, one tab each: what the agent brings to a run, yours and to discover. */
export const TABS = ['skills', 'connectors', 'plugins', 'agents'] as const
export type Tab = (typeof TABS)[number]

export type Route =
  | { kind: 'new' }
  | { kind: 'run'; id: string }
  | { kind: 'screen'; screen: Screen }
  | { kind: 'settings'; section: Section }
  | { kind: 'customize'; tab: Tab }
  | { kind: 'project'; slug: string }
  | { kind: 'repo'; org: string; name: string }
  | { kind: 'automation'; id: string }

export const SESSION = /^sess_[0-9a-f]{32}$/
export const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/
/** An organization or a repository name on the forge (api/codebases.ts `NAME`). */
export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
/** An automation's id, or `new` for one not yet written. */
export const AUTOMATION = /^(flow_[0-9a-f]{32}|new)$/
const SCREENS: readonly Screen[] = ['artifacts', 'templates', 'projects', 'issues', 'automations', 'sync', 'mcp', 'plans']

export function route(path: string): Route {
  const p = path.replace(/^\/+|\/+$/g, '')
  if (SESSION.test(p)) return { kind: 'run', id: p }
  if (p === '-/settings' || p.startsWith('-/settings/')) {
    const section = (p.slice('-/settings/'.length) || 'general') as Section
    return SECTIONS.includes(section) ? { kind: 'settings', section } : { kind: 'new' }
  }
  if (p === '-/customize' || p.startsWith('-/customize/')) {
    const tab = (p.slice('-/customize/'.length) || 'skills') as Tab
    return TABS.includes(tab) ? { kind: 'customize', tab } : { kind: 'new' }
  }
  if (p.startsWith('-/automations/')) {
    const id = p.slice('-/automations/'.length)
    return AUTOMATION.test(id) ? { kind: 'automation', id } : { kind: 'new' }
  }
  if (p.startsWith('-/')) {
    const s = p.slice(2) as Screen
    return SCREENS.includes(s) ? { kind: 'screen', screen: s } : { kind: 'new' }
  }
  if (SLUG.test(p)) return { kind: 'project', slug: p }
  const [org, name, ...rest] = p.split('/')
  if (!rest.length && org && name && NAME.test(org) && NAME.test(name)) return { kind: 'repo', org, name }
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
    case 'settings':
      return r.section === 'general' ? '-/settings' : `-/settings/${r.section}`
    case 'customize':
      return r.tab === 'skills' ? '-/customize' : `-/customize/${r.tab}`
    case 'project':
      return r.slug
    case 'repo':
      return `${r.org}/${r.name}`
    case 'automation':
      return `-/automations/${r.id}`
  }
}
