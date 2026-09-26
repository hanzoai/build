/**
 * hanzo.build in a browser: every screen draws, stays on this origin, and
 * never asks platform.hanzo.ai for anything. Signed out, so it checks what a
 * visitor sees; the MCP list is public and is read live.
 */
import { expect, test, type Page } from '@playwright/test'

const SCREENS: [string, string, RegExp][] = [
  ['new', '/', /What.s up next\?/],
  ['automations', '/-/automations', /New automation/],
  ['codebases', '/-/codebases', /Create and browse this organization.s repositories/],
  ['sync', '/-/sync', /Select repositories/],
  ['projects', '/-/projects', /Boards on the forge/],
  ['issues', '/-/issues', /Open work across every board/],
  ['artifacts', '/-/artifacts', /What this organization has built/],
  ['templates', '/-/templates', /Start from a working app/],
  ['mcp', '/-/mcp', /Native servers/],
  ['run', '/sess_0992f90537264a6b154ebff799f38e1c', /Sign in to follow this run/],
]

const RAIL = ['New', 'Automations', 'Codebase', 'Projects', 'Issues', 'Artifacts', 'MCP']

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
    ['Automations', '/-/automations'],
    ['Codebase', '/-/codebases'],
    ['Projects', '/-/projects'],
    ['Issues', '/-/issues'],
    ['Artifacts', '/-/artifacts'],
    ['MCP', '/-/mcp'],
    ['New', '/'],
  ]) {
    await page.getByText(label, { exact: true }).first().click()
    await expect(page).toHaveURL(new URL(at, baseURL).href)
  }
  expect([...seen.hosts]).not.toContain('platform.hanzo.ai')
})

test('one mark at the top left when signed out', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Hanzo', exact: true })).toHaveCount(1)
  await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible()
})

test('settings stays on this page', async ({ page, baseURL }) => {
  await page.goto('/-/codebases')
  await page.getByText('Settings', { exact: true }).first().click()
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
})

test('the MCP screen lists the native servers', async ({ page }, info) => {
  await page.goto('/-/mcp')
  const count = page.getByText(/^\d+ servers · \d+ operations$/)
  await expect(count).toBeVisible()
  const servers = Number((await count.innerText()).split(' ')[0])
  expect(servers).toBeGreaterThan(100)
  await page.getByLabel('Find a server').fill('git')
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

/** Controls and text a phone would cut off at its right edge, or that sit on top of another control. */
async function cramped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth
    const out: string[] = []
    const leaves = [...document.querySelectorAll('body *')].filter(
      (el) => !el.children.length || ['BUTTON', 'INPUT'].includes(el.tagName) || el.getAttribute('role') === 'button',
    )
    for (const el of leaves) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (!r.width || !r.height || s.visibility === 'hidden' || s.opacity === '0') continue
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}`)
    }
    const menu = document.querySelector('[aria-label="Open runs"]')?.getBoundingClientRect()
    const mark = [...document.querySelectorAll('[aria-label="Hanzo"], [aria-label^="Organization"]')]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.width && r.height)
    if (menu && mark && mark.left < menu.right && menu.left < mark.right && mark.top < menu.bottom && menu.top < mark.bottom) out.push('the mark sits on the menu button')
    return out
  })
}

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
  await expect(page.getByRole('navigation', { name: 'Runs' }).getByText('Codebase', { exact: true })).toBeVisible()
})

test('a run asks a visitor to sign in, not for an API key', async ({ page }) => {
  await page.goto('/sess_0992f90537264a6b154ebff799f38e1c')
  await expect(page.getByText('Sign in to follow this run.').first()).toBeVisible()
  await expect(page.getByText(/Authorization: Bearer/)).toHaveCount(0)
})
