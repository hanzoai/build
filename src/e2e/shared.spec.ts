/**
 * A folder on a linked machine, from the web (hanzo-inc/app issue 310). The machine's owner shares folders; New's
 * Folder pill on that machine lists those and no others, Auto is the folder its linked shell is open in when it is
 * shared, and a run in a folder is a coding run there with `dir` and no repository. A folder the platform refuses
 * (`folder_not_granted`) is said with how to share it, and the shared ones are offered. Settings → Machines lists each
 * machine's shared folders with Stop sharing, and on Hanzo Desktop the machine that is this computer can share one
 * through the computer's own dialog. Driven through the host page (/src/e2e/host.html) against a stubbed platform.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { ORG, SESSION, signIn, type Reply, type Sent } from './signed.ts'

const HOST = '/src/e2e/host.html'
const chip = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}: `) })
const list = (page: Page, name: string) => page.getByRole('listbox', { name })
const ask = (page: Page) => page.getByRole('textbox', { name: 'Describe a task or ask a question' })
const posts = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)

const SITE = '/home/dave/site'
const API = '/home/dave/api'

/** The platform: one machine, `box`, sharing `folders`, with a linked shell open in `cwd`; `coding` answers a run. */
function world(page: Page, w: { folders: string[]; cwd: string; coding?: () => Reply; folder?: (s: Sent) => Reply }) {
  return signIn(
    page,
    (s) => {
      if (s.path === '/v1/agent/targets') {
        return { json: { targets: [{ id: 'tgt_1', label: 'box', host: 'box', kind: 'laptop', status: 'online', metricsAt: '2026-11-21T10:00:00Z', serving: true, folders: w.folders }] } }
      }
      if (s.path === '/v1/agent/sessions' && s.query.includes('status=running')) {
        return { json: { sessions: [{ id: 'sess_shell', status: 'running', agent: 'tmux', host: 'box', cwd: w.cwd, updatedAt: '2026-11-21T10:00:00Z' }], next: '' } }
      }
      if (s.path === '/v1/agent/sessions') return { json: { sessions: [], next: '' } }
      if (s.path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
      if (s.path === '/v1/agent/coding') return w.coding?.() ?? { status: 202, json: { sessionId: SESSION, targetId: 'tgt_1', routed: true } }
      if (s.path === '/v1/agent/turns') return { status: 202, json: { sessionId: SESSION, runId: 'run_1' } }
      if (s.path === '/v1/agent/targets/tgt_1/folders') return w.folder?.(s) ?? { json: {} }
      return undefined
    },
    { [`hanzo.build.new.${ORG}`]: { place: 'tgt_1' } },
  )
}

test.describe('A folder on a linked machine', () => {
  test('the picker lists the folders the machine shares and no others, and Auto is the shared folder its shell is open in', async ({ page }) => {
    const sent = await world(page, { folders: [SITE, API], cwd: `${SITE}/web` })
    await page.goto(HOST)
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · web', { timeout: 45_000 })
    // A run in a folder needs no repository, so none is asked for.
    await expect(chip(page, 'Repository')).toHaveCount(0)
    await chip(page, 'Folder').click()
    const options = list(page, 'Folder').getByRole('option')
    await expect(options).toHaveCount(3)
    await expect(options.nth(0)).toHaveAccessibleName(/^Auto/)
    await expect(options.nth(1)).toHaveAccessibleName(/^site/)
    await expect(options.nth(2)).toHaveAccessibleName(/^api/)
    await page.keyboard.press('Escape')
    await ask(page).fill('Fix the footer')
    await ask(page).press('Enter')
    await expect.poll(() => posts(sent, '/v1/agent/coding').length).toBe(1)
    const body = posts(sent, '/v1/agent/coding')[0]!.body as Record<string, unknown>
    expect(body).toMatchObject({ prompt: 'Fix the footer', targetId: 'tgt_1', dir: `${SITE}/web`, mode: 'build' })
    expect(body).not.toHaveProperty('repo')
    // A conversation names no folder, so a run in one is not one.
    expect(posts(sent, '/v1/agent/turns')).toHaveLength(0)
  })

  test('a folder chosen in the picker is the dir the run is sent with', async ({ page }) => {
    const sent = await world(page, { folders: [SITE, API], cwd: '' })
    await page.goto(HOST)
    await chip(page, 'Folder').click({ timeout: 45_000 })
    await list(page, 'Folder').getByRole('option', { name: /^api/ }).click()
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: api')
    await ask(page).fill('Add a health check')
    await ask(page).press('Enter')
    await expect.poll(() => posts(sent, '/v1/agent/coding').length).toBe(1)
    expect(posts(sent, '/v1/agent/coding')[0]!.body).toMatchObject({ targetId: 'tgt_1', dir: API })
  })

  test('Auto sends no folder when the shell is open in one the machine does not share, and the run goes as it always has', async ({ page }) => {
    const sent = await world(page, { folders: [SITE], cwd: '/home/dave/secret' })
    await page.goto(HOST)
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto', { timeout: 45_000 })
    await expect(chip(page, 'Repository')).toBeVisible()
    await ask(page).fill('Write a script')
    await ask(page).press('Enter')
    await expect.poll(() => posts(sent, '/v1/agent/turns').length).toBe(1)
    const body = posts(sent, '/v1/agent/turns')[0]!.body as Record<string, unknown>
    expect(body).toMatchObject({ target: 'tgt_1' })
    expect(body).not.toHaveProperty('dir')
    expect(posts(sent, '/v1/agent/coding')).toHaveLength(0)
  })

  test('a machine that shares no folder has no Folder pill, and its runs are what they were', async ({ page }) => {
    await world(page, { folders: [], cwd: SITE })
    await page.goto(HOST)
    await expect(chip(page, 'Repository')).toBeVisible({ timeout: 45_000 })
    await expect(chip(page, 'Folder')).toHaveCount(0)
  })

  test('a folder the platform refuses says how to share it, and offers the folders shared now', async ({ page }) => {
    let folders = [SITE, API]
    const sent = await world(page, {
      get folders() {
        return folders
      },
      cwd: `${SITE}/web`,
      coding: () => {
        // The owner stopped sharing the site between the read and the send.
        folders = [API]
        return {
          status: 403,
          json: { type: 'about:blank', title: 'Forbidden', status: 403, detail: `the folder ${SITE}/web is not one the machine's owner has let the web use`, code: 'folder_not_granted' },
        }
      },
    })
    await page.goto(HOST)
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto · web', { timeout: 45_000 })
    await ask(page).fill('Fix the footer')
    await ask(page).press('Enter')
    await expect(page.getByRole('status')).toHaveText(`That folder is not shared with the web. Share it from Hanzo Desktop or \`hanzo link grant ${SITE}/web\``)
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: Auto')
    await page.getByRole('button', { name: `Use ${API}` }).click()
    await expect(chip(page, 'Folder')).toHaveAccessibleName('Folder: api')
    await expect(page.getByRole('button', { name: `Use ${API}` })).toHaveCount(0)
    expect(posts(sent, '/v1/agent/coding')).toHaveLength(1)
  })
})

test.describe('Settings → Machines: the folders a machine shares', () => {
  const MACHINES = `${HOST}?at=-/settings/machines`
  const shared = (page: Page) => page.getByLabel('Folders the web may use')

  test('lists them, and Stop sharing revokes one', async ({ page }) => {
    let folders = [SITE, API]
    const sent = await world(page, {
      get folders() {
        return folders
      },
      cwd: '',
      folder: (s) => {
        folders = folders.filter((f) => f !== new URLSearchParams(s.query).get('folder'))
        return { json: { revoked: true, folder: SITE } }
      },
    })
    await page.goto(MACHINES)
    await expect(shared(page)).toContainText(SITE, { timeout: 45_000 })
    await expect(shared(page)).toContainText(API)
    // A browser page without the computer shares nothing from here.
    await expect(page.getByRole('button', { name: 'Let the web use a folder…' })).toHaveCount(0)
    await page.getByRole('button', { name: `Stop sharing ${SITE}` }).click()
    await expect(shared(page)).not.toContainText(SITE)
    const revoke = sent.find((s) => s.method === 'DELETE' && s.path === '/v1/agent/targets/tgt_1/folders')
    expect(new URLSearchParams(revoke?.query).get('folder')).toBe(SITE)
  })

  test('only the machine\'s owner may stop sharing: anyone else is told so, and the folder stays', async ({ page }) => {
    await world(page, {
      folders: [SITE],
      cwd: '',
      folder: () => ({ status: 403, json: { type: 'about:blank', title: 'Forbidden', status: 403, detail: "only the machine's owner may grant or revoke its folders" } }),
    })
    await page.goto(MACHINES)
    await page.getByRole('button', { name: `Stop sharing ${SITE}` }).click({ timeout: 45_000 })
    await expect(shared(page).getByRole('status')).toHaveText("only the machine's owner may grant or revoke its folders")
    await expect(shared(page)).toContainText(SITE)
  })

  test('on Hanzo Desktop, the machine that is this computer shares a folder chosen in its own dialog', async ({ page }) => {
    let folders: string[] = []
    const sent = await world(page, {
      get folders() {
        return folders
      },
      cwd: '',
      folder: (s) => {
        const folder = (s.body as { folder: string }).folder
        folders = [...folders, folder]
        return { status: 201, json: { folder, grantedBy: 'u', grantedAt: '2026-11-21T10:00:00Z' } }
      },
    })
    await page.goto(`${MACHINES}&local=1&hostname=box`)
    await expect(shared(page)).toContainText('None yet', { timeout: 45_000 })
    await page.getByRole('button', { name: 'Let the web use a folder…' }).click()
    await expect(shared(page)).toContainText('/Users/dave/picked')
    expect(posts(sent, '/v1/agent/targets/tgt_1/folders')[0]?.body).toEqual({ folder: '/Users/dave/picked' })
  })

  test('on Hanzo Desktop, a machine that is not this computer is not shared from here', async ({ page }) => {
    await world(page, { folders: [SITE], cwd: '' })
    await page.goto(`${MACHINES}&local=1&hostname=laptop`)
    await expect(shared(page)).toContainText(SITE, { timeout: 45_000 })
    await expect(page.getByRole('button', { name: 'Let the web use a folder…' })).toHaveCount(0)
  })
})
