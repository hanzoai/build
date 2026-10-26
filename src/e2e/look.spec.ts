/**
 * The one composer, drawn the way Dev and Chat hand it their slots, at a laptop
 * and a phone, in both themes: Dev's three pills (where the run goes, the
 * repository with its tabs, the branch), its chips and its commands, and Chat's
 * effort, mode, model and families. Every panel opens inside the window and
 * answers the keyboard (arrows, Enter, Esc, type to filter), and nothing is cut
 * off or scrolls sideways.
 *
 * Pictures land beside the test's output: `look-<surface>-<width>-<theme>-<state>.png`.
 */
import type { Page } from '@playwright/test'

import { DAVE, enter, type Answer } from './cov-forge.ts'
import { cramped, expect, test } from './fixture.ts'
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

/** What a search matches: the platform filters by `q`, so the stub does. */
const matching = <T extends { name: string }>(rows: T[], query: string) => {
  const q = new URLSearchParams(query).get('q')?.toLowerCase() ?? ''
  return rows.filter((r) => r.name.toLowerCase().includes(q))
}

/** The platform New talks to, for a person who chose `theme`. */
const answering = (theme: 'light' | 'dark'): Answer => ({ path, query }) => {
  if (path === '/v1/pref') return { json: { prefs: { theme }, updatedAt: 1 } }
  if (path === '/v1/models') return { json: MODELS }
  if (path === '/v1/agent/targets') {
    return {
      json: {
        targets: [
          { id: 'tgt_1', label: 'dave-laptop', kind: 'laptop', status: 'online', capacity: '10 vCPU / 32G', metricsAt: '2026-09-27T11:59:40Z' },
          { id: 'tgt_2', label: 'rack', kind: 'cluster', status: 'offline' },
        ],
      },
    }
  }
  if (path === '/v1/git/repos') {
    return {
      json: {
        data: matching(
          [
            { name: 'universe', org: ORG, defaultBranch: 'main', updatedAt: '2026-09-26T10:00:00Z' },
            { name: 'site', org: ORG, defaultBranch: 'main', public: true, updatedAt: '2026-09-20T10:00:00Z' },
          ],
          query,
        ),
      },
    }
  }
  if (path === '/v1/git/repos/universe') return { json: { name: 'universe', org: ORG, defaultBranch: 'main', branches: ['main', 'dev', 'feature-x'] } }
  if (path === '/v1/provider/github/repos') {
    return { json: { repos: matching([granted(ORG, 'widgets', { private: true }), granted('dave-gh', 'dotfiles')], query), next: '', total: 2, unread: [], connected: true } }
  }
  if (path.startsWith('/v1/environment/')) return { json: { repo: 'universe', install: '', start: '', secrets: [], state: 'ready' } }
  return undefined
}

const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

/** Whether a locator's box sits inside the window. */
async function inside(p: Page, selector: string) {
  const box = await p.locator(selector).last().boundingBox()
  const size = p.viewportSize()!
  expect(box, `${selector} is drawn`).not.toBeNull()
  expect(box!.x, `${selector} starts inside the window`).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width, `${selector} ends inside the window`).toBeLessThanOrEqual(size.width + 1)
}

for (const width of [1440, 390]) {
  for (const scheme of ['dark', 'light'] as const) {
    test.describe(`${width} ${scheme}`, () => {
      test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme })

      test('Dev: the pills, the chips and the commands', async ({ page: p }) => {
        await enter(p, answering(scheme), DAVE, { ...KEPT, 'hanzo.composer': { chips: true } })
        await p.goto('/')
        const ask = p.getByRole('textbox', { name: 'Describe a task or ask a question' })
        await expect(ask).toBeVisible({ timeout: 45_000 })
        await expect(p.getByRole('button', { name: 'Repository: universe' })).toBeVisible()
        // The person's theme arrives with their preferences, a beat after the first paint.
        await expect.poll(() => p.evaluate((s) => document.documentElement.classList.contains(s), scheme)).toBe(true)
        await shot(p, `look-dev-${width}-${scheme}-rest.png`)
        expect(await cramped(p)).toEqual([])

        // Where the run goes: Cloud, then the machines, a way to manage them, and the search beside the chip.
        await p.getByRole('button', { name: /^Where the run runs: / }).click()
        const places = p.getByRole('listbox', { name: 'Where the run runs' })
        await expect(places.getByRole('option')).toHaveText([/Cloud/, /dave-laptop/, /rack/])
        await expect(places.getByRole('option', { name: /rack/ })).toHaveAttribute('aria-disabled', 'true')
        await expect(p.getByRole('link', { name: 'Manage…' }).or(p.getByText('Manage…'))).toBeVisible()
        await inside(p, '[data-slot="chip-select-panel"]')
        await shot(p, `look-dev-${width}-${scheme}-environment.png`)
        await p.keyboard.press('Escape')

        // The repository, by tab: all, the organization's, GitHub's.
        await p.getByRole('button', { name: /^Repository: / }).click()
        const repos = p.getByRole('listbox', { name: 'Repository' })
        await expect(repos.getByRole('option')).toHaveCount(4)
        await p.getByRole('tab', { name: 'Organization' }).click()
        await expect(repos.getByRole('option')).toHaveText([`${ORG}/universe`, `${ORG}/site`].map((n) => new RegExp(n)))
        await p.getByRole('tab', { name: 'GitHub' }).click()
        await expect(repos.getByRole('option')).toHaveText([/widgets/, /dotfiles/])
        await expect(repos.getByRole('option', { name: /widgets/ })).toContainText('Private')
        await inside(p, '[data-slot="chip-select-panel"]')
        await shot(p, `look-dev-${width}-${scheme}-repository.png`)
        await p.getByRole('combobox', { name: 'Search repositories…' }).fill('dot')
        await expect(repos.getByRole('option')).toHaveCount(1)
        await p.keyboard.press('Escape')

        // The branch, by the keyboard: arrows to dev, Enter to choose it.
        await p.getByRole('button', { name: /^Branch: / }).click()
        const branches = p.getByRole('listbox', { name: 'Branch' })
        await expect(branches.getByRole('option')).toHaveText(['main', 'dev', 'feature-x'])
        await shot(p, `look-dev-${width}-${scheme}-branch.png`)
        await p.keyboard.press('ArrowDown')
        await p.keyboard.press('Enter')
        await expect(p.getByRole('button', { name: 'Branch: dev' })).toBeVisible()

        // The chips go where they say; the commands are one chord away.
        await expect(p.locator('[data-slot="composer-chip"]')).toHaveText(['Repos', 'Branches', 'Issues', 'Templates'])
        await ask.focus()
        await p.keyboard.press('Control+k')
        await expect(p.getByRole('listbox', { name: 'Commands' }).getByRole('option')).toHaveText([/Run/, /View issues/, /Browse templates/, /Open projects/, /Bring a repository from GitHub/])
        await inside(p, '[data-slot="chip-select-panel"]')
        await shot(p, `look-dev-${width}-${scheme}-commands.png`)
        await p.keyboard.press('Escape')
        expect(await cramped(p)).toEqual([])
      })

      test('Chat: the effort, and the mode, the model and the families once the person asks for them', async ({ page: p }) => {
        await p.route((u) => u.pathname.startsWith('/v1/'), (r) => {
          const path = new URL(r.request().url()).pathname
          if (path === '/v1/models') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(MODELS) })
          return r.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not here"}' })
        })
        await p.addInitScript((s) => {
          ;(window as unknown as { look: { theme: string } }).look = { theme: s }
        }, scheme)
        await p.route('**/-/chat', async (r) => {
          const res = await r.fetch({ url: new URL('/', r.request().url()).href })
          await r.fulfill({ response: res, body: (await res.text()).replace('/src/app/main.tsx', '/src/e2e/chat.tsx') })
        })
        await p.goto('/-/chat')
        await expect(p.getByRole('textbox', { name: 'Message' })).toBeVisible({ timeout: 45_000 })

        // Chat keeps to the effort alone by default.
        await expect(p.getByRole('button', { name: /^Effort: / })).toHaveAccessibleName('Effort: High')
        await expect(p.locator('[data-slot="composer-chip"]')).toHaveCount(0)
        await expect(p.locator('[data-slot="mode"]')).toHaveCount(0)
        await expect(p.locator('[data-slot="mind"]')).toHaveCount(0)
        await shot(p, `look-chat-${width}-${scheme}-rest.png`)
        expect(await cramped(p)).toEqual([])

        // The person turns on the chips, the mode and the model selector (Settings → Appearance).
        await p.evaluate(() => {
          localStorage.setItem('hanzo.composer', JSON.stringify({ chips: true, mode: true, model: true }))
          window.dispatchEvent(new Event('hanzo:composer'))
        })
        await expect(p.locator('[data-slot="composer-chip"]')).toHaveText(['Auto', 'Enso', 'Zen'])
        await expect(p.locator('[data-slot="mode"]')).toBeVisible()
        await expect(p.locator('[data-slot="mind"] [role="button"]')).toHaveAccessibleName('Model: Enso')
        await p.getByRole('button', { name: /^Effort: / }).click()
        await expect(p.getByRole('listbox', { name: 'Effort' }).getByRole('option')).toHaveCount(6)
        await inside(p, '[data-slot="choices"]')
        await shot(p, `look-chat-${width}-${scheme}-effort.png`)
        await p.keyboard.press('Escape')
        await p.locator('[data-slot="composer-chip"]', { hasText: 'Zen' }).click()
        await expect(p.locator('[data-slot="mind"] [role="button"]')).toHaveAccessibleName('Model: Zen6')
        await shot(p, `look-chat-${width}-${scheme}-all.png`)
        expect(await cramped(p)).toEqual([])
      })
    })
  }
}
