/**
 * The one composer (@hanzo/ui/chat) and the one model and effort (mind.ts), at
 * a laptop and a phone: the frame is as wide as the text above it, the effort
 * starts on Auto and the model is named only where the person turned the model
 * selector on (`hanzo.composer`, Settings → Appearance), a choice made on New is
 * the choice a run's follow-up shows (one key, `hanzo.mind`, the one Chat
 * reads), a premium pick holds for its screen and is never kept, and Send
 * carries the choice.
 */
import type { Locator, Page } from '@playwright/test'

import { ev, NEXT, ORG, rig, SESSION, to } from './cov-run.ts'
import { desk } from './desk.ts'
import { cramped, expect, test } from './fixture.ts'

/** A picture of the page, beside the test's other output. */
const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

const CATALOG = {
  data: [
    { id: 'enso-auto', name: 'Enso', family: 'enso', class: 'ours', supports_reasoning: true },
    { id: 'zen6', name: 'Zen 6', family: 'zen', class: 'ours', supports_reasoning: true },
    { id: 'zen6-flash', name: 'Zen 6 Flash', family: 'zen', class: 'ours' },
    { id: 'opus', name: 'Opus', owned_by: 'anthropic', class: 'premium', supports_reasoning: true },
  ],
}

/** A finished run that answered, on a platform that lists CATALOG and holds universe among the org's repositories. */
const platform = (p: Page, kept: Record<string, unknown> = {}) =>
  rig(
    p,
    {
      events: [
        ev('status', { status: 'started', branch: 'agent/ab12' }),
        ev('message', { role: 'user', text: 'Add the widget' }),
        ev('event', { type: 'item.completed', item: { id: 'm0', type: 'agent_message', text: 'Added **New** to `widget.go`, with a test that covers it end to end.' } }),
        ev('status', { status: 'done', changed: true, branch: 'agent/ab12' }),
      ],
    },
    ({ path }) =>
      path === '/v1/models' ? { json: CATALOG } : path === '/v1/git/repos' ? { json: { data: [{ name: 'universe', org: ORG, defaultBranch: 'main' }] } } : undefined,
    kept,
  )

/** New holding a codebase of the org: a run in the sandbox names the project it works on. */
const HOLDING = {
  [`hanzo.build.new.${ORG}`]: {
    repo: { owner: ORG, name: 'universe', full_name: `${ORG}/universe`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: `https://git.hanzo.ai/${ORG}/universe.git` },
    branch: 'main',
    place: '',
    mode: 'build',
    ask: '',
  },
}

const frame = (p: Page) => p.locator('[data-slot="composer"]').first()
const model = (p: Page) => p.locator('[data-slot="mind"] [role="button"]')
const effort = (p: Page) => p.getByRole('button', { name: /^Effort: / })
const field = (p: Page, name: string) => p.getByRole('textbox', { name })
const kept = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('hanzo.mind') ?? 'null'))
/** The person turned the model selector on. */
const SELECTOR = { 'hanzo.composer': { model: true } }

/** An element's box, left and right, px. */
const edges = async (l: Locator) => {
  const b = (await l.boundingBox())!
  return { left: b.x, right: b.x + b.width }
}

/** Where the transcript's words run: its column less its own padding. */
const words = (p: Page) =>
  p
    .getByLabel('Transcript')
    .locator('[data-slot="thread-column"]')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return { left: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) }
    })

const near = (a: { left: number; right: number }, b: { left: number; right: number }) => {
  expect(Math.abs(a.left - b.left), `left ${a.left} vs ${b.left}`).toBeLessThanOrEqual(1)
  expect(Math.abs(a.right - b.right), `right ${a.right} vs ${b.right}`).toBeLessThanOrEqual(1)
}

/** Choose a row of an open picker by its name. */
const choose = (p: Page, list: string, name: RegExp | string) => p.getByRole('listbox', { name: list }).getByRole('option', { name }).click()

test.describe('at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the frame is as wide as the text on a run, with the panel open and closed, and centred at the measure on New', async ({ page: p }) => {
    await platform(p)
    await p.goto(`/${SESSION}`)
    await expect(p.getByText('with a test that covers it end to end.')).toBeVisible({ timeout: 45_000 })
    await expect(desk(p)).toBeVisible()
    near(await edges(frame(p)), await words(p))
    await shot(p, '1440-run-panel-open.png')
    await p.locator('[data-slot="side-toggle"]').click()
    await expect(desk(p)).toHaveCount(0)
    near(await edges(frame(p)), await words(p))
    await shot(p, '1440-run-panel-closed.png')

    await p.goto('/')
    await expect(field(p, 'Describe a task or ask a question')).toBeVisible({ timeout: 45_000 })
    const box = await edges(frame(p))
    const heading = await edges(p.getByRole('heading', { level: 1 }).first())
    // At the reading measure less the column's gutters (48rem − 1.5rem), centred under the heading.
    expect(Math.round(box.right - box.left)).toBe(768 - 24)
    expect(Math.abs((box.left + box.right) / 2 - (heading.left + heading.right) / 2)).toBeLessThanOrEqual(1)
    await shot(p, '1440-new.png')
  })

  test('at rest the composer is three rows, the pills, one line of text and the tools, and grows with the text to its ceiling', async ({ page: p }) => {
    await platform(p, HOLDING)
    await p.goto('/')
    const ask = field(p, 'Describe a task or ask a question')
    await expect(ask).toBeVisible({ timeout: 45_000 })
    const line = async () => (await ask.boundingBox())!.height
    const rest = await line()
    // One line of 24px, with the field's own few px of padding.
    expect(rest).toBeGreaterThanOrEqual(24)
    expect(rest).toBeLessThan(36)
    const tall = (await frame(p).boundingBox())!.height
    // The pills' row, the text's row and the tools' row: no fourth row of air.
    expect(tall).toBeLessThan(rest + 110)
    await shot(p, '1440-new-rest.png')
    await ask.fill(['one', 'two', 'three', 'four'].join('\n'))
    await expect.poll(line).toBeGreaterThan(rest + 60)
    await ask.fill(Array.from({ length: 40 }, (_, n) => `line ${n}`).join('\n'))
    const capped = await line()
    expect(capped).toBeLessThan(900 / 2)
    await ask.fill('')
    await expect.poll(line).toBeLessThan(36)
  })

  test('the effort starts on Auto and the model is not named; the selector, once on, names it, and a choice is kept and shown by a run’s follow-up, and Send carries it', async ({ page: p }) => {
    const { sent } = await platform(p, HOLDING)
    await p.goto('/')
    await expect(effort(p)).toHaveAccessibleName('Effort: Auto', { timeout: 45_000 })
    await expect(model(p)).toHaveCount(0)
    await effort(p).click()
    await shot(p, '1440-new-effort.png')
    await choose(p, 'Effort', /^High/)
    await expect(effort(p)).toHaveAccessibleName('Effort: High')

    // The person turns the model selector on (Settings → Appearance); every composer reads it.
    await p.evaluate(() => {
      localStorage.setItem('hanzo.composer', JSON.stringify({ model: true }))
      window.dispatchEvent(new Event('hanzo:composer'))
    })
    await expect(model(p)).toHaveAccessibleName('Model: Enso')
    await model(p).click()
    await choose(p, 'Model', /^Zen 6,/)
    await expect(model(p)).toHaveAccessibleName('Model: Zen 6')
    expect(await kept(p)).toEqual({ model: 'zen6', effort: 'high' })

    // The same choice on a run: one store, read by every composer.
    await p.goto(`/${SESSION}`)
    await expect(effort(p)).toHaveAccessibleName('Effort: High', { timeout: 45_000 })
    await expect(model(p)).toHaveAccessibleName('Model: Zen 6')
    await shot(p, '1440-run-kept.png')

    await p.goto('/')
    await field(p, 'Describe a task or ask a question').fill('Build a todo app')
    await p.getByRole('button', { name: 'Send' }).click()
    await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
    expect(to(sent, 'POST', '/v1/agent/coding').at(-1)?.body).toMatchObject({ prompt: 'Build a todo app', model: 'zen6', effort: 'high' })
  })

  test('a premium pick holds for its screen and is never kept; Enso goes back to the router', async ({ page: p }) => {
    const { sent } = await platform(p, { ...HOLDING, ...SELECTOR, 'hanzo.mind': { model: 'zen6', effort: 'high' } })
    await p.goto('/')
    await expect(model(p)).toHaveAccessibleName('Model: Zen 6', { timeout: 45_000 })
    await model(p).click()
    await choose(p, 'Model', /^Opus,/)
    await expect(model(p)).toHaveAccessibleName('Model: Opus')
    expect(await kept(p)).toEqual({ model: 'zen6', effort: 'high' })
    await field(p, 'Describe a task or ask a question').fill('Review the cart')
    await p.getByRole('button', { name: 'Send' }).click()
    await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
    expect(to(sent, 'POST', '/v1/agent/coding').at(-1)?.body).toMatchObject({ model: 'opus', effort: 'high' })

    await p.goto('/')
    await expect(model(p)).toHaveAccessibleName('Model: Zen 6', { timeout: 45_000 })
    await model(p).click()
    await choose(p, 'Model', /^Enso/)
    await expect(model(p)).toHaveAccessibleName('Model: Enso')
    expect(await kept(p)).toEqual({ model: 'enso-auto', effort: 'high' })
  })

  test('the effort is offered whatever the model, and the person’s key sends: Enter by default, Ctrl+Enter once chosen', async ({ page: p }) => {
    const { sent } = await platform(p, { ...HOLDING, ...SELECTOR, 'hanzo.mind': { model: 'zen6-flash', effort: 'high' } })
    await p.goto('/')
    await expect(model(p)).toHaveAccessibleName('Model: Zen 6 Flash', { timeout: 45_000 })
    await expect(effort(p)).toHaveAccessibleName('Effort: High')

    const ask = field(p, 'Describe a task or ask a question')
    await p.evaluate(() => {
      localStorage.setItem('hanzo.composer', JSON.stringify({ model: true, send: 'mod' }))
      window.dispatchEvent(new Event('hanzo:composer'))
    })
    await ask.fill('Fix the footer')
    await ask.press('Enter')
    expect(to(sent, 'POST', '/v1/agent/coding')).toHaveLength(0)
    await expect(ask).toHaveValue('Fix the footer\n')
    await ask.press('Control+Enter')
    await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  })
})

test.describe('at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the composer fits a phone on New and on a run, the pills and the tools in it', async ({ page: p }) => {
    await platform(p, { ...HOLDING, ...SELECTOR })
    await p.goto('/')
    await expect(model(p)).toHaveAccessibleName('Model: Enso', { timeout: 45_000 })
    let box = await edges(frame(p))
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(390)
    expect(await cramped(p)).toEqual([])
    await shot(p, '390-new.png')

    await p.goto(`/${SESSION}`)
    await expect(p.getByText('with a test that covers it end to end.')).toBeVisible({ timeout: 45_000 })
    box = await edges(frame(p))
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(390)
    near(box, await words(p))
    await expect(effort(p)).toBeVisible()
    expect(await cramped(p)).toEqual([])
    await shot(p, '390-run.png')
  })
})
