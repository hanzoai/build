/**
 * A page tab's menu (panel.tsx `Actions`) under the two hosts it is drawn for
 * (tabs.tsx): a browser page, which draws only what a page can do — a new
 * window, the link, and for a frame it may reach, print and zoom — and a window
 * whose browser can do the rest, in the reference's order: what we add, then
 * find, print, zoom, device toolbar and a screenshot, then passwords,
 * downloads, history and clearing, then settings. A row needing a page is dim
 * on an empty tab; a screenshot is handed to the surface as a file.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import type { Tabs } from './tabs.tsx'

/** Opens the panel alone under the host `t` describes. */
async function open(p: Page, t: Tabs): Promise<void> {
  await p.addInitScript((tabs) => {
    ;(window as unknown as { tabs: Tabs }).tabs = tabs
  }, t)
  // A site of ours, answered here rather than over the network.
  await p.route('https://acme.hanzo.app/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Acme</title><h1>Acme store</h1>' }))
  await p.route('**/-/tabs', async (r) => {
    const res = await r.fetch({ url: new URL('/', r.request().url()).href })
    const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/tabs.tsx')
    await r.fulfill({ response: res, body: html })
  })
  await p.goto('/-/tabs')
  await expect(p.getByRole('complementary', { name: 'Tabs' })).toBeVisible({ timeout: 45_000 })
}

/** The menu's rows in order, a divider as —, and none of a submenu's. */
const rows = (p: Page) =>
  p
    .locator('[data-slot="page-menu"]')
    .first()
    .evaluate((el) => {
      const top = el.closest('[role="menu"]') ?? el.querySelector('[role="menu"]') ?? el
      return [...top.querySelectorAll('[role="menuitem"], [role="separator"], [role="group"][aria-label="Zoom"]')]
        .filter((n) => (n.parentElement?.closest('[role="menu"]') ?? top) === top)
        .map((n) => (n.getAttribute('role') === 'separator' ? '—' : n.getAttribute('role') === 'group' ? 'Zoom' : (n.textContent ?? '').trim()))
    })
const menu = (p: Page) => p.getByRole('button', { name: 'Page actions' })
const went = (p: Page) => p.evaluate(() => (window as unknown as { went: string[] }).went)
const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

test.describe('on a browser page', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('an empty tab draws only what a page can do, dim until there is a page', async ({ page: p }) => {
    await open(p, {})
    await menu(p).click()
    expect(await rows(p)).toEqual(['Ask about this page', 'Skills', 'Open in a new window', 'Copy link', 'Pin tab'])
    await expect(p.getByRole('menuitem', { name: 'Ask about this page' })).toHaveAttribute('aria-disabled', 'true')
    await shot(p, 'menu-web-empty.png')
  })

  test('a frame of this origin can be printed and zoomed; a site we host opens in Dev', async ({ page: p }) => {
    await open(p, { at: '/' })
    await menu(p).click()
    expect(await rows(p)).toEqual(['Ask about this page', 'Skills', 'Open in a new window', 'Copy link', 'Pin tab', '—', 'Print', 'Zoom'])
    await p.getByRole('button', { name: 'Zoom in' }).click()
    await expect(p.locator('[data-slot="page-zoom"]')).toContainText('110%')
    await p.getByRole('menuitem', { name: 'Ask about this page' }).click()
    expect(await went(p)).toEqual(['ask /'])

    // A site of ours: framed, zoomed, opened in Dev — and never printed, its origin is not this page's.
    const bar = p.getByRole('textbox', { name: 'Address' })
    await bar.fill('acme.hanzo.app')
    await bar.press('Enter')
    await menu(p).click()
    expect(await rows(p)).toEqual(['Ask about this page', 'Open in Dev', 'Skills', 'Open in a new window', 'Copy link', 'Pin tab', '—', 'Zoom'])
    await p.getByRole('menuitem', { name: 'Open in Dev' }).click()
    expect((await went(p)).at(-1)).toBe('dev https://acme.hanzo.app')
  })
})

test.describe('in a window whose browser does the rest', () => {
  const ALL: NonNullable<Tabs['browser']> = ['find', 'print', 'zoom', 'devices', 'capture', 'selection', 'passwords', 'downloads', 'history', 'clear', 'settings']

  for (const theme of ['dark', 'light'] as const)
    for (const width of [1280, 390])
      test(`${theme} at ${width}: every row in the reference's order, and each one does what it says`, async ({ page: p }) => {
        await p.setViewportSize({ width, height: width > 500 ? 900 : 844 })
        await open(p, { browser: ALL, theme, at: 'https://acme.hanzo.app' })
        await menu(p).click()
        expect(await rows(p)).toEqual([
          'Ask about this page',
          'Open in Dev',
          'Skills',
          'Open in a new window',
          'Copy link', 'Pin tab',
          '—',
          'Find in page',
          'Print',
          'Zoom',
          'Show device toolbar',
          'Take a screenshot',
          '—',
          'Passwords and autofill',
          'Downloads',
          'History',
          'Clear browsing data',
          '—',
          'Browser settings',
        ])
        await p.mouse.move(2, 2)
        await shot(p, `menu-window-${theme}-${width}.png`)
        await p.getByRole('menuitem', { name: 'Take a screenshot' }).click()
        await expect.poll(() => went(p)).toContain('captured png image/png https://acme.hanzo.app')
        await menu(p).click()
        await p.getByRole('button', { name: 'Zoom out' }).click()
        await expect.poll(() => went(p)).toContain('zoom https://acme.hanzo.app 90')
        await p.getByRole('menuitem', { name: 'Find in page' }).click()
        await menu(p).click()
        await p.getByRole('menuitem', { name: 'Ask about this page' }).click()
        await expect.poll(() => went(p)).toContain('ask https://acme.hanzo.app [the selected words]')
        expect(await went(p)).toContain('find https://acme.hanzo.app')
      })
})

test.describe('pinning', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('a tab pinned from its menu shows its pin, leads the strip, and closes only on purpose', async ({ page: p }) => {
    await open(p, { at: '/' })
    await menu(p).click()
    await p.getByRole('menuitem', { name: 'Pin tab' }).click()
    const strip = p.getByRole('tablist', { name: 'Tabs' })
    const unpin = p.getByRole('button', { name: /^Unpin / })
    await expect(unpin).toBeVisible()
    await expect(p.getByRole('button', { name: /^Close / })).toHaveCount(0)
    // Delete on a pinned tab is not a close.
    await strip.getByRole('tab').first().focus()
    await p.keyboard.press('Delete')
    await expect(strip.getByRole('tab')).toHaveCount(1)
    await menu(p).click()
    await expect(p.getByRole('menuitem', { name: 'Unpin tab' })).toBeVisible()
    await p.keyboard.press('Escape')
    await shot(p, 'tab-pinned.png')
    await unpin.click()
    await expect(p.getByRole('button', { name: /^Close / })).toBeVisible()
  })

  test('any tab pins from its own menu, a right press on it, and closes from there too', async ({ page: p }) => {
    await open(p, { at: '/' })
    const strip = p.getByRole('tablist', { name: 'Tabs' })
    await strip.getByRole('tab').first().click({ button: 'right' })
    await p.getByRole('menuitem', { name: 'Pin tab' }).click()
    await expect(p.getByRole('button', { name: /^Unpin / })).toBeVisible()
    await strip.getByRole('tab').first().click({ button: 'right' })
    await expect(p.getByRole('menuitem', { name: 'Unpin tab' })).toBeVisible()
    await p.getByRole('menuitem', { name: 'Close tab' }).click()
    await expect(strip.getByRole('tab')).toHaveCount(0)
  })
})

