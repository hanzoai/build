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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { logo as mark } from '../api/members.ts'
import { Builder } from '../builder.tsx'
import type { Host, Person } from '../host.tsx'
import { hold } from '../landing.tsx'
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

  // Words carried on arrival are New's draft, and leave the address: a reload
  // or a shared link must not carry them again.
  useEffect(() => {
    const q = new URLSearchParams(where.search)
    const asked = q.get('q')?.trim()
    if (!asked) return
    hold({ draft: asked, files: [] })
    q.delete('q')
    const rest = q.toString()
    navigate(`${where.pathname}${rest ? `?${rest}` : ''}${where.hash}`, { replace: true })
  }, [where, navigate])

  // Nobody is signed in: leave for hanzo.id, once IAM has said so.
  const out = !isLoading && !isAuthenticated
  useEffect(() => {
    if (out) enter(door)
    // `door` is a new object each render; the answer is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out])

  const scoped = org()
  // The scoped org's own logo, read from IAM's record of it; none until it answers.
  const [logo, setLogo] = useState('')
  useEffect(() => {
    setLogo('')
    if (!scoped || !isAuthenticated) return
    let live = true
    mark({ api: api(import.meta.env), token: bearer, org: scoped }, scoped).then(
      (l) => live && setLogo(l),
      () => {},
    )
    return () => {
      live = false
    }
  }, [scoped, isAuthenticated])
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
