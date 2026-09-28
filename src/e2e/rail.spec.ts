/**
 * The rail, Artifacts and the Code settings, signed in as an org admin against a
 * stubbed platform (stubs.ts): every control drawn here is driven, and what it
 * sends is checked.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { rail as platform } from './stubs.ts'

/** Choose a row of the menu that is open. */
async function pick(page: Page, row: string) {
  await page.getByRole('menuitem', { name: new RegExp(`^${row}`) }).click()
}

/** The rail's rows, top to bottom, as they read. */
async function rows(page: Page): Promise<string[]> {
  return page
    .getByRole('navigation', { name: 'Runs' })
    .first()
    .locator('[data-slot="rail-new"], [data-slot="rail-row"], [data-slot="rail-more"]')
    .allInnerTexts()
}

test.describe('the rail', () => {
  test('lists New, Projects, Artifacts, then Automations, with the rest under More', async ({ page }, info) => {
    await platform(page)
    await page.goto('/')
    await expect(page.getByText('Try Hanzo in Slack')).toBeVisible()
    const top = await rows(page)
    expect(top.slice(0, 3)).toEqual(['New', 'Projects', 'Artifacts'])
    expect(top.indexOf('Automations')).toBe(top.length - 2)
    expect(top.at(-1)).toBe('More')
    await page.getByText('More', { exact: true }).click()
    expect((await rows(page)).slice(top.length)).toEqual(['Codebase', 'Issues', 'Templates', 'Machines', 'Docs'])
    await page.screenshot({ path: info.outputPath('rail.png') })
    await page.getByText('Machines', { exact: true }).click()
    await expect(page).toHaveURL(/\/-\/settings\/machines$/)
  })

  test('the Slack card sets up under Settings, and once dismissed stays gone', async ({ page }) => {
    await platform(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Set up Hanzo in Slack' }).click()
    await expect(page).toHaveURL(/\/-\/settings\/integrations$/)
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText('Try Hanzo in Slack')).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Recents')).toBeVisible()
    await expect(page.getByText('Try Hanzo in Slack')).toHaveCount(0)
  })

  test('the account row opens a menu of this page’s own addresses', async ({ page, baseURL }, info) => {
    await platform(page)
    await page.goto('/')
    const open = async () => {
      await page.getByRole('button', { name: 'Account: Dave · acme' }).click()
      const menu = page.getByRole('menu', { name: 'Account' })
      await expect(menu).toBeVisible()
      return menu
    }
    let menu = await open()
    await expect(menu.getByText('dave@acme.test')).toBeVisible()
    await expect(menu.getByRole('radiogroup', { name: 'Organizations' }).getByText('acme', { exact: true })).toBeVisible()
    for (const row of ['Settings', 'Usage', 'View all plans', 'Get help', 'Log out']) await expect(menu.getByRole('menuitem', { name: row })).toBeVisible()
    await page.screenshot({ path: info.outputPath('account-menu.png') })
    await menu.getByRole('menuitem', { name: 'Usage' }).click()
    await expect(page).toHaveURL(new URL('/-/settings/usage', baseURL).href)
    await expect(menu).toHaveCount(0)
    menu = await open()
    await menu.getByRole('menuitem', { name: 'View all plans' }).click()
    await expect(page).toHaveURL(new URL('/-/plans', baseURL).href)
    menu = await open()
    await menu.getByRole('menuitem', { name: 'Settings' }).click()
    await expect(page).toHaveURL(new URL('/-/settings', baseURL).href)
    menu = await open()
    const [help] = await Promise.all([page.waitForEvent('popup'), menu.getByRole('menuitem', { name: 'Get help' }).click()])
    expect(new URL(help.url()).hostname).toBe('docs.hanzo.ai')
    await help.close()
  })

  // The row lies outside the menu, so its second press is first a press outside:
  // the menu closes on it, and the row must not open it straight back.
  for (const rail of [false, true]) {
    test(`pressing the account row again puts the menu away${rail ? ' on the collapsed rail' : ''}, and it stays away`, async ({ page }) => {
      await platform(page, rail ? { 'hanzo.build.rail': true } : {})
      await page.goto('/')
      const row = page.getByRole('button', { name: 'Account: Dave · acme' })
      const menu = page.getByRole('menu', { name: 'Account' })
      await row.click()
      await expect(menu).toBeVisible()
      await row.click()
      await expect(menu).toHaveCount(0)
      await page.waitForTimeout(800)
      await expect(menu).toHaveCount(0)
      await row.click()
      await expect(menu).toBeVisible()
    })
  }

  test('on the collapsed rail the account menu opens beside it, and the card is gone', async ({ page }, info) => {
    await platform(page, { 'hanzo.build.rail': true })
    await page.goto('/')
    await expect(page.getByText('Try Hanzo in Slack')).toHaveCount(0)
    await page.getByRole('button', { name: 'Account: Dave · acme' }).click()
    const menu = page.getByRole('menu', { name: 'Account' })
    await expect(menu.getByRole('menuitem', { name: 'Log out' })).toBeVisible()
    expect((await menu.boundingBox())!.x).toBeGreaterThanOrEqual(56)
    await page.screenshot({ path: info.outputPath('collapsed-account-menu.png') })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  })

  test('on a phone the account menu opens from the drawer', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await platform(page)
    await page.goto('/')
    await page.getByLabel('Open runs').click()
    await page.getByRole('button', { name: 'Account: Dave · acme' }).last().click()
    const menu = page.getByRole('menu', { name: 'Account' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Log out' })).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await page.screenshot({ path: info.outputPath('phone-account-menu.png') })
  })
})

test.describe('Artifacts', () => {
  test('starters to make something new, and projects under the month they were edited', async ({ page }, info) => {
    await platform(page)
    await page.goto('/-/artifacts')
    await expect(page.getByText('Make something new')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Start from / })).toHaveCount(4)
    const months = page.getByText(/^(September|August) 2026$/)
    await expect(months).toHaveText(['September 2026', 'August 2026'])
    await expect(page.getByText('Private · Edited Sep 20 · shop.hanzo.app')).toBeVisible()
    await expect(page.getByText('Public · Edited Aug 3 · Not deployed yet')).toBeVisible()
    await page.screenshot({ path: info.outputPath('artifacts.png'), fullPage: true })
  })

  test('a starter is copied into a project and opened', async ({ page }) => {
    const sent = await platform(page)
    await page.goto('/-/artifacts')
    await page.getByRole('button', { name: 'Start from Circle' }).click()
    await expect(page).toHaveURL(/\/circle-2$/)
    expect(sent).toContainEqual({ method: 'POST', path: '/v1/projects/fork', query: '', body: { slug: 'circle' } })
  })

  test('opening a project goes to its workspace', async ({ page }) => {
    await platform(page)
    await page.goto('/-/artifacts')
    await page.getByRole('button', { name: 'Open Blog' }).click()
    await expect(page).toHaveURL(/\/blog$/)
  })

  test('renames, flips visibility and deletes from the row menu', async ({ page }, info) => {
    const sent = await platform(page)
    await page.goto('/-/artifacts')

    await page.getByRole('button', { name: 'Actions for Shop' }).click()
    await pick(page, 'Rename')
    const rename = page.getByRole('dialog')
    await rename.getByRole('textbox', { name: 'Name' }).fill('Store')
    await page.screenshot({ path: info.outputPath('artifacts-rename.png') })
    await rename.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(sent).toContainEqual({ method: 'PATCH', path: '/v1/projects/shop', query: '', body: { name: 'Store' } })

    await page.getByRole('button', { name: 'Actions for Shop' }).click()
    await pick(page, 'Make public')
    await expect(page.getByText('Shop is public now')).toBeVisible()
    expect(sent).toContainEqual({ method: 'PATCH', path: '/v1/projects/shop', query: '', body: { visibility: 'public' } })

    await page.getByRole('button', { name: 'Actions for Blog' }).click()
    await pick(page, 'Make private')
    expect(sent).toContainEqual({ method: 'PATCH', path: '/v1/projects/blog', query: '', body: { visibility: 'private' } })

    await page.getByRole('button', { name: 'Actions for Docs site' }).click()
    await pick(page, 'Delete')
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText('Delete Docs site?')).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Docs site is deleted')).toBeVisible()
    expect(sent).toContainEqual({ method: 'DELETE', path: '/v1/projects/docs', query: '', body: null })
  })

  test('fits a phone', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await platform(page)
    await page.goto('/-/artifacts')
    await expect(page.getByText('September 2026')).toBeVisible()
    expect(await cramped(page)).toEqual([])
    await page.screenshot({ path: info.outputPath('phone-artifacts.png'), fullPage: true })
  })
})

test.describe('Code settings', () => {
  test('Environments lists every codebase’s, opens one in its editor, and forgets it', async ({ page }, info) => {
    const sent = await platform(page)
    await page.goto('/-/settings/environments')
    await expect(page.getByRole('button', { name: 'Environments' }).first()).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Ready · 1 secret · Updated Sep 20, 2026')).toBeVisible()
    await expect(page.getByText('Proposed, waiting for review')).toBeVisible()
    await page.screenshot({ path: info.outputPath('environments.png') })
    await page.getByRole('button', { name: 'Open universe' }).click()
    await expect(page.getByLabel('Install Script')).toHaveValue('pnpm install')
    await expect(page.getByText('TOKEN', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('environment-open.png') })
    await page.getByRole('button', { name: 'Forget' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Forget' }).click()
    await expect(page.getByText('universe’s environment is forgotten')).toBeVisible()
    expect(sent).toContainEqual({ method: 'DELETE', path: '/v1/environment/universe', query: '', body: null })
  })

  test('Machines links, registers, drains, keys and removes', async ({ page }, info) => {
    const sent = await platform(page)
    await page.goto('/-/settings/machines')
    await expect(page.getByLabel('Link commands')).toHaveText('hanzo login\nhanzo link')
    await expect(page.getByText('online · gpu · spark · 1× GB10 · 1 running')).toBeVisible()
    await expect(page.getByText('offline · laptop · mbp')).toBeVisible()
    await page.screenshot({ path: info.outputPath('machines.png') })

    await page.getByRole('button', { name: 'Register one by hand' }).click()
    const add = page.getByRole('dialog')
    await add.getByLabel('Machine name').fill('rack')
    await add.getByRole('radio', { name: 'cluster' }).click()
    await add.getByLabel('Hostname').fill('rack-01')
    await page.screenshot({ path: info.outputPath('machines-register.png') })
    await add.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByText('rack is registered')).toBeVisible()
    expect(sent).toContainEqual({ method: 'POST', path: '/v1/agent/targets', query: '', body: { label: 'rack', kind: 'cluster', host: 'rack-01' } })

    await page.getByRole('button', { name: 'Actions for workshop' }).click()
    await pick(page, 'Drain')
    await expect(page.getByText('workshop takes no new runs')).toBeVisible()
    expect(sent).toContainEqual({ method: 'PATCH', path: '/v1/agent/targets/tgt_1', query: '', body: { status: 'draining' } })

    await page.getByRole('button', { name: 'Actions for workshop' }).click()
    await pick(page, 'Rename')
    await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('dgx')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    expect(sent).toContainEqual({ method: 'PATCH', path: '/v1/agent/targets/tgt_1', query: '', body: { label: 'dgx' } })

    await page.getByRole('button', { name: 'Actions for workshop' }).click()
    await pick(page, 'Claim key')
    await page.getByRole('dialog').getByRole('button', { name: 'Mint key' }).click()
    const once = page.getByRole('dialog')
    await expect(once.getByLabel('Claim key', { exact: true })).toHaveText('tk_live_once')
    await expect(once.getByText('Copy it now. It is not shown again.')).toBeVisible()
    await expect(once.getByText(/X-Target-Key/)).toBeVisible()
    await page.screenshot({ path: info.outputPath('machines-key.png') })
    await once.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('tk_live_once')).toHaveCount(0)
    expect(sent.filter((s) => s.path === '/v1/agent/targets/tgt_1/key')).toHaveLength(1)

    await page.getByRole('button', { name: 'Actions for laptop' }).click()
    await pick(page, 'Remove')
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('laptop is removed')).toBeVisible()
    expect(sent).toContainEqual({ method: 'DELETE', path: '/v1/agent/targets/tgt_2', query: '', body: null })
  })

  test('API keys: a new secret key once, and the publishable one revoked', async ({ page }, info) => {
    const sent = await platform(page)
    await page.goto('/-/settings/keys')
    await expect(page.getByLabel('Publishable key', { exact: true })).toHaveText('pk-acme-public-1234')
    await expect(page.getByText(/For a server\. .* None yet\./)).toBeVisible()
    await page.screenshot({ path: info.outputPath('keys.png') })

    await page.getByRole('button', { name: 'Create the secret key' }).click()
    const make = page.getByRole('dialog')
    await make.getByLabel('Limit').fill('zen5')
    await make.getByRole('button', { name: 'Create' }).click()
    await expect(make.getByText('zen5 is not a limit — write it as kind:name, like model:zen5')).toBeVisible()
    await make.getByLabel('Limit').fill('model:zen5, project:acme')
    await make.getByRole('button', { name: 'Create' }).click()
    await expect(make.getByLabel('Secret key', { exact: true })).toHaveText('sk-live-shown-once')
    await expect(make.getByText('It reaches model:zen5, project:acme and nothing else.')).toBeVisible()
    await page.screenshot({ path: info.outputPath('keys-once.png') })
    await make.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText('sk-live-shown-once')).toHaveCount(0)
    expect(sent).toContainEqual({ method: 'POST', path: '/v1/account/keys', query: '', body: { type: 'secret', limit: ['model:zen5', 'project:acme'] } })
    expect(sent.filter((s) => s.method === 'POST' && s.path === '/v1/account/keys')).toHaveLength(1)

    await page.getByRole('button', { name: 'Revoke the publishable key' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByText('Publishable key revoked')).toBeVisible()
    expect(sent).toContainEqual({ method: 'DELETE', path: '/v1/account/keys', query: '?type=publishable', body: null })
  })

  test('each section fits a phone', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await platform(page)
    for (const [section, says] of [
      ['environments', 'Ready · 1 secret'],
      ['machines', 'Link a machine'],
      ['keys', 'Publishable key'],
    ] as const) {
      await page.goto(`/-/settings/${section}`)
      await expect(page.getByText(says).first()).toBeVisible()
      expect(await cramped(page), section).toEqual([])
      await page.screenshot({ path: info.outputPath(`phone-${section}.png`), fullPage: true })
    }
  })
})

test('the account menu switches the organization, and the row says which', async ({ page }) => {
  await platform(page)
  // A person in two organizations: the token names both, and the page acts in acme first.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const two = [b64({ alg: 'none' }), b64({ sub: 'acme/dave', email: 'dave@acme.test', orgs: [{ org: 'acme', role: 'admin' }, { org: 'lux', role: 'member' }] }), 'x'].join('.')
  await page.addInitScript((t) => {
    localStorage.setItem('hanzo_iam_access_token', t)
    if (!localStorage.getItem('hanzo_iam_current_org')) localStorage.setItem('hanzo_iam_current_org', 'acme')
  }, two)
  await page.goto('/')
  await page.getByRole('button', { name: 'Account: Dave · acme' }).click()
  const orgs = page.getByRole('menu', { name: 'Account' }).getByRole('radiogroup', { name: 'Organizations' })
  await expect(orgs.getByText('lux', { exact: true })).toBeVisible()
  // Switching reloads the app, so the row is drawn again from a fresh start.
  await Promise.all([page.waitForEvent('load'), orgs.getByText('lux', { exact: true }).click()])
  await expect(page.getByRole('button', { name: 'Account: Dave · lux' })).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => localStorage.getItem('hanzo_iam_current_org'))).toBe('lux')
})
