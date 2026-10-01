/**
 * A run draws its own panes: the transcript and the side pane are cards cut by
 * @hanzo/design's pane tokens, the side pane stands a gutter off the run with
 * its edge in that gutter, the composer floats in its pane, and the Slack card
 * is glass. Read from computed style, so a host needs no rule to get any of it.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { rig, SESSION } from './cov-run.ts'

/** What `var(--name)` resolves to on this page, as the browser computes it for `prop`. */
const token = (p: Page, prop: string, value: string) =>
  p.evaluate(
    ([prop, value]) => {
      const probe = document.createElement('div')
      probe.style.setProperty(prop, value)
      document.body.append(probe)
      const got = getComputedStyle(probe).getPropertyValue(prop)
      probe.remove()
      return got
    },
    [prop, value],
  )

const style = (p: Page, selector: string, props: string[]) =>
  p.locator(selector).first().evaluate((el, props) => {
    const s = getComputedStyle(el)
    return Object.fromEntries(props.map((k) => [k, s.getPropertyValue(k)]))
  }, props)

const PANE = ['border-top-left-radius', 'background-color', 'border-top-width', 'border-top-color', 'backdrop-filter', 'box-shadow']

test('the run and its side pane are panes, a gutter apart, with the edge in the gutter', async ({ page: p }) => {
  await rig(p)
  await p.goto(`/${SESSION}`)
  await expect(p.locator('[data-slot="desk"]')).toBeVisible()

  const round = await token(p, 'border-top-left-radius', 'var(--radius-xl)')
  const fill = await token(p, 'background-color', 'var(--sheet-1)')
  const edge = await token(p, 'border-top-color', 'var(--white-08)')
  const drop = await token(p, 'box-shadow', 'var(--shadow-sheet-2)')
  const gap = await token(p, 'margin-left', 'var(--space-2)')
  expect(parseFloat(round)).toBeGreaterThan(0)

  for (const slot of ['run', 'desk']) {
    const s = await style(p, `[data-slot="${slot}"]`, PANE)
    expect(s, slot).toEqual({
      'border-top-left-radius': round,
      'background-color': fill,
      'border-top-width': '1px',
      'border-top-color': edge,
      'backdrop-filter': 'blur(20px) saturate(1.8)',
      'box-shadow': drop,
    })
  }

  expect((await style(p, '[data-slot="desk"]', ['margin-left']))['margin-left']).toBe(gap)
  const inner = await style(p, '[data-slot="desk"] > [role="complementary"]', ['border-left-width', 'border-top-left-radius', 'overflow-x'])
  expect(inner).toEqual({ 'border-left-width': '0px', 'border-top-left-radius': round, 'overflow-x': 'hidden' })

  // The edge that sizes the side pane fills the gutter beside it, exactly.
  const run = await p.locator('[data-slot="run"]').boundingBox()
  const desk = await p.locator('[data-slot="desk"]').boundingBox()
  const grip = await p.locator('[data-slot="desk"] > [data-slot="grip"]').boundingBox()
  expect(run && desk && grip).toBeTruthy()
  expect(Math.round(grip!.x)).toBe(Math.round(run!.x + run!.width))
  expect(Math.round(grip!.x + grip!.width)).toBe(Math.round(desk!.x))

  const composer = await style(p, '[data-slot="run"] [data-slot="composer"]', PANE)
  expect(composer).toEqual({
    'border-top-left-radius': round,
    'background-color': fill,
    'border-top-width': '1px',
    'border-top-color': edge,
    'backdrop-filter': 'blur(20px) saturate(1.8)',
    'box-shadow': drop,
  })
})

test('the Slack card is glass with a corner a step inside the rail’s', async ({ page: p }) => {
  await rig(p)
  await p.goto('/')
  const card = p.getByRole('button', { name: 'Set up Hanzo in Slack' }).locator('xpath=ancestor::div[2]')
  await expect(card).toBeVisible()
  const s = await card.evaluate((el) => {
    const c = getComputedStyle(el)
    return { radius: c.borderTopLeftRadius, fill: c.backgroundColor }
  })
  expect(s.radius).toBe(await token(p, 'border-top-left-radius', 'var(--radius-lg)'))
  expect(s.fill).toBe(await token(p, 'background-color', 'var(--glass)'))
})
