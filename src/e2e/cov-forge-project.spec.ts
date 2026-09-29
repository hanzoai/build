/**
 * A project's workspace: its runs as a conversation, asking, steering and
 * stopping, verdicts, the preview and the page's own bridge, Files and Code at
 * the run's branch, Layers, the bar, the dock, history, the project switcher,
 * Share and Publish; a copy being published and one whose build failed, a run
 * that published what it pushed and one that could not, and its pull request
 * merged — against a platform that answers each call the way a test says. One
 * document per test (cov-forge.spec.ts says why).
 */
import type { Page } from '@playwright/test'

import { enter, held, via, type Holds, type Reply, type Sent, type Who } from './cov-forge.ts'
import { expect, test } from './fixture.ts'
import { mounted, went } from './mount.ts'
import { ORG } from './signed.ts'

const id = (c: string) => `sess_${c.repeat(32)}`
const CART = id('1')
const UNTITLED = id('2')
const HALTED = id('3')
const ELSEWHERE = id('4')
const NEXT = id('5')
const LIVE = 'https://shop.hanzo.app'
const DEMO = 'https://synapse.hanzo.app'
const PR = `https://git.hanzo.ai/${ORG}/shop/pulls/4`

const ev = (session: string, seq: number, kind: string, payload: unknown) => ({ id: `${session}-e${seq}`, sessionId: session, seq, kind, actor: `${ORG}/dave-1a2b`, payload, createdAt: '' })

interface World extends Holds {
  projects: Record<string, unknown>[]
  runs: Record<string, unknown>[]
  events: Record<string, Record<string, unknown>[]>
  /** Whether the event bus takes a verdict. */
  accepts: boolean
  files: Record<string, { content?: string; binary?: boolean; truncated?: boolean }>
  /** A project's deployments, by slug, newest first. */
  deployments: Record<string, Record<string, unknown>[]>
  /** What a run pushed, by session: its pull request is where Merge reads. */
  changes: Record<string, Record<string, unknown>>
  /** What Publish's declaration answers, and what the builds board lists. */
  declared: Record<string, unknown>
  builds: Record<string, unknown>[]
  /** The deployed site's heading, and how many times its pages were loaded. */
  site: string
  served: number
}

const PROJECTS = () => [
  { slug: 'shop', name: 'Shop', visibility: 'private', liveUrl: LIVE, repo: { url: `https://git.hanzo.ai/${ORG}/shop.git`, branch: 'main' }, updatedAt: 3 },
  { slug: 'blog', name: 'Blog', visibility: 'public', updatedAt: 2 },
]

/** A copy of the Synapse starter, taken and not yet published. */
const TAKEN = { slug: 'synapse', name: 'Synapse', visibility: 'private', forkedFrom: 'synapse', repo: { url: 'https://github.com/hanzo-apps/template-synapse', branch: 'main' }, updatedAt: 1 }

/** The same starter taken into the workspace the platform made for the org, which publishes it at once. */
const COPY = { ...TAKEN, status: 'building', repo: { url: `https://git.hanzo.ai/${ORG}-code/synapse.git`, branch: 'main' } }

const WHY = 'coding: the build exited 1: missing script: build'
const MERGE = `/v1/agent/coding/${CART}/merge`
/** What the open run pushed, with its pull request `state`. */
const PUSHED = (state: string, mergeable = true) => ({
  repo: `${ORG}/shop`,
  base: 'main',
  head: 'agent/cart',
  commits: [],
  files: [],
  pull: { number: 4, url: PR, title: 'Add a cart', state, mergeable, reviews: [] },
})

const STARTERS = [{ slug: 'synapse', title: 'Synapse', category: 'Landing', source: 'https://github.com/hanzo-apps/template-synapse', demo: DEMO }]

const RUNS = () => [
  { id: CART, title: 'Add a cart', status: 'done', kind: 'coding', repo: `${ORG}/shop`, project: 'shop', branch: 'agent/cart', pr: PR },
  { id: UNTITLED, title: '', status: 'error', kind: 'coding', repo: 'shop', project: 'shop', branch: 'agent/broke' },
  { id: HALTED, title: 'Tidy the header', status: 'stopped', kind: 'coding', repo: `${ORG}/shop`, project: 'shop' },
  // Moved into this project, but it worked on another codebase: not shown here.
  { id: ELSEWHERE, title: 'Elsewhere', status: 'done', kind: 'coding', repo: `${ORG}/other`, project: 'shop' },
]

const EVENTS = () => ({
  [CART]: [
    ev(CART, 1, 'status', { status: 'started', branch: 'agent/cart' }),
    ev(CART, 2, 'tool-call', { step: 'clone', message: 'cloning the codebase', status: 'running' }),
    ev(CART, 3, 'log', { message: 'Added a cart to the header.' }),
    // A step with nothing to say is left out.
    ev(CART, 4, 'tool-call', { step: '' }),
    ev(CART, 5, 'status', { status: 'done', changed: true, branch: 'agent/cart' }),
  ],
  [UNTITLED]: [{ ...ev(UNTITLED, 0, 'log', { message: 'Recorded without a place in line.' }), id: 'loose' }, ev(UNTITLED, 2, 'status', { status: 'error', error: 'The build hit an error in cart.js' })],
  [HALTED]: [],
  [NEXT]: [ev(NEXT, 1, 'status', { status: 'started', branch: 'agent/blue' }), ev(NEXT, 2, 'log', { message: 'Making it blue.' })],
})

/**
 * The deployed page, taking part in the bridge: it says it is ready, forwards
 * its console, and when picking is switched on reports a hover and a pick.
 */
const PAGE = (origin: string, title: string) => `<!doctype html><title>${title}</title><h1 style="font:24px sans-serif">${title}</h1>
<script>
  const send = (m) => parent.postMessage(m, ${JSON.stringify(origin)})
  addEventListener('message', (e) => {
    if (e.data && e.data.type === 'preview:editable' && e.data.active) {
      send({ type: 'preview:hover', selector: null })
      send({ type: 'preview:select', info: { selector: 'body > h1', tag: 'h1', html: '<h1>${title}</h1>' } })
    }
  })
  send({ type: 'preview:ready' })
  send({ type: 'preview:console', level: 'warn', text: 'the ${title} page warned' })
</script>`

/** The platform one workspace talks to, holding `world`. */
async function studio(page: Page, seed: Partial<World> = {}, who?: Who) {
  const world: World = {
    projects: PROJECTS(),
    runs: RUNS(),
    events: EVENTS(),
    accepts: true,
    files: {
      'index.html': { content: '<h1>Shop</h1>\n' },
      'src/cart.js': { content: 'export const cart = []\n' },
      'logo.png': { binary: true },
      'data.json': { truncated: true },
    },
    deployments: {},
    changes: {},
    declared: { build: { id: 'b9', status: 'queued' }, declaration: { mode: 'branch', review: '' } },
    builds: [],
    site: 'Shop',
    served: 0,
    holds: {},
    down: {},
    slow: {},
    ...seed,
  }
  const answer = ({ method, path, query, body }: Sent): Reply | undefined => {
    const q = new URLSearchParams(query)
    if (path === '/v1/projects') return { json: world.projects }
    if (path === '/v1/templates') return { json: { data: STARTERS } }
    if (path === '/v1/agent/sessions') return { json: { sessions: world.runs.filter((r) => r.project === q.get('project')), next: '' } }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    const session = path.match(/^\/v1\/agent\/sessions\/(sess_[0-9a-f]{32})(?:\/(message|stop))?$/)
    if (session?.[2]) return { json: { command: session[2] } }
    if (session) return { json: { ...world.runs.find((r) => r.id === session[1]), recentEvents: world.events[session[1]!] ?? [] } }
    if (path === '/v1/agent/coding' && method === 'POST') {
      world.runs.unshift({ id: NEXT, title: 'Make it blue', status: 'running', kind: 'coding', repo: `${ORG}/shop`, project: 'shop', branch: 'agent/blue' })
      return { status: 202, json: { sessionId: NEXT, repo: 'shop', branch: 'agent/blue', project: 'shop' } }
    }
    if (path === '/v1/event') return { json: { accepted: world.accepts ? 1 : 0 } }
    if (path === '/v1/git/repos/shop/tree') {
      const dir = q.get('path') ?? ''
      if (dir === 'src') return { json: { entries: [{ name: 'cart.js', path: 'src/cart.js', type: 'blob', size: 24 }] } }
      return {
        json: {
          entries: [
            { name: 'src', path: 'src', type: 'tree' },
            { name: 'index.html', path: 'index.html', type: 'blob', size: 14 },
            { name: 'about.html', path: 'about.html', type: 'blob', size: 90 },
            { name: 'logo.png', path: 'logo.png', type: 'blob', size: 2048 },
            { name: 'data.json', path: 'data.json', type: 'blob', size: 2_000_000 },
            { name: 'README.md', path: 'README.md', type: 'blob', size: 10 },
          ],
        },
      }
    }
    if (path === '/v1/git/repos/shop/blob') {
      const at = q.get('path') ?? ''
      const f = world.files[at]
      if (!f) return { status: 404, json: { status: 404, detail: `${at} is not on ${q.get('ref')}` } }
      return { json: { path: at, content: f.content ?? '', binary: f.binary === true, truncated: f.truncated === true, size: 1 } }
    }
    if (path === '/v1/platform/apps') return { status: 202, json: world.declared }
    if (path === '/v1/platform/builds') return { json: { builds: world.builds } }
    const deployed = path.match(/^\/v1\/projects\/([^/]+)\/deployments$/)
    if (deployed) return { json: world.deployments[deployed[1]!] ?? [] }
    const coding = path.match(/^\/v1\/agent\/coding\/(sess_[0-9a-f]{32})\/(changes|merge)$/)
    if (coding?.[2] === 'changes') return { json: world.changes[coding[1]!] ?? { pull: null } }
    if (coding?.[2] === 'merge') {
      const was = world.changes[coding[1]!]!
      const pull: Record<string, unknown> = { ...(was.pull as Record<string, unknown>), state: 'merged' }
      world.changes[coding[1]!] = { ...was, pull }
      return { json: { number: pull.number, url: pull.url, state: 'merged', base: 'main' } }
    }
    if (path === '/v1/audio/transcriptions') return { json: { text: 'in blue' } }
    void body
    return undefined
  }
  const sent = await enter(page, held(world, answer), who)
  // The deployed site: About at /about.html, the shop's front page anywhere else.
  await page.route(`${LIVE}/**`, (r) => {
    world.served += 1
    const title = new URL(r.request().url()).pathname === '/about.html' ? 'About' : world.site
    return r.fulfill({ contentType: 'text/html', body: PAGE(new URL(page.url()).origin, title) })
  })
  return { sent, world }
}

const posted = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)
const reads = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'GET' && s.path === path).length
const box = (page: Page) => page.getByRole('textbox', { name: 'Ask Hanzo for edits' })

test.describe('the workspace', () => {
  test('its runs are the conversation: each says how it went, the open one its steps and pull request, and History opens any', async ({ page }, info) => {
    const { sent } = await studio(page)
    await page.goto('/shop')
    const chat = page.getByRole('region', { name: 'Chat' })
    await expect(chat.getByText('Added a cart to the header.')).toBeVisible()
    await expect(chat.getByText('Done.')).toBeVisible()
    await expect(chat.getByText('This run hit an error.')).toBeVisible()
    await expect(chat.getByText('Stopped.')).toBeVisible()
    await expect(chat.getByText('Untitled run')).toBeVisible()
    await expect(chat.getByText('Elsewhere')).toHaveCount(0)
    await expect(chat.getByRole('link', { name: 'Open pull request #4' })).toHaveAttribute('href', PR)
    await page.screenshot({ path: info.outputPath('workspace.png') })

    // Another run's steps, and its console with the error it hit.
    // The conversation runs oldest first: the stopped run, the one that erred, then the open one.
    await chat.getByText('Show steps').nth(1).click()
    await expect(chat.getByText('The build hit an error in cart.js')).toBeVisible()
    const dock = page.getByRole('region', { name: 'Console' })
    if (await dock.getByRole('button', { name: 'Expand console' }).isVisible()) await dock.getByRole('button', { name: 'Expand console' }).click()
    await expect(dock.locator('[data-level="error"]')).toContainText('The build hit an error in cart.js')
    await expect(dock.getByText('Recorded without a place in line.')).toBeVisible()

    await page.getByRole('button', { name: 'History' }).click()
    const history = page.getByRole('dialog')
    await expect(history.getByText('Runs on Shop')).toBeVisible()
    await expect(history.getByRole('button')).toContainText(['Add a cart', 'Untitled run', 'Tidy the header'])
    await history.getByRole('button', { name: /Tidy the header/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(chat.getByText('Show steps')).toHaveCount(2)
    expect(sent.map((s) => s.path)).toContain(`/v1/agent/sessions/${HALTED}`)
  })

  test('a verdict is recorded on the bus, taken back when it is not, and cleared by pressing it again', async ({ page }) => {
    const { sent, world } = await studio(page)
    await page.goto('/shop')
    const good = page.getByRole('button', { name: 'Good result' })
    await good.first().click()
    await expect(good.first()).toHaveAttribute('aria-pressed', 'true')
    await good.first().click()
    await expect(good.first()).toHaveAttribute('aria-pressed', 'false')
    world.accepts = false
    await page.getByRole('button', { name: 'Bad result' }).nth(1).click()
    await expect(page.getByText('The verdict was not recorded')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Bad result' }).nth(1)).toHaveAttribute('aria-pressed', 'false')
    expect(posted(sent, '/v1/event').map((s) => s.body)).toEqual([
      { type: 'track', event: 'build.verdict', sessionId: HALTED, properties: { verdict: 'up', project: 'shop' } },
      { type: 'track', event: 'build.verdict', sessionId: HALTED, properties: { verdict: 'cleared', project: 'shop' } },
      { type: 'track', event: 'build.verdict', sessionId: UNTITLED, properties: { verdict: 'down', project: 'shop' } },
    ])
  })

  test('an ask starts the next run from the open one, with a picked element and a file; that run is steered and stopped', async ({ page }, info) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext()
        const tone = ctx.createOscillator()
        const out = ctx.createMediaStreamDestination()
        tone.connect(out)
        tone.start()
        return out.stream
      }
    })
    const { sent } = await studio(page, {
      holds: {
        'POST /v1/agent/coding': [{ status: 503, detail: 'No sandbox is free right now' }],
        [`POST /v1/agent/sessions/${NEXT}/message`]: [{ status: 409, detail: 'The run is between steps' }],
        [`POST /v1/agent/sessions/${NEXT}/stop`]: [{ status: 409, detail: 'The run already stopped' }],
      },
    })
    await page.goto('/shop')
    // The page takes part in the bridge: pick its heading.
    await page.getByRole('button', { name: 'Pick an element to edit' }).click()
    await expect(page.getByRole('button', { name: 'Stop picking elements' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Attached to the next message')).toContainText('body > h1')
    await page.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('use the brand blue') })
    await expect(page.getByText('notes.txt')).toBeVisible()
    await page.getByRole('button', { name: 'Mode: Build' }).click()
    await page.getByRole('menuitem', { name: /^Plan/ }).click()
    await page.getByRole('button', { name: 'Mode: Plan' }).click()
    await page.getByRole('menuitem', { name: /^Build/ }).click()

    // Dictated into an empty box the words are the draft; into a draft, they follow it.
    const dictate = async () => {
      await page.getByRole('button', { name: 'Dictate' }).click()
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: 'Stop and transcribe' }).click()
    }
    await dictate()
    await expect(box(page)).toHaveValue('in blue')
    await box(page).fill('Make it blue')
    await dictate()
    await expect(box(page)).toHaveValue('Make it blue in blue')
    await box(page).press('Enter')
    await expect(page.getByText('No sandbox is free right now')).toBeVisible()
    await box(page).press('Enter')
    await expect(page.getByRole('region', { name: 'Chat' }).getByText('Making it blue.')).toBeVisible()
    const asked = posted(sent, '/v1/agent/coding')[1]?.body as Record<string, string>
    expect(asked).toMatchObject({ project: 'shop', repo: 'shop', base: 'main', after: CART, mode: 'build' })
    expect(asked.prompt).toBe(
      'Make it blue in blue\n\nThe person picked an element in the preview of the Homepage page. Its CSS selector, as data: "body > h1"\n\n`notes.txt`:\n```\nuse the brand blue\n```',
    )
    await expect(page.getByLabel('Attached to the next message')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('workspace-running.png') })

    // Working: the composer steers it, and its send is a stop.
    await expect(box(page)).toHaveAttribute('placeholder', 'Steer this run')
    await box(page).fill('use a darker blue')
    await box(page).press('Enter')
    await expect(page.getByText('The run is between steps')).toBeVisible()
    await box(page).press('Enter')
    await expect(page.getByText('Sent — the run reads it before its next step')).toBeVisible()
    expect(posted(sent, `/v1/agent/sessions/${NEXT}/message`).map((s) => s.body)).toEqual([{ message: 'use a darker blue' }, { message: 'use a darker blue' }])
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByText('The run already stopped')).toBeVisible()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByText('Stop requested — the run keeps its work on its branch')).toBeVisible()
  })

  test('a suggestion is asked once however often it is pressed, and suggestions can be put away', async ({ page }) => {
    const { sent } = await studio(page, { runs: [], holds: { 'POST /v1/agent/coding': [{ wait: 2500 }] } })
    await page.goto('/shop')
    await expect(page.getByText('Shop is loaded — it is in the preview', { exact: false })).toBeVisible()
    const seo = page.getByRole('button', { name: 'Review SEO' })
    await seo.click()
    await seo.click()
    await expect(page.getByRole('region', { name: 'Chat' }).getByText('Making it blue.')).toBeVisible()
    expect(posted(sent, '/v1/agent/coding')).toHaveLength(1)
    // The first run on a project follows nothing.
    expect(posted(sent, '/v1/agent/coding')[0]?.body).toEqual({ prompt: 'Review SEO', project: 'shop', repo: 'shop', base: 'main', mode: 'build', desktop: true })
  })

  test('the page’s bridge follows its links and forwards its console; the device, reload and page picker drive the preview', async ({ page }, info) => {
    const { sent } = await studio(page)
    await page.goto('/shop')
    const frame = page.frameLocator('iframe[title="Shop preview"]')
    await expect(frame.getByRole('heading', { name: 'Shop' })).toBeVisible()
    const dock = page.getByRole('region', { name: 'Console' })
    if (await dock.getByRole('button', { name: 'Expand console' }).isVisible()) await dock.getByRole('button', { name: 'Expand console' }).click()
    await expect(dock.getByText('the Shop page warned')).toBeVisible()
    await dock.getByRole('button', { name: 'Clear console' }).click()
    await expect(dock.getByText('the Shop page warned')).toHaveCount(0)

    // Picking on, then a reload: the new document is opened to picking again.
    await page.getByRole('button', { name: 'Pick an element to edit' }).click()
    await expect(page.getByLabel('Attached to the next message')).toBeVisible()
    await page.getByRole('tab', { name: 'Layers' }).click()
    await expect(page.getByText('body > h1 — body > h1')).toBeVisible()
    await page.getByRole('tab', { name: 'Preview' }).click()
    await page.getByRole('button', { name: 'Remove body > h1' }).click()
    await expect(page.getByLabel('Attached to the next message')).toHaveCount(0)
    await page.getByRole('button', { name: 'Reload the preview' }).click()
    await expect(page.getByLabel('Attached to the next message')).toContainText('body > h1')
    await page.getByRole('button', { name: 'Stop picking elements' }).click()
    await expect(page.getByRole('button', { name: 'Pick an element to edit' })).toHaveAttribute('aria-pressed', 'false')

    // The page's own link, kept as a path and query on the live site.
    const live = page.frames().find((f) => f.url().startsWith(LIVE))!
    await live.evaluate((origin) => parent.postMessage({ type: 'preview:navigate', path: '/about.html?from=nav#top' }, origin), new URL(page.url()).origin)
    await expect(page.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', `${LIVE}/about.html?from=nav`)
    await expect(page.getByRole('button', { name: 'Page: Homepage' })).toBeVisible()
    await page.getByRole('button', { name: /^Page: / }).click()
    await page.getByRole('menuitem', { name: 'about' }).click()
    await expect(page.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', `${LIVE}/about.html`)
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'About' })).toBeVisible()

    await page.getByRole('tab', { name: 'Mobile' }).click()
    await expect(page.locator('[data-device="mobile"]')).toBeVisible()
    await page.screenshot({ path: info.outputPath('workspace-mobile.png') })

    // An element picked on About is named with that page.
    await page.getByRole('button', { name: 'Pick an element to edit' }).click()
    await box(page).fill('Bigger')
    await box(page).press('Enter')
    await expect.poll(() => posted(sent, '/v1/agent/coding').length).toBe(1)
    expect((posted(sent, '/v1/agent/coding')[0]?.body as { prompt: string }).prompt).toContain('in the preview of the about page')
  })

  test('a page the bridge moved to that the picker does not list is not named', async ({ page }) => {
    const { sent } = await studio(page)
    await page.goto('/shop')
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    const live = page.frames().find((f) => f.url().startsWith(LIVE))!
    await live.evaluate((origin) => parent.postMessage({ type: 'preview:navigate', path: '/contact' }, origin), new URL(page.url()).origin)
    await expect(page.getByRole('link', { name: 'Open in a new tab' })).toHaveAttribute('href', `${LIVE}/contact`)
    await page.getByRole('button', { name: 'Pick an element to edit' }).click()
    await box(page).fill('Bigger')
    await box(page).press('Enter')
    await expect.poll(() => posted(sent, '/v1/agent/coding').length).toBe(1)
    expect((posted(sent, '/v1/agent/coding')[0]?.body as { prompt: string }).prompt).toContain('The person picked an element in the preview. Its CSS selector')
  })

  test('Files reads the open run’s branch, and Code opens each file read-only, saying why one cannot be shown', async ({ page }, info) => {
    const { sent } = await studio(page)
    await page.goto('/shop')
    await page.getByRole('button', { name: 'Hide suggestions' }).click()
    await expect(page.getByRole('button', { name: 'Review SEO' })).toHaveCount(0)
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    await page.getByRole('tab', { name: 'Layers' }).click()
    await expect(page.getByText('Pick an element in the preview to see it here and attach it to your next ask.')).toBeVisible()
    await page.getByRole('tab', { name: 'Files' }).click()
    const tree = page.getByLabel('shop at agent/cart')
    await tree.getByText('src', { exact: true }).click()
    await expect(tree.getByText('cart.js')).toBeVisible()
    await tree.getByText('index.html').click()
    await expect(page.getByRole('tab', { name: 'index.html' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel', { name: 'index.html' })).toContainText('<h1>Shop</h1>')
    for (const [name, says] of [
      ['logo.png', 'A binary file — nothing to show as text.'],
      ['data.json', 'Past the 1 MiB view cap — clone the repository to read it.'],
      ['README.md', 'README.md is not on agent/cart'],
    ] as const) {
      await page.getByRole('tab', { name: 'Files' }).click()
      await tree.getByText(name).click()
      await expect(page.getByRole('tabpanel', { name })).toContainText(says)
    }
    await page.screenshot({ path: info.outputPath('workspace-code.png') })
    // Opened again, it is the tab already there.
    await page.getByRole('tab', { name: 'Files' }).click()
    await tree.getByText('index.html').click()
    await expect(page.getByRole('tablist', { name: 'Open files' }).getByRole('tab')).toHaveCount(4)
    expect(sent.filter((s) => s.path === '/v1/git/repos/shop/blob' && s.query.includes('index.html'))).toHaveLength(1)
    // Closing another tab keeps this one open; closing this one leaves none chosen.
    await page.getByRole('tab', { name: 'logo.png' }).locator('[data-slot="file-tabs-close"]').click()
    await expect(page.getByRole('tab', { name: 'index.html' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'index.html' }).locator('[data-slot="file-tabs-close"]').click()
    await expect(page.getByRole('tablist', { name: 'Open files' }).getByRole('tab')).toHaveCount(2)
  })

  test('the bar: the chat folds away and back, projects switch, Share copies the live address or says it, and Publish adds it', async ({ page, baseURL }) => {
    const { sent } = await studio(page)
    await page.goto('/shop')
    await page.getByRole('button', { name: 'Hide the chat' }).click()
    await expect(page.getByRole('region', { name: 'Chat' })).toBeHidden()
    await page.getByRole('button', { name: 'Show the chat' }).click()
    await expect(page.getByRole('region', { name: 'Chat' })).toBeVisible()

    // A browser that refuses the clipboard is told the address; one that takes it, that it was copied.
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'))
    })
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText(`${LIVE}/`, { exact: true })).toBeVisible()
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(() => delete (navigator.clipboard as { writeText?: unknown }).writeText)
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText(`Copied ${LIVE}/`)).toBeVisible()

    await page.getByRole('button', { name: 'Publish' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Build Shop at agent/cart and declare it in a project.', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Project' })).toHaveValue('shop')
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    await expect(dialog.getByText('Build b9: queued')).toBeVisible()
    expect(posted(sent, '/v1/platform/apps')[0]?.body).toEqual({ repo: `https://git.hanzo.ai/${ORG}/shop.git`, ref: 'agent/cart', name: 'shop', partOf: 'shop', mode: 'branch' })
    await dialog.getByRole('button', { name: 'Done' }).click()

    await page.getByRole('button', { name: 'Project: Shop' }).click()
    const projects = page.getByRole('dialog')
    await expect(projects.getByText('Projects', { exact: true })).toBeVisible()
    await projects.getByRole('button', { name: 'Blog' }).click()
    await expect(page).toHaveURL(new URL('/blog', baseURL).href)
    // Blog has no repository and nothing deployed: said, and nothing to publish.
    await expect(page.getByText('Nothing deployed yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled()
    await page.getByRole('tab', { name: 'Files' }).click()
    await expect(page.getByText('This project has no repository yet. Its first run creates one.')).toBeVisible()
    await page.getByRole('tab', { name: 'Layers' }).click()
    await expect(page.getByText(/^Layers are read through the preview bridge/)).toBeVisible()
    // The preview's own controls are beside it: reloaded, a project with nothing deployed says so still, and has no page to open.
    await expect(page.getByRole('button', { name: 'Reload the preview' })).toBeHidden()
    await page.getByRole('tab', { name: 'Preview' }).click()
    await page.getByRole('button', { name: 'Reload the preview' }).click()
    await expect(page.getByText('Nothing deployed yet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open in a new tab' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText(`Copied ${new URL('/blog', baseURL).href}`)).toBeVisible()
    await page.getByRole('button', { name: 'All runs' }).click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
  })

  test('a starter taken and not yet published shows the starter’s own page, and says so', async ({ page }) => {
    await studio(page, { projects: [...PROJECTS(), TAKEN] })
    await page.route(`${DEMO}/**`, (r) => r.fulfill({ contentType: 'text/html', body: PAGE(new URL(page.url()).origin, 'Synapse') }))
    await page.goto('/synapse')
    await expect(page.getByText('Synapse is loaded — the preview shows the Synapse starter until your copy is published.', { exact: false })).toBeVisible()
    await expect(page.locator('iframe')).toHaveAttribute('src', `${DEMO}/`)
    await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Synapse' })).toBeVisible()
    await expect(page.getByText('Nothing deployed yet')).toHaveCount(0)
  })

  test('says it is reading the runs; a refused project list still opens the workspace by its address', async ({ page }) => {
    const { world } = await studio(page, { slow: { 'GET /v1/agent/sessions': 3000 } })
    await page.goto('/shop')
    await expect(page.getByText('Reading this project’s runs…')).toBeVisible()
    await expect(page.getByText('Added a cart to the header.')).toBeVisible()
    world.slow = {}
    world.down['GET /v1/projects'] = 'Projects are resting'
    await page.getByRole('button', { name: 'All runs' }).click()
    await via(page, 'Artifacts')
    await expect(page.getByText('Projects are resting')).toBeVisible()
    // Back to the workspace, the way the browser goes back: its list refused, it is drawn by its
    // address, with every run filed under it.
    await page.goBack()
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Project: shop' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Chat' }).getByText('Elsewhere')).toBeVisible()
    await expect(page.locator('iframe')).toHaveCount(0)
    // And with no runs, it says what it is.
    world.runs = []
    await page.getByRole('button', { name: 'All runs' }).click()
    await expect(page.getByRole('button', { name: 'Project: shop' })).toHaveCount(0)
    await page.goBack()
    await expect(page.getByText('shop is loaded. Say what to change and it gets built.')).toBeVisible()
  })

  test('someone in no organization is told there is no such project', async ({ page }) => {
    await studio(page, { projects: [] }, { sub: 'solo/sam', name: 'Sam', email: 'sam@solo.test', orgs: [] })
    await page.goto('/shop')
    await expect(page.getByText('There is no project named shop.')).toBeVisible()
  })

  test('a visitor is asked to sign in', async ({ page }) => {
    await mounted(page, { path: 'shop', org: null, admin: false, person: null, signIn: true })
    await expect(page.getByText('Sign in to open this project.')).toBeVisible()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect.poll(() => went(page)).toContain('sign in')
  })

  test('on a phone the chat and the work take turns', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await studio(page)
    await page.goto('/shop')
    await expect(box(page)).toBeVisible()
    await page.getByRole('tab', { name: 'Files' }).click()
    await expect(box(page)).toBeHidden()
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(box(page)).toBeVisible()
  })
})

/** A box on the page, or a failure naming what was not drawn. */
async function drawn(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox({ timeout: 5000 })
  if (!b) throw new Error(`${selector} is not drawn`)
  return b
}

/** The chat's width, the work's, and the framed page's, as drawn. */
async function measured(page: Page) {
  const [chat, work, frame, iframe] = await Promise.all([
    drawn(page, '[data-slot="workspace-chat"]'),
    drawn(page, '[data-slot="workspace-main"]'),
    drawn(page, '[data-slot="preview-frame"]'),
    drawn(page, 'iframe[title="Shop preview"]'),
  ])
  return { chat, work, frame, iframe }
}

test.describe('the split and the preview', () => {
  test('the edge between the chat and the work sizes the chat: dragged, keyed, kept across a reload, and reset by a double-click', async ({ page }, info) => {
    await studio(page)
    await page.goto('/shop')
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    const edge = page.getByRole('separator', { name: 'Resize the chat' })
    await expect(edge).toHaveAttribute('aria-orientation', 'vertical')
    await expect(edge).toHaveAttribute('aria-valuenow', '360')
    await expect(edge).toHaveAttribute('aria-valuemin', '300')
    await expect(edge).toHaveAttribute('aria-valuemax', '640')
    const before = await measured(page)
    expect(before.chat.width).toBe(360)

    // Dragged 120px to the right, across the framed page: the chat takes it, and the page gives it up.
    const e = (await edge.boundingBox())!
    await page.mouse.move(e.x + e.width / 2, 400)
    await page.mouse.down()
    for (let x = 10; x <= 120; x += 10) await page.mouse.move(e.x + e.width / 2 + x, 400)
    await page.mouse.up()
    await expect(edge).toHaveAttribute('aria-valuenow', '480')
    const after = await measured(page)
    expect(after.chat.width).toBe(480)
    expect(after.work.x - before.work.x).toBe(120)
    expect(before.work.width - after.work.width).toBe(120)
    // The framed page fills the work, beside the chat and under the bar, however wide.
    expect(after.frame.x).toBe(after.work.x)
    expect(after.frame.width).toBe(after.work.width)
    expect(after.iframe.width).toBeGreaterThan(after.frame.width - 4)
    await page.screenshot({ path: info.outputPath('split-dragged.png') })

    // Kept across a load.
    await page.reload()
    await expect(page.getByRole('separator', { name: 'Resize the chat' })).toHaveAttribute('aria-valuenow', '480')
    expect((await drawn(page, '[data-slot="workspace-chat"]')).width).toBe(480)

    // The keys a separator answers: 8px a step, 32 with Shift, the floor and the ceiling.
    await edge.focus()
    await edge.press('ArrowLeft')
    await edge.press('ArrowLeft')
    await expect(edge).toHaveAttribute('aria-valuenow', '464')
    await edge.press('Shift+ArrowRight')
    await expect(edge).toHaveAttribute('aria-valuenow', '496')
    await edge.press('Home')
    await expect(edge).toHaveAttribute('aria-valuenow', '300')
    await edge.press('ArrowLeft')
    await expect(edge).toHaveAttribute('aria-valuenow', '300')
    await edge.press('End')
    await expect(edge).toHaveAttribute('aria-valuenow', '640')
    expect((await drawn(page, '[data-slot="workspace-chat"]')).width).toBe(640)

    // A drag past either bound stops at it.
    const far = (await edge.boundingBox())!
    await page.mouse.move(far.x + far.width / 2, 400)
    await page.mouse.down()
    await page.mouse.move(far.x - 600, 400, { steps: 8 })
    await page.mouse.up()
    await expect(edge).toHaveAttribute('aria-valuenow', '300')

    // A double-click puts it back.
    await edge.dblclick()
    await expect(edge).toHaveAttribute('aria-valuenow', '360')
    expect((await drawn(page, '[data-slot="workspace-chat"]')).width).toBe(360)
    expect(await page.evaluate(() => localStorage.getItem('hanzo.build.split'))).toBe('360')
  })

  test('the work keeps its room in a narrow window, and the edge is gone with the chat and on a phone', async ({ page }) => {
    await studio(page)
    await page.addInitScript(() => localStorage.setItem('hanzo.build.split', '640'))
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/shop')
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    const edge = page.getByRole('separator', { name: 'Resize the chat' })
    // 640 asked for; 1024 leaves the chat 600 and the work its 400.
    await expect(edge).toHaveAttribute('aria-valuemax', '600')
    await expect(edge).toHaveAttribute('aria-valuenow', '600')
    const { chat, work } = await measured(page)
    expect(chat.width).toBe(600)
    expect(work.width).toBeGreaterThanOrEqual(400)
    // Wider again, it is what was asked for.
    await page.setViewportSize({ width: 1440, height: 800 })
    await expect(edge).toHaveAttribute('aria-valuenow', '640')

    // Hidden, the chat takes its edge with it and the work takes the width.
    await page.getByRole('button', { name: 'Hide the chat' }).click()
    await expect(edge).toHaveCount(0)
    await expect(page.locator('[data-slot="workspace-chat"]')).toBeHidden()
    expect((await drawn(page, '[data-slot="workspace-main"]')).x).toBeLessThan(8)
    await page.getByRole('button', { name: 'Show the chat' }).click()
    await expect(edge).toHaveAttribute('aria-valuenow', '640')

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(edge).toHaveCount(0)
  })

  // 800 is the workspace beside the Hanzo app's widest sidebar in a 1280 window.
  for (const width of [800, 1280, 1440, 1920]) {
    test(`at ${width} the framed page fills the work, and every control above it is whole and clear of the others`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await studio(page)
      await page.goto('/shop')
      await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
      const { chat, work, frame, iframe } = await measured(page)
      const bar = await drawn(page, '[data-slot="preview-bar"]')
      const dock = await drawn(page, '[data-slot="console"]')
      expect(work.x).toBeGreaterThanOrEqual(chat.x + chat.width)
      expect(frame.x).toBe(work.x)
      expect(frame.width).toBe(work.width)
      expect(bar.width).toBe(work.width)
      expect(frame.y).toBeGreaterThanOrEqual(bar.y + bar.height)
      expect(frame.y + frame.height).toBeLessThanOrEqual(dock.y + 1)
      expect(iframe.width).toBeGreaterThan(frame.width - 4)
      expect(iframe.height).toBeGreaterThan(frame.height - 4)
      // The page scrolls inside its frame; the window itself never scrolls.
      expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, 900])

      // Every control in the workspace's bar and the preview's is whole, inside its bar, and clear of its neighbours.
      const controls = await page.evaluate(() =>
        ['[data-slot="workspace-bar"]', '[data-slot="preview-bar"]'].flatMap((selector) => {
          const bar = document.querySelector(selector)!
          const r = bar.getBoundingClientRect()
          return [...bar.querySelectorAll('button, a[href], [role="tab"]')]
            .filter((el) => !el.parentElement?.closest('button, a[href], [role="tab"]') && el.checkVisibility())
            .map((el) => {
              const b = el.getBoundingClientRect()
              return { name: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName, l: b.left, r: b.right, t: b.top, b: b.bottom, inside: b.left >= r.left - 1 && b.right <= r.right + 1 }
            })
        }),
      )
      for (const name of ['Reload the preview', 'Page: Homepage', 'Desktop', 'Mobile', 'Open in a new tab', 'Share', 'Publish'])
        expect(controls.map((c) => c.name), `${name} is drawn`).toContain(name)
      for (const c of controls) expect(c.inside, `${c.name} is inside its bar`).toBe(true)
      for (const a of controls)
        for (const b of controls)
          if (a !== b) expect(a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5, `${a.name} and ${b.name} overlap`).toBe(true)
      await page.screenshot({ path: info.outputPath(`preview-${width}.png`) })
    })
  }

  test('the preview stays loaded while another view is open, and comes back as it was left', async ({ page }) => {
    const { world } = await studio(page)
    await page.goto('/shop')
    const frame = page.frameLocator('iframe[title="Shop preview"]')
    await expect(frame.getByRole('heading', { name: 'Shop' })).toBeVisible()
    const served = world.served
    await page.getByRole('tab', { name: 'Files' }).click()
    await expect(page.getByLabel('shop at agent/cart')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload the preview' })).toBeHidden()
    await page.getByRole('tab', { name: 'Code' }).click()
    await page.getByRole('tab', { name: 'Preview' }).click()
    await expect(frame.getByRole('heading', { name: 'Shop' })).toBeVisible()
    expect(world.served).toBe(served)
    // Reloaded, it is loaded again, once.
    await page.getByRole('button', { name: 'Reload the preview' }).click()
    await expect.poll(() => world.served).toBe(served + 1)
  })

  test('Open in a new tab opens the page the preview frames, in a tab of its own', async ({ page, context }) => {
    await studio(page)
    await context.route(`${LIVE}/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Shop</title><h1>Shop</h1>' }))
    await page.goto('/shop')
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    const opened = context.waitForEvent('page')
    await page.getByRole('link', { name: 'Open in a new tab' }).click()
    const tab = await opened
    await tab.waitForLoadState()
    expect(tab.url()).toBe(`${LIVE}/`)
    await expect(tab.getByRole('heading', { name: 'Shop' })).toBeVisible()
    // Nothing of the builder's reaches it.
    expect(await tab.evaluate(() => window.opener)).toBeNull()
    await tab.close()
  })
})

test.describe('publishing and merging', () => {
  test('a copy being published says so, frames nothing, and is read again until its build fails, which its latest deployment says why', async ({ page }) => {
    const { sent, world } = await studio(page, { projects: [...PROJECTS(), COPY] })
    await page.goto('/synapse')
    await expect(page.getByText('Publishing your copy…')).toBeVisible()
    await expect(page.getByText('Its page appears here when the build finishes.')).toBeVisible()
    await expect(page.getByText('Synapse is being published — it appears in the preview when its build finishes.', { exact: false })).toBeVisible()
    // Not even the starter's own page: what is coming is the copy.
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.getByText('Nothing deployed yet')).toHaveCount(0)
    expect(sent.some((s) => s.path === '/v1/templates')).toBe(false)

    world.deployments.synapse = [
      { id: 'dep_1', version: 1, status: 'error', message: 'an older failure', createdAt: 1, updatedAt: 2 },
      { id: 'dep_2', version: 2, status: 'error', source: 'build', message: WHY, createdAt: 3, updatedAt: 4 },
    ]
    world.projects = [...PROJECTS(), { ...COPY, status: 'error', updatedAt: 4 }]
    await expect(page.getByText('Publishing failed')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(WHY)).toBeVisible()
    await expect(page.getByText('an older failure')).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.getByText('Synapse is loaded and nothing is published yet.', { exact: false })).toBeVisible()
    // Ended, it is not read again.
    const was = reads(sent, '/v1/projects')
    await page.waitForTimeout(6000)
    expect(reads(sent, '/v1/projects')).toBe(was)
  })

  test('a failed build with nothing to say says so, a refused read of why says that, and a project that is not a copy is only publishing', async ({ page }) => {
    const failed = { ...COPY, status: 'error' }
    const blog = { ...PROJECTS()[1], status: 'building' }
    const { world } = await studio(page, { projects: [PROJECTS()[0]!, blog, failed], deployments: { synapse: [] } })
    await page.goto('/synapse')
    await expect(page.getByText('Its build ended without saying why.')).toBeVisible()
    await page.getByRole('button', { name: 'Project: Synapse' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Blog' }).click()
    await expect(page.getByText('Publishing…', { exact: true })).toBeVisible()
    world.down['GET /v1/projects/synapse/deployments'] = 'Deployments are resting'
    await page.getByRole('button', { name: 'Project: Blog' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Synapse' }).click()
    await expect(page.getByText('Deployments are resting')).toBeVisible()
  })

  test('Publish of a repository in the org’s own workspace says it goes live with no review or ship, and loads the preview again once built', async ({ page }) => {
    const notice = "Building shop from agent/cart in a sandbox; it goes live at the project's address when the build finishes."
    const { sent, world } = await studio(page, {
      declared: {
        app: { name: 'shop', org: ORG, partOf: 'shop', hosts: [] },
        build: { id: 'dep_7', status: 'building', repo: `https://git.hanzo.ai/${ORG}/shop.git`, ref: 'agent/cart' },
        declaration: { mode: 'commit', ref: 'agent/cart', created: false, changed: false, live: true },
        notice,
      },
      builds: [{ id: 'dep_7', repo: `https://git.hanzo.ai/${ORG}/shop.git`, commit: 'abc1234', status: 'building', startedAt: '2026-09-28T10:00:00Z' }],
    })
    await page.goto('/shop')
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    await page.getByRole('button', { name: 'Publish' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    await expect(dialog.getByText(notice)).toBeVisible()
    await expect(dialog.getByText('Build Shop at agent/cart and publish it at its project’s address.')).toBeVisible()
    await expect(dialog.getByText('Build dep_7: building')).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Open the review' })).toHaveCount(0)
    // An admin, and still nothing to take to main: the build is the release.
    await expect(dialog.getByRole('button', { name: /Ship to main|Waiting for the build/ })).toHaveCount(0)

    const was = reads(sent, '/v1/projects')
    world.site = 'Shop, published'
    world.builds = [{ ...world.builds[0], status: 'succeeded', duration: '41s' }]
    await expect(dialog.getByText('Build dep_7 succeeded — it is live at the project’s address.')).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => reads(sent, '/v1/projects')).toBeGreaterThan(was)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop, published' })).toBeVisible()
  })

  test('a run that published what it pushed says so, and the preview is loaded again once', async ({ page }) => {
    const { sent, world } = await studio(page, { runs: [{ ...RUNS()[0]!, status: 'running' }], events: { [CART]: EVENTS()[CART]!.slice(0, 3) } })
    await page.goto('/shop')
    const chat = page.getByRole('region', { name: 'Chat' })
    await expect(chat.getByText('Added a cart to the header.')).toBeVisible()
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    const was = reads(sent, '/v1/projects')
    world.site = 'Shop with a cart'
    world.runs[0]!.status = 'done'
    world.events[CART]!.push(ev(CART, 5, 'status', { status: 'done', changed: true, branch: 'agent/cart', pr: '#4', live: LIVE }))
    await expect(chat.getByText('Pushed agent/cart — #4 — published')).toBeVisible()
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop with a cart' })).toBeVisible()
    expect(reads(sent, '/v1/projects')).toBeGreaterThan(was)
    // The run is read again every second; the status it already said is not news.
    world.site = 'Shop, reloaded again'
    await page.waitForTimeout(2500)
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop with a cart' })).toBeVisible()
  })

  test('a run that could not publish what it pushed says why, and leaves the preview as it is', async ({ page }) => {
    const { sent, world } = await studio(page, { runs: [{ ...RUNS()[0]!, status: 'running' }], events: { [CART]: EVENTS()[CART]!.slice(0, 3) } })
    await page.goto('/shop')
    const chat = page.getByRole('region', { name: 'Chat' })
    await expect(page.frameLocator('iframe[title="Shop preview"]').getByRole('heading', { name: 'Shop' })).toBeVisible()
    const served = world.served
    const was = reads(sent, '/v1/projects')
    world.runs[0]!.status = 'done'
    world.events[CART]!.push(ev(CART, 5, 'status', { status: 'done', changed: true, branch: 'agent/cart', unpublished: WHY }))
    await expect(chat.getByText(`Pushed agent/cart — not published: ${WHY}`)).toBeVisible()
    expect(world.served).toBe(served)
    expect(reads(sent, '/v1/projects')).toBe(was)
  })

  test('Merge lands the open run’s pull request once however often it is pressed, and Files is read again', async ({ page }) => {
    const { sent } = await studio(page, { changes: { [CART]: PUSHED('open') }, holds: { [`POST ${MERGE}`]: [{ wait: 2500 }] } })
    await page.goto('/shop')
    await page.getByRole('tab', { name: 'Files' }).click()
    await expect(page.getByLabel('shop at agent/cart').getByText('index.html')).toBeVisible()
    const trees = reads(sent, '/v1/git/repos/shop/tree')
    const chat = page.getByRole('region', { name: 'Chat' })
    await chat.getByRole('button', { name: 'Merge', exact: true }).click()
    await expect(chat.getByRole('button', { name: 'Merging…' })).toBeVisible()
    await chat.getByRole('button', { name: 'Merging…' }).click()
    await expect(chat.getByText('Merged into main')).toBeVisible()
    await expect(chat.getByRole('button', { name: /^Merg/ })).toHaveCount(0)
    await expect(chat.getByRole('link', { name: 'Open pull request #4' })).toBeVisible()
    expect(posted(sent, MERGE)).toEqual([expect.objectContaining({ body: {} })])
    await expect.poll(() => reads(sent, '/v1/git/repos/shop/tree')).toBeGreaterThan(trees)
    await expect(page.getByLabel('shop at agent/cart').getByText('index.html')).toBeVisible()
  })

  test('a refused merge says the forge’s reason and Merge stays; a pull request that is not open offers none', async ({ page }) => {
    const why = "coding: the run's branch conflicts with main; ask a run to bring it up to date"
    const { sent, world } = await studio(page, { changes: { [CART]: PUSHED('open', false) }, holds: { [`POST ${MERGE}`]: [{ status: 409, detail: why }] } })
    await page.goto('/shop')
    const chat = page.getByRole('region', { name: 'Chat' })
    await chat.getByRole('button', { name: 'Merge', exact: true }).click()
    await expect(chat.getByText(why)).toBeVisible()
    await expect(chat.getByRole('button', { name: 'Merge', exact: true })).toBeVisible()
    await chat.getByRole('button', { name: 'Merge', exact: true }).click()
    await expect(chat.getByText('Merged into main')).toBeVisible()
    await expect(chat.getByText(why)).toHaveCount(0)
    expect(posted(sent, MERGE)).toHaveLength(2)

    // Another run's pull request, closed: its link, and nothing to merge.
    world.changes[UNTITLED] = { ...PUSHED('closed'), pull: { ...PUSHED('closed').pull, url: `https://git.hanzo.ai/${ORG}/shop/pulls/5` } }
    world.runs[1] = { ...world.runs[1], repo: `${ORG}/shop`, pr: `https://git.hanzo.ai/${ORG}/shop/pulls/5` }
    await page.getByRole('button', { name: 'History' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Untitled run/ }).click()
    await expect(chat.getByRole('link', { name: 'Open pull request #5' })).toBeVisible()
    await expect.poll(() => reads(sent, `/v1/agent/coding/${UNTITLED}/changes`)).toBeGreaterThan(0)
    await expect(chat.getByRole('button', { name: /^Merg/ })).toHaveCount(0)
  })
})
