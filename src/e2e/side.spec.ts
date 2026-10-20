/**
 * The side panel's column beside a run (side.tsx), in both themes: its edge
 * dragged wider until the run gives the panel its room and back out again,
 * the run brought back by Show run, the width saved to the person's
 * preferences (PATCH /v1/pref `side`) and drawn from them in a browser that
 * kept nothing, full screen from the strip with Escape and the button
 * returning, and on a phone the panel over the whole window. A drag is timed
 * and watched: React's commits, the transcript's DOM, and the main thread's work.
 */
import type { Page } from '@playwright/test'

import { ev, hold, rig, SESSION, to } from './cov-run.ts'
import { desk } from './desk.ts'
import { expect, test } from './fixture.ts'

/** A platform that keeps the preference document it is sent, shallowly, as /v1/pref does. */
async function platform(p: Page, doc: Record<string, unknown> = {}, events: Record<string, unknown>[] = []) {
  const got = await rig(p, { events }, ({ method, path, body }) => {
    if (path !== '/v1/pref') return undefined
    if (method === 'PATCH') Object.assign(doc, body)
    return { json: { prefs: doc } }
  })
  return { ...got, doc }
}

/** The page drawn in `theme`, as the builder's own theme switch keeps it. */
const themed = (p: Page, theme: string) => p.addInitScript((t) => localStorage.setItem('theme', t), theme)

const column = (p: Page) => p.locator('[data-slot="desk"]')
const run = (p: Page) => p.locator('[data-slot="run"]')
const edge = (p: Page) => p.getByRole('separator', { name: 'Resize the side panel' })
const width = async (p: Page) => Math.round((await column(p).boundingBox())!.width)

/** Presses the edge, moves it `by` px (negative is wider) in `steps`, and lets go unless told to hold. */
async function drag(p: Page, by: number, steps = 24, hold = false) {
  const box = (await edge(p).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await p.mouse.move(x, y)
  await p.mouse.down()
  await p.mouse.move(x + by, y, { steps })
  if (!hold) await p.mouse.up()
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme}, at 1440`, () => {
    test.use({ viewport: { width: 1440, height: 900 } })
    test.beforeEach(({ page }) => themed(page, theme))

    test('the edge widens the panel until the run gives it the room, Show run and a pull back out return it, and the width is the person’s', async ({ page: p, browser }) => {
      const { sent, doc } = await platform(p)
      await p.goto(`/${SESSION}`)
      await expect(edge(p)).toHaveAttribute('aria-valuenow', '480', { timeout: 45_000 })
      // The grab band is wider than the line it draws, and says what it does.
      const band = (await edge(p).boundingBox())!
      expect(band.width).toBeGreaterThanOrEqual(8)
      expect(await edge(p).evaluate((el) => getComputedStyle(el).cursor)).toBe('col-resize')

      // Wider, by a drag: saved once, to the person's preferences, as whole pixels.
      await drag(p, -160)
      await expect(edge(p)).toHaveAttribute('aria-valuenow', '640')
      expect(await width(p)).toBe(640)
      await expect.poll(() => to(sent, 'PATCH', '/v1/pref').length).toBe(1)
      expect(to(sent, 'PATCH', '/v1/pref')[0]!.body).toEqual({ side: { width: 640 } })
      expect(doc).toEqual({ side: { width: 640 } })

      // On, past the run's floor: the run stops at it, then gives the panel its room.
      const frame = (await p.locator('[data-slot="run-split"]').boundingBox())!
      await drag(p, -2000)
      await expect(run(p)).toBeHidden()
      expect(Math.round((await column(p).boundingBox())!.x)).toBe(Math.round(frame.x))
      expect(await width(p)).toBe(Math.round(frame.width))
      await p.screenshot({ path: test.info().outputPath(`side-${theme}-1440-room.png`) })
      // Taking the room is not a width: nothing more was saved.
      expect(to(sent, 'PATCH', '/v1/pref')).toHaveLength(1)

      // Show run brings it back at the person's width.
      await desk(p).getByRole('button', { name: 'Show run' }).click()
      await expect(run(p)).toBeVisible()
      expect(await width(p)).toBe(640)

      // And so does a pull back out from the room.
      await drag(p, -2000)
      await expect(run(p)).toBeHidden()
      await drag(p, 600)
      await expect(run(p)).toBeVisible()
      expect(Math.round((await run(p).boundingBox())!.width)).toBeGreaterThanOrEqual(360)
      await expect(desk(p).getByRole('button', { name: 'Show run' })).toHaveCount(0)

      // A browser that kept nothing draws the width the preferences hold.
      const other = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await themed(other, theme)
      await platform(other, { side: { width: 700 } })
      await other.goto(`/${SESSION}`)
      await expect(edge(other)).toHaveAttribute('aria-valuenow', '700', { timeout: 45_000 })
      expect(await width(other)).toBe(700)
      await other.close()
    })

    test('a drag draws no React and nothing in the transcript, inside a frame’s budget', async ({ page: p }) => {
      // React's commits, counted where its devtools would be told of them.
      await p.addInitScript(() => {
        const w = window as unknown as { commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
        w.commits = 0
        w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject: () => 1, onCommitFiberRoot: () => void w.commits++, onCommitFiberUnmount: () => {}, onPostCommitFiberRoot: () => {}, checkDCE: () => {} }
      })
      await platform(p, {}, [
        ev('message', { role: 'user', text: 'Make a hello page' }),
        ev('event', { type: 'item.completed', item: { id: 'm0', type: 'agent_message', text: 'Here it is: a page that says hello, with a heading and a line under it.' } }),
        ev('status', { status: 'done', changed: true, branch: 'agent/ab12' }),
      ])
      await p.goto(`/${SESSION}`)
      await expect(p.getByText('a page that says hello')).toBeVisible({ timeout: 45_000 })
      // The run is finished and its stream is held open, so nothing but the drag moves the page.
      await hold(p, '/v1/agent/sessions/stream')
      await p.waitForTimeout(1500)
      await p.evaluate(() => {
        const w = window as unknown as { seen: { frames: number[]; changed: number; shifted: number } }
        w.seen = { frames: [], changed: 0, shifted: 0 }
        let last = performance.now()
        const tick = (t: number) => {
          w.seen.frames.push(t - last)
          last = t
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        const transcript = document.querySelector('[data-slot="run"]')!
        new MutationObserver((list) => (w.seen.changed += list.filter((m) => m.target !== transcript).length)).observe(transcript, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.seen.shifted += e.value
        }).observe({ type: 'layout-shift' })
      })
      const cdp = await p.context().newCDPSession(p)
      await cdp.send('Performance.enable')
      const busy = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value
      const box = (await edge(p).boundingBox())!
      await p.mouse.move(box.x + box.width / 2, box.y + 200)
      await p.mouse.down()
      const commits = await p.evaluate(() => (window as unknown as { commits: number }).commits)
      // The count is live: the page's own drawing was told to it.
      expect(commits).toBeGreaterThan(0)
      const from = await busy()
      await p.mouse.move(box.x + box.width / 2 - 200, box.y + 200, { steps: 60 })
      const work = (await busy()) - from
      const seen = await p.evaluate(() => {
        const w = window as unknown as { seen: { frames: number[]; changed: number; shifted: number }; commits: number }
        return { ...w.seen, frames: w.seen.frames.slice(2), commits: w.commits }
      })
      await p.mouse.up()
      const sorted = [...seen.frames].sort((a, b) => a - b)
      const at = (q: number) => (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0).toFixed(1)
      const per = (work * 1000) / 60
      console.log(
        `side ${theme}: 60 moves over ${sorted.length} frames, frame gap median ${at(0.5)} ms p95 ${at(0.95)} ms; main thread ${per.toFixed(2)} ms a move; React commits ${seen.commits - commits}; transcript mutations ${seen.changed}; layout shift ${seen.shifted.toFixed(4)}`,
      )
      expect(await width(p)).toBe(680)
      expect(seen.commits - commits).toBe(0)
      expect(seen.changed).toBe(0)
      // Each move's work, script and style and layout and paint, fits a 60 Hz frame with room.
      expect(per).toBeLessThan(16)
    })

    test('full screen from the strip, and back by Escape and by the button', async ({ page: p }) => {
      await platform(p)
      await p.goto(`/${SESSION}`)
      await expect(edge(p)).toBeVisible({ timeout: 45_000 })
      const before = (await column(p).boundingBox())!
      const full = desk(p).getByRole('button', { name: 'Full screen' })
      await full.click()
      await expect(desk(p).getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true')
      expect(await column(p).boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
      // No edge to drag over the whole window.
      await expect(edge(p)).toHaveCount(0)
      await p.screenshot({ path: test.info().outputPath(`side-${theme}-1440-full.png`) })
      await p.keyboard.press('Escape')
      await expect(full).toBeVisible()
      expect(await column(p).boundingBox()).toEqual(before)

      await full.click()
      await desk(p).getByRole('button', { name: 'Exit full screen' }).click()
      expect(await column(p).boundingBox()).toEqual(before)
      await expect(edge(p)).toBeVisible()
    })
  })

  test.describe(`${theme}, at 390`, () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test.beforeEach(({ page }) => themed(page, theme))

    test('the panel opens over the whole window, and its toggle puts it away', async ({ page: p }) => {
      await platform(p)
      await p.goto(`/${SESSION}`)
      const toggle = p.locator('[data-slot="side-toggle"]')
      await expect(toggle).toBeVisible({ timeout: 45_000 })
      await toggle.click()
      const sheet = p.locator('[data-slot="side-sheet"]')
      expect(await sheet.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 })
      await expect(desk(p)).toBeVisible()
      // The window is the panel's already: no full screen, no edge.
      await expect(desk(p).getByRole('button', { name: 'Full screen' })).toHaveCount(0)
      await expect(edge(p)).toHaveCount(0)
      await p.screenshot({ path: test.info().outputPath(`side-${theme}-390.png`) })
      await desk(p).getByRole('button', { name: 'Hide tabs' }).click()
      await expect(sheet).toHaveCount(0)
    })
  })
}
