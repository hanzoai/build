// The builder's own page: Hanzo IAM for who is here, react-router for where.
//
// The package's development host. The product is the Hanzo app at hanzo.ai,
// whose Dev mode mounts the same `<Builder>` and draws its runs in its own
// rail. Everything the builder needs from a host is handed over as `Host`
// values here, so the builder imports neither IAM nor a router.
//
// SIGNED IN ONLY. A visitor is drawn nothing: this tab goes to hanzo.id and
// comes back to the address it asked for (enter.ts). A person hanzo.id already
// knows is answered at once, with no screen and nothing to press. Words carried
// on arrival as `?q=` wait in New's composer (landing.tsx `hold`).

import { IamProvider, useIam } from '@hanzo/iam/react'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { Builder, type Host, type Person } from '@hanzo/dev/builder'
import { enter, form } from './enter.ts'
import { follow } from './stay.ts'
import { administers, bearer, org, orgs, own, selectOrg, subject, watch } from './token.ts'
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

  useEffect(
    () =>
      watch(subject(), (now) => {
        if (!now) form()
        window.location.reload()
      }),
    [isAuthenticated],
  )

  const out = !isLoading && !isAuthenticated
  useEffect(() => {
    if (out) enter(door)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out])

  const scoped = org()
  const logo = ''
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
    name: 'Hanzo Build',
    api: api(import.meta.env),
    token: bearer,
    org: scoped,
    logo,
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
    signIn: () => enter(door),
    signOut: () => void logout(),
  }

  // A token still resolving is a person; with none, nothing is drawn while the tab leaves.
  if (isAuthenticated || (isLoading && bearer())) return <Builder host={host} />
  return null
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
