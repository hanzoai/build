/**
 * The shelves — Artifacts and Templates — and the two questions an act asks
 * first (ask.tsx): a starter copied into a project, a project renamed, made
 * public or private, and deleted, each refusal said where it was asked. One
 * document per test (cov-forge.spec.ts says why).
 */
import type { Page } from '@playwright/test'

import { enter, held, serve, via, type Holds, type Reply, type Sent } from './cov-forge.ts'
import { expect, test } from './fixture.ts'
import { ORG } from './signed.ts'
import { PNG } from './stubs.ts'

const unix = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) / 1000

interface World extends Holds {
  projects: Record<string, unknown>[]
  starters: Record<string, unknown>[]
  /** What each copy answers with, in order; then the starter's slug with `-2`. */
  forks: Record<string, unknown>[]
}

const PROJECTS = () => [
  { slug: 'shop', name: 'Shop', visibility: 'private', liveUrl: 'https://shop.hanzo.app', createdAt: unix(2026, 8, 1), updatedAt: unix(2026, 9, 20) },
  // Made and never edited since.
  { slug: 'blog', name: 'Blog', visibility: 'public', createdAt: unix(2026, 9, 2) },
  { slug: 'old', name: 'Old site', visibility: 'public', createdAt: unix(2025, 2, 1), updatedAt: unix(2025, 3, 1) },
  // Neither made nor edited, as far as the record says.
  { slug: 'mystery', name: 'Mystery' },
]

const STARTERS = [
  { slug: 'synapse', title: 'Synapse', category: 'App', description: 'A dashboard', framework: 'Next.js' },
  { slug: 'circle', title: 'Circle', category: 'App', description: 'A community' },
  { slug: 'metrics', title: 'Metrics', category: 'App', description: '', framework: 'Vite' },
  { slug: 'folio', title: 'Folio', category: 'Site', description: '' },
  { slug: 'mint', title: 'Mint', category: 'Site', description: '' },
]

/** The platform the shelves talk to, holding `world`. */
async function shelf(page: Page, seed: Partial<World> = {}) {
  const world: World = { projects: PROJECTS(), starters: STARTERS, forks: [], holds: {}, down: {}, slow: {}, ...seed }
  const answer = ({ method, path, body }: Sent): Reply | undefined => {
    const b = (body ?? {}) as Record<string, unknown>
    if (path === '/v1/projects') return { json: world.projects }
    if (path === '/v1/templates') return { json: { data: world.starters } }
    if (path === '/v1/projects/fork') return { status: 201, json: world.forks.shift() ?? { slug: `${b.slug}-2`, name: 'Copy' } }
    const slug = path.match(/^\/v1\/projects\/([^/]+)$/)?.[1]
    const i = world.projects.findIndex((p) => p.slug === slug)
    if (slug && method === 'PATCH') {
      world.projects[i] = { ...world.projects[i], ...b }
      return { json: world.projects[i] }
    }
    if (slug && method === 'DELETE') {
      world.projects.splice(i, 1)
      return { status: 204, text: '' }
    }
    return undefined
  }
  const sent = await enter(page, held(world, answer))
  // Each starter's picture: synapse has none, the rest do.
  await page.route('https://hanzo.ai/templates/**', (r) => (r.request().url().includes('synapse') ? r.fulfill({ status: 404 }) : r.fulfill({ body: PNG, contentType: 'image/webp' })))
  return { sent, world }
}

const sentTo = (sent: Sent[], method: string, path: string) => sent.filter((s) => s.method === method && s.path === path)
const act = async (page: Page, project: string, row: string) => {
  await page.getByRole('button', { name: `Actions for ${project}` }).click()
  await page.getByRole('menuitem', { name: new RegExp(`^${row}`) }).click()
}

test.describe('Artifacts', () => {
  test('projects sit under the month they were last edited or made, with the year when it is not this one', async ({ page }, info) => {
    await shelf(page)
    await page.goto('/-/artifacts')
    await expect(page.getByText(/^(September 2026|March 2025|Earlier)$/)).toHaveText(['September 2026', 'March 2025', 'Earlier'])
    await expect(page.getByRole('button', { name: 'Open Blog' })).toContainText('Public · Edited Sep 2 · Not deployed yet')
    await expect(page.getByRole('button', { name: 'Open Old site' })).toContainText('Public · Edited Mar 1, 2025 · Not deployed yet')
    // A project that says nothing of itself is public until it says otherwise, and has no date to show.
    await expect(page.getByRole('button', { name: 'Open Mystery' })).toContainText(/^Mystery\s*Public · Not deployed yet$/)
    // A starter with no picture of its own shows its name instead.
    await expect(page.getByRole('button', { name: 'Start from Synapse' }).locator('img')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start from Circle' }).locator('img')).toHaveCount(1)
    await page.screenshot({ path: info.outputPath('artifacts.png'), fullPage: true })
  })

  test('a starter is copied one at a time, a refused copy says why, and a copy the platform does not name opens as the starter', async ({ page, baseURL }) => {
    const { sent } = await shelf(page, {
      forks: [{ slug: 'synapse-2', name: 'Synapse' }, {}],
      holds: { 'POST /v1/projects/fork': [{ wait: 2500 }, { status: 402, detail: 'Private projects need a paid plan' }] },
    })
    await page.goto('/-/artifacts')
    await page.getByRole('button', { name: 'Start from Synapse' }).click()
    await expect(page.getByRole('button', { name: 'Start from Synapse' })).toContainText('Copying…')
    // One copy at a time: a second press while it is out does nothing.
    await page.getByRole('button', { name: 'Start from Folio' }).click()
    await expect(page).toHaveURL(new URL('/synapse-2', baseURL).href)
    expect(sentTo(sent, 'POST', '/v1/projects/fork').map((s) => s.body)).toEqual([{ slug: 'synapse' }])
    // The workspace does not know it yet, and offers the way back.
    await expect(page.getByText(`${ORG} has no project named synapse-2.`)).toBeVisible()
    await page.getByRole('button', { name: 'See what this organization has built' }).click()
    await expect(page).toHaveURL(new URL('/-/artifacts', baseURL).href)

    await page.getByRole('button', { name: 'Start from Circle' }).click()
    await expect(page.getByRole('status')).toHaveText('Private projects need a paid plan')
    await page.getByRole('button', { name: 'Start from Metrics' }).click()
    await expect(page).toHaveURL(new URL('/metrics', baseURL).href)
  })

  test('a rename that is empty is refused in the dialog, the same name changes nothing, Enter saves, and a refusal stays', async ({ page }, info) => {
    const { sent } = await shelf(page, {
      holds: { 'PATCH /v1/projects/shop': [{}, { status: 409, detail: 'A project named Taken exists' }, { wait: 2500 }] },
    })
    await page.goto('/-/artifacts')
    await act(page, 'Shop', 'Rename')
    const dialog = page.getByRole('dialog')
    const name = dialog.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue('Shop')
    await name.fill('   ')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('status')).toHaveText('It needs a name')
    await name.fill('Shop')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(sentTo(sent, 'PATCH', '/v1/projects/shop')).toHaveLength(0)

    await act(page, 'Shop', 'Rename')
    await name.fill('')
    await name.pressSequentially('Store')
    await name.press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('Renamed to Store')
    // Read again after the platform answered.
    await expect(page.getByRole('button', { name: 'Open Store' })).toBeVisible()

    await act(page, 'Store', 'Rename')
    await name.fill('Taken')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('status')).toHaveText('A project named Taken exists')
    await page.screenshot({ path: info.outputPath('rename-refused.png') })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // While a rename is out, the dialog cannot be put away.
    await act(page, 'Store', 'Rename')
    await name.fill('Storefront')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog.last()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Storefront' })).toBeVisible()
    expect(sentTo(sent, 'PATCH', '/v1/projects/shop').map((s) => s.body)).toEqual([{ name: 'Store' }, { name: 'Taken' }, { name: 'Storefront' }])
  })

  test('a delete is confirmed first, a refusal is said in the dialog, and one that goes takes the project off the list', async ({ page }) => {
    const { sent } = await shelf(page, { holds: { 'DELETE /v1/projects/blog': [{ status: 409, detail: 'Blog is still deploying' }, { wait: 2500 }] } })
    await page.goto('/-/artifacts')
    await act(page, 'Blog', 'Delete')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Delete Blog?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(sentTo(sent, 'DELETE', '/v1/projects/blog')).toHaveLength(0)

    await act(page, 'Blog', 'Delete')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(dialog.getByRole('status')).toHaveText('Blog is still deploying')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog.last()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Blog is deleted')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open Blog' })).toHaveCount(0)
    expect(sentTo(sent, 'DELETE', '/v1/projects/blog')).toHaveLength(2)
  })

  test('making one private is the platform’s to refuse, and it says why', async ({ page }) => {
    const { sent } = await shelf(page, { holds: { 'PATCH /v1/projects/blog': [{ status: 402, detail: 'Private projects need a paid plan' }] } })
    await page.goto('/-/artifacts')
    await act(page, 'Blog', 'Make private')
    await expect(page.getByRole('status')).toHaveText('Private projects need a paid plan')
    expect(sentTo(sent, 'PATCH', '/v1/projects/blog')[0]?.body).toEqual({ visibility: 'private' })
  })

  test('says it is reading, why a read failed, and when nothing is built yet', async ({ page }) => {
    const { world } = await shelf(page, { projects: [], slow: { 'GET /v1/projects': 3000 } })
    await page.goto('/-/artifacts')
    await expect(page.getByText('Reading your projects…')).toBeVisible()
    await expect(page.getByText('Nothing built yet. Describe something on the New page and it lands here.')).toBeVisible()
    world.slow = {}
    world.down['GET /v1/projects'] = 'Projects are resting'
    await via(page, 'Projects')
    await via(page, 'Artifacts')
    await expect(page.getByText('Projects are resting')).toBeVisible()
  })

  test('a visitor who takes a starter is asked to sign in', async ({ page }) => {
    await page.context().route('https://hanzo.id/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Hanzo</title>Sign in' }))
    await serve(page, ({ path }) => (path === '/v1/templates' ? { json: { data: STARTERS } } : { status: 401, json: { detail: 'Sign in' } }))
    await page.goto('/-/artifacts')
    await expect(page.getByText('Sign in to see what your organization has built.')).toBeVisible()
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Start from Circle' }).click()])
    expect(new URL(popup.url()).hostname).toBe('hanzo.id')
    await popup.close()
  })
})

test.describe('Templates', () => {
  test('each starter says its framework when it has one, and one is copied into a project', async ({ page, baseURL }, info) => {
    const { sent } = await shelf(page, { holds: { 'POST /v1/projects/fork': [{ status: 402, detail: 'Private projects need a paid plan' }, { wait: 2500 }] } })
    await page.goto('/-/templates')
    await expect(page.getByRole('button', { name: 'Start from Synapse' })).toContainText('Next.js')
    await expect(page.getByRole('button', { name: 'Start from Circle' })).toContainText(/^CIRCLE\s*Circle\s*A community$/i)
    await page.screenshot({ path: info.outputPath('templates.png'), fullPage: true })
    await page.getByRole('button', { name: 'Start from Mint' }).click()
    await expect(page.getByRole('status')).toHaveText('Private projects need a paid plan')
    await page.getByRole('button', { name: 'Start from Circle' }).click()
    await expect(page.getByRole('button', { name: 'Start from Circle' })).toContainText('Copying…')
    await expect(page).toHaveURL(new URL('/circle-2', baseURL).href)
    expect(sentTo(sent, 'POST', '/v1/projects/fork').map((s) => s.body)).toEqual([{ slug: 'mint' }, { slug: 'circle' }])
  })

  test('a refused catalogue says why', async ({ page }) => {
    await shelf(page, { down: { 'GET /v1/templates': 'The catalogue is resting' } })
    await page.goto('/-/templates')
    await expect(page.getByText('The catalogue is resting')).toBeVisible()
  })
})
