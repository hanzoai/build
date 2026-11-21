/**
 * Nothing spends on one press (spend.tsx). On this package's own page the
 * builder asks in its own dialog; under a host with `confirm` the host's answer
 * is the only one, and a no, a throw or an answer after the screen has gone
 * starts nothing. Each spec counts the calls that would spend.
 */
import type { Page } from '@playwright/test'

import { BOX, ev, finished, rig, SESSION, to } from './cov-run.ts'
import { desk, open } from './desk.ts'
import { expect, test } from './fixture.ts'
import { mounted } from './mount.ts'
import type { Mount } from './mount.ts'
import { accept, asking, decline } from './spend.ts'
import { serve } from './signed.ts'
import { scheduled } from './stubs.ts'

const flow = (n: number) => `flow_${String(n).padStart(32, '0')}`
const DAVE = { name: 'Dave', email: 'dave@acme.test', avatar: '' }
const host = (path: string, more: Partial<Mount> = {}): Omit<Mount, 'token'> => ({ path, org: 'acme', admin: true, person: DAVE, ...more })
type Sent = { method: string; path: string; body?: unknown }
const runs = (sent: Sent[], id = flow(1)) => sent.filter((s) => s.method === 'POST' && s.path === `/v1/auto/automations/${id}/run`).length
const asked = (page: Page) => page.evaluate(() => (window as unknown as { asked: { kind: string; uses: string; title: string }[] }).asked.map((s) => [s.kind, s.uses, s.title]))
const menuRun = async (page: Page) => {
  await page.getByRole('button', { name: 'Actions for Monday summary' }).click({ timeout: 45_000 })
  await page.getByRole('menuitem', { name: 'Run now' }).click()
}

test.describe('on its own page, the builder asks', () => {
  test('Run now in the list: Cancel starts nothing, its yes starts one run', async ({ page }) => {
    const { sent } = await scheduled(page)
    await page.goto('/-/automations')
    await menuRun(page)
    await expect(asking(page)).toContainText('This starts one run of Monday summary right away, apart from its schedule. It counts against your plan or your credits.')
    // Cancel holds the focus: Enter never says yes.
    await expect(asking(page).getByRole('button', { name: 'Cancel' })).toBeFocused()
    await decline(page, 'Run Monday summary now?')
    expect(runs(sent)).toBe(0)
    await menuRun(page)
    await page.keyboard.press('Escape')
    await expect(asking(page)).toHaveCount(0)
    expect(runs(sent)).toBe(0)
    await menuRun(page)
    await accept(page, 'Run Monday summary now?', 'Run now')
    await expect.poll(() => runs(sent)).toBe(1)
  })

  test('Run now in the editor: Cancel starts nothing, its yes starts one run', async ({ page }) => {
    const { sent } = await scheduled(page)
    await page.goto(`/-/automations/${flow(1)}`)
    await page.getByRole('button', { name: 'Run now' }).click({ timeout: 45_000 })
    await decline(page, 'Run Monday summary now?')
    expect(runs(sent)).toBe(0)
    await page.getByRole('button', { name: 'Run now' }).click()
    await accept(page, 'Run Monday summary now?', 'Run now')
    await expect.poll(() => runs(sent)).toBe(1)
  })

  test('a paused task is switched on only on a yes; pausing asks nothing', async ({ page }) => {
    const { sent } = await scheduled(page)
    await page.goto('/-/automations')
    const weekly = page.getByRole('switch', { name: 'Weekly digest on' })
    await weekly.click({ timeout: 45_000 })
    await decline(page, 'Turn Weekly digest on?')
    await expect(weekly).not.toBeChecked()
    expect(sent.filter((s) => s.method === 'PATCH')).toEqual([])
    await weekly.click()
    await accept(page, 'Turn Weekly digest on?', 'Turn on')
    await expect(weekly).toBeChecked()
    await page.getByRole('switch', { name: 'Monday summary on' }).click()
    await expect(page.getByRole('switch', { name: 'Monday summary on' })).not.toBeChecked()
    await expect(asking(page)).toHaveCount(0)
    expect(sent.filter((s) => s.method === 'PATCH').map((s) => [s.path, s.body])).toEqual([
      [`/v1/auto/automations/${flow(3)}`, { enabled: true }],
      [`/v1/auto/automations/${flow(1)}`, { enabled: false }],
    ])
  })
})

test.describe('under a host that asks, the host is the only asker', () => {
  test('a yes from the host starts one run, and the builder draws no question of its own', async ({ page }) => {
    const { sent } = await scheduled(page)
    await mounted(page, host('-/automations', { confirm: 'yes' }))
    await menuRun(page)
    await expect.poll(() => runs(sent)).toBe(1)
    await expect(asking(page)).toHaveCount(0)
    expect(await asked(page)).toEqual([['task-run', 'credits', 'Run Monday summary now?']])
  })

  test('a no from the host starts nothing', async ({ page }) => {
    const { sent } = await scheduled(page)
    await mounted(page, host('-/automations', { confirm: 'no' }))
    await menuRun(page)
    await expect.poll(() => asked(page)).toHaveLength(1)
    await page.getByRole('switch', { name: 'Weekly digest on' }).click()
    await expect.poll(() => asked(page)).toHaveLength(2)
    await expect(page.getByRole('switch', { name: 'Weekly digest on' })).not.toBeChecked()
    await expect(asking(page)).toHaveCount(0)
    expect(runs(sent)).toBe(0)
    expect(sent.filter((s) => s.method === 'PATCH')).toEqual([])
  })

  test('a host confirm that throws starts nothing', async ({ page }) => {
    const { sent } = await scheduled(page)
    await mounted(page, host(`-/automations/${flow(1)}`, { confirm: 'throw' }))
    await page.getByRole('button', { name: 'Run now' }).click({ timeout: 45_000 })
    await expect.poll(() => asked(page)).toHaveLength(1)
    await page.waitForTimeout(300)
    expect(runs(sent)).toBe(0)
  })

  test('a yes that comes after the screen has gone starts nothing', async ({ page }) => {
    const { sent } = await scheduled(page)
    await mounted(page, host(`-/automations/${flow(1)}`, { confirm: 'hold' }))
    await page.getByRole('button', { name: 'Run now' }).click({ timeout: 45_000 })
    await expect.poll(() => asked(page)).toHaveLength(1)
    await page.getByRole('button', { name: 'All scheduled tasks' }).click()
    await expect(page.getByRole('heading', { name: 'Scheduled tasks', exact: true })).toBeVisible()
    await page.evaluate(() => (window as unknown as { answer?: (yes: boolean) => void }).answer?.(true))
    await page.waitForTimeout(300)
    expect(runs(sent)).toBe(0)
  })
})

test.describe('a 24/7 bot is made only on a yes', () => {
  const WATCHER = { name: 'watcher', title: 'Watcher', description: 'Watches the repositories.', category: 'Bot', model: 'zen5', instructions: 'Watch.' }
  const agents = async (page: Page) =>
    serve(page, ({ method, path, body }) => {
      if (path === '/v1/agent' && method === 'GET') return { json: { agents: [] } }
      if (path === '/v1/agent' && method === 'POST') return { status: 201, json: { id: 'agent_1', ...(body as object) } }
      if (path.startsWith('/v1/agent/')) return { json: {} }
      return { json: {} }
    })
  const made = (sent: Sent[]) => sent.filter((s) => s.method === 'POST' && s.path === '/v1/agent')
  const add = async (page: Page) => {
    await page.getByRole('button', { name: 'Browse', exact: true }).click({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Use Watcher' }).click()
  }

  test('Add in Bots asks first, in the builder’s own dialog with its budget: Cancel makes nothing', async ({ page }) => {
    const sent = await agents(page)
    await mounted(page, host('-/customize/bots', { cast: [WATCHER] }))
    await add(page)
    await expect(asking(page)).toContainText('Watcher runs by itself around the clock, on its schedule and when its triggers fire, and may spend up to $10 a month until you pause or delete it.')
    await decline(page, 'Start Watcher running 24/7?')
    expect(made(sent)).toEqual([])
    await add(page)
    await accept(page, 'Start Watcher running 24/7?', 'Start bot')
    await expect.poll(() => made(sent).length).toBe(1)
    expect(made(sent)[0]!.body).toMatchObject({ executionMode: 'long-running' })
  })

  test('Elect with 24/7 on asks first: Cancel elects nothing, its yes makes the bot', async ({ page }) => {
    const sent = await agents(page)
    await mounted(page, host('-/customize/bots', { cast: [WATCHER] }))
    await page.getByRole('button', { name: 'Browse', exact: true }).click({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Elect Watcher to run 24/7' }).click()
    const elect = page.getByRole('dialog', { name: 'Elect 24/7 autonomous preset' })
    await elect.getByRole('button', { name: 'Elect and run 24/7' }).click()
    await decline(page, 'Start Watcher running 24/7?')
    // Only the question went: the sheet it was asked from is still open.
    await expect(elect).toBeVisible()
    expect(made(sent)).toEqual([])
    await elect.getByRole('button', { name: 'Elect and run 24/7' }).click()
    await accept(page, 'Start Watcher running 24/7?', 'Start bot')
    await expect.poll(() => made(sent).length).toBe(1)
    expect(made(sent)[0]!.body).toMatchObject({ executionMode: 'long-running' })
  })

  test('a new bot saved from the editor asks with its own budget; Escape shuts the question alone and keeps the draft', async ({ page }) => {
    const sent = await agents(page)
    await mounted(page, host('-/customize/bots', { cast: [WATCHER] }))
    await page.getByRole('button', { name: 'New bot' }).first().click({ timeout: 45_000 })
    await page.getByRole('button', { name: 'Start from scratch' }).click()
    const editor = page.getByRole('dialog', { name: 'New bot' })
    await editor.getByLabel('Name', { exact: true }).fill('lookout')
    await editor.getByLabel('Instructions', { exact: true }).fill('Watch the builds.')
    await editor.getByLabel('Budget each period').fill('25')
    await editor.getByLabel('Budget for one run').fill('1')
    const create = editor.getByRole('button', { name: 'Create' })
    await create.click()
    await expect(asking(page)).toContainText('lookout runs by itself around the clock, on its schedule and when its triggers fire, and may spend up to $25 a month until you pause or delete it.')
    await page.keyboard.press('Escape')
    await expect(asking(page)).toHaveCount(0)
    await expect(editor).toBeVisible()
    await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('lookout')
    await expect(create).toBeFocused()
    expect(made(sent)).toEqual([])
    await create.click()
    await accept(page, 'Start lookout running 24/7?', 'Start bot')
    await expect.poll(() => made(sent).length).toBe(1)
    expect(made(sent)[0]!.body).toMatchObject({ name: 'lookout', executionMode: 'long-running' })
  })

  test('a host that says no makes no bot', async ({ page }) => {
    const sent = await agents(page)
    await mounted(page, host('-/customize/bots', { cast: [WATCHER], confirm: 'no' }))
    await add(page)
    await expect.poll(() => asked(page)).toEqual([['bot', 'credits', 'Start Watcher running 24/7?']])
    await page.waitForTimeout(300)
    expect(made(sent)).toEqual([])
  })
})

test.describe('a new run, or a cloud computer woken, only on a yes', () => {
  test('Try again on a failed run: Cancel starts no run, its yes starts one', async ({ page: p }) => {
    const { sent } = await rig(p, {
      record: { ...finished(), status: 'error', mode: 'plan', branch: '' },
      events: [ev('status', { status: 'started', repo: 'universe', base: 'main', mode: 'plan' }), ev('status', { status: 'error', error: 'coding: the agent stopped' })],
    })
    await p.goto(`/${SESSION}`)
    const again = p.getByLabel('Transcript').getByRole('alert').getByRole('button', { name: 'Try again' })
    await again.click({ timeout: 45_000 })
    await expect(asking(p)).toContainText('This starts a new run of the same ask. It starts a cloud computer, which counts against your plan or your credits.')
    await decline(p, 'Try this run again?')
    expect(to(sent, 'POST', '/v1/agent/coding')).toHaveLength(0)
    await again.click()
    await accept(p, 'Try this run again?', 'Try again')
    await expect.poll(() => to(sent, 'POST', '/v1/agent/coding').length).toBe(1)
  })

  test('waking a suspended cloud workspace: Cancel wakes nothing, its yes wakes it once', async ({ page: p }) => {
    const { world, sent } = await rig(p, { record: { ...finished(), sandbox: BOX } })
    world.held = { status: 'parked', expiresAt: 1790726400 }
    await p.goto(`/${SESSION}`)
    await open(p, 'Desktop')
    const wake = desk(p).getByRole('button', { name: /^(Wake|Resume)$/ })
    await wake.click({ timeout: 45_000 })
    await decline(p, 'Wake the cloud workspace?')
    expect(to(sent, 'POST', `/v1/sandbox/${BOX}/resume`)).toHaveLength(0)
    await wake.click()
    await accept(p, 'Wake the cloud workspace?', 'Wake')
    await expect.poll(() => to(sent, 'POST', `/v1/sandbox/${BOX}/resume`).length).toBe(1)
  })

  test('Fork in a run’s menu asks first: Cancel starts no run, its yes starts one', async ({ page: p }) => {
    const { sent } = await rig(p, { record: finished() })
    await p.goto(`/${SESSION}`)
    const title = p.getByRole('button', { name: 'Manage this run' })
    await title.click({ timeout: 45_000 })
    await p.getByRole('menuitem', { name: 'Fork' }).click()
    await decline(p, 'Fork this run?')
    expect(to(sent, 'POST', '/v1/agent/coding')).toHaveLength(0)
    await title.click()
    await p.getByRole('menuitem', { name: 'Fork' }).click()
    await accept(p, 'Fork this run?', 'Fork')
    await expect.poll(() => to(sent, 'POST', '/v1/agent/coding').length).toBe(1)
  })

  test('Start dev server on a suspended sandbox wakes it only on a yes', async ({ page: p }) => {
    const EXEC = `/v1/sandbox/${BOX}/exec`
    const { world, sent } = await rig(p, { record: { ...finished(), sandbox: BOX } }, (s) => {
      if (s.path !== EXEC) return undefined
      if (world.held.status === 'parked') return { status: 409, json: { detail: 'the sandbox is parked' } }
      return { json: { exitCode: 0, stdout: 'pnpm run dev', stderr: '' } }
    })
    world.held = { status: 'parked', expiresAt: 1790726400 }
    await p.goto(`/${SESSION}`)
    await open(p, 'Preview')
    const start = desk(p).getByRole('button', { name: 'Start dev server' })
    await start.click({ timeout: 45_000 })
    await decline(p, 'Wake the cloud workspace?')
    await expect(desk(p).getByText('The cloud workspace is suspended. Wake it to go on.')).toBeVisible()
    expect(to(sent, 'POST', `/v1/sandbox/${BOX}/resume`)).toHaveLength(0)
    // Said where it was asked, with the way to ask again.
    await desk(p).getByRole('button', { name: 'Try again' }).click()
    await accept(p, 'Wake the cloud workspace?', 'Wake')
    await expect.poll(() => to(sent, 'POST', `/v1/sandbox/${BOX}/resume`).length).toBe(1)
  })
})
