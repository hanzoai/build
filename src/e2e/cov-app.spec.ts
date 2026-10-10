/**
 * The page around the builder, and the parts every screen shares: signing in
 * through hanzo.id (this tab goes and comes back, with nothing of the app drawn
 * to a visitor; the return and its refusals; signing out), who is signed in and which
 * org they work in, a host that draws its own rail (`DevSection`), the reads and
 * the live feed every pane owes, the person's own settings, attaching files and
 * dictating, and the markdown an agent writes.
 *
 * hanzo.id is stubbed with page.route: its discovery, authorize, token and
 * userinfo answers are the spec's own, so it checks what the page sends and
 * where it lands, not what IAM does.
 */
import type { BrowserContext, Page } from '@playwright/test'

import { ask, composer, status } from './composer.ts'
import { expect, test } from './fixture.ts'
import { mounted, went } from './mount.ts'
import { ORG, SESSION, serve, signIn, type Reply } from './signed.ts'
import { org, PNG } from './stubs.ts'

const ISSUER = 'https://hanzo.id'
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (claims: object) => [b64({ alg: 'none', typ: 'JWT' }), b64(claims), 'x'].join('.')
const TOKEN = jwt({ sub: `${ORG}/dave`, email: 'dave@acme.test', orgs: [{ org: ORG, role: 'admin' }] })

/** What hanzo.id was asked for, by the page and any popup it opened. */
interface Asked {
  authorize: URL[]
  token: URLSearchParams[]
}

/**
 * hanzo.id for one browser: its discovery, an authorize that returns the
 * browser to the callback with a code (the person already has a session there),
 * a token endpoint answering `token`, and userinfo answering `user`.
 */
async function issuer(
  ctx: BrowserContext,
  {
    token = { status: 200, json: { access_token: TOKEN, refresh_token: 'r1', expires_in: 3600, token_type: 'Bearer' } as unknown },
    user = { sub: `${ORG}/dave`, name: 'Dave', email: 'dave@acme.test' } as Record<string, unknown>,
    held = Promise.resolve(),
  }: { token?: unknown; user?: Record<string, unknown>; held?: Promise<void> } = {},
): Promise<Asked> {
  const asked: Asked = { authorize: [], token: [] }
  await ctx.route(`${ISSUER}/.well-known/openid-configuration`, async (r) => {
    await held
    await r.fulfill({
      json: {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/v1/iam/oauth/authorize`,
        token_endpoint: `${ISSUER}/v1/iam/oauth/token`,
        userinfo_endpoint: `${ISSUER}/v1/iam/oauth/userinfo`,
        revocation_endpoint: `${ISSUER}/v1/iam/oauth/revoke`,
        end_session_endpoint: `${ISSUER}/v1/iam/oauth/logout`,
      },
    })
  })
  await ctx.route(`${ISSUER}/v1/iam/oauth/authorize?**`, (r) => {
    const url = new URL(r.request().url())
    asked.authorize.push(url)
    const back = `${url.searchParams.get('redirect_uri')}?code=c0de&state=${url.searchParams.get('state')}`
    return r.fulfill({ status: 302, headers: { location: back } })
  })
  await ctx.route(`${ISSUER}/v1/iam/oauth/token`, (r) => {
    asked.token.push(new URLSearchParams(r.request().postData() ?? ''))
    return r.fulfill(token as { status: number; json: unknown })
  })
  await ctx.route(`${ISSUER}/v1/iam/oauth/userinfo`, (r) => r.fulfill({ json: user }))
  return asked
}

/** The platform as a visitor meets it: nothing is theirs. */
const nothing = (page: Page) => serve(page, () => undefined)

const stored = (page: Page, key: string) => page.evaluate((k) => window.localStorage.getItem(k), key)

/** The account has arrived: the rail names who is signed in. The exchange and userinfo take a moment. */
const arrived = (page: Page, who = 'Dave · acme') => expect(page.getByRole('button', { name: `Account: ${who}` })).toBeVisible({ timeout: 20_000 })

test.describe('signing in', () => {
  test('a visitor is drawn nothing: this tab goes to hanzo.id and comes back signed in, with the words it carried', async ({ page, baseURL }) => {
    let answer = () => {}
    const asked = await issuer(page.context(), { held: new Promise((done) => (answer = done)) })
    await nothing(page)
    const popups: string[] = []
    page.on('popup', (p) => popups.push(p.url()))
    await page.goto('/?q=Add%20a%20cart%20to%20the%20shop')
    // On its way to hanzo.id, held at discovery: the page draws nothing of the app.
    await page.waitForTimeout(500)
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('navigation')).toHaveCount(0)
    expect(asked.authorize).toEqual([])
    answer()
    await arrived(page)
    const ask = page.getByRole('textbox', { name: 'Describe a task or ask a question' })
    await expect(ask).toHaveValue('Add a cart to the shop')
    expect(page.url()).toBe(new URL('/', baseURL).href)
    expect(popups).toEqual([])

    const at = asked.authorize[0]!
    expect(at.searchParams.get('client_id')).toBe('hanzo-app')
    expect(at.searchParams.get('redirect_uri')).toBe(new URL('/auth/callback', baseURL).href)
    expect(at.searchParams.get('code_challenge_method')).toBe('S256')
    expect(asked.token).toHaveLength(1)
    expect(Object.fromEntries(asked.token[0]!)).toMatchObject({ grant_type: 'authorization_code', code: 'c0de', client_id: 'hanzo-app' })
    expect(asked.token[0]!.get('code_verifier')).toBeTruthy()
    expect(await stored(page, 'hanzo_iam_access_token')).toBe(TOKEN)
    expect(await stored(page, 'hanzo:who')).toBe(`${ORG}/dave`)
  })

  test('the return lands on the address the visitor asked for', async ({ page, baseURL }) => {
    const asked = await issuer(page.context())
    await nothing(page)
    await page.goto('/-/projects')
    await arrived(page)
    await expect(page).toHaveURL(new URL('/-/projects', baseURL).href)
    expect(asked.authorize).toHaveLength(1)
    expect(asked.token[0]!.get('code')).toBe('c0de')
  })

  test('a refused exchange says why, and keeps nobody signed in', async ({ page }) => {
    await issuer(page.context(), { token: { status: 400, json: { error: 'invalid_grant' } } })
    await nothing(page)
    await page.goto('/')
    await expect(page.getByText('Token exchange failed (400): {"error":"invalid_grant"}')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Try signing in again.')).toBeVisible()
    expect(await stored(page, 'hanzo_iam_access_token')).toBeNull()
  })

  test('a return with no code says so', async ({ page }) => {
    await nothing(page)
    await page.goto('/auth/callback')
    await expect(page.getByText('Missing authorization code in callback URL')).toBeVisible()
  })

  test('a refusal from a sign-in this browser did not start says to start again', async ({ page }) => {
    await nothing(page)
    await page.goto('/auth/callback?error=access_denied&state=elsewhere')
    await expect(page.getByText('OAuth error on a sign-in this browser did not start. Restart sign-in.')).toBeVisible()
  })

  test('the return shows it is working until the account arrives', async ({ page }) => {
    let release = () => {}
    const gate = new Promise<void>((done) => (release = done))
    await issuer(page.context())
    // hanzo.id takes its time over the exchange.
    await page.context().route(`${ISSUER}/v1/iam/oauth/token`, async (r) => {
      await gate
      await r.fulfill({ json: { access_token: TOKEN, expires_in: 3600 } })
    })
    await nothing(page)
    await page.goto('/')
    await expect(page.getByText('Completing sign-in…')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('One moment.')).toBeVisible()
    release()
    await arrived(page)
  })

  test('words sent while signed out are sent once the person is in', async ({ page }) => {
    const sent = await serve(page, ({ path, method }) => (path === '/v1/agent/coding' && method === 'POST' ? { status: 202, json: { sessionId: SESSION, repo: 'shop', branch: '' } } : undefined))
    // The project the run works on, chosen on an earlier visit.
    const shop = { owner: ORG, name: 'shop', full_name: `${ORG}/shop`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: '' }
    await page.addInitScript(([key, kept]) => localStorage.setItem(key, kept), [`hanzo.build.new.${ORG}`, JSON.stringify({ repo: shop, branch: 'main', place: '', mode: 'build', effort: 'medium', ask: '' })] as const)
    await mounted(page, { path: '', org: ORG, admin: true, person: null, signIn: true })
    const ask = page.getByRole('textbox', { name: 'Describe a task or ask a question' })
    await ask.fill('Add a cart to the shop')
    await ask.press('Enter')
    await expect.poll(() => went(page)).toEqual(['sign in'])
    expect(sent.filter((s) => s.path === '/v1/agent/coding')).toEqual([])

    // Back from signing in: the same tab, now with a person.
    await mounted(page, { path: '', org: ORG, admin: true, person: { name: 'Dave', email: 'dave@acme.test', avatar: '' } })
    await expect.poll(() => sent.filter((s) => s.method === 'POST' && s.path === '/v1/agent/coding').length).toBe(1)
    expect(sent.find((s) => s.path === '/v1/agent/coding')!.body).toMatchObject({ prompt: 'Add a cart to the shop', repo: 'shop' })
    await expect.poll(() => went(page)).toEqual([SESSION])
    // Once: a reload does not send it again.
    await page.reload()
    await page.waitForTimeout(500)
    expect(sent.filter((s) => s.method === 'POST' && s.path === '/v1/agent/coding')).toHaveLength(1)
  })
})

test.describe('who is signed in', () => {
  test('logging out hands the token back and ends the session at hanzo.id', async ({ page, baseURL }) => {
    await signIn(page, () => undefined)
    const revoked: string[] = []
    await page.context().route(`${ISSUER}/v1/iam/oauth/revoke`, (r) => {
      revoked.push(new URLSearchParams(r.request().postData() ?? '').get('token_type_hint') ?? '')
      return r.fulfill({ status: 200, body: '' })
    })
    // hanzo.id's logout, answered with nothing, so this page stays to be read.
    const ended: URL[] = []
    await page.context().route(`${ISSUER}/v1/iam/oauth/logout?**`, (r) => {
      ended.push(new URL(r.request().url()))
      return r.fulfill({ status: 204 })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Account: Dave · acme' }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()
    await expect.poll(() => ended.length).toBe(1)
    expect(ended[0]!.searchParams.get('post_logout_redirect_uri')).toBe(new URL('/', baseURL).href)
    expect(revoked).toEqual(['access_token'])
    expect(await stored(page, 'hanzo_iam_access_token')).toBeNull()
  })

  test('a browser the last person signed out of is emptied of their selections', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('hanzo:who', 'acme/erin')
      localStorage.setItem('hanzo.build.slack', 'true')
      localStorage.setItem('hanzo.build.new.acme', '{"ask":"hers"}')
      localStorage.setItem('theme', 'dark')
    })
    // hanzo.id is asked, and answers nothing, so this tab stays to be read.
    const asked: URL[] = []
    await page.context().route(`${ISSUER}/v1/iam/oauth/authorize?**`, (r) => {
      asked.push(new URL(r.request().url()))
      return r.fulfill({ status: 204 })
    })
    await nothing(page)
    await page.goto('/')
    await expect.poll(() => asked.length).toBe(1)
    expect(await stored(page, 'hanzo:who')).toBeNull()
    expect(await stored(page, 'hanzo.build.slack')).toBeNull()
    expect(await stored(page, 'hanzo.build.new.acme')).toBeNull()
    expect(await stored(page, 'theme')).toBe('dark')
  })

  /** Signed in, with hanzo.id saying `user` of the person; on Account. */
  async function account(page: Page, user: Record<string, unknown>) {
    await signIn(page, () => undefined)
    await page.route('**/v1/iam/oauth/userinfo', (r) => r.fulfill({ json: { sub: `${ORG}/dave`, ...user } }))
    await page.route('https://cdn.acme.test/**', (r) => r.fulfill({ body: PNG, contentType: 'image/png' }))
    await page.goto('/-/settings/account')
  }

  test('the account shows the display name hanzo.id gives, and its https photo', async ({ page }) => {
    await account(page, { displayName: 'Dave Bowman', name: 'dave', avatar: 'https://cdn.acme.test/dave.png' })
    await expect(page.getByRole('button', { name: 'Account: Dave Bowman' })).toBeVisible()
    await expect(page.getByLabel('Full name')).toHaveValue('Dave Bowman')
    await expect(page.locator('img[src="https://cdn.acme.test/dave.png"]')).toBeVisible()
  })

  test('a photo from an address that is not https is not drawn', async ({ page }) => {
    await account(page, { name: 'dave', email: 'dave@acme.test', avatar: 'http://cdn.acme.test/dave.png' })
    await expect(page.getByLabel('Full name')).toHaveValue('dave')
    await expect(page.locator('img[src^="http://cdn.acme.test"]')).toHaveCount(0)
  })

  test('an account hanzo.id names nothing about is still signed in', async ({ page }) => {
    await account(page, {})
    await expect(page.getByRole('button', { name: `Account: ${ORG}`, exact: true })).toBeVisible()
    await expect(page.getByLabel('Full name')).toHaveValue('')
  })
})

test.describe('the organization this browser works in', () => {
  const TWO = jwt({ sub: `${ORG}/dave`, orgs: [{ org: ORG, role: 'admin' }, { org: 'beta', role: 'member' }] })

  /** Signed in as a member of two orgs, `chosen` the one this browser works in; notes the org each run read named. */
  async function two(page: Page, chosen = '') {
    await signIn(page, () => undefined)
    await page.addInitScript(
      ([t, o]) => {
        if (sessionStorage.getItem('two')) return
        sessionStorage.setItem('two', '1')
        localStorage.setItem('hanzo_iam_access_token', t)
        if (o) localStorage.setItem('hanzo_iam_current_org', o)
      },
      [TWO, chosen] as const,
    )
    const scoped: string[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/v1/agent/')) scoped.push(r.headers()['x-org-id'] ?? '')
    })
    return scoped
  }

  test('the org this browser chose scopes every call', async ({ page }) => {
    const scoped = await two(page, 'beta')
    await page.goto('/-/settings/account')
    await expect(page.getByText('Acting in beta', { exact: true })).toBeVisible()
    await expect.poll(() => scoped.length).toBeGreaterThan(0)
    expect(new Set(scoped)).toEqual(new Set(['beta']))
  })

  test('with two orgs and none chosen, nothing is scoped until one is', async ({ page }) => {
    const scoped = await two(page)
    await page.goto('/-/settings/account')
    await expect(page.getByRole('button', { name: 'Switch' })).toHaveCount(2)
    await expect.poll(() => scoped.length).toBeGreaterThan(0)
    expect(new Set(scoped)).toEqual(new Set(['']))
  })

  test('Switch keeps the choice and reloads the page onto New', async ({ page, baseURL }) => {
    await two(page, ORG)
    await page.goto('/-/settings/account')
    await expect(page.getByText(`Acting in ${ORG} as an admin`)).toBeVisible()
    // The reload, answered with nothing so this page stays to be read.
    const reloads: string[] = []
    await page.route(
      (u) => u.pathname === '/',
      (r) => {
        if (!r.request().isNavigationRequest()) return r.fallback()
        reloads.push(r.request().url())
        return r.fulfill({ status: 204 })
      },
    )
    await page.getByRole('button', { name: 'Switch' }).click()
    await expect.poll(() => reloads).toEqual([new URL('/', baseURL).href])
    expect(await stored(page, 'hanzo_iam_current_org')).toBe('beta')
  })

  test('an org this browser’s session no longer holds is not switched to', async ({ page, baseURL }) => {
    await two(page)
    await page.goto('/-/settings/account')
    await expect(page.getByRole('button', { name: 'Switch' })).toHaveCount(2)
    // Someone else signs in on another tab: the stored session now holds acme alone.
    await page.evaluate((t) => localStorage.setItem('hanzo_iam_access_token', t), TOKEN)
    await page.getByRole('button', { name: 'Switch' }).last().click()
    await expect(page).toHaveURL(new URL('/-/settings/account', baseURL).href)
    expect(await stored(page, 'hanzo_iam_current_org')).toBeNull()
  })
})

test.describe('the page’s theme', () => {
  for (const [kept, reads] of [
    ['light', 'Light'],
    ['system', 'System'],
    // Not one of ours — another page on this origin wrote it — so it is not taken for a choice.
    ['sepia', 'Dark'],
  ] as const) {
    test(`a theme kept as ${kept} reads as ${reads}`, async ({ page }) => {
      await signIn(page, () => undefined)
      await page.addInitScript((v) => localStorage.setItem('theme', v), kept)
      await page.goto('/-/settings/general')
      await expect(page.getByRole('button', { name: `Theme: ${reads}` })).toBeVisible()
    })
  }
})

/** One frame of the session stream, wrapped the way the platform wraps it. */
const frame = (kind: 'session' | 'event', o: object) => `event: ${kind}\ndata: ${JSON.stringify({ [kind]: o })}\n\n`
const stream = (body: string): Reply => ({ text: body, type: 'text/event-stream' })

test.describe('a host that draws its own rail', () => {
  const QUEUED = `sess_${'c'.repeat(32)}`
  const LATER = `sess_${'d'.repeat(32)}`
  const RUNS = [
    { id: SESSION, title: 'universe: Add the widget', status: 'running', kind: 'coding' },
    { id: QUEUED, title: '', status: 'queued', kind: 'coding' },
  ]
  const HOST = '/src/e2e/host.html'
  const rail = (page: Page) => page.getByLabel('Host rail')
  const row = (page: Page, name: string) => rail(page).getByRole('button', { name, exact: true })
  const moves = (page: Page) => page.getByLabel('Moves')

  /** The org's runs, and its feed: `feed` is what each connection to it answers, in turn. */
  function runs(page: Page, { list = RUNS as unknown[], feed = [] as string[], status = 200 } = {}) {
    let fed = 0
    return signIn(page, ({ path, query }) => {
      if (path === '/v1/agent/sessions') return status === 200 ? { json: { sessions: list, next: '' } } : { status, json: { detail: 'The session store is down.' } }
      if (path === '/v1/agent/sessions/stream' && !query) return stream(feed[fed++] ?? '')
      if (path === '/v1/agent/sessions/stream') return stream('')
      if (path === `/v1/agent/sessions/${SESSION}`) return { json: { ...RUNS[0], recentEvents: [] } }
      return undefined
    })
  }

  test('is the package’s own entry, and lists the places, the host’s rows and the org’s runs', async ({ page }, info) => {
    await runs(page)
    await page.goto(`${HOST}?label=Dev`)
    const surface = await page.evaluate((at) => import(at).then((m: object) => Object.keys(m).sort()), '/src/index.ts')
    expect(surface).toEqual(['Builder', 'Credits', 'DOTS', 'DevSection', 'Grip', 'HostProvider', 'Meter', 'NEW', 'Plan', 'SEPARATE', 'SESSION', 'SLUG', 'Slack', 'Title', 'Who', 'administers', 'kind', 'label', 'left', 'nav', 'path', 'route', 'rows', 'said', 'share', 'spent', 'useSessions', 'useStanding', 'useWho', 'ways', 'when'])

    const r = rail(page)
    await expect(r.getByText('Dev', { exact: true })).toBeVisible()
    const rows = await r.locator('[data-slot="sidebar-item"]').allInnerTexts()
    // Every place in view, grouped as every rail groups them (nav.tsx), then the host's rows and the runs.
    expect(rows).toEqual(['New run', 'Projects', 'Issues', 'Artifacts', 'Templates', 'Automations', 'Machines', 'Environments', 'Customize', 'Docs', 'The host’s own row', 'universe: Add the widget', 'Untitled run'])
    for (const label of ['Work', 'Make', 'Run', 'Setup']) await expect(r.getByText(label, { exact: true })).toBeVisible()
    await expect(row(page, 'universe: Add the widget').locator('[data-status]')).toHaveAttribute('data-status', 'running')
    // A status the rail has no dot for is idle.
    await expect(row(page, 'Untitled run').locator('[data-status]')).toHaveAttribute('data-status', 'idle')
    await expect(row(page, 'New run')).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ path: info.outputPath('host-rail.png') })
  })

  test('the host sizes its rail with the builder’s edge, and a pull past its floor puts the rail away', async ({ page }) => {
    await runs(page)
    await page.goto(`${HOST}?label=Dev`)
    const edge = page.getByRole('separator', { name: 'Resize the rail' })
    await expect(edge).toHaveAttribute('aria-valuenow', '264')
    await expect(edge).toHaveAttribute('aria-valuemin', '200')
    await expect(edge).toHaveAttribute('aria-valuemax', '480')
    const width = () => rail(page).evaluate((el) => Math.round(el.getBoundingClientRect().width))
    await edge.focus()
    await edge.press('ArrowRight')
    await edge.press('Shift+ArrowRight')
    await expect(edge).toHaveAttribute('aria-valuenow', '304')
    expect(await width()).toBe(304)
    await edge.press('End')
    await expect(edge).toHaveAttribute('aria-valuenow', '480')
    await edge.dblclick()
    await expect(edge).toHaveAttribute('aria-valuenow', '264')
    // Keyed at the floor, it holds; one step past it, the rail is put away.
    await edge.press('Home')
    await expect(edge).toHaveAttribute('aria-valuenow', '200')
    await edge.press('ArrowLeft')
    await expect(rail(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Show the rail' }).click()
    await expect(rail(page)).toBeVisible()

    // Dragged: it follows the pointer, and a deliberate pull past the floor puts it away.
    const e = (await edge.boundingBox())!
    await page.mouse.move(e.x + e.width / 2, 300)
    await page.mouse.down()
    await page.mouse.move(e.x + e.width / 2 + 40, 300, { steps: 4 })
    await expect.poll(width).toBe(240)
    await page.mouse.move(e.x + e.width / 2 - 20, 300, { steps: 4 })
    await expect.poll(width).toBe(200)
    await page.mouse.move(e.x + e.width / 2 - 140, 300, { steps: 4 })
    await page.mouse.up()
    await expect(rail(page)).toHaveCount(0)
  })

  test('every row moves the builder through the host, and says which one is open', async ({ page }) => {
    await runs(page)
    await page.goto(`${HOST}?label=Dev`)
    const at = [
      ['Automations', '-/automations'],
      ['Projects', '-/projects'],
      ['Artifacts', '-/artifacts'],
      ['Templates', '-/templates'],
      ['Machines', '-/settings/machines'],
      ['Environments', '-/settings/environments'],
    ] as const
    for (const [name, path] of at) {
      await row(page, name).click()
      await expect(moves(page)).toHaveText(new RegExp(`${path.replace('/', '\\/')}$`))
      await expect(row(page, name)).toHaveAttribute('aria-current', 'page')
    }
    await row(page, 'Customize').click()
    await expect(moves(page)).toHaveText(/-\/customize$/)
    await expect(row(page, 'Customize')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('What your agent can use in every run.').first()).toBeVisible()

    await page.evaluate(() => localStorage.setItem('hanzo.build.board.acme', '"web"'))
    await row(page, 'Issues').click()
    await expect(moves(page)).toHaveText(/-\/issues$/)
    // Issues opens on every board, whichever one was showing.
    expect(await stored(page, 'hanzo.build.board.acme')).toBe('""')

    await row(page, 'universe: Add the widget').click()
    await expect(moves(page)).toHaveText(new RegExp(`${SESSION}$`))
    await expect(row(page, 'universe: Add the widget')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'universe: Add the widget' })).toBeVisible()

    await row(page, 'New run').click()
    await expect(moves(page)).toHaveText(/\(new\)$/)
    // The host is told of every pick, so a drawer can close.
    await expect(page.getByLabel('Picks')).toHaveText('10')
  })

  test('with no label of its own it lists Runs, and tells a host that asked for nothing only through go', async ({ page }) => {
    await runs(page)
    await page.goto(HOST)
    await expect(rail(page).getByText('Runs', { exact: true })).toBeVisible()
    await expect(rail(page).getByText('The host’s own row')).toHaveCount(0)
    await row(page, 'Projects').click()
    await expect(moves(page)).toHaveText('-/projects')
    await expect(page.getByLabel('Picks')).toHaveText('0')
  })

  test('asks a visitor to sign in to see the runs', async ({ page }) => {
    await serve(page, () => undefined)
    await page.goto(HOST)
    await expect(rail(page).getByText('Sign in to see your runs.')).toBeVisible()
  })

  test('says there are no runs yet, and where they will land', async ({ page }) => {
    await runs(page, { list: [] })
    await page.goto(HOST)
    await expect(rail(page).getByText('No runs yet. Say what to build and it lands here.')).toBeVisible()
  })

  test('a host that cannot repaint itself keeps its own theme', async ({ page }) => {
    await runs(page)
    await page.route('**/v1/pref', (r) => r.fulfill({ json: { prefs: { theme: 'light' }, updatedAt: 1 } }))
    await page.goto(`${HOST}?at=-/settings`)
    await expect(page.getByText('How Hanzo looks and listens', { exact: false })).toBeVisible()
    // No theme to choose on this host, and the saved one is not forced on it.
    await expect(page.getByRole('button', { name: /^Theme: / })).toHaveCount(0)
    await expect(page.locator('html')).toHaveClass(/\bt_dark\b/)
  })

  test('says why the runs could not be read', async ({ page }) => {
    await runs(page, { status: 503 })
    await page.goto(HOST)
    await expect(rail(page).getByText('The session store is down.')).toBeVisible()
  })

  test('says it is reading until the runs arrive', async ({ page }) => {
    let release = () => {}
    const held = new Promise<void>((done) => (release = done))
    await runs(page)
    await page.route('**/v1/agent/sessions?**', async (r) => {
      await held
      await r.fulfill({ json: { sessions: RUNS, next: '' } })
    })
    await page.goto(HOST)
    await expect(rail(page).getByText('Reading…')).toBeVisible()
    release()
    await expect(row(page, 'universe: Add the widget')).toBeVisible()
  })

  test('the org’s feed moves a run’s dot, and a run started elsewhere appears', async ({ page }) => {
    // The platform as the feed tells it: once the frames are out, the list says the same.
    const world = RUNS.map((r) => ({ ...r }))
    const told = [
      frame('session', { id: SESSION, status: 'done', title: '' }) + frame('session', { id: LATER, status: 'running', title: 'Started from the CLI' }),
    ]
    let fed = 0
    const listed: number[] = []
    await runs(page)
    await page.route('**/v1/agent/sessions?**', (r) => {
      listed.push(Date.now())
      return r.fulfill({ json: { sessions: world, next: '' } })
    })
    await page.route('**/v1/agent/sessions/stream', (r) => {
      // Nothing is told until the list has been on screen a moment.
      const body = listed.length && Date.now() - listed[0]! > 500 ? (told[fed++] ?? '') : ''
      if (body) {
        world[0]!.status = 'done'
        world.unshift({ id: LATER, title: 'Started from the CLI', status: 'running', kind: 'coding' })
      }
      return r.fulfill({ body, contentType: 'text/event-stream' })
    })
    await page.goto(HOST)
    // The frame names no title, so the row keeps the one it had.
    await expect(row(page, 'universe: Add the widget').locator('[data-status]')).toHaveAttribute('data-status', 'done')
    // A run the list has not seen is read again rather than guessed at, at most every five seconds.
    await expect(row(page, 'Started from the CLI')).toBeVisible({ timeout: 15_000 })
    await expect(row(page, 'Started from the CLI').locator('[data-status]')).toHaveAttribute('data-status', 'running')
    // Each reconnect, and each run it has not seen, re-reads the list — at most every five seconds.
    const reads = () => listed.filter((at) => at - listed[0]! > 500)
    await expect.poll(() => reads().length, { timeout: 15_000 }).toBeGreaterThan(1)
    expect(reads().slice(1).every((at, i) => at - reads()[i]! >= 4_900)).toBe(true)
  })

  test('a feed the platform refuses leaves the runs as read', async ({ page }) => {
    await runs(page)
    let asked = 0
    await page.route('**/v1/agent/sessions/stream', (r) => {
      asked++
      return r.fulfill({ status: 403, json: { detail: 'No.' } })
    })
    await page.goto(HOST)
    await expect(row(page, 'universe: Add the widget')).toBeVisible()
    await expect.poll(() => asked).toBeGreaterThan(0)
    const first = asked
    // A refusal is not retried: a dropped feed would be asked again within two seconds.
    await page.waitForTimeout(2_500)
    expect(asked).toBe(first)
    await expect(row(page, 'universe: Add the widget').locator('[data-status]')).toHaveAttribute('data-status', 'running')
  })
})

const ev = (id: string, seq: number, kind: string, payload: unknown, sessionId = SESSION) => ({ id, sessionId, seq, kind, actor: `${ORG}/dave`, payload, createdAt: '' })

/** What the agent said, as the sandbox narrates it. */
/** What the agent said, as one line of its narration. */
const said = (text: string) => ({ type: 'item.completed', item: { id: text, type: 'agent_message', text } })

const DETAIL = {
  id: SESSION,
  org: ORG,
  title: 'universe: Add the widget',
  status: 'running',
  kind: 'coding',
  repo: 'hanzoai/universe',
  base: 'main',
  branch: 'agent/ab12',
  environment: 'sandbox',
  mode: 'build',
  recentEvents: [ev('e1', 1, 'status', { status: 'started', branch: 'agent/ab12' }), ev('e2', 2, 'event', said('Reading the widget first.'))],
}

test.describe('one run, read and followed', () => {
  const CHILD = `sess_${'e'.repeat(32)}`

  /**
   * The run's record (`detail` is its status) and its feed. Each connection to
   * the feed answers the next of `feed` once the record has been read — so the
   * frames land on a run already on screen — and nothing after.
   */
  function followed(page: Page, { detail = 200, feed = [] as string[], refuse = 0 } = {}) {
    const reads: number[] = []
    let fed = 0
    const sent = signIn(page, ({ method, path, query }) => {
      if (path === `/v1/agent/sessions/${SESSION}` && method === 'GET') {
        reads.push(Date.now())
        return detail === 200 ? { json: DETAIL } : { status: detail, json: { detail: 'The run’s record is not there.' } }
      }
      // The rail follows the whole org's feed; this is the run's own.
      if (path === '/v1/agent/sessions/stream' && query === `?root=${SESSION}`) {
        if (refuse) return { status: refuse, json: { detail: 'No.' } }
        return stream(Date.now() - (reads[0] ?? Date.now()) > 500 || detail !== 200 ? (feed[fed++] ?? '') : '')
      }
      if (path === '/v1/agent/sessions/stream') return stream('')
      if (path === '/v1/environment/universe') return { json: { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' } }
      return undefined
    })
    return { sent, reads }
  }

  const transcript = (page: Page) => page.getByLabel('Transcript')
  const title = (page: Page) => page.getByRole('heading', { level: 1 })

  test('the feed adds this run’s turns and record, and nothing from the runs under it', async ({ page }, info) => {
    const { reads } = followed(page, {
      feed: [
        frame('event', ev('c1', 1, 'event', said('Noise from a sub-agent.'), CHILD)) +
          frame('session', { id: CHILD, status: 'error', title: 'A sub-agent' }) +
          frame('event', ev('e3', 3, 'event', said('Live from the feed.'))) +
          // A frame from before the run had a title, a branch or a mode keeps the ones the record has.
          frame('session', { ...DETAIL, recentEvents: undefined, title: '', branch: '', pr: '', mode: '' }),
        frame('session', { ...DETAIL, recentEvents: undefined, status: 'done', title: 'Widget added', branch: 'agent/ab13', pr: 'https://git.hanzo.ai/hanzoai/universe/pulls/9' }),
      ],
    })
    await page.goto(`/${SESSION}`)
    await expect(transcript(page).getByText('Reading the widget first.')).toBeVisible()
    await expect(transcript(page).getByText('Live from the feed.')).toBeVisible({ timeout: 10_000 })
    await expect(title(page)).toHaveText('universe: Add the widget')
    await expect(page.getByText('agent/ab12', { exact: false }).first()).toBeVisible()
    await expect(transcript(page).getByText('Noise from a sub-agent.')).toHaveCount(0)

    await expect(title(page)).toHaveText('Widget added', { timeout: 10_000 })
    await expect(page.getByText(/agent\/ab13/).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Open pull request/ })).toHaveAttribute('href', 'https://git.hanzo.ai/hanzoai/universe/pulls/9')
    await expect(page.getByText('A sub-agent')).toHaveCount(0)
    // Each reconnect may have missed frames, so the record is read again.
    expect(reads.length).toBeGreaterThan(2)
    await page.screenshot({ path: info.outputPath('run-followed.png') })
  })

  test('a run whose record cannot be read is still drawn from its feed', async ({ page }) => {
    followed(page, { detail: 500, feed: [frame('session', { id: SESSION, status: 'running', title: 'Told by the feed', branch: 'agent/live' })] })
    await page.goto(`/${SESSION}`)
    await expect(title(page)).toHaveText('Told by the feed', { timeout: 10_000 })
    await expect(transcript(page).getByText('The run’s record is not there.')).toBeVisible()
  })

  test('a feed the platform refuses says why', async ({ page }) => {
    followed(page, { refuse: 403 })
    await page.goto(`/${SESSION}`)
    await expect(transcript(page).getByText('Reading the widget first.')).toBeVisible()
    await expect(page.getByRole('status').getByText('This account cannot follow this run')).toBeVisible()
  })
})

test('the markdown an agent writes is drawn as text: headings, emphasis, links, quotes, rules, tables, code and lists', async ({ page }, info) => {
  const md = [
    '# Done',
    '## What changed',
    '### Files',
    '#### Notes',
    '##### Small print',
    '###### Smallest print',
    'Added *a cart*, **a total**, `cart.js`, [the docs](https://docs.hanzo.ai) and [a trap](javascript:alert(1)).',
    '',
    '> Checked by the tests.',
    '',
    '---',
    '',
    '| file | lines |',
    '|---|---|',
    '| cart.js | 40 |',
    '| total.js |',
    '',
    '```js',
    'export const cart = []',
    '```',
    '',
    '```',
    'plain words',
    '```',
    '',
    '3. Read it',
    '4. Ship it',
    '',
    '- one',
    '  - nested',
  ].join('\n')
  await signIn(page, ({ path }) => {
    if (path === `/v1/agent/sessions/${SESSION}`) return { json: { ...DETAIL, status: 'done', recentEvents: [ev('e1', 1, 'event', said(md))] } }
    if (path === '/v1/agent/sessions/stream') return stream('')
    return undefined
  })
  await page.goto(`/${SESSION}`)
  const t = page.getByLabel('Transcript')
  for (const h of ['Done', 'What changed', 'Files', 'Notes', 'Small print', 'Smallest print']) await expect(t.getByText(h, { exact: true })).toBeVisible()
  await expect(t.getByText('a cart', { exact: true })).toHaveCSS('font-style', 'italic')
  await expect(t.getByText('a total', { exact: true })).toHaveCSS('font-weight', '600')
  await expect(t.getByText('cart.js', { exact: true }).first()).toBeVisible()
  const docs = t.getByRole('link', { name: 'the docs' })
  await expect(docs).toHaveAttribute('href', 'https://docs.hanzo.ai')
  await expect(docs).toHaveAttribute('target', '_blank')
  await expect(docs).toHaveAttribute('rel', 'noopener noreferrer')
  // Only an http(s) address is a link; anything else is its words.
  await expect(t.getByText('a trap', { exact: false })).toBeVisible()
  await expect(t.getByRole('link', { name: 'a trap' })).toHaveCount(0)
  await expect(t.getByText('Checked by the tests.')).toBeVisible()
  await expect(t.getByText('export const cart = []')).toBeVisible()
  await expect(t.getByText('plain words')).toBeVisible()
  await expect(t.getByText('total.js', { exact: true })).toBeVisible()
  const items = t.getByRole('listitem')
  await expect(items).toHaveText(['3.Read it', '4.Ship it', '•one', '•nested'])
  await page.screenshot({ path: info.outputPath('prose.png'), fullPage: true })
})


/** Choose files in the composer's picker, the way a person does. */
async function attach(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Attach files' }).click()])
  await chooser.setFiles(files)
}
const text = (name: string, body: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(body) })

test.describe('attaching files', () => {
  test('with nothing attached, the prompt is sent as typed', async ({ page }) => {
    const { sent } = await composer(page)
    await page.goto('/')
    await ask(page).fill('Fix the cart')
    await ask(page).press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${SESSION}$`))
    expect((sent.find((s) => s.method === 'POST' && s.path === '/v1/agent/coding')!.body as { prompt: string }).prompt).toBe('Fix the cart')
  })

  test('files ride the prompt as text, a binary one as its bytes read as text, and a removed one does not', async ({ page }, info) => {
    const { sent } = await composer(page)
    await page.goto('/')
    await attach(page, [text('notes.md', '# Notes'), { name: 'pixel.png', mimeType: 'image/png', buffer: PNG }, text('old.txt', 'stale')])
    for (const name of ['notes.md', 'pixel.png', 'old.txt']) await expect(page.getByText(name, { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('attached.png') })
    await page.getByRole('button', { name: 'Remove old.txt' }).click()
    await expect(page.getByText('old.txt', { exact: true })).toHaveCount(0)
    await ask(page).fill('Fix the cart')
    await ask(page).press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${SESSION}$`))
    const body = sent.find((s) => s.method === 'POST' && s.path === '/v1/agent/coding')!.body as { prompt: string }
    expect(body.prompt).toBe(`Fix the cart\n\n\`notes.md\`:\n\`\`\`\n# Notes\n\`\`\`\n\n\`pixel.png\`:\n\`\`\`\n${new TextDecoder().decode(PNG)}\n\`\`\``)
  })

  test('a file over 100 KB is refused, and the attachments stop at 200 KB in all', async ({ page }) => {
    await composer(page)
    await page.goto('/')
    await attach(page, [text('big.log', 'x'.repeat(100_001))])
    await expect(status(page)).toHaveText('big.log is over 100 KB; attach a smaller file or point the run at the repository.')
    await expect(page.getByText('big.log', { exact: true })).toHaveCount(0)
    await attach(page, [text('a.txt', 'a'.repeat(90_000)), text('b.txt', 'b'.repeat(90_000)), text('c.txt', 'c'.repeat(90_000))])
    await expect(status(page)).toHaveText('Attachments are capped at 200 KB in all.')
    expect(await page.getByRole('button', { name: /^Remove / }).evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).toEqual(['Remove a.txt', 'Remove b.txt'])
    // What is left under the cap still fits, and the refusal is gone.
    await attach(page, [text('d.txt', 'd'.repeat(10_000))])
    await expect(page.getByRole('button', { name: 'Remove d.txt' })).toBeVisible()
    await expect(status(page)).toHaveCount(0)
  })
})

test.describe('dictating without a microphone', () => {
  test('a microphone the page may not use is said, and nothing is recorded', async ({ page }) => {
    const { heardBy } = await composer(page)
    // The person answers the browser's prompt with Block.
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Dictate' }).click()
    await expect(status(page)).toHaveText('The microphone is not available to this page.')
    expect(heardBy).toEqual([])
  })

  test('a recorder that heard nothing sends nothing', async ({ page }) => {
    const { heardBy } = await composer(page)
    // A recorder that stops with an empty take and names no type for it.
    await page.addInitScript(() => {
      const track = { stop() {} }
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [track] }) as unknown as MediaStream
      window.MediaRecorder = class {
        mimeType = ''
        ondataavailable: ((e: { data: Blob }) => void) | null = null
        onstop: (() => void) | null = null
        start() {}
        stop() {
          this.ondataavailable?.({ data: new Blob([]) })
          this.onstop?.()
        }
      } as unknown as typeof MediaRecorder
    })
    await page.goto('/')
    await ask(page).fill('As typed')
    await page.getByRole('button', { name: 'Dictate' }).click()
    await page.getByRole('button', { name: 'Stop and transcribe' }).click()
    await expect(page.getByRole('button', { name: 'Dictate' })).toBeVisible()
    await expect(ask(page)).toHaveValue('As typed')
    expect(heardBy).toEqual([])
  })

  test('a visitor’s choice of language asks them to sign in', async ({ page }) => {
    await serve(page, () => undefined)
    await mounted(page, { path: '', org: null, admin: false, person: null, signIn: true })
    await page.getByRole('button', { name: 'Dictation language:', exact: true }).click()
    await page.getByRole('option', { name: 'Deutsch' }).click()
    await expect(status(page)).toHaveText('Sign in to save your settings.')
  })
})

test.describe('the person’s own settings', () => {
  test('a change the platform refuses is taken back, key by key, and says why', async ({ page }) => {
    await composer(page, { prefs: { motion: 'reduced' } })
    await page.route('**/v1/pref', (r) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 503, json: { detail: 'Settings are read-only right now.' } }) : r.fallback()))
    await page.goto('/-/settings/general')
    await expect(page.getByRole('button', { name: 'Motion: Reduced' })).toBeVisible()
    await page.getByRole('button', { name: 'Text size: Medium' }).click()
    await page.getByRole('option', { name: 'Large' }).click()
    await expect(page.getByText('Settings are read-only right now.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Text size: Medium' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--type-scale').trim())).toBe('1')
    await page.getByRole('button', { name: 'Motion: Reduced' }).click()
    await page.getByRole('option', { name: 'System' }).click()
    await expect(page.getByRole('button', { name: 'Motion: Reduced' })).toBeVisible()
    // Still reduced: every transition finished at once.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toBe('1e-05s')
  })

  test('a browser that refuses storage keeps a choice for this page only', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    // Storage refuses the page's own kept choices; the session IAM keeps is still there, so the rail is.
    await page.addInitScript(() => {
      const refuse = (key: string) => {
        if (key.startsWith('hanzo.build.')) throw new DOMException('The operation is insecure.', 'SecurityError')
      }
      const { getItem, setItem } = Storage.prototype
      Storage.prototype.getItem = function (key: string) {
        refuse(key)
        return getItem.call(this, key)
      }
      Storage.prototype.setItem = function (key: string, value: string) {
        refuse(key)
        setItem.call(this, key, value)
      }
    })
    await signIn(page, () => undefined)
    await page.goto('/')
    const rail = page.getByRole('navigation', { name: 'Runs' }).first()
    await expect(rail).toHaveAttribute('data-collapsed', 'false')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(rail).toHaveAttribute('data-collapsed', 'true')
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(rail).toHaveAttribute('data-collapsed', 'false')
    expect(errors).toEqual([])
  })
})

test.describe('Settings', () => {
  test('lists every section by group, and a section is its own address', async ({ page, baseURL }, info) => {
    await signIn(page, () => undefined)
    await page.goto('/-/settings/members')
    const nav = page.getByRole('navigation', { name: 'Settings' })
    await expect(nav.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-current', 'page')
    // Its title, then each group over its sections.
    expect((await nav.innerText()).split('\n').filter(Boolean)).toEqual([
      'Settings',
      'Settings',
      'General',
      'Account',
      'Privacy',
      'Billing',
      'Usage',
      'Capabilities',
      'Memory',
      'Code',
      'Code',
      'Environments',
      'Machines',
      'API keys',
      'Organization',
      'Members',
      'Integrations',
      'Notifications',
    ])
    await nav.getByRole('button', { name: 'API keys' }).click()
    await expect(page).toHaveURL(new URL('/-/settings/keys', baseURL).href)
    await expect(nav.getByRole('button', { name: 'API keys' })).toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('button', { name: 'Members' })).not.toHaveAttribute('aria-current', 'page')
    await nav.getByRole('button', { name: 'General' }).click()
    await expect(page).toHaveURL(new URL('/-/settings', baseURL).href)
    await page.screenshot({ path: info.outputPath('settings.png') })
  })

  test('on a phone the sections are a row of chips', async ({ page, baseURL }, info) => {
    await signIn(page, () => undefined)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/-/settings/usage')
    await expect(page.getByRole('navigation', { name: 'Settings' })).toBeHidden()
    await page.getByRole('button', { name: 'Notifications' }).click()
    await expect(page).toHaveURL(new URL('/-/settings/notifications', baseURL).href)
    await page.screenshot({ path: info.outputPath('settings-phone.png') })
  })

  test('an invitation says when it was sent only when the platform says a day', async ({ page }) => {
    await org(page)
    await page.route(
      (u) => u.pathname.startsWith('/v1/iam/invitations'),
      (r) =>
        r.fulfill({
          json: {
            invitations: [
              { owner: ORG, name: 'invite-sent', email: 'sent@acme.test', quota: 1, usedCount: 0, state: 'Active', createdTime: '2026-09-20T00:00:00Z' },
              { owner: ORG, name: 'invite-undated', email: 'undated@acme.test', quota: 1, usedCount: 0, state: 'Active', createdTime: '' },
              { owner: ORG, name: 'invite-garbled', email: 'garbled@acme.test', quota: 1, usedCount: 0, state: 'Active', createdTime: 'last Tuesday' },
            ],
            total: 3,
          },
        }),
    )
    await page.goto('/-/settings/members')
    await expect(page.getByText('0 of 1 joined · invited Sep 20, 2026')).toBeVisible()
    await expect(page.getByText('0 of 1 joined', { exact: true })).toHaveCount(2)
  })

  test('installing the GitHub App leaves this page for GitHub’s own', async ({ page }) => {
    await org(page)
    await page.goto('/-/settings/integrations')
    // GitHub, answering with nothing, so this page stays to be read.
    const left: string[] = []
    await page.route('https://github.com/**', (r) => {
      left.push(r.request().url())
      return r.fulfill({ status: 204 })
    })
    await page.getByRole('button', { name: 'Install on a GitHub account' }).click()
    await expect.poll(() => left).toEqual(['https://github.com/apps/hanzo/installations/new?state=signed'])
  })
})

