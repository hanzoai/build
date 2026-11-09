/**
 * Clone yourself: the Big Five questionnaire on a phone and on a wide window,
 * kept in this browser as it is answered, its result seeding the instructions
 * the agent is made with. Signed in against the stubbed platform (stubs.ts).
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { catalogue, customize } from './stubs.ts'

async function clone(page: Page) {
  await catalogue(page)
  const sent = await customize(page)
  await page.goto('/-/customize/agents')
  await page.getByRole('button', { name: 'Clone yourself' }).click()
  return sent
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Clone yourself' })

test('a phone gets the whole screen, one statement at a time, and a closed dialog resumes where it stopped', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const sent = await clone(page)
  const sheet = dialog(page)
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(300)
  expect(await sheet.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 })
  expect(await cramped(page)).toEqual([])
  // The dialog holds the focus as it opens, so the close control wears no ring; it is a 44px target.
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('dialog')
  const close = sheet.getByRole('button', { name: 'Close' })
  expect(await close.boundingBox()).toMatchObject({ width: 44, height: 44 })
  await page.screenshot({ path: info.outputPath('phone-clone.png') })

  await sheet.getByRole('button', { name: 'Start' }).click()
  await expect(sheet.getByText('Am the life of the party.')).toBeVisible()
  await expect(sheet.getByText('0 of 50')).toBeVisible()
  await sheet.getByRole('radio', { name: 'Very accurate' }).click()
  await expect(sheet.getByText('Feel little concern for others.')).toBeVisible()
  await page.keyboard.press('2')
  await page.keyboard.press('4')
  await expect(sheet.getByText('Get stressed out easily.')).toBeVisible()
  await expect(sheet.getByRole('progressbar', { name: 'Answered' })).toHaveAttribute('aria-valuenow', '3')
  await sheet.getByRole('button', { name: 'Back' }).click()
  await expect(sheet.getByRole('radio', { name: 'Moderately accurate' })).toHaveAttribute('aria-checked', 'true')
  expect(await cramped(page)).toEqual([])
  await page.screenshot({ path: info.outputPath('phone-statement.png') })

  // Closed, and the page loaded again: the answers were kept as they were given.
  await close.click()
  await expect(sheet).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Clone yourself' }).click()
  await sheet.getByRole('button', { name: 'Resume, 3 of 50' }).click()
  await expect(sheet.getByText('Get stressed out easily.')).toBeVisible()

  // The rest, all 5. By the published key: E 3.0; A 3.7 (item 2, minus, answered 2, counts 4); C 3.3 (item 3 answered 4); N 4.2; O 3.8.
  for (let i = 3; i < 50; i++) await page.keyboard.press('5')
  await expect(sheet.getByRole('meter', { name: 'Neuroticism' })).toHaveAttribute('aria-valuetext', '4.2')
  await expect(sheet.getByRole('meter')).toHaveCount(5)
  const instructions = await sheet.getByLabel('Instructions').inputValue()
  expect(instructions).toContain('How Dave thinks and writes:')
  expect(instructions).toContain('Big Five (IPIP 50-item Big-Five markers, means on 1 to 5): Openness 3.8, Conscientiousness 3.3, Extraversion 3.0, Agreeableness 3.7, Neuroticism 4.2.')
  expect(await cramped(page)).toEqual([])
  await page.screenshot({ path: info.outputPath('phone-traits.png'), fullPage: true })

  await sheet.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/-\/customize\/agents\/Dave$/)
  expect(sent.filter((s) => s.method === 'POST' && s.path === '/v1/agent').at(-1)?.body).toMatchObject({ name: 'Dave', instructions })
})

test('a wide window lists the 120 with their facets, and the instructions are edited before the agent is made', async ({ page }, info) => {
  const sent = await clone(page)
  const sheet = dialog(page)
  await sheet.getByRole('button', { name: '120 statements' }).click()
  await sheet.getByRole('button', { name: 'Start' }).click()
  const list = sheet.getByRole('list', { name: 'Statements' })
  await expect(list.getByRole('listitem')).toHaveCount(120)
  await list.getByRole('radiogroup', { name: 'Worry about things.' }).getByRole('radio', { name: 'Very inaccurate' }).click()
  // The keys answer the first statement left, here the second.
  for (let i = 1; i < 120; i++) await page.keyboard.press('3')
  await expect(sheet.getByText('120 of 120')).toBeVisible()
  await page.screenshot({ path: info.outputPath('wide-list.png') })
  await sheet.getByRole('button', { name: 'Done' }).click()

  await expect(sheet.getByRole('meter')).toHaveCount(35)
  // Anxiety's four answers: 1, 3, 3, 3.
  await expect(sheet.getByRole('meter', { name: 'Anxiety' })).toHaveAttribute('aria-valuetext', '2.5')
  await expect(sheet.getByRole('meter', { name: 'Openness' })).toHaveAttribute('aria-valuetext', '3.0')
  await page.screenshot({ path: info.outputPath('wide-traits.png') })

  const field = sheet.getByLabel('Instructions')
  await expect(field).toHaveValue(/Big Five \(IPIP-NEO-120, means on 1 to 5\): .*Neuroticism 2\.9\./)
  const edited = `${await field.inputValue()}\n\nKeep it short.`
  await field.fill(edited)
  await sheet.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/-\/customize\/agents\/Dave$/)
  expect(sent.filter((s) => s.method === 'POST' && s.path === '/v1/agent').at(-1)?.body).toMatchObject({ instructions: edited })
})
