/**
 * Redesign a site from its address (hanzo-inc/app issue 312, hanzoai/desktop issue 15): on a host that has the computer
 * and can open a site, an address pasted in New is offered as a redesign; one press has the host open the site and save a
 * copy, serve the redesign live and show it in Chrome, and the agent critique and build it in a new folder. An ask that
 * only holds a link is sent as it is. Driven through the host page (/src/e2e/host.html): `?local=<n>` hands the builder
 * the computer, `?site=<mode>` the host's way of redesigning a site.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { signIn, type Sent } from './signed.ts'

const HOST = '/src/e2e/host.html'
const ask = (page: Page) => page.getByRole('textbox', { name: 'Describe a task or ask a question' })
const runs = (page: Page) => page.getByLabel('Runs on this computer')
const steps = (page: Page) => page.getByLabel('Redesign steps')
const offer = (page: Page) => page.locator('[data-slot="redesign-offer"]')
const card = (page: Page) => page.locator('[data-slot="redesign"]')
const platform = (sent: Sent[]) => sent.filter((s) => s.method === 'POST' && (s.path === '/v1/agent/turns' || s.path === '/v1/agent/coding'))

const quiet = (page: Page) =>
  signIn(page, ({ path }) => {
    if (path === '/v1/agent/sessions') return { json: { sessions: [], next: '' } }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === '/v1/agent/targets') return { json: { targets: [] } }
    return undefined
  })

test.describe('Redesign a site', () => {
  test('an address pasted alone is offered, and one press opens the site, serves the redesign and has the agent build it', async ({ page }, info) => {
    const sent = await quiet(page)
    await page.goto(`${HOST}?local=2&site=ok`)
    await ask(page).fill('https://www.acme.test/plumbing', { timeout: 45_000 })
    await expect(offer(page)).toContainText('Redesign acme.test?')
    await expect(offer(page)).toContainText('Hanzo opens it, reviews it, and builds a new version here while you watch it in Chrome.')
    await page.screenshot({ path: info.outputPath('redesign-offer.png') })

    await offer(page).getByRole('button', { name: 'Redesign this site' }).click()
    await expect(card(page)).toContainText('Redesigned acme.test')
    // The steps, in order: a new folder named for the site, the site saved into it, the redesign served, then shown.
    await expect(steps(page)).toHaveText(
      'folder acme-redesign | capture https://www.acme.test/plumbing -> /Users/dave/Documents/Hanzo/acme-redesign | preview /Users/dave/Documents/Hanzo/acme-redesign | show http://127.0.0.1:9933/',
    )
    // The agent is sent to that folder with what was saved and what to do.
    const run = await runs(page).textContent()
    expect(run).toContain('/Users/dave/Documents/Hanzo/acme-redesign <- Redesign the website https://www.acme.test/plumbing (Acme Plumbing).')
    expect(run).toContain('- .hanzo/reference/text.md:')
    expect(run).toContain('- .hanzo/reference/style-1.css: one of its stylesheets')
    expect(run).not.toContain('screenshot')
    expect(run).toContain('Do not start a server and do not use the network')
    // The card says where it is, how to see it, and what the agent said; the ask was taken.
    await expect(card(page)).toContainText('Live preview: http://127.0.0.1:9933/')
    await expect(card(page)).toContainText('/Users/dave/Documents/Hanzo/acme-redesign')
    await expect(card(page)).toContainText('The page is cluttered. I rebuilt it around one clear call to action.')
    await expect(ask(page)).toHaveValue('')
    await expect(offer(page)).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('redesign-done.png') })

    // Open in Chrome shows the same address again.
    await card(page).getByRole('button', { name: 'Open in Chrome' }).click()
    await expect(steps(page)).toContainText('show http://127.0.0.1:9933/ | show http://127.0.0.1:9933/')
    // The redesign's folder is now the one Auto picks, so the next ask goes to it and the preview follows its files.
    await expect(page.getByRole('button', { name: /^Folder: / })).toHaveAccessibleName('Folder: Auto · acme-redesign')
    // Nothing went to the platform.
    expect(platform(sent)).toHaveLength(0)
  })

  test('Enter on an address alone starts it too, and "redesign <address> and …" keeps what was said', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1&site=ok`)
    await ask(page).fill('Redesign shop.acme.com and make it darker', { timeout: 45_000 })
    await expect(offer(page)).toContainText('Redesign shop.acme.com?')
    await ask(page).press('Enter')
    await expect(card(page)).toContainText('Redesigned shop.acme.com')
    await expect(steps(page)).toContainText('folder shop-acme-redesign')
    await expect(runs(page)).toContainText('The person added: “Redesign and make it darker”')
  })

  test('an ask that only holds a link is a normal run, with no offer', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1&site=ok`)
    await ask(page).fill('What does https://acme.test say about pricing?', { timeout: 45_000 })
    await expect(offer(page)).toHaveCount(0)
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/f1 <- What does https://acme.test say about pricing?')
    await expect(steps(page)).toHaveText('')
    await expect(card(page)).toHaveCount(0)
  })

  test('a folder the person chose is built in, and no new one is made', async ({ page }) => {
    await quiet(page)
    await page.goto(`${HOST}?local=2&site=ok`)
    await page.getByRole('button', { name: /^Folder: / }).click({ timeout: 45_000 })
    await page.getByRole('listbox', { name: 'Folder' }).getByRole('option', { name: /^f1/ }).click()
    await ask(page).fill('acme.com')
    await ask(page).press('Enter')
    await expect(card(page)).toContainText('Redesigned acme.com')
    await expect(steps(page)).toHaveText('capture https://acme.com/ -> /Users/dave/f1 | preview /Users/dave/f1 | show http://127.0.0.1:9933/')
    await expect(runs(page)).toContainText('/Users/dave/f1 <- Redesign the website')
  })

  test('a site that will not open is said in plain words, nothing is built, and the person can try again', async ({ page }, info) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1&site=fail`)
    await ask(page).fill('https://slow.test', { timeout: 45_000 })
    await ask(page).press('Enter')
    await expect(card(page)).toContainText('Could not redesign slow.test')
    await expect(card(page)).toContainText('The site took too long to answer.')
    await expect(steps(page)).toContainText('capture https://slow.test/')
    await expect(steps(page)).not.toContainText('preview')
    await expect(runs(page)).toHaveText('')
    await expect(card(page).getByRole('button', { name: 'Open in Chrome' })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('redesign-failed.png') })
    // Nothing is stuck: the composer takes another ask.
    await expect(ask(page)).toBeEditable()
    await ask(page).fill('Fix the typo')
    await ask(page).press('Enter')
    await expect(runs(page)).toHaveText('/Users/dave/f1 <- Fix the typo')
  })

  test('Redesign a site… asks for the address, and refuses what is not one', async ({ page }, info) => {
    await quiet(page)
    await page.goto(`${HOST}?local=1&site=ok`)
    await ask(page).focus({ timeout: 45_000 })
    await page.keyboard.press('Control+k')
    await page.getByRole('listbox', { name: 'Commands' }).getByRole('option', { name: /Redesign a site/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Redesign a site' })
    await expect(dialog).toBeVisible()
    await page.screenshot({ path: info.outputPath('redesign-ask.png') })
    await dialog.getByRole('textbox', { name: 'Site address' }).fill('not a site')
    await dialog.getByRole('button', { name: 'Redesign', exact: true }).click()
    await expect(dialog).toContainText('Paste a site’s address, like https://example.com.')
    await dialog.getByRole('textbox', { name: 'Site address' }).fill('example.com')
    await dialog.getByRole('textbox', { name: 'Site address' }).press('Enter')
    await expect(card(page)).toContainText('Redesigned example.com')
    await expect(steps(page)).toContainText('folder example-redesign')
  })

  test('a host that cannot open a site offers nothing of it, and neither does a computer on another place', async ({ page }) => {
    await quiet(page)
    // The computer, but no way to open a site.
    await page.goto(`${HOST}?local=1`)
    await ask(page).fill('https://acme.test', { timeout: 45_000 })
    await expect(offer(page)).toHaveCount(0)
    await ask(page).focus()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('listbox', { name: 'Commands' }).getByRole('option', { name: /Redesign a site/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    // A site-capable host, with the run sent to the cloud workspace instead of this computer.
    await page.goto(`${HOST}?local=1&site=ok`)
    await page.getByRole('button', { name: /^Where the run runs: / }).click({ timeout: 45_000 })
    await page.getByRole('listbox', { name: 'Where the run runs' }).getByRole('option', { name: /Auto \(Cloud\)/ }).click()
    await ask(page).fill('https://acme.test')
    await expect(offer(page)).toHaveCount(0)
  })
})
