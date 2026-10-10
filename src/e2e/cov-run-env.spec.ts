/**
 * A codebase's environment, in a run's Environment tab on a stubbed platform
 * (cov-run.ts): set up by an agent, a proposal reviewed by saving it, scripts
 * edited, secrets added, refused and removed, locked while a setup run works
 * and read-only to a member; and New's offer to set a codebase up.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { finished, hold, NEXT, ORG, rig, SESSION, to } from './cov-run.ts'
import { setup, STRANGER } from './stubs.ts'

const desk = (p: Page) => p.getByRole('complementary', { name: 'Run details' })
const ENV = '/v1/environment/universe'
const refusal = (detail: string, code = 403) => ({ status: code, json: { detail } })
const note = (p: Page, says: string) => desk(p).getByRole('status').filter({ hasText: says })

/** A run on universe, opened on its Environment tab. */
async function open(p: Page, env: Record<string, unknown>, over?: Parameters<typeof rig>[2], record = finished()) {
  const got = await rig(p, { env, record }, over)
  await p.goto(`/${SESSION}`)
  await desk(p).getByRole('button', { name: 'Environment', exact: true }).first().click()
  return got
}

/** Signs the page in as a plain member of the org rather than its admin, keeping what was seeded for this browser. */
async function member(p: Page) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = [b64({ alg: 'none' }), b64({ sub: `${ORG}/zed`, email: 'zed@acme.test', orgs: [{ org: ORG, role: 'member' }] }), 'x'].join('.')
  await p.addInitScript(
    ([t, who]) => {
      localStorage.setItem('hanzo_iam_access_token', t)
      localStorage.setItem('hanzo:who', who)
    },
    [token, `${ORG}/zed`] as const,
  )
}

test('a codebase with no environment is set up by an agent, which opens', async ({ page: p }, info) => {
  const { sent } = await open(p, { repo: 'universe', install: '', start: '', secrets: [], state: 'none' })
  await expect(desk(p).getByText('Not set up')).toBeVisible()
  await expect(desk(p).getByRole('textbox', { name: 'Install Script' })).toHaveAttribute('placeholder', 'pnpm install --frozen-lockfile')
  await expect(desk(p).getByRole('textbox', { name: 'Start Script' })).toHaveAttribute('placeholder', 'pnpm dev')
  await expect(desk(p).getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(desk(p).getByText('No secrets yet')).toBeVisible()
  await p.screenshot({ path: info.outputPath('none.png') })
  await desk(p).getByRole('button', { name: 'Set up with an agent' }).click()
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  const body = to(sent, 'POST', '/v1/agent/coding')[0]?.body as { mode: string; repo: string; prompt: string }
  expect([body.mode, body.repo, body.prompt.split('\n')[0]]).toEqual(['setup', 'universe', 'Set up the environment'])
})

test('a setup run the platform will not start says why', async ({ page: p }) => {
  await open(p, { repo: 'universe', state: 'none' }, ({ path }) => (path === '/v1/agent/coding' ? refusal('No sandbox is free', 503) : undefined))
  await desk(p).getByRole('button', { name: 'Set up with an agent' }).click()
  await expect(note(p, 'The code workspace is not answering right now. Try again shortly.')).toBeVisible()
  await expect(desk(p).getByRole('button', { name: 'Set up with an agent' })).toBeEnabled()
})

test('a proposal is drawn in the editors, and saving it is the review', async ({ page: p }, info) => {
  const { sent } = await open(p, {
    repo: 'universe',
    install: '',
    start: '',
    secrets: ['TOKEN'],
    state: 'proposed',
    session: 'sess_setup',
    proposal: { install: 'npm ci', start: 'npm start', secrets: ['TOKEN', 'API_KEY'], note: 'A Node app; its tests pass.' },
  })
  await expect(desk(p).getByText('Proposed', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('What the setup agent found')).toBeVisible()
  await expect(desk(p).getByText('A Node app; its tests pass.')).toBeVisible()
  await expect(desk(p).getByRole('textbox', { name: 'Install Script' })).toHaveValue('npm ci')
  await expect(desk(p).getByRole('textbox', { name: 'Start Script' })).toHaveValue('npm start')
  await expect(desk(p).getByText('needed, not set')).toHaveCount(1)
  await p.screenshot({ path: info.outputPath('proposed.png') })
  await desk(p).getByRole('button', { name: 'Save' }).click()
  await expect(note(p, 'Saved')).toBeVisible()
  expect(to(sent, 'PUT', ENV).map((s) => s.body)).toEqual([{ install: 'npm ci', start: 'npm start' }])
  await expect(desk(p).getByText('Ready', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('What the setup agent found')).toHaveCount(0)
  await expect(desk(p).getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('edited scripts are saved, and a refused save says why and keeps the edit', async ({ page: p }) => {
  let refuse = true
  const { sent } = await open(p, { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' }, ({ path, method }) =>
    refuse && path === ENV && method === 'PUT' ? refusal('Only an org admin saves an environment') : undefined,
  )
  const install = desk(p).getByRole('textbox', { name: 'Install Script' })
  await expect(install).toHaveValue('pnpm i')
  await install.fill('pnpm install --frozen-lockfile')
  await desk(p).getByRole('textbox', { name: 'Start Script' }).fill('pnpm dev')
  await desk(p).getByRole('button', { name: 'Save' }).click()
  // Said in a reader's words: who saves it, and what to do instead.
  await expect(note(p, 'Only an organization admin saves an environment. Start the agent instead; an admin reviews what it proposes.')).toBeVisible()
  await expect(install).toHaveValue('pnpm install --frozen-lockfile')
  refuse = false
  await desk(p).getByRole('button', { name: 'Save' }).click()
  await expect(note(p, 'Saved')).toBeVisible()
  expect(to(sent, 'PUT', ENV).at(-1)?.body).toEqual({ install: 'pnpm install --frozen-lockfile', start: 'pnpm dev' })
})

test('a secret is refused a name the run cannot export or no value, then set, and removed', async ({ page: p }, info) => {
  const { sent } = await open(p, { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' })
  await desk(p).getByRole('button', { name: 'New Secret' }).click()
  await expect(desk(p).getByText('No secrets yet')).toHaveCount(0)
  const name = desk(p).getByLabel('Secret name')
  const value = desk(p).getByLabel('Secret value')
  const add = desk(p).getByRole('button', { name: 'Add secret' })
  await name.fill('HANZO_KEY')
  await value.fill('v')
  await add.click()
  await expect(note(p, 'HANZO_KEY is reserved for the run itself')).toBeVisible()
  await name.fill('1TOKEN')
  await add.click()
  await expect(note(p, '1TOKEN is not an environment variable name')).toBeVisible()
  await name.fill('STRIPE_KEY')
  await value.fill('')
  await add.click()
  await expect(note(p, 'A secret needs a value')).toBeVisible()
  await value.fill('sk_test_1')
  await p.screenshot({ path: info.outputPath('secret.png') })
  await add.click()
  await expect(note(p, 'STRIPE_KEY is set')).toBeVisible()
  await expect(name).toHaveCount(0)
  expect(to(sent, 'PUT', `${ENV}/secrets/STRIPE_KEY`).map((s) => s.body)).toEqual([{ value: 'sk_test_1' }])
  await expect(desk(p).getByText('STRIPE_KEY', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('set', { exact: true })).toBeVisible()
  // A second one is listed under the first.
  await desk(p).getByRole('button', { name: 'New Secret' }).click()
  await desk(p).getByLabel('Secret name').fill('DB_URL')
  await desk(p).getByLabel('Secret value').fill('postgres://x')
  await desk(p).getByRole('button', { name: 'Add secret' }).click()
  await expect(note(p, 'DB_URL is set')).toBeVisible()
  await expect(desk(p).getByText('set', { exact: true })).toHaveCount(2)
  await desk(p).getByRole('button', { name: 'Remove STRIPE_KEY' }).click()
  await expect(note(p, 'STRIPE_KEY is removed')).toBeVisible()
  await desk(p).getByRole('button', { name: 'Remove DB_URL' }).click()
  await expect(note(p, 'DB_URL is removed')).toBeVisible()
  expect(to(sent, 'DELETE', `${ENV}/secrets/STRIPE_KEY`)).toHaveLength(1)
  await expect(desk(p).getByText('No secrets yet')).toBeVisible()
})

test('a needed secret is set from its row, a refused one keeps the form, and Cancel clears it', async ({ page: p }) => {
  let refuse = true
  const { sent } = await open(
    p,
    { repo: 'universe', install: '', start: '', secrets: ['TOKEN'], state: 'proposed', proposal: { install: 'npm ci', start: '', secrets: ['API_KEY'], note: '' } },
    ({ path, method }) => (refuse && method === 'PUT' && path.includes('/secrets/') ? refusal('KMS is unreachable', 503) : undefined),
  )
  await expect(desk(p).getByText('What the setup agent found')).toHaveCount(0)
  await desk(p).getByRole('button', { name: 'Set API_KEY' }).click()
  await expect(desk(p).getByLabel('Secret name')).toHaveValue('API_KEY')
  await desk(p).getByLabel('Secret value').fill('k')
  await desk(p).getByRole('button', { name: 'Add secret' }).click()
  await expect(note(p, 'The environment store is not answering right now. Try again shortly.')).toBeVisible()
  await expect(note(p, 'KMS is unreachable')).toHaveCount(0)
  await expect(desk(p).getByLabel('Secret name')).toHaveValue('API_KEY')
  await desk(p).getByRole('button', { name: 'Cancel' }).click()
  await expect(desk(p).getByLabel('Secret name')).toHaveCount(0)
  await desk(p).getByRole('button', { name: 'New Secret' }).click()
  await expect(desk(p).getByLabel('Secret name')).toHaveValue('')
  refuse = false
  await desk(p).getByRole('button', { name: 'Remove TOKEN' }).click()
  await expect(note(p, 'TOKEN is removed')).toBeVisible()
  expect(to(sent, 'PUT', `${ENV}/secrets/API_KEY`)).toHaveLength(1)
})

test('while a setup run works, its scripts are its to find', async ({ page: p }, info) => {
  await open(p, { repo: 'universe', install: '', start: '', secrets: [], state: 'none' }, undefined, { ...finished(), status: 'running', mode: 'setup', branch: '' })
  await expect(desk(p).getByText('Setting up', { exact: true })).toBeVisible()
  const install = desk(p).getByRole('textbox', { name: 'Install Script' })
  await expect(install).toBeDisabled()
  await expect(install).toHaveAttribute('placeholder', 'Install script editing will be available when the agent stops running')
  await expect(desk(p).getByRole('textbox', { name: 'Start Script' })).toHaveAttribute('placeholder', 'Start script editing will be available when the agent stops running')
  await expect(desk(p).getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(desk(p).getByRole('button', { name: 'Set up with an agent' })).toHaveCount(0)
  await p.screenshot({ path: info.outputPath('busy.png') })
})

test('a member reads the environment and changes none of it', async ({ page: p }, info) => {
  await rig(p, { env: { repo: 'universe', install: 'pnpm i', start: 'pnpm dev', secrets: ['TOKEN'], state: 'proposed', proposal: { install: 'pnpm i', start: 'pnpm dev', secrets: ['API_KEY'], note: '' } } })
  await member(p)
  await p.goto(`/${SESSION}`)
  await desk(p).getByRole('button', { name: 'Environment', exact: true }).first().click()
  await expect(desk(p).getByText('An org admin saves the environment and sets its secrets.')).toBeVisible()
  await expect(desk(p).getByRole('textbox', { name: 'Install Script' })).toBeDisabled()
  for (const b of ['Save', 'New Secret', 'Remove TOKEN', 'Set API_KEY']) await expect(desk(p).getByRole('button', { name: b })).toHaveCount(0)
  await p.screenshot({ path: info.outputPath('member.png') })
})

test('the environment says it is reading, and why it could not be read', async ({ page: p }) => {
  let refuse = false
  await rig(p, {}, ({ path }) => (refuse && path === ENV ? refusal('The environment store is down', 503) : undefined))
  const go = await hold(p, ENV)
  await p.goto(`/${SESSION}`)
  await desk(p).getByRole('button', { name: 'Environment', exact: true }).first().click()
  await expect(desk(p).getByText('Reading the environment…')).toBeVisible()
  refuse = true
  go()
  await expect(desk(p).getByText('universe’s environment could not be read right now.')).toBeVisible()
  await expect(desk(p).getByText('The environment store is down')).toHaveCount(0)
})

test.describe('New’s offer to set a codebase up', () => {
  test('says why Skip & save or Start agent was refused, and closes when asked', async ({ page: p }) => {
    await setup(p)
    let refuse = true
    await p.route(
      (u) => u.pathname === ENV || u.pathname === '/v1/agent/coding',
      (r) =>
        !refuse || r.request().method() === 'GET'
          ? r.fallback()
          : r.fulfill({ status: 403, json: { detail: r.request().method() === 'PUT' ? 'Only an org admin saves an environment' : 'Setup runs are off for this org' } }),
    )
    await p.goto('/')
    await p.getByRole('button', { name: 'Set up environment' }).click()
    const dialog = p.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Skip & save' }).click()
    await expect(dialog.getByRole('status')).toHaveText('Only an organization admin saves an environment. Start the agent instead; an admin reviews what it proposes.')
    await dialog.getByRole('button', { name: 'Start agent' }).click()
    await expect(dialog.getByRole('status')).toHaveText('This account cannot start a run on universe. Ask an organization admin for access.')
    await expect(dialog.getByRole('button', { name: 'Start agent' })).toBeEnabled()
    // What failed is tried again from where it is said.
    await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(p.getByRole('dialog')).toHaveCount(0)
    await expect(p).toHaveURL(/\/$/)
    // Let through, Skip & save keeps the codebase's environment empty and the offer goes.
    refuse = false
    await p.getByRole('button', { name: 'Set up environment' }).click()
    await p.getByRole('dialog').getByRole('button', { name: 'Skip & save' }).click()
    await expect(p.getByRole('dialog')).toHaveCount(0)
    // The platform answers an empty save as state `none` with the time it was saved: a choice made, so the offer goes.
    await expect(p.getByRole('button', { name: 'Set up environment' })).toHaveCount(0)
    await p.reload({ waitUntil: 'domcontentloaded' })
    // Read again, the saved choice stands: the sandbox says the environment is there and empty, and nothing offers it again.
    await p.getByRole('button', { name: 'Where the run runs: Cloud' }).click()
    await expect(p.getByText('Hanzo sandbox · universe environment, empty')).toBeVisible()
    await p.keyboard.press('Escape')
    await expect(p.getByRole('button', { name: 'Set up environment' })).toHaveCount(0)
  })

  test('a board’s key held as the codebase is said to be none of the org’s, and the dialog sets up only one of its repositories', async ({ page: p }, info) => {
    const sent = await setup(p, STRANGER)
    await p.goto('/')
    await expect(p.getByText('HCC is not one of this organization’s repositories.')).toBeVisible()
    // No environment is offered or read for a name that is not a repository.
    await expect(p.getByRole('button', { name: 'Set up environment' })).toHaveCount(0)
    expect(sent.some((s) => s.path === '/v1/environment/HCC')).toBe(false)
    await p.getByRole('textbox', { name: 'Describe a task or ask a question' }).press('Enter')
    await expect(p.getByText('HCC is not one of this organization’s repositories. Choose one, or leave it empty to start a new project.')).toBeVisible()
    expect(to(sent, 'POST', '/v1/agent/coding')).toHaveLength(0)
    await p.screenshot({ path: info.outputPath('stranger.png') })
  })

  test('the dialog chooses from the org’s repositories, refuses one it does not hold, and Start agent runs on the chosen one', async ({ page: p }) => {
    const sent = await setup(p)
    await p.goto('/')
    await p.getByRole('button', { name: 'Set up environment' }).click()
    const dialog = p.getByRole('dialog')
    await expect(dialog.getByLabel('Chosen repository')).toHaveText(`${ORG}/universe`)
    // The forge's own, and a linked repository's copy there: one list.
    await expect(dialog.getByRole('button', { name: `Choose ${ORG}/site` })).toBeVisible()
    await dialog.getByLabel('Find a repository').fill('sit')
    await expect(dialog.getByRole('button', { name: `Choose ${ORG}/universe` })).toHaveCount(0)
    await dialog.getByRole('button', { name: `Choose ${ORG}/site` }).click()
    await expect(dialog.getByLabel('Chosen repository')).toHaveText(`${ORG}/site`)
    await dialog.getByRole('button', { name: 'Start agent' }).click()
    await expect(p).toHaveURL(new RegExp(`/${SESSION}$`))
    expect(to(sent, 'POST', '/v1/agent/coding')[0]?.body).toMatchObject({ mode: 'setup', repo: 'site', model: 'enso-auto', effort: 'medium' })
  })

  test('a setup the platform refuses for a repository it cannot find says so plainly, with a way to try again', async ({ page: p }) => {
    const sent = await setup(p)
    let refuse = true
    await p.route(
      (u) => u.pathname === '/v1/agent/coding',
      (r) => (refuse ? r.fulfill({ status: 400, json: { detail: 'coding: acme has no repository named or serving "universe"' } }) : r.fallback()),
    )
    await p.goto('/')
    await p.getByRole('button', { name: 'Set up environment' }).click()
    const dialog = p.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Start agent' }).click()
    await expect(dialog.getByRole('status')).toHaveText('universe is not a repository this organization has on the forge. Choose one of its repositories.')
    await expect(dialog.getByText(/coding:/)).toHaveCount(0)
    refuse = false
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(p).toHaveURL(new RegExp(`/${SESSION}$`))
    expect(to(sent, 'POST', '/v1/agent/coding')).toHaveLength(1)
  })

  test('offers a member only the agent, which starts and opens', async ({ page: p }) => {
    const sent = await setup(p)
    await member(p)
    await p.goto('/')
    await p.getByRole('button', { name: 'Set up environment' }).click()
    const dialog = p.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Skip & save' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Start agent' }).click()
    await expect(p).toHaveURL(new RegExp(`/${SESSION}$`))
    await expect(p.getByRole('dialog')).toHaveCount(0)
    expect(to(sent, 'POST', '/v1/agent/coding')[0]?.body).toMatchObject({ mode: 'setup', repo: 'universe' })
  })
})
