/**
 * Money and the organization — Billing, Usage, Plans, Members, Integrations and
 * Notifications — signed in as an org admin against a stubbed platform
 * (signed.ts), and once as a plain member. The processor's card field is a
 * stand-in served at its own address, so no card number is ever typed here.
 */
import { expect, test, type Page } from '@playwright/test'

import { ORG, signIn, type Sent } from './signed.ts'

const PERIOD_END = '2026-10-27T00:00:00Z'
const CARD = { id: 'pm_1', type: 'card', isDefault: true, card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 } }
const PLANS = [
  { slug: 'free', name: 'Free', category: 'personal', price: 0, features: ['The free models'] },
  { slug: 'dev', name: 'Dev', category: 'personal', description: 'Pair programming in your own shell.', price: 1900, priceAnnual: 1558, features: ['Hanzo Dev', 'Unlimited local context'] },
  { slug: 'max', name: 'Max', category: 'personal', price: 10000, priceAnnual: 8118, popular: true, features: ['Enso orchestration', 'Unlimited managed agents'] },
  { slug: 'enterprise', name: 'Enterprise', category: 'enterprise', contactSales: true, features: ['Dedicated compute'] },
  { slug: 'dns-pro', name: 'DNS Pro', category: 'dns', price: 500 },
]
const INVOICE = {
  id: 'inv_1',
  numberStr: 'INV-0042',
  status: 'paid',
  createdAt: '2026-09-01T00:00:00Z',
  periodStart: '2026-09-01T00:00:00Z',
  periodEnd: '2026-10-01T00:00:00Z',
  subtotal: 10000,
  tax: 0,
  discount: 0,
  amountPaid: 10000,
  amountDue: 0,
  currency: 'usd',
  lineItems: [{ description: 'Max — September', amount: 10000 }],
}
const SQUARE = `window.Square = { payments: () => ({ card: async () => ({
  attach: async (el) => { const i = document.createElement('input'); i.setAttribute('aria-label', 'Card number'); el.appendChild(i) },
  tokenize: async () => ({ status: 'OK', token: 'cnon:test' }),
  destroy: async () => {},
}) }) }`

/** The platform one org sees: a plan (or none), cards, invoices, caps, people, connectors and webhooks. */
async function platform(page: Page, o: { paid?: boolean; cards?: boolean } = {}) {
  const sub = {
    id: 'sub_1',
    planId: 'max',
    status: 'active',
    quantity: 1,
    currentPeriodEnd: PERIOD_END,
    cancelAtPeriodEnd: false,
    plan: { id: 'max', name: 'Max', price: 10000, interval: 'month', currency: 'usd' },
  }
  const state = {
    subs: o.paid === false ? [] : [sub],
    cards: o.cards === false ? [] : [CARD],
    caps: [] as Record<string, unknown>[],
    invitations: [{ owner: ORG, name: 'invite-erin-a1b2c3', email: 'erin@acme.test', code: 'c0dec0dec0dec0de', quota: 1, usedCount: 0, state: 'Active', createdTime: '2026-09-20T00:00:00Z' }],
    hooks: [{ id: 'wh_1', url: 'https://acme.test/hooks/orders', events: ['commerce.order.>'], description: 'orders', status: 'active', deliveries7d: 12, failures7d: 1 }],
    slack: true,
  }
  const sent = await signIn(page, ({ method, path, body }) => {
    const b = (body ?? {}) as Record<string, unknown>
    switch (`${method} ${path}`) {
      case 'GET /v1/billing/subscriptions':
        return { json: { count: state.subs.length, subscriptions: state.subs } }
      case 'POST /v1/billing/subscriptions/sub_1/cancel':
        sub.cancelAtPeriodEnd = true
        return { json: sub }
      case 'POST /v1/billing/subscriptions/sub_1/reactivate':
        sub.cancelAtPeriodEnd = false
        return { json: sub }
      case 'POST /v1/billing/subscribe/card':
        state.subs = [{ ...sub, planId: String(b.planId), plan: { ...sub.plan, id: String(b.planId), name: 'Max', price: 97416, interval: String(b.interval) } }]
        return { status: 201, json: { subscriptionId: 'sub_2', planId: b.planId, amountCents: 97416, interval: b.interval, status: 'ok' } }
      case 'GET /v1/billing/plans':
        return { json: PLANS }
      case 'GET /v1/billing/methods':
        return { json: state.cards }
      case 'POST /v1/billing/methods':
        state.cards = [{ id: 'pm_2', type: 'card', isDefault: false, card: { brand: 'mastercard', last4: '4444', expMonth: 3, expYear: 2029 } }, ...state.cards]
        return { status: 201, json: state.cards[0] }
      case 'DELETE /v1/billing/methods/pm_1':
        state.cards = state.cards.filter((c) => c.id !== 'pm_1')
        return { json: { deleted: true, id: 'pm_1' } }
      case 'GET /v1/billing/settings':
        return { json: { provider: 'square', applicationId: 'sandbox-sq0idb-test', locationId: 'L1', environment: 'sandbox', live: false } }
      case 'GET /v1/billing/invoices':
        return { json: { count: 1, invoices: [INVOICE] } }
      case 'GET /v1/billing/invoices/inv_1/pdf':
        return { text: '%PDF-1.4 invoice', type: 'application/pdf' }
      case 'GET /v1/billing/balance':
        return { json: { balance: 4200, holds: 0, available: 4200, account: ORG } }
      case 'GET /v1/billing/credit-balance':
        return { json: { userId: ORG, balances: [{ currency: 'usd', available: 1500 }] } }
      case 'POST /v1/billing/topup':
        return { json: { status: 'ok', balanceCents: 6700, transactionId: 'tx_1' } }
      case 'GET /v1/billing/usage/rollup':
        return {
          json: {
            plan: 'max',
            period: '2026-09',
            included: { monthlyCents: 10000, consumedCents: 3000 },
            windows: [
              { span: 'day', limit: 2500, used: 1800, resets: '2026-09-28T00:00:00Z' },
              { span: 'week', limit: 12000, used: 3000, resets: '2026-10-05T00:00:00Z' },
              { span: 'month', limit: 0, used: 9000 },
            ],
          },
        }
      case 'GET /v1/usage/summary':
        return { json: { spend: { available: true, mtdCents: 5250, byCategory: [{ category: 'LLM', cents: 4000 }, { category: 'Compute', cents: 1000 }, { category: 'Storage', cents: 250 }] } } }
      case 'GET /v1/billing/alerts':
        return { json: state.caps }
      case 'POST /v1/billing/alerts':
        state.caps = [{ id: 'al_1', title: b.title, threshold: b.threshold, enforce: b.enforce, project: '', service: '', periodSpentCents: 5250, resetsAt: '2026-10-01T00:00:00Z' }]
        return { status: 201, json: state.caps[0] }
      case 'PATCH /v1/billing/alerts/al_1':
        state.caps = [{ ...state.caps[0], threshold: b.threshold }]
        return { json: state.caps[0] }
      case 'GET /v1/provider/github/user':
        return { json: { configured: true, connected: true, login: 'dave-gh', connectedAt: '2026-09-01T00:00:00Z' } }
      case 'GET /v1/provider/github/installations':
        return { json: { installUrl: 'https://github.com/apps/hanzo/installations/new', installations: [{ login: 'acme', type: 'Organization', grant: 'all', connected: true }] } }
      case 'POST /v1/provider/github/connect':
        return { json: { authorizeUrl: 'https://github.com/apps/hanzo/installations/new?state=signed' } }
      case 'GET /v1/provider/slack':
        return { json: { id: 'slack', name: 'Slack', available: true, connected: state.slack, connection: state.slack ? { account: 'Acme HQ', connectedAt: '2026-09-02T00:00:00Z' } : undefined } }
      case 'POST /v1/provider/slack/disconnect':
        state.slack = false
        return { json: { disconnected: true } }
      case 'POST /v1/provider/slack/connect':
        return { json: { authorizeUrl: 'https://slack.com/oauth/v2/authorize?client_id=1&state=signed' } }
      case 'GET /v1/provider/slack/channels':
        return { json: { channels: [{ id: 'C1', name: 'general', is_member: true }, { id: 'C2', name: 'deals', is_private: true, is_member: false }], next_cursor: '' } }
      case 'GET /v1/webhook':
        return { json: { data: state.hooks } }
      case 'POST /v1/webhook': {
        const hook = { id: 'wh_2', url: String(b.url), events: b.events as string[], description: String(b.description), status: 'active', deliveries7d: 0, failures7d: 0 }
        state.hooks = [hook, ...state.hooks]
        return { status: 201, json: { ...hook, secret: 'whsec_0123456789abcdef' } }
      }
      case 'POST /v1/webhook/wh_1/test':
        return { json: { delivered: true, httpStatus: 200, durationMs: 84 } }
      case 'GET /v1/webhook/wh_1/deliveries':
        return { json: { data: [{ subject: 'webhook.test', status: 'ok', httpStatus: 200, attempt: 1, created: '2026-09-27T00:00:00Z' }] } }
      case 'DELETE /v1/webhook/wh_1':
        state.hooks = state.hooks.filter((h) => h.id !== 'wh_1')
        return { status: 204, text: '' }
    }
    return undefined
  })
  // IAM is its own origin's business in signed.ts; the roster and invitations are answered here.
  await page.route(
    (u) => u.pathname === '/v1/iam/memberships' || u.pathname.startsWith('/v1/iam/invitations'),
    async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      const raw = req.postData()
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
      sent.push({ method: req.method(), path: url.pathname, query: url.search, body })
      if (url.pathname === '/v1/iam/memberships') {
        return r.fulfill({
          json: {
            status: 'ok',
            data: [
              { user: `${ORG}/dave`, org: ORG, role: 'owner', createdTime: '2026-08-01T00:00:00Z' },
              { user: 'hanzo/zed', org: ORG, role: 'member', createdTime: '2026-09-02T00:00:00Z' },
              { user: `${ORG}/amy`, org: ORG, role: 'admin' },
            ],
            data2: 3,
          },
        })
      }
      if (req.method() === 'POST') {
        state.invitations = [{ ...(body as (typeof state.invitations)[number]), createdTime: '2026-09-27T00:00:00Z' }, ...state.invitations]
        return r.fulfill({ json: state.invitations[0] })
      }
      if (req.method() === 'DELETE') {
        state.invitations = state.invitations.filter((i) => !url.pathname.endsWith(`/${i.name}`))
        return r.fulfill({ json: { deleted: true } })
      }
      return r.fulfill({ json: { invitations: state.invitations, total: state.invitations.length } })
    },
  )
  await page.route('https://sandbox.web.squarecdn.com/v1/square.js', (r) => r.fulfill({ contentType: 'application/javascript', body: SQUARE }))
  return sent
}

const find = (sent: Sent[], method: string, path: string) => sent.find((s) => s.method === method && s.path === path)

test('Billing shows the plan, the cards, the invoices, and cancels at the period end', async ({ page }, info) => {
  const sent = await platform(page)
  await page.goto('/-/settings/billing')
  await expect(page.getByText('Max plan')).toBeVisible()
  await expect(page.getByText('$100 a month. Renews on Oct 27, 2026.')).toBeVisible()
  await expect(page.getByText('Visa •••• 4242')).toBeVisible()
  await expect(page.getByText('Expires 12/27 · Default')).toBeVisible()
  await expect(page.getByText('Sep 1, 2026', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('billing.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('billing-390.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByRole('button', { name: 'View invoice INV-0042' }).click()
  const bill = page.getByRole('dialog')
  await expect(bill.getByText('Invoice INV-0042')).toBeVisible()
  await expect(bill.getByText('Max — September')).toBeVisible()
  const download = page.waitForEvent('download')
  await bill.getByRole('button', { name: 'Download PDF' }).click()
  expect((await download).suggestedFilename()).toBe('INV-0042.pdf')
  await page.screenshot({ path: info.outputPath('billing-invoice.png') })
  await bill.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel plan' }).click()
  await expect(page.getByText('Your plan ends on Oct 27, 2026')).toBeVisible()
  expect(find(sent, 'POST', '/v1/billing/subscriptions/sub_1/cancel')?.body).toEqual({ atPeriodEnd: true })
  await page.getByRole('button', { name: 'Keep plan' }).click()
  await expect(page.getByText('Your plan renews as before')).toBeVisible()

  await page.getByRole('button', { name: 'Remove Visa •••• 4242' }).click()
  await expect(page.getByText('No card on file.')).toBeVisible()
  expect(find(sent, 'DELETE', '/v1/billing/methods/pm_1')).toBeTruthy()

  await page.getByRole('button', { name: 'Adjust plan' }).click()
  await expect(page).toHaveURL(/\/-\/plans$/)
})

test('a card is added through the processor’s own field, and only its token is sent', async ({ page }, info) => {
  const sent = await platform(page, { cards: false })
  await page.goto('/-/settings/billing')
  await page.getByRole('button', { name: 'Add card' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Card number')).toBeVisible()
  await expect(dialog.getByText('Sandbox: use a test card. Nothing is charged.')).toBeVisible()
  await page.screenshot({ path: info.outputPath('billing-card.png') })
  await dialog.getByRole('button', { name: 'Save card' }).click()
  await expect(page.getByText('Mastercard •••• 4444 is saved')).toBeVisible()
  expect(find(sent, 'POST', '/v1/billing/methods')?.body).toEqual({ type: 'card', providerRef: 'cnon:test' })
})

test('Plans marks the current plan and upgrades with the saved card, yearly', async ({ page }, info) => {
  const sent = await platform(page, { paid: false })
  await page.goto('/-/plans')
  await expect(page.getByText('Plans that grow with you')).toBeVisible()
  const free = page.getByLabel('Free plan', { exact: true })
  await expect(free.getByRole('button', { name: 'Current plan' })).toBeDisabled()
  await expect(page.getByLabel('DNS Pro plan')).toHaveCount(0)
  await expect(page.getByLabel('Enterprise plan').getByText('Priced with our team for your organization.')).toBeVisible()
  const max = page.getByLabel('Max plan', { exact: true })
  await expect(max.getByText('$100', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('plans.png'), fullPage: true })

  await page.getByRole('radio', { name: 'Yearly' }).click()
  await expect(max.getByText('$81.18', { exact: true })).toBeVisible()
  await expect(max.getByText('a month, $974.16 billed yearly')).toBeVisible()
  await max.getByRole('button', { name: 'Upgrade to Max' }).click()
  await expect(page.getByRole('dialog').getByText('Visa •••• 4242 is charged $974.16 now, and again every year until you cancel.')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Upgrade', exact: true }).click()
  await expect(page.getByText(`${ORG} is on Max`, { exact: true })).toBeVisible()
  expect(find(sent, 'POST', '/v1/billing/subscribe/card')?.body).toEqual({ planId: 'max', paymentMethodId: 'pm_1', interval: 'year' })
  await expect(max.getByRole('button', { name: 'Current plan' })).toBeVisible()
  await expect(page.getByLabel('Dev plan').getByText('One paid plan at a time: Max ends before Dev begins.')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('plans-390.png'), fullPage: true })
  await page.getByRole('button', { name: 'Back to billing' }).click()
  await expect(page).toHaveURL(/\/-\/settings\/billing$/)
})

test('Usage shows the limits, the balance and the month, buys more and sets a monthly limit', async ({ page }, info) => {
  const sent = await platform(page)
  await page.goto('/-/settings/usage')
  await expect(page.getByText('Today · 1,800 of 2,500 requests')).toBeVisible()
  await expect(page.getByText('This week · 3,000 of 12,000 requests')).toBeVisible()
  await expect(page.getByText('$30 of $100')).toBeVisible()
  await expect(page.getByText('$42', { exact: true })).toBeVisible()
  await expect(page.getByText('$15', { exact: true })).toBeVisible()
  await expect(page.getByText('$52.50', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('LLM', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(6)
  await page.screenshot({ path: info.outputPath('usage.png'), fullPage: true })

  await page.getByRole('button', { name: 'Buy more' }).click()
  await expect(page.getByText('Charged to Visa •••• 4242')).toBeVisible()
  await page.getByLabel('Amount in dollars').fill('25')
  await page.getByRole('button', { name: 'Add $25' }).click()
  await expect(page.getByText('$25 is added to the balance')).toBeVisible()
  expect(find(sent, 'POST', '/v1/billing/topup')?.body).toEqual({ amountCents: 2500, paymentMethodId: 'pm_1' })

  await expect(page.getByText('No monthly limit')).toBeVisible()
  await page.getByLabel('Monthly limit in dollars').fill('500')
  await page.getByRole('button', { name: 'Set limit' }).click()
  await expect(page.getByText('$500 a month', { exact: true })).toBeVisible()
  expect(find(sent, 'POST', '/v1/billing/alerts')?.body).toMatchObject({ threshold: 50000, enforce: true, project: '', service: '' })
  await page.getByLabel('Monthly limit in dollars').fill('800')
  await page.getByRole('button', { name: 'Change limit' }).click()
  await expect(page.getByText('$800 a month', { exact: true })).toBeVisible()
  expect(find(sent, 'PATCH', '/v1/billing/alerts/al_1')?.body).toEqual({ threshold: 80000 })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('usage-390.png'), fullPage: true })
})

test('Members lists the roster by role, invites by email and revokes', async ({ page }, info) => {
  const sent = await platform(page)
  await page.goto('/-/settings/members')
  await expect(page.getByText(`${ORG}/dave · since Aug 1, 2026`)).toBeVisible()
  await expect(page.getByText('Owner', { exact: true })).toBeVisible()
  await expect(page.getByText('Admin', { exact: true })).toBeVisible()
  await expect(page.getByText('erin@acme.test')).toBeVisible()
  await page.screenshot({ path: info.outputPath('members.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('members-390.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByLabel('Email to invite').fill('Amy.Lee@acme.test')
  await page.getByRole('button', { name: 'Invite' }).click()
  await expect(page.getByText('Amy.Lee@acme.test is invited. IAM sends no email: share the code with them.')).toBeVisible()
  const made = find(sent, 'POST', '/v1/iam/invitations')?.body as Record<string, unknown>
  expect(made).toMatchObject({ owner: ORG, email: 'amy.lee@acme.test', quota: 1, state: 'Active' })
  await expect(page.getByText('amy.lee@acme.test', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Revoke the invitation for erin@acme.test' }).click()
  await expect(page.getByText('erin@acme.test')).toHaveCount(0)
  expect(find(sent, 'DELETE', `/v1/iam/invitations/${ORG}/invite-erin-a1b2c3`)).toBeTruthy()
  expect(find(sent, 'GET', '/v1/iam/memberships')?.query).toBe(`?org=${ORG}`)
})

test('Integrations shows GitHub and Slack, disconnects Slack and installs the App through GitHub', async ({ page }, info) => {
  const sent = await platform(page)
  await page.route('https://github.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>GitHub</title>Install' }))
  await page.goto('/-/settings/integrations')
  await expect(page.getByText('Connected as @dave-gh')).toBeVisible()
  await expect(page.getByText('Organization · every repository')).toBeVisible()
  await expect(page.getByText('Acme HQ')).toBeVisible()
  await expect(page.getByText('general', { exact: true })).toBeVisible()
  await expect(page.getByText('Not joined')).toBeVisible()
  await page.screenshot({ path: info.outputPath('integrations.png'), fullPage: true })

  await page.getByRole('button', { name: 'Disconnect', exact: true }).nth(1).click()
  await expect(page.getByText('Slack is disconnected')).toBeVisible()
  expect(find(sent, 'POST', '/v1/provider/slack/disconnect')).toBeTruthy()
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(1)

  await page.getByRole('button', { name: 'Install on a GitHub account' }).click()
  await expect(page).toHaveURL('https://github.com/apps/hanzo/installations/new?state=signed')
})

test('Notifications adds a webhook, shows its secret once, tests it, reads its log and deletes it', async ({ page }, info) => {
  const sent = await platform(page)
  await page.goto('/-/settings/notifications')
  await expect(page.getByText('https://acme.test/hooks/orders')).toBeVisible()
  await expect(page.getByText('orders · commerce.order.> · 12 delivered, 1 failed this week')).toBeVisible()

  await page.getByRole('button', { name: 'Add webhook' }).click()
  await page.getByLabel('Endpoint URL').fill('http://acme.test/new')
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await expect(page.getByText('A webhook is delivered over https only')).toBeVisible()
  await page.getByLabel('Endpoint URL').fill('https://acme.test/new')
  await page.getByLabel('Events').fill('event.>, commerce.order.paid')
  await page.getByLabel('Description', { exact: true }).fill('everything')
  await page.getByRole('button', { name: 'Add webhook' }).click()
  await expect(page.getByLabel('Signing secret')).toHaveText('whsec_0123456789abcdef')
  expect(find(sent, 'POST', '/v1/webhook')?.body).toEqual({ url: 'https://acme.test/new', events: ['event.>', 'commerce.order.paid'], description: 'everything' })
  await page.screenshot({ path: info.outputPath('notifications.png'), fullPage: true })

  await page.getByRole('button', { name: 'Send a test to https://acme.test/hooks/orders' }).click()
  await expect(page.getByText('The test reached https://acme.test/hooks/orders: 200 in 84 ms')).toBeVisible()
  await page.getByRole('button', { name: 'Deliveries to https://acme.test/hooks/orders' }).click()
  await expect(page.getByText('webhook.test → 200')).toBeVisible()
  await page.getByRole('button', { name: 'Delete https://acme.test/hooks/orders' }).click()
  await expect(page.getByText('https://acme.test/hooks/orders is deleted')).toBeVisible()
  expect(find(sent, 'DELETE', '/v1/webhook/wh_1')).toBeTruthy()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('notifications-390.png'), fullPage: true })
})

test('a member reads the limits, the roster and the connectors, and changes none of the admin’s', async ({ page }, info) => {
  await platform(page)
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const member = [b64({ alg: 'none' }), b64({ sub: `${ORG}/zed`, email: 'zed@acme.test', orgs: [{ org: ORG, role: 'member' }] }), 'x'].join('.')
  await page.addInitScript((t) => localStorage.setItem('hanzo_iam_access_token', t), member)

  await page.goto('/-/settings/usage')
  await expect(page.getByText('An org admin sets the monthly limit.')).toBeVisible()
  await expect(page.getByLabel('Monthly limit in dollars')).toHaveCount(0)
  await page.goto('/-/settings/members')
  await expect(page.getByText('An org admin invites people and sees the open invitations.')).toBeVisible()
  await expect(page.getByLabel('Email to invite')).toHaveCount(0)
  await page.goto('/-/settings/integrations')
  await expect(page.getByText('An org admin connects the Slack workspace.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install on a GitHub account' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('integrations-member-390.png'), fullPage: true })
})

test('a visitor sees the plans and is asked to sign in to choose one', async ({ page }) => {
  await page.route((u) => u.pathname === '/v1/billing/plans', (r) => r.fulfill({ json: PLANS }))
  await page.goto('/-/plans')
  await expect(page.getByText('Sign in to see the plan you are on.')).toBeVisible()
  await expect(page.getByLabel('Max plan', { exact: true }).getByText('Sign in to choose a plan.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Current plan' })).toHaveCount(0)
})
