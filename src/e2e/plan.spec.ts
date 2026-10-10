/**
 * The plan, wherever it is shown: the account menu leads with it, Usage draws
 * its windows and the choice of what happens when it runs out, and Billing
 * holds the credits. Five accounts, each answered in the shapes cloud writes
 * (apps/ai/limits_ops.go `view`, apps/billing `Tier`, apps/allowance), at a
 * laptop and a phone:
 *
 *   Free           the free allowance left today, and Upgrade
 *   Pro            its windows, shares only
 *   Max 20x        its windows, shares only, and no credit anywhere in the menu
 *   Pay as you go  no plan and money in the balance: the balance is the meter
 *   Max, used up   with credit: Continue with credits; without: Add credits and Upgrade
 */
import type { Page } from '@playwright/test'

import { expect as plain, test } from './fixture.ts'
import { signIn, type Sent } from './signed.ts'

const START = '2026-10-01T00:00:00Z'
const END = '2026-11-01T00:00:00Z'
const PAY = 'https://hanzo.ai/pay'
const SOON = () => new Date(Date.now() + 3 * 3_600_000).toISOString()
const DAY = () => new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString()

type Row = Record<string, unknown>

/** GET /v1/billing/tier: the rung, its class, and commerce's balance block. */
const tier = (plan: string, name: string, cents = 0): Row => ({
  user: 'acme/dave',
  ...(plan ? { plan, subscription: 'sub_1' } : {}),
  tier: { name, displayName: name[0]!.toUpperCase() + name.slice(1), maxAgents: 8, dailyCreditsCents: 0, allowedModels: ['*'], unlimitedAgents: false },
  balance: { currency: 'usd', prepaidAvailable: cents, creditsRemaining: 0, dailyRemaining: 0, effectiveAvailable: cents },
})

const cls = (percent: number, state: string, paying = state === 'limited' ? 'none' : 'plan', window?: Row): Row => ({
  percent,
  state,
  paying,
  resets_at: END,
  ...(window ? { window } : {}),
})

/** GET /v1/ai/limits for a counted plan. */
const plan = (slug: string, o: { premium?: Row; ours?: Row; upgrade?: string; credits?: boolean; funded?: boolean } = {}): Row => {
  const premium = o.premium ?? cls(35, 'ok', 'plan', { percent: 20, state: 'ok', resets_at: SOON() })
  const ours = o.ours ?? cls(12, 'ok')
  const limited = [['premium', premium], ['ours', ours]].filter(([, c]) => (c as Row).state === 'limited').map(([n]) => n)
  const actions: Row[] = []
  if (o.upgrade) actions.push({ kind: 'upgrade', label: `Upgrade to ${o.upgrade === 'max-5x' ? 'Max 5x' : 'Max 20x'}`, plan: o.upgrade, url: `${PAY}/cart?plan=${o.upgrade}` })
  if (limited.length && !o.credits && o.funded) actions.push({ kind: 'credits', label: 'Continue with credits', url: '/v1/ai/limits' })
  actions.push({ kind: 'topup', label: 'Add prepaid credit', url: PAY })
  return {
    plan: slug,
    period_start: START,
    period_end: END,
    state: limited.length ? 'limited' : 'ok',
    classes: { premium, ours },
    session: { percent: 40, state: 'ok', resets_at: SOON() },
    day: { percent: 15, state: 'ok', resets_at: DAY() },
    ...(limited.length
      ? {
          limited: {
            reason: 'plan_allowance_used',
            classes: limited,
            message: "Your plan's included usage is used for now. Chat continues on the free model; continue with credits, add prepaid credit or upgrade to keep using these models.",
          },
        }
      : {}),
    actions,
    ...(o.upgrade ? { upgrade: o.upgrade } : {}),
    credits_after_allowance: o.credits ?? false,
  }
}

/** GET /v1/ai/limits with no plan counted. */
const FREE_LIMITS: Row = {
  plan: 'free',
  state: 'ok',
  classes: {},
  actions: [
    { kind: 'upgrade', label: 'Upgrade to Pro', plan: 'dev', url: `${PAY}/cart?plan=dev` },
    { kind: 'topup', label: 'Add prepaid credit', url: PAY },
  ],
  upgrade: 'dev',
  credits_after_allowance: false,
}

/** GET /v1/allowance: bounded and pooled on Free, unbounded on a plan. */
const pooled = (used: number): Row => ({ plan: 'free', limit: 20, used, spent: used >= 20, window: 'day', resets: Math.floor(Date.parse(DAY()) / 1000), pooled: true, pool: { state: 'available' } })
const UNBOUNDED: Row = { plan: 'max-20x', limit: 0, used: 0, spent: false, resets: 0, pooled: false }

interface Account {
  name: string
  tier: Row
  limits: Row
  allowance: Row
  /** Prepaid cents, as GET /v1/billing/balance answers `available`. */
  cents: number
}

const ACCOUNTS: Account[] = [
  { name: 'free', tier: tier('', 'free'), limits: FREE_LIMITS, allowance: pooled(8), cents: 0 },
  { name: 'pro', tier: tier('dev', 'pro'), limits: plan('dev', { upgrade: 'max-5x' }), allowance: UNBOUNDED, cents: 0 },
  { name: 'max', tier: tier('max-20x', 'pro', 4210), limits: plan('max-20x', { premium: cls(62, 'ok') }), allowance: UNBOUNDED, cents: 4210 },
  { name: 'credits', tier: tier('', 'free', 4210), limits: FREE_LIMITS, allowance: pooled(0), cents: 4210 },
]

/** The platform for one account; a PUT to the limits changes what the next read answers. */
async function platform(page: Page, a: Account): Promise<{ sent: Sent[]; limits: () => Row }> {
  let limits = structuredClone(a.limits)
  const sent = await signIn(page, ({ method, path, body }) => {
    if (path === '/v1/billing/tier') return { json: a.tier }
    if (path === '/v1/billing/balance') return { json: { balance: a.cents, holds: 0, available: a.cents, account: 'acme' } }
    if (path === '/v1/allowance') return { json: a.allowance }
    if (path === '/v1/ai/limits' && method === 'PUT') {
      const on = (body as { creditsAfterAllowance?: boolean }).creditsAfterAllowance === true
      const used = Object.values((limits.classes ?? {}) as Record<string, Row>).some((c) => c.state === 'limited')
      limits = {
        ...limits,
        credits_after_allowance: on,
        // Turned on with a class used up, credits pay for it: the class reads near and nothing is limited.
        ...(on && used
          ? {
              state: 'near',
              classes: Object.fromEntries(Object.entries(limits.classes as Record<string, Row>).map(([k, c]) => [k, c.state === 'limited' ? { ...c, state: 'near', paying: 'credits' } : c])),
              limited: undefined,
              actions: (limits.actions as Row[]).filter((x) => x.kind !== 'credits'),
            }
          : {}),
      }
      return { json: limits }
    }
    if (path === '/v1/ai/limits') return { json: limits }
    if (path === '/v1/billing/credit-balance') return { json: { userId: 'acme', balances: [{ currency: 'usd', available: 500 }] } }
    if (path === '/v1/billing/credits')
      return { json: { count: 1, grants: [{ id: 'cg_1', name: 'Welcome credit', amountCents: 1000, remainingCents: 500, currency: 'usd', active: true, voided: false, expiresAt: '2027-01-01T00:00:00Z' }] } }
    if (path === '/v1/billing/recharge') return { json: { subject: 'acme', enabled: false, thresholdCents: 0, amountCents: 0, currency: 'usd', stored: false } }
    if (path === '/v1/billing/subscriptions')
      return {
        json: {
          count: 1,
          subscriptions: a.tier.plan
            ? [{ id: 'sub_1', planId: a.tier.plan, status: 'active', quantity: 1, currentPeriodEnd: END, cancelAtPeriodEnd: false, plan: { id: a.tier.plan, name: a.tier.plan === 'dev' ? 'Pro' : 'Max 20x', price: a.tier.plan === 'dev' ? 2000 : 20000, interval: 'month', currency: 'usd' } }]
            : [],
        },
      }
    if (path === '/v1/billing/methods') return { json: [{ id: 'pm_1', type: 'card', isDefault: true, card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 } }] }
    if (path === '/v1/billing/invoices') return { json: { count: 0, invoices: [] } }
    if (path === '/v1/billing/alerts') return { json: [] }
    if (path === '/v1/usage/summary') return { json: { spend: { available: true, mtdCents: 1830, byCategory: [{ category: 'Models', cents: 1830 }] } } }
    return undefined
  })
  return { sent, limits: () => limits }
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

/** Opens the account menu from the rail, or from the drawer on a phone. */
async function menu(page: Page, phone: boolean) {
  if (phone) await page.getByLabel('Open runs').click()
  await page.getByRole('button', { name: 'Account: Dave · acme' }).last().click()
  const m = page.getByRole('menu', { name: 'Account' })
  await expect(m).toBeVisible()
  return m
}

/** A page that reads five things before it draws, on a dev server shared with other work: twenty seconds to answer. */
const expect = plain.configure({ timeout: 20_000 })

/** No dollar figure anywhere in `text`. */
const MONEY = /\$\s?\d/

for (const size of SIZES) {
  const phone = size.width < 768
  test.describe(`at ${size.width}px`, () => {
    test.use({ viewport: size })
    test.describe.configure({ timeout: 120_000 })

    for (const a of ACCOUNTS.filter((x) => x.name === 'pro' || x.name === 'max')) {
      test(`the account menu on ${a.name === 'max' ? 'Max 20x' : 'Pro'} leads with the plan and its windows, never a balance`, async ({ page }, info) => {
        await platform(page, a)
        await page.goto('/')
        const m = await menu(page, phone)
        const meter = m.locator('[data-slot="meter"]')
        await expect(meter).toHaveAttribute('data-kind', 'plan')
        await expect(meter.locator('[data-slot="plan-name"]')).toContainText(a.name === 'max' ? 'Max' : 'Pro')
        if (a.name === 'max') await expect(meter.locator('[data-slot="plan-tag"]')).toHaveText('20x')
        else await expect(meter.locator('[data-slot="plan-tag"]')).toHaveCount(0)
        await expect(meter.locator('[data-slot="meter-window"]')).toHaveCount(3)
        await expect(meter.locator('[data-slot="meter-window"]').first()).toContainText('Session')
        await expect(meter.locator('[data-slot="meter-window"]').first()).toContainText('40%')
        await expect(meter.locator('[data-slot="meter-window"]').last()).toContainText('Resets Nov 1')
        expect(await m.innerText(), 'no money in the menu of a plan').not.toMatch(MONEY)
        expect(await m.innerText()).not.toMatch(/max-20x|credits/i)
        await page.screenshot({ path: info.outputPath(`menu-${a.name}-${size.width}.png`) })
      })
    }

    test('the account menu on Free says what is left today and offers Upgrade', async ({ page }, info) => {
      await platform(page, ACCOUNTS[0]!)
      await page.goto('/')
      const m = await menu(page, phone)
      const meter = m.locator('[data-slot="meter"]')
      await expect(meter).toHaveAttribute('data-kind', 'free')
      await expect(meter.locator('[data-slot="plan-name"]')).toHaveText('Free')
      await expect(meter.locator('[data-slot="meter-free"]')).toContainText('60% of today’s free usage left')
      expect(await m.innerText()).not.toMatch(MONEY)
      await page.screenshot({ path: info.outputPath(`menu-free-${size.width}.png`) })
      await meter.getByRole('button', { name: 'Upgrade' }).click()
      await expect(page).toHaveURL(/\/-\/plans$/)
    })

    test('the account menu with credits and no plan shows the balance, its meter', async ({ page }, info) => {
      await platform(page, ACCOUNTS[3]!)
      await page.goto('/')
      const m = await menu(page, phone)
      const meter = m.locator('[data-slot="meter"]')
      await expect(meter).toHaveAttribute('data-kind', 'credits')
      await expect(meter.locator('[data-slot="plan-name"]')).toHaveText('Pay as you go')
      await expect(meter.locator('[data-slot="meter-balance"]')).toHaveText('$42.10 in credits')
      await page.screenshot({ path: info.outputPath(`menu-credits-${size.width}.png`) })
      await meter.getByRole('button', { name: 'Add funds' }).click()
      await expect(page).toHaveURL(/\/-\/settings\/billing$/)
    })

    test('Usage on Max draws the windows as shares, and the credits choice is visible and reversible', async ({ page }, info) => {
      const p = await platform(page, ACCOUNTS[2]!)
      await page.goto('/-/settings/usage')
      const view = page.locator('[data-slot="plan-usage"]')
      await expect(view).toHaveAttribute('data-kind', 'plan')
      await expect(view.locator('[data-slot="plan-tag"]')).toHaveText('20x')
      await expect(view.getByText('Current period Oct 1, 2026 – Nov 1, 2026')).toBeVisible()
      for (const t of ['Session', 'Today', 'Premium models', 'Hanzo models']) await expect(view.getByText(t, { exact: true })).toBeVisible()
      expect(await view.innerText(), 'shares, never money').not.toMatch(MONEY)
      const choice = view.getByRole('switch', { name: 'Use credits when my plan’s allowance runs out' })
      await expect(choice).not.toBeChecked()
      await expect(view.getByText(/^Off\. Chat continues on a free model/)).toBeVisible()
      await page.screenshot({ path: info.outputPath(`usage-max-${size.width}.png`), fullPage: true })
      await choice.click()
      await expect(choice).toBeChecked()
      await expect(view.getByText(/^On\. A model whose included usage is used keeps working, paid from credits/)).toBeVisible()
      await choice.click()
      await expect(choice).not.toBeChecked()
      expect(p.sent.filter((s) => s.method === 'PUT').map((s) => [s.path, s.body])).toEqual([
        ['/v1/ai/limits', { creditsAfterAllowance: true }],
        ['/v1/ai/limits', { creditsAfterAllowance: false }],
      ])
    })

    test('Usage on Free and with credits only', async ({ page }, info) => {
      await platform(page, ACCOUNTS[0]!)
      await page.goto('/-/settings/usage')
      let view = page.locator('[data-slot="plan-usage"]')
      await expect(view).toHaveAttribute('data-kind', 'free')
      await expect(view.getByText('60% left')).toBeVisible()
      await expect(view.getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`usage-free-${size.width}.png`), fullPage: true })
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await platform(page, ACCOUNTS[3]!)
      await page.goto('/-/settings/usage')
      view = page.locator('[data-slot="plan-usage"]')
      await expect(view).toHaveAttribute('data-kind', 'credits')
      await expect(view.locator('[data-slot="plan-balance"]')).toHaveText('$42.10')
      await page.screenshot({ path: info.outputPath(`usage-credits-${size.width}.png`), fullPage: true })
    })

    test('a used-up Max with credit offers Continue with credits, and taking it turns the choice on', async ({ page }, info) => {
      const used: Account = { ...ACCOUNTS[2]!, name: 'max-used', limits: plan('max-20x', { premium: cls(100, 'limited'), funded: true }) }
      const p = await platform(page, used)
      await page.goto('/-/settings/usage')
      const spent = page.locator('[data-slot="plan-spent"]')
      await expect(spent).toContainText('Your Max 20x plan’s included premium model usage is used until Nov 1.')
      await expect(spent.getByRole('button')).toHaveText(['Continue with credits'])
      await page.screenshot({ path: info.outputPath(`usage-max-used-credit-${size.width}.png`), fullPage: true })
      await spent.getByRole('button', { name: 'Continue with credits' }).click()
      await expect(spent).toHaveCount(0)
      await expect(page.getByRole('switch', { name: 'Use credits when my plan’s allowance runs out' })).toBeChecked()
      await expect(page.getByText('35% used · Paying from credits').or(page.getByText('100% used · Paying from credits'))).toBeVisible()
      expect(p.sent.filter((s) => s.method === 'PUT').map((s) => s.body)).toEqual([{ creditsAfterAllowance: true }])
    })

    test('a used-up Pro without credit offers Add credits and the upgrade', async ({ page }, info) => {
      const used: Account = { ...ACCOUNTS[1]!, name: 'pro-used', limits: plan('dev', { premium: cls(100, 'limited'), upgrade: 'max-5x', funded: false }) }
      await platform(page, used)
      await page.goto('/-/settings/usage')
      const spent = page.locator('[data-slot="plan-spent"]')
      await expect(spent).toContainText('Your Pro plan’s included premium model usage is used until Nov 1.')
      await expect(spent.getByRole('button')).toHaveText(['Add credits', 'Upgrade to Max 5x'])
      await page.screenshot({ path: info.outputPath(`usage-pro-used-${size.width}.png`), fullPage: true })
      await spent.getByRole('button', { name: 'Add credits' }).click()
      await expect(page).toHaveURL(/\/-\/settings\/billing$/)
    })

    test('Billing holds the credits, says they are separate from the plan, and names the plan by its family', async ({ page }, info) => {
      await platform(page, ACCOUNTS[2]!)
      await page.goto('/-/settings/billing')
      await expect(page.locator('[data-slot="billing-plan"] [data-slot="plan-name"]')).toContainText('Max')
      await expect(page.locator('[data-slot="billing-plan"] [data-slot="plan-tag"]')).toHaveText('20x')
      const credits = page.locator('[data-slot="credits"]')
      await expect(credits.getByText('Credits are separate from your plan’s usage allowance.', { exact: false })).toBeVisible()
      await expect(credits.getByText('$42.10')).toBeVisible()
      await expect(credits.getByText('Welcome credit')).toBeVisible()
      await expect(credits.getByRole('switch', { name: 'Auto-reload' })).not.toBeChecked()
      await expect(credits.getByText('Monthly limit', { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`billing-max-${size.width}.png`), fullPage: true })
    })
  })
}
