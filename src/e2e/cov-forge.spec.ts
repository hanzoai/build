/**
 * The forge's screens — Automations, Codebase, Sync, Projects and Issues —
 * against a platform that keeps what it is sent, signed in as acme's admin
 * unless a test says otherwise: every control driven, every refusal said.
 *
 * Each test stays in one document and moves through the rail, as a person
 * does: a page's coverage leaves with the page (fixture.ts takes it once, at
 * the end), so a reload would forget what the test drove before it. A screen
 * is read again by leaving it and coming back.
 */
import type { Page } from '@playwright/test'

import { DAVE, enter, held, MEMBER, refused, via, type Holds, type Reply, type Sent, type Who } from './cov-forge.ts'
import { expect, test } from './fixture.ts'
import { mounted, went } from './mount.ts'
import { ORG, SESSION } from './signed.ts'

const MIN = 60_000

/** The catalog as the gateway lists it: Hanzo's families, a premium model and one that holds no conversation. */
const MODELS = [
  { id: 'enso-auto', name: 'Enso', family: 'enso', class: 'ours' },
  { id: 'enso-flash', name: 'Enso Flash', family: 'enso', class: 'ours' },
  { id: 'zen5', name: 'Zen5', family: 'zen', class: 'ours' },
  { id: 'zen-embedding', name: 'Zen Embedding', family: 'zen', class: 'ours', outputs: ['embeddings'] },
  { id: 'anthropic/claude-opus-5.5', name: 'Claude Opus 5.5', class: 'premium' },
]

/** A row's time, as the platform answers it: `age` ms before the answer, so a slow page reads the same. */
const aged = (row: Record<string, unknown>, now: number, key: string, iso: boolean) => {
  if (typeof row.age !== 'number') return row
  const at = now - row.age
  return { ...row, [key]: iso ? new Date(at).toISOString() : at }
}

interface World extends Holds {
  autos: Record<string, unknown>[]
  runs: Record<string, Record<string, unknown>[]>
  /** How many reads of its runs a started run stays running for. */
  lasts: number
  repos: Record<string, unknown>[]
  envs: Record<string, unknown>[]
  grants: Record<string, unknown>[]
  unread: string[]
  boards: Record<string, unknown>[]
  issues: Record<string, unknown>[]
}

/** The forge's platform, holding `world` and changing it on every write. */
async function forge(page: Page, seed: Partial<World> = {}, who: Who = DAVE, kept: Record<string, unknown> = {}) {
  const world: World = { autos: [], runs: {}, lasts: 1, repos: [], envs: [], grants: [], unread: [], boards: [], issues: [], holds: {}, down: {}, slow: {}, ...seed }
  const answer = ({ method, path, body }: Sent): Reply | undefined => {
    const b = (body ?? {}) as Record<string, unknown>
    const now = Date.now()
    const one = path.match(/^\/v1\/auto\/automations\/([^/]+)(?:\/(run|runs))?$/)
    const find = (id: string) => world.autos.find((x) => x.id === id)
    if (path === '/v1/auto/automations' && method === 'POST') {
      const a = { id: `flow_${String(world.autos.length + 1).padStart(32, '0')}`, project: null, draft: false, next: null, last: null, created: new Date().toISOString(), updated: new Date().toISOString(), ...b, enabled: b.enabled !== false }
      world.autos.unshift(a)
      return { status: 201, json: a }
    }
    if (path === '/v1/auto/automations') return { json: { data: world.autos.map((x) => aged(x, now, 'updated', true)) } }
    if (one?.[2] === 'run') {
      const run = { id: `run_${Object.values(world.runs).flat().length + 1}`, status: 'running', at: new Date().toISOString(), finished: null, summary: '', transcript: null, reads: 0 }
      world.runs[one[1]] = [run, ...(world.runs[one[1]] ?? [])]
      return { status: 201, json: { run: { id: run.id, status: 'running' } } }
    }
    if (one?.[2] === 'runs') {
      // A run going finishes on the second read after it started, with its answer and its Dev run.
      for (const r of world.runs[one[1]] ?? []) {
        if (r.status === 'running' && (r.reads = (r.reads as number) + 1) > world.lasts) {
          Object.assign(r, { status: 'succeeded', finished: new Date().toISOString(), summary: 'Three meetings today; the first at 9.', transcript: `https://hanzo.ai/dev?run=${SESSION}` })
          find(one[1])!.last = { id: r.id, status: 'succeeded', at: r.at, summary: r.summary }
        }
      }
      return { json: { data: world.runs[one[1]] ?? [] } }
    }
    if (one && method === 'PATCH') {
      const a = find(one[1])!
      if (a.draft && !b.instructions) return refused(400, 'instructions are required')
      // A draft finished by its instructions is on unless the change says otherwise.
      const finishing = a.draft
      Object.assign(a, b, { updated: new Date().toISOString() })
      if (finishing) Object.assign(a, { draft: false, enabled: b.enabled !== false })
      a.next = a.enabled && (a.schedule as { kind: string }).kind !== 'manual' ? '2026-10-05T16:00:00Z' : null
      return { json: a }
    }
    if (one && method === 'DELETE') {
      world.autos = world.autos.filter((x) => x.id !== one[1])
      return { status: 204 }
    }
    if (one) return find(one[1]) ? { json: aged(find(one[1])!, now, 'updated', true) } : refused(404, 'automation not found')
    if (path === '/v1/models') return { json: { data: MODELS } }
    if (path === '/v1/auto/templates') {
      return {
        json: {
          data: [
            { key: 'briefing', name: 'Daily briefing', description: 'What needs your attention today.', instructions: 'Give me a short briefing on what needs my attention today.', schedule: { kind: 'weekdays', at: '08:00' }, icon: 'sunrise' },
            { key: 'review', name: 'Weekly review', description: 'A Friday summary of the week.', instructions: 'Summarize my week.', schedule: { kind: 'weekly', day: 'fri', at: '16:00' }, icon: 'list-checks' },
          ],
        },
      }
    }
    if (path === '/v1/git/repos' && method === 'POST') {
      const r = { name: b.name, org: ORG, description: b.description, defaultBranch: 'trunk', updatedAt: new Date().toISOString() }
      world.repos.push(r)
      return { status: 201, json: r }
    }
    if (path === '/v1/git/repos') return { json: { data: world.repos.map((r) => aged(r, now, 'updatedAt', true)) } }
    if (path === '/v1/environment') return { json: { data: world.envs } }
    if (path === '/v1/provider/github/repos/import') return { status: 202, json: { queued: (b.repos as string[]).length } }
    if (path === '/v1/provider/github/repos') return { json: { repos: world.grants, unread: world.unread } }
    if (path === '/v1/provider/github/user/connect') return { json: { authorizeUrl: 'https://github.com/apps/hanzo/installations/new?state=signed' } }
    if (path === '/v1/task/projects') return { json: { data: world.boards } }
    if (path === '/v1/task/board') return { json: { data: world.issues } }
    const board = path.match(/^\/v1\/task\/projects\/([^/]+)\/issues$/)?.[1]
    if (board) return { json: { data: world.issues.filter((i) => i.projectKey === board) } }
    return undefined
  }
  const sent = await enter(page, held(world, answer), who, kept)
  return { sent, world }
}

const posted = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)

/** A control of the pane — a real button — and not the rail's row of the same name. */
const own = (page: Page, name: string) => page.locator('button').and(page.getByRole('button', { name, exact: true }))

/** The New choice this browser keeps for acme. */
const kept = (page: Page) => page.evaluate((org) => JSON.parse(localStorage.getItem(`hanzo.build.new.${org}`) ?? 'null'), ORG)

/** A sync queued earlier in this tab, not reported landed yet. */
const queued = (page: Page, org: string, rows: { fullName: string; name: string }[]) =>
  page.addInitScript(
    ([key, list]) => {
      if (sessionStorage.getItem('queued')) return
      sessionStorage.setItem('queued', '1')
      sessionStorage.setItem(key, JSON.stringify(list))
    },
    [`hanzo.build.sync.${org}`, rows] as const,
  )

/** What this tab has queued for `org` and not seen land. */
const pending = (page: Page, org = ORG) => page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? 'null'), `hanzo.build.sync.${org}`)

test.describe('Automations', () => {
  const ID = (n: number) => `flow_${String(n).padStart(32, '0')}`
  const BASE = { project: null, model: null, permissions: 'ask', notify: false, draft: false, next: null, last: null, created: '2026-09-01T00:00:00Z' }
  const AUTOS = () => [
    {
      ...BASE,
      id: ID(1),
      name: 'Morning briefing',
      instructions: 'What needs my attention today.',
      schedule: { kind: 'weekdays', at: '08:00', tz: 'America/Los_Angeles' },
      enabled: true,
      next: '2026-10-05T15:00:00Z',
      last: { id: 'run_0', status: 'failed', at: '2026-10-03T15:00:00Z', summary: 'No sandbox was free.' },
      age: 20_000,
    },
    { ...BASE, id: ID(2), name: 'Weekly digest', instructions: 'Summarize the week.', schedule: { kind: 'weekly', day: 'fri', at: '16:00', tz: 'UTC' }, enabled: false, age: 5 * MIN },
    { ...BASE, id: ID(3), name: 'trial', instructions: '', schedule: { kind: 'manual', tz: 'UTC' }, enabled: false, draft: true, age: 60 * MIN },
  ]
  const patched = (sent: Sent[], id: string) => sent.filter((s) => s.method === 'PATCH' && s.path === `/v1/auto/automations/${id}`).map((s) => s.body)

  test('lists each with when it runs and its last run, switches one on and off, and searches', async ({ page }, info) => {
    const { sent } = await forge(page, { autos: AUTOS() })
    await page.goto('/-/automations')
    const row = (name: string) => page.getByRole('button', { name: `Open ${name}` })
    await expect(row('Morning briefing')).toContainText('Weekdays at 08:00 · America/Los_Angeles')
    await expect(row('Morning briefing')).toContainText('Failed')
    await expect(row('Weekly digest')).toContainText('Fridays at 16:00 · UTC')
    await expect(row('Weekly digest')).toContainText('Never run')
    await expect(row('trial')).toContainText('Draft')
    await expect(row('trial')).toContainText('Needs instructions')
    // A draft cannot be switched on until it says what it does.
    await expect(page.getByRole('switch', { name: 'trial on' })).toBeDisabled()
    await page.screenshot({ path: info.outputPath('automations.png') })

    await page.getByRole('switch', { name: 'Weekly digest on' }).click()
    await expect(page.getByRole('switch', { name: 'Weekly digest on' })).toBeChecked()
    await page.getByRole('switch', { name: 'Morning briefing on' }).click()
    await expect(page.getByRole('switch', { name: 'Morning briefing on' })).not.toBeChecked()
    // The switch sends enabled alone, so it never changes who it runs as.
    expect(patched(sent, ID(2))).toEqual([{ enabled: true }])
    expect(patched(sent, ID(1))).toEqual([{ enabled: false }])

    await page.getByLabel('Search automations').fill('  WEEK ')
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(1)
    await page.getByLabel('Search automations').fill('attention')
    await expect(page.getByRole('button', { name: /^Open / })).toHaveText(/Morning briefing/)
    await page.getByLabel('Search automations').fill('nothing like this')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
  })

  test('a switch the platform refuses says why and changes nothing', async ({ page }) => {
    await forge(page, { autos: AUTOS(), holds: { [`PATCH /v1/auto/automations/${ID(2)}`]: [{ status: 403, detail: 'only the person this automation runs as, or an admin of the organization, may do that' }] } })
    await page.goto('/-/automations')
    await page.getByRole('switch', { name: 'Weekly digest on' }).click()
    await expect(page.getByText('Weekly digest: only the person this automation runs as')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Weekly digest on' })).not.toBeChecked()
  })

  test('New automation opens the editor; Create sends what it holds, on Enso unless chosen, and lands on its page', async ({ page }, info) => {
    const { sent, world } = await forge(page, { autos: [], holds: { 'POST /v1/auto/automations': [{ status: 422, detail: 'invalid schedule: 09:00 is taken' }] } })
    await page.goto('/-/automations')
    await expect(page.getByText('No automations yet.')).toBeVisible()
    await page.getByText('No automations yet.').locator('..').getByRole('button', { name: 'New automation' }).click()
    await expect(page).toHaveURL(/\/-\/automations\/new$/)
    await expect(page.getByRole('heading', { name: 'New automation' })).toBeVisible()
    const create = page.getByRole('button', { name: 'Create' })
    await page.getByLabel('Automation name').fill('Inbox triage')
    await page.getByLabel('Instructions', { exact: true }).fill('Sort my inbox and draft replies to anything urgent.')

    // Every model that holds a conversation is offered, Enso first; an embedding model holds none.
    await page.getByRole('button', { name: 'Model: Enso' }).click()
    const offered = page.getByRole('listbox', { name: 'Model' }).getByRole('option')
    await expect(offered.first()).toHaveAccessibleName(/^Enso,/)
    await expect(page.getByRole('option', { name: /^Claude Opus 5\.5,/ })).toHaveCount(1)
    await expect(page.getByRole('option', { name: /Embedding/ })).toHaveCount(0)
    await page.getByRole('option', { name: /^Zen5,/ }).click()

    await page.getByRole('button', { name: 'When it runs: When I run it' }).click()
    await page.getByRole('option', { name: 'Weekdays' }).click()
    await page.getByLabel('Time of day').fill('9:00')
    await page.getByRole('group', { name: 'Permissions' }).getByRole('button', { name: 'Act on its own' }).click()
    await page.getByRole('switch', { name: 'Email me when a run ends' }).click()
    await create.click()
    await expect(page.getByText('invalid schedule: 09:00 is taken')).toBeVisible()
    await page.getByLabel('Time of day').fill('08:30')
    await create.click()
    await expect(page.getByRole('heading', { name: 'Inbox triage' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/-/automations/${world.autos[0]!.id}$`))
    await page.screenshot({ path: info.outputPath('automation-created.png') })
    const body = posted(sent, '/v1/auto/automations').at(-1)!.body as Record<string, unknown>
    expect(body).toMatchObject({ name: 'Inbox triage', instructions: 'Sort my inbox and draft replies to anything urgent.', model: 'zen5', permissions: 'auto', notify: true, enabled: true })
    const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(body.schedule).toEqual({ kind: 'weekdays', at: '08:30', tz: zone })
    await expect(page.getByText('No runs yet. Run now starts one.')).toBeVisible()
  })

  test('a new one asks for a name, then its instructions, before it saves or switches on, with Create always in view', async ({ page }, info) => {
    const { sent } = await forge(page, { autos: [] })
    await page.setViewportSize({ width: 1280, height: 640 })
    await page.goto('/-/automations/new')
    const name = page.getByLabel('Automation name')
    const asks = page.getByLabel('Instructions', { exact: true })
    const create = page.getByRole('button', { name: 'Create' })
    await expect(name).toBeFocused()
    await expect(page.getByText('Not created yet')).toBeVisible()
    // The switch cannot read on before there is anything to run.
    const waiting = page.getByRole('switch', { name: 'On when saved' })
    await expect(waiting).toBeDisabled()
    await expect(waiting).not.toBeChecked()
    await expect(page.getByText('Add instructions first', { exact: true })).toBeVisible()
    // Create is in view and says what is missing rather than sitting disabled.
    await expect(create).toBeInViewport()
    await create.click()
    await expect(page.getByText('Name it first.')).toBeVisible()
    await expect(name).toBeFocused()
    await name.fill('post on socials')
    await name.press('Enter')
    await expect(asks).toBeFocused()
    await create.click()
    await expect(page.getByText('Add instructions first.')).toBeVisible()
    await expect(asks).toBeFocused()
    expect(posted(sent, '/v1/auto/automations')).toHaveLength(0)
    await asks.fill('Draft one post about our week. Do not publish it.')
    await expect(page.getByRole('switch', { name: 'On when saved' })).toBeChecked()
    await page.getByRole('button', { name: 'When it runs: When I run it' }).click()
    await page.getByRole('option', { name: 'Weekdays' }).click()
    await page.getByLabel('Time of day').fill('')
    await expect(create).toBeInViewport()
    await create.click()
    await expect(page.getByText('Time of day is HH:MM on a 24-hour clock.')).toBeVisible()
    await page.getByLabel('Time of day').fill('08:30')
    await page.screenshot({ path: info.outputPath('automation-new-filled.png') })
    await create.click()
    await expect(page.getByRole('heading', { name: 'post on socials' })).toBeVisible()
    expect(posted(sent, '/v1/auto/automations')).toHaveLength(1)
    expect(posted(sent, '/v1/auto/automations')[0]!.body).toMatchObject({ name: 'post on socials', enabled: true, schedule: { kind: 'weekdays', at: '08:30' } })
  })

  test('a starter fills a new one, and leaving unsaved work asks first', async ({ page }) => {
    await forge(page, { autos: [] })
    await page.goto('/-/automations/new')
    await page.getByRole('button', { name: 'Start from Weekly review' }).click()
    await expect(page.getByLabel('Automation name')).toHaveValue('Weekly review')
    await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('Summarize my week.')
    await expect(page.getByRole('button', { name: 'When it runs: Every week' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Day: Friday' })).toBeVisible()
    await expect(page.getByLabel('Time of day')).toHaveValue('16:00')
    await page.getByRole('button', { name: 'All automations' }).click()
    const asked = page.getByRole('dialog', { name: 'Leave without saving?' })
    await expect(asked).toBeVisible()
    await asked.getByRole('button', { name: 'Keep editing' }).click()
    await expect(page).toHaveURL(/\/-\/automations\/new$/)
    await page.getByRole('button', { name: 'All automations' }).click()
    await asked.getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/-\/automations$/)
  })

  test('a run refused for want of credit says so and offers where to add it', async ({ page }) => {
    await forge(page, { autos: AUTOS(), holds: { [`POST /v1/auto/automations/${ID(1)}/run`]: [{ status: 402, detail: 'Add credits at https://console.hanzo.ai/billing/credits' }] } })
    await page.goto(`/-/automations/${ID(1)}`)
    await page.getByRole('button', { name: 'Run now' }).click()
    await expect(page.getByText('This organization has no credit for a run. Add credit, then Run now again.')).toBeVisible()
    await expect(page.getByText(/console\.hanzo\.ai/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Add credit' }).click()
    await expect(page).toHaveURL(/\/-\/settings\/billing$/)
  })

  test('a row opens its editor; Run now runs it, and its runs say how each went and open the Dev run', async ({ page }, info) => {
    const { sent } = await forge(page, { autos: AUTOS() })
    await page.goto('/-/automations')
    await page.getByRole('button', { name: 'Open Morning briefing' }).click()
    await expect(page).toHaveURL(new RegExp(`/-/automations/${ID(1)}$`))
    await expect(page.getByLabel('Automation name')).toHaveValue('Morning briefing')
    await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('What needs my attention today.')
    await expect(page.getByText(/Weekdays at 08:00 · America\/Los_Angeles · next /)).toBeVisible()
    await page.getByRole('button', { name: 'Run now' }).click()
    const runs = page.getByLabel('Run history')
    await expect(runs).toContainText('Succeeded', { timeout: 15_000 })
    await expect(runs).toContainText('Three meetings today; the first at 9.')
    expect(posted(sent, `/v1/auto/automations/${ID(1)}/run`)).toHaveLength(1)
    await page.screenshot({ path: info.outputPath('automation-ran.png') })
    await runs.getByRole('button', { name: /Open the Dev run/ }).click()
    await expect(page).toHaveURL(new RegExp(`${SESSION}$`))
  })

  test('a change sends only what changed, Run now waits for the save, and a delete asks and goes back', async ({ page }) => {
    const { sent, world } = await forge(page, { autos: AUTOS() })
    await page.goto('/-/automations')
    await page.getByRole('button', { name: 'Open Weekly digest' }).click()
    await expect(page.getByLabel('Automation name')).toHaveValue('Weekly digest')
    // A time that is not HH:MM is said, and holds the save.
    await page.getByLabel('Time of day').fill('')
    await expect(page.getByText('Time of day is HH:MM on a 24-hour clock.')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    expect(patched(sent, ID(2))).toEqual([])
    await page.getByLabel('Time of day').fill('16:00')
    await page.getByLabel('Instructions', { exact: true }).fill('Summarize the week by project.')
    await expect(page.getByRole('button', { name: 'Run now' })).toBeDisabled()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('Summarize the week.')
    await page.getByLabel('Instructions', { exact: true }).fill('Summarize the week by project.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    expect(patched(sent, ID(2))).toEqual([{ instructions: 'Summarize the week by project.' }])
    await expect(page.getByRole('button', { name: 'Run now' })).toBeEnabled()

    // The switch on the editor saves as it moves.
    await page.getByRole('switch', { name: 'Weekly digest on' }).click()
    await expect(page.getByRole('switch', { name: 'Weekly digest on' })).toBeChecked()
    expect(patched(sent, ID(2)).at(-1)).toEqual({ enabled: true })

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/\/-\/automations$/)
    expect(sent.filter((s) => s.method === 'DELETE' && s.path === `/v1/auto/automations/${ID(2)}`)).toHaveLength(1)
    expect(world.autos.map((a) => a.id)).not.toContain(ID(2))
    await expect(page.getByRole('button', { name: 'Open Weekly digest' })).toHaveCount(0)
    // Back does not open the page of what was deleted.
    await page.goBack()
    await expect(page).not.toHaveURL(new RegExp(ID(2)))
  })

  test('an edit stands while a run is read again and while the switch moves, and a save sends only it', async ({ page }) => {
    const { sent } = await forge(page, { autos: AUTOS(), lasts: 1000 })
    await page.goto(`/-/automations/${ID(1)}`)
    await page.getByRole('button', { name: 'Run now' }).click()
    await expect(page.getByLabel('Run history')).toContainText('Running')
    await page.getByLabel('Instructions', { exact: true }).fill('What needs my attention today, and why.')
    // Two reads of the runs go by.
    await page.waitForTimeout(9000)
    expect(sent.filter((x) => x.method === 'GET' && x.path === `/v1/auto/automations/${ID(1)}/runs`).length).toBeGreaterThan(2)
    await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('What needs my attention today, and why.')
    await page.getByRole('switch', { name: 'Morning briefing on' }).click()
    await expect(page.getByRole('switch', { name: 'Morning briefing on' })).not.toBeChecked()
    await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('What needs my attention today, and why.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    expect(patched(sent, ID(1))).toEqual([{ enabled: false }, { instructions: 'What needs my attention today, and why.' }])
  })

  test('what is typed while a save is in flight stands, and UTC can be chosen', async ({ page }) => {
    await forge(page, { autos: AUTOS(), holds: { [`PATCH /v1/auto/automations/${ID(2)}`]: [{ wait: 1500 }] } })
    await page.goto(`/-/automations/${ID(2)}`)
    await page.getByLabel('Instructions', { exact: true }).fill('Summarize the week by project.')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByLabel('Automation name').fill('Friday digest')
    await expect(page.getByText('Saved.')).toBeVisible()
    await expect(page.getByLabel('Automation name')).toHaveValue('Friday digest')
    await expect(page.getByLabel('Instructions', { exact: true })).toHaveValue('Summarize the week by project.')
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled()
    await page.getByRole('button', { name: 'Time zone: UTC' }).click()
    await expect(page.getByRole('option').first()).toHaveText(/^UTC/)
  })

  test('an hourly schedule saved reads saved', async ({ page }) => {
    const { sent } = await forge(page, { autos: AUTOS() })
    await page.goto(`/-/automations/${ID(2)}`)
    await page.getByRole('button', { name: 'When it runs: Every week' }).click()
    await page.getByRole('option', { name: 'Every hour' }).click()
    await page.getByLabel('Minute').fill('5')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    expect(patched(sent, ID(2)).at(-1)).toMatchObject({ schedule: { kind: 'hourly', at: '00:05' } })
    await expect(page.getByText('Unsaved changes')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Run now' })).toBeEnabled()
  })

  test('a draft opens, cannot run, and is finished in place by saving its instructions', async ({ page }, info) => {
    const { sent } = await forge(page, { autos: AUTOS() })
    await page.goto('/-/automations')
    await page.getByRole('button', { name: 'Open trial' }).click()
    await expect(page.getByText('A draft: say what it should do and save it, and it runs.')).toBeVisible()
    await expect(page.getByLabel('Automation name')).toHaveValue('trial')
    await expect(page.getByRole('button', { name: 'Run now' })).toHaveCount(0)
    // Its instructions are what it waits for: focused, and the switch waits on them.
    await expect(page.getByLabel('Instructions', { exact: true })).toBeFocused()
    await expect(page.getByRole('switch', { name: 'On when saved' })).toBeDisabled()
    await expect(page.getByRole('switch', { name: 'On when saved' })).not.toBeChecked()
    await expect(page.getByText('Add instructions first', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Add instructions first.')).toBeVisible()
    expect(patched(sent, ID(3))).toEqual([])
    await page.screenshot({ path: info.outputPath('automation-draft.png') })
    await page.getByLabel('Instructions', { exact: true }).fill('List what changed in our repos today.')
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'On when saved' })).toBeChecked()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Run now' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/-/automations/${ID(3)}$`))
    expect(patched(sent, ID(3))).toEqual([{ instructions: 'List what changed in our repos today.' }])
  })

  test('says it is reading, says why a read was refused, and an unknown automation says so', async ({ page }) => {
    const { world } = await forge(page, { autos: AUTOS(), slow: { 'GET /v1/auto/automations': 3000 } })
    await page.goto('/-/automations')
    await expect(page.getByText('Reading automations…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Weekly digest' })).toBeVisible()
    world.slow = {}
    world.down['GET /v1/auto/automations'] = 'Automations are resting'
    await via(page, 'Projects')
    await via(page, 'Automations')
    await expect(page.getByText('Automations are resting')).toBeVisible()
    await page.goto(`/-/automations/${ID(9)}`)
    await expect(page.getByText('automation not found')).toBeVisible()
    await page.getByRole('button', { name: 'All automations' }).click()
    await expect(page).toHaveURL(/\/-\/automations$/)
  })
})

test.describe('Codebase', () => {
  /** Twenty-seven repositories: two pages, two of them edited at the same moment. */
  const REPOS = () => {
    const list: Record<string, unknown>[] = [
      { name: 'universe', org: ORG, description: 'The cluster, declared', defaultBranch: 'main', age: 10 * MIN },
      { name: 'site', org: ORG, description: 'hanzo.build', age: 30 * MIN },
      { name: 'alpha', org: ORG, description: '', age: 2 * 60 * MIN },
      { name: 'beta', org: ORG, description: '', age: 2 * 60 * MIN },
    ]
    for (let i = 1; i <= 23; i++) {
      list.push({ name: `repo-${String(i).padStart(2, '0')}`, org: ORG, description: i === 7 ? 'The widget factory' : '', age: (3 * 60 + i) * MIN })
    }
    return list
  }
  const ENVS = [
    { repo: 'universe', state: 'ready', install: 'pnpm i', start: '', secrets: [] },
    { repo: 'site', state: 'proposed', install: '', start: '', secrets: [], proposal: { install: 'npm ci' } },
  ]
  const names = (page: Page) => page.getByRole('button', { name: /^Work on / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.slice(8)))
  const row = (page: Page, name: string) => page.getByRole('button', { name: `Work on ${name}` })

  test('pages 25 at a time, sorts by name or by last updated, and shows each one’s environment', async ({ page }, info) => {
    await forge(page, { repos: REPOS(), envs: ENVS })
    await page.goto('/-/codebases')
    await expect(page.getByText('Showing 1–25 of 27')).toBeVisible()
    expect((await names(page)).slice(0, 3)).toEqual(['alpha', 'beta', 'repo-01'])
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText('Showing 26–27 of 27')).toBeVisible()
    await expect(page.getByText('2 / 2')).toBeVisible()
    expect(await names(page)).toEqual(['site', 'universe'])
    await expect(row(page, 'universe')).toContainText('Ready')
    await expect(row(page, 'universe')).toContainText('10m ago')
    await expect(row(page, 'site')).toContainText('To review')
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await page.getByRole('button', { name: 'Previous page' }).click()
    await expect(page.getByText('1 / 2')).toBeVisible()
    await expect(row(page, 'alpha')).toContainText('2h ago')
    await expect(row(page, 'alpha')).toContainText('—')

    await page.getByRole('button', { name: 'Sort by last updated' }).click()
    expect((await names(page)).slice(0, 6)).toEqual(['universe', 'site', 'alpha', 'beta', 'repo-01', 'repo-02'])
    await page.screenshot({ path: info.outputPath('codebases.png') })
    await page.getByRole('button', { name: 'Sort by name' }).click()
    expect((await names(page))[0]).toBe('alpha')

    // Finding goes back to the first page, and matches the description too.
    await page.getByRole('button', { name: 'Next page' }).click()
    await page.getByLabel('Find a repository').fill('widget')
    expect(await names(page)).toEqual(['repo-07'])
    await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()
    await page.getByLabel('Find a repository').fill('no such thing')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
  })

  test('choosing one points New at it; Settings and Sync are this page’s own', async ({ page, baseURL }) => {
    await forge(page, { repos: [...REPOS().slice(0, 4), { name: 'zeta', org: ORG }], envs: ENVS })
    await page.goto('/-/codebases')
    // A repository the forge gave no time for.
    await expect(row(page, 'zeta')).toContainText('—')
    await own(page, 'Settings').click()
    await expect(page).toHaveURL(new URL('/-/settings/environments', baseURL).href)
    await via(page, 'Codebase')
    await own(page, 'Sync').click()
    await expect(page).toHaveURL(new URL('/-/sync', baseURL).href)
    await page.getByRole('button', { name: 'Back to codebases' }).click()
    await row(page, 'alpha').click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
    await expect(page.getByRole('button', { name: 'Repository: alpha' })).toBeVisible()
    expect(await kept(page)).toMatchObject({ repo: { name: 'alpha', forge: true }, branch: 'main', ask: '' })
  })

  test('a new repository is made and New holds it; what the forge refuses is said in the dialog', async ({ page, baseURL }, info) => {
    const { sent } = await forge(page, { repos: [], holds: { 'POST /v1/git/repos': [{ status: 409, detail: 'A repository named widgets already exists' }] } })
    await page.goto('/-/codebases')
    await expect(page.getByText('No repositories yet.')).toBeVisible()
    await own(page, 'New').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled()
    await dialog.getByLabel('Repository name').fill('no spaces allowed')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog.getByText(/A repository name starts with a letter or number/)).toBeVisible()
    await dialog.getByLabel('Repository name').fill('widgets')
    await dialog.getByLabel('Description').fill('  Widgets, made  ')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(dialog.getByText('A repository named widgets already exists')).toBeVisible()
    await page.screenshot({ path: info.outputPath('new-repo-refused.png') })
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
    expect(posted(sent, '/v1/git/repos').at(-1)?.body).toEqual({ name: 'widgets', description: 'Widgets, made' })
    await expect(page.getByRole('button', { name: 'Repository: widgets' })).toBeVisible()
    expect(await kept(page)).toMatchObject({ repo: { name: 'widgets' }, branch: 'trunk' })

    await via(page, 'Codebase')
    await expect(row(page, 'widgets')).toBeVisible()
    await own(page, 'New').click()
    await expect(page.getByRole('dialog').getByLabel('Repository name')).toHaveValue('')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('says it is reading, and says why a read was refused', async ({ page }) => {
    const { world } = await forge(page, { repos: REPOS(), slow: { 'GET /v1/git/repos': 3000 } })
    await page.goto('/-/codebases')
    await expect(page.getByText('Reading the forge…')).toBeVisible()
    await expect(page.getByText('Showing 1–25 of 27')).toBeVisible()
    world.slow = {}
    world.down['GET /v1/git/repos'] = 'The forge did not answer'
    await via(page, 'Projects')
    await via(page, 'Codebase')
    await expect(page.getByText('The forge did not answer')).toBeVisible()
  })

  test('a repository queued from Sync shows as syncing until the connection says it landed', async ({ page }) => {
    const { world } = await forge(page, {
      repos: [{ name: 'site', org: ORG, age: 30 * MIN }],
      grants: [
        { name: 'widgets', fullName: `${ORG}/widgets` },
        { name: 'site', fullName: `${ORG}/site`, imported: true },
      ],
      down: { 'GET /v1/provider/github/repos': 'GitHub did not answer' },
    })
    await queued(page, ORG, [
      { fullName: `${ORG}/widgets`, name: 'widgets' },
      { fullName: `${ORG}/site`, name: 'site' },
    ])
    await page.goto('/-/codebases')
    // The first look is refused: both stay as queued, the listed one once.
    await expect(row(page, 'widgets')).toContainText('Syncing…')
    await expect(row(page, 'site')).toHaveCount(1)
    await expect(row(page, 'site')).toContainText('Syncing…')
    // The next says site landed and widgets did not.
    world.down = {}
    await via(page, 'Projects')
    await via(page, 'Codebase')
    await expect(row(page, 'site')).toContainText('30m ago')
    await expect(row(page, 'widgets')).toContainText('Syncing…')
    expect(await pending(page)).toEqual([{ fullName: `${ORG}/widgets`, name: 'widgets' }])
    // Then widgets lands, and the forge lists it.
    world.grants[0]!.imported = true
    world.repos.push({ name: 'widgets', org: ORG, age: 2 * MIN })
    await via(page, 'Projects')
    await via(page, 'Codebase')
    await expect(row(page, 'widgets')).toContainText('2m ago')
    expect(await pending(page)).toBeNull()
  })

  test('a look that answers after the page is left changes nothing there', async ({ page, baseURL }) => {
    await forge(page, { grants: [{ name: 'widgets', fullName: `${ORG}/widgets`, imported: true }], slow: { 'GET /v1/provider/github/repos': 3000 } })
    await queued(page, ORG, [{ fullName: `${ORG}/widgets`, name: 'widgets' }])
    await page.goto('/-/codebases')
    await expect(row(page, 'widgets')).toContainText('Syncing…')
    await via(page, 'Projects')
    await expect(page).toHaveURL(new URL('/-/projects', baseURL).href)
    await page.waitForTimeout(3500)
    // Still queued: the answer came to a page that was gone.
    expect(await pending(page)).toHaveLength(1)
  })

  test('someone in no organization sees the forge’s own name, and what they queued', async ({ page }) => {
    await forge(page, { grants: [] }, { sub: 'solo/sam', name: 'Sam', email: 'sam@solo.test', orgs: [] })
    await queued(page, 'none', [{ fullName: 'sam/notes', name: 'notes' }])
    await page.goto('/-/codebases')
    await expect(page.getByText('Forge', { exact: true })).toBeVisible()
    await expect(row(page, 'notes')).toContainText('Syncing…')
  })
})

test.describe('Sync', () => {
  const GRANTS = () => [
    { name: 'widgets', fullName: `${ORG}/widgets`, private: true },
    { name: 'api', fullName: `${ORG}/api` },
    { name: 'site', fullName: `${ORG}/site`, imported: true, syncStatus: 'synced' },
    { name: 'dotfiles', fullName: 'dave-gh/dotfiles' },
  ]
  const looks = (sent: Sent[]) => sent.filter((s) => s.path === '/v1/provider/github/repos').length

  test('an organization’s repositories are chosen, reviewed and queued, and it goes back once they land', async ({ page, baseURL }, info) => {
    const { sent, world } = await forge(page, {
      grants: GRANTS(),
      unread: [`${ORG}-labs`, ORG],
      holds: { 'GET /v1/provider/github/repos': [{}, { status: 500 }] },
    })
    // Queued earlier in this tab and still on its way: queuing more keeps it.
    await queued(page, ORG, [{ fullName: `${ORG}/older`, name: 'older' }])
    await page.goto('/-/sync')
    await expect(page.getByText('3 organizations')).toBeVisible()
    await expect(page.getByText(`Choose repositories to bring into ${ORG}`).first()).toBeVisible()
    // An account the connection could not read, holding nothing, needs its admin.
    await expect(page.getByRole('button', { name: `${ORG}-labs needs an organization admin` })).toBeDisabled()
    await page.screenshot({ path: info.outputPath('sync-orgs.png') })
    await page.getByLabel('Search organizations').fill('DAVE')
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(1)
    await page.getByLabel('Search organizations').fill('zzz')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await page.getByLabel('Search organizations').fill('')
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await page.getByRole('button', { name: `Open ${ORG}` }).click()
    await expect(page.getByLabel('Search repositories')).toHaveValue('')
    await expect(page.getByText('3 repositories')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select site' })).toContainText('On Forge')
    await page.getByLabel('Search repositories').fill('wid')
    await expect(page.getByRole('button', { name: 'Select widgets' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select api' })).toHaveCount(0)
    await page.getByLabel('Search repositories').fill('acme/zz')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select all' })).toBeDisabled()
    await page.getByLabel('Search repositories').fill('')
    await page.getByRole('button', { name: 'Select all' }).click()
    await expect(page.getByRole('button', { name: /^Selected / })).toHaveCount(3)
    await page.getByRole('button', { name: 'Select all' }).click()
    await expect(page.getByRole('button', { name: /^Selected / })).toHaveCount(0)
    await page.getByRole('button', { name: 'Select widgets' }).click()
    await page.getByRole('button', { name: 'Select api' }).click()
    await page.getByRole('button', { name: 'Selected api' }).click()
    await page.getByRole('button', { name: 'Select api' }).click()
    await expect(page.getByRole('button', { name: 'Selected widgets' })).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: info.outputPath('sync-repos.png') })

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('widgets, +1 more')).toBeVisible()
    await expect(page.getByText('Dave · You')).toBeVisible()
    await expect(page.getByText('Repository admin')).toBeVisible()
    await expect(page.getByText(`Anyone with access to ${ORG}`)).toBeVisible()
    await page.screenshot({ path: info.outputPath('sync-access.png') })
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Selected api' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('widgets', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear the selection' }).click()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await page.getByRole('button', { name: 'All organizations' }).click()
    await expect(page.getByText('3 organizations')).toBeVisible()
    await page.getByRole('button', { name: 'Open dave-gh' }).click()
    await expect(page.getByText('1 repository', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'All organizations' }).click()
    await page.getByRole('button', { name: `Open ${ORG}` }).click()
    await page.getByRole('button', { name: 'Select widgets' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('button', { name: `Sync 1 repository to ${ORG}` }).click()
    await expect(page.getByRole('button', { name: 'Syncing…' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sync later' })).toHaveCount(0)
    expect(posted(sent, '/v1/provider/github/repos/import')[0]?.body).toEqual({ repos: [`${ORG}/widgets`] })
    expect(await pending(page)).toEqual([
      { fullName: `${ORG}/older`, name: 'older' },
      { fullName: `${ORG}/widgets`, name: 'widgets' },
    ])
    // The first look is refused, the next finds it still on its way, then it lands.
    await expect.poll(() => looks(sent), { timeout: 15_000 }).toBeGreaterThanOrEqual(3)
    await expect(page).toHaveURL(new URL('/-/sync', baseURL).href)
    world.grants[0]!.imported = true
    await expect(page).toHaveURL(new URL('/-/codebases', baseURL).href, { timeout: 15_000 })
    expect(await pending(page)).toEqual([{ fullName: `${ORG}/older`, name: 'older' }])
    await expect(page.getByRole('button', { name: 'Work on older' })).toContainText('Syncing…')
  })

  test('a look that answers after Sync is left does not move the page', async ({ page, baseURL }) => {
    // The first look after the queue is held, and answers "landed" once the page has moved on.
    const { sent, world } = await forge(page, { grants: [{ name: 'widgets', fullName: `${ORG}/widgets` }], holds: { 'GET /v1/provider/github/repos': [{}, { wait: 4000 }] } })
    await page.goto('/-/sync')
    await page.getByRole('button', { name: `Open ${ORG}` }).click()
    await page.getByRole('button', { name: 'Select widgets' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: `Sync 1 repository to ${ORG}` }).click()
    await expect(page.getByRole('button', { name: 'Syncing…' })).toBeVisible()
    await expect.poll(() => looks(sent), { timeout: 10_000 }).toBe(2)
    world.grants[0]!.imported = true
    await page.getByRole('button', { name: 'Back to codebases' }).click()
    await via(page, 'Projects')
    await expect(page).toHaveURL(new URL('/-/projects', baseURL).href)
    await page.waitForTimeout(4500)
    await expect(page).toHaveURL(new URL('/-/projects', baseURL).href)
  })

  test('what the platform refuses is said: a queue and a GitHub connection; a granted one goes to GitHub', async ({ page, baseURL }) => {
    const { sent } = await forge(page, {
      grants: GRANTS(),
      holds: {
        'POST /v1/provider/github/repos/import': [{ status: 403, detail: 'Only an org admin brings repositories in' }],
        'POST /v1/provider/github/user/connect': [{ status: 503, detail: 'GitHub is not configured here' }],
      },
    })
    // GitHub answers the page's move with nothing to show, so the page stays and says where it went.
    await page.route('https://github.com/**', (r) => r.fulfill({ status: 204 }))
    await page.goto('/-/sync')
    await page.getByRole('button', { name: 'Add organization' }).click()
    await expect(page.getByText('GitHub is not configured here')).toBeVisible()
    await page.getByRole('button', { name: `Open ${ORG}` }).click()
    await page.getByRole('button', { name: 'Select api' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: `Sync 1 repository to ${ORG}` }).click()
    await expect(page.getByText('Only an org admin brings repositories in')).toBeVisible()
    await page.getByRole('button', { name: 'Sync later' }).click()
    await expect(page).toHaveURL(new URL('/-/codebases', baseURL).href)
    await own(page, 'Sync').click()
    await page.getByRole('button', { name: `Open ${ORG}` }).click()
    const [away] = await Promise.all([page.waitForRequest(/^https:\/\/github\.com\//), page.getByRole('button', { name: 'Grant more repositories' }).click()])
    expect(away.url()).toBe('https://github.com/apps/hanzo/installations/new?state=signed')
    expect(posted(sent, '/v1/provider/github/user/connect')).toHaveLength(2)
  })

  test('a connection answering somewhere other than GitHub is not followed', async ({ page }) => {
    await forge(page, { grants: GRANTS() })
    await page.route('**/v1/provider/github/user/connect', (r) => r.fulfill({ json: { authorizeUrl: 'https://evil.test/grant' } }))
    await page.goto('/-/sync')
    await page.getByRole('button', { name: 'Add organization' }).click()
    await expect(page.getByText('The platform did not name a GitHub address to connect at')).toBeVisible()
  })

  test('says it is reading, why a read failed, and when the connection holds nothing', async ({ page }) => {
    const { world } = await forge(page, { grants: [], slow: { 'GET /v1/provider/github/repos': 3000 } })
    const again = async () => {
      await page.getByRole('button', { name: 'Back to codebases' }).click()
      await own(page, 'Sync').click()
    }
    await page.goto('/-/sync')
    await expect(page.getByText('Reading the connection…')).toBeVisible()
    await expect(page.getByText('No organizations on this connection yet.')).toBeVisible()
    await expect(page.getByText('0 organizations')).toBeVisible()
    world.slow = {}
    world.down['GET /v1/provider/github/repos'] = 'GitHub did not answer'
    await again()
    await expect(page.getByText('GitHub did not answer')).toBeVisible()
    world.down = {}
    world.grants.push({ name: 'dotfiles', fullName: 'dave-gh/dotfiles' })
    await again()
    await expect(page.getByText('1 organization', { exact: true })).toBeVisible()
  })

  test('a member is asked in as a member', async ({ page }) => {
    await forge(page, { grants: GRANTS() }, MEMBER)
    await page.goto('/-/sync')
    await page.getByRole('button', { name: `Open ${ORG}` }).click()
    await page.getByRole('button', { name: 'Select widgets' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Erin · You')).toBeVisible()
    await expect(page.getByText('Member', { exact: true })).toBeVisible()
  })

  for (const [who, says] of [
    [{ sub: 'solo/sam', email: 'sam@solo.test', orgs: [] }, 'sam@solo.test · You'],
    [{ sub: 'solo/kim', orgs: [] }, 'You · You'],
  ] as [Who, string][]) {
    test(`someone in no organization, named by IAM as “${says}”, brings repositories to the forge`, async ({ page }) => {
      await forge(page, { grants: [{ name: 'notes', fullName: 'sam/notes' }] }, who)
      await page.goto('/-/sync')
      await expect(page.getByText('Choose repositories to bring into Forge').first()).toBeVisible()
      await page.getByRole('button', { name: 'Open sam' }).click()
      await page.getByRole('button', { name: 'Select notes' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByText(says)).toBeVisible()
      await expect(page.getByText('Member', { exact: true })).toBeVisible()
      await expect(page.getByText('Anyone with access to Forge')).toBeVisible()
    })
  }

  test('a visitor is asked to sign in', async ({ page }) => {
    await mounted(page, { path: '-/sync', org: null, admin: false, person: null, signIn: true })
    await expect(page.getByText('Sign in to choose repositories the GitHub connection can read.')).toBeVisible()
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click()
    await expect.poll(() => went(page)).toContain('sign in')
  })
})

test.describe('Projects and Issues', () => {
  const BOARDS = [
    { id: 'p1', key: 'universe', name: 'Universe', description: 'The cluster' },
    { id: 'p2', key: 'site', name: 'Site' },
  ]
  const ISSUES = [
    { id: 'i1', projectKey: 'universe', number: 12, title: 'Pin the gateway image', status: 'todo', repo: 'universe' },
    { id: 'i2', projectKey: 'site', number: 3, title: 'A faster home page', status: 'in_progress' },
    { id: 'i3', title: 'Write the launch post', status: 'triage', kind: 'task' },
    { id: 'i4', projectKey: 'site', title: 'Tidy the footer', status: 'backlog' },
  ]
  const build = (page: Page, label: string) => page.getByRole('button', { name: label })

  test('a board opens its issues; All boards shows every board’s', async ({ page, baseURL }, info) => {
    const { sent } = await forge(page, { boards: BOARDS, issues: ISSUES })
    await page.goto('/-/projects')
    await expect(page.getByRole('button', { name: 'Open Universe' })).toContainText('The cluster')
    await expect(page.getByRole('button', { name: 'Open Site' })).toContainText('site')
    await page.screenshot({ path: info.outputPath('projects.png') })
    await page.getByRole('button', { name: 'Open Site' }).click()
    await expect(page).toHaveURL(new URL('/-/issues', baseURL).href)
    await expect(page.getByText('Open work on site. Choosing one starts the next run on that codebase.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Build / })).toHaveCount(2)
    expect(sent.map((s) => s.path)).toContain('/v1/task/projects/site/issues')
    await page.getByRole('button', { name: 'Show every board' }).click()
    await expect(page.getByText('Open work across every board. Choosing one starts the next run on that codebase.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Build / })).toHaveCount(4)
  })

  test('an issue opens New on its codebase with the issue as the ask', async ({ page, baseURL }, info) => {
    await forge(page, { issues: ISSUES })
    await page.goto('/-/issues')
    await expect(build(page, 'Build universe#12')).toContainText('To do')
    await expect(build(page, 'Build site#3')).toContainText('In progress')
    // No board and no number: the kind stands in for its handle, and an unknown status is said as it is.
    await expect(build(page, 'Build Write the launch post')).toContainText('task')
    await expect(build(page, 'Build Write the launch post')).toContainText('triage')
    await page.screenshot({ path: info.outputPath('issues.png') })
    const ask = page.getByRole('textbox', { name: 'Describe a task or ask a question' })

    await build(page, 'Build universe#12').click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
    await expect(ask).toHaveValue('universe#12 Pin the gateway image')
    // Handed over once: the kept choice no longer holds the words.
    expect(await kept(page)).toMatchObject({ repo: { name: 'universe' }, ask: '' })

    // An issue on a board with no repository of its own works on the board's.
    await via(page, 'Issues')
    await build(page, 'Build site#3').click()
    await expect(ask).toHaveValue('site#3 A faster home page')
    expect((await kept(page)).repo.name).toBe('site')

    // One with no number of its own is asked for by its title alone.
    await via(page, 'Issues')
    await build(page, 'Build Tidy the footer').click()
    await expect(ask).toHaveValue('Tidy the footer')

    // An issue on no codebase leaves New's choice as it was.
    await via(page, 'Issues')
    await build(page, 'Build Write the launch post').click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
    expect((await kept(page)).repo.name).toBe('site')
  })

  test('someone in no organization opens an issue on the forge’s own codebase', async ({ page, baseURL }) => {
    await forge(page, { issues: ISSUES }, { sub: 'solo/sam', name: 'Sam', email: 'sam@solo.test', orgs: [] })
    await page.goto('/-/issues')
    await build(page, 'Build universe#12').click()
    await expect(page).toHaveURL(new URL('/', baseURL).href)
    await expect(page.getByRole('textbox', { name: 'Describe a task or ask a question' })).toHaveValue('universe#12 Pin the gateway image')
    const held = await page.evaluate(() => JSON.parse(localStorage.getItem('hanzo.build.new.none') ?? 'null'))
    expect(held).toMatchObject({ repo: { name: 'universe', owner: '', full_name: 'universe' } })
  })

  test('the rail’s Issues shows every board, even from a board', async ({ page }) => {
    await forge(page, { issues: ISSUES }, DAVE, { [`hanzo.build.board.${ORG}`]: 'universe' })
    await page.goto('/-/issues')
    await expect(page.getByText('Open work on universe.', { exact: false })).toBeVisible()
    await via(page, 'Issues')
    await expect(page.getByText('Open work across every board.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Build / })).toHaveCount(4)
  })

  test('each says it is reading, why a read failed, and when there is nothing', async ({ page }) => {
    const { world } = await forge(page, { slow: { 'GET /v1/task/projects': 3000, 'GET /v1/task/board': 3000 } })
    await page.goto('/-/projects')
    await expect(page.getByText('Reading the forge…')).toBeVisible()
    await expect(page.getByText('No boards yet. A repository shows up here once it has an issue.')).toBeVisible()
    await via(page, 'Issues')
    await expect(page.getByText('Reading the forge…')).toBeVisible()
    await expect(page.getByText('Nothing open.')).toBeVisible()
    world.slow = {}
    world.down = { 'GET /v1/task/projects': 'Boards are down', 'GET /v1/task/board': 'Issues are down' }
    await via(page, 'Projects')
    await expect(page.getByText('Boards are down')).toBeVisible()
    await via(page, 'Issues')
    await expect(page.getByText('Issues are down')).toBeVisible()
  })
})
