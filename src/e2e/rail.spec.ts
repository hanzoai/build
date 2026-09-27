/**
 * The rail, Artifacts and the Code settings, signed in as an org admin against a
 * stubbed platform (signed.ts): every control drawn here is driven, and what it
 * sends is checked.
 */
import { expect, test, type Page } from '@playwright/test'

import { signIn, type Sent } from './signed.ts'

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) / 1000

const PROJECTS = [
  { slug: 'shop', name: 'Shop', visibility: 'private', status: 'live', liveUrl: 'https://shop.hanzo.app', createdAt: at(2026, 8, 1), updatedAt: at(2026, 9, 20) },
  { slug: 'blog', name: 'Blog', visibility: 'public', status: 'draft', createdAt: at(2026, 9, 2), updatedAt: at(2026, 9, 12) },
  { slug: 'docs', name: 'Docs site', visibility: 'public', status: 'live', createdAt: at(2026, 7, 1), updatedAt: at(2026, 8, 3) },
]

const STARTERS = ['synapse', 'circle', 'metrics', 'folio', 'mint'].map((slug) => ({ slug, title: slug[0]!.toUpperCase() + slug.slice(1), category: 'App', description: '', framework: 'Next.js' }))

const MACHINES = [
  { id: 'tgt_1', label: 'workshop', kind: 'gpu', status: 'online', capacity: '1× GB10', host: 'spark', sessions: 3, running: 1 },
  { id: 'tgt_2', label: 'laptop', kind: 'laptop', status: 'offline', host: 'mbp' },
]

const ENVIRONMENTS = [
  { repo: 'universe', install: 'pnpm install', start: 'pnpm dev', secrets: ['TOKEN'], state: 'ready', updatedAt: '2026-09-20T10:00:00Z' },
  { repo: 'site', install: '', start: '', secrets: [], state: 'proposed', proposal: { install: 'npm ci', start: '', secrets: [], note: '' } },
]

/** A platform with projects, starters, machines, environments and keys, answering every write. */
function platform(page: Page, kept: Record<string, unknown> = {}): Promise<Sent[]> {
  return signIn(
    page,
    ({ method, path, query, body }) => {
      if (path === '/v1/projects' && method === 'GET') return { json: PROJECTS }
      if (path === '/v1/templates') return { json: { data: STARTERS } }
      if (path === '/v1/projects/fork') return { status: 201, json: { slug: `${(body as { slug: string }).slug}-2`, name: 'Copy' } }
      if (path.startsWith('/v1/projects/') && method === 'PATCH') return { json: { ...PROJECTS[0], ...(body as object) } }
      if (path.startsWith('/v1/projects/') && method === 'DELETE') return { status: 204, text: '' }
      if (path === '/v1/agent/targets' && method === 'GET') return { json: { targets: MACHINES } }
      if (path === '/v1/agent/targets' && method === 'POST') return { status: 201, json: { id: 'tgt_3', ...(body as object) } }
      if (path === '/v1/agent/targets/tgt_1/key') return { json: { targetId: 'tgt_1', claimKey: 'tk_live_once' } }
      if (path.startsWith('/v1/agent/targets/') && method === 'PATCH') return { json: { ...MACHINES[0], ...(body as object) } }
      if (path.startsWith('/v1/agent/targets/') && method === 'DELETE') return { json: { deleted: true } }
      if (path === '/v1/environment') return { json: { data: ENVIRONMENTS } }
      if (path === '/v1/environment/universe' && method === 'GET') return { json: ENVIRONMENTS[0] }
      if (path === '/v1/environment/universe' && method === 'DELETE') return { status: 204, text: '' }
      if (path === '/v1/account/keys' && method === 'GET') return { json: { keys: [{ type: 'publishable', prefix: 'pk-acme', key: 'pk-acme-public-1234' }] } }
      if (path === '/v1/account/keys' && method === 'POST') return { json: { key: 'sk-live-shown-once', accessKey: 'sk-live-shown-once', type: 'secret', limit: (body as { limit?: string[] }).limit } }
      if (path === '/v1/account/keys' && method === 'DELETE') return { json: { ok: true, type: new URLSearchParams(query).get('type') } }
      return undefined
    },
    kept,
  )
}

/** Controls and text a phone would cut off at its right edge. */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth
    const out: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length && !['BUTTON', 'INPUT'].includes(el.tagName) && el.getAttribute('role') !== 'button') continue
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (!r.width || !r.height || s.visibility === 'hidden' || s.opacity === '0') continue
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}`)
    }
    return out
  })
}

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
      await page.getByRole('button', { name: 'Account: dave@acme.test' }).click()
      const menu = page.getByRole('menu', { name: 'Account' })
      await expect(menu).toBeVisible()
      return menu
    }
    let menu = await open()
    await expect(menu.getByText('dave@acme.test')).toBeVisible()
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

  test('on the collapsed rail the account menu opens beside it, and the card is gone', async ({ page }, info) => {
    await platform(page, { 'hanzo.build.rail': true })
    await page.goto('/')
    await expect(page.getByText('Try Hanzo in Slack')).toHaveCount(0)
    await page.getByRole('button', { name: 'Account: dave@acme.test' }).click()
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
    await page.getByRole('button', { name: 'Account: dave@acme.test' }).last().click()
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
    expect(await clipped(page)).toEqual([])
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
      expect(await clipped(page), section).toEqual([])
      await page.screenshot({ path: info.outputPath(`phone-${section}.png`), fullPage: true })
    }
  })
})
