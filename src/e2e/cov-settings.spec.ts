/**
 * Every Settings section and the Plans screen, driven to each state a person
 * or the platform can put them in: every save with the exact request it sends
 * and what the page shows once the platform answers and again after a reload,
 * every refusal with the sentence the page says, every read still in flight
 * and every empty list, and every org admin's control as a member reads it.
 *
 * The platform here is one stateful world (`platform`): a write changes what
 * the next read answers, as it would live. A call can be made to refuse
 * (`fail`), to answer once differently (`once`), or to wait (`hold`).
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { mounted, went } from './mount.ts'
import { ORG, signIn, type Sent } from './signed.ts'
import { FACE, PLANS, PNG } from './stubs.ts'

test.describe.configure({ mode: 'parallel', timeout: 240_000 })

type Row = Record<string, unknown>

interface Reply {
  status?: number
  json?: unknown
  text?: string
  type?: string
  body?: Buffer
}

const SUB: Row = {
  id: 'sub_1',
  planId: 'max',
  status: 'active',
  quantity: 1,
  currentPeriodEnd: '2026-10-27T00:00:00Z',
  cancelAtPeriodEnd: false,
  plan: { id: 'max', name: 'Max', price: 10000, interval: 'month', currency: 'usd' },
}
const CARD: Row = { id: 'pm_1', type: 'card', isDefault: true, card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 } }
const INVOICE: Row = {
  id: 'inv_1',
  numberStr: 'INV-0042',
  status: 'paid',
  createdAt: '2026-09-01T00:00:00Z',
  periodStart: '2026-09-01T00:00:00Z',
  periodEnd: '2026-10-01T00:00:00Z',
  subtotal: 10000,
  amountPaid: 10000,
  currency: 'usd',
  lineItems: [{ description: 'Max — September', amount: 10000 }],
}

/** Everything the platform holds for acme and for dave in it. */
function fresh() {
  return {
    name: 'Dave',
    email: 'dave@acme.test',
    prefs: {} as Row,
    consent: { insights: true, training: '' } as Row,
    projects: [{ slug: 'shop', name: 'Shop', visibility: 'public', updatedAt: 2 }] as Row[],
    tools: [
      { name: 'slack_post', source: 'connector', description: '', dispatchable: true, activated: true },
      { name: 'slack_read', source: 'connector', description: '', dispatchable: true, activated: false },
      { name: 'review', source: 'skill', description: '', dispatchable: false, activated: false },
    ] as Row[],
    memories: [{ owner: ORG, name: 'mem_1', content: 'Deploys with pnpm, never npm.', kind: 'user', updatedTime: '2026-09-20T10:00:00Z' }] as Row[],
    models: ['zen5.8', 'zen5.8-coder'],
    targets: [{ id: 'tgt_1', label: 'workshop', kind: 'gpu', status: 'online', capacity: '1× GB10', host: 'spark', sessions: 3, running: 1 }] as Row[],
    envs: [{ repo: 'universe', install: 'pnpm install', start: 'pnpm dev', secrets: ['TOKEN'], state: 'ready', updatedAt: '2026-09-20T10:00:00Z' }] as Row[],
    keys: [] as Row[],
    subs: [structuredClone(SUB)] as Row[],
    cards: [structuredClone(CARD)] as Row[],
    invoices: [structuredClone(INVOICE)] as Row[],
    processor: { provider: 'square', applicationId: 'sandbox-sq0idb-test', locationId: 'L1', environment: 'sandbox', live: false } as Row,
    balance: { balance: 4200, available: 4200 } as Row,
    credit: { balances: [{ currency: 'usd', available: 1500 }] } as Row,
    rollup: {
      plan: 'max',
      period: '2026-09',
      included: { monthlyCents: 10000, consumedCents: 3000 },
      windows: [{ span: 'day', limit: 2500, used: 1800, resets: '2026-09-28T00:00:00Z' }],
    } as Row,
    spend: { spend: { available: true, mtdCents: 5250, byCategory: [{ category: 'LLM', cents: 4000 }] } } as Row,
    caps: [] as Row[],
    roster: [
      { user: `${ORG}/dave`, org: ORG, role: 'owner', createdTime: '2026-08-01T00:00:00Z' },
      { user: 'hanzo/zed', org: ORG, role: 'member', createdTime: '2026-09-02T00:00:00Z' },
    ] as Row[],
    invitations: [{ owner: ORG, name: 'invite-erin-a1b2c3', email: 'erin@acme.test', code: 'c0dec0dec0dec0de', quota: 1, usedCount: 0, state: 'Active', createdTime: '2026-09-20T00:00:00Z' }] as Row[],
    github: { configured: true, connected: true, login: 'dave-gh' } as Row,
    installations: [{ login: 'acme', type: 'Organization', grant: 'all', connected: true }] as Row[],
    slack: { id: 'slack', name: 'Slack', available: true, connected: true, connection: { account: 'Acme HQ', connectedAt: '2026-09-02T00:00:00Z' } } as Row,
    channels: [{ id: 'C1', name: 'general', is_member: true }] as Row[],
    hooks: [{ id: 'wh_1', url: 'https://acme.test/hooks/orders', events: ['commerce.order.>'], description: 'orders', status: 'active', deliveries7d: 12, failures7d: 1 }] as Row[],
    deliveries: [{ subject: 'webhook.test', status: 'ok', httpStatus: 200, attempt: 1, created: '2026-09-27T00:00:00Z' }] as Row[],
    plans: PLANS as Row[],
  }
}
type World = ReturnType<typeof fresh>

/** What the platform answers `s`, changing `w` as a write would. */
function answer(w: World, s: Sent): Reply | undefined {
  const b = (s.body ?? {}) as Row
  const at = (re: RegExp) => s.path.match(re)
  const key = `${s.method} ${s.path}`
  let m: RegExpMatchArray | null
  switch (key) {
    case 'GET /v1/iam/oauth/userinfo':
      return { json: { sub: `${ORG}/dave`, ...(w.name ? { name: w.name } : {}), ...(w.email ? { email: w.email } : {}) } }
    case 'GET /v1/pref':
      return { json: { prefs: w.prefs, updatedAt: 1 } }
    case 'PATCH /v1/pref':
      for (const [k, v] of Object.entries(b)) if (v === null) delete w.prefs[k]
      else w.prefs[k] = v
      return { json: { prefs: w.prefs, updatedAt: 2 } }
    case 'PUT /v1/iam/account':
      w.name = String(b.displayName)
      return { json: { status: 'ok', msg: '', data: { owner: ORG, name: 'dave', displayName: w.name, avatar: '' } } }
    case 'POST /v1/account/avatar':
      return { json: { avatar: FACE } }
    case 'GET /v1/iam/consent':
      return { json: { status: 'ok', msg: '', data: w.consent } }
    case 'PUT /v1/iam/consent':
      Object.assign(w.consent, b)
      return { json: { status: 'ok', msg: '', data: w.consent } }
    case 'GET /v1/projects':
      return { json: w.projects }
    case 'GET /v1/tool':
      return { json: { tools: w.tools } }
    case 'PUT /v1/tool/activation': {
      const on = (b.activate as string[]) ?? []
      const off = (b.deactivate as string[]) ?? []
      for (const x of w.tools) x.activated = on.includes(String(x.name)) ? true : off.includes(String(x.name)) ? false : x.activated
      return { json: { enabled: w.tools.filter((x) => x.activated).map((x) => x.name) } }
    }
    case 'GET /v1/ai/memory/list':
      return { json: { status: 'ok', msg: '', data: w.memories } }
    case 'POST /v1/ai/memory/remember': {
      const one = { owner: ORG, name: `mem_${w.memories.length + 2}`, content: String(b.content), kind: 'user', updatedTime: '2026-09-27T10:00:00Z' }
      w.memories = [one, ...w.memories]
      return { json: { status: 'ok', msg: '', data: one } }
    }
    case 'POST /v1/ai/memory/delete':
      w.memories = w.memories.filter((x) => `${x.owner}/${x.name}` !== b.id)
      return { json: { status: 'ok', msg: '', data: true } }
    case 'GET /v1/models':
      return { json: { data: w.models.map((id) => ({ id })) } }
    case 'GET /v1/agent/targets':
      return { json: { targets: w.targets } }
    case 'POST /v1/agent/targets': {
      const one = { id: `tgt_${w.targets.length + 2}`, status: 'offline', ...b }
      w.targets = [one, ...w.targets]
      return { status: 201, json: one }
    }
    case 'GET /v1/environment':
      return { json: { data: w.envs } }
    case 'GET /v1/account/keys':
      return { json: { keys: w.keys } }
    case 'POST /v1/account/keys': {
      const key = `${b.type === 'secret' ? 'sk' : 'pk'}-live-${w.keys.length + 1}`
      w.keys = [...w.keys.filter((k) => k.type !== b.type), { type: b.type, prefix: key.slice(0, 7), ...(b.type === 'publishable' ? { key } : {}), limit: b.limit, createdAt: '2026-09-27T12:00:00Z' }]
      return { json: { key, type: b.type, limit: b.limit } }
    }
    case 'DELETE /v1/account/keys': {
      const type = new URLSearchParams(s.query).get('type')
      w.keys = w.keys.filter((k) => k.type !== type)
      return { json: { ok: true, type } }
    }
    case 'GET /v1/billing/subscriptions':
      return { json: { count: w.subs.length, subscriptions: w.subs } }
    case 'POST /v1/billing/subscribe/card': {
      const plan = w.plans.find((p) => p.slug === b.planId)!
      w.subs = [{ id: 'sub_2', planId: b.planId, status: 'active', quantity: 1, currentPeriodEnd: '2026-10-27T00:00:00Z', plan: { id: b.planId, name: plan.name, price: plan.price, interval: b.interval } }]
      return { status: 201, json: { subscriptionId: 'sub_2', planId: b.planId, amountCents: plan.price, interval: b.interval } }
    }
    case 'GET /v1/billing/plans':
      return { json: w.plans }
    case 'GET /v1/billing/methods':
      return { json: w.cards }
    case 'POST /v1/billing/methods': {
      const one = { id: 'pm_2', type: 'card', isDefault: false, card: { brand: 'mastercard', last4: '4444', expMonth: 3, expYear: 2029 } }
      w.cards = [one, ...w.cards]
      return { status: 201, json: one }
    }
    case 'GET /v1/billing/settings':
      return { json: w.processor }
    case 'GET /v1/billing/invoices':
      return { json: { count: w.invoices.length, invoices: w.invoices } }
    case 'GET /v1/billing/balance':
      return { json: w.balance }
    case 'GET /v1/billing/credit-balance':
      return { json: w.credit }
    case 'POST /v1/billing/topup':
      w.balance = { available: Number(w.balance.available) + Number(b.amountCents) }
      return { json: { status: 'ok', balanceCents: w.balance.available } }
    case 'GET /v1/billing/usage/rollup': {
      // A window's reset given as \`after\` ms is stated from the moment it is answered.
      const windows = ((w.rollup.windows ?? []) as Row[]).map(({ after, ...x }) => (after === undefined ? x : { ...x, resets: from(Number(after)) }))
      return { json: { ...w.rollup, windows } }
    }
    case 'GET /v1/usage/summary':
      return { json: w.spend }
    case 'GET /v1/billing/alerts':
      return { json: w.caps }
    case 'POST /v1/billing/alerts': {
      const one = { id: 'al_1', title: b.title, threshold: b.threshold, enforce: b.enforce, project: '', service: '', periodSpentCents: 5250, resetsAt: '2026-10-01T00:00:00Z' }
      w.caps = [one, ...w.caps]
      return { status: 201, json: one }
    }
    case 'GET /v1/iam/memberships':
      return { json: { status: 'ok', data: w.roster, data2: w.roster.length } }
    case 'GET /v1/iam/invitations':
      return { json: { invitations: w.invitations, total: w.invitations.length } }
    case 'POST /v1/iam/invitations':
      w.invitations = [{ ...b, createdTime: '2026-09-27T00:00:00Z' }, ...w.invitations]
      return { json: w.invitations[0] }
    case 'GET /v1/provider/github/user':
      return { json: w.github }
    case 'POST /v1/provider/github/user/connect':
      return { json: { authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=1&state=signed' } }
    case 'POST /v1/provider/github/user/disconnect':
      w.github = { configured: true, connected: false }
      return { json: { disconnected: true } }
    case 'GET /v1/provider/github/installations':
      return { json: { installations: w.installations } }
    case 'POST /v1/provider/github/connect':
      return { json: { authorizeUrl: 'https://github.com/apps/hanzo/installations/new?state=signed' } }
    case 'GET /v1/provider/slack':
      return { json: w.slack }
    case 'POST /v1/provider/slack/connect':
      return { json: { authorizeUrl: 'https://slack.com/oauth/v2/authorize?client_id=1&state=signed' } }
    case 'POST /v1/provider/slack/disconnect':
      w.slack = { ...w.slack, connected: false, connection: undefined }
      return { json: { disconnected: true } }
    case 'GET /v1/provider/slack/channels':
      return { json: { channels: w.channels, next_cursor: '' } }
    case 'GET /v1/webhook':
      return { json: { data: w.hooks } }
    case 'POST /v1/webhook': {
      const one = { id: 'wh_2', url: b.url, events: b.events, description: b.description, status: 'active', deliveries7d: 0, failures7d: 0 }
      w.hooks = [one, ...w.hooks]
      return { status: 201, json: { ...one, secret: 'whsec_0123456789abcdef' } }
    }
  }
  if ((m = at(/^\/v1\/account\/avatar\/.+/))) return { body: PNG, type: 'image/png' }
  if ((m = at(/^\/v1\/projects\/([^/]+)$/)) && s.method === 'PATCH') {
    const p = w.projects.find((x) => x.slug === m![1])!
    Object.assign(p, b)
    return { json: p }
  }
  if ((m = at(/^\/v1\/agent\/targets\/([^/]+)\/key$/))) return { json: { targetId: m[1], claimKey: 'tk_live_once' } }
  if ((m = at(/^\/v1\/agent\/targets\/([^/]+)$/))) {
    const i = w.targets.findIndex((x) => x.id === m![1])
    if (s.method === 'DELETE') {
      w.targets.splice(i, 1)
      return { json: { deleted: true } }
    }
    Object.assign(w.targets[i]!, b)
    return { json: w.targets[i] }
  }
  if ((m = at(/^\/v1\/environment\/([^/]+)$/))) {
    const e = w.envs.find((x) => x.repo === m![1])
    if (s.method === 'DELETE') {
      w.envs = w.envs.filter((x) => x !== e)
      return { status: 204, text: '' }
    }
    return { json: e ?? { repo: m[1], state: 'none' } }
  }
  if ((m = at(/^\/v1\/billing\/subscriptions\/([^/]+)\/(cancel|reactivate)$/))) {
    const sub = w.subs.find((x) => x.id === m![1])!
    sub.cancelAtPeriodEnd = m[2] === 'cancel'
    return { json: sub }
  }
  if ((m = at(/^\/v1\/billing\/methods\/([^/]+)$/))) {
    w.cards = w.cards.filter((c) => c.id !== m![1])
    return { json: { deleted: true, id: m[1] } }
  }
  if ((m = at(/^\/v1\/billing\/invoices\/([^/]+)\/pdf$/))) return { text: '%PDF-1.4 invoice', type: 'application/pdf' }
  if ((m = at(/^\/v1\/billing\/alerts\/([^/]+)$/))) {
    if (s.method === 'DELETE') {
      w.caps = w.caps.filter((c) => c.id !== m![1])
      return { status: 204, text: '' }
    }
    const c = w.caps.find((x) => x.id === m![1])!
    Object.assign(c, b)
    return { json: c }
  }
  if ((m = at(/^\/v1\/iam\/invitations\/([^/]+)\/([^/]+)$/))) {
    w.invitations = w.invitations.filter((i) => i.name !== m![2])
    return { json: { deleted: true } }
  }
  if ((m = at(/^\/v1\/webhook\/([^/]+)\/test$/))) return { json: { delivered: true, httpStatus: 200, durationMs: 84 } }
  if ((m = at(/^\/v1\/webhook\/([^/]+)\/deliveries$/))) return { json: { data: w.deliveries } }
  if ((m = at(/^\/v1\/webhook\/([^/]+)$/))) {
    w.hooks = w.hooks.filter((h) => h.id !== m![1])
    return { status: 204, text: '' }
  }
  return undefined
}

interface Platform {
  w: World
  sent: Sent[]
  /** Refuse every `METHOD path` call with `reply` until `pass`. */
  fail: (key: string, reply: Reply) => void
  pass: (key: string) => void
  /** Answer the next `METHOD path` call with `reply`, after changing the world as usual. */
  once: (key: string, reply: Reply) => void
  /** Keep every call `when` picks waiting; answers the release. */
  hold: (when: (s: Sent) => boolean) => () => void
  /** The writes sent, as `METHOD path` and body. */
  writes: () => [string, unknown][]
}

/** Signs in as dave, an admin of acme, against a platform holding `seed`'s changes to the world. */
async function platform(page: Page, seed: (w: World) => void = () => {}): Promise<Platform> {
  const w = fresh()
  seed(w)
  const sent: Sent[] = []
  const failing = new Map<string, Reply>()
  const next = new Map<string, Reply>()
  const holds: { when: (s: Sent) => boolean; gate: Promise<void> }[] = []
  await signIn(page, () => undefined)
  await page.route(
    (u) => u.pathname.startsWith('/v1/'),
    async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      const raw = req.postData()
      let body: unknown = null
      try {
        body = raw ? JSON.parse(raw) : null
      } catch {
        body = raw
      }
      const s: Sent = { method: req.method(), path: url.pathname, query: url.search, body }
      sent.push(s)
      // Leaving for IAM's own pages would end the page, and what it ran with it: a 204 keeps the page where it is.
      if (req.isNavigationRequest()) return r.fulfill({ status: 204 })
      for (const h of holds) if (h.when(s)) await h.gate
      const key = `${s.method} ${s.path}`
      let reply = failing.get(key) ?? answer(w, s) ?? { json: { data: [] } }
      if (!failing.has(key) && next.has(key)) {
        reply = next.get(key)!
        next.delete(key)
      }
      const done =
        reply.text !== undefined || reply.body
          ? r.fulfill({ status: reply.status ?? 200, body: reply.body ?? reply.text, contentType: reply.type ?? 'text/plain' })
          : r.fulfill({ status: reply.status ?? 200, json: reply.json ?? {} })
      // A page that moved on no longer takes the answer.
      await done.catch(() => {})
    },
  )
  return {
    w,
    sent,
    fail: (key, reply) => void failing.set(key, reply),
    pass: (key) => void failing.delete(key),
    once: (key, reply) => void next.set(key, reply),
    hold: (when) => {
      let release = () => {}
      const gate = new Promise<void>((done) => (release = done))
      const h = { when, gate }
      holds.push(h)
      return () => {
        holds.splice(holds.indexOf(h), 1)
        release()
      }
    },
    writes: () => sent.filter((s) => s.method !== 'GET').map((s) => [`${s.method} ${s.path}${s.query}`, s.body]),
  }
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Signs the page in with a token naming these organizations and roles instead of the admin's. */
async function member(page: Page, orgs: { org: string; role: string }[] = [{ org: ORG, role: 'member' }]) {
  const token = [b64({ alg: 'none' }), b64({ sub: `${ORG}/dave`, email: 'dave@acme.test', orgs }), 'x'].join('.')
  await page.addInitScript((t) => localStorage.setItem('hanzo_iam_access_token', t), token)
}

/** Choose `option` from the chip whose name matches `chip`. */
async function pick(page: Page, chip: RegExp, option: string) {
  await page.getByRole('button', { name: chip }).click()
  await page.getByRole('option', { name: option }).first().click()
}

const refusal = (detail: string, status = 500): Reply => ({ status, json: { detail } })

/** An instant `ms` from now, as the platform writes one. */
const from = (ms: number) => new Date(Date.now() + ms).toISOString()
const MIN = 60_000
const DAY = 24 * 60 * MIN
/** A date as Settings draws it: `Oct 1, 2026`, in UTC. */
const drawn = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// ── the personal half ───────────────────────────────────────────────────────

test('General saves each choice as it is made, takes a refused one back, and a reload draws what was kept', async ({ page }) => {
  const p = await platform(page, (w) => (w.prefs = { language: 'fr' }))
  await page.goto('/-/settings/general')
  await expect(page.getByRole('button', { name: 'Dictation language: Français' })).toBeVisible()
  await pick(page, /^Motion: /, 'Reduced')
  await expect(page.getByRole('button', { name: 'Motion: Reduced' })).toBeVisible()
  await pick(page, /^Motion: /, 'System')
  await expect(page.getByRole('button', { name: 'Motion: System' })).toBeVisible()
  await pick(page, /^Theme: /, 'Light')
  await expect(page.locator('html')).toHaveClass(/\blight\b/)
  await expect.poll(() => p.writes()).toEqual([
    ['PATCH /v1/pref', { motion: 'reduced' }],
    ['PATCH /v1/pref', { motion: null }],
    ['PATCH /v1/pref', { theme: 'light' }],
  ])

  p.fail('PATCH /v1/pref', refusal('Settings are read-only while the account moves', 409))
  await pick(page, /^Text size: /, 'Large')
  await expect(page.getByRole('status').filter({ hasText: 'Settings are read-only while the account moves' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Text size: Medium' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Theme: Light' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Motion: System' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Text size: Medium' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dictation language: Français' })).toBeVisible()
})

test('Account saves only what changed and empties what was cleared, and a reload reads it back', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.name = 'Dave Bowman'
    w.prefs = { callName: 'Dave', work: 'astronaut', instructions: 'Prefer Go.' }
  })
  await page.goto('/-/settings/account')
  await expect(page.getByRole('button', { name: 'Work: astronaut' })).toBeVisible()
  await expect(page.getByLabel('What should Hanzo call you?')).toHaveValue('Dave')
  await page.getByLabel('What should Hanzo call you?').fill('')
  await page.getByLabel('Instructions for Hanzo').fill('')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  expect(p.writes()).toEqual([['PATCH /v1/pref', { callName: null, instructions: null }]])
  await expect(page.getByLabel('What should Hanzo call you?')).toHaveAttribute('placeholder', 'Dave')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()

  await page.reload()
  await expect(page.getByLabel('Full name')).toHaveValue('Dave Bowman')
  await expect(page.getByLabel('What should Hanzo call you?')).toHaveValue('')
  await expect(page.getByLabel('Instructions for Hanzo')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Work: astronaut' })).toBeVisible()

  // IAM keeps the name and answers without it: the page shows the name it sent.
  await page.getByLabel('Full name').fill('Dave B')
  await pick(page, /^Work: /, 'Design')
  p.once('PUT /v1/iam/account', { json: { status: 'ok', msg: '', data: {} } })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  expect(p.writes().slice(1)).toEqual([
    ['PUT /v1/iam/account', { displayName: 'Dave B' }],
    ['PATCH /v1/pref', { work: 'design' }],
  ])
  await expect(page.getByText('Dave B', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Work: Design' })).toBeVisible()
  await expect(page.getByLabel('Full name')).toHaveValue('Dave B')
})

test('Account says what IAM refused, for the name and for the photo, and a photo not chosen sends nothing', async ({ page }) => {
  const p = await platform(page)
  await page.goto('/-/settings/account')
  await page.getByLabel('Full name').fill('Dave Bowman')
  p.fail('PUT /v1/iam/account', { json: { status: 'error', msg: 'The display name is too long' } })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The display name is too long' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  p.pass('PUT /v1/iam/account')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  expect(p.writes()).toEqual([
    ['PUT /v1/iam/account', { displayName: 'Dave Bowman' }],
    ['PUT /v1/iam/account', { displayName: 'Dave Bowman' }],
  ])
  await page.reload()
  await expect(page.getByLabel('Full name')).toHaveValue('Dave Bowman')

  await page.getByLabel('Photo').setInputFiles([])
  p.fail('POST /v1/account/avatar', refusal('a profile photo must be a PNG, JPEG, GIF or WebP image', 415))
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Change photo' }).click()
  await (await chooser).setFiles({ name: 'me.svg', mimeType: 'image/png', buffer: Buffer.from('<svg/>') })
  await expect(page.getByRole('status').filter({ hasText: 'a profile photo must be a PNG, JPEG, GIF or WebP image' })).toBeVisible()
  expect(p.sent.filter((s) => s.path === '/v1/account/avatar')).toHaveLength(1)
  await expect(page.locator(`img[src="${FACE}"]`)).toHaveCount(0)
})

test('an account with no name and no email reads as such', async ({ page }) => {
  await platform(page, (w) => {
    w.name = ''
    w.email = ''
  })
  await page.goto('/-/settings/account')
  await expect(page.getByText('No email on this account')).toBeVisible()
  await expect(page.getByText('?', { exact: true })).toBeVisible()
  await expect(page.getByLabel('What should Hanzo call you?')).toHaveAttribute('placeholder', 'A first name')
  await expect(page.getByRole('button', { name: 'Work: Choose one' })).toBeVisible()
})

test('Account lists every organization, copies this one’s id, and switches to another', async ({ page }) => {
  await platform(page)
  await member(page, [
    { org: ORG, role: 'admin' },
    { org: 'beta', role: 'member' },
  ])
  await page.addInitScript(() => {
    if (!localStorage.getItem('hanzo_iam_current_org')) localStorage.setItem('hanzo_iam_current_org', 'acme')
  })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/-/settings/account')
  await expect(page.getByText('Organization ID · you are an admin')).toBeVisible()
  await expect(page.getByText('Acting in acme as an admin')).toBeVisible()
  await page.getByRole('button', { name: 'Copy organization ID' }).click()
  await expect(page.getByRole('button', { name: 'Organization ID copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ORG)

  // Switching reloads the page at its root: that load is kept, and answered with a 204 so the page stays to be read.
  const moved: string[] = []
  const root = (u: URL) => u.pathname === '/'
  await page.route(root, (r) => (r.request().isNavigationRequest() ? (moved.push(r.request().url()), r.fulfill({ status: 204 })) : r.fallback()))
  await page.getByRole('button', { name: 'Switch' }).click()
  await expect.poll(() => moved.length).toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('hanzo_iam_current_org'))).toBe('beta')
  await page.unroute(root)
  await page.goto('/-/settings/account')
  await expect(page.getByText('Acting in beta', { exact: true })).toBeVisible()
  await expect(page.getByText('Organization ID', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch' })).toHaveCount(1)
})

test('signed out, Account’s Sign in opens IAM’s sign-in', async ({ page }) => {
  await page.route('**/.well-known/openid-configuration', (r) => r.fulfill({ status: 404 }))
  // IAM's pages are its own: the popup's request is kept here, and answered with nothing to draw.
  await page.context().route('https://hanzo.id/**', (r) => r.fulfill({ status: 204 }))
  await page.goto('/-/settings/account')
  const asked = page.context().waitForEvent('request', (r) => new URL(r.url()).pathname === '/v1/iam/oauth/authorize')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const url = new URL((await asked).url())
  expect(url.origin).toBe('https://hanzo.id')
  expect(url.searchParams.get('client_id')).toBe('hanzo-build')
})

test('logging out from Account hands the session back to IAM and forgets it here', async ({ page }) => {
  const p = await platform(page)
  await page.goto('/-/settings/account')
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect.poll(() => p.sent.find((s) => s.path === '/v1/iam/oauth/logout')?.query ?? '').toContain('post_logout_redirect_uri=')
  expect(await page.evaluate(() => localStorage.getItem('hanzo_iam_access_token'))).toBeNull()
})

test('Privacy records each answer to training and to insights, and a project’s visibility, across a reload', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.consent = { insights: false, training: 'refused' }
    w.projects = [
      { slug: 'shop', name: 'Shop', visibility: 'private', updatedAt: 2 },
      { slug: 'docs', name: 'Docs', visibility: '', updatedAt: 1 },
    ]
  })
  await page.goto('/-/settings/privacy')
  await expect(page.getByText('Hanzo does not train on your data.')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Usage insights' })).not.toBeChecked()
  await expect(page.getByText('Visibility not reported')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Make / })).toHaveCount(1)

  await page.getByRole('switch', { name: 'Usage insights' }).click()
  await expect(page.getByRole('switch', { name: 'Usage insights' })).toBeChecked()
  await page.getByRole('switch', { name: 'Help improve Hanzo models' }).click()
  await expect(page.getByText('Hanzo may train on your prompts and runs.')).toBeVisible()
  await page.getByRole('button', { name: 'Make public' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Shop is public' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Make private' })).toBeVisible()
  expect(p.writes()).toEqual([
    ['PUT /v1/iam/consent', { insights: true }],
    ['PUT /v1/iam/consent', { training: 'granted' }],
    ['PATCH /v1/projects/shop', { visibility: 'public' }],
  ])

  await page.reload()
  await expect(page.getByRole('switch', { name: 'Usage insights' })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Help improve Hanzo models' })).toBeChecked()
  await expect(page.getByText('Public', { exact: true })).toBeVisible()
  await page.getByRole('switch', { name: 'Help improve Hanzo models' }).click()
  await expect(page.getByText('Hanzo does not train on your data.')).toBeVisible()
  expect(p.writes().at(-1)).toEqual(['PUT /v1/iam/consent', { training: 'refused' }])

  // A platform that saves without saying what it saved is still read as saved.
  p.once('PATCH /v1/projects/shop', { json: { slug: 'shop', name: 'Shop' } })
  await page.getByRole('button', { name: 'Make private' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Shop is saved' })).toBeVisible()
  await expect(page.getByText('Private', { exact: true })).toBeVisible()
})

test('Privacy says what the platform refused', async ({ page }) => {
  const p = await platform(page)
  p.fail('GET /v1/iam/consent', { json: { status: 'error', msg: 'Please sign in first' } })
  p.fail('GET /v1/projects', refusal('The project store is down', 503))
  await page.goto('/-/settings/privacy')
  await expect(page.getByText('Please sign in first')).toBeVisible()
  await expect(page.getByText('The project store is down')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)

  p.pass('GET /v1/iam/consent')
  p.pass('GET /v1/projects')
  await page.reload()
  p.fail('PUT /v1/iam/consent', refusal('Consent is recorded by IAM, which is down', 503))
  await page.getByRole('switch', { name: 'Usage insights' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Consent is recorded by IAM, which is down' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Usage insights' })).toBeChecked()
  p.fail('PATCH /v1/projects/shop', refusal('A private project needs a paid plan', 402))
  await page.getByRole('button', { name: 'Make private' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'A private project needs a paid plan' })).toBeVisible()
  await expect(page.getByText('Public', { exact: true })).toBeVisible()
})

test('Capabilities switches a partly-on kind on, keeps it across a reload, and says a refusal', async ({ page }) => {
  const p = await platform(page)
  await page.goto('/-/settings/capabilities')
  await expect(page.getByText('Connector actions', { exact: true })).toBeVisible()
  await expect(page.getByText('Actions in the apps your organization connected. 1 of 2 on.')).toBeVisible()
  await page.getByRole('switch', { name: 'Connector actions' }).click()
  await expect(page.getByText('Actions in the apps your organization connected. All 2 on.')).toBeVisible()
  expect(p.writes()).toEqual([['PUT /v1/tool/activation', { activate: ['slack_post', 'slack_read'], deactivate: [] }]])
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Connector actions' })).toBeChecked()
  p.fail('PUT /v1/tool/activation', refusal('org admin required to change activation', 403))
  await page.getByRole('switch', { name: 'Skills' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'org admin required to change activation' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Skills' })).not.toBeChecked()
})

test('Memory remembers across a reload, keeps what a refusal left unsaid, and says why a forget failed', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.memories = [{ owner: ORG, name: 'mem_1', content: 'Tabs, not spaces.', kind: '', updatedTime: '' }]
  })
  await page.goto('/-/settings/memory')
  await expect(page.getByText('1 memory, newest first.')).toBeVisible()
  await expect(page.getByText('Tabs, not spaces.')).toBeVisible()
  const box = page.getByLabel('Tell Hanzo what to remember or change')
  await box.press('Enter')
  expect(p.writes()).toEqual([])

  p.fail('POST /v1/ai/memory/remember', { json: { status: 'error', msg: 'Memory is full' } })
  await box.fill('My tests run with vitest.')
  await box.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Memory is full' })).toBeVisible()
  await expect(box).toHaveValue('My tests run with vitest.')
  p.pass('POST /v1/ai/memory/remember')
  await page.getByRole('button', { name: 'Remember', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Remembered' })).toBeVisible()
  await expect(box).toHaveValue('')
  await expect(page.getByText('2 memories, newest first.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('My tests run with vitest.')).toBeVisible()
  p.fail('POST /v1/ai/memory/delete', refusal('That memory is not yours', 404))
  await page.getByRole('button', { name: 'Forget Tabs, not spaces.' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'That memory is not yours' })).toBeVisible()
  await expect(page.getByText('Tabs, not spaces.')).toBeVisible()
  expect(p.writes()).toEqual([
    ['POST /v1/ai/memory/remember', { content: 'My tests run with vitest.' }],
    ['POST /v1/ai/memory/remember', { content: 'My tests run with vitest.' }],
    ['POST /v1/ai/memory/delete', { id: `${ORG}/mem_1` }],
  ])
})

test('Code reads a default no longer offered as saved, warns of a plan on a machine, says a refusal, and keeps the defaults across a reload', async ({ page }) => {
  const p = await platform(page, (w) => (w.prefs = { code: { model: 'zen-old', place: 'tgt_gone' } }))
  await page.goto('/-/settings/code')
  await expect(page.getByRole('button', { name: 'Default model: zen-old' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Default place: tgt_gone' })).toBeVisible()
  await pick(page, /^Default mode: /, 'Plan')
  await expect(page.getByText('A plan runs in the Hanzo sandbox: a machine clones and pushes with its own credential. Choose Cloud, or switch to Build.')).toBeVisible()
  await pick(page, /^Default place: /, 'Default')
  await expect(page.getByText(/^A plan runs in the Hanzo sandbox/)).toHaveCount(0)
  expect(p.writes()).toEqual([
    ['PATCH /v1/pref', { code: { model: 'zen-old', place: 'tgt_gone', mode: 'plan' } }],
    ['PATCH /v1/pref', { code: { model: 'zen-old', place: '', mode: 'plan' } }],
  ])

  p.fail('PATCH /v1/pref', refusal('preferences document exceeds 16384 bytes', 413))
  await pick(page, /^Default effort: /, 'High')
  await expect(page.getByRole('status').filter({ hasText: 'preferences document exceeds 16384 bytes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Default effort: Medium' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Default mode: Plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Default place: Default' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Default model: zen-old' })).toBeVisible()
})

test('Code offers the sandbox alone, and says so, when the models and the machines cannot be read', async ({ page }) => {
  const p = await platform(page)
  p.fail('GET /v1/models', refusal('The model catalog is down', 503))
  p.fail('GET /v1/agent/targets', refusal('The machine registry is down', 503))
  await page.goto('/-/settings/code')
  await expect(page.getByRole('button', { name: 'Default model: Enso' })).toBeVisible()
  await page.getByRole('button', { name: 'Default model: Enso' }).click()
  await expect(page.getByText('The model catalog is down')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Default place: Default' }).click()
  await expect(page.getByText('The machine registry is down')).toBeVisible()
  await expect(page.getByRole('option', { name: /Default/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /workshop/ })).toHaveCount(0)
})

// ── the Code settings ───────────────────────────────────────────────────────

test('Environments says where each codebase stands, forgets one after a refusal, and goes back to the list', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.envs = [
      { repo: 'universe', install: 'pnpm install', start: 'pnpm dev', secrets: ['TOKEN', 'DB_URL'], state: 'ready', updatedAt: '2026-09-20T10:00:00Z' },
      { repo: 'site', install: '', start: '', secrets: [], state: 'none', updatedAt: 'soon' },
      { repo: 'api', install: 'go mod download', start: '', secrets: ['KEY'], state: 'proposed' },
    ]
  })
  await page.goto('/-/settings/environments')
  await expect(page.getByText('Ready · 2 secrets · Updated Sep 20, 2026')).toBeVisible()
  await expect(page.getByText('Not set up', { exact: true })).toBeVisible()
  await expect(page.getByText('Proposed, waiting for review · 1 secret', { exact: true })).toBeVisible()
  await expect(page.getByText('An org admin saves an environment and sets its secrets.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Open site' }).click()
  await page.getByRole('button', { name: 'All environments' }).click()
  await expect(page.getByText('Not set up', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Open universe' }).click()
  await page.getByRole('button', { name: 'Forget', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'Forget universe’s environment?' })
  await expect(ask.getByText('Forget universe’s environment?')).toBeVisible()
  p.fail('DELETE /v1/environment/universe', refusal('org admin required', 403))
  await ask.getByRole('button', { name: 'Forget' }).click()
  await expect(ask.getByText('org admin required')).toBeVisible()
  p.pass('DELETE /v1/environment/universe')
  await ask.getByRole('button', { name: 'Forget' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'universe’s environment is forgotten' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open universe' })).toHaveCount(0)
  expect(p.writes()).toEqual([
    ['DELETE /v1/environment/universe', null],
    ['DELETE /v1/environment/universe', null],
  ])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Open site' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open universe' })).toHaveCount(0)
})

test('Machines says what each is doing, brings a drained one back, says the owner rule, and registers one by hand after a refusal', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.targets = [
      { id: 'tgt_1', label: 'workshop', kind: 'gpu', status: 'online', capacity: '1× GB10', host: 'spark', sessions: 3, running: 1 },
      { id: 'tgt_2', label: 'laptop', kind: 'laptop', status: 'draining', host: 'laptop', sessions: 4 },
      { id: 'tgt_3' },
    ]
  })
  await page.goto('/-/settings/machines')
  await expect(page.getByText('online · gpu · spark · 1× GB10 · 1 running')).toBeVisible()
  await expect(page.getByText('draining · laptop · 4 runs', { exact: true })).toBeVisible()
  await expect(page.getByText('tgt_3', { exact: true })).toBeVisible()
  await expect(page.getByText('unknown', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for laptop' }).click()
  await page.getByRole('menuitem', { name: 'Take runs again' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'laptop takes runs again' })).toBeVisible()
  await expect(page.getByText('online · laptop · 4 runs', { exact: true })).toBeVisible()

  p.fail('PATCH /v1/agent/targets/tgt_1', refusal('target not found', 404))
  await page.getByRole('button', { name: 'Actions for workshop' }).click()
  await page.getByRole('menuitem', { name: /^Drain/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'This machine is gone, or not yours to change: only the member who linked it, or an org admin, can.' })).toBeVisible()

  await page.getByRole('button', { name: 'Register one by hand' }).click()
  const add = page.getByRole('dialog', { name: 'Register a machine' })
  await add.getByLabel('Machine name').fill('rack')
  await add.getByRole('radio', { name: 'cloud' }).click()
  await expect(add.getByRole('radio', { name: 'cloud' })).toHaveAttribute('aria-checked', 'true')
  await add.getByRole('button', { name: 'Cancel' }).click()
  await expect(add).toHaveCount(0)
  await page.getByRole('button', { name: 'Register one by hand' }).click()
  await expect(add.getByLabel('Machine name')).toHaveValue('')
  await expect(add.getByRole('radio', { name: 'machine' })).toHaveAttribute('aria-checked', 'true')
  await add.getByLabel('Machine name').fill('rack')
  p.fail('POST /v1/agent/targets', refusal('a machine named rack is registered already', 409))
  await add.getByRole('button', { name: 'Register' }).click()
  await expect(add.getByText('a machine named rack is registered already')).toBeVisible()
  p.pass('POST /v1/agent/targets')
  const release = p.hold((s) => s.method === 'POST' && s.path === '/v1/agent/targets')
  await add.getByRole('button', { name: 'Register' }).click()
  await expect(add.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(add).toBeVisible()
  release()
  await expect(page.getByRole('status').filter({ hasText: 'rack is registered' })).toBeVisible()
  await expect(add).toHaveCount(0)
  expect(p.writes()).toEqual([
    ['PATCH /v1/agent/targets/tgt_2', { status: 'online' }],
    ['PATCH /v1/agent/targets/tgt_1', { status: 'draining' }],
    ['POST /v1/agent/targets', { label: 'rack', kind: 'machine' }],
    ['POST /v1/agent/targets', { label: 'rack', kind: 'machine' }],
  ])
  await page.reload()
  await expect(page.getByText('rack', { exact: true })).toBeVisible()
  await expect(page.getByText('online · laptop · 4 runs', { exact: true })).toBeVisible()

  // A claim key, shown once, is put away with Escape as well as with Done.
  await page.getByRole('button', { name: 'Actions for workshop' }).click()
  await page.getByRole('menuitem', { name: 'Claim key' }).click()
  await page.getByRole('dialog', { name: /^Mint a claim key/ }).getByRole('button', { name: 'Mint key' }).click()
  await expect(page.getByLabel('Claim key', { exact: true })).toHaveText('tk_live_once')
  await page.keyboard.press('Escape')
  await expect(page.getByText('tk_live_once')).toHaveCount(0)
})

test('API keys: a secret created after a refusal, a publishable rotated with a limit, and a secret revoked, each across a reload', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.keys = [{ type: 'publishable', prefix: 'pk-acme', key: 'pk-acme-public-1234', createdAt: 'not a date' }]
  })
  await page.goto('/-/settings/keys')
  await expect(page.getByText('Unrestricted', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Create the secret key' }).click()
  const make = page.getByRole('dialog', { name: /key$/ })
  await expect(make.getByText('Create your secret key')).toBeVisible()
  await make.getByRole('button', { name: 'Cancel' }).click()
  await expect(make).toHaveCount(0)
  await page.getByRole('button', { name: 'Create the secret key' }).click()
  p.fail('POST /v1/account/keys', refusal('keys are disabled for this organization', 403))
  await make.getByRole('button', { name: 'Create' }).click()
  await expect(make.getByText('keys are disabled for this organization')).toBeVisible()
  p.pass('POST /v1/account/keys')
  const release = p.hold((s) => s.method === 'POST' && s.path === '/v1/account/keys')
  await make.getByRole('button', { name: 'Create' }).click()
  await page.keyboard.press('Escape')
  await expect(make).toBeVisible()
  release()
  await expect(make.getByText('Your new secret key')).toBeVisible()
  await expect(make.getByLabel('Secret key', { exact: true })).toHaveText('sk-live-2')
  await expect(make.getByText(/It reaches/)).toHaveCount(0)
  await make.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Secret key created' })).toBeVisible()
  await expect(page.getByText('sk-live… · Unrestricted · Created Sep 27, 2026')).toBeVisible()

  await page.getByRole('button', { name: 'Rotate the publishable key' }).click()
  await expect(make.getByText('Rotate your publishable key')).toBeVisible()
  await expect(make.getByText('The publishable key you have now stops working.')).toBeVisible()
  await make.getByLabel('Limit').fill('project:acme')
  await make.getByRole('button', { name: 'Rotate' }).click()
  await expect(make.getByText('Your new publishable key')).toBeVisible()
  await expect(make.getByText('pk-live-3', { exact: true })).toBeVisible()
  await expect(make.getByText('It reaches project:acme and nothing else.')).toBeVisible()
  await make.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByLabel('Publishable key', { exact: true })).toHaveText('pk-live-3')
  await expect(page.getByText('Reaches project:acme · Created Sep 27, 2026')).toBeVisible()

  await page.getByRole('button', { name: 'Revoke the secret key' }).click()
  const ask = page.getByRole('dialog', { name: 'Revoke your secret key?' })
  await expect(ask.getByText('Revoke your secret key?')).toBeVisible()
  p.fail('DELETE /v1/account/keys', refusal('IAM is not answering', 502))
  await ask.getByRole('button', { name: 'Revoke' }).click()
  await expect(ask.getByText('IAM is not answering')).toBeVisible()
  p.pass('DELETE /v1/account/keys')
  await ask.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Secret key revoked' })).toBeVisible()
  expect(p.writes()).toEqual([
    ['POST /v1/account/keys', { type: 'secret' }],
    ['POST /v1/account/keys', { type: 'secret' }],
    ['POST /v1/account/keys', { type: 'publishable', limit: ['project:acme'] }],
    ['DELETE /v1/account/keys?type=secret', null],
    ['DELETE /v1/account/keys?type=secret', null],
  ])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Create the secret key' })).toBeVisible()
  await expect(page.getByLabel('Publishable key', { exact: true })).toHaveText('pk-live-3')
})

// ── money and the organization ──────────────────────────────────────────────

test('Billing: seats and no period end, an ending plan kept after a refusal, cards that are not cards, and every part of an invoice', async ({ page }, info) => {
  const p = await platform(page, (w) => {
    w.subs = [{ id: 'sub_t', planId: 'team', status: 'active', quantity: 3, currentPeriodEnd: '', plan: { id: 'team', name: 'Team', price: 2400, interval: 'month' } }]
    w.cards = [
      { id: 'pm_9', type: 'card', card: { brand: '', last4: '1111' } },
      { id: 'pm_8', type: 'sepa_debit', name: 'SEPA account' },
      { id: 'pm_7', type: 'ach' },
    ]
    w.invoices = [
      { id: 'inv_2', number: 7, status: 'past_due', subtotal: 5000, tax: 400, discount: 500, creditApplied: 1000, amountPaid: 2900, amountDue: 1000, currency: 'usd', lineItems: [] },
      { id: 'inv_3', status: '', createdAt: '2026-08-01T00:00:00Z', subtotal: 100, amountPaid: 100, lineItems: [{ amount: 100 }] },
      { id: 'inv_4', status: 'draft', subtotal: 0 },
    ]
  })
  await page.goto('/-/settings/billing')
  await expect(page.getByText('Team plan')).toBeVisible()
  await expect(page.getByText('$72 a month for 3 seats.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const ending = page.getByRole('dialog', { name: 'Cancel your plan?' })
  await expect(ending.getByText('Team stays on until the end of this period, and nothing is charged after that. You can keep it any time before then.')).toBeVisible()
  await ending.getByRole('button', { name: 'Keep plan' }).click()
  await expect(ending).toHaveCount(0)

  await expect(page.getByText('SEPA account', { exact: true })).toBeVisible()
  await expect(page.getByText('ach', { exact: true })).toBeVisible()
  p.fail('DELETE /v1/billing/methods/pm_9', refusal('The card pays for the plan', 409))
  await page.getByRole('button', { name: 'Remove Card •••• 1111' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The card pays for the plan' })).toBeVisible()
  p.pass('DELETE /v1/billing/methods/pm_9')
  await page.getByRole('button', { name: 'Remove Card •••• 1111' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Card •••• 1111 is removed' })).toBeVisible()
  await expect(page.getByText('Card •••• 1111', { exact: true })).toHaveCount(0)

  await expect(page.getByText('Past due', { exact: true })).toBeVisible()
  await expect(page.getByText('$49', { exact: true })).toBeVisible()
  await expect(page.getByText('inv_4', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View invoice 7' }).click()
  const bill = page.getByRole('dialog', { name: /^Invoice/ })
  await expect(bill.getByText('Invoice 7')).toBeVisible()
  await expect(bill.getByText('Past due', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('billing-invoice.png') })
  for (const [what, much] of [
    ['Subtotal', '$50'],
    ['Discount', '-$5'],
    ['Tax', '$4'],
    ['Total', '$49'],
    ['Credit applied', '-$10'],
    ['Paid', '$29'],
    ['Due', '$10'],
  ]) {
    await expect(bill.getByText(what, { exact: true })).toBeVisible()
    await expect(bill.getByText(much, { exact: true }).first()).toBeVisible()
  }
  p.fail('GET /v1/billing/invoices/inv_2/pdf', refusal('invoice not found', 404))
  await bill.getByRole('button', { name: 'Download PDF' }).click()
  await expect(bill.getByRole('status').filter({ hasText: 'invoice not found' })).toBeVisible()
  await bill.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'View invoice Aug 1, 2026' }).click()
  await expect(bill.getByText('Invoice', { exact: true })).toBeVisible()
  await expect(bill.getByText('Line 1')).toBeVisible()
  const download = page.waitForEvent('download')
  await bill.getByRole('button', { name: 'Download PDF' }).click()
  expect((await download).suggestedFilename()).toBe('inv_3.pdf')
  await page.keyboard.press('Escape')
  await expect(bill).toHaveCount(0)

  p.w.subs = [{ ...SUB, cancelAtPeriodEnd: true }]
  await page.reload()
  await expect(page.getByText('$100 a month. Ends on Oct 27, 2026.')).toBeVisible()
  await expect(page.getByText('Your plan ends on Oct 27, 2026')).toBeVisible()
  p.fail('POST /v1/billing/subscriptions/sub_1/reactivate', refusal('The period has ended', 409))
  await page.getByRole('button', { name: 'Keep plan' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The period has ended' })).toBeVisible()
  p.pass('POST /v1/billing/subscriptions/sub_1/reactivate')
  await page.getByRole('button', { name: 'Keep plan' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Your plan renews as before' })).toBeVisible()
  await expect(page.getByText('Cancel plan')).toBeVisible()
  await page.reload()
  await expect(page.getByText('$100 a month. Renews on Oct 27, 2026.')).toBeVisible()
  await page.getByRole('button', { name: 'Adjust plan' }).click()
  await expect(page).toHaveURL(/\/-\/plans$/)
  expect(p.writes()).toEqual([
    ['DELETE /v1/billing/methods/pm_9', null],
    ['DELETE /v1/billing/methods/pm_9', null],
    ['POST /v1/billing/subscriptions/sub_1/reactivate', {}],
    ['POST /v1/billing/subscriptions/sub_1/reactivate', {}],
  ])
})

/**
 * The processor's card field, as its SDK draws it: `window.gate` holds it back,
 * `window.broken` and `window.jammed` are what it throws instead of drawing or
 * tokenizing — not always an Error, as it is not our code — and `window.tokenized`
 * is what it hands back.
 */
const SQUARE = `window.Square = { payments: () => ({ card: async () => {
  await window.gate
  if (window.broken) throw window.broken
  let field = null
  return {
    attach: async (el) => { field = document.createElement('input'); field.setAttribute('aria-label', 'Card number'); el.appendChild(field) },
    tokenize: async () => { if (window.jammed) throw window.jammed; return window.tokenized || { status: 'OK', token: 'cnon:test' } },
    destroy: async () => { field?.remove(); window.destroyed = (window.destroyed || 0) + 1; throw new Error('already gone') },
  }
} }) }`

test('the card form says a processor that is not set up, one that does not load, and a card it refused, then saves one', async ({ page }) => {
  const p = await platform(page, (w) => (w.processor = { provider: '' }))
  const sandbox = 'https://sandbox.web.squarecdn.com/v1/square.js'
  const live = 'https://web.squarecdn.com/v1/square.js'
  await page.route(sandbox, (r) => r.fulfill({ contentType: 'application/javascript', body: '/* nothing */' }))
  // The live SDK fails to load: the first time only once the dialog has been closed.
  let late = () => {}
  const first = new Promise<void>((done) => (late = done))
  let asked = 0
  await page.route(live, async (r) => {
    if (asked++ === 0) await first
    await r.abort()
  })
  await page.goto('/-/settings/billing')
  const dialog = page.getByRole('dialog', { name: 'Add a card' })
  const open = async () => {
    await page.getByRole('button', { name: 'Add card' }).click()
    await expect(dialog.getByText('Add a card')).toBeVisible()
  }
  const close = async () => {
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  }

  await open()
  await expect(dialog.getByText('This deployment takes no cards yet.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save card' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Close' }).click()

  p.fail('GET /v1/billing/settings', refusal('billing is not configured', 503))
  await open()
  await expect(dialog.getByText('billing is not configured')).toBeVisible()
  await close()
  p.pass('GET /v1/billing/settings')

  p.w.processor = { provider: 'square', applicationId: 'sandbox-sq0idb-test', locationId: 'L1', environment: 'sandbox' }
  await open()
  await expect(dialog.getByText('The card form did not load')).toBeVisible()
  await expect(dialog.getByText('Sandbox: use a test card. Nothing is charged.')).toBeVisible()
  await close()
  // The script already came back without the form: asking again answers the same.
  await open()
  await expect(dialog.getByText('The card form did not load')).toBeVisible()
  await close()

  p.w.processor = { ...p.w.processor, environment: 'production', live: true }
  await open()
  await expect(dialog.getByText('The card number goes to the payment processor, never to Hanzo.')).toBeVisible()
  await expect(dialog.getByText('Loading the card form…')).toBeVisible()
  await close()
  late()
  await open()
  await expect(dialog.getByText('The card form did not load')).toBeVisible()
  await close()

  await page.unroute(live)
  await page.route(live, (r) => r.fulfill({ contentType: 'application/javascript', body: SQUARE }))
  await open()
  await expect(dialog.getByLabel('Card number')).toBeVisible()
  await expect(dialog.getByText('Loading the card form…')).toHaveCount(0)

  await page.evaluate(() => {
    ;(window as unknown as { tokenized: unknown }).tokenized = { status: 'Invalid', errors: [{ message: 'Card number is not valid' }, {}, { message: 'CVV is required' }] }
  })
  await dialog.getByRole('button', { name: 'Save card' }).click()
  await expect(dialog.getByText('Card number is not valid; CVV is required')).toBeVisible()
  await page.evaluate(() => {
    ;(window as unknown as { tokenized: unknown }).tokenized = { status: 'Invalid' }
  })
  await dialog.getByRole('button', { name: 'Save card' }).click()
  await expect(dialog.getByText('The card details are incomplete')).toBeVisible()
  await page.evaluate(() => {
    ;(window as unknown as { tokenized: unknown }).tokenized = null
  })
  p.fail('POST /v1/billing/methods', refusal('The card was declined', 402))
  await dialog.getByRole('button', { name: 'Save card' }).click()
  await expect(dialog.getByText('The card was declined')).toBeVisible()
  p.pass('POST /v1/billing/methods')
  await dialog.getByRole('button', { name: 'Save card' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Mastercard •••• 4444 is saved' })).toBeVisible()
  expect(p.writes()).toEqual([
    ['POST /v1/billing/methods', { type: 'card', providerRef: 'cnon:test' }],
    ['POST /v1/billing/methods', { type: 'card', providerRef: 'cnon:test' }],
  ])
  // Closing let the field go; one closed before the processor hands it over is let go too, never drawn.
  const destroyed = () => page.evaluate(() => (window as unknown as { destroyed?: number }).destroyed ?? 0)
  await expect.poll(destroyed).toBeGreaterThan(0)
  const before = await destroyed()
  await page.evaluate(() => {
    const w = window as unknown as { gate: Promise<void>; open: () => void }
    w.gate = new Promise((done) => (w.open = done))
  })
  await open()
  await close()
  await page.evaluate(() => (window as unknown as { open: () => void }).open())
  await expect.poll(destroyed).toBeGreaterThan(before)

  // The processor's own code failing with something that is not an Error still says what failed.
  await page.evaluate(() => {
    ;(window as unknown as { broken: unknown }).broken = 'no field today'
  })
  await open()
  await expect(dialog.getByText('The card form did not load')).toBeVisible()
  await close()
  await page.evaluate(() => {
    const w = window as unknown as { broken: unknown; jammed: unknown }
    w.broken = null
    w.jammed = { code: 'JAMMED' }
  })
  await open()
  await dialog.getByRole('button', { name: 'Save card' }).click()
  await expect(dialog.getByText('The card was not saved')).toBeVisible()
  await close()

  await page.reload()
  await expect(page.getByText('Mastercard •••• 4444')).toBeVisible()
})


const RESETS = from(4 * DAY)

test('Usage draws every kind of window and limit, buys more after a refusal, and lifts the monthly limit across a reload', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.rollup = {
      plan: '',
      included: {},
      windows: [
        { span: 'hour', limit: 100, used: 150, after: 30 * MIN + 25_000 },
        { span: 'minute', limit: 10, used: 2, after: 185 * MIN + 25_000 },
        { span: 'week', limit: 0, used: 5 },
        { span: 'day', limit: 50, used: 1, after: -MIN },
        { span: 'month', limit: 1000, used: 10, resets: 'soon' },
      ],
    }
    w.spend = { spend: { available: false } }
    w.caps = [
      { id: 'al_1', title: 'Monthly limit', threshold: 50000, enforce: true, project: '', service: '', resetsAt: RESETS },
      { id: 'al_2', title: '', threshold: 0, project: 'shop', service: 'llm', enforce: false },
      { id: 'al_3', title: 'GPU', threshold: 9900, enforce: true, service: 'compute' },
    ]
  })
  p.fail('GET /v1/billing/balance', refusal('The wallet is not answering', 503))
  await page.goto('/-/settings/usage')
  await expect(page.getByText('What the plan includes.')).toBeVisible()
  await expect(page.getByText('This hour · 150 of 100 requests')).toBeVisible()
  await expect(page.getByText('100% used · Resets in 30 min')).toBeVisible()
  await expect(page.getByText('minute · 2 of 10 requests')).toBeVisible()
  await expect(page.getByText('20% used · Resets in 3 hr 5 min')).toBeVisible()
  await expect(page.getByText('Today · 1 of 50 requests')).toBeVisible()
  await expect(page.getByText('2% used · Resets now')).toBeVisible()
  await expect(page.getByText('This month · 10 of 1,000 requests')).toBeVisible()
  await expect(page.getByText('1% used', { exact: true })).toBeVisible()
  await expect(page.getByText(/^This week/)).toHaveCount(0)
  await expect(page.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '100')
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(page.getByText('The ledger did not answer, so this is not a measurement')).toBeVisible()
  await expect(page.getByText('Nothing spent this month.')).toBeVisible()
  await expect(page.getByText('$500 a month', { exact: true })).toBeVisible()
  await expect(page.getByText(`Spend unknown · Resets ${drawn(RESETS)}`)).toBeVisible()
  await expect(page.getByText('project shop · service llm · warns only')).toBeVisible()
  await expect(page.getByText('—', { exact: true })).toBeVisible()
  await expect(page.getByText('service compute · refuses spend past it')).toBeVisible()
  await expect(page.getByText('$99', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Monthly limit in dollars')).toHaveAttribute('placeholder', '500')

  await page.getByLabel('Monthly limit in dollars').fill('lots')
  await page.getByRole('button', { name: 'Change limit' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Enter a monthly limit in dollars' })).toBeVisible()
  p.fail('DELETE /v1/billing/alerts/al_1', refusal('org admin required to change spend caps', 403))
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'org admin required to change spend caps' })).toBeVisible()
  p.pass('DELETE /v1/billing/alerts/al_1')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The monthly limit is lifted' })).toBeVisible()
  await expect(page.getByText('No monthly limit')).toBeVisible()

  p.pass('GET /v1/billing/balance')
  await page.reload()
  await expect(page.getByText('No monthly limit')).toBeVisible()
  await expect(page.getByText('$42', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Buy more' }).click()
  await page.getByLabel('Amount in dollars').fill('a lot')
  await page.getByRole('button', { name: 'Add funds' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Enter an amount in dollars' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByLabel('Amount in dollars')).toHaveCount(0)
  await page.getByRole('button', { name: 'Buy more' }).click()
  await page.getByLabel('Amount in dollars').fill('25')
  p.fail('POST /v1/billing/topup', refusal('The card was declined', 402))
  await page.getByRole('button', { name: 'Add $25' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The card was declined' })).toBeVisible()
  p.pass('POST /v1/billing/topup')
  await page.getByRole('button', { name: 'Add $25' }).click()
  await expect(page.getByRole('status').filter({ hasText: '$25 is added to the balance' })).toBeVisible()
  await expect(page.getByText('$67', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('$67', { exact: true })).toBeVisible()
  expect(p.writes()).toEqual([
    ['DELETE /v1/billing/alerts/al_1', null],
    ['DELETE /v1/billing/alerts/al_1', null],
    ['POST /v1/billing/topup', { amountCents: 2500, paymentMethodId: 'pm_1' }],
    ['POST /v1/billing/topup', { amountCents: 2500, paymentMethodId: 'pm_1' }],
  ])

  // The month's included spend, run over, with no windows; then a plan that includes nothing.
  p.w.rollup = { plan: 'max', included: { monthlyCents: 10000, consumedCents: 12000 }, overageCents: 2000, windows: [{ span: 'day', limit: 10, used: 1, after: 3 * DAY }] }
  await page.reload()
  await expect(page.getByText('Included with max.')).toBeVisible()
  await expect(page.getByText('$120 of $100 · $20 over')).toBeVisible()
  await expect(page.getByText(/^10% used · Resets [A-Z][a-z]{2} \d+, \d{4}$/)).toBeVisible()
  p.w.rollup = { plan: 'free', included: { monthlyCents: 0 }, windows: [] }
  await page.reload()
  await expect(page.getByText('This plan sets no usage limits. Usage is paid from the balance.')).toBeVisible()
})

test('Usage sends someone with no card to Billing, and says it is reading the cards until they come', async ({ page }) => {
  const p = await platform(page, (w) => (w.cards = []))
  await page.goto('/-/settings/usage')
  await page.getByRole('button', { name: 'Buy more' }).click()
  await expect(page.getByText('Add a card in Billing to buy more.')).toBeVisible()
  const release = p.hold((s) => s.path === '/v1/billing/methods')
  await page.reload()
  await page.getByRole('button', { name: 'Buy more' }).click()
  await expect(page.getByText('Reading cards…')).toBeVisible()
  release()
  await expect(page.getByText('Add a card in Billing to buy more.')).toBeVisible()
  await page.getByText('Add a card in Billing to buy more.').locator('..').getByRole('button', { name: 'Billing' }).click()
  await expect(page).toHaveURL(/\/-\/settings\/billing$/)
})

test('Plans moves back to Free at the period’s end, after a refusal and a second thought, across a reload', async ({ page }) => {
  const p = await platform(page)
  await page.goto('/-/plans')
  await expect(page.getByText('acme is on Max.')).toBeVisible()
  await expect(page.getByLabel('Dev plan').getByText('One paid plan at a time: Max ends before Dev begins.')).toBeVisible()
  const free = page.getByLabel('Free plan', { exact: true })
  await free.getByRole('button', { name: 'Switch to Free' }).click()
  const leave = page.getByRole('dialog', { name: 'Switch to the free plan?' })
  await expect(leave.getByText('Max stays on until Oct 27, 2026, and nothing is charged after that.')).toBeVisible()
  await leave.getByRole('button', { name: 'Keep Max' }).click()
  await expect(leave).toHaveCount(0)
  await free.getByRole('button', { name: 'Switch to Free' }).click()
  p.fail('POST /v1/billing/subscriptions/sub_1/cancel', refusal('The plan cannot end during a trial', 409))
  await leave.getByRole('button', { name: 'Switch', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The plan cannot end during a trial' })).toBeVisible()
  await expect(leave).toHaveCount(0)
  p.pass('POST /v1/billing/subscriptions/sub_1/cancel')
  await free.getByRole('button', { name: 'Switch to Free' }).click()
  await leave.getByRole('button', { name: 'Switch', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Max ends on Oct 27, 2026' })).toBeVisible()
  await expect(free.getByText('You move to Free when Max ends on Oct 27, 2026.')).toBeVisible()
  expect(p.writes()).toEqual([
    ['POST /v1/billing/subscriptions/sub_1/cancel', { atPeriodEnd: true }],
    ['POST /v1/billing/subscriptions/sub_1/cancel', { atPeriodEnd: true }],
  ])
  await page.reload()
  await expect(free.getByText('You move to Free when Max ends on Oct 27, 2026.')).toBeVisible()

  // A plan whose paid period has no end says so.
  p.w.subs = [{ ...SUB, currentPeriodEnd: '' }]
  await page.reload()
  await free.getByRole('button', { name: 'Switch to Free' }).click()
  await expect(leave.getByText('Max stays on until the end of this period, and nothing is charged after that.')).toBeVisible()
})

test('Plans asks for a card first, then upgrades monthly with it after a refusal, across a reload', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.subs = []
    w.cards = []
  })
  await page.route('https://sandbox.web.squarecdn.com/v1/square.js', (r) => r.fulfill({ contentType: 'application/javascript', body: SQUARE }))
  await page.goto('/-/plans')
  await expect(page.getByText('acme is on the free plan.')).toBeVisible()
  const dev = page.getByLabel('Dev plan', { exact: true })
  await dev.getByRole('button', { name: 'Add a card to upgrade' }).click()
  await page.getByRole('dialog', { name: 'Add a card' }).getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Mastercard •••• 4444 is saved' })).toBeVisible()

  await dev.getByRole('button', { name: 'Upgrade to Dev' }).click()
  const buy = page.getByRole('dialog', { name: /^Upgrade to/ })
  await expect(buy.getByText('Mastercard •••• 4444 is charged $19 now, and again every month until you cancel.')).toBeVisible()
  await buy.getByRole('button', { name: 'Not now' }).click()
  await expect(buy).toHaveCount(0)
  await dev.getByRole('button', { name: 'Upgrade to Dev' }).click()
  await page.keyboard.press('Escape')
  await expect(buy).toHaveCount(0)
  await dev.getByRole('button', { name: 'Upgrade to Dev' }).click()
  p.fail('POST /v1/billing/subscribe/card', refusal('already subscribed to max', 409))
  await buy.getByRole('button', { name: 'Upgrade', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'already subscribed to max' })).toBeVisible()
  p.pass('POST /v1/billing/subscribe/card')
  await dev.getByRole('button', { name: 'Upgrade to Dev' }).click()
  await buy.getByRole('button', { name: 'Upgrade', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'acme is on Dev' })).toBeVisible()
  await expect(dev.getByRole('button', { name: 'Current plan' })).toBeVisible()
  expect(p.writes()).toEqual([
    ['POST /v1/billing/methods', { type: 'card', providerRef: 'cnon:test' }],
    ['POST /v1/billing/subscribe/card', { planId: 'dev', paymentMethodId: 'pm_2', interval: 'month' }],
    ['POST /v1/billing/subscribe/card', { planId: 'dev', paymentMethodId: 'pm_2', interval: 'month' }],
  ])
  await page.reload()
  await expect(page.getByText('acme is on Dev.')).toBeVisible()
  await expect(dev.getByRole('button', { name: 'Current plan' })).toBeVisible()
})

test('Plans on a plan that costs nothing offers the rest by the month, per seat where they are', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.plans = [
      { slug: 'free', name: 'Free', category: 'personal', price: 0 },
      { slug: 'starter', name: 'Starter', category: 'personal', price: 0, description: 'For trying it out.' },
      { slug: 'team', name: 'Team', category: 'team', price: 2400, perSeat: true },
    ]
    w.subs = [{ id: 'sub_s', planId: 'starter', status: 'active', plan: { id: 'starter', name: 'Starter', price: 0 } }]
  })
  await page.goto('/-/plans')
  await expect(page.getByText('acme is on Starter.')).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Billing period' })).toHaveCount(0)
  await expect(page.getByLabel('Starter plan').getByText('For trying it out.')).toBeVisible()
  const team = page.getByLabel('Team plan')
  await expect(team.getByText('per seat, a month', { exact: true })).toBeVisible()
  await team.getByRole('button', { name: 'Upgrade to Team' }).click()
  await page.getByRole('dialog', { name: /^Upgrade to/ }).getByRole('button', { name: 'Upgrade', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'acme is on Team' })).toBeVisible()
  expect(p.writes()).toEqual([['POST /v1/billing/subscribe/card', { planId: 'team', paymentMethodId: 'pm_1', interval: 'month' }]])
  await expect(team.getByRole('button', { name: 'Current plan' })).toBeVisible()
})

test('Members: invitations used, stopped and refused, an address that is not one, and one invited and withdrawn across a reload', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.roster = [
      { user: `${ORG}/dave`, org: ORG, role: 'owner', createdTime: '2026-08-01T00:00:00Z' },
      { user: 'zed', org: ORG, role: 'member' },
      { user: `${ORG}/`, org: ORG, role: 'admin' },
    ]
    w.invitations = [
      { owner: ORG, name: 'invite-erin', email: 'erin@acme.test', code: 'c0de', quota: 1, usedCount: 1, state: 'Active', createdTime: '2026-09-20T00:00:00Z' },
      { owner: ORG, name: 'invite-old', quota: 2, usedCount: 0, state: '' },
      { owner: ORG, name: 'invite-sus', email: 'sus@acme.test', code: 'beef', quota: 1, usedCount: 0, state: 'Suspended' },
    ]
  })
  await page.goto('/-/settings/members')
  await expect(page.getByText('zed', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Member', { exact: true })).toBeVisible()
  // A person IAM names without a username is drawn with a question mark.
  await expect(page.getByText('?', { exact: true })).toBeVisible()
  await expect(page.getByText(`${ORG}/`, { exact: true })).toBeVisible()
  await expect(page.getByText('Code c0de · 1 of 1 joined · invited Sep 20, 2026')).toBeVisible()
  await expect(page.getByText('invite-old', { exact: true })).toBeVisible()
  await expect(page.getByText('0 of 2 joined · not redeemable', { exact: true })).toBeVisible()
  await expect(page.getByText('Code beef · 0 of 1 joined · suspended', { exact: true })).toBeVisible()
  await expect(page.getByText('Every invitation has been used or stopped.')).toBeVisible()

  await page.getByLabel('Email to invite').fill('amy')
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'amy is not an email address' })).toBeVisible()
  p.fail('POST /v1/iam/invitations', { status: 403, json: { status: 'error', msg: 'auth:Unauthorized operation' } })
  await page.getByLabel('Email to invite').fill('amy@acme.test')
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'auth:Unauthorized operation' })).toBeVisible()
  await expect(page.getByLabel('Email to invite')).toHaveValue('amy@acme.test')
  p.pass('POST /v1/iam/invitations')
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'amy@acme.test is invited. IAM sends no email: share the code with them.' })).toBeVisible()
  await expect(page.getByText('Every invitation has been used or stopped.')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('amy@acme.test', { exact: true })).toBeVisible()

  p.fail('DELETE /v1/iam/invitations/acme/invite-old', refusal('IAM is not answering', 502))
  await page.getByRole('button', { name: 'Revoke the invitation for invite-old' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'IAM is not answering' })).toBeVisible()
  p.pass('DELETE /v1/iam/invitations/acme/invite-old')
  await page.getByRole('button', { name: 'Revoke the invitation for invite-old' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The invitation is withdrawn' })).toBeVisible()
  await expect(page.getByText('invite-old', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('sus@acme.test', { exact: true })).toBeVisible()
  await expect(page.getByText('invite-old', { exact: true })).toHaveCount(0)
  const made = p.writes().filter(([k]) => k === 'POST /v1/iam/invitations')
  expect(made).toHaveLength(2)
  for (const [, body] of made) expect(body).toMatchObject({ owner: ORG, email: 'amy@acme.test', displayName: 'amy@acme.test', quota: 1, usedCount: 0, state: 'Active' })
  expect(p.writes().filter(([k]) => k.startsWith('DELETE'))).toEqual([
    ['DELETE /v1/iam/invitations/acme/invite-old', null],
    ['DELETE /v1/iam/invitations/acme/invite-old', null],
  ])
})

test('Integrations connects GitHub and Slack at their own consent pages, and installs the App', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.github = { configured: true, connected: false }
    w.installations = [
      { login: 'dave', type: 'User', grant: 'selected', connected: false },
      { login: 'acme', type: 'Organization', grant: '', connected: true },
    ]
    w.slack = { id: 'slack', name: 'Slack', available: true, connected: false }
  })
  // The consent pages are the providers' own: the page leaves for them, and a 204 keeps it here to read on.
  const left: string[] = []
  await page.route(/^https:\/\/(github|slack)\.com\//, (r) => {
    left.push(r.request().url())
    return r.fulfill({ status: 204 })
  })
  await page.goto('/-/settings/integrations')
  await expect(page.getByText('Not connected').first()).toBeVisible()
  await expect(page.getByText('User · selected repositories')).toBeVisible()
  await expect(page.getByText('Removed on GitHub')).toBeVisible()
  // The navigation's group, and the organization the App is installed on.
  await expect(page.getByText('Organization', { exact: true })).toHaveCount(2)
  await expect(page.getByText('Installed', { exact: true })).toBeVisible()

  p.once('POST /v1/provider/slack/connect', { json: { authorizeUrl: 'https://slack.evil.example/oauth' } })
  const connects = page.getByRole('button', { name: 'Connect', exact: true })
  await connects.nth(1).click()
  await expect(page.getByRole('status').filter({ hasText: 'The platform did not name a slack address to connect at' })).toBeVisible()
  await connects.nth(1).click()
  await expect.poll(() => left).toEqual(['https://slack.com/oauth/v2/authorize?client_id=1&state=signed'])
  await expect(connects.first()).toBeDisabled()
  await page.reload()
  await connects.first().click()
  await expect.poll(() => left.at(-1)).toBe('https://github.com/login/oauth/authorize?client_id=1&state=signed')
  await page.reload()
  await page.getByRole('button', { name: 'Install on a GitHub account' }).click()
  await expect.poll(() => left.at(-1)).toBe('https://github.com/apps/hanzo/installations/new?state=signed')
  expect(p.writes()).toEqual([
    ['POST /v1/provider/slack/connect', {}],
    ['POST /v1/provider/slack/connect', {}],
    ['POST /v1/provider/github/user/connect', null],
    ['POST /v1/provider/github/connect', {}],
  ])
})

test('Integrations disconnects GitHub and Slack after refusals, reads a workspace with no dates or names, and one it cannot connect', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.slack = { id: 'slack', name: 'Slack', available: true, connected: true, connection: { account: '' } }
    w.channels = [{ id: 'C9', name: '', is_private: true, is_member: false }]
  })
  await page.goto('/-/settings/integrations')
  await expect(page.getByText('Connected as @dave-gh')).toBeVisible()
  await expect(page.getByText('Connected', { exact: true })).toBeVisible()
  await expect(page.getByText('C9', { exact: true })).toBeVisible()
  await expect(page.getByText('Not joined')).toBeVisible()

  const off = page.getByRole('button', { name: 'Disconnect', exact: true })
  p.fail('POST /v1/provider/github/user/disconnect', refusal('GitHub did not answer', 502))
  await off.first().click()
  await expect(page.getByRole('status').filter({ hasText: 'GitHub did not answer' })).toBeVisible()
  p.pass('POST /v1/provider/github/user/disconnect')
  await off.first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Your GitHub is disconnected' })).toBeVisible()
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible()
  p.fail('POST /v1/provider/slack/disconnect', refusal('org admin required', 403))
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'org admin required' })).toBeVisible()
  expect(p.writes()).toEqual([
    ['POST /v1/provider/github/user/disconnect', null],
    ['POST /v1/provider/github/user/disconnect', null],
    ['POST /v1/provider/slack/disconnect', {}],
  ])
  await page.reload()
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(1)

  p.fail('GET /v1/provider/slack/channels', refusal('Slack refused the token', 401))
  await page.reload()
  await expect(page.getByText('Slack refused the token')).toBeVisible()

  p.w.github = { configured: false, connected: false }
  p.w.slack = { id: 'slack', name: 'Slack', available: false, connected: false, note: 'Slack is not configured on this deployment' }
  await page.reload()
  await expect(page.getByText('This deployment cannot connect GitHub yet.')).toBeVisible()
  await expect(page.getByText('Slack is not configured on this deployment')).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Connect|Disconnect)$/ })).toHaveCount(0)
  p.w.slack = { id: 'slack', name: 'Slack', available: false, connected: false }
  await page.reload()
  await expect(page.getByText('This deployment cannot connect Slack yet.')).toBeVisible()
})

test('Notifications: tests that did not arrive, a log read again and hidden, a webhook deleted while open, and a secret copied and hidden', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.hooks = [{ id: 'wh_1', url: 'https://acme.test/a', events: [], description: '', status: 'disabled', deliveries7d: 0, failures7d: 3 }]
    w.deliveries = [
      { subject: 'order.paid', status: 'failed', httpStatus: 0, attempt: 3, error: 'connection refused', created: '' },
      { subject: 'order.new', status: 'retrying', httpStatus: 502, attempt: 1, created: '2026-09-26T00:00:00Z' },
    ]
  })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/-/settings/notifications')
  await expect(page.getByText('every event · disabled · 0 delivered, 3 failed this week')).toBeVisible()
  await page.getByRole('button', { name: 'Deliveries to https://acme.test/a' }).click()
  await expect(page.getByText('Failed', { exact: true })).toBeVisible()
  await expect(page.getByText('order.paid · connection refused')).toBeVisible()
  await expect(page.getByText('Retrying', { exact: true })).toBeVisible()
  await expect(page.getByText('order.new → 502')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deliveries to https://acme.test/a' })).toHaveText('Hide deliveries')

  const trial = page.getByRole('button', { name: 'Send a test to https://acme.test/a' })
  p.once('POST /v1/webhook/wh_1/test', { json: { delivered: false, httpStatus: 500 } })
  await trial.click()
  await expect(page.getByRole('status').filter({ hasText: 'The test did not reach https://acme.test/a: it answered 500' })).toBeVisible()
  expect(p.sent.filter((s) => s.path === '/v1/webhook/wh_1/deliveries')).toHaveLength(2)
  p.once('POST /v1/webhook/wh_1/test', { json: { delivered: false, error: 'timeout after 5s' } })
  await trial.click()
  await expect(page.getByRole('status').filter({ hasText: 'The test did not reach https://acme.test/a: timeout after 5s' })).toBeVisible()
  p.once('POST /v1/webhook/wh_1/test', { json: { delivered: false } })
  await trial.click()
  await expect(page.getByRole('status').filter({ hasText: 'The test did not reach https://acme.test/a: no answer' })).toBeVisible()
  p.fail('POST /v1/webhook/wh_1/test', refusal('webhook is disabled', 409))
  await trial.click()
  await expect(page.getByRole('status').filter({ hasText: 'webhook is disabled' })).toBeVisible()

  await page.getByRole('button', { name: 'Deliveries to https://acme.test/a' }).click()
  await expect(page.getByText('order.new → 502')).toHaveCount(0)
  p.w.deliveries = []
  await page.getByRole('button', { name: 'Deliveries to https://acme.test/a' }).click()
  await expect(page.getByText('Nothing delivered yet.')).toBeVisible()

  p.fail('DELETE /v1/webhook/wh_1', refusal('not found', 404))
  await page.getByRole('button', { name: 'Delete https://acme.test/a' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'not found' })).toBeVisible()
  p.pass('DELETE /v1/webhook/wh_1')
  await page.getByRole('button', { name: 'Delete https://acme.test/a' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'https://acme.test/a is deleted' })).toBeVisible()
  await expect(page.getByText('Nothing delivered yet.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Add webhook' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Endpoint URL')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await page.getByLabel('Endpoint URL').fill('https://acme.test/b')
  p.fail('POST /v1/webhook', refusal('At most 20 webhooks', 409))
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'At most 20 webhooks' })).toBeVisible()
  p.pass('POST /v1/webhook')
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await expect(page.getByLabel('Signing secret')).toHaveText('whsec_0123456789abcdef')
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The secret is copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('whsec_0123456789abcdef')
  await page.getByRole('button', { name: 'Hide the secret' }).click()
  await expect(page.getByLabel('Signing secret')).toHaveCount(0)
  expect(p.writes().filter(([k]) => k === 'POST /v1/webhook')).toEqual([
    ['POST /v1/webhook', { url: 'https://acme.test/b', events: [], description: '' }],
    ['POST /v1/webhook', { url: 'https://acme.test/b', events: [], description: '' }],
  ])
  await page.reload()
  await expect(page.getByText('https://acme.test/b')).toBeVisible()
  await expect(page.getByText('https://acme.test/a')).toHaveCount(0)
})

// ── every section at once ───────────────────────────────────────────────────

const SECTIONS = ['general', 'account', 'privacy', 'billing', 'usage', 'capabilities', 'memory', 'code', 'environments', 'machines', 'keys', 'members', 'integrations', 'notifications'] as const

test('every section says it is reading until the platform answers', async ({ page }) => {
  const p = await platform(page)
  const release = p.hold((s) => s.method === 'GET' && !s.path.startsWith('/v1/iam/oauth') && s.path !== '/v1/pref')
  const reads: [string, string[]][] = [
    ['privacy', ['Reading your answers…', 'Reading projects…']],
    ['billing', ['Reading your plan…', 'Reading cards…', 'Reading invoices…']],
    ['usage', ['Reading the plan’s limits…', 'Reading spend…', '…']],
    ['capabilities', ['Reading tools…']],
    ['memory', ['Reading memories…']],
    ['environments', ['Reading environments…']],
    ['machines', ['Reading machines…']],
    ['keys', ['Reading your keys…']],
    ['members', ['Reading members…']],
    ['integrations', ['Reading…']],
    ['notifications', ['Reading webhooks…']],
  ]
  for (const [section, says] of reads) {
    await page.goto(`/-/settings/${section}`)
    for (const s of says) await expect(page.getByText(s, { exact: true }).first(), section).toBeVisible()
  }
  await page.goto('/-/settings/code')
  await expect(page.getByRole('button', { name: 'Default model: Enso' })).toBeVisible()
  await page.goto('/-/plans')
  await expect(page.getByText('Reading plans…')).toBeVisible()
  release()
  await expect(page.getByLabel('Max plan', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Upgrade to / })).toHaveCount(0)
})

test('Plans offers no move until the plan and the cards are read', async ({ page }) => {
  const p = await platform(page, (w) => (w.subs = []))
  const release = p.hold((s) => s.path === '/v1/billing/subscriptions')
  await page.goto('/-/plans')
  await expect(page.getByLabel('Free plan', { exact: true }).getByRole('button', { name: 'Current plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Upgrade to / })).toHaveCount(0)
  release()
  await expect(page.getByRole('button', { name: 'Upgrade to Max' })).toBeVisible()
})

test('every section says the platform’s refusal of what it reads', async ({ page }) => {
  const p = await platform(page)
  const down = 'The platform is down for maintenance'
  for (const key of [
    'GET /v1/iam/consent',
    'GET /v1/projects',
    'GET /v1/billing/subscriptions',
    'GET /v1/billing/methods',
    'GET /v1/billing/invoices',
    'GET /v1/billing/usage/rollup',
    'GET /v1/billing/balance',
    'GET /v1/billing/credit-balance',
    'GET /v1/usage/summary',
    'GET /v1/billing/alerts',
    'GET /v1/tool',
    'GET /v1/ai/memory/list',
    'GET /v1/environment',
    'GET /v1/agent/targets',
    'GET /v1/account/keys',
    'GET /v1/iam/memberships',
    'GET /v1/iam/invitations',
    'GET /v1/provider/github/user',
    'GET /v1/provider/github/installations',
    'GET /v1/provider/slack',
    'GET /v1/webhook',
    'GET /v1/billing/plans',
  ])
    p.fail(key, refusal(down, 503))
  const counts: [string, number][] = [
    ['privacy', 2],
    ['billing', 3],
    ['usage', 3],
    ['capabilities', 1],
    ['memory', 1],
    ['environments', 1],
    ['machines', 1],
    ['keys', 1],
    ['members', 2],
    ['integrations', 3],
    ['notifications', 1],
  ]
  for (const [section, n] of counts) {
    await page.goto(`/-/settings/${section}`)
    await expect(page.getByText(down, { exact: true }), section).toHaveCount(n)
  }
  await page.goto('/-/settings/usage')
  await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(3)
  await page.goto('/-/plans')
  await expect(page.getByText(down, { exact: true })).toBeVisible()
})

test('every section says when there is nothing yet', async ({ page }) => {
  await platform(page, (w) => {
    Object.assign(w, {
      projects: [],
      tools: [],
      memories: [],
      targets: [],
      envs: [],
      keys: [],
      subs: [],
      cards: [],
      invoices: [],
      rollup: {},
      spend: { spend: { available: true } },
      caps: [],
      roster: [],
      invitations: [],
      installations: [],
      channels: [],
      hooks: [],
      plans: [],
    })
  })
  const empty: [string, string[]][] = [
    ['privacy', ['Your organization has no projects yet.']],
    ['billing', ['Free plan', 'No paid plan. Usage is paid from the balance.', 'No card on file.', 'No invoices yet.']],
    ['usage', ['This plan sets no usage limits. Usage is paid from the balance.', 'Nothing spent this month.', 'No monthly limit', '$0']],
    ['capabilities', ['No tools are available to this organization yet.']],
    ['memory', ['Nothing yet. What you tell Hanzo to remember shows here.']],
    ['environments', ['No codebase has an environment yet. Set one up from New, or from a run’s Environment tab.']],
    ['machines', ['No machine is linked yet.']],
    ['keys', ['For a server. It acts as you, so it never goes in a page. None yet.', 'Safe in a page’s source. None yet.']],
    ['members', ['No one is on this organization’s roster yet.']],
    ['integrations', ['No GitHub accounts installed']],
    ['notifications', ['No webhooks yet.']],
  ]
  for (const [section, says] of empty) {
    await page.goto(`/-/settings/${section}`)
    for (const s of says) await expect(page.getByText(s, { exact: true }).first(), section).toBeVisible()
  }
  await page.goto('/-/settings/billing')
  await expect(page.getByText('Cancellation')).toHaveCount(0)
  await page.goto('/-/plans')
  await expect(page.getByText('This brand sells no plans.')).toBeVisible()
})

test('signed in to no organization, each section says so', async ({ page }) => {
  const p = await platform(page)
  await member(page, [])
  const says: [string, string][] = [
    ['account', 'You belong to no organization yet.'],
    ['members', 'Choose an organization to see its members.'],
    ['capabilities', 'What the agent may use in this organization. A tool that is off is refused when the agent calls it.'],
    ['billing', 'The plan this organization is on, the cards it pays with, and its invoices.'],
    ['usage', 'What this organization has used, has left, and may spend.'],
    ['integrations', 'What this organization and you have connected.'],
    ['notifications', 'Webhooks: events in this organization, POSTed and signed to an address you run.'],
  ]
  for (const [section, line] of says) {
    await page.goto(`/-/settings/${section}`)
    await expect(page.getByText(line, { exact: true }), section).toBeVisible()
  }
  await page.goto('/-/settings/account')
  await expect(page.getByText('Organization ID', { exact: false })).toHaveCount(0)
  await page.goto('/-/plans')
  await expect(page.getByText('This organization is on Max.')).toBeVisible()
  p.w.subs = []
  await page.reload()
  await expect(page.getByText('This organization is on the free plan.')).toBeVisible()
})

test('a member reads every admin’s control as it stands, and changes none of them', async ({ page }) => {
  const p = await platform(page, (w) => {
    w.tools = [
      { name: 'slack_post', source: 'connector', activated: true },
      { name: 'fn', source: 'function', activated: true },
      { name: 'fn2', source: 'function', activated: false },
      { name: 'review', source: 'skill', activated: false },
    ]
    w.subs = [{ ...SUB, cancelAtPeriodEnd: true }]
    w.caps = [{ id: 'al_1', title: 'Monthly limit', threshold: 50000, enforce: true, project: '', service: '', periodSpentCents: 100 }]
  })
  await member(page)
  await page.goto('/-/settings/capabilities')
  await expect(page.getByText('An org admin switches these, for everyone in the organization.')).toBeVisible()
  await expect(page.getByText('On', { exact: true })).toBeVisible()
  await expect(page.getByText('Partly on', { exact: true })).toBeVisible()
  await expect(page.getByText('Off', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)

  await page.goto('/-/settings/environments')
  await expect(page.getByText('An org admin saves an environment and sets its secrets.')).toBeVisible()
  await page.getByRole('button', { name: 'Open universe' }).click()
  await expect(page.getByRole('button', { name: 'All environments' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Forget', exact: true })).toHaveCount(0)

  await page.goto('/-/settings/notifications')
  await expect(page.getByText('https://acme.test/hooks/orders')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Send a test to / })).toHaveCount(0)
  await page.getByRole('button', { name: 'Deliveries to https://acme.test/hooks/orders' }).click()
  await expect(page.getByText('webhook.test → 200')).toBeVisible()

  await page.goto('/-/settings/billing')
  await expect(page.getByText('Your plan ends on Oct 27, 2026')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep plan' })).toHaveCount(0)
  await page.goto('/-/settings/usage')
  await expect(page.getByText('$1 spent', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)
  await page.goto('/-/settings/integrations')
  await expect(page.getByText('Acme HQ')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(1)
  await page.goto('/-/plans')
  await expect(page.getByLabel('Free plan', { exact: true }).getByText('An org admin changes the plan.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Switch to / })).toHaveCount(0)
  await page.goto('/-/settings/members')
  await expect(page.getByText('An org admin invites people and sees the open invitations.')).toBeVisible()
  await expect(page.getByLabel('Email to invite')).toHaveCount(0)
  await expect(page.getByText('erin@acme.test')).toHaveCount(0)
  expect(p.sent.some((s) => s.path === '/v1/iam/invitations')).toBe(false)
  await page.goto('/-/settings/account')
  await expect(page.getByText('Organization ID', { exact: true })).toBeVisible()
  await expect(page.getByText('Acting in acme', { exact: true })).toBeVisible()
  expect(p.writes()).toEqual([])
})

// ── another host ────────────────────────────────────────────────────────────

test('under a host that keeps its own theme, sign-in and organizations, Settings offers none of them', async ({ page }) => {
  const dave = { name: 'Dave', email: 'dave@acme.test', avatar: '' }
  await platform(page)
  await mounted(page, { path: '-/settings/general', org: ORG, admin: true, person: dave })
  await expect(page.getByRole('button', { name: 'Text size: Medium' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Theme: / })).toHaveCount(0)
  await page.getByRole('button', { name: 'Account', exact: true }).first().click()
  await expect(page.getByText('Your Hanzo identity, and what Hanzo should know about you.')).toBeVisible()
  expect(await went(page)).toEqual(['-/settings/account'])
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  await expect(page.getByText('Acting in acme as an admin')).toBeVisible()

  await mounted(page, { path: '-/settings/account', org: ORG, admin: false, person: dave, memberships: [ORG, 'beta'] })
  await expect(page.getByText('beta', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Switch' })).toHaveCount(0)

  await mounted(page, { path: '-/settings/account', org: null, admin: false, person: dave })
  await expect(page.getByText('You belong to no organization yet.')).toBeVisible()

  await mounted(page, { path: '-/settings/account', org: null, admin: false, person: null })
  await expect(page.getByText('Sign in to see your account.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0)
})

