/**
 * A run as Claude Code on the web draws one, signed in against a stubbed
 * platform (signed.ts): the transcript as cards, a follow-up that continues a
 * finished run, pause and resume, an approved plan, renaming and sharing, and
 * finding a run; and New's place and repository pickers.
 */
import { expect, test, type Page } from '@playwright/test'

import { ORG, REPO, SESSION, signIn, type Sent } from './signed.ts'

const NEXT = `sess_${'b'.repeat(32)}`

/** What `dev exec` printed, as the sandbox narrated it. */
const OUT = [
  'Hanzo Dev v0.6.94',
  '--------',
  'workdir: /work/universe',
  '--------',
  'user',
  'Add the widget',
  'codex',
  'I will read the widget first.',
  'exec',
  `/bin/bash -lc 'sed -n '"'"'1,40p'"'"' widget.go' in /work/universe`,
  ' succeeded in 4ms:',
  'package widget',
  'exec',
  `/bin/bash -lc 'go test ./...' in /work/universe`,
  ' exited 1 in 900ms:',
  'FAIL widgets',
  'apply patch',
  'patch: completed',
  '/work/universe/widget.go',
  'diff --git a/widget.go b/widget.go',
  '@@ -1 +1,2 @@',
  ' package widget',
  '+func New() {}',
  'codex',
  'Added **New** to `widget.go`:',
  '',
  '- it returns a widget',
  '- the tests pass',
  'tokens used',
  '1,234',
  '',
].join('\n')

const PLAN = '1. Read `widget.go`\n2. Add **New**'

interface Shape {
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
    ev(7, 'tool-call', { step: '', message: 'running the task', status: 'running' }),
    ev(8, 'log', { message: mode === 'plan' ? `codex\n${PLAN}\n` : OUT }),
    ev(9, 'tool-call', { step: 'exit', message: 'exit 0' }),
  ]
  if (last) list.push(ev(10, 'status', mode === 'plan' ? { status: 'done', mode: 'plan', changed: false, plan: PLAN } : last))
  return list
}

/** The platform for one run, and what it answers a start, a pause, a rename and a list with. */
function platform(page: Page, shape: Shape = {}) {
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

const posted = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)
const transcript = (p: Page) => p.getByLabel('Transcript')

test('a run’s transcript draws what the agent said, ran, read and changed', async ({ page: p }, info) => {
  await platform(p)
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  await expect(t.getByText('I will read the widget first.')).toBeVisible()
  // The read is a chip; the command is a card that opens onto its output.
  await expect(t.getByLabel('Read widget.go')).toBeVisible()
  await expect(t.getByText('FAIL widgets')).toHaveCount(0)
  await t.getByText('go test ./...').first().click()
  await expect(t.getByText(/FAIL widgets/)).toBeVisible()
  await t.getByText('Edited', { exact: true }).click()
  await expect(t.getByText('+func New() {}')).toBeVisible()
  // The agent's markdown: bold, code and a list, as text.
  await expect(t.getByText('New', { exact: true })).toBeVisible()
  await expect(t.getByText('the tests pass')).toBeVisible()
  await expect(t.getByText('Pushed agent/ab12')).toBeVisible()
  // The run's own steps, and never the sandbox's directory.
  await expect(t.getByText('Clone', { exact: true })).toBeVisible()
  await expect(t.getByText('/work/universe')).toHaveCount(0)
  await p.screenshot({ path: info.outputPath('transcript.png') })
})

test('a finished run is followed up by a new run from its branch, and that run opens', async ({ page: p }) => {
  const sent = await platform(p)
  await p.goto(`/${SESSION}`)
  const box = p.getByRole('textbox', { name: 'Follow up on this run' })
  await expect(box).toHaveAttribute('placeholder', 'Follow up — continues in a new run')
  await box.fill('now add tests')
  await box.press('Enter')
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  const body = posted(sent, '/v1/agent/coding')[0]?.body as Record<string, unknown>
  expect(body).toMatchObject({ repo: `hanzoai/${REPO}`, after: SESSION, mode: 'build', desktop: true })
  expect(body.base).toBeUndefined()
  expect(String(body.prompt)).toMatch(/^now add tests\n\nThis follows an earlier run on this codebase: “Add the widget”/)
})

test('a running run is steered, paused and stopped from beside its composer', async ({ page: p }, info) => {
  const sent = await platform(p, { status: 'running', last: null })
  await p.goto(`/${SESSION}`)
  await expect(p.getByText('This run is still working.')).toBeVisible()
  await expect(p.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-disabled', 'true')
  const box = p.getByRole('textbox', { name: 'Steer this run' })
  await box.fill('use table tests')
  await box.press('Enter')
  await expect(p.getByText('Sent — recorded on this run')).toBeVisible()
  expect(posted(sent, `/v1/agent/sessions/${SESSION}/message`)[0]?.body).toEqual({ message: 'use table tests' })
  await p.getByRole('button', { name: 'Pause' }).click()
  await expect(p.getByText(/Pause requested/)).toBeVisible()
  expect(posted(sent, `/v1/agent/sessions/${SESSION}/pause`)).toHaveLength(1)
  await p.screenshot({ path: info.outputPath('running.png') })
  await p.getByRole('button', { name: 'Stop' }).click()
  await expect(p.getByText(/Stop requested/)).toBeVisible()
  expect(posted(sent, `/v1/agent/sessions/${SESSION}/stop`)).toHaveLength(1)
})

test('a paused sandbox run goes on in a new run from the work it kept', async ({ page: p }) => {
  const sent = await platform(p, { status: 'paused', last: { status: 'paused', changed: true, branch: 'agent/ab12' } })
  await p.goto(`/${SESSION}`)
  await expect(p.getByText('Paused — its work so far is on its branch.')).toBeVisible()
  await p.getByRole('button', { name: 'Resume' }).click()
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  const body = posted(sent, '/v1/agent/coding')[0]?.body as Record<string, unknown>
  expect(body).toMatchObject({ after: SESSION, mode: 'build' })
  expect(String(body.prompt)).toContain('Continue where the earlier run left off.')
  // The paused run is let go once the new one carries it.
  expect(posted(sent, `/v1/agent/sessions/${SESSION}/stop`)[0]?.body).toEqual({ message: 'Continued in a follow-up run' })
  expect(posted(sent, `/v1/agent/sessions/${SESSION}/resume`)).toHaveLength(0)
})

test('a paused machine run is resumed where it runs', async ({ page: p }) => {
  const sent = await platform(p, { status: 'paused', environment: 'tgt_1', last: null })
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Resume' }).click()
  await expect(p.getByText(/Resume asked/)).toBeVisible()
  expect(posted(sent, `/v1/agent/sessions/${SESSION}/resume`)).toHaveLength(1)
  expect(posted(sent, '/v1/agent/coding')).toHaveLength(0)
})

test('a plan is approved into a build of it', async ({ page: p }, info) => {
  const sent = await platform(p, { mode: 'plan' })
  await p.goto(`/${SESSION}`)
  const plan = p.getByLabel('Plan', { exact: true })
  await expect(plan.getByText('Read')).toBeVisible()
  await p.screenshot({ path: info.outputPath('plan.png') })
  await plan.getByRole('button', { name: 'Approve and build' }).click()
  await expect(p).toHaveURL(new RegExp(`/${NEXT}$`))
  const body = posted(sent, '/v1/agent/coding')[0]?.body as Record<string, unknown>
  expect(body).toMatchObject({ mode: 'build', base: 'main', repo: `hanzoai/${REPO}` })
  expect(body.after).toBeUndefined()
  expect(body.prompt).toBe(`Add the widget\n\nCarry out this plan:\n\n${PLAN}`)
})

test('a run is renamed and shared from its menu', async ({ page: p }) => {
  const sent = await platform(p, { project: 'widgets' })
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await p.getByRole('menuitem', { name: 'Rename' }).click()
  const name = p.getByRole('dialog').getByLabel('The run’s name')
  await name.fill('Renamed run')
  await p.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(p.getByRole('dialog')).toHaveCount(0)
  expect(sent.find((s) => s.method === 'PATCH')?.body).toEqual({ title: 'Renamed run' })
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await p.getByRole('menuitem', { name: /Share publicly/ }).click()
  await expect(p.getByText(/Shared — anyone with the link/)).toBeVisible()
  expect(sent.filter((s) => s.method === 'PATCH')[1]?.body).toEqual({ published: true })
})

test('a run that names no project offers no share', async ({ page: p }) => {
  await platform(p)
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Manage this run' }).click()
  await expect(p.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await expect(p.getByRole('menuitem', { name: /Share publicly/ })).toHaveCount(0)
})

test('Find reads the org’s runs by status and pages back', async ({ page: p }, info) => {
  const sent = await platform(p)
  await p.goto(`/${SESSION}`)
  await p.getByRole('button', { name: 'Search' }).first().click()
  const dialog = p.getByRole('dialog')
  await expect(dialog.getByRole('listitem', { name: `${REPO}: Add the widget` })).toBeVisible()
  await dialog.getByRole('button', { name: 'Older runs' }).click()
  await expect(dialog.getByRole('listitem', { name: 'An older run' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Paused' }).click()
  await expect(dialog.getByRole('listitem', { name: 'A paused run' })).toBeVisible()
  await expect(dialog.getByRole('listitem', { name: 'An older run' })).toHaveCount(0)
  const lists = sent.filter((s) => s.path === '/v1/agent/sessions').map((s) => s.query)
  expect(lists).toContain('?kind=coding&limit=50&after=c1')
  expect(lists).toContain('?kind=coding&status=paused&limit=50')
  await p.screenshot({ path: info.outputPath('find.png') })
  await dialog.getByLabel('Search runs').fill('paused')
  await dialog.getByLabel('Search runs').press('Enter')
  await expect(p).toHaveURL(new RegExp(`/sess_${'e'.repeat(32)}$`))
})

const KEPT = {
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

function landing(page: Page) {
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

test('New runs in Cloud or on a machine under remote control, and says how to link one', async ({ page: p }, info) => {
  await landing(p)
  await p.goto('/')
  await p.getByRole('button', { name: 'Where the run runs: Cloud' }).click()
  const list = p.getByRole('listbox', { name: 'Where the run runs' })
  await expect(list.getByText('Cloud', { exact: true })).toBeVisible()
  await expect(list.getByText(`Hanzo sandbox · ${REPO} environment`)).toBeVisible()
  await expect(list.getByText('Remote control · online · 10 vCPU / 32G')).toBeVisible()
  await expect(p.getByText('Set up remote control')).toBeVisible()
  await expect(p.getByText('hanzo link', { exact: true })).toBeVisible()
  await p.screenshot({ path: info.outputPath('place.png') })
  await list.getByText('dave-laptop').click()
  await expect(p.getByRole('button', { name: 'Where the run runs: dave-laptop' })).toBeVisible()
})

test('New’s repository list refreshes, and a missing GitHub repository leads to Sync', async ({ page: p }, info) => {
  const sent = await landing(p)
  await p.goto('/')
  await p.getByRole('button', { name: `Repository: ${REPO}` }).click()
  await expect(p.getByRole('listbox', { name: 'Repository' }).getByText(`${ORG}/${REPO}`)).toBeVisible()
  const reads = () => sent.filter((s) => s.path === '/v1/git/repos').length
  const before = reads()
  await p.getByText('Refresh list').click()
  await expect.poll(reads).toBeGreaterThan(before)
  await expect(p.getByRole('listbox', { name: 'Repository' }).getByText(`${ORG}/${REPO}`)).toBeVisible()
  await p.screenshot({ path: info.outputPath('repos.png') })
  await p.getByText('Missing a GitHub repository? Bring it onto the forge').click()
  await expect(p).toHaveURL(/\/-\/sync$/)
})

test('a running run fits a phone', async ({ page: p }, info) => {
  await p.setViewportSize({ width: 390, height: 844 })
  await platform(p, { status: 'running', last: null })
  await p.goto(`/${SESSION}`)
  await expect(p.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Notify me' })).toBeVisible()
  const wide = await p.evaluate(() => document.documentElement.scrollWidth)
  expect(wide).toBeLessThanOrEqual(390)
  await p.screenshot({ path: info.outputPath('run-phone.png') })
})

test('New’s place picker fits a phone', async ({ page: p }, info) => {
  await p.setViewportSize({ width: 390, height: 844 })
  await landing(p)
  await p.goto('/')
  await p.getByRole('button', { name: 'Where the run runs: Cloud' }).click()
  await expect(p.getByText('Set up remote control')).toBeVisible()
  const wide = await p.evaluate(() => document.documentElement.scrollWidth)
  expect(wide).toBeLessThanOrEqual(390)
  await p.screenshot({ path: info.outputPath('place-phone.png') })
})
