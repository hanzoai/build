/**
 * A run's side panel, as the specs reach it: the region, and a tab chosen by
 * name — pressed where it is open, opened from `+` where it is not (Desktop and
 * Environment are not open on a run nobody has arranged).
 */
import { expect, type Locator, type Page } from '@playwright/test'

/** The panel: a column from md up, a sheet below. */
export const desk = (p: Page): Locator => p.getByRole('complementary', { name: 'Run details' })

/** One tab in the panel's strip. */
export const tab = (p: Page, name: string): Locator => desk(p).getByRole('tab', { name, exact: true })

/** Choose the tab `name`, opening it from `+` when it is not in the strip. Waits for the panel first: a loaded box signs in slowly. */
export async function open(p: Page, name: string): Promise<void> {
  await expect(desk(p)).toBeVisible({ timeout: 45_000 })
  if ((await tab(p, name).count()) === 0) {
    await desk(p).getByRole('button', { name: 'Open a tab' }).click()
    // A run that opens the tab itself (a setup run's Environment) may do it while the menu is open.
    const item = p.getByRole('menuitem', { name: new RegExp(`^${name}`) })
    await expect(item.or(tab(p, name))).toBeVisible()
    if ((await item.count()) > 0) await item.click()
    else await p.keyboard.press('Escape')
  }
  await tab(p, name).click()
  await expect(tab(p, name)).toHaveAttribute('aria-selected', 'true')
}

/** The tabs in the strip, in order. */
export const tabs = (p: Page): Promise<string[]> => desk(p).getByRole('tab').allTextContents()
