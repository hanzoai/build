/**
 * The builder's frame: the rail and its runs, its top (the name and the search
 * that opens Find), its foot (the Slack card and the account menu with the
 * organizations), and the builder mounted by a host that brings less
 * (cov-forge-host.tsx) — against a platform that answers each call the way a
 * test says. One document per test (cov-forge.spec.ts says why); where the app
 * itself sends the window elsewhere, the next page answers with nothing to show,
 * so the browser stays.
 */
import type { Page } from '@playwright/test'

import type { Given } from './cov-forge-host.tsx'
import { DAVE, enter, held, later, mount, serve, token, type Holds, type Reply, type Sent, type Who } from './cov-forge.ts'
import { expect, test } from './fixture.ts'
import { ORG } from './signed.ts'

const id = (c: string) => `sess_${c.repeat(32)}`

interface World extends Holds {
  runs: Record<string, unknown>[]
  /** Per status Find filters on: how long its page waits, and the refusal it gets. */
  statuses: Record<string, { wait?: number; refuse?: string }>
}

const RUNS = () => [
  { id: id('1'), title: '', status: 'done', repo: `${ORG}/site` },
  { id: id('2'), title: 'Queued thing', status: 'queued', repo: `${ORG}/api` },
  { id: id('3'), title: 'Deploy the site', status: 'running', repo: `${ORG}/site` },
]

/** The platform the frame talks to, holding `world`. */
async function frame(page: Page, seed: Partial<World> = {}, who: Who = DAVE, kept: Record<string, unknown> = {}) {
  const world: World = { runs: RUNS(), statuses: {}, holds: {}, down: {}, slow: {}, ...seed }
  const answer = async ({ path, query }: Sent): Promise<Reply | undefined> => {
    const q = new URLSearchParams(query)
    if (path === '/v1/agent/sessions') {
      const status = q.get('status') ?? ''
      const how = world.statuses[status] ?? {}
      if (how.wait) await later(how.wait)
      if (how.refuse) return { status: 500, json: { status: 500, detail: how.refuse } }
      if (q.get('after')) return { json: { sessions: [{ id: id('9'), title: 'An older run', status: 'done', repo: `${ORG}/old` }], next: '' } }
      return { json: { sessions: world.runs.filter((r) => !status || r.status === status), next: status ? '' : 'c1' } }
    }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    const run = path.match(/^\/v1\/agent\/sessions\/(sess_[0-9a-f]{32})$/)?.[1]
    if (run) return { json: { ...world.runs.find((r) => r.id === run), kind: 'coding', recentEvents: [] } }
    return undefined
  }
  const sent = await enter(page, held(world, answer), who, kept)
  return { sent, world }
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Runs' }).first()
const rows = (page: Page) => rail(page).locator('[data-slot="rail-session"]')
const account = (page: Page) => page.getByRole('menu', { name: 'Account' })

/** Whatever the app sends the whole window to answers with nothing to show, so this document stays. */
const stay = (page: Page, match: (u: URL) => boolean) =>
  page.route(
    (u) => match(u),
    (r) => (r.request().isNavigationRequest() ? r.fulfill({ status: 204 }) : r.fulfill({ json: {} })),
  )

/** A token still in storage that IAM refuses: the rail, not the visitor's header, and no one signed in. */
async function lapsed(page: Page) {
  await page.addInitScript(() => localStorage.setItem('hanzo_iam_access_token', 'lapsed'))
  await page.route('**/v1/iam/oauth/userinfo', (r) => r.fulfill({ status: 401, json: { error: 'invalid_token' } }))
}

test.describe('the rail', () => {
  test('lists the org’s runs, running first on request, and opens one; the name, Docs and the Slack card are at hand', async ({ page, baseURL }, info) => {
    await frame(page)
    await page.goto('/-/templates')
    await expect(rows(page)).toHaveText(['Untitled run', 'Queued thing', 'Deploy the site'])
    await rail(page).getByRole('button', { name: 'Show running first' }).click()
    await expect(rows(page)).toHaveText(['Deploy the site', 'Untitled run', 'Queued thing'])
    await rail(page).getByRole('button', { name: 'Show newest first' }).click()
    await expect(rows(page).first()).toHaveText('Untitled run')
    await page.screenshot({ path: info.outputPath('rail.png') })

    await rows(page).filter({ hasText: 'Queued thing' }).click()
    await expect(page).toHaveURL(new URL(`/${id('2')}`, baseURL).href)
    await expect(rows(page).filter({ hasText: 'Queued thing' })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: 'Hanzo Build', exact: true }).first().click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)

    await page.getByRole('button', { name: 'Set up Hanzo in Slack' }).click()
    await expect(page).toHaveURL(new URL('/-/settings/integrations', baseURL).href)
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText('Try Hanzo in Slack')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('hanzo.build.slack'))).toBe('true')

    const [docs] = await Promise.all([page.waitForEvent('popup'), rail(page).getByText('Docs', { exact: true }).click()])
    expect(new URL(docs.url()).hostname).toBe('docs.hanzo.ai')
    await docs.close()
  })

  test('folds to marks and back, the organization’s initial standing for it', async ({ page }) => {
    await frame(page)
    await page.goto('/')
    await rail(page).getByRole('button', { name: 'Collapse sidebar' }).click()
    const expand = page.getByRole('button', { name: 'Expand sidebar' })
    await expect(expand).toHaveText('A')
    await expect(page.getByText('Try Hanzo in Slack')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Search runs' })).toHaveCount(0)
    await expand.click()
    await expect(rows(page)).toHaveCount(3)
    expect(await page.evaluate(() => localStorage.getItem('hanzo.build.rail'))).toBe('false')
  })

  test('Hanzo’s own organization wears the Hanzo mark', async ({ page }) => {
    await frame(page, {}, { sub: 'hanzo/zed', name: 'Zed', email: 'zed@hanzo.ai', orgs: [{ org: 'hanzo', role: 'member' }] }, { 'hanzo.build.rail': true })
    await page.goto('/')
    const expand = page.getByRole('button', { name: 'Expand sidebar' })
    await expect(expand.locator('svg')).toHaveCount(1)
    await expect(expand).toHaveText('')
  })

  test('says it is reading the runs, and why they could not be read', async ({ page }) => {
    await frame(page, { slow: { 'GET /v1/agent/sessions': 3000 }, down: { 'GET /v1/agent/sessions': 'Runs are resting' } })
    await page.goto('/')
    await expect(rail(page).getByText('Reading…')).toBeVisible()
    await expect(rail(page).getByText('Runs are resting')).toBeVisible()
  })

  test('with no runs it says so', async ({ page }) => {
    await frame(page, { runs: [] })
    await page.goto('/')
    await expect(rail(page).getByText('No runs yet.')).toBeVisible()
  })

  test('a person whose token IAM no longer honours signs in again from the rail, in this tab', async ({ page, baseURL }) => {
    const asked: URL[] = []
    await page.context().route('https://hanzo.id/**', (r) => {
      const url = new URL(r.request().url())
      if (url.pathname === '/v1/iam/oauth/authorize') asked.push(url)
      return r.fulfill({ contentType: 'text/html', body: '<title>Hanzo</title>Sign in' })
    })
    const popups: string[] = []
    page.on('popup', (p) => popups.push(p.url()))
    await lapsed(page)
    await serve(page, () => ({ status: 401, json: { status: 401, detail: 'Sign in to use this.' } }))
    await page.goto('/-/projects')
    await expect(rail(page).getByText('Sign in to see your runs.')).toBeVisible()
    await rail(page).getByRole('button', { name: 'Account: Sign in' }).click()
    await page.waitForURL((u) => u.hostname === 'hanzo.id')
    expect(asked[0]!.searchParams.get('redirect_uri')).toBe(new URL('/auth/callback', baseURL).href)
    expect(popups).toEqual([])
  })
})

test.describe('the account menu', () => {
  test('names the person by their email when IAM gives no name, and logs out through IAM', async ({ page }) => {
    await stay(page, (u) => u.hostname === 'hanzo.id')
    await frame(page, {}, { sub: 'acme/dave', email: 'dave@acme.test', orgs: [{ org: ORG, role: 'admin' }] })
    await page.goto('/')
    await page.getByRole('button', { name: `Account: dave@acme.test · ${ORG}` }).click()
    await expect(account(page).getByText('dave@acme.test', { exact: true })).toBeVisible()
    const [out] = await Promise.all([page.waitForRequest((r) => r.isNavigationRequest() && r.url().includes('/oauth/logout')), account(page).getByRole('menuitem', { name: 'Log out' }).click()])
    expect(new URL(out.url()).hostname).toBe('hanzo.id')
    await expect(account(page)).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('hanzo_iam_access_token'))).toBeNull()
  })

  test('names the person by their name when IAM gives no email', async ({ page }) => {
    await frame(page, {}, { sub: 'acme/dave', name: 'Dave', orgs: [{ org: ORG, role: 'admin' }] })
    await page.goto('/')
    await page.getByRole('button', { name: `Account: Dave · ${ORG}` }).click()
    await expect(account(page).getByText('Dave', { exact: true })).toBeVisible()
  })

  test('someone IAM names neither way is the organization alone', async ({ page }) => {
    await frame(page, {}, { sub: 'acme/anon', orgs: [{ org: ORG, role: 'member' }] })
    await page.goto('/')
    await page.getByRole('button', { name: `Account: ${ORG}`, exact: true }).click()
    // The plan leads (Free, with nothing else read), then the organizations: no name to say.
    await expect(account(page)).toHaveText(new RegExp(`^FreeUpgradeOrganization${ORG}Settings`))
  })

  test('someone in two organizations who has chosen neither picks one, and the page is scoped to it', async ({ page, baseURL }, info) => {
    await stay(page, (u) => u.origin === new URL(baseURL!).origin && u.pathname === '/')
    await frame(page, {}, { sub: 'acme/dave', name: 'Dave', email: 'dave@acme.test', orgs: [{ org: ORG, role: 'admin' }, { org: 'beta', role: 'member' }] })
    await page.goto('/-/templates')
    // No organization chosen yet: the row names the person alone.
    await page.getByRole('button', { name: 'Account: Dave', exact: true }).click()
    const orgs = account(page).getByRole('radiogroup', { name: 'Organizations' }).getByRole('radio')
    await expect(orgs).toHaveText([ORG, 'beta'])
    await expect(orgs.first()).toHaveAttribute('aria-checked', 'false')
    await page.screenshot({ path: info.outputPath('account-orgs.png') })
    const [home] = await Promise.all([page.waitForRequest((r) => r.isNavigationRequest()), orgs.filter({ hasText: 'beta' }).click()])
    expect(new URL(home.url()).pathname).toBe('/')
    expect(await page.evaluate(() => localStorage.getItem('hanzo_iam_current_org'))).toBe('beta')
  })

  test('the organization already chosen is chosen again without moving', async ({ page }) => {
    await frame(page)
    await page.goto('/')
    const moves: string[] = []
    page.on('request', (r) => {
      if (r.isNavigationRequest()) moves.push(r.url())
    })
    await page.getByRole('button', { name: `Account: Dave · ${ORG}` }).click()
    const current = account(page).getByRole('radiogroup', { name: 'Organizations' }).getByRole('radio', { name: ORG })
    await expect(current).toHaveAttribute('aria-checked', 'true')
    await current.click()
    await expect(account(page)).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(moves).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem('hanzo_iam_current_org'))).toBeNull()
  })

  test('someone in no organization has none to choose', async ({ page }) => {
    await frame(page, {}, { sub: 'solo/sam', name: 'Sam', email: 'sam@solo.test', orgs: [] })
    await page.goto('/')
    await page.getByRole('button', { name: 'Account: Sam', exact: true }).click()
    await expect(account(page).getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(account(page).getByRole('radiogroup', { name: 'Organizations' })).toHaveCount(0)
  })
})

test.describe('Find', () => {
  test('a page asked for under a status left since is let go, and a query that matches nothing read so far says so', async ({ page }, info) => {
    const { sent } = await frame(page, {
      // Running, then Error: each held, and each left for Done before it answers.
      statuses: { running: { wait: 3000 }, error: { wait: 3000, refuse: 'Runs are resting' } },
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Search runs' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Find a run' })
    await expect(dialog.getByRole('listitem', { name: 'Untitled run' })).toBeVisible()
    await expect(dialog.getByRole('listitem', { name: 'Untitled run' })).toContainText(`${ORG}/site · done`)
    await dialog.getByLabel('Search runs').fill('nothing like this')
    await expect(dialog.getByText('No run read so far matches.')).toBeVisible()
    // Enter with nothing found opens nothing.
    await dialog.getByLabel('Search runs').press('Enter')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Search runs').fill('')

    await dialog.getByRole('button', { name: 'Running' }).click()
    await dialog.getByRole('button', { name: 'Error' }).click()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog.getByRole('listitem')).toHaveText([/^Untitled run/])
    await page.waitForTimeout(3500)
    // The held pages came back to a filter left behind: neither lands, nor says anything.
    await expect(dialog.getByRole('listitem')).toHaveText([/^Untitled run/])
    await expect(dialog.getByText('Runs are resting')).toHaveCount(0)
    await expect(dialog.getByText('Reading runs…')).toHaveCount(0)
    await dialog.getByLabel('Search runs').fill('zzz')
    await expect(dialog.getByText('No run matches.')).toBeVisible()
    await page.screenshot({ path: info.outputPath('find.png') })
    const statuses = sent.filter((s) => s.path === '/v1/agent/sessions').map((s) => new URLSearchParams(s.query).get('status'))
    expect(statuses.filter(Boolean)).toEqual(['running', 'error', 'done'])
    await dialog.getByLabel('Search runs').fill('')
    await dialog.getByRole('listitem', { name: 'Untitled run' }).click()
    await expect(page).toHaveURL(new RegExp(`/${id('1')}$`))
    await expect(page.getByRole('dialog', { name: 'Find a run' })).toHaveCount(0)
  })

  test('on a phone the search is in the bar, beside the drawer’s button', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await frame(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Search runs' }).click()
    const dialog = page.getByRole('dialog', { name: 'Find a run' })
    await expect(dialog.getByRole('listitem', { name: 'Deploy the site' })).toBeVisible()
    await page.screenshot({ path: info.outputPath('phone-find.png') })
    await dialog.getByLabel('Search runs').fill('deploy')
    await dialog.getByLabel('Search runs').press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${id('3')}$`))
  })

  test('a refused list says why', async ({ page }) => {
    await frame(page, { statuses: { '': { refuse: 'Runs are resting' } } })
    await page.goto('/')
    await page.getByRole('button', { name: 'Search runs' }).first().click()
    await expect(page.getByRole('dialog').getByText('Runs are resting')).toBeVisible()
  })

  test('a lapsed session searches only what the rail holds', async ({ page }) => {
    await lapsed(page)
    await serve(page, () => ({ status: 401, json: { status: 401, detail: 'Sign in to use this.' } }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Search runs' }).first().click()
    await expect(page.getByRole('dialog').getByText('No run matches.')).toBeVisible()
  })
})

test.describe('the builder under another host', () => {
  const person = { name: 'Dave', email: 'dave@acme.test', avatar: '' }
  const tok = token(DAVE)
  const answer = ({ path }: Sent): Reply | undefined => {
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    return undefined
  }

  test('with its own rail, the builder draws no rail of its own', async ({ page }) => {
    await mount(page, { org: ORG, person, admin: true, rail: false, token: tok } satisfies Given, answer, '-/templates')
    await expect(page.getByText('Start from a working app.', { exact: false })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Runs' })).toHaveCount(0)
  })

  test('with no org list and no org, the account menu offers no organization and no way out', async ({ page }) => {
    await mount(page, { org: null, person, admin: false, rail: true, token: tok }, answer)
    await page.getByRole('button', { name: 'Account: Dave', exact: true }).click()
    await expect(account(page).getByRole('menuitem', { name: 'Get help' })).toBeVisible()
    await expect(account(page).getByRole('radiogroup', { name: 'Organizations' })).toHaveCount(0)
    await expect(account(page).getByRole('menuitem', { name: 'Log out' })).toHaveCount(0)
  })

  test('with an org and no org list, the account menu lists that org alone', async ({ page }) => {
    await mount(page, { org: ORG, person, admin: true, rail: true, token: tok }, answer)
    await page.getByRole('button', { name: `Account: Dave · ${ORG}` }).click()
    await expect(account(page).getByRole('radiogroup', { name: 'Organizations' }).getByRole('radio')).toHaveText([ORG])
  })
})
