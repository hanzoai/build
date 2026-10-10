/**
 * The one composer (prompt.tsx) and the one model and effort (mind.ts), at a
 * laptop and a phone: the frame is as wide as the text above it, the chip
 * starts on Enso at Medium, a choice made on New is the choice a run's
 * follow-up shows (one key, `hanzo.mind`, the one Chat reads), a premium pick
 * holds for its screen and is never kept, and Send carries the choice.
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
const chip = (p: Page) => p.locator('[data-slot="mind"]')
const tune = (p: Page) => p.getByRole('dialog', { name: 'Model and effort' })
const field = (p: Page, name: string) => p.getByRole('textbox', { name })
const kept = (p: Page) => p.evaluate(() => JSON.parse(localStorage.getItem('hanzo.mind') ?? 'null'))

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
    // What the run is sent with lines up with the field's edge.
    near({ left: (await edges(p.locator('[data-slot="prompt-head"]'))).left, right: box.right }, box)
    await shot(p, '1440-new.png')
  })

  test('the chip starts on Enso at Medium; High and a model chosen on New are kept and shown by a run’s follow-up, and Send carries them', async ({ page: p }) => {
    const { sent } = await platform(p, HOLDING)
    await p.goto('/')
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Enso, Medium', { timeout: 45_000 })
    await chip(p).click()
    await expect(tune(p).getByRole('button', { name: /^Medium/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(tune(p).getByText('Enso picks the model for each message and step. Pick one to use it instead.')).toBeVisible()
    await shot(p, '1440-new-tune.png')
    await tune(p).getByRole('button', { name: /^High/ }).click()
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Enso, High')
    await chip(p).click()
    await tune(p).getByRole('button', { name: /^Model: / }).click()
    await p.getByRole('listbox', { name: 'Model' }).getByRole('option', { name: /^Zen 6,/ }).click()
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Zen 6, High')
    expect(await kept(p)).toEqual({ model: 'zen6', effort: 'high' })

    // The same choice on a run: one store, read by every composer.
    await p.goto(`/${SESSION}`)
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Zen 6, High', { timeout: 45_000 })
    await shot(p, '1440-run-kept.png')

    await p.goto('/')
    await field(p, 'Describe a task or ask a question').fill('Build a todo app')
    await p.getByRole('button', { name: 'Send' }).click()
    await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
    expect(to(sent, 'POST', '/v1/agent/coding').at(-1)?.body).toMatchObject({ prompt: 'Build a todo app', model: 'zen6', effort: 'high' })
  })

  test('a premium pick holds for its screen and is never kept; Use Enso goes back to the router', async ({ page: p }) => {
    const { sent } = await platform(p, { ...HOLDING, 'hanzo.mind': { model: 'zen6', effort: 'low' } })
    await p.goto('/')
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Zen 6, Low', { timeout: 45_000 })
    await chip(p).click()
    await tune(p).getByRole('button', { name: /^Model: / }).click()
    await p.getByRole('listbox', { name: 'Model' }).getByRole('option', { name: /^Opus,/ }).click()
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Opus, Low')
    expect(await kept(p)).toEqual({ model: 'zen6', effort: 'low' })
    await field(p, 'Describe a task or ask a question').fill('Review the cart')
    await p.getByRole('button', { name: 'Send' }).click()
    await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
    expect(to(sent, 'POST', '/v1/agent/coding').at(-1)?.body).toMatchObject({ model: 'opus', effort: 'low' })

    await p.goto('/')
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Zen 6, Low', { timeout: 45_000 })
    await chip(p).click()
    await tune(p).getByRole('button', { name: 'Use Enso' }).click()
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Enso, Low')
    expect(await kept(p)).toEqual({ model: 'enso-auto', effort: 'low' })
  })

  test('a model the catalog lists as not reasoning offers no effort', async ({ page: p }) => {
    await platform(p, { 'hanzo.mind': { model: 'zen6-flash', effort: 'high' } })
    await p.goto('/')
    await expect(chip(p)).toHaveAccessibleName('Model: Zen 6 Flash', { timeout: 45_000 })
    await chip(p).click()
    await expect(tune(p).getByRole('button', { name: /^High/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(tune(p).getByText('Zen 6 Flash answers every message and step, without an effort setting.')).toBeVisible()
  })
})

test.describe('at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the composer fits a phone on New and on a run, the chip in it', async ({ page: p }) => {
    await platform(p)
    await p.goto('/')
    await expect(chip(p)).toHaveAccessibleName('Model and effort: Enso, Medium', { timeout: 45_000 })
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
    await expect(chip(p)).toBeVisible()
    expect(await cramped(p)).toEqual([])
    await shot(p, '390-run.png')
  })
})
