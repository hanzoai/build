/**
 * This computer (hanzo-inc/app issues 309 and 310): on a host that has the computer, New offers it first, with Auto
 * picking the folder the ask is about, else the one used last; a run there needs no repository and no GitHub, and
 * goes to the host's own runner, never to the platform. What the agent said is drawn in words, and what it did only in
 * Developer mode. Driven through the host page (/src/e2e/host.html), whose `?local=<n>` hands the builder a computer
 * with n folders.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { signIn, type Sent } from './signed.ts'

const HOST = '/src/e2e/host.html'
const chip = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}: `) })
const list = (page: Page, name: string) => page.getByRole('listbox', { name })
const ask = (page: Page) => page.getByRole('textbox', { name: 'Describe a task or ask a question' })
const runs = (page: Page) => page.getByLabel('Runs on this computer')
const platform = (sent: Sent[]) => sent.filter((s) => s.method === 'POST' && (s.path === '/v1/agent/turns' || s.path === '/v1/agent/coding'))

const quiet = (page: Page) =>
  signIn(page, ({ path }) => {
    if (path === '/v1/agent/sessions') return { json: { sessions: [], next: '' } }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === '/v1/agent/targets') return { json: { targets: [] } }
    return undefined
  })

test.describe('This computer', () => {
  test('is where New starts on a host that has it, in the folder used last, with no repository asked for', async ({ page }, info) => {
    const sent = await quiet(page)
    await page.goto(`${HOST}?local=2`)
    await expect(chip(page, 'Where the run runs')).toHaveAccessibleName('Where the run runs: This computer', { timeout: 45_000 })
    // Auto is the folder used last; a repository is not offered for a folder on this computer.
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · f2')
    await expect(chip(page, 'Repository')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('here.png') })
    await ask(page).fill('Fix the typo in the README')
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/f2 <- Fix the typo in the README')
    await expect(page.locator('[data-slot="ran-here"]')).toContainText('Done in f2')
    await expect(page.locator('[data-slot="ran-here"]')).toContainText('Edited README.md in f2')
    await expect(ask(page)).toHaveValue('')
    // Nothing went to the platform: the run is the computer's.
    expect(platform(sent)).toHaveLength(0)
    await page.screenshot({ path: info.outputPath('here-done.png') })
  })

  test('a different folder is one choice away, and Auto goes back to the one used last', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=2`)
    await chip(page, 'Folder').click({ timeout: 45_000 })
    await list(page, 'Folder').getByRole('option', { name: /^f1/ }).click()
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: f1')
    await ask(page).fill('Add a test')
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/f1 <- Add a test')
    // f1 is now the folder used last, so Auto picks it.
    await chip(page, 'Folder').click()
    await list(page, 'Folder').getByRole('option', { name: /^Auto/ }).click()
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · f1')
    // Choose folder… opens the computer's own dialog, and its folder is the one chosen.
    await chip(page, 'Folder').click()
    await page.getByRole('link', { name: 'Choose folder…' }).click()
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: picked')
  })

  test('a computer that opened no folder asks for one, once, on the first send', async ({ page }) => {
    const sent = await quiet(page)
    await page.goto(`${HOST}?local=0`)
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Choose folder…', { timeout: 45_000 })
    await ask(page).fill('Make a landing page here')
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/picked <- Make a landing page here')
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · picked')
    expect(platform(sent)).toHaveLength(0)
  })

  test('the cloud workspace and the machines are still a choice away, and a browser page without a computer never offers it', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1`)
    await chip(page, 'Where the run runs').click({ timeout: 45_000 })
    await list(page, 'Where the run runs').getByRole('option', { name: /Auto \(Cloud\)/ }).click()
    await expect(chip(page, 'Where the run runs')).toHaveAccessibleName('Where the run runs: Auto (Cloud)')
    await expect(chip(page, 'Repository')).toBeVisible()
    await expect(chip(page, 'Folder')).toHaveCount(0)
    await page.goto(HOST)
    await chip(page, 'Where the run runs').click({ timeout: 45_000 })
    await expect(list(page, 'Where the run runs').getByRole('option', { name: /This computer/ })).toHaveCount(0)
  })

  test('Auto follows the ask: the pill names the folder the words are about, live, and Send goes there', async ({ page }) => {
    const sent = await quiet(page)
    await page.goto(`${HOST}?local=0&folders=shop,docs,blog`)
    // Nothing typed: the folder used last.
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · blog', { timeout: 45_000 })
    await ask(page).fill('Fix the checkout button in shop')
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · shop')
    await ask(page).fill('Fix the typo in the docs')
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · docs')
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/docs <- Fix the typo in the docs')
    // A folder the person chose is not moved by the words.
    await chip(page, 'Folder').click()
    await list(page, 'Folder').getByRole('option', { name: /^shop/ }).click()
    await ask(page).fill('Write a post on my blog')
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: shop')
    expect(platform(sent)).toHaveLength(0)
  })

  test('the folders the computer finds later are offered, and Auto can pick one the person never opened', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=0&folders=blog&found=portfolio`)
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · blog', { timeout: 45_000 })
    await ask(page).fill('Redo my portfolio homepage')
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · portfolio')
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/portfolio <- Redo my portfolio homepage')
  })

  test('the answer is in words, and the process only in Developer mode', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1`)
    await ask(page).fill('Add a checkout page')
    await ask(page).press('Enter')
    const here = page.locator('[data-slot="ran-here"]')
    await expect(here).toContainText('Done in f1', { timeout: 45_000 })
    await expect(here.locator('[data-slot="ran-answer"]')).toHaveText('Edited README.md in f1')
    await expect(here).not.toContainText('bash -lc')
    await expect(here).not.toContainText('~')
    await expect(here.locator('[data-slot="ran-process"]')).toHaveCount(0)
    // Developer mode shows what the agent did, as it ran it.
    await page.evaluate(() => {
      window.localStorage.setItem('hanzo.dev_mode', 'true')
      window.dispatchEvent(new CustomEvent('hanzo:dev-mode', { detail: { enabled: true } }))
    })
    await expect(here.locator('[data-slot="ran-process"]')).toContainText("exec bash -lc 'ls ~' in /Users/dave/f1")
  })

  test('the first run says it is setting Hanzo Dev up, then runs', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1&setup=1`)
    await ask(page).fill('Add a checkout page')
    await ask(page).press('Enter')
    const here = page.locator('[data-slot="ran-here"]')
    await expect(here.locator('[data-slot="ran-setup"]')).toHaveText('Setting up Hanzo Dev on this computer… 40%', { timeout: 45_000 })
    await expect(here).toContainText('Working in f1…')
    await page.getByRole('button', { name: 'Finish setup' }).click()
    await expect(here).toContainText('Done in f1')
    await expect(here.locator('[data-slot="ran-setup"]')).toHaveCount(0)
  })

  test('the first-run download can be cancelled: a plain line, and no run is started on the platform', async ({ page }) => {
    const sent = await quiet(page)
    await page.goto(`${HOST}?local=1&setup=1`)
    await ask(page).fill('Add a checkout page')
    await ask(page).press('Enter')
    const here = page.locator('[data-slot="ran-here"]')
    await expect(here.locator('[data-slot="ran-setup"]')).toHaveText('Setting up Hanzo Dev on this computer… 40%', { timeout: 45_000 })
    await here.getByRole('button', { name: 'Cancel' }).click()
    // The run is gone, and the person is told in words that were their own choice, not shown a failure.
    await expect(here).toHaveCount(0)
    await expect(page.getByText('Setup was cancelled. Send again whenever you like.')).toBeVisible()
    await expect(page.getByText('cancel setup')).toBeVisible()
    expect(sent.filter((s) => s.method === 'POST' && s.path.startsWith('/v1/agent'))).toEqual([])
    // Sending again starts the setup again.
    await ask(page).press('Enter')
    await expect(page.locator('[data-slot="ran-here"] [data-slot="ran-setup"]')).toHaveText('Setting up Hanzo Dev on this computer… 40%', { timeout: 45_000 })
  })
})
