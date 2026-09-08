// Who this browser is, and the client that speaks for them — the layout route
// every screen sits under.
//
// A LAYOUT ROUTE rather than a wrapper around the router, because the callback
// screen reads the session and needs the router above it while the session
// needs to be above the screen. Mounting this as the route every screen sits
// under satisfies both with one tree instead of two.

import { IamProvider, useIam } from '@hanzo/iam/react'
import { useEffect } from 'react'
import { Outlet } from 'react-router'

import { Ai } from '~/ai'
import { own, subject } from '~/token'

/**
 * WHERE THIS BROWSER SIGNS IN, derived once and read by everyone who needs it.
 *
 * The client is `hanzo-build`, this application's name under the estate's
 * `<org>-<app>` scheme, so the org is the name's first word rather than a
 * second table to forget to update. A code is bound to the client that asked
 * for it, so two derivations would be two clients and the exchange would be
 * refused outright.
 */
export function origin(): {
  serverUrl: string
  clientId: string
  redirectUri: string
  organization: string
} {
  const clientId = import.meta.env.VITE_HANZO_CLIENT_ID || 'hanzo-build'
  return {
    serverUrl: (import.meta.env.VITE_HANZO_IAM || 'https://hanzo.id').replace(/\/+$/, ''),
    clientId,
    redirectUri: `${window.location.origin}/auth/callback`,
    organization: clientId.split('-')[0]!,
  }
}

/** Local state follows the session: once the SDK has settled, whoever the
 *  stored token names — or nobody — owns the `hanzo*` keys. */
function Identity() {
  const { isLoading, isAuthenticated } = useIam()
  useEffect(() => {
    if (!isLoading) own(subject())
  }, [isLoading, isAuthenticated])
  return null
}

export function Root() {
  // Before any surface reads storage: a browser another person left behind is
  // emptied of their selections.
  own(subject())
  return (
    <IamProvider config={{ ...origin(), postLogoutRedirectUri: `${window.location.origin}/` }}>
      <Identity />
      <Ai>
        <Outlet />
      </Ai>
    </IamProvider>
  )
}
