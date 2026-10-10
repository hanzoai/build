/**
 * A run's page as a chat, signed in against a stubbed platform (cov-run.ts):
 * the ask that opens it, what each reply copies and the verdict it records, the
 * title's menu and Share, the steps folded to one line, and the model and
 * effort a follow-up starts with — the one choice New and Chat keep too.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { browser, ev, finished, NEXT, ORG, PR, rig, SESSION, to } from './cov-run.ts'

const transcript = (p: Page) => p.getByLabel('Transcript')

/** One short turn: the ask, the agent's reply, and the end that carries it as the answer. */
const told = () => [
  ev('status', { status: 'started', branch: 'agent/ab12' }),
  ev('tool-call', { step: 'clone', message: 'cloning the codebase', status: 'ok' }),
  ev('message', { role: 'user', text: 'Add the widget\n\nwith a test' }),
  ev('event', { type: 'item.completed', item: { id: 'm0', type: 'agent_message', text: 'Added **New** to `widget.go`.' } }),
  ev('log', { message: 'tokens used\n12\n' }),
  ev('status', { status: 'done', changed: true, branch: 'agent/ab12', answer: 'Added **New** to `widget.go`.' }),
]

test('the ask opens the conversation as the person’s own message, once', async ({ page: p }, info) => {
  await rig(p, { events: told() })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  const asks = t.locator('[data-role="user"]')
  await expect(asks).toHaveCount(1, { timeout: 45_000 })
  // Drawn as Chat draws a question: its paragraphs as paragraphs.
  await expect(asks.getByText('Add the widget', { exact: true })).toBeVisible()
  await expect(asks.getByText('with a test', { exact: true })).toBeVisible()
  // It opens the conversation, ahead of the steps that set the run up.
  const top = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y
  expect(await top(asks)).toBeLessThan(await top(t.getByText('Started on agent/ab12')))
  await expect(t.locator('[data-role="assistant"]').getByText('New', { exact: true })).toBeVisible()
  await expect(p.getByText('Hanzo is AI and can make mistakes.')).toBeVisible()
  await p.screenshot({ path: info.outputPath('chat.png') })
})

test('a reply is copied, and a verdict on it is recorded, taken back and changed', async ({ page: p }) => {
  await browser(p, { clipboard: 'keeps' })
  const { sent } = await rig(p, { events: told(), record: { ...finished(), project: 'widgets' } })
  await p.goto(`/${SESSION}`)
  const reply = transcript(p).locator('[data-role="assistant"]').filter({ hasText: 'Added' })
  await expect(reply).toBeVisible({ timeout: 45_000 })
  await reply.getByRole('button', { name: 'Copy this answer' }).click()
  await expect(reply.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await p.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual(['Added **New** to `widget.go`.'])
  const good = reply.getByRole('button', { name: 'Good result' })
  await good.click()
  await expect(good).toHaveAttribute('aria-pressed', 'true')
  await good.click()
  await expect(good).toHaveAttribute('aria-pressed', 'false')
  await reply.getByRole('button', { name: 'Bad result' }).click()
  await expect.poll(() => to(sent, 'POST', '/v1/event').length).toBe(3)
  expect(to(sent, 'POST', '/v1/event').map((s) => s.body)).toEqual(
    ['up', 'cleared', 'down'].map((verdict) => ({ type: 'track', event: 'build.verdict', sessionId: SESSION, properties: { verdict, project: 'widgets' } })),
  )
})

test('a verdict that does not land is taken back and says why', async ({ page: p }) => {
  await rig(p, { events: told() }, ({ path }) => (path === '/v1/event' ? { status: 401, json: { detail: 'Sign in again to send feedback.' } } : undefined))
  await p.goto(`/${SESSION}`)
  const reply = transcript(p).locator('[data-role="assistant"]').filter({ hasText: 'Added' })
  await expect(reply).toBeVisible({ timeout: 45_000 })
  await reply.getByRole('button', { name: 'Good result' }).click()
  await expect(reply.getByText('Sign in again to send feedback.')).toBeVisible()
  await expect(reply.getByRole('button', { name: 'Good result' })).toHaveAttribute('aria-pressed', 'false')
})

test('the title is the run’s menu, and Share opens its story and copies its link', async ({ page: p }, info) => {
  await browser(p, { clipboard: 'keeps' })
  const { sent } = await rig(p, { events: told(), record: { ...finished(), project: 'widgets' } })
  await p.goto(`/${SESSION}`)
  const title = p.getByRole('button', { name: 'Manage this run' })
  await expect(title.getByRole('heading', { name: 'universe: Add the widget' })).toBeVisible({ timeout: 45_000 })
  await title.click()
  await expect(p.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await expect(p.getByRole('menuitem', { name: /Copy run id/ })).toBeVisible()
  await expect(p.getByRole('menuitem', { name: /Share publicly/ })).toHaveCount(0)
  await p.keyboard.press('Escape')
  await p.getByRole('button', { name: 'Share', exact: true }).click()
  await p.screenshot({ path: info.outputPath('share.png') })
  await p.getByRole('menuitem', { name: /Share publicly/ }).click()
  await expect(p.getByText('Shared — anyone with the link can read this run’s story')).toBeVisible()
  expect(to(sent, 'PATCH', `/v1/agent/sessions/${SESSION}`).map((s) => s.body)).toEqual([{ published: true }])
  await expect(p.getByText('done · hanzoai/universe · agent/ab12 · shared')).toBeVisible()
  await p.getByRole('button', { name: 'Share', exact: true }).click()
  await p.getByRole('menuitem', { name: /Copy public link/ }).click()
  const link = `${new URL(p.url()).origin}/v1/agent/builds/${ORG}/widgets`
  expect(await p.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([link])
  await p.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(p.getByRole('menuitem', { name: /Copied/ })).toBeVisible()
  await p.getByRole('menuitem', { name: 'Stop sharing' }).click()
  await expect(p.getByText('No longer shared')).toBeVisible()
  expect(to(sent, 'PATCH', `/v1/agent/sessions/${SESSION}`).map((s) => s.body)).toEqual([{ published: true }, { published: false }])
})

test('the steps fold to one line that names the current one, and open when pressed', async ({ page: p }, info) => {
  await rig(p, {
    record: { ...finished(), status: 'running' },
    events: [ev('tool-call', { step: 'clone', status: 'running' }), ev('tool-call', { step: 'install', status: 'running' })],
  })
  await p.goto(`/${SESSION}`)
  const steps = p.getByRole('button', { name: 'Steps · 2' })
  await expect(steps).toHaveAttribute('aria-expanded', 'false', { timeout: 45_000 })
  await expect(steps.getByText('install')).toBeVisible()
  await expect(p.getByText('✓')).toHaveCount(0)
  await steps.click()
  await expect(steps).toHaveAttribute('aria-expanded', 'true')
  await expect(steps.getByText('install')).toHaveCount(0)
  await expect(p.getByText('✓')).toBeVisible()
  await expect(p.getByText('●')).toBeVisible()
  await p.screenshot({ path: info.outputPath('steps.png') })
})

test('a follow-up starts with the model and effort the composer shows, and the choice is kept for New and Chat', async ({ page: p }, info) => {
  const { sent } = await rig(p, { events: told() })
  await p.goto(`/${SESSION}`)
  const chip = p.locator('[data-slot="mind"]')
  await expect(chip).toHaveAccessibleName('Model and effort: Enso, Medium', { timeout: 45_000 })
  await chip.click()
  await p.getByRole('dialog', { name: 'Model and effort' }).getByRole('button', { name: /^High/ }).click()
  await expect(chip).toHaveAccessibleName('Model and effort: Enso, High')
  await chip.click()
  await p.getByRole('dialog', { name: 'Model and effort' }).getByRole('button', { name: /^Model: / }).click()
  await p.getByRole('listbox', { name: 'Model' }).getByRole('option', { name: /^zen5-coder,/ }).click()
  // A listed model that names no reasoning takes no effort, and the chip says so.
  await expect(chip).toHaveAccessibleName(/^Model: /)
  await p.screenshot({ path: info.outputPath('foot.png') })
  const box = p.getByRole('textbox', { name: 'Follow up on this run' })
  await box.fill('now the docs')
  await box.press('Enter')
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  expect(to(sent, 'POST', '/v1/agent/coding')[0]?.body).toMatchObject({ model: 'zen5-coder', effort: 'high', after: SESSION })
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('hanzo.mind') ?? 'null'))).toEqual({ model: 'zen5-coder', effort: 'high' })
})

for (const [size, box] of Object.entries({
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
})) {
  test(`the chat, its steps and its share menu fit a ${size}`, async ({ page: p }, info) => {
    await p.setViewportSize(box)
    await rig(p, { events: told(), record: { ...finished(), project: 'widgets', pr: PR } })
    await p.goto(`/${SESSION}`)
    await expect(p.getByRole('button', { name: 'Good result' })).toBeVisible({ timeout: 45_000 })
    expect(await cramped(p)).toEqual([])
    await p.getByRole('button', { name: 'Steps · 1' }).click()
    await expect(p.getByText('✓')).toBeVisible()
    expect(await cramped(p)).toEqual([])
    await p.screenshot({ path: info.outputPath(`${size}.png`) })
    await p.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(p.getByRole('menuitem', { name: /Share publicly/ })).toBeVisible()
    expect(await cramped(p)).toEqual([])
    await p.screenshot({ path: info.outputPath(`${size}-share.png`) })
  })
}
