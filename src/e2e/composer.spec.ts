/**
 * The gates on the one composer, drawn by Dev (New and a run) and by Chat (empty and
 * mid-conversation), at a laptop and a phone, in both themes:
 *
 *   - it is fixed to the foot of the view: its bottom within 12px of the window's;
 *   - equal inset at its two sides, and the same width in Chat and Dev;
 *   - `+`, the effort, the mic, its chevron and send share one centreline (±1px),
 *     and each is the composer's control size: 36px on a laptop, 44px on a phone;
 *   - a long conversation scrolls under it and never over the last message;
 *   - the software keyboard (the visual viewport shrinking) lifts it above itself;
 *   - Dev has no Auto: no mode picker, and no "Auto" word in the composer.
 */
import type { Page } from '@playwright/test'

import { DAVE, enter, type Answer } from './cov-forge.ts'
import { ev, rig, SESSION } from './cov-run.ts'
import { expect, test } from './fixture.ts'
import { ORG } from './signed.ts'
import { granted, MODELS } from './stubs.ts'

const KEPT = {
  [`hanzo.build.new.${ORG}`]: {
    repo: { owner: ORG, name: 'universe', full_name: `${ORG}/universe`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: `https://git.hanzo.ai/${ORG}/universe.git` },
    branch: 'main',
    place: '',
    mode: 'build',
    ask: '',
  },
}

const answering = (theme: 'light' | 'dark'): Answer => ({ path }) => {
  if (path === '/v1/pref') return { json: { prefs: { theme }, updatedAt: 1 } }
  if (path === '/v1/models') return { json: MODELS }
  if (path === '/v1/agent/targets') return { json: { targets: [] } }
  if (path === '/v1/git/repos') return { json: { data: [{ name: 'universe', org: ORG, defaultBranch: 'main' }] } }
  if (path === '/v1/git/repos/universe') return { json: { name: 'universe', org: ORG, defaultBranch: 'main', branches: ['main'] } }
  if (path === '/v1/provider/github/repos') return { json: { repos: [granted(ORG, 'widgets')], next: '', total: 1, unread: [], connected: true } }
  if (path.startsWith('/v1/environment/')) return { json: { repo: 'universe', install: '', start: '', secrets: [], state: 'ready' } }
  return undefined
}

/** Where the composer and its controls are, in the window's own pixels. */
async function measured(p: Page) {
  return p.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.right, b: r.bottom } : null
    }
    const shell = document.querySelector('[data-slot="composer-shell"]')
    const holder = box(shell?.parentElement ?? null)
    const frame = document.querySelector('[data-slot="composer"]')
    const end = document.querySelector('[data-slot="composer-end"]')
    const last = end?.lastElementChild ?? null
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      shell: box(shell),
      holder,
      frame: box(frame),
      text: (shell as HTMLElement | null)?.innerText ?? '',
      controls: {
        plus: box(document.querySelector('[data-slot="plus"]')),
        effort: box(document.querySelector('[data-slot="dial-button"]')),
        palette: box(document.querySelector('[data-slot="composer-end"] [data-slot="chip-select"]')),
        mic: box(document.querySelector('[data-slot="dictation"] button:not([data-slot="dictation-menu"])')),
        chevron: box(document.querySelector('[data-slot="dictation-menu"]')),
        send: box(last),
      },
      lastWords: (() => {
        const turns = [...document.querySelectorAll('[data-slot="message"], [data-slot="thread-column"] > *')]
        return box(turns.at(-1) ?? null)
      })(),
    }
  })
}

type Measure = Awaited<ReturnType<typeof measured>>

/** What every composer shares, drawn at `width`. */
function gates(m: Measure, width: number, controls: string[], edge = 0) {
  const shell = m.shell!
  // 12px of air, and the pane's own edge where the composer sits in one.
  expect(m.height - shell.b, 'the composer is fixed to the foot of the view').toBeLessThanOrEqual(12.5 + edge)
  expect(Math.abs(shell.x - m.holder!.x - (m.holder!.r - shell.r)), 'equal inset at both sides').toBeLessThanOrEqual(1)
  const hit = width < 600 ? 44 : 36
  const present = controls.map((k) => [k, m.controls[k as keyof Measure['controls']]] as const)
  for (const [name, b] of present) {
    expect(b, `${name} is drawn`).not.toBeNull()
    expect(Math.round(b!.w), `${name} is ${hit}px wide`).toBe(hit)
    expect(Math.round(b!.h), `${name} is ${hit}px tall`).toBe(hit)
  }
  const mid = present[0]![1]!.cy
  for (const [name, b] of present) expect(Math.abs(b!.cy - mid), `${name} shares the centreline`).toBeLessThanOrEqual(1)
}

/** A window where the software keyboard covers `covered` px of the foot. */
async function keyboard(p: Page) {
  await p.addInitScript(() => {
    const listeners = new Set<() => void>()
    const vv = {
      height: window.innerHeight,
      offsetTop: 0,
      addEventListener: (_: string, f: () => void) => void listeners.add(f),
      removeEventListener: (_: string, f: () => void) => void listeners.delete(f),
    }
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    ;(window as unknown as { keyboard: (covered: number) => void }).keyboard = (covered) => {
      vv.height = window.innerHeight - covered
      listeners.forEach((f) => f())
    }
  })
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  for (const scheme of ['dark', 'light'] as const) {
    test.describe(`${width}x${height} ${scheme}`, () => {
      test.use({ viewport: { width, height }, colorScheme: scheme })

      test('Dev: New is fixed to the foot, pills inside the frame, no Auto', async ({ page: p }) => {
        await keyboard(p)
        await enter(p, answering(scheme), DAVE, KEPT)
        await p.goto('/')
        await expect(p.getByRole('textbox', { name: 'Describe a task or ask a question' })).toBeVisible({ timeout: 45_000 })
        await expect.poll(() => p.evaluate((s) => document.documentElement.classList.contains(s), scheme)).toBe(true)
        const m = await measured(p)
        gates(m, width, ['plus', 'effort', 'palette', 'mic', 'chevron', 'send'])
        // The pills are inside the frame, above the input line, inside its edges.
        const pills = await p.locator('[data-slot="composer-pills"]').boundingBox()
        expect(pills!.y).toBeGreaterThanOrEqual(m.frame!.y)
        expect(pills!.x).toBeGreaterThanOrEqual(m.frame!.x)
        expect(pills!.x + pills!.width).toBeLessThanOrEqual(m.frame!.r + 1)
        // No Auto: no mode picker, and not the word.
        await expect(p.locator('[data-slot="mode"]')).toHaveCount(0)
        expect(m.text).not.toMatch(/\bAuto\b/)
        // The keyboard lifts it.
        await p.evaluate(() => (window as unknown as { keyboard: (n: number) => void }).keyboard(300))
        await expect.poll(async () => (await measured(p)).shell!.b).toBeLessThanOrEqual(height - 300)
        const lifted = await measured(p)
        expect(height - 300 - lifted.shell!.b).toBeLessThanOrEqual(12.5)
      })

      test('Dev: a long run scrolls under the composer and never over its last message', async ({ page: p }) => {
        const events = [ev('status', { status: 'started', branch: 'agent/ab12' })]
        for (let i = 0; i < 24; i++) {
          events.push(ev('message', { role: 'user', text: `Question ${i + 1} about the widget` }))
          events.push(ev('event', { type: 'item.completed', item: { id: `m${i}`, type: 'agent_message', text: `Answer ${i + 1}: added the widget and a test that covers it end to end, with words enough to wrap.` } }))
        }
        events.push(ev('status', { status: 'done', changed: true, branch: 'agent/ab12' }))
        await rig(p, { events }, ({ path }) => (path === '/v1/pref' ? { json: { prefs: { theme: scheme }, updatedAt: 1 } } : path === '/v1/models' ? { json: MODELS } : undefined))
        await p.goto(`/${SESSION}`)
        await expect(p.getByText('Answer 24:')).toBeVisible({ timeout: 45_000 })
        // The transcript's scroller ends above the composer: the last answer, scrolled to, is not covered.
        await p.getByText('Answer 24:').scrollIntoViewIfNeeded()
        const m = await measured(p)
        gates(m, width, ['plus', 'mic', 'chevron', 'send'], 1)
        const last = await p.getByText('Answer 24:').boundingBox()
        expect(last!.y + last!.height, 'the last message ends above the composer').toBeLessThanOrEqual(m.shell!.y + 1)
      })

      test('Chat: empty, the title and the suggestions above a composer fixed to the foot', async ({ page: p }) => {
        await keyboard(p)
        await p.route((u) => u.pathname.startsWith('/v1/'), (r) => (new URL(r.request().url()).pathname === '/v1/models' ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(MODELS) }) : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })))
        await p.addInitScript((s) => {
          ;(window as unknown as { look: { theme: string } }).look = { theme: s }
        }, scheme)
        await p.route('**/-/chat', async (r) => {
          const res = await r.fetch({ url: new URL('/', r.request().url()).href })
          await r.fulfill({ response: res, body: (await res.text()).replace('/src/app/main.tsx', '/src/e2e/chat.tsx') })
        })
        await p.goto('/-/chat')
        await expect(p.getByRole('textbox', { name: 'Message' })).toBeVisible({ timeout: 45_000 })
        const m = await measured(p)
        gates(m, width, ['plus', 'effort', 'mic', 'chevron', 'send'])
        const title = await p.getByRole('heading', { name: 'What’s up?' }).boundingBox()
        expect(title!.y + title!.height, 'the title is above the composer').toBeLessThanOrEqual(m.shell!.y)
        await p.evaluate(() => (window as unknown as { keyboard: (n: number) => void }).keyboard(300))
        await expect.poll(async () => (await measured(p)).shell!.b).toBeLessThanOrEqual(height - 300)
      })

      test('Chat: a long conversation scrolls under it, and it is the width of Dev’s', async ({ page: p }) => {
        await p.route((u) => u.pathname.startsWith('/v1/'), (r) => (new URL(r.request().url()).pathname === '/v1/models' ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(MODELS) }) : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })))
        await p.addInitScript((s) => {
          ;(window as unknown as { look: { theme: string; turns: number } }).look = { theme: s, turns: 40 }
        }, scheme)
        await p.route('**/-/chat', async (r) => {
          const res = await r.fetch({ url: new URL('/', r.request().url()).href })
          await r.fulfill({ response: res, body: (await res.text()).replace('/src/app/main.tsx', '/src/e2e/chat.tsx') })
        })
        await p.goto('/-/chat')
        await expect(p.getByText('Answer 40:')).toBeVisible({ timeout: 45_000 })
        const m = await measured(p)
        gates(m, width, ['plus', 'effort', 'mic', 'chevron', 'send'])
        const last = await p.getByText('Answer 40:').boundingBox()
        expect(last!.y + last!.height, 'the last message ends above the composer').toBeLessThanOrEqual(m.shell!.y + 1)
        // The same measure as New's, whatever the surface.
        expect(Math.round(m.shell!.w)).toBe(Math.min(width - 24, 768 - 24))
      })
    })
  }
}
