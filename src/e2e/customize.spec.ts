/**
 * Customize — skills, connectors, plugins and agents, yours and to discover —
 * signed in against a stubbed platform (signed.ts) that keeps what it is sent,
 * so a write shows up on the next read the way it would live.
 */
import { expect, test, type Page } from '@playwright/test'

import { signIn, type Reply, type Sent } from './signed.ts'

const CATALOGUE = {
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

const LISTINGS = [
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

const PRESETS = [
  { id: 'create', title: 'Product & Fashion Create', systemPrompt: 'You are Hanzo Create, a render assistant.', serverExecuted: true },
  { id: 'graph', title: 'Studio Graph Copilot', systemPrompt: 'You read a graph.', serverExecuted: false },
]

/** A platform that keeps what it is sent. */
function platform(page: Page) {
  const on = new Set<string>(['skill_triage', 'skill_git_branches'])
  const skills = [{ id: 'triage', name: 'triage', description: 'How we triage an issue', content: '# Triage\n\nRead it first.', createdAt: 1790000000, org: 'acme' }]
  const servers: Record<string, unknown>[] = []
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
    if (path === '/v1/mcp')
      return {
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'git', description: 'git: the forge.', inputSchema: { properties: { op: { enum: ['list_git_repos', 'get_git_repo'] } } } },
              { name: 'kms', description: 'kms: secrets.', inputSchema: { properties: { op: { enum: ['list_secrets'] } } } },
            ],
          },
        },
      }
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
    if (path === '/v1/tool/plugins') return { json: { plugins: [{ name: 'tools', enabled: true, prefixes: ['/v1/tool'] }, { name: 'agents', enabled: true, prefixes: ['/v1/agent'] }] } }
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
async function catalogue(page: Page) {
  await page.route('**/.well-known/agent-skills/**', (r) => {
    const url = new URL(r.request().url())
    if (url.pathname.endsWith('/index.json')) return r.fulfill({ json: CATALOGUE })
    const name = url.pathname.split('/').at(-2)
    return r.fulfill({ body: `# ${name}\n\nWhat ${name} does, step by step.\n`, contentType: 'text/markdown' })
  })
}

async function open(page: Page, at: string) {
  await catalogue(page)
  const sent = await platform(page)
  await page.goto(at)
  return sent
}

const sentTo = (sent: Sent[], method: string, path: string) => sent.filter((s) => s.method === method && s.path === path)

test('the rail’s Customize opens Connectors, and the old MCP address lands on its Discover', async ({ page, baseURL }) => {
  await open(page, '/')
  await page.getByText('Customize', { exact: true }).first().click()
  await expect(page).toHaveURL(new URL('/-/customize/connectors', baseURL).href)
  await expect(page.getByRole('tab', { name: 'Connectors' })).toHaveAttribute('aria-selected', 'true')
  await page.goto('/-/mcp')
  await expect(page.getByRole('button', { name: 'Discover', pressed: true })).toBeVisible()
  await expect(page.getByText('2 servers · 3 operations')).toBeVisible()
  await page.getByRole('tab', { name: 'Agents' }).click()
  await expect(page).toHaveURL(new URL('/-/customize/agents', baseURL).href)
})

test('skills: yours switch on and off, and a new one is written and switched on', async ({ page }, info) => {
  const sent = await open(page, '/-/customize')
  await expect(page.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true')
  const mine = page.getByRole('list', { name: 'Your skills' })
  await expect(mine.getByText('triage', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Added skills' }).getByText('git_branches', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('skills-yours.png') })

  await mine.getByRole('switch', { name: 'triage on' }).click()
  await expect(page.getByText('triage is off')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['skill_triage'] })

  await page.getByRole('button', { name: 'Remove git_branches' }).click()
  await expect(page.getByRole('list', { name: 'Added skills' })).toHaveCount(0)

  await page.getByRole('button', { name: 'New skill' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Release Notes')
  await dialog.getByLabel('SKILL.md').fill('# Release notes\n\nCollect the merged PRs.')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText(/one lowercase word/)).toBeVisible()
  await dialog.getByLabel('Name').fill('release-notes')
  await dialog.getByLabel('Description').fill('Write the release notes')
  await page.screenshot({ path: info.outputPath('skills-new.png') })
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('release-notes is saved and on')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/skills').at(-1)?.body).toEqual({ name: 'release-notes', description: 'Write the release notes', content: '# Release notes\n\nCollect the merged PRs.' })
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['skill_release-notes'], deactivate: [] })
  await expect(mine.getByRole('switch', { name: 'release-notes on' })).toBeChecked()

  await mine.getByRole('button', { name: 'triage', exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('SKILL.md')).toHaveValue('# Triage\n\nRead it first.')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete triage?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('triage is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/skills/triage')).toHaveLength(1)
})

test('skills: discover the catalogue, read a SKILL.md, and add one', async ({ page }, info) => {
  const sent = await open(page, '/-/customize')
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.getByText('3 skills across 2 products')).toBeVisible()
  await expect(page.getByLabel('git_branches is added')).toBeVisible()
  await page.getByLabel('Search skills').fill('kms')
  await expect(page.getByText('1 of 3 skills')).toBeVisible()
  await page.getByLabel('Search skills').fill('')
  await page.screenshot({ path: info.outputPath('skills-discover.png') })

  await page.getByRole('button', { name: 'Add git_repos' }).click()
  await expect(page.getByLabel('git_repos is added')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['skill_git_repos'], deactivate: [] })

  await page.getByRole('button', { name: 'kms_secrets', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('What kms_secrets does, step by step.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add to your skills' }).click()
  await expect(dialog.getByRole('button', { name: 'Remove' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('skills-read.png') })
})

test('connectors: add one off the shelf, switch its tools, and remove it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/connectors')
  await expect(page.getByText('No connectors yet.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.getByText('Featured', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Servers on the shelf' }).getByText('Package', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Local files' })).toHaveCount(0)
  await expect(page.getByText('2 servers · 3 operations')).toBeVisible()
  await page.screenshot({ path: info.outputPath('connectors-discover.png'), fullPage: true })

  await page.getByRole('button', { name: 'Stripe', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('https://mcp.stripe.com · streamable-http')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Add to your connectors' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Stripe' })
  await dialog.getByLabel('Secret').fill('Bearer sk_test_x')
  await expect(dialog.getByLabel('Header')).toHaveValue('Authorization')
  await page.screenshot({ path: info.outputPath('connectors-add.png') })
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Stripe is added, and its 2 tools are on.')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/mcp/servers').at(-1)?.body).toEqual({ listing: 'com.stripe_mcp', authHeader: 'Authorization', secret: 'Bearer sk_test_x' })
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['com-stripe_create_payment_link', 'com-stripe_list_customers'], deactivate: [] })

  const mine = page.getByRole('list', { name: 'Your connectors' })
  await expect(mine.getByText('From the shelf · secret sealed in KMS', { exact: false })).toBeVisible()
  await mine.getByRole('button', { name: 'Stripe' }).click()
  const detail = page.getByRole('dialog', { name: 'Stripe' })
  await expect(detail.getByText('A secret is sealed in KMS and sent in Authorization.')).toBeVisible()
  await detail.getByRole('switch', { name: 'list_customers on' }).click()
  await expect(detail.getByRole('switch', { name: 'list_customers on' })).not.toBeChecked()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['com-stripe_list_customers'] })
  await detail.getByRole('button', { name: 'Turn all on' }).click()
  await expect(detail.getByRole('switch', { name: 'list_customers on' })).toBeChecked()
  await page.screenshot({ path: info.outputPath('connectors-detail.png') })
  await detail.getByRole('button', { name: 'Remove connector' }).click()
  await page.getByRole('dialog', { name: 'Delete Stripe?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Stripe is removed')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/mcp/servers/com-stripe')).toHaveLength(1)
})

test('connectors: add any MCP server by its URL', async ({ page }) => {
  const sent = await open(page, '/-/customize/connectors')
  await page.getByRole('button', { name: 'Add connector' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add connector' })
  await dialog.getByLabel('Name').fill('Docs')
  await dialog.getByLabel('URL').fill('https://docs.example.com/mcp')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Docs is added, and its 2 tools are on.')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/mcp/servers').at(-1)?.body).toEqual({ url: 'https://docs.example.com/mcp', name: 'Docs' })
})

test('plugins: build one, read its source, a failed build says why, and discover what is mounted', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/plugins')
  await expect(page.getByRole('list', { name: 'Your plugins' }).getByText('weather', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Build plugin' }).click()
  let dialog = page.getByRole('dialog', { name: 'Build a plugin' })
  await dialog.getByLabel('Name').fill('acme')
  await dialog.getByLabel('Source').fill('export const acme = oops')
  await dialog.getByRole('button', { name: 'Build', exact: true }).click()
  await expect(dialog.getByText('bundle: Expected ";" but found "oops"')).toBeVisible()
  await dialog.getByRole('button', { name: 'Describe an API' }).click()
  await dialog.getByLabel('The API').fill('POST /v1/things creates a thing')
  await dialog.getByLabel('Connector').fill('acme')
  await page.screenshot({ path: info.outputPath('plugins-build.png') })
  await dialog.getByRole('button', { name: 'Build', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'acme' })
  await expect(dialog.getByText('// written from: POST /v1/things creates a thing')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/plugins/build').at(-1)?.body).toEqual({ name: 'acme', provider: 'acme', spec: 'POST /v1/things creates a thing' })
  await dialog.getByRole('button', { name: 'Delete plugin' }).click()
  await page.getByRole('dialog', { name: 'Delete acme?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('acme is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/plugins/authored/p1')).toHaveLength(1)

  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Mounted subsystems' }).getByText('/v1/agent')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('plugins-discover.png') })
})

test('agents: create one with a budget, change only its instructions, and delete it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/agents')
  const mine = page.getByRole('list', { name: 'Your agents' })
  await expect(mine.getByText('zen5.8 · 4 runs · 1 tool · $0.25 of $10 this month')).toBeVisible()

  await page.getByRole('button', { name: 'New agent' }).click()
  let dialog = page.getByRole('dialog', { name: 'New agent' })
  await dialog.getByLabel('Name').fill('reviewer')
  await dialog.getByLabel('Instructions').fill('Review the diff.')
  await dialog.getByRole('switch', { name: 'Use skill_triage' }).click()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog.getByText('Set what it may spend each month')).toBeVisible()
  await dialog.getByLabel('Budget each period').fill('20')
  await dialog.getByLabel('Budget for one run').fill('2')
  await dialog.getByRole('button', { name: 'Week' }).click()
  await page.screenshot({ path: info.outputPath('agents-new.png') })
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('reviewer is saved')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/agent').at(-1)?.body).toEqual({
    name: 'reviewer',
    description: '',
    instructions: 'Review the diff.',
    tools: ['skill_triage'],
    cap_micro_usd: 20_000_000,
    max_task_micro_usd: 2_000_000,
    period: 'week',
  })

  await mine.getByRole('button', { name: 'helper' }).click()
  dialog = page.getByRole('dialog', { name: 'helper' })
  await expect(dialog.getByLabel('Instructions')).toHaveValue('Be terse.')
  await dialog.getByLabel('Instructions').fill('Be terse, and cite the file.')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('helper is saved')).toBeVisible()
  expect(sentTo(sent, 'PATCH', '/v1/agent/agent_1').at(-1)?.body).toEqual({ instructions: 'Be terse, and cite the file.' })

  await mine.getByRole('button', { name: 'helper' }).click()
  await page.getByRole('dialog', { name: 'helper' }).getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete helper?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('helper is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/agent/agent_1')).toHaveLength(1)
})

test('agents: a preset opens a new agent written from it', async ({ page }, info) => {
  const sent = await open(page, '/-/customize/agents')
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.getByText('Product & Fashion Create', { exact: true })).toBeVisible()
  await expect(page.getByText('Studio Graph Copilot')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('agents-discover.png') })
  await page.getByRole('button', { name: 'Add Product & Fashion Create' }).click()
  const dialog = page.getByRole('dialog', { name: 'New agent' })
  await expect(dialog.getByLabel('Name')).toHaveValue('create')
  await expect(dialog.getByLabel('Instructions')).toHaveValue('You are Hanzo Create, a render assistant.')
  await dialog.getByRole('switch', { name: 'Every tool' }).click()
  await dialog.getByRole('button', { name: 'Model: Default' }).click()
  await page.getByRole('option', { name: /Zen5\.8 Coder/ }).click()
  await expect(dialog.getByRole('button', { name: 'Model: Zen5.8 Coder' })).toBeVisible()
  await dialog.getByLabel('Budget each period').fill('5')
  await dialog.getByLabel('Budget for one run').fill('0.5')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('create is saved')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/agent').at(-1)?.body).toMatchObject({ name: 'create', description: 'Product & Fashion Create', model: 'zen5.8-coder', tools: ['*'], cap_micro_usd: 5_000_000, max_task_micro_usd: 500_000, period: 'month' })
})

/** Anything wider than the window, or cut off at its edges. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth
    const out: string[] = []
    if (document.documentElement.scrollWidth > w + 1) out.push(`page ${document.documentElement.scrollWidth}px wide`)
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (!r.width || !r.height || s.visibility === 'hidden') continue
      if (el.closest('[aria-label="Runs"]')) continue
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName} ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}`)
    }
    return out
  })
}

test('a phone gets every tab whole, with the cards in one column', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '/-/customize')
  for (const tab of ['skills', 'connectors', 'plugins', 'agents']) {
    await page.goto(tab === 'skills' ? '/-/customize' : `/-/customize/${tab}`)
    await expect(page.getByRole('tab', { selected: true })).toBeVisible()
    for (const view of ['Yours', 'Discover']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await page.waitForTimeout(300)
      expect(await overflow(page), `${tab} ${view}`).toEqual([])
      await page.screenshot({ path: info.outputPath(`phone-${tab}-${view.toLowerCase()}.png`), fullPage: true })
    }
  }
  await page.goto('/-/customize/agents')
  await page.getByRole('button', { name: 'New agent' }).first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: info.outputPath('phone-agents-new.png') })
})
