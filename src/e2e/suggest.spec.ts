/**
 * The suggestions under the composer (suggestions.tsx), against a platform this
 * spec answers: made once from the person's activity and kept in the account,
 * read back without asking again, each row a button that fills the composer,
 * its title a link out with its summary on hover, its × a dismissal the
 * account remembers; nothing drawn when the model has nothing to say; a
 * finger's pitch on a phone, above the composer; both themes.
 */
import type { Page, Request } from '@playwright/test'

import { expect, test } from './fixture.ts'
import type { Rig } from './suggest.tsx'

const PR = 'https://github.com/hanzo-inc/app/pull/29'
const BUG = 'https://github.com/hanzo-inc/kai/issues/12'

const ROWS = [
  {
    icon: 'github',
    title: 'Hanzo app login fixes landed',
    href: PR,
    summary: 'Three pull requests changed account discovery and signup: new emails on /login now go to /signup without a code first.',
    action: 'Verify the user flow',
    prompt: `Walk me through verifying the login and signup flow that ${PR} changed.`,
  },
  { icon: 'github', title: 'Kai P0 mapping bug is open', href: BUG, summary: 'The mapping drops rows.', action: 'Audit the fix path', prompt: `Audit the fix path for ${BUG}.` },
  { icon: 'agent', title: 'Monday brief', href: '', summary: '', action: 'Sharpen its sources', prompt: 'Help me sharpen the sources my Monday brief reads.' },
]

const BOARD = [
  { id: '1', title: 'Login redirects new emails to /signup', kind: 'pr', status: 'done', url: PR, updatedAt: 1792400000, createdAt: 1792300000 },
  { id: '2', title: 'Kai P0 mapping bug', kind: 'issue', status: 'todo', url: BUG, updatedAt: 1792390000, createdAt: 1792300000 },
]

interface Seen {
  model: Record<string, unknown>[]
  patches: Record<string, unknown>[]
  reads: string[]
}

/** The platform: the person's activity, `kept` as the account's suggest key, and `answer` as the model's rows. */
async function platform(p: Page, kept: unknown, answer: object[] = ROWS): Promise<Seen> {
  const seen: Seen = { model: [], patches: [], reads: [] }
  let doc: Record<string, unknown> = kept ? { suggest: kept } : {}
  await p.route('**/v1/**', async (r) => {
    const req: Request = r.request()
    const path = new URL(req.url()).pathname
    const json = (body: unknown) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/v1/pref' && req.method() === 'PATCH') {
      const patch = req.postDataJSON() as Record<string, unknown>
      seen.patches.push(patch)
      doc = { ...doc, ...patch }
      return json({ prefs: doc })
    }
    if (path === '/v1/pref') return json({ prefs: { ...doc, callName: 'Z' } })
    if (path === '/v1/chat/completions') {
      seen.model.push(req.postDataJSON() as Record<string, unknown>)
      return json({ model: 'zen5-flash', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ rows: answer }) } }] })
    }
    // Only the sources: the kit's own events (/v1/send) are not a read of the person's activity.
    if (path !== '/v1/send') seen.reads.push(path)
    if (path === '/v1/agents/chat/conversations') return json({ conversations: [{ id: 'c1', title: 'Enso sales targets', updatedAt: '2026-10-19T08:00:00Z' }] })
    if (path === '/v1/task/board') return json(BOARD)
    if (path === '/v1/agent/sessions') return json({ sessions: [{ id: 'sess_a', actor: 'acme/u1', title: 'Fix login', status: 'done', pr: PR, updatedAt: '2026-10-20T07:00:00Z' }] })
    if (path === '/v1/auto/automations') return json({ data: [{ id: 'auto_1', name: 'Monday brief', instructions: 'Brief me every Monday.', enabled: true }] })
    if (path === '/v1/library') return json({ data: [] })
    if (path === '/v1/iam/preferences') return json({ status: 'ok', data: { onboarding: { role: 'Software engineer', use: 'team' } } })
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not here"}' })
  })
  return seen
}

async function open(p: Page, rig: Rig): Promise<void> {
  await p.addInitScript((r) => {
    ;(window as unknown as { suggest: Rig }).suggest = r
  }, rig)
  await p.route('**/-/suggest', async (r) => {
    const res = await r.fetch({ url: new URL('/', r.request().url()).href })
    const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/suggest.tsx')
    await r.fulfill({ response: res, body: html })
  })
  await p.goto('/-/suggest')
  await expect(p.getByRole('textbox', { name: 'Message' })).toBeVisible({ timeout: 45_000 })
}

const list = (p: Page) => p.getByRole('list', { name: 'Suggestions' })
const row = (p: Page, title: string) => p.getByRole('button', { name: new RegExp(`^${title}\\.`) })
const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

test('made once from the person’s activity, kept, and each row does its three things', async ({ page }) => {
  const seen = await platform(page, null)
  await open(page, { theme: 'dark' })

  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  expect(seen.model).toHaveLength(1)
  const asked = seen.model[0]!
  expect(asked.model).toBe('zen5-flash')
  expect((asked.response_format as { json_schema: { strict: boolean } }).json_schema.strict).toBe(true)
  const user = JSON.parse((asked.messages as { content: string }[])[1]!.content) as { activity: { kind: string; href: string }[]; person: Record<string, string> }
  expect(user.activity.map((a) => a.kind).sort()).toEqual(['automation', 'conversation', 'issue', 'pull', 'run'])
  expect(user.person).toEqual({ name: 'Z', role: 'Software engineer', use: 'team' })
  await expect.poll(() => seen.patches.length).toBe(1)
  const kept = seen.patches[0]!.suggest as { at: string; sig: string; rows: { href: string }[]; dismissed: string[] }
  expect(kept.rows.map((r) => r.href)).toEqual([PR, BUG, ''])
  expect(kept.sig).toMatch(/^[0-9a-f]{14}$/)
  expect(kept.dismissed).toEqual([])

  // The title opens its source in a new tab; the row without one has no link.
  const link = page.getByRole('link', { name: 'Hanzo app login fixes landed, opens the source' })
  await expect(link).toHaveAttribute('href', PR)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(page.getByRole('link', { name: /Monday brief/ })).toHaveCount(0)

  // Its summary on hover, in a card over the row.
  await link.hover()
  await expect(page.getByText(/Three pull requests changed account discovery/)).toBeVisible()
  await shot(page, 'suggest-dark-hover.png')
  await page.mouse.move(5, 5)

  // A press anywhere else on the row fills the composer.
  await row(page, 'Kai P0 mapping bug is open').click()
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(`Audit the fix path for ${BUG}.`)

  // The keyboard reaches each row, its link and its × in turn; Enter picks.
  await row(page, 'Monday brief').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Help me sharpen the sources my Monday brief reads.')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Dismiss Monday brief' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Dismiss Monday brief' })).toHaveCSS('opacity', '1')

  // The × dismisses it, and the account remembers which.
  await page.keyboard.press('Enter')
  await expect(list(page).getByRole('listitem')).toHaveCount(2)
  await expect.poll(() => seen.patches.length).toBe(2)
  expect((seen.patches[1]!.suggest as { dismissed: string[]; rows: unknown[] }).dismissed).toHaveLength(1)
  expect((seen.patches[1]!.suggest as { rows: unknown[] }).rows).toHaveLength(3)

  // Read again: the kept rows, without reading a source or asking the model.
  const before = seen.reads.length
  await page.reload()
  await expect(list(page).getByRole('listitem')).toHaveCount(2)
  expect(seen.model).toHaveLength(1)
  expect(seen.reads.length).toBe(before)
})

test('nothing worth saying draws nothing', async ({ page }) => {
  const seen = await platform(page, null, [])
  await open(page, { theme: 'dark' })
  await expect.poll(() => seen.patches.length).toBe(1)
  expect((seen.patches[0]!.suggest as { rows: unknown[] }).rows).toEqual([])
  await expect(list(page)).toHaveCount(0)
})

test('an address the activity does not hold is never drawn', async ({ page }) => {
  await platform(page, null, [{ ...ROWS[0]!, href: 'https://evil.example/phish' }, ROWS[1]!])
  await open(page, { theme: 'dark' })
  await expect(list(page).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('link', { name: /opens the source/ })).toHaveAttribute('href', BUG)
})

test('signed out reads nothing and draws nothing', async ({ page }) => {
  const seen = await platform(page, null)
  await open(page, { signed: false })
  await page.waitForTimeout(500)
  expect(seen.model).toHaveLength(0)
  expect(seen.reads).toEqual([])
  await expect(list(page)).toHaveCount(0)
})

test('on a phone, above the composer, a finger’s pitch, the × in sight; and in light', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await platform(page, { at: new Date().toISOString(), sig: 'x', rows: ROWS.map((r, n) => ({ ...r, id: `r${n}` })), dismissed: [] })
  await open(page, { theme: 'light' })
  const items = list(page).getByRole('listitem')
  await expect(items).toHaveCount(3)
  for (let n = 0; n < 3; n++) expect((await items.nth(n).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const field = (await page.getByRole('textbox', { name: 'Message' }).boundingBox())!
  expect((await items.nth(2).boundingBox())!.y).toBeLessThan(field.y)
  await expect(page.getByRole('button', { name: 'Dismiss Monday brief' })).toHaveCSS('opacity', '1')
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(390)
  await shot(page, 'suggest-phone-light.png')
})
