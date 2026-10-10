/**
 * The rail's places (nav.tsx): every one in view without opening anything — no
 * More — and each one moves to its own address and is marked as where you are.
 * On a laptop's 1440×900 the rail is beside the page; on a 390 phone it is the
 * drawer the menu button opens, and a place chosen there puts it away.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { rail as platform } from './stubs.ts'

/** Each place, the address it moves to, and what the page there says. */
const PLACES: [string, RegExp][] = [
  ['Projects', /\/-\/projects$/],
  ['Issues', /\/-\/issues$/],
  ['Artifacts', /\/-\/artifacts$/],
  ['Templates', /\/-\/templates$/],
  ['Automations', /\/-\/automations$/],
  ['Machines', /\/-\/settings\/machines$/],
  ['Environments', /\/-\/settings\/environments$/],
  ['Customize', /\/-\/customize$/],
]

const nav = (page: Page) => page.getByRole('navigation', { name: 'Runs' }).filter({ visible: true }).first()
const place = (page: Page, label: string) => nav(page).locator('[data-slot="rail-row"], [data-slot="rail-new"]').filter({ hasText: new RegExp(`^${label}$`) })

for (const [size, box] of [
  ['laptop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test.describe(size, () => {
    test.use({ viewport: box })
    const open = async (page: Page) => {
      if (size === 'phone') await page.getByRole('button', { name: 'Open runs' }).click()
    }

    test('every place is in view at once, with no More to open', async ({ page }, info) => {
      await platform(page)
      await page.goto('/')
      await open(page)
      for (const label of ['New', ...PLACES.map(([l]) => l), 'Docs']) await expect(place(page, label), label).toBeInViewport()
      await expect(page.locator('[data-slot="rail-more"]')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath(`${size}-places.png`) })
    })

    test('each place moves to its own address and is marked as where you are', async ({ page }) => {
      await platform(page)
      await page.goto('/')
      for (const [label, at] of PLACES) {
        await open(page)
        await place(page, label).click()
        await expect(page, label).toHaveURL(at)
        // A phone's drawer is the way to a place, not a place: choosing one puts it away.
        if (size === 'phone') await expect(page.getByRole('button', { name: 'Open runs' })).toBeVisible()
        await open(page)
        await expect(place(page, label), label).toHaveAttribute('aria-current', 'page')
        if (size === 'phone') await page.keyboard.press('Escape')
      }
      await open(page)
      await place(page, 'New').click()
      await expect(page).toHaveURL(/\/$/)
    })

    test('Docs opens in a tab of its own and the builder stays where it was', async ({ page }) => {
      await platform(page)
      await page.goto('/-/artifacts')
      await open(page)
      const [docs] = await Promise.all([page.waitForEvent('popup'), place(page, 'Docs').click()])
      expect(new URL(docs.url()).hostname).toBe('docs.hanzo.ai')
      await docs.close()
      await expect(page).toHaveURL(/\/-\/artifacts$/)
    })
  })
}
