/**
 * The personal half of Settings — General, Account, Privacy, Capabilities,
 * Memory and Code — signed in as an org admin against a stubbed platform
 * (signed.ts). IAM's own routes are answered here, since signed.ts leaves them
 * to IAM.
 */
import { expect, test, type Page } from '@playwright/test'

import { ORG, signIn, type Sent } from './signed.ts'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const FACE = `https://api.hanzo.ai/v1/account/avatar/${ORG}/dave/${'a'.repeat(64)}`

interface World {
  prefs: Record<string, unknown>
  consent: { insights: boolean; training: string }
  tools: { name: string; source: string; description: string; dispatchable: boolean; activated: boolean }[]
  memories: { owner: string; name: string; content: string; kind: string; updatedTime: string }[]
  projects: { slug: string; name: string; visibility: string; updatedAt: number }[]
}

/** A platform holding `world`, which every write changes; answers what the page sent, IAM's calls included. */
async function platform(page: Page, seed: Partial<World> = {}, kept: Record<string, unknown> = {}) {
  const world: World = {
    prefs: {},
    consent: { insights: true, training: '' },
    tools: [
      { name: 'slack_post', source: 'connector', description: '', dispatchable: true, activated: true },
      { name: 'slack_read', source: 'connector', description: '', dispatchable: true, activated: false },
      { name: 'review', source: 'skill', description: '', dispatchable: false, activated: false },
    ],
    memories: [{ owner: ORG, name: 'mem_1', content: 'Deploys with pnpm, never npm.', kind: 'user', updatedTime: '2026-09-20T10:00:00Z' }],
    projects: [{ slug: 'shop', name: 'Shop', visibility: 'public', updatedAt: 2 }],
    ...seed,
  }
  const sent = await signIn(
    page,
    ({ method, path, body }) => {
      const b = (body ?? {}) as Record<string, unknown>
      if (path === '/v1/pref' && method === 'PATCH') {
        for (const [k, v] of Object.entries(b)) if (v === null) delete world.prefs[k]
        else world.prefs[k] = v
        return { json: { prefs: world.prefs, updatedAt: 2 } }
      }
      if (path === '/v1/pref') return { json: { prefs: world.prefs, updatedAt: 1 } }
      if (path === '/v1/models') return { json: { data: [{ id: 'zen5.8' }, { id: 'zen5.8-coder' }] } }
      if (path === '/v1/agent/targets') return { json: { targets: [{ id: 'tgt_1', label: 'dgx', kind: 'gpu', status: 'online', capacity: '' }] } }
      if (path === '/v1/tool/activation' && method === 'PUT') {
        const on = (b.activate as string[]) ?? []
        const off = (b.deactivate as string[]) ?? []
        for (const x of world.tools) x.activated = on.includes(x.name) ? true : off.includes(x.name) ? false : x.activated
        return { json: { enabled: world.tools.filter((x) => x.activated).map((x) => x.name) } }
      }
      if (path === '/v1/tool') return { json: { tools: world.tools } }
      if (path === '/v1/ai/memory/list') return { json: { status: 'ok', msg: '', data: world.memories } }
      if (path === '/v1/ai/memory/remember') {
        const m = { owner: ORG, name: `mem_${world.memories.length + 1}`, content: String(b.content), kind: 'user', updatedTime: '2026-09-27T10:00:00Z' }
        world.memories = [m, ...world.memories]
        return { json: { status: 'ok', msg: '', data: m } }
      }
      if (path === '/v1/ai/memory/delete') {
        world.memories = world.memories.filter((m) => `${m.owner}/${m.name}` !== b.id)
        return { json: { status: 'ok', msg: '', data: true } }
      }
      if (path === '/v1/projects/shop' && method === 'PATCH') {
        Object.assign(world.projects[0]!, { visibility: b.visibility })
        return { json: world.projects[0] }
      }
      if (path === '/v1/projects') return { json: world.projects }
      if (path === '/v1/account/avatar') return { json: { avatar: FACE } }
      return undefined
    },
    kept,
  )
  await page.route('**/v1/iam/consent', async (r) => {
    const req = r.request()
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    sent.push({ method: req.method(), path: '/v1/iam/consent', query: '', body })
    if (req.method() === 'PUT') Object.assign(world.consent, body)
    await r.fulfill({ json: { status: 'ok', msg: '', data: world.consent } })
  })
  await page.route('**/v1/iam/account', async (r) => {
    const req = r.request()
    const body = JSON.parse(req.postData() || '{}')
    sent.push({ method: req.method(), path: '/v1/iam/account', query: '', body })
    await r.fulfill({ json: { status: 'ok', msg: '', data: { owner: ORG, name: 'dave', displayName: body.displayName, avatar: '' } } })
  })
  await page.route(`${FACE}`, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }))
  return { sent, world }
}

/** Choose `option` from the chip named `chip`. */
async function pick(page: Page, chip: RegExp, option: string) {
  await page.getByRole('button', { name: chip }).click()
  await page.getByRole('option', { name: option, exact: false }).first().click()
}

const patched = (sent: Sent[]) => sent.filter((s) => s.method === 'PATCH' && s.path === '/v1/pref').map((s) => s.body)

test('Settings opens on General, and a theme chosen there paints the page and is saved', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings')
  await expect(page.getByText('How Hanzo Build looks and listens', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'General' }).first()).toHaveAttribute('aria-current', 'page')
  await pick(page, /^Theme: /, 'Light')
  await expect(page.locator('html')).toHaveClass(/\blight\b/)
  await expect(page.locator('html')).toHaveClass(/\bt_light\b/)
  await expect.poll(() => patched(sent)).toContainEqual({ theme: 'light' })
  await page.screenshot({ path: info.outputPath('general-light.png') })
  await pick(page, /^Theme: /, 'Dark')
  await expect(page.locator('html')).toHaveClass(/\bt_dark\b/)
})

test('text size, motion and the dictation language are saved and applied', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/general')
  await pick(page, /^Text size: /, 'Large')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--type-scale').trim())).toBe('1.15')
  await pick(page, /^Motion: /, 'Reduced')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).transitionDuration)).toBe('1e-05s')
  await pick(page, /^Dictation language: /, 'Français')
  await expect.poll(() => patched(sent)).toEqual([{ text: 'large' }, { motion: 'reduced' }, { language: 'fr' }])
  await page.screenshot({ path: info.outputPath('general-large.png') })
  await pick(page, /^Text size: /, 'Medium')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--type-scale').trim())).toBe('1')
  expect(patched(sent).at(-1)).toEqual({ text: null })
})

test('saved settings are applied on load, and New greets by name and starts from the coding defaults', async ({ page }, info) => {
  await platform(page, { prefs: { theme: 'light', text: 'large', callName: 'Dave', code: { model: 'zen5.8-coder', effort: 'high', mode: 'plan', place: '' } } })
  await page.goto('/')
  await expect(page.getByText('What’s up next, Dave?')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/\blight\b/)
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--type-scale').trim())).toBe('1.15')
  await expect(page.getByRole('button', { name: 'Model: Zen5.8 Coder' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Effort: High' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('new-defaults.png') })
})

test('a choice kept on New outranks the defaults', async ({ page }) => {
  await platform(
    page,
    { prefs: { code: { model: 'zen5.8-coder', effort: 'high' } } },
    { [`hanzo.build.new.${ORG}`]: { repo: null, branch: '', place: '', mode: 'build', model: 'enso', effort: 'low', ask: '' } },
  )
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Effort: Low' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Model: Enso' })).toBeVisible()
})

test('Account saves the name, what to call you, the work and the instructions', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/account')
  await expect(page.getByText('dave@acme.test').first()).toBeVisible()
  await page.getByLabel('Full name').fill('Dave Bowman')
  await page.getByLabel('What should Hanzo call you?').fill('Dave')
  await pick(page, /^Work: /, 'Software engineering')
  await page.getByLabel('Instructions for Hanzo').fill('Prefer Go. Never add a dependency without asking.')
  await expect(page.getByText('Every coding run reads these before it starts.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(sent).toContainEqual({ method: 'PUT', path: '/v1/iam/account', query: '', body: { displayName: 'Dave Bowman' } })
  expect(patched(sent)).toContainEqual({ callName: 'Dave', work: 'engineering', instructions: 'Prefer Go. Never add a dependency without asking.' })
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy organization ID' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('account.png'), fullPage: true })
  await page.getByRole('button', { name: 'New', exact: true }).first().click()
  await expect(page.getByText('What’s up next, Dave?')).toBeVisible()
})

test('Account sets a new photo', async ({ page }) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/account')
  await page.getByLabel('Photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByText('Your photo is saved')).toBeVisible()
  await expect(page.locator(`img[src="${FACE}"]`)).toBeVisible()
  expect(sent.some((s) => s.method === 'POST' && s.path === '/v1/account/avatar')).toBe(true)
})

test('Privacy records the two answers and makes a project private', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/privacy')
  await expect(page.getByText('Not answered yet.', { exact: false })).toBeVisible()
  await page.getByRole('switch', { name: 'Help improve Hanzo models' }).click()
  await expect(page.getByText('Hanzo may train on your prompts and runs.')).toBeVisible()
  await page.getByRole('switch', { name: 'Usage insights' }).click()
  await expect(page.getByRole('switch', { name: 'Usage insights' })).not.toBeChecked()
  expect(sent.filter((s) => s.path === '/v1/iam/consent' && s.method === 'PUT').map((s) => s.body)).toEqual([{ training: 'granted' }, { insights: false }])
  await page.getByRole('button', { name: 'Make private' }).click()
  await expect(page.getByRole('button', { name: 'Make public' })).toBeVisible()
  expect(sent).toContainEqual({ method: 'PATCH', path: '/v1/projects/shop', query: '', body: { visibility: 'private' } })
  await page.screenshot({ path: info.outputPath('privacy.png') })
})

test('Capabilities switches a kind of tool on and off', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/capabilities')
  await expect(page.getByText('1 of 2 on', { exact: false })).toBeVisible()
  await expect(page.getByText('1 available, all off', { exact: false })).toBeVisible()
  await page.getByRole('switch', { name: 'Connector actions' }).click()
  await expect(page.getByText('All 2 on', { exact: false })).toBeVisible()
  await page.getByRole('switch', { name: 'Connector actions' }).click()
  await expect(page.getByText('2 available, all off', { exact: false })).toBeVisible()
  const puts = sent.filter((s) => s.path === '/v1/tool/activation').map((s) => s.body)
  expect(puts).toEqual([
    { activate: ['slack_post', 'slack_read'], deactivate: [] },
    { activate: [], deactivate: ['slack_post', 'slack_read'] },
  ])
  await page.screenshot({ path: info.outputPath('capabilities.png') })
})

test('Memory lists, remembers and forgets', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/memory')
  await expect(page.getByText('Deploys with pnpm, never npm.')).toBeVisible()
  await page.getByLabel('Tell Hanzo what to remember or change').fill('My tests run with vitest.')
  await page.getByRole('button', { name: 'Remember', exact: true }).click()
  await expect(page.getByText('My tests run with vitest.')).toBeVisible()
  await expect(page.getByText('2 memories, newest first.')).toBeVisible()
  await page.screenshot({ path: info.outputPath('memory.png') })
  await page.getByRole('button', { name: 'Forget Deploys with pnpm, never npm.' }).click()
  await expect(page.getByText('Deploys with pnpm, never npm.')).toHaveCount(0)
  expect(sent).toContainEqual({ method: 'POST', path: '/v1/ai/memory/remember', query: '', body: { content: 'My tests run with vitest.' } })
  expect(sent).toContainEqual({ method: 'POST', path: '/v1/ai/memory/delete', query: '', body: { id: `${ORG}/mem_1` } })
})

test('Code keeps the defaults a new run starts from, and links to environments and machines', async ({ page }, info) => {
  const { sent } = await platform(page)
  await page.goto('/-/settings/code')
  await pick(page, /^Default model: /, 'Zen5.8 Coder')
  await pick(page, /^Default effort: /, 'High')
  await pick(page, /^Default mode: /, 'Plan')
  await pick(page, /^Default place: /, 'dgx')
  await expect.poll(() => patched(sent).at(-1)).toEqual({ code: { model: 'zen5.8-coder', effort: 'high', mode: 'plan', place: 'tgt_1' } })
  await page.screenshot({ path: info.outputPath('code.png') })
  await page.getByRole('button', { name: 'Open Machines' }).click()
  await expect(page).toHaveURL(/\/-\/settings\/machines$/)
  await page.goto('/-/settings/code')
  await page.getByRole('button', { name: 'Open Environments' }).click()
  await expect(page).toHaveURL(/\/-\/settings\/environments$/)
})

test('every section fits a phone', async ({ page }, info) => {
  await platform(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const says: [string, string][] = [
    ['general', 'How Hanzo Build looks and listens'],
    ['account', 'Your Hanzo identity'],
    ['privacy', 'What Hanzo may do with your data'],
    ['capabilities', 'What the agent may use in'],
    ['memory', 'What Hanzo remembers about you here'],
    ['code', 'How a new run starts'],
  ]
  for (const [section, detail] of says) {
    await page.goto(`/-/settings/${section}`)
    await expect(page.getByText(detail, { exact: false })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const wide = await page.evaluate(() => {
      const w = window.innerWidth
      return [...document.querySelectorAll('body *')]
        .filter((el) => !el.children.length || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'switch')
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width && r.height && (r.right > w + 1 || r.left < -1))
        .map(({ el }) => `${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}`)
    })
    expect(wide, section).toEqual([])
    await page.screenshot({ path: info.outputPath(`phone-${section}.png`), fullPage: true })
  }
})
