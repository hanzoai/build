/**
 * The builder's own spend question (spend.tsx), as a spec answers it: on a host
 * that gives no `confirm` every press that spends opens it first.
 */
import type { Page } from '@playwright/test'

import { expect } from './fixture.ts'

export const asking = (page: Page) => page.getByRole('alertdialog')

/** The question is open and says `title`; Cancel shuts it. Nothing may have been spent by then. */
export async function decline(page: Page, title: string | RegExp): Promise<void> {
  await expect(asking(page)).toContainText(title)
  await asking(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(asking(page)).toHaveCount(0)
}

/** The question is open and says `title`; its yes, `yes`, is pressed. */
export async function accept(page: Page, title: string | RegExp, yes: string): Promise<void> {
  await expect(asking(page)).toContainText(title)
  await asking(page).getByRole('button', { name: yes, exact: true }).click()
  await expect(asking(page)).toHaveCount(0)
}
