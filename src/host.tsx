/**
 * What the builder needs from the page that mounts it.
 *
 * The builder is ONE component with several hosts: its own page (hanzo.build,
 * which signs in through Hanzo IAM and routes with react-router) and the Hanzo
 * app's Dev section (hanzo.ai/dev and hanzo.app/dev, which already have a
 * session, a router and a rail). Everything that differs between them is here,
 * as values, so no host forks the builder and the builder imports no host.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'

import type { Target } from './api/call.ts'

export interface Person {
  name: string
  email: string
  /** An https image, or '' for the initial. */
  avatar: string
}

export interface Host {
  /** The platform origin, no trailing slash. */
  api: string
  /** The signed-in person's bearer, or null. Read at call time, so a refresh is picked up. */
  token: () => string | null
  /** The org every call is scoped to. */
  org: string | null
  /** The organizations this person belongs to. The switcher lists these and no others. */
  memberships?: readonly string[]
  /** Stay on this page and scope every read to `org`. */
  chooseOrg?: (org: string) => void
  /** Who is signed in, or null. */
  person: Person | null
  /** Whether the person administers `org`: an admin publishes to main, anyone else opens a review. */
  admin: boolean
  /** The address under the mount: '' | a session id | a slug | '-/codebases' | '-/projects' | '-/issues' | '-/artifacts' | '-/templates'. */
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

/** The call target for this host — stable while the host's api, token reader and org are. */
export function useTarget(): Target {
  const { api, token, org } = useHost()
  return useMemo(() => ({ api, token, org }), [api, token, org])
}
