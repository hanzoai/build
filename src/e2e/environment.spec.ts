/**
 * Setting a codebase's environment up from New, signed in as an org admin
 * against a stubbed platform (stubs.ts).
 */
import { expect, test } from './fixture.ts'
import { ORG, REPO, SESSION } from './signed.ts'
import { setup as platform } from './stubs.ts'

test('New offers to set up a codebase that has no environment', async ({ page }, info) => {
  await platform(page)
  await page.goto('/')
  await expect(page.getByText(`${REPO} has no environment yet, so every run starts it bare.`)).toBeVisible()
  await page.getByRole('button', { name: 'Set up environment' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Set up an environment')).toBeVisible()
  await expect(dialog.getByLabel('Chosen repository')).toHaveText(`${ORG}/${REPO}`)
  await expect(dialog.getByRole('button', { name: 'Skip & save' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Start agent' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('setup-dialog.png') })
})

test('Skip & save keeps an empty environment and the offer goes away', async ({ page }) => {
  const sent = await platform(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Set up environment' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Skip & save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(`${REPO} has no environment yet`)).toHaveCount(0)
  expect(sent).toContainEqual({ method: 'PUT', path: `/v1/environment/${REPO}`, query: '', body: { install: '', start: '' } })
})

test('Start agent opens a setup run titled by its first line', async ({ page }) => {
  const sent = await platform(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Set up environment' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start agent' }).click()
  await expect(page).toHaveURL(new RegExp(`/${SESSION}$`))
  const run = sent.find((s) => s.method === 'POST' && s.path === '/v1/agent/coding')
  const body = run?.body as { mode?: string; repo?: string; prompt?: string }
  expect(body.mode).toBe('setup')
  expect(body.repo).toBe(REPO)
  expect(body.prompt?.split('\n')[0]).toBe('Set up the environment')
})
