/**
 * The suggestions under the composer (suggestions.tsx), against a platform this
 * spec answers: made once from the person's activity and kept in the account,
 * read back without asking again, each row ONE button that does its act at once
 * (open, send, task, schedule; the harness records which), its summary on
 * hover, its × a dismissal the account remembers; a row that binds to nothing
 * never drawn; the starters when the model has nothing to say; a finger's pitch
 * on a phone, above the composer; both themes.
 */
import type { Page, Request } from '@playwright/test'

import { expect, test } from './fixture.ts'
import type { Rig } from './suggest.tsx'

const PR = 'https://github.com/hanzo-inc/app/pull/29'
const BUG = 'https://github.com/hanzo-inc/kai/issues/12'

const ROWS = [
  {
    icon: 'github',
    title: 'Check the login fixes on #29',
    summary: 'Three pull requests changed account discovery and signup: new emails on /login now go to /signup without a code first.',
    action: 'open',
    source: PR,
    prompt: '',
    every: '',
  },
  { icon: 'agent', title: 'Fix the Kai mapping bug', summary: 'The mapping drops rows.', action: 'task', source: '', prompt: `Fix ${BUG}: the mapping drops rows.`, every: '' },
  { icon: 'agent', title: 'Run the brief every Monday', summary: '', action: 'schedule', source: '', prompt: 'Brief me on adoption signals.', every: 'weekly mon 09:00' },
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
const row = (p: Page, title: string) => p.getByRole('button', { name: title, exact: true })
const went = (p: Page) => p.evaluate(() => window.went.map((w) => JSON.parse(w) as Record<string, unknown>))
const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

test('made once from the person’s activity, kept, and each row does its act at once', async ({ page }) => {
  const seen = await platform(page, null)
  await open(page, { theme: 'dark' })

  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  expect(seen.model).toHaveLength(1)
  const asked = seen.model[0]!
  expect(asked.model).toBe('zen5-flash')
  expect((asked.response_format as { json_schema: { strict: boolean } }).json_schema.strict).toBe(true)
  const user = JSON.parse((asked.messages as { content: string }[])[1]!.content) as { activity: { kind: string; key: string }[]; person: Record<string, string> }
  expect(user.activity.map((a) => a.kind).sort()).toEqual(['automation', 'conversation', 'issue', 'pull', 'run'])
  expect(user.activity.find((a) => a.kind === 'pull')!.key).toBe(PR)
  expect(user.person).toEqual({ name: 'Z', role: 'Software engineer', use: 'team' })
  await expect.poll(() => seen.patches.length).toBe(1)
  const kept = seen.patches[0]!.suggest as { at: string; sig: string; rows: { act: { kind: string } }[]; dismissed: string[] }
  expect(kept.rows.map((r) => r.act.kind)).toEqual(['open', 'task', 'schedule'])
  expect(kept.sig).toMatch(/^[0-9a-f]{14}$/)
  expect(kept.dismissed).toEqual([])

  // One short action a row, and no link inside it: the row is the one target.
  await expect(list(page).getByRole('link')).toHaveCount(0)
  await expect(list(page).getByRole('listitem').first()).toHaveText(ROWS[0]!.title)

  // Its summary on hover, in a card over the row.
  await row(page, ROWS[0]!.title).hover()
  await expect(page.getByText(/Three pull requests changed account discovery/)).toBeVisible()
  await shot(page, 'suggest-dark-hover.png')
  await page.mouse.move(5, 5)

  // A press anywhere on the row does its act: this one opens the pull request it names.
  await row(page, ROWS[0]!.title).click({ position: { x: 300, y: 10 } })
  expect(await went(page)).toEqual([{ kind: 'open', to: PR }])

  // The keyboard reaches each row and its × in turn; Enter does the act.
  await row(page, 'Fix the Kai mapping bug').focus()
  await page.keyboard.press('Enter')
  expect((await went(page))[1]).toEqual({ kind: 'task', prompt: ROWS[1]!.prompt })
  await row(page, 'Run the brief every Monday').focus()
  await page.keyboard.press('Enter')
  expect((await went(page))[2]).toEqual({ kind: 'schedule', name: 'Run the brief every Monday', prompt: ROWS[2]!.prompt, schedule: { kind: 'weekly', day: 'mon', at: '09:00' } })
  // Nothing was only typed into the composer.
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Dismiss Run the brief every Monday' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Dismiss Run the brief every Monday' })).toHaveCSS('opacity', '1')

  // The × dismisses it, and the account remembers which; its act is not done.
  await page.keyboard.press('Enter')
  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  await expect(row(page, 'Run the brief every Monday')).toHaveCount(0)
  expect(await went(page)).toHaveLength(3)
  await expect.poll(() => seen.patches.length).toBe(2)
  expect((seen.patches[1]!.suggest as { dismissed: string[]; rows: unknown[] }).dismissed).toHaveLength(1)
  expect((seen.patches[1]!.suggest as { rows: unknown[] }).rows).toHaveLength(3)

  // Read again: the kept rows, without reading a source or asking the model.
  const before = seen.reads.length
  await page.reload()
  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  await expect(row(page, 'Run the brief every Monday')).toHaveCount(0)
  expect(seen.model).toHaveLength(1)
  expect(seen.reads.length).toBe(before)
})

test('with nothing from the activity, the three starters, each an act', async ({ page }) => {
  const seen = await platform(page, null, [])
  await open(page, { theme: 'dark' })
  await expect.poll(() => seen.patches.length).toBe(1)
  expect((seen.patches[0]!.suggest as { rows: unknown[] }).rows).toEqual([])
  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  await row(page, 'Build a landing page with Dev').click()
  expect((await went(page))[0]).toMatchObject({ kind: 'task' })
})

test('a row that binds to nothing is never drawn: an open of what the activity does not hold, an act without its words or time', async ({ page }) => {
  await platform(page, null, [
    { ...ROWS[0]!, source: 'https://evil.example/phish' },
    { ...ROWS[1]!, prompt: '' },
    { ...ROWS[2]!, every: 'whenever' },
    { ...ROWS[1]!, action: 'fill', title: 'Only typed' },
    ROWS[1]!,
  ])
  await open(page, { theme: 'dark' })
  // The one that binds, and the starters fill to three.
  await expect(list(page).getByRole('listitem')).toHaveCount(3)
  await expect(row(page, 'Fix the Kai mapping bug')).toHaveCount(1)
  for (const gone of ['Check the login fixes on #29', 'Run the brief every Monday', 'Only typed']) await expect(row(page, gone)).toHaveCount(0)
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
  await platform(page, {
    at: new Date().toISOString(),
    sig: 'x',
    rows: [
      { id: 'r0', icon: 'github', title: ROWS[0]!.title, summary: '', act: { kind: 'open', to: PR } },
      { id: 'r1', icon: 'agent', title: ROWS[1]!.title, summary: '', act: { kind: 'task', prompt: ROWS[1]!.prompt } },
      { id: 'r2', icon: 'agent', title: ROWS[2]!.title, summary: '', act: { kind: 'schedule', name: ROWS[2]!.title, prompt: ROWS[2]!.prompt, schedule: { kind: 'weekly', day: 'mon', at: '09:00' } } },
    ],
    dismissed: [],
  })
  await open(page, { theme: 'light' })
  const items = list(page).getByRole('listitem')
  await expect(items).toHaveCount(3)
  for (let n = 0; n < 3; n++) expect((await items.nth(n).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const field = (await page.getByRole('textbox', { name: 'Message' }).boundingBox())!
  expect((await items.nth(2).boundingBox())!.y).toBeLessThan(field.y)
  await expect(page.getByRole('button', { name: 'Dismiss Run the brief every Monday' })).toHaveCSS('opacity', '1')
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(390)
  await shot(page, 'suggest-phone-light.png')
})
