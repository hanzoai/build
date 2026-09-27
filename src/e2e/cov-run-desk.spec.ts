/**
 * A run's side pane on a stubbed platform (cov-run.ts): its desktop and shell,
 * framed from the sandbox's own pages with a fresh ticket each time — refused,
 * answered with no address, reported failed, asked to retry, silent past the
 * deadline, lied to by other windows, and left before the ticket came back —
 * the agent's log beside the shell, the pane's menu, and what the Environment
 * tab says about a run with nothing to name.
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

test('the desktop waits for a sandbox, and says it closed once the run stops', async ({ page: p }) => {
  const { world } = await rig(p, { record: { ...finished(), status: 'running' } })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(desk(p).getByText('Starting', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('The desktop opens once the run’s sandbox is up.')).toBeVisible()
  world.record.status = 'done'
  await expect(desk(p).getByText('Not running')).toBeVisible()
  await expect(desk(p).getByText('This run’s desktop closed when the run stopped.')).toBeVisible()
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
    ['Mode', 'build'],
  ])
    await expect(desk(p).getByText(label, { exact: true }).locator('..').getByText(value, { exact: true })).toBeVisible()
  await tab(p, 'Subscriptions').click()
  await expect(desk(p).getByText('Ask an agent to subscribe to a Slack channel or thread, a pull request, or a timer.')).toBeVisible()
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
