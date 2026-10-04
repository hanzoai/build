/**
 * New — where a run goes, the codebase and branch it starts from, the mode,
 * model and effort, dictation, the environment banner and sending — and Add to
 * project from its repository picker, against a platform that answers each
 * call the way a test says. One document per test (cov-forge.spec.ts says why).
 */
import type { Page } from '@playwright/test'

import { DAVE, enter, held, MEMBER, serve, type Holds, type Reply, type Sent, type Who } from './cov-forge.ts'
import { expect, test } from './fixture.ts'
import { mounted, went } from './mount.ts'
import { ORG, SESSION } from './signed.ts'

const NEXT = `sess_${'c'.repeat(32)}`

interface World extends Holds {
  prefs: Record<string, unknown>
  machines: Record<string, unknown>[]
  models: string[]
  repos: Record<string, unknown>[]
  envs: Record<string, Record<string, unknown>>
  /** What the platform answers each declare with, in order; the last one stays. */
  declared: Record<string, unknown>[]
  builds: Record<string, unknown>[]
  /** What each dictation is heard as, in order. */
  heard: string[]
}

const UNIVERSE = { name: 'universe', org: ORG, defaultBranch: 'main', cloneUrl: `https://git.hanzo.ai/${ORG}/universe.git`, branches: ['main', 'dev', 'feature-x'] }
const SITE = { name: 'site', org: ORG, defaultBranch: 'main' }

/** The platform New talks to, holding `world`. */
async function desk(page: Page, seed: Partial<World> = {}, who: Who = DAVE, kept: Record<string, unknown> = {}) {
  const world: World = {
    prefs: {},
    machines: [
      { id: 'tgt_1', label: 'dave-laptop', kind: 'laptop', status: 'online', capacity: '10 vCPU / 32G', metricsAt: '2026-09-27T11:59:40Z' },
      { id: 'tgt_2', label: 'rack', kind: 'cluster', status: 'offline' },
    ],
    models: ['zen5.8', 'zen5.8-coder'],
    repos: [UNIVERSE, SITE],
    envs: {},
    declared: [],
    builds: [],
    heard: [],
    holds: {},
    down: {},
    slow: {},
    ...seed,
  }
  const answer = ({ method, path }: Sent): Reply | undefined => {
    if (path === '/v1/pref') return { json: { prefs: world.prefs, updatedAt: 1 } }
    if (path === '/v1/agent/targets') return { json: { targets: world.machines } }
    if (path === '/v1/models') return { json: { data: world.models.map((id) => ({ id })) } }
    if (path === '/v1/git/repos') return { json: { data: world.repos } }
    const repo = path.match(/^\/v1\/git\/repos\/([^/]+)$/)?.[1]
    if (repo) return { json: world.repos.find((r) => r.name === repo) ?? {} }
    const env = path.match(/^\/v1\/environment\/([^/]+)$/)?.[1]
    if (env) return { json: world.envs[env] ?? { repo: env, install: '', start: '', secrets: [], state: 'ready' } }
    if (path === '/v1/agent/coding' && method === 'POST') return { status: 202, json: { sessionId: NEXT, repo: 'universe', branch: 'agent/x' } }
    if (path === `/v1/agent/sessions/${NEXT}` || path === `/v1/agent/sessions/${SESSION}`) return { json: { id: path.split('/').pop(), title: 'A run', status: 'running', kind: 'coding', recentEvents: [] } }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === '/v1/platform/apps') return { status: 202, json: world.declared.length > 1 ? world.declared.shift() : world.declared[0] }
    if (path === '/v1/platform/builds') return { json: { builds: world.builds } }
    if (path === '/v1/audio/transcriptions') return { json: { text: world.heard.shift() ?? '' } }
    return undefined
  }
  const sent = await enter(page, held(world, answer), who, kept)
  return { sent, world }
}

const posted = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)
const chip = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}: `) })
const list = (page: Page, name: string) => page.getByRole('listbox', { name })
const ask = (page: Page) => page.getByRole('textbox', { name: 'Describe a task or ask a question' })

/** New holding a codebase, as a codebase's own screen leaves it. */
const holding = (repo: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  [`hanzo.build.new.${ORG}`]: { repo, branch: 'main', place: '', mode: 'build', model: 'enso-auto', effort: 'medium', ask: '', ...more },
})
const FORGE = { owner: ORG, name: 'universe', full_name: `${ORG}/universe`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: UNIVERSE.cloneUrl }

/** Opens the repository picker and presses Add to project on the row named `row`. */
async function add(page: Page, row: string) {
  await chip(page, 'Repository').click()
  const option = list(page, 'Repository').getByRole('option', { name: new RegExp(row) })
  await option.hover()
  await option.getByText('Add to project').click()
  return page.getByRole('dialog')
}

test.describe('New', () => {
  test('starts from the person’s coding defaults, says their name, and runs with what was chosen', async ({ page, baseURL }, info) => {
    const { sent } = await desk(page, { prefs: { callName: 'Dave', code: { model: 'zen5.8', effort: 'high', mode: 'build' } } })
    await page.goto('/')
    await expect(page.getByText('What’s up next, Dave?')).toBeVisible()
    await expect(chip(page, 'Model')).toHaveAccessibleName('Model: zen5.8')
    await expect(chip(page, 'Effort')).toHaveAccessibleName('Effort: High')

    await chip(page, 'Effort').click()
    await list(page, 'Effort').getByRole('option', { name: 'Low' }).click()
    await chip(page, 'Model').click()
    await list(page, 'Model').getByRole('option', { name: /^zen5\.8-coder,/ }).click()
    await expect(chip(page, 'Model')).toHaveAccessibleName('Model: zen5.8-coder')
    await chip(page, 'Where the run runs').click()
    const places = list(page, 'Where the run runs')
    await expect(places.getByRole('option', { name: /rack/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(places.getByText('Remote control · online · 10 vCPU / 32G')).toBeVisible()
    await page.screenshot({ path: info.outputPath('new-places.png') })
    await places.getByRole('option', { name: /dave-laptop/ }).click()
    await expect(chip(page, 'Where the run runs')).toHaveAccessibleName('Where the run runs: dave-laptop')

    // A plan runs in the sandbox only: said as soon as it is chosen for a machine.
    await page.getByRole('button', { name: 'Mode: Build' }).click()
    await page.getByRole('menuitem', { name: /^Plan/ }).click()
    const plan = page.getByText(/^A plan runs in the Hanzo sandbox/)
    await expect(plan).toBeVisible()

    // A machine works in its own checkout, so with no codebase chosen it is said, and nothing sent.
    await expect(chip(page, 'Repository')).toHaveAccessibleName('Repository: New project')
    await ask(page).fill('Add a footer')
    await ask(page).press('Enter')
    await expect(page.getByText('A run on dave-laptop works in its own checkout: choose the codebase, or run it in Cloud.')).toBeVisible()
    expect(posted(sent, '/v1/agent/coding')).toHaveLength(0)

    await chip(page, 'Repository').click()
    await list(page, 'Repository').getByRole('option', { name: `${ORG}/universe` }).click()
    await expect(chip(page, 'Repository')).toHaveAccessibleName('Repository: universe')
    await chip(page, 'Branch').click()
    await expect(list(page, 'Branch').getByRole('option')).toHaveText(['main', 'dev', 'feature-x'])
    await page.getByRole('combobox', { name: 'Search branches…' }).fill('DEV')
    await expect(list(page, 'Branch').getByRole('option')).toHaveText(['dev'])
    await list(page, 'Branch').getByRole('option', { name: 'dev' }).click()
    await expect(chip(page, 'Branch')).toHaveAccessibleName('Branch: dev')

    // Sent as a plan on a machine, it is refused before it leaves the page.
    await ask(page).press('Enter')
    await expect(plan).toBeVisible()
    expect(posted(sent, '/v1/agent/coding')).toHaveLength(0)
    await page.getByRole('button', { name: 'Mode: Plan' }).click()
    await page.getByRole('menuitem', { name: /^Build/ }).click()
    await ask(page).press('Enter')
    await expect(page).toHaveURL(new URL(`/${NEXT}`, baseURL).href)
    expect(posted(sent, '/v1/agent/coding')[0]?.body).toEqual({
      prompt: 'Add a footer',
      repo: 'universe',
      base: 'dev',
      targetId: 'tgt_1',
      mode: 'build',
      model: 'zen5.8-coder',
      effort: 'low',
    })
  })

  test('with no codebase chosen, a run in the sandbox starts a new project from the ask', async ({ page, baseURL }) => {
    const { sent } = await desk(page)
    await page.goto('/')
    await expect(chip(page, 'Repository')).toHaveAccessibleName('Repository: New project')
    await ask(page).fill('Build a todo app')
    await ask(page).press('Enter')
    await expect(page).toHaveURL(new URL(`/${NEXT}`, baseURL).href)
    // No repository and no base: the platform names the project after the ask.
    expect(posted(sent, '/v1/agent/coding')[0]?.body).toEqual({ prompt: 'Build a todo app', mode: 'build', effort: 'medium', desktop: true })
  })

  test('a run in the sandbox through the router names no model and no machine; a refusal is said and the draft stays', async ({ page, baseURL }) => {
    const { sent } = await desk(page, { holds: { 'POST /v1/agent/coding': [{ status: 503, detail: 'No sandbox is free right now' }] } }, DAVE, holding(FORGE))
    await page.goto('/')
    await ask(page).fill('Add a footer')
    await ask(page).press('Enter')
    await expect(page.getByText('No sandbox is free right now')).toBeVisible()
    await expect(ask(page)).toHaveValue('Add a footer')
    await ask(page).press('Enter')
    await expect(page).toHaveURL(new URL(`/${NEXT}`, baseURL).href)
    expect(posted(sent, '/v1/agent/coding')[1]?.body).toEqual({ prompt: 'Add a footer', repo: 'universe', base: 'main', mode: 'build', effort: 'medium', desktop: true })
  })

  test('says when a codebase’s environment waits for review, or has none, above the composer', async ({ page, baseURL }, info) => {
    await desk(
      page,
      {
        envs: {
          universe: { repo: 'universe', install: '', start: '', secrets: [], state: 'proposed', session: SESSION, proposal: { install: 'pnpm i' } },
          site: { repo: 'site', install: '', start: '', secrets: [], state: 'proposed', proposal: { install: 'npm ci' } },
        },
      },
      DAVE,
      holding(FORGE),
    )
    await page.goto('/')
    await expect(page.getByText('A proposed environment for universe is waiting for review.')).toBeVisible()
    await chip(page, 'Where the run runs').click()
    await expect(list(page, 'Where the run runs').getByText('Hanzo sandbox · universe environment proposed')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.screenshot({ path: info.outputPath('new-proposed.png') })

    // A proposal no run is reviewing is set up from here.
    await chip(page, 'Repository').click()
    await list(page, 'Repository').getByRole('option', { name: `${ORG}/site` }).click()
    await expect(page.getByText('A proposed environment for site is waiting for review.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Set up environment' })).toBeVisible()

    // A run on a machine uses the machine's own checkout: no banner.
    await chip(page, 'Where the run runs').click()
    await list(page, 'Where the run runs').getByRole('option', { name: /dave-laptop/ }).click()
    await expect(page.getByText('A proposed environment for site is waiting for review.')).toHaveCount(0)
    await chip(page, 'Where the run runs').click()
    await list(page, 'Where the run runs').getByRole('option', { name: /Cloud/ }).click()

    await chip(page, 'Repository').click()
    await list(page, 'Repository').getByRole('option', { name: `${ORG}/universe` }).click()
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page).toHaveURL(new URL(`/${SESSION}`, baseURL).href)
  })

  test('a codebase the forge no longer lists is still offered, at its default branch', async ({ page }) => {
    // Kept from before, with no branch of its own and none the forge said.
    const gone = { owner: ORG, name: 'gone', full_name: '', private: false, default_branch: '', pushed_at: '', installation_id: 0, forge: true, clone: '' }
    await desk(page, {}, DAVE, holding(gone, { branch: '' }))
    await page.goto('/')
    await expect(chip(page, 'Branch')).toHaveAccessibleName('Branch: main')
    // The forge answers its detail without naming it: its default branch stands in.
    await chip(page, 'Branch').click()
    await expect(list(page, 'Branch').getByRole('option')).toHaveText(['main'])
    await page.keyboard.press('Escape')

    // Choosing it from the list keeps it as the forge row it was.
    await chip(page, 'Repository').click()
    await list(page, 'Repository').getByRole('option', { name: new RegExp(`${ORG}/gone`) }).click()
    await expect(chip(page, 'Repository')).toHaveAccessibleName('Repository: gone')
    const kept = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), `hanzo.build.new.${ORG}`)
    expect(kept.repo).toMatchObject({ name: 'gone', full_name: `${ORG}/gone`, default_branch: 'main', forge: true })
  })

  test('a choice this version does not offer reads as the default, and a refused list says why', async ({ page }) => {
    await desk(
      page,
      { down: { 'GET /v1/agent/targets': 'Machines are resting', 'GET /v1/models': 'The catalog is resting' } },
      DAVE,
      holding(FORGE, { effort: 'extreme', model: 'retired-model' }),
    )
    await page.goto('/')
    await expect(chip(page, 'Effort')).toHaveAccessibleName('Effort: Medium')
    // A kept model the catalog cannot vouch for is shown as it is kept, never renamed.
    await expect(chip(page, 'Model')).toHaveAccessibleName('Model: retired-model')
    await chip(page, 'Where the run runs').click()
    await expect(list(page, 'Where the run runs').locator('..').getByText('Machines are resting')).toBeVisible()
    await page.keyboard.press('Escape')
    await chip(page, 'Model').click()
    await expect(page.getByText('The catalog is resting')).toBeVisible()
  })

  test('dictation lands in the draft, after what is already there', async ({ page }) => {
    // A microphone this page can record: a tone, standing in for a voice.
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext()
        const tone = ctx.createOscillator()
        const out = ctx.createMediaStreamDestination()
        tone.connect(out)
        tone.start()
        return out.stream
      }
    })
    const { sent } = await desk(page, { heard: ['add a footer', 'and a header'] }, DAVE, holding(FORGE))
    await page.goto('/')
    const dictate = page.getByRole('button', { name: 'Dictate' })
    for (const words of ['add a footer', 'add a footer and a header']) {
      await dictate.click()
      const stop = page.getByRole('button', { name: 'Stop and transcribe' })
      await expect(stop).toBeVisible()
      await page.waitForTimeout(300)
      await stop.click()
      await expect(ask(page)).toHaveValue(words)
    }
    expect(posted(sent, '/v1/audio/transcriptions')).toHaveLength(2)
  })

  test('a visitor who sends is asked to sign in, and what they sent waits for them', async ({ page }) => {
    const sent = await serve(page, () => ({ status: 401, json: { status: 401, title: 'Unauthorized', detail: 'Sign in to use this.' } }))
    await mounted(page, { path: '', org: null, admin: false, person: null, signIn: true })
    await ask(page).fill('Add a footer')
    await ask(page).press('Enter')
    await expect.poll(() => went(page)).toEqual(['sign in'])
    expect(sent.filter((s) => s.path === '/v1/agent/coding')).toEqual([])
    expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem('hanzo.build.unsent'))) ?? '{}')).toEqual({ draft: 'Add a footer', files: [], sent: true })
  })
})

test.describe('Add to project', () => {
  const REVIEW = 'https://git.hanzo.ai/hanzoai/universe/pulls/9'
  const declared = (build: Record<string, unknown> | null, review = REVIEW) => ({ app: 'universe', build, declaration: { mode: 'branch', ref: 'deploy/universe', review, live: false } })

  test('an admin builds a codebase into a project, waits for the build, and ships it to main', async ({ page }, info) => {
    const { sent, world } = await desk(
      page,
      {
        declared: [declared({ id: 'b1', job: 'j1', image: 'ghcr.io/acme/universe:b1', status: 'queued' }), { app: 'universe', declaration: { mode: 'commit', ref: 'main', live: true } }],
        holds: { 'GET /v1/platform/builds': [{ status: 500 }], 'POST /v1/platform/apps': [{ wait: 2000 }, { wait: 2000 }] },
      },
      DAVE,
      holding(FORGE),
    )
    await page.goto('/')
    const dialog = await add(page, `${ORG}/universe`)
    await expect(dialog.getByText(`Build ${ORG}/universe at main and declare it in a project. As an admin you can take a green build to main.`)).toBeVisible()
    const project = dialog.getByRole('textbox', { name: 'Project' })
    await expect(project).toHaveValue('universe')
    await project.fill('My Shop!')
    await expect(dialog.getByText('Saved as my-shop')).toBeVisible()
    await project.fill('')
    await expect(dialog.getByText('Saved as universe')).toBeVisible()
    await project.fill('shop')
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    await expect(dialog.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await expect(project).toBeDisabled()
    await expect(dialog.getByText('Build b1: queued')).toBeVisible()
    await expect(dialog.getByRole('link', { name: /Open the review/ })).toHaveAttribute('href', REVIEW)
    await expect(dialog.getByRole('button', { name: 'Waiting for the build' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Done' })).toBeVisible()
    expect(posted(sent, '/v1/platform/apps')[0]?.body).toEqual({ repo: UNIVERSE.cloneUrl, ref: 'main', name: 'universe', partOf: 'shop', mode: 'branch' })
    await page.screenshot({ path: info.outputPath('publish-waiting.png') })

    // The first look at the builds is refused; the next finds it green.
    world.builds = [{ id: 'b0', status: 'failed' }, { id: 'b1', repo: 'universe', status: 'succeeded' }]
    await expect(dialog.getByText('Build b1: succeeded')).toBeVisible({ timeout: 12_000 })
    await dialog.getByRole('button', { name: 'Ship to main' }).click()
    await expect(dialog.getByRole('button', { name: 'Shipping…' })).toBeDisabled()
    await expect(dialog.getByText('Declared on main — CD applies it on its next pass.')).toBeVisible()
    expect(posted(sent, '/v1/platform/apps')[1]?.body).toEqual({ repo: UNIVERSE.cloneUrl, ref: 'main', name: 'universe', partOf: 'shop', mode: 'commit', tag: 'b1' })
    await page.screenshot({ path: info.outputPath('publish-shipped.png') })
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('what the platform refuses is said in the dialog, and adding or shipping goes again', async ({ page }) => {
    const { sent } = await desk(
      page,
      {
        declared: [declared({ id: 'b3', status: 'succeeded' })],
        builds: [{ id: 'b3', status: 'succeeded' }],
        holds: { 'POST /v1/platform/apps': [{ status: 422, detail: 'universe is not a DNS label' }, {}, { status: 409, detail: 'main moved; build again' }] },
      },
      DAVE,
      holding(FORGE),
    )
    await page.goto('/')
    const dialog = await add(page, `${ORG}/universe`)
    // Left empty, the project is named for the codebase.
    await dialog.getByRole('textbox', { name: 'Project' }).fill('')
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('universe is not a DNS label')
    await expect(dialog.getByRole('textbox', { name: 'Project' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    await expect(dialog.getByText('Build b3: succeeded')).toBeVisible()
    await dialog.getByRole('button', { name: 'Ship to main' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('main moved; build again')
    await expect(dialog.getByRole('button', { name: 'Ship to main' })).toBeEnabled()
    expect(posted(sent, '/v1/platform/apps').map((s) => (s.body as { partOf: string }).partOf)).toEqual(['universe', 'universe', 'universe'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a repository with no clone address of its own, or one the forge no longer lists, is built from the forge’s address', async ({ page }) => {
    const gone = { owner: ORG, name: 'gone', full_name: '', private: false, default_branch: '', pushed_at: '', installation_id: 0, forge: true, clone: '' }
    const { sent } = await desk(page, { declared: [declared(null, '')] }, DAVE, holding(gone, { branch: '' }))
    await page.goto('/')
    let dialog = await add(page, `${ORG}/site`)
    await expect(dialog.getByText(`Build ${ORG}/site at main`, { exact: false })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    dialog = await add(page, `${ORG}/gone`)
    await expect(dialog.getByText(`Build ${ORG}/gone at main`, { exact: false })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    // No build came back, and no review to open.
    await expect(dialog.getByText('Build : building')).toBeVisible()
    await expect(dialog.getByRole('link', { name: /Open the review/ })).toHaveCount(0)
    const origin = new URL(page.url()).origin
    expect(posted(sent, '/v1/platform/apps')[0]?.body).toEqual({ repo: `${origin}/v1/git/${ORG}/gone.git`, ref: 'main', name: 'gone', partOf: 'gone', mode: 'branch' })
  })

  test('a member’s addition opens a review and ships nothing', async ({ page }) => {
    const { sent } = await desk(page, { declared: [declared({ id: 'b2', status: 'running' })] }, MEMBER, holding(FORGE))
    await page.goto('/')
    const dialog = await add(page, `${ORG}/universe`)
    await expect(dialog.getByText('It opens a review; merging it is what deploys.', { exact: false })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add to project' }).click()
    await expect(dialog.getByText('Build b2: running')).toBeVisible()
    // The builds list does not name it yet: it stays as the platform last said.
    await expect.poll(() => sent.filter((s) => s.path === '/v1/platform/builds').length).toBeGreaterThan(0)
    await expect(dialog.getByText('Build b2: running')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Ship to main|Waiting for the build/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
