/**
 * Setting a codebase's environment up from New, signed in as an org admin
 * against a stubbed platform (signed.ts).
 */
import { expect, test, type Page } from '@playwright/test'

import { ORG, REPO, SESSION, signIn } from './signed.ts'

/** New holding the codebase, which has no environment; a save keeps it, a run starts. */
function platform(page: Page) {
  const env = { repo: REPO, install: '', start: '', secrets: [] as string[], state: 'none', session: '', proposal: null }
  return signIn(
    page,
    ({ method, path, body }) => {
      if (path === `/v1/environment/${REPO}` && method === 'PUT') {
        Object.assign(env, body, { state: 'ready' })
        return { json: env }
      }
      if (path === `/v1/environment/${REPO}`) return { json: env }
      if (path === '/v1/agent/coding') return { status: 202, json: { sessionId: SESSION, repo: REPO, branch: '' } }
      return undefined
    },
    {
      [`hanzo.build.new.${ORG}`]: {
        repo: { owner: ORG, name: REPO, full_name: `${ORG}/${REPO}`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: '' },
        branch: 'main',
        place: '',
        mode: 'build',
        model: '',
        effort: 'medium',
        ask: '',
      },
    },
  )
}

test('New offers to set up a codebase that has no environment', async ({ page }, info) => {
  await platform(page)
  await page.goto('/')
  await expect(page.getByText(`${REPO} has no environment yet, so every run starts it bare.`)).toBeVisible()
  await page.getByRole('button', { name: 'Set up environment' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Set up an environment')).toBeVisible()
  await expect(dialog.getByText(REPO, { exact: true })).toBeVisible()
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
