/**
 * Scheduled tasks at -/automations: Dave's tasks from Chat, Dev and workflows,
 * each paused and resumed by its switch and run now from its menu; Activity,
 * every run across products, kept live by the events stream; a run opened; and
 * a new task said in plain words, read back by the platform before it is made.
 *
 * Drawn at 1440 and 390, dark and light, to screens/scheduled/.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { scheduled } from './stubs.ts'

const flow = (n: number) => `flow_${String(n).padStart(32, '0')}`
const light = (p: Page) => p.addInitScript(() => localStorage.setItem('theme', 'light'))
const activity = (p: Page) => p.getByRole('list', { name: 'Activity' })

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 390]) {
    test(`draws Scheduled tasks at ${width}, ${theme}, a run opened and a new task`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 })
      if (theme === 'light') await light(page)
      await scheduled(page)
      await page.goto('/-/automations')
      await expect(page.getByRole('heading', { name: 'Scheduled tasks', exact: true })).toBeVisible({ timeout: 45_000 })
      await expect(page.getByRole('button', { name: 'Open Monday summary' })).toBeVisible()
      await expect(activity(page)).toBeVisible()
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
      expect.soft(await cramped(page), `${width} ${theme}`).toEqual([])
      await page.screenshot({ path: `screens/scheduled/${theme}-${width}.png`, fullPage: true })
      await activity(page)
        .getByRole('button', { name: /^Teaser/ })
        .click()
      await expect(page.getByText('The video model is not answering right now.')).toBeVisible()
      await page.screenshot({ path: `screens/scheduled/${theme}-${width}-run.png` })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'New task' }).first().click()
      await page.getByLabel('What it does').fill('Summarize what changed in my repositories this week.')
      await page.getByLabel('When it runs').fill('every monday at 9am')
      await expect(page.getByRole('dialog', { name: 'New task' }).getByRole('status')).toContainText('Mondays at 09:00')
      await page.screenshot({ path: `screens/scheduled/${theme}-${width}-new.png` })
      expect.soft(errors).toEqual([])
    })
  }
}

test('each task says when it runs next and where it came from; its switch pauses and resumes it alone', async ({ page }) => {
  const { sent } = await scheduled(page)
  await page.goto('/-/automations')
  const row = (name: string) => page.getByRole('button', { name: `Open ${name}` })
  await expect(row('Monday summary')).toContainText('Mondays at 09:00 · America/Los_Angeles', { timeout: 45_000 })
  await expect(row('Monday summary')).toContainText('Chat')
  await expect(row('Weekly digest')).toContainText('paused')
  await page.getByRole('switch', { name: 'Monday summary on' }).click()
  await expect(page.getByRole('switch', { name: 'Monday summary on' })).not.toBeChecked()
  await page.getByRole('switch', { name: 'Weekly digest on' }).click()
  await expect(page.getByRole('switch', { name: 'Weekly digest on' })).toBeChecked()
  expect(sent.filter((s) => s.method === 'PATCH').map((s) => [s.path, s.body])).toEqual([
    [`/v1/auto/automations/${flow(1)}`, { enabled: false }],
    [`/v1/auto/automations/${flow(3)}`, { enabled: true }],
  ])
})

test('Run now starts one from the menu, and Edit opens its editor', async ({ page }) => {
  const { sent } = await scheduled(page)
  await page.goto('/-/automations')
  await page.getByRole('button', { name: 'Actions for Monday summary' }).click({ timeout: 45_000 })
  await page.getByRole('menuitem', { name: 'Run now' }).click()
  await expect.poll(() => sent.some((s) => s.method === 'POST' && s.path === `/v1/auto/automations/${flow(1)}/run`)).toBe(true)
  await page.getByRole('button', { name: 'Actions for Monday summary' }).click()
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page).toHaveURL(new RegExp(`/-/automations/${flow(1)}$`))
})

test('Activity lists runs across products and the stream moves a running one to done, with what it made', async ({ page }) => {
  await scheduled(page)
  await page.goto('/-/automations')
  await expect(activity(page).getByRole('button', { name: /^Launch poster: Running/ })).toContainText('62%', { timeout: 45_000 })
  await expect(activity(page).getByRole('button', { name: /^Check the build every 5 minutes: Succeeded/ })).toContainText('1 output')
  // The stream says Monday summary finished.
  await expect(activity(page).getByRole('button', { name: /^Monday summary: Succeeded/ })).toBeVisible()
  await activity(page)
    .getByRole('button', { name: /^Monday summary/ })
    .click()
  await expect(page.getByText('Three repositories changed; one needs you.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Monday summary.md in the Library' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open its log' })).toBeVisible()
})

test('a new task is said in plain words, read back, and made from Dev with what it holds', async ({ page }) => {
  const { sent } = await scheduled(page)
  await page.goto('/-/automations')
  await page.getByRole('button', { name: 'New task' }).first().click({ timeout: 45_000 })
  await page.getByLabel('What it does').fill('Is main green?\nSay which test broke.')
  await expect(page.getByLabel('Task name')).toHaveValue('')
  await page.getByLabel('Task name').fill('Build check')
  await page.getByLabel('When it runs').fill('every 5 minutes')
  await expect(page.getByRole('dialog', { name: 'New task' }).getByRole('status')).toContainText('Every 5 minutes')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Scheduled: Build check.')).toBeVisible()
  const made = sent.find((s) => s.method === 'POST' && s.path === '/v1/auto/automations')!
  expect(made.body).toMatchObject({
    name: 'Build check',
    instructions: 'Is main green?\nSay which test broke.',
    schedule: { kind: 'cron', cron: '*/5 * * * *' },
    source: 'dev',
    permissions: 'ask',
    enabled: true,
  })
  expect(sent.some((s) => s.path === '/v1/auto/cron' && (s.body as { tz?: string }).tz)).toBe(true)
})

test('words the platform cannot read say so, and the schedule can be chosen instead', async ({ page }) => {
  await scheduled(page)
  await page.goto('/-/automations')
  await page.getByRole('button', { name: 'New task' }).first().click({ timeout: 45_000 })
  await page.getByLabel('When it runs').fill('whenever the moon is full')
  await expect(page.getByRole('dialog', { name: 'New task' }).getByRole('status')).toContainText('That is not a time I can read. Choose instead')
  await page.getByRole('button', { name: 'Choose instead' }).click()
  await expect(page.getByRole('button', { name: /^When it runs/ })).toBeVisible()
})

test("Dev's Schedule this arrives with the run's ask in a new task", async ({ page }) => {
  await scheduled(page)
  await page.addInitScript(() => sessionStorage.setItem('hanzo.build.scheduled.ask', 'Bump what is behind and open a pull request'))
  await page.goto('/-/automations')
  await expect(page.getByLabel('What it does')).toHaveValue('Bump what is behind and open a pull request', { timeout: 45_000 })
  await expect(page.getByLabel('Task name')).toHaveValue('Bump what is behind and open a pull request')
})

test('with nothing scheduled it says how a task begins', async ({ page }) => {
  await scheduled(page, { tasks: [], jobs: [] })
  await page.goto('/-/automations')
  await expect(page.getByText('No scheduled tasks yet. Ask Chat or Dev to do something on a schedule, or start one here.')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(/Nothing has run yet/)).toBeVisible()
})
