// The builder's own page: Hanzo IAM for who is here, react-router for where.
//
// One of the builder's hosts; the Hanzo app's Dev section (hanzo.ai/dev,
// hanzo.app/dev) is the other, and draws the builder's runs in its own rail.
// Everything the builder needs from a host is handed over as `Host` values here,
// so the builder imports neither IAM nor a router.

import { IamProvider, useIam } from '@hanzo/iam/react'
import { useCallback, useEffect, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { Builder } from '../builder.tsx'
import type { Host, Person } from '../host.tsx'
import { enter } from './enter.ts'
import { step } from './stay.ts'
import { administers, bearer, org, own, subject } from './token.ts'

/**
 * WHERE THIS BROWSER SIGNS IN. The client is `hanzo-build` under the estate's
 * `<org>-<app>` scheme, so the org is the name's first word.
 */
export function origin() {
  const clientId = import.meta.env.VITE_HANZO_CLIENT_ID || 'hanzo-build'
  return {
    serverUrl: (import.meta.env.VITE_HANZO_IAM || 'https://hanzo.id').replace(/\/+$/, ''),
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
function api(): string {
  const set = import.meta.env.VITE_HANZO_API
  if (set) return set.replace(/\/+$/, '')
  const host = window.location.hostname
  if (host === 'hanzo.ai' || host.endsWith('.hanzo.ai') || host === 'hanzo.build') return 'https://api.hanzo.ai'
  return window.location.origin
}

export function Mount() {
  const door = useIam()
  const { user, isLoading, isAuthenticated, logout } = door
  const where = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading) own(subject())
  }, [isLoading, isAuthenticated])

  const scoped = org()
  const person: Person | null = useMemo(() => {
    if (!isAuthenticated || !user) return null
    const u = user as { displayName?: string; name?: string; email?: string; avatar?: string }
    const avatar = typeof u.avatar === 'string' && u.avatar.startsWith('https://') ? u.avatar : ''
    return { name: u.displayName || u.name || '', email: u.email || '', avatar }
  }, [isAuthenticated, user])

  const go = useCallback(
    (path: string, how?: { replace?: boolean }) => navigate(`/${path}`, { replace: how?.replace }),
    [navigate],
  )

  const host: Host = {
    api: api(),
    token: bearer,
    org: scoped,
    person,
    admin: administers(scoped),
    path: where.pathname.replace(/^\/+/, ''),
    go,
    links: {
      github: `${window.location.origin}/-/sync`,
      customize: `${window.location.origin}/`,
      settings: window.location.origin,
      home: window.location.origin,
    },
    open: (href) => {
      const next = step(href, window.location.href)
      if (next.kind === 'here') navigate(next.path)
      else if (next.kind === 'away') window.location.assign(next.href)
    },
    signIn: () => void enter(door),
    signOut: () => void logout(),
  }

  return <Builder host={host} />
}

/** Identity above every screen, the callback included: it is the screen that completes it. */
export function Identity() {
  // Before any surface reads storage: a browser another person left behind is
  // emptied of their selections.
  own(subject())
  return (
    <IamProvider config={{ ...origin(), postLogoutRedirectUri: `${window.location.origin}/` }}>
      <Outlet />
    </IamProvider>
  )
}
