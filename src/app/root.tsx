// The builder's own page: Hanzo IAM for who is here, react-router for where.
//
// One of the builder's hosts; the Hanzo app's Dev section (hanzo.ai/dev,
// hanzo.app/dev) is the other, and draws the builder's runs in its own rail.
// Everything the builder needs from a host is handed over as `Host` values here,
// so the builder imports neither IAM nor a router.

import { IamProvider, useIam } from '@hanzo/iam/react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { Builder } from '../builder.tsx'
import type { Host, Person } from '../host.tsx'
import { enter } from './enter.ts'
import { follow } from './stay.ts'
import { administers, bearer, org, orgs, own, selectOrg, subject } from './token.ts'
import { api, origin } from './where.ts'

export function Mount() {
  const door = useIam()
  const { user, isLoading, isAuthenticated, logout } = door
  const where = useLocation()
  const navigate = useNavigate()
  const look = useTheme()

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
    api: api(import.meta.env),
    token: bearer,
    org: scoped,
    memberships: orgs(),
    chooseOrg: (next) => {
      if (!selectOrg(next)) return
      window.location.assign('/')
    },
    theme: look.theme === 'light' || look.theme === 'dark' || look.theme === 'system' ? look.theme : undefined,
    chooseTheme: look.setTheme,
    person,
    admin: administers(scoped),
    path: where.pathname.replace(/^\/+/, ''),
    go,
    links: {
      github: `${window.location.origin}/-/sync`,
      customize: `${window.location.origin}/-/mcp`,
      settings: window.location.origin,
      home: window.location.origin,
    },
    open: (href) => follow(href, window.location.href, { here: navigate, away: (to) => window.location.assign(to) }),
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
    <IamProvider config={{ ...origin(import.meta.env), postLogoutRedirectUri: `${window.location.origin}/` }}>
      <Outlet />
    </IamProvider>
  )
}
