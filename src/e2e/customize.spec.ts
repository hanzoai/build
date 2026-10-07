/**
 * Customize — skills, connectors, plugins and agents — signed in against a
 * stubbed platform (stubs.ts) that keeps what it is sent, so a write shows up on
 * the next read the way it would live. Browse is first and is where every tab
 * opens; Yours is what the org has, counted on its button.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import type { Sent } from './signed.ts'
import { catalogue, customize as platform } from './stubs.ts'

async function open(page: Page, at: string) {
  await catalogue(page)
  const sent = await platform(page)
  await page.goto(at)
  return sent
}

const sentTo = (sent: Sent[], method: string, path: string) => sent.filter((s) => s.method === method && s.path === path)
const browse = (page: Page) => page.getByRole('button', { name: 'Browse', exact: true })
const yours = (page: Page) => page.getByRole('button', { name: /^Yours/ })

test('every tab opens on Browse, first in the choice, with what is yours counted beside it', async ({ page, baseURL }) => {
  const sent = await open(page, '/')
  await page.getByText('Customize', { exact: true }).first().click()
  await expect(page).toHaveURL(new URL('/-/customize', baseURL).href)
  await expect(page.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true')
  const group = page.getByRole('group', { name: 'Show' })
  // Browse first; one skill of the org's own and one added from Hanzo, counted on Yours.
  await expect.poll(() => group.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Browse', 'Yours, 2'])
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('list', { name: 'Skills to add' })).toBeVisible()

  for (const tab of ['Connectors', 'Plugins', 'Agents']) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(browse(page), tab).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(yours(page)).toHaveAccessibleName('Yours, 1')
  // The fleet's servers are not listed until asked for: listing them starts every subsystem.
  expect(sentTo(sent, 'POST', '/v1/mcp')).toHaveLength(0)
})

test('the old MCP address lands on Connectors’ Browse with the built-in servers open', async ({ page }) => {
  await open(page, '/-/mcp')
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('tab', { name: 'Connectors' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('2 servers · 3 operations')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show built-in servers' })).toHaveCount(0)
})

test('skills: browse Hanzo’s, read a SKILL.md, and add one', async ({ page }, info) => {
  const sent = await open(page, '/-/customize')
  await expect(page.getByRole('heading', { name: 'From Hanzo' })).toBeVisible()
  await expect(page.getByText('3 skills', { exact: true })).toBeVisible()
  await expect(page.getByLabel('git_branches is added')).toBeVisible()
  await page.getByLabel('Search skills').fill('kms')
  await expect(page.getByText('1 of 3 skills')).toBeVisible()
  await page.getByLabel('Search skills').fill('')
  await page.screenshot({ path: info.outputPath('skills-browse.png') })

  await page.getByRole('button', { name: 'Add git_repos' }).click()
  await expect(page.getByLabel('git_repos is added')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['skill_git_repos'], deactivate: [] })
  await expect(yours(page)).toHaveAccessibleName('Yours, 3')

  await page.getByRole('button', { name: 'kms_secrets', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('What kms_secrets does, step by step.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add to your skills' }).click()
  await expect(dialog.getByRole('button', { name: 'Remove' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('skills-read.png') })
})

test('skills: yours switch off and on, one added is removed, and a new one is written and switched on', async ({ page }, info) => {
  const sent = await open(page, '/-/customize')
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your skills' })
  await expect(page.getByRole('heading', { name: 'Made by your team' })).toBeVisible()
  await expect(mine.getByText('triage', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Added skills' }).getByText('git_branches', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('skills-yours.png') })

  await mine.getByRole('switch', { name: 'triage on' }).click()
  await expect(page.getByText('triage is off')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['skill_triage'] })
  await mine.getByRole('switch', { name: 'triage on' }).click()
  await expect(page.getByText('triage is on')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['skill_triage'], deactivate: [] })

  await page.getByRole('button', { name: 'Remove git_branches' }).click()
  await expect(page.getByRole('list', { name: 'Added skills' })).toHaveCount(0)

  await page.getByRole('button', { name: 'New skill' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Release Notes')
  await dialog.getByLabel('SKILL.md').fill('# Release notes\n\nCollect the merged PRs.')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('status')).toHaveText('A name is one lowercase word: letters, digits, _ or -')
  await dialog.getByLabel('Name').fill('release-notes')
  await dialog.getByLabel('Description').fill('Write the release notes')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('release-notes is saved and on')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/skills').at(-1)?.body).toEqual({ name: 'release-notes', description: 'Write the release notes', content: '# Release notes\n\nCollect the merged PRs.' })
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['skill_release-notes'], deactivate: [] })
  await expect(mine.getByRole('switch', { name: 'release-notes on' })).toBeChecked()

  await mine.getByRole('button', { name: 'triage', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('SKILL.md')).toHaveValue('# Triage\n\nRead it first.')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete triage?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('triage is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/skills/triage')).toHaveLength(1)
})

test('connectors: add one from Browse, switch it off and on from its card, switch one tool, and remove it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/connectors')
  await expect(page.getByText('Featured', { exact: true })).toBeVisible()
  // One that ships only as a package says so, and has no Add.
  const shelf = page.getByRole('list', { name: 'Servers on the shelf' })
  await expect(shelf.getByText('io.local · Package only: needs a place to run')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Local files' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show built-in servers' }).click()
  await expect(page.getByText('2 servers · 3 operations')).toBeVisible()
  await page.screenshot({ path: info.outputPath('connectors-browse.png'), fullPage: true })

  await page.getByRole('button', { name: 'Stripe', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('https://mcp.stripe.com · streamable-http')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Add to your connectors' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Stripe' })
  await dialog.getByLabel('Secret').fill('Bearer sk_test_x')
  await expect(dialog.getByLabel('Header')).toHaveValue('Authorization')
  await page.screenshot({ path: info.outputPath('connectors-add.png') })
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Stripe is added, and its 2 tools are on.')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/mcp/servers').at(-1)?.body).toEqual({ listing: 'com.stripe_mcp', authHeader: 'Authorization', secret: 'Bearer sk_test_x' })
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['com-stripe_create_payment_link', 'com-stripe_list_customers'], deactivate: [] })

  // Adding lands on Yours, where it is.
  await expect(yours(page)).toHaveAttribute('aria-pressed', 'true')
  const mine = page.getByRole('list', { name: 'Your connectors' })
  const card = mine.getByRole('listitem').filter({ hasText: 'Stripe' })
  await expect(card.getByText('2 of 2 tools on · From Browse · Secret in KMS')).toBeVisible()
  await card.getByRole('switch', { name: 'Stripe on' }).click()
  await expect(page.getByText('Stripe is off')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['com-stripe_create_payment_link', 'com-stripe_list_customers'] })
  await expect(card.getByText('0 of 2 tools on · From Browse · Secret in KMS')).toBeVisible()
  await card.getByRole('switch', { name: 'Stripe on' }).click()
  await expect(page.getByText('Stripe is on')).toBeVisible()
  await expect(card.getByRole('switch', { name: 'Stripe on' })).toBeChecked()
  await page.screenshot({ path: info.outputPath('connectors-yours.png') })

  await mine.getByRole('button', { name: 'Stripe' }).click()
  const detail = page.getByRole('dialog', { name: 'Stripe' })
  await expect(detail.getByText('A secret is sealed in KMS and sent in Authorization.')).toBeVisible()
  await detail.getByRole('switch', { name: 'list_customers on' }).click()
  await expect(detail.getByRole('switch', { name: 'list_customers on' })).not.toBeChecked()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['com-stripe_list_customers'] })
  await detail.getByRole('button', { name: 'Turn all on' }).click()
  await expect(detail.getByRole('switch', { name: 'list_customers on' })).toBeChecked()
  await detail.getByRole('button', { name: 'Remove connector' }).click()
  await page.getByRole('dialog', { name: 'Delete Stripe?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Stripe is removed')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/mcp/servers/com-stripe')).toHaveLength(1)
})

test('connectors: add any MCP server by its URL', async ({ page }) => {
  const sent = await open(page, '/-/customize/connectors')
  await page.getByRole('button', { name: 'Add by URL' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add by URL' })
  await dialog.getByLabel('Name').fill('Docs')
  await dialog.getByLabel('URL').fill('https://docs.example.com/mcp')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Docs is added, and its 2 tools are on.')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/mcp/servers').at(-1)?.body).toEqual({ url: 'https://docs.example.com/mcp', name: 'Docs' })
})

test('plugins: what is built in, then build one, read its source, a failed build says why, and delete it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/plugins')
  await expect(page.getByRole('heading', { name: 'Build your own' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Mounted subsystems' }).getByText('/v1/agent')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('plugins-browse.png') })

  await page.getByRole('button', { name: 'Build a plugin' }).click()
  let dialog = page.getByRole('dialog', { name: 'Build a plugin' })
  await dialog.getByLabel('Name').fill('acme')
  await dialog.getByLabel('Source').fill('export const acme = oops')
  await dialog.getByRole('button', { name: 'Build', exact: true }).click()
  // The bundler's own words: a build that failed says why.
  await expect(dialog.getByText('bundle: Expected ";" but found "oops"')).toBeVisible()
  await dialog.getByRole('button', { name: 'Describe an API' }).click()
  await dialog.getByLabel('The API').fill('POST /v1/things creates a thing')
  await dialog.getByLabel('Connector').fill('acme')
  await page.screenshot({ path: info.outputPath('plugins-build.png') })
  await dialog.getByRole('button', { name: 'Build', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'acme' })
  await expect(dialog.getByText('// written from: POST /v1/things creates a thing')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/plugins/build').at(-1)?.body).toEqual({ name: 'acme', provider: 'acme', spec: 'POST /v1/things creates a thing' })
  await expect(yours(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('list', { name: 'Your plugins' }).getByText('weather', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete plugin' }).click()
  await page.getByRole('dialog', { name: 'Delete acme?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('acme is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/plugins/authored/p1')).toHaveLength(1)
})

test('agents: create one with a budget, change only its instructions, and delete it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/agents')
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your agents' })
  await expect(mine.getByText('zen5.8 · 4 runs · 1 tool · $0.25 of $10 this month')).toBeVisible()

  await page.getByRole('button', { name: 'New agent' }).click()
  let dialog = page.getByRole('dialog', { name: 'New agent' })
  await dialog.getByLabel('Name').fill('reviewer')
  await dialog.getByLabel('Instructions').fill('Review the diff.')
  await dialog.getByRole('switch', { name: 'Use skill_triage' }).click()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByText('Set what it may spend each month')).toBeVisible()
  await dialog.getByLabel('Budget each period').fill('20')
  await dialog.getByLabel('Budget for one run').fill('2')
  await dialog.getByRole('button', { name: 'Week' }).click()
  await page.screenshot({ path: info.outputPath('agents-new.png') })
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('reviewer is saved')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/agent').at(-1)?.body).toEqual({
    name: 'reviewer',
    description: '',
    instructions: 'Review the diff.',
    tools: ['skill_triage'],
    cap_micro_usd: 20_000_000,
    max_task_micro_usd: 2_000_000,
    period: 'week',
  })

  await mine.getByRole('button', { name: 'helper' }).click()
  dialog = page.getByRole('dialog', { name: 'helper' })
  await expect(dialog.getByLabel('Instructions')).toHaveValue('Be terse.')
  await dialog.getByLabel('Instructions').fill('Be terse, and cite the file.')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('helper is saved')).toBeVisible()
  expect(sentTo(sent, 'PATCH', '/v1/agent/agent_1').at(-1)?.body).toEqual({ instructions: 'Be terse, and cite the file.' })

  await mine.getByRole('button', { name: 'helper' }).click()
  await page.getByRole('dialog', { name: 'helper' }).getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete helper?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('helper is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/agent/agent_1')).toHaveLength(1)
})

test('agents: a preset opens a new agent written from it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/agents')
  await expect(page.getByRole('heading', { name: 'Start from a preset' })).toBeVisible()
  await expect(page.getByText('Product & Fashion Create', { exact: true })).toBeVisible()
  await expect(page.getByText('Studio Graph Copilot')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('agents-browse.png') })
  await page.getByRole('button', { name: 'Use Product & Fashion Create' }).click()
  const dialog = page.getByRole('dialog', { name: 'New agent' })
  await expect(dialog.getByLabel('Name')).toHaveValue('create')
  await expect(dialog.getByLabel('Instructions')).toHaveValue('You are Hanzo Create, a render assistant.')
  await dialog.getByRole('switch', { name: 'Every tool' }).click()
  await dialog.getByRole('button', { name: 'Model: The deployment’s default' }).click()
  await page.getByRole('option', { name: /^zen5\.8-coder/ }).click()
  await expect(dialog.getByRole('button', { name: 'Model: zen5.8-coder' })).toBeVisible()
  await dialog.getByLabel('Budget each period').fill('5')
  await dialog.getByLabel('Budget for one run').fill('0.5')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('create is saved')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/agent').at(-1)?.body).toMatchObject({ name: 'create', description: 'Product & Fashion Create', model: 'zen5.8-coder', tools: ['*'], cap_micro_usd: 5_000_000, max_task_micro_usd: 500_000, period: 'month' })
})

for (const tab of ['skills', 'connectors', 'plugins', 'agents']) {
  test(`a phone gets ${tab} whole, both views, with the cards in one column`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, tab === 'skills' ? '/-/customize' : `/-/customize/${tab}`)
    await expect(page.getByRole('tab', { selected: true })).toBeVisible()
    for (const [name, view] of [
      ['browse', browse],
      ['yours', yours],
    ] as const) {
      await view(page).click()
      await page.waitForTimeout(300)
      expect(await cramped(page), `${tab} ${name}`).toEqual([])
      await page.screenshot({ path: info.outputPath(`phone-${tab}-${name}.png`), fullPage: true })
    }
    if (tab !== 'agents') return
    await page.getByRole('button', { name: 'New agent' }).first().click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: info.outputPath('phone-agents-new.png') })
  })
}

test('a member reads the org’s skills and connectors, is told who changes them, and changes none', async ({ page }) => {
  await catalogue(page)
  await platform(page, [
    { id: 'com-stripe', org: 'acme', name: 'Stripe', url: 'https://mcp.stripe.com', authHeader: 'Authorization', hasSecret: true, listing: 'com.stripe_mcp', source: 'catalog', createdAt: 1790000200 },
  ])
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const member = [b64({ alg: 'none' }), b64({ sub: 'acme/zed', email: 'zed@acme.test', orgs: [{ org: 'acme', role: 'member' }] }), 'x'].join('.')
  await page.addInitScript((t) => localStorage.setItem('hanzo_iam_access_token', t), member)

  await page.goto('/-/customize')
  await expect(page.getByText('Only an org admin can add or change skills. You can see what is on.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New skill' })).toHaveCount(0)
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your skills' })
  await expect(mine.getByText('triage', { exact: true })).toBeVisible()
  await expect(mine.getByRole('switch')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Connectors' }).click()
  await expect(page.getByRole('button', { name: 'Add by URL' })).toHaveCount(0)
  await yours(page).click()
  await page.getByRole('list', { name: 'Your connectors' }).getByRole('button', { name: 'Stripe' }).click()
  const detail = page.getByRole('dialog', { name: 'Stripe' })
  await expect(detail.getByText('Only an org admin can switch or remove connectors.')).toBeVisible()
  await expect(detail.getByRole('switch')).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Remove connector' })).toHaveCount(0)

  // Plugins and agents are any member's.
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Agents' }).click()
  await expect(page.getByRole('button', { name: 'New agent' })).toBeVisible()
})
