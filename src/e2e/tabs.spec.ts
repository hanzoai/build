/**
 * EVERY TAB FOLLOWS THE ONE SESSION.
 *
 * The session is one store every tab of this page shares, and the SDK in each
 * tab keeps its own copy of it, told nothing when another tab changes the store
 * (token.ts `watch`). A tab whose stored token stops naming the person it was
 * drawn for (signed out, or someone else signed in) reloads onto what the store
 * now holds, and a refresh for the same person moves nothing. A tab left with
 * nobody asks hanzo.id for the sign-in form, so the session being ended there
 * cannot sign it straight back in (enter.ts `form`).
 *
 * Two tabs of one browser, with hanzo.id and the platform stubbed: what must not
 * happen is a call that names an org and carries no bearer, which the platform
 * answers as nobody.
 */
import type { BrowserContext, Page } from '@playwright/test'

import { expect, test } from './fixture.ts'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
/** A token the SDK reads as live, for `sub` in `org`. Signed by nothing; no server sees it. */
const token = (sub: string, org: string, exp = Math.floor(Date.now() / 1000) + 3600) =>
  [b64({ alg: 'none', typ: 'JWT' }), b64({ sub, exp, orgs: [{ org, role: 'admin' }] }), 'x'].join('.')

const PEOPLE: Record<string, { name: string; email: string }> = {
  'acme/dave': { name: 'Dave', email: 'dave@acme.test' },
  'beta/erin': { name: 'Erin', email: 'erin@beta.test' },
}

/** The claims a bearer carries, or null. */
function claims(auth: string | undefined): Record<string, unknown> | null {
  const raw = auth?.replace(/^Bearer /, '').split('.')[1]
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString())
  } catch {
    return null
  }
}

/** What reached hanzo.id and the platform. */
interface Seen {
  /** Each platform call: its path, the org it named, and whether it carried a bearer. */
  calls: { path: string; org: string; bearer: boolean }[]
  authorize: URL[]
  ended: number
}

/**
 * One browser signed in as Dave, seeded ONCE for the whole context: a
 * per-document seed would put the tokens back into the page a sign-out
 * reloads, and the sign-out is the subject.
 */
async function browser(ctx: BrowserContext): Promise<Seen> {
  const seen: Seen = { calls: [], authorize: [], ended: 0 }
  await ctx.addInitScript((t) => {
    if (localStorage.getItem('tabs.seeded')) return
    localStorage.setItem('tabs.seeded', '1')
    localStorage.setItem('hanzo:who', 'acme/dave')
    localStorage.setItem('hanzo_iam_access_token', t)
    localStorage.setItem('hanzo_iam_refresh_token', 'r1')
    localStorage.setItem('hanzo_iam_expires_at', String(Date.now() + 3_600_000))
  }, token('acme/dave', 'acme'))
  await ctx.route('**/.well-known/openid-configuration', (r) => r.fulfill({ status: 404 }))
  await ctx.route('**/v1/iam/oauth/userinfo', (r) => {
    const sub = claims(r.request().headers().authorization)?.sub
    const who = typeof sub === 'string' ? PEOPLE[sub] : undefined
    return who ? r.fulfill({ json: { sub, ...who } }) : r.fulfill({ status: 401, json: { error: 'invalid_token' } })
  })
  await ctx.route('**/v1/iam/oauth/revoke', (r) => r.fulfill({ status: 200, body: '' }))
  // hanzo.id's logout and authorize, answered with nothing, so each tab stays to be read.
  await ctx.route('**/v1/iam/oauth/logout?**', (r) => {
    seen.ended += 1
    return r.fulfill({ status: 204 })
  })
  await ctx.route('**/v1/iam/oauth/authorize?**', (r) => {
    seen.authorize.push(new URL(r.request().url()))
    return r.fulfill({ status: 204 })
  })
  await ctx.route(
    (u) => u.pathname.startsWith('/v1/') && !u.pathname.startsWith('/v1/iam/'),
    (r) => {
      const req = r.request()
      const h = req.headers()
      if (req.method() !== 'OPTIONS') seen.calls.push({ path: new URL(req.url()).pathname, org: h['x-org-id'] ?? '', bearer: Boolean(h.authorization) })
      return r.fulfill({ json: { data: [] } })
    },
  )
  return seen
}

const account = (page: Page, who: string) => page.getByRole('button', { name: `Account: ${who}` })

/** Open the builder and wait for it to be drawn for `who`, marking this document. */
async function open(page: Page, who: string): Promise<void> {
  await page.goto('/-/codebases')
  await expect(account(page, who)).toBeVisible({ timeout: 20_000 })
  // A mark only this document carries: gone means the tab reloaded.
  await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true))
}

const kept = (page: Page) => page.evaluate(() => (window as unknown as { kept?: boolean }).kept === true)

test('a sign-out in another tab sends this one to hanzo.id for the sign-in form, and nothing goes out as nobody', async ({ context, baseURL }) => {
  const seen = await browser(context)
  const work = await context.newPage()
  await open(work, 'Dave · acme')
  await expect.poll(() => seen.calls.some((c) => c.org === 'acme' && c.bearer), { message: 'the builder reads the platform as Dave, in acme' }).toBe(true)

  // The other tab signs out through its own account menu.
  const other = await context.newPage()
  await open(other, 'Dave · acme')
  await account(other, 'Dave · acme').click()
  await other.getByRole('menuitem', { name: 'Log out' }).click()
  await expect.poll(() => seen.ended).toBe(1)

  // This tab leaves for hanzo.id, asking for the form, and comes back to where it was.
  await expect.poll(() => seen.authorize.length, { timeout: 20_000 }).toBe(1)
  const at = seen.authorize[0]!
  expect(at.searchParams.get('prompt')).toBe('login')
  expect(at.searchParams.get('redirect_uri')).toBe(new URL('/auth/callback', baseURL).href)
  expect(await work.evaluate(() => sessionStorage.getItem('signin.destination'))).toBe('/-/codebases')
  expect(await work.evaluate(() => localStorage.getItem('hanzo_iam_access_token'))).toBeNull()

  expect(seen.calls.filter((c) => c.org && !c.bearer), 'a call naming an org with nothing to vouch for it').toEqual([])
})

test('a refresh in another tab leaves this one where it is', async ({ context }) => {
  await browser(context)
  const work = await context.newPage()
  await open(work, 'Dave · acme')

  const other = await context.newPage()
  await open(other, 'Dave · acme')
  await other.evaluate((t) => localStorage.setItem('hanzo_iam_access_token', t), token('acme/dave', 'acme', Math.floor(Date.now() / 1000) + 7200))

  await work.waitForTimeout(1500)
  expect(await kept(work), 'the same person, so the same page').toBe(true)
  await expect(account(work, 'Dave · acme')).toBeVisible()
})

test('someone else signing in in another tab redraws this one as them', async ({ context }) => {
  await browser(context)
  const work = await context.newPage()
  await open(work, 'Dave · acme')

  const other = await context.newPage()
  await open(other, 'Dave · acme')
  await other.evaluate((t) => localStorage.setItem('hanzo_iam_access_token', t), token('beta/erin', 'beta'))

  await expect(account(work, 'Erin · beta')).toBeVisible({ timeout: 20_000 })
  expect(await kept(work), 'redrawn, not patched').toBe(false)
  expect(await work.evaluate(() => localStorage.getItem('hanzo:who'))).toBe('beta/erin')
})
