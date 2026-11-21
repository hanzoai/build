/**
 * This computer (hanzo-inc/app issues 309 and 310): on a host that has the computer, New offers it first, with Auto
 * picking the folder used last; a run there needs no repository and no GitHub, and goes to the host's own runner,
 * never to the platform. Driven through the host page (/src/e2e/host.html), whose `?local=<n>` hands the builder a
 * computer with n folders.
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
    await expect(page.locator('[data-slot="ran-here"]')).toContainText('Edited README.md in /Users/dave/f2')
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
})
