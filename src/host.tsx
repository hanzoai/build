/**
 * What the builder needs from the page that mounts it.
 *
 * The builder is ONE component with several hosts: its own page (hanzo.build,
 * which signs in through Hanzo IAM and routes with react-router) and the Hanzo
 * app's Dev section (hanzo.ai/dev and hanzo.app/dev, which already have a
 * session, a router and a rail). Everything that differs between them is here,
 * as values, so no host forks the builder and the builder imports no host.
 */
import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react'

import type { Cast } from './api/agents.ts'
import type { Target } from './api/call.ts'
import type { Theme } from './api/pref.ts'

export interface Person {
  name: string
  email: string
  /** An https image, or '' for the initial. */
  avatar: string
}

/**
 * A page tab's address, drawn by the host rather than in a frame: what the
 * window can show of any site, where a browser page can frame only the sites
 * that allow it. `onGo` is a move the page made itself (a link followed), and
 * `onTitle` the title it gave itself.
 */
export type Browse = ComponentType<{ url: string; title: string; onGo: (url: string) => void; onTitle?: (title: string) => void }>

/** A page as the host's browser is asked about it: the tab, and what it shows. */
export interface Shown {
  id: string
  url: string
  title: string
}

/**
 * What the host's browser can do to the page a tab shows, each the row of the
 * same name in the tab's menu. A host draws only the rows it supplies, so the
 * menu offers nothing the window cannot do; a browser page supplies none and
 * draws what a page itself can (panel.tsx).
 */
export interface Browser {
  find?: (page: Shown) => void
  print?: (page: Shown) => void
  /** Zoom the page to `percent` (100 is its own size). */
  zoom?: (page: Shown, percent: number) => void
  devices?: (page: Shown) => void
  /** The page's pixels, as an image. */
  capture?: (page: Shown) => Promise<Blob>
  /** What the reader has selected in the page. */
  selection?: (page: Shown) => Promise<string>
  passwords?: () => void
  downloads?: () => void
  history?: () => void
  clear?: () => void
  settings?: () => void
}

export interface Host {
  /** The product's name, drawn at the top left: `Hanzo Build` on hanzo.build, `Hanzo` on hanzo.ai. */
  name: string
  /** The platform origin, no trailing slash. */
  api: string
  /** The signed-in person's bearer, or null. Read at call time, so a refresh is picked up. */
  token: () => string | null
  /** The org every call is scoped to. */
  org: string | null
  /** The org's own logo, an https address, when it has chosen one; its mark is drawn from it. */
  logo?: string
  /** The organizations this person belongs to. The switcher lists these and no others. */
  memberships?: readonly string[]
  /** Stay on this page and scope every read to `org`. */
  chooseOrg?: (org: string) => void
  /** The page's theme as last chosen, for a host that can change it. */
  theme?: Theme
  /** Paint the page in `theme`. A host without it keeps its own, and Settings offers no choice. */
  chooseTheme?: (theme: Theme) => void
  /** Who is signed in, or null. */
  person: Person | null
  /** Whether the person administers `org` (its owner or an admin): they publish to main and change its money; anyone else opens a review and reads. */
  admin: boolean
  /** The address under the mount, in route.ts's grammar: '' | a session id | `<org>/<repo>` | a slug | '-/projects' | '-/issues' | … */
  path: string
  /** Move under the mount. */
  go: (path: string, how?: { replace?: boolean }) => void
  /** Where the builder links out. On hanzo.build these are addresses of this page. */
  links: {
    /** GitHub for this page: bringing repositories onto the forge. */
    github: string
    /** Customize, an address of this host. */
    customize: string
    /** Account settings, an address of this host. */
    settings: string
    /** This host's home. On hanzo.build it is the page itself. */
    home: string
  }
  /** Open a host address in this window. hanzo.build keeps the window on its own origin. */
  open: (href: string) => void
  signIn?: () => void
  signOut?: () => void
  /** A page tab's remote address, shown by the host (Hanzo Desktop: a native webview). Absent, a browser frames what it may. */
  browse?: Browse
  /** What the host's browser does to a page, row by row in the tab's menu. */
  browser?: Browser
  /** The host's sidebar lists Settings' sections and Customize's tabs, so the pages draw neither. */
  sections?: boolean
  /** The default agents Customize › Agents offers to start from. Absent, none. */
  cast?: readonly Cast[]
  /** Every persona Customize › Agents offers to start from, read when Browse opens. Absent, none. */
  personas?: () => Promise<readonly Cast[]>
}

const Context = createContext<Host | null>(null)

export function HostProvider({ host, children }: { host: Host; children: ReactNode }) {
  return <Context.Provider value={host}>{children}</Context.Provider>
}

export function useHost(): Host {
  const h = useContext(Context)
  if (!h) throw new Error('The builder was rendered without a host')
  return h
}

/** The host's way of showing a page, where one is mounted and has one. The side panel is drawn without a host too (hanzo.team's rooms). */
export function useBrowse(): Browse | null {
  return useContext(Context)?.browse ?? null
}

/** The host's browser, where one is mounted and has one. */
export function useBrowser(): Browser | null {
  return useContext(Context)?.browser ?? null
}

/** The call target for this host — stable while the host's api, token reader and org are. */
export function useTarget(): Target {
  const { api, token, org } = useHost()
  return useMemo(() => ({ api, token, org }), [api, token, org])
}
