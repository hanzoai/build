/**
 * A run's side pane on a stubbed platform (cov-run.ts): its desktop and shell,
 * framed from the sandbox's own pages with a fresh ticket each time — refused,
 * answered with no address, reported failed, asked to retry, silent past the
 * deadline, lied to by other windows, left before the ticket came back, and
 * asked of a suspended or retired sandbox — the sandbox bar that suspends and
 * resumes it, the Browser over what it serves, the Artifacts it left, the
 * agent's log beside the shell, the pane's menu, and what the Environment tab
 * says about a run with nothing to name.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { BOX, ev, finished, hold, rig, SESSION, tells, to } from './cov-run.ts'

const desk = (p: Page) => p.getByRole('complementary', { name: 'Run details' })
const tab = (p: Page, name: string) => desk(p).getByRole('button', { name, exact: true }).first()
const live = () => ({ ...finished(), status: 'running', sandbox: BOX })
const SCREEN = `/v1/sandbox/${BOX}/screen/ticket`
const TERM = `/v1/sandbox/${BOX}/terminal/ticket`
const screen = (p: Page) => p.frameLocator('iframe[title="The run’s desktop"]')

test('the desktop waits for a sandbox, opens only while it runs, and says an ended one is gone', async ({ page: p }) => {
  const { world, sent } = await rig(p, { record: { ...finished(), status: 'running' } })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('Starting', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('The desktop opens once the run’s sandbox is up.')).toBeVisible()
  // The run ends and its sandbox parks: looking at it does not wake it.
  world.record = { ...finished(), sandbox: BOX }
  world.held = { status: 'parked', expiresAt: 1790726400 }
  await p.reload()
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('Suspended', { exact: true })).toBeVisible()
  await p.evaluate(() => new Promise((r) => setTimeout(r, 500)))
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/resume`)).toHaveLength(0)
  expect(to(sent, 'POST', SCREEN)).toHaveLength(0)
  // Resumed from the bar, it opens.
  await desk(p).getByLabel('Sandbox').getByRole('button', { name: 'Resume' }).click()
  await expect(screen(p).getByText(/the screen \?ticket=t\d+/)).toBeVisible()
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/resume`)).toHaveLength(1)
  world.held = { status: 'gone' }
  await p.reload()
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('Ended', { exact: true })).toBeVisible()
})

test('a door asked of a sandbox that stopped as it was asked resumes it once', async ({ page: p }) => {
  const { sent } = await rig(p, { record: live() })
  let parked = true
  await p.route(
    (u) => u.pathname === SCREEN,
    (r) => {
      if (!parked) return r.fallback()
      parked = false
      return r.fulfill({ status: 409, json: { detail: 'the sandbox is parked' } })
    },
  )
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(screen(p).getByText(/the screen \?ticket=t\d+/)).toBeVisible()
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/resume`)).toHaveLength(1)
})

test('the sandbox bar suspends a kept sandbox and resumes it, and never one a run is working in', async ({ page: p }, info) => {
  const { world, sent } = await rig(p, { record: live() })
  await p.goto(`/${SESSION}`)
  const bar = desk(p).getByLabel('Sandbox')
  await expect(bar.getByText('Sandbox running')).toBeVisible()
  await expect(bar.getByRole('button', { name: 'Suspend' })).toHaveCount(0)
  world.record = { ...finished(), sandbox: BOX }
  await p.reload()
  await bar.getByRole('button', { name: 'Suspend' }).click()
  await expect(bar.getByText(/Sandbox suspended · its files are kept until/)).toBeVisible()
  await p.screenshot({ path: info.outputPath('suspended.png') })
  await bar.getByRole('button', { name: 'Resume' }).click()
  await expect(bar.getByText('Sandbox running')).toBeVisible()
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/pause`).length).toBe(1)
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/resume`).length).toBe(1)
})

test('the Browser frames what the sandbox serves, opens it again when its sandbox stopped, and in a tab of its own', async ({ page: p }, info) => {
  const { world, sent } = await rig(p, { record: live() })
  world.ports = [
    { port: 3000, host: `sandbox-${BOX}-preview-3000.hanzo.app` },
    { port: 5173, host: `sandbox-${BOX}-preview-5173.hanzo.app` },
  ]
  let served = 0
  await p.route(/-preview-\d+\.hanzo\.app\//, (r) => {
    served += 1
    const says = served === 1 ? `parent.postMessage({ source: 'hanzo-preview', status: 409 }, '*')` : ''
    return r.fulfill({ contentType: 'text/html', body: `<!doctype html><body><p>the app on ${new URL(r.request().url()).host}</p><script>${says}</script></body>` })
  })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Browser').click()
  const frame = p.frameLocator(`iframe[title="What the run serves on port 3000"]`)
  await expect(frame.getByText(`the app on sandbox-${BOX}-preview-3000.hanzo.app`)).toBeVisible()
  await expect.poll(() => to(sent, 'POST', `/v1/sandbox/${BOX}/preview`).length).toBe(2)
  await expect(desk(p).locator('iframe[title="What the run serves on port 3000"]')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
  await desk(p).getByRole('button', { name: 'Port 5173' }).click()
  await expect(p.frameLocator(`iframe[title="What the run serves on port 5173"]`).getByText(/preview-5173/)).toBeVisible()
  await p.screenshot({ path: info.outputPath('browser.png') })
  const opened = p.waitForEvent('popup')
  await desk(p).getByRole('button', { name: 'Open in a new tab' }).click()
  await expect.poll(async () => (await opened).url()).toMatch(/^https:\/\/sandbox-.+-preview-5173\.hanzo\.app\//)
})

test('a preview that keeps saying it cannot serve is not opened again and again', async ({ page: p }) => {
  const { world, sent } = await rig(p, { record: live() })
  world.ports = [{ port: 3000, host: `sandbox-${BOX}-preview-3000.hanzo.app` }]
  await p.route(/-preview-\d+\.hanzo\.app\//, (r) =>
    r.fulfill({ contentType: 'text/html', body: `<!doctype html><body><script>parent.postMessage({ source: 'hanzo-preview', status: 401 }, '*')</script></body>` }),
  )
  await p.goto(`/${SESSION}`)
  await tab(p, 'Browser').click()
  await expect(desk(p).getByText('This browser keeps the preview’s cookie out of a frame. Open it in a new tab.')).toBeVisible()
  await p.evaluate(() => new Promise((r) => setTimeout(r, 1000)))
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/preview`)).toHaveLength(1)
})

test('the Browser shows where a run published when nothing serves', async ({ page: p }) => {
  await rig(p, { record: live() })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Browser').click()
  await expect(desk(p).getByText('Nothing is serving yet', { exact: true }).first()).toBeVisible()
  await expect(desk(p).getByText('When the run starts a server in its sandbox, the page opens here.')).toBeVisible()
})

test('the Artifacts tab saves what the run left and opens its previews', async ({ page: p }) => {
  const { world, sent } = await rig(p, { record: live() })
  world.left = {
    session: SESSION,
    saved: '2026-09-29T19:00:00Z',
    artifacts: [
      { name: 'src/a.ts', kind: 'file', size: 2048 },
      { name: 'changes.patch', kind: 'patch', size: 40 },
      { name: 'preview 3000', kind: 'preview', port: 3000, url: `sandbox-${BOX}-preview-3000.hanzo.app` },
    ],
  }
  await p.route((u) => u.pathname === `/v1/agent/coding/${SESSION}/artifacts/src/a.ts`, (r) => r.fulfill({ contentType: 'text/plain', body: 'export const a = 1\n' }))
  await p.goto(`/${SESSION}`)
  await tab(p, 'Artifacts').click()
  await expect(desk(p).getByText('Changed file · 2.0 KB')).toBeVisible()
  const saved = p.waitForEvent('download')
  await desk(p).getByRole('button', { name: 'src/a.ts' }).click()
  expect((await saved).suggestedFilename()).toBe('a.ts')
  const opened = p.waitForEvent('popup')
  await desk(p).getByRole('button', { name: 'preview 3000' }).click()
  await expect.poll(async () => (await opened).url()).toMatch(/-preview-3000\.hanzo\.app\//)
  expect(to(sent, 'POST', `/v1/sandbox/${BOX}/preview`).length).toBe(1)
})

test('a refused ticket says why, and Retry mints a new one that opens', async ({ page: p }, info) => {
  await rig(p, { record: live() })
  let refuse = true
  let minted = 0
  await p.route(
    (u) => u.pathname === SCREEN,
    (r) => {
      minted += 1
      return refuse ? r.fulfill({ status: 503, json: { detail: 'The sandbox has no desktop' } }) : r.fallback()
    },
  )
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('Failed to connect')).toBeVisible()
  await expect(desk(p).getByText('The sandbox has no desktop')).toBeVisible()
  await p.screenshot({ path: info.outputPath('refused.png') })
  refuse = false
  const before = minted
  await desk(p).getByRole('button', { name: 'Retry' }).click()
  await expect(screen(p).getByText(/the screen \?ticket=t\d+/)).toBeVisible()
  await expect(desk(p).getByText('Connecting to the desktop…')).toHaveCount(0)
  expect(minted).toBeGreaterThan(before)
})

test('a ticket answered with no address to open is a failed connection', async ({ page: p }) => {
  await rig(p, { record: live() }, ({ path }) => (path === SCREEN ? { status: 201, json: { ticket: 't' } } : undefined))
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('The sandbox answered with no address to open')).toBeVisible()
})

test('a page that says it failed is a failed connection, in its words or the pane’s', async ({ page: p }) => {
  const { world } = await rig(p, { record: live() })
  // The first page names why; the next says only that it failed.
  world.page.screen = `top.loads = (top.loads || 0) + 1; parent.postMessage({ source: 'hanzo-screen', ready: false, why: top.loads === 1 ? 'VNC refused the connection' : 7 }, '*')`
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('VNC refused the connection')).toBeVisible()
  await desk(p).getByRole('button', { name: 'Retry' }).click()
  await expect(desk(p).getByText('Unable to reach the desktop. The run may have stopped.')).toBeVisible()
})

test('a page that asks for a retry gets a new ticket', async ({ page: p }) => {
  const { world } = await rig(p, { record: live() })
  world.page.screen = `top.loads = (top.loads || 0) + 1; parent.postMessage(top.loads === 1 ? { source: 'hanzo-screen', retry: true } : { source: 'hanzo-screen', ready: true }, '*')`
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect.poll(() => p.evaluate(() => (window as unknown as { loads?: number }).loads)).toBe(2)
  const ticket = /ticket=(t\d+)/.exec((await screen(p).locator('p').textContent())!)![1]
  await expect(desk(p).getByText('Connecting to the desktop…')).toHaveCount(0)
  // The page that asked is not the one showing: its ticket was spent, and a new one framed.
  expect(ticket).not.toBe('t1')
})

test('a page silent past the deadline has failed; one that answered in time stays open', async ({ page: p }) => {
  await p.clock.install()
  const { world } = await rig(p, { record: live() })
  world.page.screen = ''
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('Connecting to the desktop…')).toBeVisible()
  await expect(screen(p).getByText(/the screen/)).toBeVisible()
  await p.clock.runFor(20_000)
  await expect(desk(p).getByText('Unable to reach the desktop. The run may have stopped.')).toBeVisible()
  // The shell's page answered at once, so its deadline passes with it open.
  await tab(p, 'Terminal').click()
  await expect(p.frameLocator('iframe[title="The run’s terminal"]').getByText(/the terminal/)).toBeVisible()
  await expect(desk(p).getByText('Connecting to the terminal…')).toHaveCount(0)
  await p.clock.runFor(20_000)
  await expect(desk(p).getByText('Failed to connect')).toHaveCount(0)
})

test('only the framed page is heard: other windows, other origins and other doors are not', async ({ page: p }) => {
  const { world } = await rig(p, { record: live() })
  let forged = 0
  await p.route('https://elsewhere.test/**', (r) => {
    forged += 1
    return r.fulfill({ contentType: 'text/html', body: `<script>top.postMessage(${JSON.stringify({ source: 'hanzo-screen', ready: false, why: 'forged' })}, '*')</script>` })
  })
  world.page.screen = [
    `document.body.insertAdjacentHTML('beforeend', '<iframe src="https://elsewhere.test/"></iframe>')`,
    `parent.postMessage(null, '*')`,
    tells('hanzo-term', { ready: false, why: 'the wrong door' }),
    tells('hanzo-screen', { ready: 'maybe' }),
  ].join(';')
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(screen(p).getByText(/the screen/)).toBeVisible()
  await expect.poll(() => forged).toBe(1)
  await p.evaluate(() => window.postMessage({ source: 'hanzo-screen', ready: false, why: 'from the page itself' }, '*'))
  await p.evaluate(() => new Promise((r) => setTimeout(r, 300)))
  await expect(desk(p).getByText('Connecting to the desktop…')).toBeVisible()
  await expect(desk(p).getByText('Failed to connect')).toHaveCount(0)
  await p.frame({ url: /\/screen\?ticket=/ })!.evaluate(() => parent.postMessage({ source: 'hanzo-screen', ready: true }, '*'))
  await expect(desk(p).getByText('Connecting to the desktop…')).toHaveCount(0)
})

test('a door left before its ticket answers does not open with it', async ({ page: p }) => {
  const { sent } = await rig(p, { record: live() })
  let first = true
  await p.route(
    (u) => u.pathname === SCREEN,
    (r) => {
      if (!first) return r.fallback()
      first = false
      return r.fulfill({ status: 503, json: { detail: 'too late to matter' } })
    },
  )
  const screenGo = await hold(p, SCREEN, 'POST')
  const termGo = await hold(p, TERM, 'POST')
  await p.goto(`/${SESSION}`)
  // The shell opens with the pane; it is left for the log before its ticket comes back.
  await desk(p).getByRole('button', { name: 'Agent log' }).click()
  termGo()
  await expect.poll(() => to(sent, 'POST', TERM).length).toBeGreaterThan(0)
  await expect(desk(p).getByRole('button', { name: 'Shell' })).toBeVisible()
  const spent = to(sent, 'POST', TERM).length
  await desk(p).getByRole('button', { name: 'Shell' }).click()
  const shell = p.frameLocator('iframe[title="The run’s terminal"]').locator('p')
  await expect(shell).toHaveText(/ticket=t\d+/)
  expect(Number(/ticket=t(\d+)/.exec((await shell.textContent())!)![1])).toBeGreaterThan(spent)
  // The desktop's first ticket is refused after it was left: nothing says so.
  await tab(p, 'Desktop').click()
  await tab(p, 'Git').click()
  screenGo()
  await expect.poll(() => first).toBe(false)
  await tab(p, 'Desktop').click()
  await expect(screen(p).getByText(/the screen \?ticket=t/)).toBeVisible()
  await expect(desk(p).getByText('Failed to connect')).toHaveCount(0)
})

test('the terminal keeps the agent’s log beside the shell, with a cursor while the run works', async ({ page: p }, info) => {
  await rig(p, {
    record: live(),
    events: [ev('tool-call', { step: 'test', message: 'go test ./...' }), ev('log', { message: 'ok  widgets 0.2s' })],
  })
  await p.goto(`/${SESSION}`)
  await expect(p.frameLocator('iframe[title="The run’s terminal"]').getByText(/arg=run-aaaaaaaaaaaa/)).toBeVisible()
  await desk(p).getByRole('button', { name: 'Agent log' }).click()
  await expect(desk(p).getByText('test', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('ok  widgets 0.2s')).toBeVisible()
  await expect(desk(p).getByText('workspace $')).toHaveCount(2)
  await p.screenshot({ path: info.outputPath('log.png') })
})

test('a finished run with nothing run says so, and its terminal has no shell', async ({ page: p }) => {
  await rig(p)
  await p.goto(`/${SESSION}`)
  await expect(desk(p).getByText('This run finished without writing a command.')).toBeVisible()
  await expect(desk(p).getByRole('button', { name: 'Shell' })).toHaveCount(0)
  await expect(desk(p).getByRole('button', { name: 'Retry' })).toHaveCount(0)
})

test('the pane’s menu does what the title’s does, and Details opens the run’s facts', async ({ page: p }) => {
  await rig(p, { record: { ...finished(), repo: '', branch: '', base: '', environment: '', mode: '' } })
  await p.goto(`/${SESSION}`)
  await desk(p).getByRole('button', { name: 'Run actions' }).click()
  await expect(p.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await p.getByRole('menuitem', { name: 'Details' }).click()
  await expect(desk(p).getByText('This run has no codebase, so it has no environment.')).toBeVisible()
  for (const [label, value] of [
    ['Run', SESSION],
    ['Repository', '—'],
    ['Branch', '—'],
    ['Base', '—'],
    ['Runs on', 'sandbox'],
    ['Sandbox', '—'],
    ['Mode', 'build'],
  ])
    await expect(desk(p).getByText(label, { exact: true }).locator('..').getByText(value, { exact: true })).toBeVisible()
})

test('the Environment tab names the run’s codebase by its name, and what it runs on', async ({ page: p }) => {
  await rig(p, { record: { ...finished(), environment: 'tgt_1', mode: 'plan', base: '' } })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Environment').click()
  for (const [label, value] of [
    ['Repository', 'universe'],
    ['Branch', 'agent/ab12'],
    ['Base', '—'],
    ['Runs on', 'tgt_1'],
    ['Mode', 'plan'],
  ])
    await expect(desk(p).getByText(label, { exact: true }).locator('..').getByText(value, { exact: true })).toBeVisible()
})
