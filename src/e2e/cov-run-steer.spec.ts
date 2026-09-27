/**
 * What reaches a run and what it says back, on a stubbed platform (cov-run.ts):
 * signed out, unread and refused; steering, pausing, stopping and carrying a
 * run on, each also refused; notifying when it finishes; renaming, copying and
 * sharing; a plan approved; a setup run's first look; and the turns a read
 * leaves out.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { browser, ev, finished, hold, NEXT, ORG, rig, SESSION, to } from './cov-run.ts'
import { visitor } from './stubs.ts'

const desk = (p: Page) => p.getByRole('complementary', { name: 'Run details' })
const tab = (p: Page, name: string) => desk(p).getByRole('button', { name, exact: true }).first()
const box = (p: Page, name: 'Steer this run' | 'Follow up on this run') => p.getByRole('textbox', { name })
const status = (p: Page) => p.getByRole('status').filter({ hasNotText: /^$/ })
const running = () => ({ ...finished(), status: 'running' })
const refusal = (detail: string, code = 500) => ({ status: code, json: { detail } })

test('signed out, a run asks for a sign in wherever it would show something', async ({ page: p }, info) => {
  await visitor(p)
  await p.route('**/.well-known/openid-configuration', (r) => r.fulfill({ status: 404 }))
  // Each Sign in opens IAM's authorize page in a popup, which is left open: closing it sends the page there instead.
  const signs: string[] = []
  await p.context().route('https://hanzo.id/**', (r) => {
    signs.push(r.request().url())
    return r.fulfill({ body: 'signing in', contentType: 'text/html' })
  })
  await p.goto(`/${SESSION}`)
  const t = p.getByLabel('Transcript')
  await expect(t.getByText('Sign in to follow this run.')).toBeVisible()
  await expect(p.getByRole('button', { name: 'Manage this run' }).getByRole('heading', { name: 'Untitled run' })).toBeVisible()
  await expect(p.getByRole('textbox', { name: 'Follow up on this run' })).toHaveAttribute('placeholder', 'Sign in to follow up')
  await expect(p.getByRole('textbox', { name: 'Follow up on this run' })).toBeDisabled()
  await expect(p.getByRole('button', { name: /^Model: / })).toHaveCount(0)
  await expect(p.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await expect(p.getByRole('menuitem')).toHaveCount(1)
  await expect(p.getByRole('menuitem', { name: /Copy run id/ })).toBeVisible()
  await p.keyboard.press('Escape')
  await t.getByRole('button', { name: 'Sign in' }).click()
  await expect.poll(() => signs.length).toBe(1)
  expect(signs[0]).toMatch(/client_id=hanzo-build/)
  // The terminal says it too, and its one action signs in.
  await expect(desk(p).getByText('Sign in to follow this run.')).toBeVisible()
  await desk(p).getByRole('button', { name: 'Sign in' }).click()
  await expect.poll(() => signs.length).toBe(2)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('Sign in to see what this run pushed.')).toBeVisible()
  await tab(p, 'Files').click()
  await expect(desk(p).getByText('Sign in to read this run’s files.')).toBeVisible()
  await tab(p, 'Environment').click()
  await expect(desk(p).getByText('Sign in to see this codebase’s environment.')).toBeVisible()
  await p.screenshot({ path: info.outputPath('signed-out.png') })
})

test('a run the platform will not read says why, and Retry reads it again', async ({ page: p }) => {
  let down = true
  const { sent } = await rig(p, { events: [ev('status', { status: 'started' })] }, ({ path, method }) =>
    down && method === 'GET' && path === `/v1/agent/sessions/${SESSION}` ? refusal('The run store is down', 503) : undefined,
  )
  await p.goto(`/${SESSION}`)
  const t = p.getByLabel('Transcript')
  await expect(t.getByText('The run store is down')).toBeVisible()
  await expect(p.getByRole('heading', { name: 'Untitled run' })).toBeVisible()
  await expect(box(p, 'Follow up on this run')).toHaveAttribute('placeholder', 'Reading this run…')
  await expect(box(p, 'Follow up on this run')).toBeDisabled()
  await expect(desk(p).getByText('The run store is down')).toBeVisible()
  down = false
  const reads = to(sent, 'GET', `/v1/agent/sessions/${SESSION}`).length
  await desk(p).getByRole('button', { name: 'Retry' }).click()
  await expect(t.getByText('Started')).toBeVisible()
  expect(to(sent, 'GET', `/v1/agent/sessions/${SESSION}`).length).toBeGreaterThan(reads)
})

test('a feed that refuses this account says so, beside the run as read', async ({ page: p }) => {
  const { sent } = await rig(p, {}, ({ path }) => (path === '/v1/agent/sessions/stream' ? refusal('no', 403) : undefined))
  await p.goto(`/${SESSION}`)
  await expect(p.getByLabel('Transcript').getByText('Waiting for the run’s first step…')).toBeVisible()
  await expect(p.getByRole('status').filter({ hasText: 'This account cannot follow this run' }).first()).toBeVisible()
  await expect(desk(p).getByText('This account cannot follow this run')).toBeVisible()
  const reads = to(sent, 'GET', `/v1/agent/sessions/${SESSION}`).length
  await desk(p).getByRole('button', { name: 'Retry' }).click()
  await expect.poll(() => to(sent, 'GET', `/v1/agent/sessions/${SESSION}`).length).toBeGreaterThan(reads)
})

test('a run being read says so, then draws what it read', async ({ page: p }) => {
  await rig(p, { events: [ev('status', { status: 'started' })] })
  const go = await hold(p, `/v1/agent/sessions/${SESSION}`)
  await p.goto(`/${SESSION}`)
  await expect(p.getByLabel('Transcript').getByText('Reading this run…')).toBeVisible()
  await expect(p.getByText('reading', { exact: true })).toBeVisible()
  go()
  await expect(p.getByRole('heading', { name: 'universe: Add the widget' })).toBeVisible()
  await expect(p.getByText('done · hanzoai/universe · agent/ab12')).toBeVisible()
})

test('a running run is steered, paused and stopped, and each refusal says why', async ({ page: p }) => {
  const fail = new Set(['message', 'pause', 'stop'])
  const { sent } = await rig(p, { record: running() }, ({ path }) => {
    const verb = path.split('/').pop()!
    return path.startsWith(`/v1/agent/sessions/${SESSION}/`) && fail.has(verb) ? refusal(`The run would not ${verb}`, 409) : undefined
  })
  await p.goto(`/${SESSION}`)
  await expect(p.getByLabel('Transcript').getByText('Starting…')).toBeVisible()
  await expect(box(p, 'Steer this run')).toHaveAttribute('placeholder', 'Add a follow up')
  await expect(p.getByRole('button', { name: /^Model: / })).toHaveCount(0)
  await box(p, 'Steer this run').fill('use table tests')
  await box(p, 'Steer this run').press('Enter')
  await expect(status(p).getByText('The run would not message')).toBeVisible()
  await expect(box(p, 'Steer this run')).toHaveValue('use table tests')
  await p.getByRole('button', { name: 'Pause' }).click()
  await expect(status(p).getByText('The run would not pause')).toBeVisible()
  await p.getByRole('button', { name: 'Stop' }).click()
  await expect(status(p).getByText('The run would not stop')).toBeVisible()
  fail.clear()
  await box(p, 'Steer this run').press('Enter')
  await expect(status(p).getByText('Sent — recorded on this run')).toBeVisible()
  await expect(box(p, 'Steer this run')).toHaveValue('')
  expect(to(sent, 'POST', `/v1/agent/sessions/${SESSION}/message`).map((s) => s.body)).toEqual([{ message: 'use table tests' }, { message: 'use table tests' }])
  await p.getByRole('button', { name: 'Pause' }).click()
  await expect(status(p).getByText('Pause requested — the run keeps its work on its branch and waits')).toBeVisible()
})

test('a pausing sandbox run waits for its work to be kept, then goes on in a new run from where it started', async ({ page: p }) => {
  const { sent, world } = await rig(p, { record: { ...running(), status: 'paused' } }, ({ path }) =>
    path === `/v1/agent/sessions/${SESSION}/stop` ? refusal('Already let go', 409) : undefined,
  )
  await p.goto(`/${SESSION}`)
  await expect(box(p, 'Follow up on this run')).toHaveAttribute('placeholder', 'Pausing — the run is keeping its work…')
  await expect(box(p, 'Follow up on this run')).toBeDisabled()
  for (const b of ['Pause', 'Resume', 'Stop']) await expect(p.getByRole('button', { name: b })).toHaveAttribute('aria-disabled', 'true')
  world.events = [ev('status', { status: 'paused', changed: false })]
  await expect(p.getByText('Paused.', { exact: true })).toBeVisible()
  await expect(box(p, 'Follow up on this run')).toHaveAttribute('placeholder', 'Continue this run with a follow up')
  await expect(p.getByRole('button', { name: 'Model: Enso' })).toBeVisible()
  await box(p, 'Follow up on this run').fill('and tests')
  await box(p, 'Follow up on this run').press('Enter')
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  const body = to(sent, 'POST', '/v1/agent/coding')[0]?.body as Record<string, unknown>
  expect(body).toMatchObject({ repo: 'hanzoai/universe', base: 'main', mode: 'build', effort: 'medium', desktop: true })
  expect(body.model).toBeUndefined()
  expect(body.after).toBeUndefined()
  // The paused run is let go, and its refusal to be is not the person's problem.
  expect(to(sent, 'POST', `/v1/agent/sessions/${SESSION}/stop`)[0]?.body).toEqual({ message: 'Continued in a follow-up run' })
})

test('a paused sandbox run that cannot be carried on says why and stays', async ({ page: p }) => {
  await rig(p, { record: { ...running(), status: 'paused' }, events: [ev('status', { status: 'paused', changed: true, branch: 'agent/ab12' })] }, ({ path }) =>
    path === '/v1/agent/coding' ? refusal('Your plan has no runs left this month', 402) : undefined,
  )
  await p.goto(`/${SESSION}`)
  await expect(p.getByText('Paused — its work so far is on its branch.')).toBeVisible()
  await p.getByRole('button', { name: 'Resume' }).click()
  await expect(status(p).getByText('Your plan has no runs left this month')).toBeVisible()
  await expect(p).toHaveURL(new RegExp(`/${SESSION}$`))
})

test('a machine run is paused and resumed where it runs, and a refused resume says why', async ({ page: p }) => {
  let refuse = true
  const { sent, world } = await rig(p, { record: { ...running(), environment: 'tgt_1' } }, ({ path }) =>
    refuse && path.endsWith('/resume') ? refusal('The machine is offline', 503) : undefined,
  )
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Pause' }).click()
  await expect(status(p).getByText('Pause asked — the machine pauses when it reads it')).toBeVisible()
  world.record.status = 'paused'
  await expect(p.getByText('Paused.', { exact: true })).toBeVisible()
  // A machine drains what it is told itself, so words still steer it.
  await expect(box(p, 'Steer this run')).toHaveAttribute('placeholder', 'Add a follow up')
  await p.getByRole('button', { name: 'Resume' }).click()
  await expect(status(p).getByText('The machine is offline')).toBeVisible()
  refuse = false
  await p.getByRole('button', { name: 'Resume' }).click()
  await expect(status(p).getByText('Resume asked — the machine goes on when it reads it')).toBeVisible()
  expect(to(sent, 'POST', '/v1/agent/coding')).toHaveLength(0)
})

test('a stopped run waits to say where it kept its work, then follows up from that branch', async ({ page: p }) => {
  const { sent, world } = await rig(p, { record: running() })
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Stop' }).click()
  await expect(status(p).getByText('Stop requested — the run keeps its work on its branch')).toBeVisible()
  world.record.status = 'stopped'
  await expect(box(p, 'Follow up on this run')).toHaveAttribute('placeholder', 'Stopping — the run is keeping its work…')
  await expect(box(p, 'Follow up on this run')).toBeDisabled()
  world.events = [ev('status', { status: 'stopped', changed: true, branch: 'agent/ab12' })]
  await expect(box(p, 'Follow up on this run')).toHaveAttribute('placeholder', 'Follow up — continues in a new run')
  await box(p, 'Follow up on this run').fill('finish it')
  await box(p, 'Follow up on this run').press('Enter')
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  expect(to(sent, 'POST', '/v1/agent/coding')[0]?.body).toMatchObject({ after: SESSION, prompt: expect.stringMatching(/^finish it\n\nThis follows an earlier run/) })
})

test('a run the feed says paused before its record is read cannot be carried on yet, and its verdicts name no project', async ({ page: p }) => {
  const frames = [ev('tool-call', { message: 'running the task' }), ev('log', { message: 'codex\nHalf done.\n' }), ev('status', { status: 'paused', changed: false })]
  const { sent } = await rig(p, { record: running(), frames: frames.map((e) => `event: event\ndata: ${JSON.stringify({ event: e })}\n\n`).join('') })
  const go = await hold(p, `/v1/agent/sessions/${SESSION}`)
  await p.goto(`/${SESSION}`)
  await expect(p.getByText('Paused.', { exact: true })).toBeVisible()
  await p.getByRole('button', { name: 'Resume' }).click()
  await expect(status(p).getByText('This run is still being read')).toBeVisible()
  await p.getByRole('button', { name: 'Good result' }).click()
  await expect.poll(() => to(sent, 'POST', '/v1/event').map((s) => (s.body as { properties: unknown }).properties)).toEqual([{ verdict: 'up', project: '' }])
  go()
})

test.describe('notify me', () => {
  test('asks the browser once, and says the run finished when it does', async ({ page: p }) => {
    await browser(p, { notify: 'default', grants: true })
    const { world } = await rig(p, { record: running() })
    await p.goto(`/${SESSION}`)
    await p.getByRole('button', { name: 'Notify me' }).click()
    await expect(p.getByRole('button', { name: 'You will be notified' })).toBeDisabled()
    world.record.status = 'done'
    await expect.poll(() => p.evaluate(() => (window as unknown as { shown: unknown[] }).shown)).toEqual([{ title: 'universe: Add the widget', body: 'This run has finished.' }])
    expect(await p.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(1)
  })

  test('an allowed browser is not asked again, and an untitled run is called a run', async ({ page: p }) => {
    await browser(p, { notify: 'granted' })
    const { world } = await rig(p, { record: { ...running(), title: '' } })
    await p.goto(`/${SESSION}`)
    await expect(p.getByRole('heading', { name: 'Untitled run' })).toBeVisible()
    await p.getByRole('button', { name: 'Notify me' }).click()
    world.record.status = 'error'
    await expect.poll(() => p.evaluate(() => (window as unknown as { shown: unknown[] }).shown)).toEqual([{ title: 'Run finished', body: 'This run has finished.' }])
    expect(await p.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(0)
  })

  test('says nothing once the browser takes its permission back', async ({ page: p }) => {
    await browser(p, { notify: 'granted' })
    const { world } = await rig(p, { record: running() })
    await p.goto(`/${SESSION}`)
    await p.getByRole('button', { name: 'Notify me' }).click()
    await p.evaluate(() => ((window as unknown as { Notification: { permission: string } }).Notification.permission = 'denied'))
    world.record.status = 'done'
    await expect(p.getByRole('button', { name: 'Notify me' })).toHaveCount(0)
    await expect(p.getByPlaceholder('Follow up — continues in a new run')).toBeVisible()
    expect(await p.evaluate(() => (window as unknown as { shown: unknown[] }).shown)).toEqual([])
  })

  test('says when the browser will not, or cannot, notify', async ({ page: p }) => {
    await browser(p, { notify: 'default', grants: false })
    await rig(p, { record: running() })
    await p.goto(`/${SESSION}`)
    await p.getByRole('button', { name: 'Notify me' }).click()
    await expect(status(p).getByText('Notifications stay off until this browser allows them.')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Notify me' })).toBeEnabled()
  })

  test('says when the browser has no notifications at all', async ({ page: p }) => {
    await browser(p, { notify: 'none' })
    await rig(p, { record: running() })
    await p.goto(`/${SESSION}`)
    await p.getByRole('button', { name: 'Notify me' }).click()
    await expect(status(p).getByText('This browser cannot send a notification.')).toBeVisible()
  })
})

test('a run is renamed once however often Enter is pressed, and shows its new name', async ({ page: p }) => {
  const { sent } = await rig(p)
  const go = await hold(p, `/v1/agent/sessions/${SESSION}`, 'PATCH')
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await p.getByRole('menuitem', { name: 'Rename' }).click()
  const name = p.getByRole('dialog').getByLabel('The run’s name')
  await expect(name).toHaveValue('universe: Add the widget')
  await name.fill('  ')
  await expect(p.getByRole('dialog').getByRole('button', { name: 'Save' })).toBeDisabled()
  await name.fill('The widget')
  await name.pressSequentially(', tested')
  await name.press('Enter')
  await name.press('Enter')
  go()
  await expect(p.getByRole('dialog')).toHaveCount(0)
  await expect(p.getByRole('heading', { name: 'The widget, tested' })).toBeVisible()
  expect(to(sent, 'PATCH', `/v1/agent/sessions/${SESSION}`).map((s) => s.body)).toEqual([{ title: 'The widget, tested' }])
  await expect(status(p).getByText('Renamed')).toBeVisible()
})

test('a rename the platform refuses keeps the dialog open and says why; Cancel sends nothing', async ({ page: p }) => {
  const { sent } = await rig(p, {}, ({ method }) => (method === 'PATCH' ? refusal('A run’s name is at most 512 characters', 400) : undefined))
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await p.getByRole('menuitem', { name: 'Rename' }).click()
  await p.getByRole('dialog').getByLabel('The run’s name').fill('x')
  await p.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(status(p).getByText('A run’s name is at most 512 characters')).toBeVisible()
  await expect(p.getByLabel('The run’s name')).toBeVisible()
  await p.getByRole('button', { name: 'Cancel' }).click()
  await expect(p.getByLabel('The run’s name')).toHaveCount(0)
  expect(to(sent, 'PATCH', `/v1/agent/sessions/${SESSION}`)).toHaveLength(1)
})

test('a run’s id is copied, and a browser that will not copy says so', async ({ page: p }) => {
  await browser(p, { clipboard: 'keeps' })
  await rig(p)
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await p.getByRole('menuitem', { name: /Copy run id/ }).click()
  expect(await p.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([SESSION])
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await expect(p.getByRole('menuitem', { name: /Copied/ })).toBeVisible()
})

test('a browser that refuses the clipboard says so', async ({ page: p }) => {
  await browser(p, { clipboard: 'refuses' })
  await rig(p)
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await p.getByRole('menuitem', { name: /Copy run id/ }).click()
  await expect(status(p).getByText('This browser would not copy.')).toBeVisible()
})

test('a shared run with no org of its own links by the org it is read in, and a refused share says why', async ({ page: p }) => {
  await browser(p, { clipboard: 'keeps' })
  await rig(p, { record: { ...finished(), org: '', project: 'widgets', published: true } }, ({ method }) => (method === 'PATCH' ? refusal('Only an org admin shares a run', 403) : undefined))
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Share', exact: true }).click()
  await p.getByRole('menuitem', { name: /Copy public link/ }).click()
  expect(await p.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([`${new URL(p.url()).origin}/v1/agent/builds/${ORG}/widgets`])
  await p.getByRole('button', { name: 'Share', exact: true }).click()
  await p.getByRole('menuitem', { name: 'Stop sharing' }).click()
  await expect(status(p).getByText('Only an org admin shares a run')).toBeVisible()
})

test.describe('a plan run', () => {
  const PLAN = '1. Read `widget.go`\n2. Add **New**'
  const planned = (status = 'done') => ({ record: { ...finished(), mode: 'plan', branch: '', status }, events: [ev('status', { status: 'done', plan: PLAN })] })

  test('is built once approved, and says so while it starts', async ({ page: p }) => {
    const { sent } = await rig(p, planned())
    const go = await hold(p, '/v1/agent/coding', 'POST')
    await p.goto(`/${SESSION}`)
    await p.getByRole('button', { name: 'Approve and build' }).click()
    await expect(p.getByRole('button', { name: 'Starting the build…' })).toBeDisabled()
    go()
    await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
    expect(to(sent, 'POST', '/v1/agent/coding')[0]?.body).toMatchObject({ mode: 'build', base: 'main', prompt: `Add the widget\n\nCarry out this plan:\n\n${PLAN}` })
  })

  test('that cannot start its build says why', async ({ page: p }) => {
    await rig(p, planned(), ({ path }) => (path === '/v1/agent/coding' ? refusal('Out of credits', 402) : undefined))
    await p.goto(`/${SESSION}`)
    await p.getByRole('button', { name: 'Approve and build' }).click()
    await expect(status(p).getByText('Out of credits')).toBeVisible()
  })

  test('offers no build while it still runs, or once it failed', async ({ page: p }) => {
    const { world } = await rig(p, planned('running'))
    await p.goto(`/${SESSION}`)
    await expect(p.getByLabel('Plan', { exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Approve and build' })).toHaveCount(0)
    world.record.status = 'error'
    await expect(p.getByPlaceholder('Follow up — continues in a new run')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Approve and build' })).toHaveCount(0)
  })
})

test.describe('a setup run', () => {
  const setup = { record: { ...running(), mode: 'setup', branch: '' } }
  const took = (minutes: number[]) => ({
    sessions: minutes.map((m, i) => ({ id: `s${i}`, mode: 'setup', status: 'done', createdAt: '2026-09-27T10:00:00Z', endedAt: new Date(Date.parse('2026-09-27T10:00:00Z') + m * 60_000).toISOString() })),
    next: '',
  })

  test('shows what setup does once, and how long setup has taken here', async ({ page: p }, info) => {
    const { sent } = await rig(p, { ...setup, list: took([4, 6, 9]) })
    await p.goto(`/${SESSION}`)
    await expect(p.getByLabel('Transcript').getByText('Setting up environment')).toBeVisible()
    await expect(p.getByText('Environment setup takes ~6–9 minutes.')).toBeVisible()
    await expect(box(p, 'Steer this run')).toHaveAttribute('placeholder', 'Add a follow up for the setup agent')
    expect(to(sent, 'GET', '/v1/agent/sessions').map((s) => s.query)).toContain('?kind=coding&status=done&limit=500')
    // The side pane opens on the environment the run is setting up.
    await expect(desk(p).getByText('Setting up', { exact: true })).toBeVisible()
    await p.screenshot({ path: info.outputPath('setup.png') })
    await p.getByRole('button', { name: 'Got it' }).click()
    await expect(p.getByText('Set up a cloud environment')).toHaveCount(0)
    expect(await p.evaluate(() => localStorage.getItem('hanzo.build.setup.seen'))).toBe('true')
  })

  test('seen before, says nothing more about what setup does', async ({ page: p }) => {
    await rig(p, setup, undefined, { 'hanzo.build.setup.seen': true })
    await p.goto(`/${SESSION}`)
    await expect(p.getByText('Environment setup takes several minutes.')).toBeVisible()
    await expect(p.getByText('Set up a cloud environment')).toHaveCount(0)
  })

  test('says one number when setup has always taken the same', async ({ page: p }) => {
    await rig(p, { ...setup, list: took([5, 5, 5]) })
    await p.goto(`/${SESSION}`)
    await expect(p.getByText('Environment setup takes ~5 minutes.')).toBeVisible()
  })
})

test('the turns a read leaves out are counted, one or many', async ({ page: p }) => {
  const { world } = await rig(p, { record: { ...finished(), events: 60 }, events: [ev('status', { status: 'started' }), ev('status', { status: 'done' })] })
  await p.goto(`/${SESSION}`)
  await expect(p.getByText('58 earlier turns are not shown. The run’s Git tab has everything it pushed.')).toBeVisible()
  world.record.events = 3
  await expect(p.getByText('1 earlier turn is not shown. The run’s Git tab has everything it pushed.')).toBeVisible()
})

test('a run that pushed but could not open its pull request says so, and its last unsettled step is waiting', async ({ page: p }) => {
  await rig(p, { events: [ev('tool-call', { step: 'push', status: 'running' }), ev('status', { status: 'done', branch: 'agent/ab12', prError: 'no token' })] })
  await p.goto(`/${SESSION}`)
  await expect(p.getByText('The branch is pushed, and the pull request could not be opened.')).toBeVisible()
  await p.getByRole('button', { name: 'Steps · 1' }).click()
  await expect(p.getByText('○')).toBeVisible()
})

test('the side pane is hidden and shown again, and this browser keeps which', async ({ page: p }) => {
  await rig(p)
  await p.goto(`/${SESSION}`)
  await desk(p).getByRole('button', { name: 'Hide the side pane' }).click()
  await expect(desk(p)).toHaveCount(0)
  expect(await p.evaluate(() => localStorage.getItem('hanzo.build.desk'))).toBe('false')
  await p.getByRole('button', { name: 'Show the side pane' }).click()
  await expect(desk(p)).toBeVisible()
  expect(await p.evaluate(() => localStorage.getItem('hanzo.build.desk'))).toBe('true')
})

test('a side pane hidden before stays hidden', async ({ page: p }) => {
  await rig(p, {}, undefined, { 'hanzo.build.desk': false })
  await p.goto(`/${SESSION}`)
  await expect(p.getByRole('button', { name: 'Show the side pane' })).toBeVisible()
  await expect(desk(p)).toHaveCount(0)
})

test('the foot starts from the person’s coding defaults, and a stored model or effort it cannot read falls back to them', async ({ page: p }) => {
  const { sent } = await rig(p, {}, ({ path }) => (path === '/v1/pref' ? { json: { prefs: { code: { model: 'zen5-flash', effort: 'low' } } } } : undefined), {
    [`hanzo.build.new.${ORG}`]: { model: 5, effort: 'extreme' },
  })
  await p.goto(`/${SESSION}`)
  await expect(p.getByRole('button', { name: 'Model: Zen5 Flash' })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Effort: Low' })).toBeVisible()
  await box(p, 'Follow up on this run').fill('again')
  await box(p, 'Follow up on this run').press('Enter')
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  expect(to(sent, 'POST', '/v1/agent/coding')[0]?.body).toMatchObject({ model: 'zen5-flash', effort: 'low' })
})
