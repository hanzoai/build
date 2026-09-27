/**
 * The site in a browser: every screen draws, stays on this origin, and never
 * asks platform.hanzo.ai for anything. Signed out, so it checks what a visitor
 * sees — the product's header over each screen, not the rail; the native MCP
 * servers and the skills catalogue are public and are read live.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'

const SCREENS: [string, string, RegExp][] = [
  ['new', '/', /What.s up next\?/],
  ['automations', '/-/automations', /New automation/],
  ['codebases', '/-/codebases', /Create and browse this organization.s repositories/],
  ['sync', '/-/sync', /Select repositories/],
  ['projects', '/-/projects', /Boards on the forge/],
  ['issues', '/-/issues', /Open work across every board/],
  ['artifacts', '/-/artifacts', /What this organization has built/],
  ['templates', '/-/templates', /Start from a working app/],
  ['mcp', '/-/mcp', /The fleet.s own servers/],
  ['customize', '/-/customize', /What the agent brings to a run/],
  ['run', '/sess_0992f90537264a6b154ebff799f38e1c', /Sign in to follow this run/],
]

const BAR = ['Features', 'Resources', 'Enterprise', 'Pricing', 'Log in', 'Sign up']

/** The IAM client this host signs in as: hanzo.app is the Hanzo App's. */
const client = (base: string) => (new URL(base).hostname === 'hanzo.app' ? 'hanzo-app' : 'hanzo-build')

/** Everything the page asked for and every error it threw, for the whole test. */
function watch(page: Page) {
  const hosts = new Set<string>()
  const errors: string[] = []
  page.on('request', (r) => hosts.add(new URL(r.url()).hostname))
  page.on('pageerror', (e) => errors.push(e.message))
  return { hosts, errors }
}

for (const [name, path, says] of SCREENS) {
  test(`${name} draws on this origin`, async ({ page, baseURL }, info) => {
    const seen = watch(page)
    await page.goto(path)
    await expect(page.getByText(says).first()).toBeVisible()
    const bar = page.getByRole('banner')
    for (const label of BAR) await expect(bar.getByText(label, { exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Runs' })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
    expect([...seen.hosts]).not.toContain('platform.hanzo.ai')
    expect(seen.errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${name}.png`) })
  })
}

test('the header leads to the product’s pages, and both doors open IAM beside the page', async ({ page, baseURL }) => {
  const seen = watch(page)
  await page.goto('/')
  const bar = page.getByRole('banner')
  const site = bar.getByRole('navigation', { name: 'Site' })
  for (const [label, href] of [
    ['Features', 'https://hanzo.ai/app'],
    ['Enterprise', 'https://hanzo.ai/enterprise'],
    ['Pricing', 'https://hanzo.ai/pricing'],
  ]) {
    await expect(site.getByRole('link', { name: label })).toHaveAttribute('href', href)
  }
  await site.getByRole('button', { name: 'Resources' }).click()
  const resources = page.getByRole('menu', { name: 'Resources' })
  for (const label of ['Docs', 'Blog', 'Customers', 'Learn', 'Support']) await expect(resources.getByText(label, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(resources).toHaveCount(0)
  for (const door of ['Log in', 'Sign up']) {
    const [popup] = await Promise.all([page.waitForEvent('popup'), bar.getByRole('button', { name: door, exact: true }).click()])
    expect(popup.url()).toMatch(/^https:\/\/hanzo\.id\//)
    expect(popup.url()).toContain(`client_id=${client(baseURL!)}`)
    await popup.close()
  }
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
  expect([...seen.hosts]).not.toContain('platform.hanzo.ai')
})

test('the name at the top left when signed out', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hanzo', exact: true })).toHaveCount(1)
  await expect(page.getByRole('banner').getByText('Log in', { exact: true })).toBeVisible()
})

test('settings is a page of this site', async ({ page, baseURL }) => {
  await page.goto('/-/codebases')
  await page.getByText('Settings', { exact: true }).first().click()
  await expect(page).toHaveURL(new URL('/-/settings/environments', baseURL).href)
  await page.goto('/-/settings')
  await expect(page.getByText('Sign in to see your settings.')).toBeVisible()
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
})

test('Connectors lists the native servers to a visitor', async ({ page }, info) => {
  await page.goto('/-/customize/connectors')
  const count = page.getByText(/^\d+ servers · \d+ operations$/)
  await expect(count).toBeVisible()
  const servers = Number((await count.innerText()).split(' ')[0])
  expect(servers).toBeGreaterThan(100)
  await page.getByLabel('Search connectors').fill('git')
  await expect(page.getByLabel('git', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('mcp-git.png') })
})

test('a run hides and shows its side pane', async ({ page }) => {
  await page.goto('/sess_0992f90537264a6b154ebff799f38e1c')
  await page.getByLabel('Hide the side pane').click()
  await expect(page.getByText('Subscriptions', { exact: true })).toHaveCount(0)
  await page.getByLabel('Show the side pane').click()
  await expect(page.getByText('Subscriptions', { exact: true })).toBeVisible()
})

test('a run shows its codebase’s environment beside it', async ({ page }, info) => {
  await page.goto('/sess_0992f90537264a6b154ebff799f38e1c')
  await page.getByLabel('Environment', { exact: true }).click()
  await expect(page.getByText('Sign in to see this codebase’s environment.')).toBeVisible()
  await expect(page.getByText('This run', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('environment.png') })
})

test('a phone gets every screen whole, with the header folded into one menu', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, path, says] of SCREENS) {
    await page.goto(path)
    await expect(page.getByText(says).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
    expect(await cramped(page), name).toEqual([])
    await page.screenshot({ path: info.outputPath(`phone-${name}.png`) })
  }
  await page.getByRole('button', { name: 'Menu' }).click()
  const menu = page.getByRole('menu', { name: 'Menu' })
  for (const label of ['Features', 'Enterprise', 'Pricing', 'Docs', 'Sign up']) await expect(menu.getByText(label, { exact: true })).toBeVisible()
})

test('a run asks a visitor to sign in, not for an API key', async ({ page }) => {
  await page.goto('/sess_0992f90537264a6b154ebff799f38e1c')
  await expect(page.getByText('Sign in to follow this run.').first()).toBeVisible()
  await expect(page.getByText(/Authorization: Bearer/)).toHaveCount(0)
})
