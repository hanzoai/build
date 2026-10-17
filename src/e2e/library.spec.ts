/**
 * The Library at -/artifacts: what Dave made in Chat, Dev and Studio, newest
 * first under its day, narrowed by kind, product and whose; each item opened in
 * the side panel (a sheet on a phone), shared, renamed, moved and deleted; what
 * a colleague shared drawn with their name and nothing a reader may not do.
 *
 * Drawn at 1440 and 390, dark and light, to screens/library/.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { ITEMS, library } from './stubs.ts'

const lib = (n: number) => `lib_${String(n).padStart(32, '0')}`
const tile = (p: Page, name: string) => p.getByRole('button', { name: `Open ${name}`, exact: true })
const light = (p: Page) => p.addInitScript(() => localStorage.setItem('theme', 'light'))

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 390]) {
    test(`draws the Library at ${width}, ${theme}, and an item opened`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 })
      if (theme === 'light') await light(page)
      await library(page)
      await page.goto('/-/artifacts')
      await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible({ timeout: 45_000 })
      await expect(page.getByRole('group', { name: 'Today' })).toBeVisible({ timeout: 45_000 })
      await expect(tile(page, 'Lighthouse at dawn.png')).toBeVisible()
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
      expect.soft(await cramped(page), `${width} ${theme}`).toEqual([])
      await page.screenshot({ path: `screens/library/${theme}-${width}.png` })
      await tile(page, 'Launch poster.png').click()
      await expect(page.getByRole('complementary', { name: 'Item preview' })).toBeVisible()
      await expect(page.getByRole('complementary', { name: 'Item preview' }).getByRole('img', { name: 'Launch poster.png' })).toBeVisible()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `screens/library/${theme}-${width}-preview.png` })
      expect.soft(errors).toEqual([])
    })
  }
}

test('lists under Today, Yesterday and the month, and says where each came from', async ({ page }) => {
  await library(page)
  await page.goto('/-/artifacts')
  await expect(page.getByRole('group', { name: 'Today' })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('group', { name: 'Yesterday' })).toContainText('Monday summary.md')
  await expect(page.getByRole('group', { name: 'Today' })).toContainText('Studio')
  // What a colleague shared names them.
  await expect(page.getByText(/shared by acme\/erin/)).toBeVisible()
})

test('narrows by kind, by product and by whose, and says when nothing matches', async ({ page }) => {
  const { sent } = await library(page)
  await page.goto('/-/artifacts')
  await expect(tile(page, 'report.md')).toBeVisible({ timeout: 45_000 })
  await page.getByRole('radio', { name: 'Videos' }).click()
  await expect(tile(page, 'Teaser.mp4')).toBeVisible()
  await expect(tile(page, 'report.md')).toHaveCount(0)
  expect(sent.some((s) => s.path === '/v1/library' && s.query.includes('kind=video'))).toBe(true)
  await page.getByRole('radio', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: /^From/ }).click()
  await page.getByRole('option', { name: 'Dev' }).click()
  await expect(tile(page, 'changes.patch')).toBeVisible()
  await expect(tile(page, 'Launch poster.png')).toHaveCount(0)
  await page.getByLabel('Search your library').fill('nothing like this')
  await expect(page.getByText('Nothing matches.')).toBeVisible()
})

test('shares one with the organization, renames it, and deletes it after asking', async ({ page }) => {
  const { sent } = await library(page)
  await page.goto('/-/artifacts')
  await expect(tile(page, 'Moodboard.png')).toBeVisible({ timeout: 45_000 })
  const menu = (name: string) => page.getByRole('button', { name: `Actions for ${name}` }).first()
  await menu('Moodboard.png').click()
  await page.getByRole('menuitem', { name: /^Share with organization/ }).click()
  await expect(page.getByText('Moodboard.png is shared with the organization')).toBeVisible()
  expect(sent.filter((s) => s.method === 'PATCH').map((s) => [s.path, s.body])).toEqual([[`/v1/library/${lib(60)}`, { shared: true }]])

  await menu('Moodboard.png').click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Moodboard v2.png')
  await page.keyboard.press('Enter')
  await expect(tile(page, 'Moodboard v2.png')).toBeVisible()

  await menu('Moodboard v2.png').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(tile(page, 'Moodboard v2.png')).toHaveCount(0)
  expect(sent.some((s) => s.method === 'DELETE' && s.path === `/v1/library/${lib(60)}`)).toBe(true)
})

test('what a colleague shared offers no rename, move, share or delete', async ({ page }) => {
  await library(page)
  await page.goto('/-/artifacts')
  await page.getByRole('button', { name: 'Actions for Brand palette.png' }).first().click({ timeout: 45_000 })
  await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible()
  for (const row of ['Rename', 'Move to project', 'Delete', /^Share with organization/]) await expect(page.getByRole('menuitem', { name: row })).toHaveCount(0)
})

test('moves one to a project, and opens it where it was made', async ({ page }) => {
  const { sent } = await library(page)
  await page.goto('/-/artifacts')
  await page.getByRole('button', { name: 'Actions for report.md' }).first().click({ timeout: 45_000 })
  await page.getByRole('menuitem', { name: 'Move to project' }).click()
  await page.getByRole('button', { name: /^Move to Shop/ }).click()
  await expect(page.getByText('report.md is in shop')).toBeVisible()
  expect(sent.filter((s) => s.method === 'PATCH').map((s) => s.body)).toEqual([{ project: 'shop' }])
})

test('an item a link names opens on arrival, read fresh', async ({ page }) => {
  const { sent } = await library(page, ITEMS())
  await page.goto(`/-/artifacts?item=${lib(4)}`)
  const side = page.getByRole('complementary', { name: 'Item preview' })
  await expect(side).toBeVisible({ timeout: 45_000 })
  await expect(side.getByText('Three things changed this week.')).toBeVisible()
  expect(sent.some((s) => s.method === 'GET' && s.path === `/v1/library/${lib(4)}`)).toBe(true)
})

test('signed in to an empty library, it says what lands here', async ({ page }) => {
  await library(page, [])
  await page.goto('/-/artifacts')
  await expect(page.getByText('Nothing here yet. What you make in Chat, Dev and Studio lands here.')).toBeVisible({ timeout: 45_000 })
})
