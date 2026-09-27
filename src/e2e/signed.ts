/**
 * A page signed in as an org admin against a stubbed platform, for the specs
 * that need one. The token is an unsigned stand-in, and IAM's userinfo and every
 * /v1 answer are the spec's own, so a spec checks what the page draws and what
 * it sends — not what the platform does with it.
 */
import type { Page } from '@playwright/test'

export const ORG = 'acme'
export const REPO = 'universe'
export const SESSION = `sess_${'a'.repeat(32)}`

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const TOKEN = [b64({ alg: 'none', typ: 'JWT' }), b64({ sub: `${ORG}/dave`, email: 'dave@acme.test', orgs: [{ org: ORG, role: 'admin' }] }), 'x'].join('.')

export interface Sent {
  method: string
  path: string
  query: string
  body: unknown
}

export interface Reply {
  status?: number
  json?: unknown
  /** A raw body, sent with `type`. */
  text?: string
  type?: string
}

/** What the platform answers to one call, or undefined for the empty default. */
export type Answer = (sent: Sent) => Reply | undefined

/** Signs the page in, seeds `kept` into its storage, and answers for the platform; returns what the page sent. */
export async function signIn(page: Page, answer: Answer, kept: Record<string, unknown> = {}): Promise<Sent[]> {
  await page.addInitScript(
    ([token, org, seed]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('hanzo:who', `${org}/dave`)
      localStorage.setItem('hanzo_iam_access_token', token)
      localStorage.setItem('hanzo_iam_expires_at', String(Date.now() + 3_600_000))
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v))
    },
    [TOKEN, ORG, kept] as const,
  )
  await page.route('**/.well-known/openid-configuration', (r) => r.fulfill({ status: 404 }))
  await page.route('**/v1/iam/oauth/userinfo', (r) => r.fulfill({ json: { sub: `${ORG}/dave`, name: 'Dave', email: 'dave@acme.test' } }))
  return serve(page, answer)
}

/** Answers every /v1 call but IAM's for the platform, signed in or not; returns what the page sent. */
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
      const reply = answer(one)
      if (!reply) return r.fulfill({ json: { data: [] } })
      if (reply.text !== undefined) return r.fulfill({ status: reply.status ?? 200, body: reply.text, contentType: reply.type ?? 'text/plain' })
      return r.fulfill({ status: reply.status ?? 200, json: reply.json ?? {} })
    },
  )
  return sent
}
