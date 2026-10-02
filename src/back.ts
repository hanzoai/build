/**
 * Coming back from a provider's consent page.
 *
 * A connect names the page it starts on as its return (`here`). The platform
 * keeps that address when it is a Hanzo app page, and its callback lands the
 * person back on it with the answer in the query:
 *
 *   ?complete=github&grant=<id>         a GitHub connect to finish (POST /v1/provider/github/user/complete)
 *   ?connected=<provider>&account=<n>   an organization's connector, connected
 *   ?error=<provider>&reason=<why>      either, refused
 *
 * `useBack` reads that answer once, takes it off the address so a reload does
 * not replay it, finishes a GitHub grant, and says what happened.
 */
import { useEffect } from 'react'

import type { Target } from './api/call.ts'
import { complete } from './api/github.ts'

/** The query keys a return carries its answer in. */
export const ANSWER = ['complete', 'grant', 'connected', 'account', 'error', 'reason'] as const

export type Landing =
  | { kind: 'grant'; provider: string; grant: string }
  | { kind: 'connected'; provider: string; account: string }
  | { kind: 'error'; provider: string; reason: string }

/** The answer a return carried in `search`, or null when it carried none. */
export function landed(search: string): Landing | null {
  const q = new URLSearchParams(search)
  const error = q.get('error')
  if (error) return { kind: 'error', provider: error, reason: q.get('reason') ?? '' }
  const grant = q.get('grant')
  const done = q.get('complete')
  if (done && grant) return { kind: 'grant', provider: done, grant }
  const connected = q.get('connected')
  if (connected) return { kind: 'connected', provider: connected, account: q.get('account') ?? '' }
  return null
}

/** `href` without the answer keys; `href` itself when it carries none. */
export function clean(href: string): string {
  const url = new URL(href)
  if (!ANSWER.some((k) => url.searchParams.has(k))) return href
  for (const k of ANSWER) url.searchParams.delete(k)
  return url.href
}

/** This page's address, as a connect's return. */
export function here(): string {
  return clean(window.location.href)
}

const NAMES: Record<string, string> = { github: 'GitHub', slack: 'Slack' }

/** A provider id as people write it. */
export const named = (id: string): string => NAMES[id] ?? (id ? id[0].toUpperCase() + id.slice(1) : 'The connection')

/**
 * Finish what a return carried, once a person is signed in: `say` gets the
 * sentence, and `after` runs once something was connected.
 */
export function useBack(t: Target, signed: boolean, say: (note: string) => void, after: () => void): void {
  useEffect(() => {
    if (!signed) return
    const l = landed(window.location.search)
    if (!l) return
    // Off the address first: a grant completes once, and a reload must not try again.
    const next = clean(window.location.href)
    window.history.replaceState(window.history.state, '', next)
    if (l.kind === 'error') {
      say(`${named(l.provider)}: ${l.reason || 'not connected'}`)
      return
    }
    if (l.kind === 'connected') {
      say(`${named(l.provider)} is connected${l.account ? ` as ${l.account}` : ''}`)
      after()
      return
    }
    if (l.provider !== 'github') return
    complete(t, l.grant).then(
      (c) => {
        say(c.connected ? `Connected as @${c.login}` : 'GitHub did not connect; connect again')
        after()
      },
      (e: unknown) => say((e as Error).message),
    )
    // Once per landing: the address is clean after the first run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signed])
}
