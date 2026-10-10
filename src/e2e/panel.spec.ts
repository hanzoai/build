/**
 * The side panel (panel.tsx over tabs.ts) on a run, at a laptop and a phone:
 * opened and closed from the header's Panel button and from ⌘. / Ctrl+.,
 * kept as it was left; tabs added from +, shut and reordered, and kept; on a
 * phone a sheet that opens only when asked; and an answer's artifact opened
 * in it with one press, rendered from its own bytes.
 */
import type { Page } from '@playwright/test'

import { ev, rig, SESSION } from './cov-run.ts'
import { desk, open, tab, tabs } from './desk.ts'
import { expect, test } from './fixture.ts'

/** A picture of the page, beside the test's other output. */
const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

const HTML = '<!doctype html><h1 style="font:600 40px system-ui">Hello, artifact</h1>'

/** A finished run whose answer wrote a page. */
const platform = (p: Page) =>
  rig(p, {
    events: [
      ev('status', { status: 'started', branch: 'agent/ab12' }),
      ev('message', { role: 'user', text: 'Make a hello page' }),
      ev('event', { type: 'item.completed', item: { id: 'm0', type: 'agent_message', text: `Here it is.\n\n\`\`\`html\n${HTML}\n\`\`\`\n\nIt says hello.` } }),
      ev('status', { status: 'done', changed: true, branch: 'agent/ab12' }),
    ],
  })

const toggle = (p: Page) => p.locator('[data-slot="side-toggle"]')
const stored = (p: Page, key: string) => p.evaluate((k) => localStorage.getItem(k), key)

test.describe('at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the header’s Panel button and Ctrl+. open and close it, and a reload keeps which', async ({ page: p }) => {
    await platform(p)
    await p.goto(`/${SESSION}`)
    await expect(desk(p)).toBeVisible({ timeout: 45_000 })
    await expect(toggle(p)).toHaveAccessibleName('Close the side panel')
    await expect(toggle(p)).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle(p)).toHaveAttribute('aria-keyshortcuts', 'Meta+Period Control+Period')
    await shot(p, 'panel-1440-open.png')

    await toggle(p).click()
    await expect(desk(p)).toHaveCount(0)
    await expect(toggle(p)).toHaveAccessibleName('Open the side panel')
    expect(await stored(p, 'hanzo.side.dev.open')).toBe('0')
    await shot(p, 'panel-1440-closed.png')
    await p.reload()
    await expect(toggle(p)).toHaveAccessibleName('Open the side panel', { timeout: 45_000 })
    await expect(desk(p)).toHaveCount(0)

    await p.keyboard.press('Control+.')
    await expect(desk(p)).toBeVisible()
    expect(await stored(p, 'hanzo.side.dev.open')).toBe('1')
    await p.keyboard.press('Control+.')
    await expect(desk(p)).toHaveCount(0)
    await p.keyboard.press('Control+.')
    await expect(desk(p)).toBeVisible()
    await p.reload()
    await expect(desk(p)).toBeVisible({ timeout: 45_000 })
  })

  test('a tab added from +, a tab shut and a tab moved — by dragging and by the keyboard — are kept across a reload', async ({ page: p }) => {
    await platform(p)
    await p.goto(`/${SESSION}`)
    await expect(desk(p)).toBeVisible({ timeout: 45_000 })
    expect(await tabs(p)).toEqual(['Preview', 'Artifacts', 'Files', 'Diff', 'Terminal'])
    await expect(tab(p, 'Terminal')).toHaveAttribute('aria-selected', 'true')

    // +: the kinds not open, and a page.
    await desk(p).getByRole('button', { name: 'Open a tab' }).click()
    await expect(p.getByRole('menuitem', { name: /^Desktop/ })).toBeVisible()
    await expect(p.getByRole('menuitem', { name: /^Environment/ })).toBeVisible()
    await expect(p.getByRole('menuitem', { name: /^Page/ })).toBeVisible()
    await shot(p, 'panel-1440-add.png')
    await p.getByRole('menuitem', { name: /^Desktop/ }).click()
    await expect(tab(p, 'Desktop')).toHaveAttribute('aria-selected', 'true')

    // Shut: its neighbour to the right is chosen, as a browser does.
    await open(p, 'Files')
    await desk(p).getByRole('button', { name: 'Close Files' }).click()
    await expect(tab(p, 'Files')).toHaveCount(0)
    await expect(tab(p, 'Diff')).toHaveAttribute('aria-selected', 'true')

    // Dragged: Terminal onto Preview, so it stands first.
    await tab(p, 'Terminal').dragTo(tab(p, 'Preview'))
    await expect.poll(() => tabs(p)).toEqual(['Terminal', 'Preview', 'Artifacts', 'Diff', 'Desktop'])

    // From the keyboard: arrows move between tabs, Ctrl+Shift+→ moves the one focused.
    await tab(p, 'Artifacts').click()
    await tab(p, 'Artifacts').focus()
    await p.keyboard.press('Control+Shift+ArrowRight')
    await expect.poll(() => tabs(p)).toEqual(['Terminal', 'Preview', 'Diff', 'Artifacts', 'Desktop'])
    await p.keyboard.press('ArrowLeft')
    await expect(tab(p, 'Diff')).toHaveAttribute('aria-selected', 'true')
    await shot(p, 'panel-1440-arranged.png')

    await p.reload()
    await expect(desk(p)).toBeVisible({ timeout: 45_000 })
    expect(await tabs(p)).toEqual(['Terminal', 'Preview', 'Diff', 'Artifacts', 'Desktop'])
    await expect(tab(p, 'Diff')).toHaveAttribute('aria-selected', 'true')
    expect(JSON.parse((await stored(p, 'hanzo.side.dev'))!)).toMatchObject({ at: 'diff' })
  })

  test('an answer’s artifact opens in the panel with one press, rendered from its own bytes, and stays across a reload', async ({ page: p }) => {
    await platform(p)
    await p.goto(`/${SESSION}`)
    await expect(p.getByText('It says hello.')).toBeVisible({ timeout: 45_000 })
    await p.getByRole('button', { name: 'Open in the side panel' }).click()
    await expect(tab(p, 'html block')).toHaveAttribute('aria-selected', 'true')
    const page = desk(p).frameLocator('iframe[title="html block"]')
    await expect(page.getByRole('heading', { name: 'Hello, artifact' })).toBeVisible()
    // Bytes take this page's origin, so the frame runs scripts and never as us.
    await expect(desk(p).locator('iframe[title="html block"]')).toHaveAttribute('sandbox', 'allow-scripts allow-popups allow-forms')
    await shot(p, 'panel-1440-artifact.png')

    // Pressed again, the same artifact is the tab already open.
    await open(p, 'Terminal')
    await p.getByRole('button', { name: 'Open in the side panel' }).click()
    await expect(tab(p, 'html block')).toHaveAttribute('aria-selected', 'true')
    await expect(desk(p).getByRole('tab', { name: 'html block' })).toHaveCount(1)

    await p.reload()
    await expect(tab(p, 'html block')).toHaveAttribute('aria-selected', 'true', { timeout: 45_000 })
    await expect(desk(p).frameLocator('iframe[title="html block"]').getByRole('heading', { name: 'Hello, artifact' })).toBeVisible()
  })

  test('the panel closed, an artifact opened from its answer opens the panel on it', async ({ page: p }) => {
    await platform(p)
    await p.goto(`/${SESSION}`)
    await expect(p.getByText('It says hello.')).toBeVisible({ timeout: 45_000 })
    await toggle(p).click()
    await expect(desk(p)).toHaveCount(0)
    await p.getByRole('button', { name: 'Open in the side panel' }).click()
    await expect(desk(p)).toBeVisible()
    await expect(tab(p, 'html block')).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('at 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the panel is a sheet that opens from the header, starts closed after a reload, and closes from its own button', async ({ page: p }) => {
    await platform(p)
    await p.goto(`/${SESSION}`)
    await expect(p.getByText('It says hello.')).toBeVisible({ timeout: 45_000 })
    // A phone opens on the conversation, never on a sheet it did not ask for.
    await expect(desk(p)).toHaveCount(0)
    await expect(toggle(p)).toBeVisible()
    await shot(p, 'panel-390-closed.png')

    await toggle(p).click()
    const sheet = p.locator('[data-slot="side-sheet"]')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('complementary', { name: 'Run details' })).toBeVisible()
    const box = (await sheet.getByRole('complementary', { name: 'Run details' }).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    await shot(p, 'panel-390-sheet.png')

    await p.reload()
    await expect(p.getByText('It says hello.')).toBeVisible({ timeout: 45_000 })
    await expect(sheet).toHaveCount(0)

    await toggle(p).click()
    await expect(sheet).toBeVisible()
    await desk(p).getByRole('button', { name: 'Close the side panel' }).click()
    await expect(sheet).toHaveCount(0)

    // An artifact opened from its answer opens the sheet on it.
    await p.getByRole('button', { name: 'Open in the side panel' }).click()
    await expect(sheet).toBeVisible()
    await expect(tab(p, 'html block')).toHaveAttribute('aria-selected', 'true')
    await expect(desk(p).frameLocator('iframe[title="html block"]').getByRole('heading', { name: 'Hello, artifact' })).toBeVisible()
    await shot(p, 'panel-390-artifact.png')
  })
})
