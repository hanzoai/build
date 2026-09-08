// The platform client, and on whose account it speaks.
//
// ONE CLIENT, mounted once. `@hanzo/ai/react` publishes `useAi()`, which reads
// the client out of context — so this builds it and provides it, and no surface
// carries a second hook of its own. A second client is a second credential and
// a second organization, and the two disagree the moment either changes.
//
// Signed in — the visitor's own IAM token, scoped to the organization they work
// in. Signed out — anonymous, which reads the public catalog and nothing more.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useIam } from '@hanzo/iam/react'
import { AiProvider } from '@hanzo/ai/react'
import { createAiClient } from '@hanzo/ai'
import { api } from '~/api'
import { bearer, hasSession, org } from '~/token'

/**
 * The tenant an anonymous read is recorded against, where a deployment sets
 * one. It names an org and no person, so it is publishable by construction.
 *
 * It is a KEY, not a token, and the distinction decides which route the SDK
 * takes: with a bearer it sends the metered one, without one the
 * credential-less one, which reads neither the model nor the org off the
 * request. Passed as `token` it would select the metered route and be refused.
 */
const PUBLISHABLE = import.meta.env.VITE_PUBLISHABLE_KEY || ''

export function Ai({ children }: { children: ReactNode }) {
  const { sdk, isAuthenticated } = useIam()
  // The organization every call is scoped to: the SDK's selection, sent only
  // when the token says the reader belongs to it. Another tab changing it moves
  // this one too, so the client is rebuilt and every read comes back for the
  // new organization.
  const [scoped, setScoped] = useState<string | null>(() => org())
  useEffect(() => {
    const on = () => setScoped(org())
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])

  const account = Boolean((isAuthenticated || hasSession()) && sdk)

  const client = useMemo(
    () =>
      account && sdk
        ? createAiClient({
            baseUrl: api(),
            headers: scoped ? { 'X-Org-Id': scoped } : {},
            auth: {
              ...sdk,
              getValidAccessToken: async () => (await sdk.getValidAccessToken?.()) || bearer(),
            },
          })
        : createAiClient({ baseUrl: api(), publishableKey: PUBLISHABLE }),
    [account, sdk, scoped],
  )

  return <AiProvider client={client}>{children}</AiProvider>
}
