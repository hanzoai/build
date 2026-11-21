/**
 * What the cov-forge specs share beyond signed.ts: signing in as any person a
 * token can name — acme's admin, a member, someone in no organization — and a
 * platform whose answer may take its time (a spec holds one back to see what
 * the page says while it waits, or after it was left); and the builder mounted
 * by another host (cov-forge-host.tsx).
 */
import type { Page } from '@playwright/test'

import type { Given } from './cov-forge-host.tsx'
import { expect } from './fixture.ts'
import type { Reply, Sent } from './signed.ts'

export type { Reply, Sent }

/** What the platform answers to one call, now or later; undefined is the empty default. */
export type Answer = (sent: Sent) => Reply | undefined | Promise<Reply | undefined>

export interface Who {
  sub: string
  /** What IAM's userinfo says; left out, the person has no name or no email. */
  name?: string
  email?: string
  orgs: { org: string; role: string }[]
}

export const DAVE: Who = { sub: 'acme/dave', name: 'Dave', email: 'dave@acme.test', orgs: [{ org: 'acme', role: 'admin' }] }
export const MEMBER: Who = { sub: 'acme/erin', name: 'Erin', email: 'erin@acme.test', orgs: [{ org: 'acme', role: 'member' }] }

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** An unsigned stand-in for the token IAM would issue `who`. */
export const token = (who: Who) => [b64({ alg: 'none', typ: 'JWT' }), b64({ sub: who.sub, email: who.email, orgs: who.orgs }), 'x'].join('.')

/** Held for `ms`, then answered. */
export const later = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A refusal in the platform's own words. */
export const refused = (status: number, detail: string): Reply => ({ status, json: { status, title: 'Refused', detail } })

/** What one answer holds back: a refusal, or a wait before answering. */
export interface Hold {
  status?: number
  detail?: string
  wait?: number
}

/** What a platform holds back, per `METHOD path`. A test changes these as it goes. */
export interface Holds {
  /** What the next calls get instead of the answer, one each, in order. */
  holds: Record<string, Hold[]>
  /**
   * A refusal every such call gets while it is set. A read is refused this way
   * rather than once: in development React mounts a screen twice, and the first
   * mount's read is let go unanswered.
   */
  down: Record<string, string>
  /** How long every such call waits while it is set. */
  slow: Record<string, number>
}

/** `answer`, after what `h` holds back for the call. */
export function held(h: Holds, answer: Answer): Answer {
  return async (sent) => {
    const key = `${sent.method} ${sent.path}`
    const hold = h.holds[key]?.shift()
    if (hold?.wait) await later(hold.wait)
    if (h.slow[key]) await later(h.slow[key])
    if (hold?.status) return refused(hold.status, hold.detail ?? 'The platform refused this')
    if (h.down[key]) return refused(502, h.down[key])
    return answer(sent)
  }
}

/** Answers every /v1 call but IAM's with `answer`, in its own time; returns what the page sent. */
export async function serve(page: Page, answer: Answer): Promise<Sent[]> {
  const sent: Sent[] = []
  await page.route(
    (u) => u.pathname.startsWith('/v1/') && !u.pathname.startsWith('/v1/iam/'),
    async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      const raw = req.postData()
      let body: unknown = null
      try {
        body = raw ? JSON.parse(raw) : null
      } catch {
        body = raw
      }
      const one: Sent = { method: req.method(), path: url.pathname, query: url.search, body }
      sent.push(one)
      const reply = await answer(one)
      if (!reply) return r.fulfill({ json: { data: [] } })
      if (reply.text !== undefined) return r.fulfill({ status: reply.status ?? 200, body: reply.text, contentType: reply.type ?? 'text/plain' })
      return r.fulfill({ status: reply.status ?? 200, json: reply.json ?? {} })
    },
  )
  return sent
}

/**
 * Moves to one of the rail's places, every one of them in view: no reload, so
 * the page's coverage stays. It waits for the rail to mark the place, so two
 * moves in a row are two pages drawn, not one batched into the other.
 */
export async function via(page: Page, label: string) {
  const row = page.getByRole('navigation', { name: 'Runs' }).first().locator('[data-slot="rail-row"]').filter({ hasText: new RegExp(`^${label}$`) })
  await row.click()
  await expect(row).toHaveAttribute('aria-current', 'page')
}

/** Signs the page in as `who`, seeds `kept` into its storage, and answers for the platform; returns what the page sent. */
export async function enter(page: Page, answer: Answer, who: Who = DAVE, kept: Record<string, unknown> = {}): Promise<Sent[]> {
  await page.addInitScript(
    ([t, sub, seed]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('hanzo:who', sub)
      localStorage.setItem('hanzo_iam_access_token', t)
      localStorage.setItem('hanzo_iam_expires_at', String(Date.now() + 3_600_000))
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v))
    },
    [token(who), who.sub, kept] as const,
  )
  await page.route('**/.well-known/openid-configuration', (r) => r.fulfill({ status: 404 }))
  await page.route('**/v1/iam/oauth/userinfo', (r) => r.fulfill({ json: { sub: who.sub, name: who.name, email: who.email } }))
  return serve(page, answer)
}

/**
 * The builder under another host, at `/host/<path>`: the document the dev
 * server serves, running cov-forge-host.tsx in place of the app, with `given`
 * as its host. Answers the platform with `answer`; returns what the page sent.
 */
export async function mount(page: Page, given: Given, answer: Answer, path = ''): Promise<Sent[]> {
  await page.addInitScript((g) => {
    ;(window as { given?: unknown }).given = g
  }, given)
  await page.route(
    (u) => u.pathname === '/host' || u.pathname.startsWith('/host/'),
    async (r) => {
      if (r.request().resourceType() !== 'document') return r.fallback()
      const res = await r.fetch({ url: new URL('/', r.request().url()).href })
      const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/cov-forge-host.tsx')
      await r.fulfill({ body: html, contentType: 'text/html' })
    },
  )
  const sent = await serve(page, answer)
  await page.goto(`/host/${path}`)
  return sent
}
