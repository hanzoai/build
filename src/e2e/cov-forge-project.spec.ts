/**
 * A project's workspace: its runs as a conversation, asking, steering and
 * stopping, verdicts, the preview and the page's own bridge, Files and Code at
 * the run's branch, Layers, the bar, the dock, history, the project switcher,
 * Share and Publish — against a platform that answers each call the way a test
 * says. One document per test (cov-forge.spec.ts says why).
 */
import type { Page } from '@playwright/test'

import { enter, held, via, type Holds, type Reply, type Sent, type Who } from './cov-forge.ts'
import { expect, test } from './fixture.ts'
import { ORG } from './signed.ts'

const id = (c: string) => `sess_${c.repeat(32)}`
const CART = id('1')
const UNTITLED = id('2')
const HALTED = id('3')
const ELSEWHERE = id('4')
const NEXT = id('5')
const LIVE = 'https://shop.hanzo.app'
const PR = `https://git.hanzo.ai/${ORG}/shop/pulls/4`

const ev = (session: string, seq: number, kind: string, payload: unknown) => ({ id: `${session}-e${seq}`, sessionId: session, seq, kind, actor: `${ORG}/dave-1a2b`, payload, createdAt: '' })

interface World extends Holds {
  projects: Record<string, unknown>[]
  runs: Record<string, unknown>[]
  events: Record<string, Record<string, unknown>[]>
  /** Whether the event bus takes a verdict. */
  accepts: boolean
  files: Record<string, { content?: string; binary?: boolean; truncated?: boolean }>
}

const PROJECTS = () => [
  { slug: 'shop', name: 'Shop', visibility: 'private', liveUrl: LIVE, repo: { url: `https://git.hanzo.ai/${ORG}/shop.git`, branch: 'main' }, updatedAt: 3 },
  { slug: 'blog', name: 'Blog', visibility: 'public', updatedAt: 2 },
]

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
    holds: {},
    down: {},
    slow: {},
    ...seed,
  }
  const answer = ({ method, path, query, body }: Sent): Reply | undefined => {
    const q = new URLSearchParams(query)
    if (path === '/v1/projects') return { json: world.projects }
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
    if (path === '/v1/platform/apps') return { status: 202, json: { build: { id: 'b9', status: 'queued' }, declaration: { mode: 'branch', review: '' } } }
    if (path === '/v1/platform/builds') return { json: { builds: [] } }
    if (path === '/v1/audio/transcriptions') return { json: { text: 'in blue' } }
    void body
    return undefined
  }
  const sent = await enter(page, held(world, answer), who)
  // The deployed site: About at /about.html, the shop's front page anywhere else.
  await page.route(`${LIVE}/**`, (r) => {
    const title = new URL(r.request().url()).pathname === '/about.html' ? 'About' : 'Shop'
    return r.fulfill({ contentType: 'text/html', body: PAGE(new URL(page.url()).origin, title) })
  })
  return { sent, world }
}

const posted = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)
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
    await page.getByRole('button', { name: 'Reload the preview' }).click()
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText(`Copied ${new URL('/blog', baseURL).href}`)).toBeVisible()
    await page.getByRole('button', { name: 'All runs' }).click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
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
    await expect(page.getByText('shop is loaded — it is in the preview', { exact: false })).toBeVisible()
  })

  test('someone in no organization is told there is no such project', async ({ page }) => {
    await studio(page, { projects: [] }, { sub: 'solo/sam', name: 'Sam', email: 'sam@solo.test', orgs: [] })
    await page.goto('/shop')
    await expect(page.getByText('There is no project named shop.')).toBeVisible()
  })

  test('a visitor is asked to sign in', async ({ page }) => {
    await page.context().route('https://hanzo.id/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Hanzo</title>Sign in' }))
    await page.goto('/shop')
    await expect(page.getByText('Sign in to open this project.')).toBeVisible()
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Sign in' }).click()])
    expect(new URL(popup.url()).hostname).toBe('hanzo.id')
    await popup.close()
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
