/**
 * The platform as the browser specs stub it, one surface to a function: each
 * signs the page in as an org admin (signed.ts), answers what that surface
 * reads, and keeps what it is sent so a write shows up on the next read the way
 * it would live. `visitor` is what the platform tells anyone signed out.
 *
 * A spec that drives a surface and screens.spec, which draws every screen,
 * share these, so a stub is written once.
 */
import type { Page } from '@playwright/test'

import { ORG, REPO, SESSION, serve, signIn, type Reply, type Sent } from './signed.ts'

// Customize: skills, connectors, plugins and agents.

export const CATALOGUE = {
  brand: 'hanzo',
  products: [
    { name: 'git', path: '_git/index.json', skill_count: 2 },
    { name: 'kms', path: '_kms/index.json', skill_count: 1 },
  ],
  skills: [
    { name: 'git_repos', description: 'List the forge’s repositories.', service: 'git', path: 'git_repos/SKILL.md' },
    { name: 'git_branches', description: 'List a repository’s branches.', service: 'git', path: 'git_branches/SKILL.md' },
    { name: 'kms_secrets', description: 'Read the names of an org’s secrets.', service: 'kms', path: 'kms_secrets/SKILL.md' },
  ],
}

export const LISTINGS = [
  {
    id: 'com.stripe_mcp',
    name: 'com.stripe/mcp',
    title: 'Stripe',
    description: 'Payments, customers and invoices.',
    vendor: 'com.stripe',
    featured: true,
    official: true,
    transports: ['streamable-http'],
    remotes: [{ transport: 'streamable-http', url: 'https://mcp.stripe.com' }],
    repo: 'https://github.com/stripe/agent-toolkit',
  },
  {
    id: 'io.linear_mcp',
    name: 'io.linear/mcp',
    title: 'Linear',
    description: 'Issues and projects.',
    vendor: 'io.linear',
    transports: ['streamable-http'],
    remotes: [{ transport: 'streamable-http', url: 'https://mcp.linear.app/mcp' }],
  },
  {
    id: 'io.local_files',
    name: 'io.local/files',
    title: 'Local files',
    description: 'Reads a disk. Ships as a package.',
    vendor: 'io.local',
    transports: ['stdio'],
    packages: [{ registry: 'npm', identifier: '@local/files-mcp', runtime: 'npx', transport: 'stdio' }],
  },
]

export const PRESETS = [
  { id: 'create', title: 'Product & Fashion Create', systemPrompt: 'You are Hanzo Create, a render assistant.', serverExecuted: true },
  { id: 'graph', title: 'Studio Graph Copilot', systemPrompt: 'You read a graph.', serverExecuted: false },
]

/** The fleet's native MCP servers, as `/v1/mcp` lists them. */
const NATIVE = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    tools: [
      { name: 'git', description: 'git: the forge.', inputSchema: { properties: { op: { enum: ['list_git_repos', 'get_git_repo'] } } } },
      { name: 'kms', description: 'kms: secrets.', inputSchema: { properties: { op: { enum: ['list_secrets'] } } } },
    ],
  },
}

/** What is mounted on the platform, as Plugins → Discover reads it. */
const MOUNTED = { plugins: [{ name: 'tools', enabled: true, prefixes: ['/v1/tool'] }, { name: 'agents', enabled: true, prefixes: ['/v1/agent'] }] }

/** Customize's platform: the org's skills, connectors (`seed`), plugins and agents. */
export function customize(page: Page, seed: Record<string, unknown>[] = []) {
  const on = new Set<string>(['skill_triage', 'skill_git_branches'])
  const skills = [{ id: 'triage', name: 'triage', description: 'How we triage an issue', content: '# Triage\n\nRead it first.', createdAt: 1790000000, org: 'acme' }]
  const servers: Record<string, unknown>[] = [...seed]
  const plugins: Record<string, unknown>[] = [{ id: 'p0a1b2', name: 'weather', provider: '', source: 'export const weather = 1', createdAt: 1790000000 }]
  const agents: Record<string, unknown>[] = [
    { id: 'agent_1', name: 'helper', model: 'zen5.8', description: 'Answers questions about the codebase', instructions: 'Be terse.', tools: ['skill_triage'], status: 'ready', runs: 4, cap_micro_usd: 10_000_000, max_task_micro_usd: 1_000_000, consumed_micro_usd: 250_000, period: 'month' },
  ]
  const mcpTools = () =>
    servers.flatMap((s) => [
      { name: `${s.id}_create_payment_link`, source: 'mcp', description: 'Create a payment link', activated: on.has(`${s.id}_create_payment_link`) },
      { name: `${s.id}_list_customers`, source: 'mcp', description: 'List customers', activated: on.has(`${s.id}_list_customers`) },
    ])
  const skillTools = () => [
    ...CATALOGUE.skills.map((s) => ({ name: `skill_${s.name}`, source: 'skill', description: s.description, activated: on.has(`skill_${s.name}`) })),
    ...skills.map((s) => ({ name: `skill_${s.name}`, source: 'skill', description: s.description, activated: on.has(`skill_${s.name}`) })),
  ]

  const answer = ({ method, path, query, body }: Sent): Reply | undefined => {
    const b = (body ?? {}) as Record<string, unknown>
    if (path === '/v1/tool/activation' && method === 'PUT') {
      for (const n of (b.activate as string[]) ?? []) on.add(n)
      for (const n of (b.deactivate as string[]) ?? []) on.delete(n)
      return { json: { enabled: [...on] } }
    }
    if (path === '/v1/tool/activation') return { json: { enabled: [...on] } }
    if (path === '/v1/tool/skills' && method === 'POST') {
      const s = { id: b.name, name: b.name, description: b.description, content: b.content, createdAt: 1790000100, org: 'acme' }
      const i = skills.findIndex((x) => x.name === b.name)
      if (i === -1) skills.push(s as (typeof skills)[number])
      else skills[i] = s as (typeof skills)[number]
      return { status: 201, json: { skill: s } }
    }
    if (path === '/v1/tool/skills') return { json: { source: 'skill', tools: skillTools().filter((x) => !query.includes('activated=true') || x.activated) } }
    if (path === '/v1/tool/skills/authored') return { json: { skills } }
    if (path.startsWith('/v1/tool/skills/') && method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').pop()!)
      skills.splice(skills.findIndex((x) => x.id === id), 1)
      return { json: { deleted: id } }
    }
    if (path === '/v1/tool') {
      const all = [...mcpTools(), ...skillTools(), { name: 'agent_helper', source: 'agent', description: 'helper', activated: on.has('agent_helper') }]
      const src = new URLSearchParams(query).get('source')
      return { json: { tools: all.filter((x) => (!src || x.source === src) && (!query.includes('activated=true') || x.activated)) } }
    }
    if (path === '/v1/tool/mcp/servers' && method === 'POST') {
      const l = LISTINGS.find((x) => x.id === b.listing)
      const s = {
        id: l ? l.vendor.replace('.', '-') : String(b.name).toLowerCase(),
        org: 'acme',
        name: b.name || l?.title,
        url: l ? l.remotes?.[0]?.url : b.url,
        authHeader: b.authHeader,
        hasSecret: Boolean(b.secret),
        listing: b.listing ?? '',
        source: b.listing ? 'catalog' : 'org',
        createdAt: 1790000200,
      }
      servers.push(s)
      return { status: 201, json: s }
    }
    if (path === '/v1/tool/mcp/servers') return { json: { servers } }
    if (path.startsWith('/v1/tool/mcp/servers/') && method === 'DELETE') {
      servers.splice(servers.findIndex((x) => x.id === path.split('/').pop()), 1)
      return { status: 204, text: '' }
    }
    if (path === '/v1/tool/catalog') {
      const q = (new URLSearchParams(query).get('q') ?? '').toLowerCase()
      const list = LISTINGS.filter((l) => !q || `${l.title} ${l.description}`.toLowerCase().includes(q))
      return { json: { catalog: list, total: list.length, limit: 48, offset: 0 } }
    }
    if (path.startsWith('/v1/tool/catalog/')) return { json: LISTINGS.find((l) => l.id === path.split('/').pop()) ?? {} }
    if (path === '/v1/mcp') return { json: NATIVE }
    if (path === '/v1/tool/plugins/build') {
      if (String(b.source ?? '').includes('oops')) return { status: 422, json: { status: 422, title: 'Unprocessable Entity', detail: 'bundle: Expected ";" but found "oops"' } }
      const p = { id: `p${plugins.length}`, name: b.name, provider: b.provider ?? '', source: b.source ?? `// written from: ${b.spec}`, createdAt: 1790000300 }
      plugins.unshift(p)
      return { status: 201, json: { bytes: 2048, generated: Boolean(b.spec), plugin: p } }
    }
    if (path === '/v1/tool/plugins/authored') return { json: { plugins } }
    if (path.startsWith('/v1/tool/plugins/authored/') && method === 'DELETE') {
      plugins.splice(plugins.findIndex((x) => x.id === path.split('/').pop()), 1)
      return { json: { deleted: path.split('/').pop() } }
    }
    if (path === '/v1/tool/plugins') return { json: MOUNTED }
    if (path === '/v1/agent/chat/presets') return { json: { presets: PRESETS } }
    if (path === '/v1/agent' && method === 'POST') {
      const a = { ...b, id: `agent_${agents.length + 1}`, model: b.model ?? 'zen5.8', status: 'ready', runs: 0, consumed_micro_usd: 0 }
      agents.push(a)
      return { status: 201, json: a }
    }
    if (path === '/v1/agent') return { json: { agents: agents.map(({ instructions: _, ...a }) => a) } }
    const ref = path.match(/^\/v1\/agent\/(agent_\d+|[a-z]+)$/)?.[1]
    if (ref && !['sessions', 'targets', 'coding', 'metrics', 'activity', 'runs'].includes(ref)) {
      const i = agents.findIndex((a) => a.id === ref || a.name === ref)
      if (method === 'PATCH') {
        agents[i] = { ...agents[i], ...b }
        return { json: agents[i] }
      }
      if (method === 'DELETE') {
        agents.splice(i, 1)
        return { status: 204, text: '' }
      }
      return { json: agents[i] }
    }
    if (path === '/v1/models') return { json: { data: [{ id: 'zen5.8' }, { id: 'zen5.8-coder' }] } }
    return undefined
  }
  return signIn(page, answer)
}

/** The brand's public catalogue, which lives at the platform's root and not under /v1. */
export async function catalogue(page: Page) {
  await page.route('**/.well-known/agent-skills/**', (r) => {
    const url = new URL(r.request().url())
    if (url.pathname.endsWith('/index.json')) return r.fulfill({ json: CATALOGUE })
    const name = url.pathname.split('/').at(-2)
    return r.fulfill({ body: `# ${name}\n\nWhat ${name} does, step by step.\n`, contentType: 'text/markdown' })
  })
}

// New: the codebase a run works on, where it runs, and its environment.

/** New holding the codebase it last worked on. */
export const KEPT = {
  [`hanzo.build.new.${ORG}`]: {
    repo: { owner: ORG, name: REPO, full_name: `${ORG}/${REPO}`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: '' },
    branch: 'main',
    place: '',
    mode: 'build',
    model: '',
    effort: 'medium',
    ask: '',
  },
}

/** New holding the codebase, which has no environment; a save keeps it, a run starts. */
export function setup(page: Page) {
  const env = { repo: REPO, install: '', start: '', secrets: [] as string[], state: 'none', session: '', proposal: null }
  return signIn(
    page,
    ({ method, path, body }) => {
      if (path === `/v1/environment/${REPO}` && method === 'PUT') {
        Object.assign(env, body, { state: 'ready' })
        return { json: env }
      }
      if (path === `/v1/environment/${REPO}`) return { json: env }
      if (path === '/v1/agent/coding') return { status: 202, json: { sessionId: SESSION, repo: REPO, branch: '' } }
      return undefined
    },
    KEPT,
  )
}

/** New with a machine to run on, the forge's codebases, and the kept one's environment ready. */
export function landing(page: Page) {
  return signIn(
    page,
    ({ path }) => {
      if (path === '/v1/agent/targets') return { json: { targets: [{ id: 'tgt_1', label: 'dave-laptop', status: 'online', capacity: '10 vCPU / 32G' }] } }
      if (path === '/v1/git/repos') return { json: { data: [{ name: REPO, org: ORG, defaultBranch: 'main' }] } }
      if (path === `/v1/environment/${REPO}`) return { json: { repo: REPO, install: 'pnpm i', start: '', secrets: [], state: 'ready' } }
      return undefined
    },
    KEPT,
  )
}

// The rail, Artifacts, Templates and the Code settings.

const unix = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) / 1000

export const PROJECTS = [
  { slug: 'shop', name: 'Shop', visibility: 'private', status: 'live', liveUrl: 'https://shop.hanzo.app', createdAt: unix(2026, 8, 1), updatedAt: unix(2026, 9, 20) },
  { slug: 'blog', name: 'Blog', visibility: 'public', status: 'draft', createdAt: unix(2026, 9, 2), updatedAt: unix(2026, 9, 12) },
  { slug: 'docs', name: 'Docs site', visibility: 'public', status: 'live', createdAt: unix(2026, 7, 1), updatedAt: unix(2026, 8, 3) },
]

export const STARTERS = ['synapse', 'circle', 'metrics', 'folio', 'mint'].map((slug) => ({ slug, title: slug[0]!.toUpperCase() + slug.slice(1), category: 'App', description: '', framework: 'Next.js' }))

const MACHINES = [
  { id: 'tgt_1', label: 'workshop', kind: 'gpu', status: 'online', capacity: '1× GB10', host: 'spark', sessions: 3, running: 1 },
  { id: 'tgt_2', label: 'laptop', kind: 'laptop', status: 'offline', host: 'mbp' },
]

const ENVIRONMENTS = [
  { repo: 'universe', install: 'pnpm install', start: 'pnpm dev', secrets: ['TOKEN'], state: 'ready', updatedAt: '2026-09-20T10:00:00Z' },
  { repo: 'site', install: '', start: '', secrets: [], state: 'proposed', proposal: { install: 'npm ci', start: '', secrets: [], note: '' } },
]

/** A platform with projects, starters, machines, environments and keys, answering every write. */
export function rail(page: Page, kept: Record<string, unknown> = {}): Promise<Sent[]> {
  return signIn(
    page,
    ({ method, path, query, body }) => {
      if (path === '/v1/projects' && method === 'GET') return { json: PROJECTS }
      if (path === '/v1/templates') return { json: { data: STARTERS } }
      if (path === '/v1/projects/fork') return { status: 201, json: { slug: `${(body as { slug: string }).slug}-2`, name: 'Copy' } }
      if (path.startsWith('/v1/projects/') && method === 'PATCH') return { json: { ...PROJECTS[0], ...(body as object) } }
      if (path.startsWith('/v1/projects/') && method === 'DELETE') return { status: 204, text: '' }
      if (path === '/v1/agent/targets' && method === 'GET') return { json: { targets: MACHINES } }
      if (path === '/v1/agent/targets' && method === 'POST') return { status: 201, json: { id: 'tgt_3', ...(body as object) } }
      if (path === '/v1/agent/targets/tgt_1/key') return { json: { targetId: 'tgt_1', claimKey: 'tk_live_once' } }
      if (path.startsWith('/v1/agent/targets/') && method === 'PATCH') return { json: { ...MACHINES[0], ...(body as object) } }
      if (path.startsWith('/v1/agent/targets/') && method === 'DELETE') return { json: { deleted: true } }
      if (path === '/v1/environment') return { json: { data: ENVIRONMENTS } }
      if (path === '/v1/environment/universe' && method === 'GET') return { json: ENVIRONMENTS[0] }
      if (path === '/v1/environment/universe' && method === 'DELETE') return { status: 204, text: '' }
      if (path === '/v1/account/keys' && method === 'GET') return { json: { keys: [{ type: 'publishable', prefix: 'pk-acme', key: 'pk-acme-public-1234' }] } }
      if (path === '/v1/account/keys' && method === 'POST') return { json: { key: 'sk-live-shown-once', accessKey: 'sk-live-shown-once', type: 'secret', limit: (body as { limit?: string[] }).limit } }
      if (path === '/v1/account/keys' && method === 'DELETE') return { json: { ok: true, type: new URLSearchParams(query).get('type') } }
      return undefined
    },
    kept,
  )
}

// Money and the organization: Billing, Usage, Plans, Members, Integrations and Notifications.

const PERIOD_END = '2026-10-27T00:00:00Z'
const CARD = { id: 'pm_1', type: 'card', isDefault: true, card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2027 } }
export const PLANS = [
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
export async function org(page: Page, o: { paid?: boolean; cards?: boolean } = {}) {
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

// A run's side pane: its desktop and shell, what it pushed, its files and what it produced.

export const BOX = `m_${'b'.repeat(24)}`
const PR = 'https://git.hanzo.ai/hanzoai/universe/pulls/7'

/** What cloud's own pages do once their socket is up: tell the window that frames them. */
const framed = (source: string, says: string) =>
  `<!doctype html><html><body style="margin:0;background:#101820;color:#fff;font:14px sans-serif"><p>${says}</p>` +
  `<script>parent.postMessage({ source: '${source}', ready: true }, '*')</script></body></html>`

/** One run that holds a sandbox and pushed a pull request, `running` or finished. */
export function run(p: Page, status = 'running') {
  return signIn(p, ({ method, path, query, body }) => {
    if (path === `/v1/agent/sessions/${SESSION}`) {
      return {
        json: {
          id: SESSION,
          title: 'universe: Add the widget',
          status,
          kind: 'coding',
          repo: 'hanzoai/universe',
          base: 'main',
          branch: 'agent/ab12',
          environment: 'sandbox',
          mode: 'build',
          project: 'widgets',
          sandbox: BOX,
          pr: PR,
          createdAt: '2026-09-27T10:00:00Z',
          recentEvents: [
            { id: 'e1', sessionId: SESSION, seq: 1, kind: 'tool-call', payload: { step: 'install', message: 'pnpm install', status: 'running' } },
            { id: 'e2', sessionId: SESSION, seq: 2, kind: 'log', payload: { message: 'go test ./...\nok  widgets 0.2s' } },
          ],
        },
      }
    }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === `/v1/sandbox/${BOX}`) return { json: { id: BOX, status: status === 'running' ? 'running' : 'parked', expiresAt: 1790726400 } }
    if (path === `/v1/sandbox/${BOX}/ports`) return { json: { ports: [] } }
    if (path === `/v1/agent/coding/${SESSION}/artifacts`) {
      return {
        json: {
          session: SESSION,
          saved: '2026-09-27T10:06:00Z',
          artifacts: [
            { name: 'widget.go', kind: 'file', size: 30 },
            { name: 'changes.patch', kind: 'patch', size: 120 },
          ],
        },
      }
    }
    if (path === `/v1/sandbox/${BOX}/screen/ticket`) return { status: 201, json: { ticket: 's', expiresIn: 30, url: `/v1/sandbox/${BOX}/screen?ticket=s` } }
    if (path === `/v1/sandbox/${BOX}/terminal/ticket`) return { status: 201, json: { ticket: 't', expiresIn: 30, url: `/v1/sandbox/${BOX}/terminal?ticket=t` } }
    if (path === `/v1/sandbox/${BOX}/screen`) return { text: framed('hanzo-screen', 'the desktop'), type: 'text/html' }
    if (path === `/v1/sandbox/${BOX}/terminal`) return { text: framed('hanzo-term', `the shell ${query}`), type: 'text/html' }
    if (path === '/v1/sandbox/read' && method === 'POST') {
      const at = (body as { path?: string }).path ?? ''
      if (at === '') return { json: { path: '/work', dir: true, entries: ['src', 'README.md'] } }
      if (at === 'src') return { json: { path: '/work/src', dir: true, entries: ['main.go'] } }
      return { json: { path: `/work/${at}`, data: Buffer.from(`# ${at}\n`).toString('base64') } }
    }
    if (path === `/v1/agent/coding/${SESSION}/changes`) {
      return {
        json: {
          repo: 'hanzoai/universe',
          base: 'main',
          head: 'agent/ab12',
          commits: [{ sha: 'a1b2c3d4e5f6', message: 'Add the widget', author: 'Hanzo Dev', date: '2026-09-27T10:05:00Z' }],
          files: [{ path: 'widget.go', status: 'added', additions: 2, deletions: 0, patch: '@@ -0,0 +1,2 @@\n+package widget\n+func New() {}' }],
          pull: { number: 7, url: PR, title: 'Add the widget', state: 'open', mergeable: true, reviews: [{ author: 'z', state: 'APPROVED', body: 'ship it', at: '2026-09-27T11:00:00Z' }] },
        },
      }
    }
    if (path === `/v1/agent/coding/${SESSION}/tree`) return { json: { ref: 'agent/ab12', entries: [{ name: 'widget.go', path: 'widget.go', type: 'blob', size: 30 }] } }
    if (path === '/v1/environment/universe') return { json: { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' } }
    return undefined
  })
}

// A run's transcript and controls: follow-up, pause and resume, a plan, rename, share and find.

export const NEXT = `sess_${'b'.repeat(32)}`

/** One line of the agent's own narration, as the harness streams it. */
const said = (id: string, item: Record<string, unknown>) => ({ type: 'item.completed', item: { id, ...item } })

/** What the agent narrated for one short turn. */
const OUT = [
  said('i0', { type: 'reasoning', text: '**Reading** the widget before changing it' }),
  said('i1', { type: 'agent_message', text: 'I will read the widget first.' }),
  said('i2', { type: 'command_execution', command: "sed -n '1,40p' widget.go", aggregated_output: 'package widget', exit_code: 0, status: 'completed' }),
  said('i3', { type: 'command_execution', command: 'go test ./...', aggregated_output: 'FAIL widgets', exit_code: 1, status: 'failed' }),
  said('i4', { type: 'file_change', changes: [{ path: '/work/widget.go', kind: 'update' }], status: 'completed' }),
  said('i5', { type: 'agent_message', text: 'Added **New** to `widget.go`:\n\n- it returns a widget\n- the tests pass' }),
]

export const PLAN = '1. Read `widget.go`\n2. Add **New**'

export interface Shape {
  status?: string
  mode?: string
  project?: string
  published?: boolean
  environment?: string
  /** The status event the run ended or paused with. */
  last?: Record<string, unknown> | null
}

function events({ mode = 'build', last = { status: 'done', changed: true, branch: 'agent/ab12' } }: Shape) {
  const ev = (seq: number, kind: string, payload: unknown) => ({ id: `e${seq}`, sessionId: SESSION, seq, kind, actor: `${ORG}/dave`, payload, createdAt: '' })
  const list = [
    ev(1, 'status', { status: 'started', branch: 'agent/ab12' }),
    ev(2, 'tool-call', { step: 'lease', message: 'leasing a dev sandbox', status: 'running' }),
    ev(3, 'tool-call', { step: 'leased', message: 'sandbox m_1 (dev)', status: 'running' }),
    ev(4, 'tool-call', { step: 'clone', message: 'cloning the codebase', status: 'running' }),
    ev(5, 'log', { message: 'Cloning into universe…\n' }),
    ev(6, 'tool-call', { step: 'exit', message: 'exit 0' }),
    ev(7, 'message', { role: 'user', text: 'Add the widget' }),
    ...(mode === 'plan' ? [said('p0', { type: 'agent_message', text: PLAN })] : OUT).map((line, i) => ev(8 + i, 'event', line)),
  ]
  if (last) list.push(ev(20, 'status', mode === 'plan' ? { status: 'done', mode: 'plan', changed: false, plan: PLAN } : last))
  return list
}

/** The platform for one run, and what it answers a start, a pause, a rename and a list with. */
export function session(page: Page, shape: Shape = {}) {
  const { status = 'done', mode = 'build', project = '', published = false, environment = 'sandbox' } = shape
  return signIn(page, ({ method, path, query }) => {
    if (path === `/v1/agent/sessions/${SESSION}` && method === 'GET') {
      return {
        json: {
          id: SESSION,
          org: ORG,
          title: `${REPO}: Add the widget`,
          status,
          kind: 'coding',
          repo: `hanzoai/${REPO}`,
          base: 'main',
          branch: mode === 'plan' ? '' : 'agent/ab12',
          environment,
          mode,
          project,
          published,
          events: 10,
          recentEvents: events(shape),
        },
      }
    }
    if (path === `/v1/agent/sessions/${SESSION}` && method === 'PATCH') return { json: { id: SESSION, title: 'Renamed run', published: true, project } }
    if (path === `/v1/agent/sessions/${NEXT}`) return { json: { id: NEXT, title: `${REPO}: now add tests`, status: 'running', kind: 'coding', recentEvents: [] } }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === '/v1/agent/coding' && method === 'POST') return { status: 202, json: { sessionId: NEXT, repo: REPO, branch: 'agent/bb' } }
    if (/^\/v1\/agent\/sessions\/[^/]+\/(pause|resume|stop|message)$/.test(path)) return { json: { command: path.split('/').pop() } }
    if (path === '/v1/agent/sessions' && method === 'GET') {
      const q = new URLSearchParams(query)
      if (q.get('after') === 'c1') return { json: { sessions: [{ id: `sess_${'d'.repeat(32)}`, title: 'An older run', status: 'done', repo: 'hanzoai/old' }], next: '' } }
      if (q.get('status') === 'paused') return { json: { sessions: [{ id: `sess_${'e'.repeat(32)}`, title: 'A paused run', status: 'paused', repo: 'hanzoai/universe' }], next: '' } }
      return { json: { sessions: [{ id: SESSION, title: `${REPO}: Add the widget`, status, repo: `hanzoai/${REPO}` }], next: 'c1' } }
    }
    if (path === `/v1/environment/${REPO}`) return { json: { repo: REPO, install: 'pnpm i', start: '', secrets: [], state: 'ready' } }
    return undefined
  })
}

// The personal half of Settings: General, Account, Privacy, Capabilities, Memory and Code.

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
export const FACE = `https://api.hanzo.ai/v1/account/avatar/${ORG}/dave/${'a'.repeat(64)}`

export interface World {
  prefs: Record<string, unknown>
  consent: { insights: boolean; training: string }
  tools: { name: string; source: string; description: string; dispatchable: boolean; activated: boolean }[]
  memories: { owner: string; name: string; content: string; kind: string; updatedTime: string }[]
  projects: { slug: string; name: string; visibility: string; updatedAt: number }[]
}

/** A platform holding `world`, which every write changes; answers what the page sent, IAM's calls included. */
export async function you(page: Page, seed: Partial<World> = {}, kept: Record<string, unknown> = {}) {
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

// The forge: codebases, what GitHub grants, boards and their issues, and automations.

/** Codebase, Sync, Projects, Issues and Automations, each with something on it. */
export function forge(page: Page) {
  return signIn(page, ({ path }) => {
    if (path === '/v1/git/repos') {
      return {
        json: {
          data: [
            { name: REPO, org: ORG, description: 'The cluster, declared', defaultBranch: 'main', updatedAt: '2026-09-26T10:00:00Z' },
            { name: 'site', org: ORG, description: 'hanzo.build', defaultBranch: 'main', public: true, updatedAt: '2026-09-20T10:00:00Z' },
          ],
        },
      }
    }
    if (path === '/v1/environment') return { json: { data: ENVIRONMENTS } }
    if (path === '/v1/provider/github/repos') {
      return {
        json: {
          repos: [
            { name: 'widgets', fullName: `${ORG}/widgets`, private: true, defaultBranch: 'main' },
            { name: 'site', fullName: `${ORG}/site`, imported: true, syncStatus: 'synced' },
            { name: 'dotfiles', fullName: 'dave-gh/dotfiles' },
          ],
          unread: [`${ORG}-labs`],
        },
      }
    }
    if (path === '/v1/task/projects') return { json: { data: [{ id: 'p1', key: REPO, name: 'Universe', description: 'The cluster' }, { id: 'p2', key: 'site', name: 'Site' }] } }
    if (path === '/v1/task/board' || path.startsWith('/v1/task/projects/')) {
      return {
        json: {
          data: [
            { id: 'i1', projectKey: REPO, number: 12, title: 'Pin the gateway image', status: 'todo', repo: REPO },
            { id: 'i2', projectKey: 'site', number: 3, title: 'A faster home page', status: 'in_progress' },
          ],
        },
      }
    }
    if (path === '/v1/auto/flows') {
      return {
        json: {
          data: [
            { id: 'f1', status: 'ENABLED', updated: Date.UTC(2026, 8, 26), version: { displayName: 'Nightly dependency bump' } },
            { id: 'f2', status: 'DISABLED', updated: Date.UTC(2026, 8, 20), version: { displayName: 'Weekly digest' } },
          ],
        },
      }
    }
    return undefined
  })
}

// A project's workspace.

/** Shop's workspace: its repository on the forge, one finished run on it, its files, and its deployed page. */
export async function workspace(page: Page) {
  const shop = { ...PROJECTS[0], repo: { url: `https://git.hanzo.ai/${ORG}/shop.git`, branch: 'main' } }
  const ran = { id: SESSION, title: 'Add a cart', status: 'done', kind: 'coding', repo: 'shop', project: 'shop', base: 'main', branch: 'agent/cart' }
  const sent = await signIn(page, ({ path, query }) => {
    if (path === '/v1/projects') return { json: [shop, ...PROJECTS.slice(1)] }
    if (path === '/v1/agent/sessions') return { json: { sessions: [ran], next: '' } }
    if (path === `/v1/agent/sessions/${SESSION}`) {
      const ev = (seq: number, kind: string, payload: unknown) => ({ id: `e${seq}`, sessionId: SESSION, seq, kind, actor: `${ORG}/dave`, payload, createdAt: '' })
      return {
        json: {
          ...ran,
          recentEvents: [
            ev(1, 'status', { status: 'started', branch: 'agent/cart' }),
            ev(2, 'tool-call', { step: 'clone', message: 'cloning the codebase', status: 'running' }),
            ev(3, 'log', { message: 'Added a cart to the header.' }),
            ev(4, 'status', { status: 'done', changed: true, branch: 'agent/cart' }),
          ],
        },
      }
    }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === '/v1/git/repos/shop/tree') {
      const dir = new URLSearchParams(query).get('path') ?? ''
      if (dir === 'src') return { json: { entries: [{ name: 'cart.js', path: 'src/cart.js', type: 'blob', size: 64 }] } }
      return {
        json: {
          entries: [
            { name: 'src', path: 'src', type: 'tree' },
            { name: 'index.html', path: 'index.html', type: 'blob', size: 120 },
            { name: 'about.html', path: 'about.html', type: 'blob', size: 90 },
          ],
        },
      }
    }
    if (path === '/v1/git/repos/shop/blob') return { json: { path: new URLSearchParams(query).get('path'), content: '<h1>Shop</h1>\n', size: 14 } }
    return undefined
  })
  await page.route('https://shop.hanzo.app/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Shop</title><h1 style="font:24px sans-serif">Shop</h1>' }))
  return sent
}

// Signed out.

/** What the platform tells anyone: the plans, the starters, the skills catalogue, the shelf of connectors, and the fleet's servers. */
export async function visitor(page: Page) {
  await catalogue(page)
  return serve(page, ({ path, query }) => {
    if (path === '/v1/billing/plans') return { json: PLANS }
    if (path === '/v1/templates') return { json: { data: STARTERS } }
    if (path === '/v1/mcp') return { json: NATIVE }
    if (path === '/v1/tool/catalog') {
      const q = (new URLSearchParams(query).get('q') ?? '').toLowerCase()
      const list = LISTINGS.filter((l) => !q || `${l.title} ${l.description}`.toLowerCase().includes(q))
      return { json: { catalog: list, total: list.length, limit: 48, offset: 0 } }
    }
    if (path === '/v1/agent/chat/presets') return { json: { presets: PRESETS } }
    if (path === '/v1/tool/plugins') return { json: MOUNTED }
    return { status: 401, json: { status: 401, title: 'Unauthorized', detail: 'Sign in to use this.' } }
  })
}
