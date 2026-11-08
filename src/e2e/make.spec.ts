/**
 * Make something new, over the Library at -/artifacts/new: gallery.hanzo.ai's
 * templates (as recorded, and an agent beside them) narrowed by kind and search,
 * picked with the keyboard, a site copied into a project and opened, an agent
 * made the org's own, a gallery that does not answer, and the whole screen on
 * a phone.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { gallery, library } from './stubs.ts'

const picker = (p: Page) => p.getByRole('dialog', { name: 'Make something new' })
const card = (p: Page, name: string) => picker(p).getByRole('button', { name: `Start from ${name}`, exact: true })
const SITES = ['Instrument Lab', 'Hyperion Tunnel', 'Metrics', 'Folio About']

async function open(page: Page) {
  await page.goto('/-/artifacts')
  await page.getByRole('button', { name: 'Make something new' }).first().click({ timeout: 45_000 })
  await expect(picker(page)).toBeVisible()
  await expect(page).toHaveURL(/\/-\/artifacts\/new$/)
  await expect(card(page, 'Scout')).toBeVisible({ timeout: 15_000 })
}

test('opens over the Library with every template the gallery serves, and narrows by kind and by search', async ({ page }) => {
  await library(page)
  await gallery(page)
  await open(page)
  for (const name of [...SITES, 'Scout']) await expect(card(page, name)).toBeVisible()
  await expect(card(page, 'Hyperion Tunnel')).toContainText('Site · 3D & Shaders')
  await expect(card(page, 'Scout')).toContainText('Agent · Sales')

  await picker(page).getByRole('radio', { name: 'Agent' }).click()
  await expect(picker(page).getByRole('listitem')).toHaveCount(1)
  await picker(page).getByRole('radio', { name: 'All' }).click()
  await expect(picker(page).getByRole('listitem')).toHaveCount(5)

  await picker(page).getByLabel('Search templates').fill('three')
  await expect(picker(page).getByRole('listitem')).toHaveCount(1)
  await expect(card(page, 'Hyperion Tunnel')).toBeVisible()
  await picker(page).getByLabel('Search templates').fill('nothing like this')
  await expect(picker(page).getByText('Nothing matches.')).toBeVisible()
})

test('goes into the grid from the search, moves across and down it, picks with Enter, and closes with Escape', async ({ page }) => {
  const { sent } = await library(page)
  await gallery(page)
  await open(page)
  const search = picker(page).getByLabel('Search templates')
  await expect(search).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Instrument Lab')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(card(page, 'Hyperion Tunnel')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  // Four across at this width: down is the next row's first.
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Scout')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(card(page, 'Instrument Lab')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(search).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(picker(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/-\/artifacts$/)

  await page.getByRole('button', { name: 'Make something new' }).first().click()
  await expect(card(page, 'Hyperion Tunnel')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/warp-tunnel$/)
  expect(sent.filter((s) => s.path === '/v1/project/fork').map((s) => [s.method, s.body])).toEqual([['POST', { slug: 'warp-tunnel' }]])
})

test('an agent template becomes the org’s own agent and opens in Customize', async ({ page }) => {
  const { sent } = await library(page)
  await gallery(page)
  await open(page)
  await card(page, 'Scout').click()
  await expect(page).toHaveURL(/\/-\/customize\/agents\/scout$/)
  const made = sent.find((s) => s.method === 'POST' && s.path === '/v1/agent')
  expect(made?.body).toMatchObject({ name: 'scout', description: 'Finds leads.', instructions: 'You find leads.', model: 'zen5', avatar: 'https://gallery.hanzo.ai/screenshots/scout.webp' })
})

test('a gallery that does not answer says so in one sentence, and Try again reads it again', async ({ page }) => {
  await library(page)
  const { up } = await gallery(page, { down: true })
  await page.goto('/-/artifacts/new')
  await expect(picker(page).getByText('The gallery is not answering right now.')).toBeVisible({ timeout: 45_000 })
  up()
  await picker(page).getByRole('button', { name: 'Try again' }).click()
  await expect(card(page, 'Instrument Lab')).toBeVisible()
})

test('the empty Library offers it, and on a phone it is the whole screen, two across', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await library(page, [])
  await gallery(page)
  await page.goto('/-/artifacts')
  const empty = page.getByText('Nothing here yet. What you make in Chat, Dev and Studio lands here.')
  await expect(empty).toBeVisible({ timeout: 45_000 })
  await empty.locator('..').getByRole('button', { name: 'Make something new' }).click()
  await expect(card(page, 'Metrics')).toBeVisible({ timeout: 15_000 })
  // Edge to edge: the page's own width (the root keeps a stable scrollbar gutter) and the window's height.
  const page_ = await page.evaluate(() => document.body.getBoundingClientRect().width)
  expect(await picker(page).boundingBox()).toEqual({ x: 0, y: 0, width: page_, height: 844 })
  const a = await card(page, 'Instrument Lab').boundingBox()
  const b = await card(page, 'Hyperion Tunnel').boundingBox()
  expect(a!.y).toBe(b!.y)
  expect(b!.x + b!.width).toBeLessThanOrEqual(390)
  expect.soft(await cramped(page)).toEqual([])
})
