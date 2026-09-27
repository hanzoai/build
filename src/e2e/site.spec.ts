/**
 * hanzo.build in a browser: every screen draws, stays on this origin, and
 * never asks platform.hanzo.ai for anything. Signed out, so it checks what a
 * visitor sees; the native MCP servers and the skills catalogue are public and
 * are read live.
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

const RAIL = ['New', 'Projects', 'Artifacts', 'Customize', 'Automations', 'More']

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
    for (const label of RAIL) await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
    expect([...seen.hosts]).not.toContain('platform.hanzo.ai')
    expect(seen.errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${name}.png`) })
  })
}

test('the rail moves between screens without leaving the page', async ({ page, baseURL }) => {
  const seen = watch(page)
  await page.goto('/')
  for (const [label, at] of [
    ['Projects', '/-/projects'],
    ['Artifacts', '/-/artifacts'],
    ['Customize', '/-/customize'],
    ['Automations', '/-/automations'],
    ['More', ''],
    ['Codebase', '/-/codebases'],
    ['Issues', '/-/issues'],
    ['Templates', '/-/templates'],
    ['New', '/'],
  ]) {
    await page.getByText(label, { exact: true }).first().click()
    if (at) await expect(page).toHaveURL(new URL(at, baseURL).href)
  }
  expect([...seen.hosts]).not.toContain('platform.hanzo.ai')
})

test('the name at the top left when signed out', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hanzo Build', exact: true })).toHaveCount(1)
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible()
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

test('a phone gets every screen whole, with the rail as a drawer', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, path, says] of SCREENS) {
    await page.goto(path)
    await expect(page.getByText(says).first()).toBeVisible()
    await expect(page.getByLabel('Open runs')).toBeVisible()
    expect(await cramped(page), name).toEqual([])
    await page.screenshot({ path: info.outputPath(`phone-${name}.png`) })
  }
  await page.getByLabel('Open runs').click()
  const drawer = page.getByRole('navigation', { name: 'Runs' })
  await drawer.getByText('More', { exact: true }).click()
  await expect(drawer.getByText('Codebase', { exact: true })).toBeVisible()
})

test('a run asks a visitor to sign in, not for an API key', async ({ page }) => {
  await page.goto('/sess_0992f90537264a6b154ebff799f38e1c')
  await expect(page.getByText('Sign in to follow this run.').first()).toBeVisible()
  await expect(page.getByText(/Authorization: Bearer/)).toHaveCount(0)
})
