/**
 * What the builder needs from the page that mounts it.
 *
 * The builder is ONE component with two hosts: its own page (hanzo.build, which
 * signs in through Hanzo IAM and routes with react-router) and the platform
 * console (platform.hanzo.ai/dev, which already has a session and a router).
 * Everything that differs between them is here, as values, so neither host
 * forks the builder and the builder imports neither host.
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
  /** Who is signed in, or null. */
  person: Person | null
  /** Whether the person administers `org`: an admin publishes to main, anyone else opens a review. */
  admin: boolean
  /** The address under the mount: '' | a session id | a project slug | '-/<screen>'. */
  path: string
  /** Move under the mount. */
  go: (path: string, how?: { replace?: boolean }) => void
  /** Where the builder links out to. Same-window addresses on the host, or https. */
  links: {
    /** Troubleshoot GitHub connection: the GitHub pane of the platform's plugins. */
    github: string
    /** Customize: the platform's plugins (skills, MCP, connectors). */
    customize: string
    /** Account settings. */
    settings: string
    /** The platform itself, where the mark leads. */
    home: string
  }
  /** Leave the builder for a host address, same window. */
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
