/**
 * The transport contract: exact addresses, headers and bodies for every op the
 * builder calls, and what each makes of the answer. `fetch` is replaced per
 * test with a recorder that answers what the test says the platform answers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as changes from './changes.ts'
import { call, query, Refusal, type Target } from './call.ts'
import * as coding from './coding.ts'
import * as git from './git.ts'
import * as github from './github.ts'
import { places, SANDBOX } from './places.ts'
import * as platform from './platform.ts'
import * as sandbox from './sandbox.ts'
import { name, project, projects, safe } from './projects.ts'
import * as sessions from './sessions.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

interface Seen {
  url: string
  method: string
  headers: Headers
  body: unknown
}

function answer(status: number, body: unknown, type = 'application/json') {
  const seen: Seen[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({
        url,
        method: init.method ?? 'GET',
        headers: new Headers(init.headers),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': type },
      })
    }),
  )
  return seen
}

afterEach(() => vi.unstubAllGlobals())

describe('call', () => {
  it('carries the bearer and the org, and never caches', async () => {
    const seen = answer(200, { ok: true })
    await call(T, 'GET', '/v1/x')
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/x')
    expect(seen[0].headers.get('authorization')).toBe('Bearer tok')
    expect(seen[0].headers.get('x-org-id')).toBe('hanzo')
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
    expect(init.cache).toBe('no-store')
  })

  it('sends nothing it does not have', async () => {
    const seen = answer(200, {})
    await call({ api: 'https://a', token: () => null, org: null }, 'GET', '/v1/x')
    expect(seen[0].headers.has('authorization')).toBe(false)
    expect(seen[0].headers.has('x-org-id')).toBe(false)
  })

  it.each([
    [{ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'org admin required' }, 'org admin required'],
    [{ error: { message: 'bad repo' } }, 'bad repo'],
    [{ msg: 'legacy' }, 'legacy'],
  ])('reads a refusal in any envelope', async (body, text) => {
    answer(403, body, 'application/problem+json')
    await expect(call(T, 'POST', '/v1/x', {})).rejects.toMatchObject({ status: 403, message: text })
  })

  it('names the status when the refusal says nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })))
    const err = (await call(T, "GET", "/v1/agent/sessions?limit=1").catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(Refusal)
    expect(err.message).toBe('GET /v1/agent/sessions answered 502')
  })

  it('builds a query from the defined, non-empty values only', () => {
    expect(query({ a: 'x y', b: '', c: undefined, d: null, e: 0, f: false })).toBe('?a=x+y&e=0&f=false')
    expect(query({})).toBe('')
  })
})

describe('github', () => {
  it('pages repositories by cursor, with the search trimmed', async () => {
    const seen = answer(200, {
      repos: [{ owner: 'acme', name: 'cloud', full_name: 'acme/cloud', private: true, default_branch: 'main', pushed_at: '2026-09-24T00:00:00Z', installation_id: 7 }],
      next: 'c2',
      total: 180,
      unread: ['hanzo-labs'],
      connected: true,
    })
    const page = await github.repos(T, { q: ' clo ', after: 'c1' })
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/provider/github/repos?q=clo&limit=50&after=c1')
    expect(page).toEqual({
      repos: [{ owner: 'acme', name: 'cloud', full_name: 'acme/cloud', private: true, default_branch: 'main', pushed_at: '2026-09-24T00:00:00Z', installation_id: 7 }],
      next: 'c2',
      total: 180,
      unread: ['hanzo-labs'],
      connected: true,
    })
  })

  it('reads a thin row as empty values, and drops a row with no name', async () => {
    answer(200, { repos: [{ owner: 'a', name: 'b' }, { owner: 'x' }], connected: false })
    const page = await github.repos(T)
    expect(page.repos).toEqual([{ owner: 'a', name: 'b', full_name: 'a/b', private: false, default_branch: '', pushed_at: '', installation_id: 0 }])
    expect(page).toMatchObject({ next: '', total: 0, unread: [], connected: false })
  })

  it('escapes owner and name in the branches address', async () => {
    const seen = answer(200, { branches: [{ name: 'main', commit: '9f2c1e7a', default: true }, { name: '' }], next: '', total: 1 })
    const page = await github.branches(T, 'hanzo inc', 'cl/oud', { q: 'fe', limit: 20 })
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/provider/github/repos/hanzo%20inc/cl%2Foud/branches?q=fe&limit=20')
    expect(page).toEqual({ branches: [{ name: 'main', commit: '9f2c1e7a', default: true }], next: '', total: 1 })
  })

  it('connects only through a GitHub address', async () => {
    const seen = answer(200, { authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=x&state=y' })
    expect(await github.connect(T)).toBe('https://github.com/login/oauth/authorize?client_id=x&state=y')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/provider/github/user/connect', body: undefined })
    answer(200, { authorizeUrl: 'javascript:alert(1)' })
    await expect(github.connect(T)).rejects.toThrow('did not name a GitHub address')
    answer(200, { authorizeUrl: 'https://github.com.evil.example/x' })
    await expect(github.connect(T)).rejects.toThrow('did not name a GitHub address')
  })

  it('names the page GitHub returns to, and finishes the grant it hands back', async () => {
    const seen = answer(200, { authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=x&state=y' })
    await github.connect(T, 'https://hanzo.ai/?at=-/settings/integrations')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/provider/github/user/connect', body: { return: 'https://hanzo.ai/?at=-/settings/integrations' } })
    const done = answer(200, { configured: true, connected: true, login: 'octocat' })
    expect(await github.complete(T, '9f2c')).toEqual({ configured: true, connected: true, login: 'octocat' })
    expect(done[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/provider/github/user/complete', body: { grant: '9f2c' } })
    answer(404, { detail: 'no pending GitHub connection with that grant' })
    await expect(github.complete(T, 'stale')).rejects.toThrow('no pending GitHub connection with that grant')
  })

  it('reads a grant and the accounts it could not', async () => {
    answer(200, {
      repos: [
        { name: 'cloud', fullName: 'hanzoai/cloud', private: true, defaultBranch: 'main', imported: true, syncStatus: 'synced' },
        { name: 'ai', fullName: 'hanzo-apps/ai', imported: false },
        { name: '' },
      ],
      unread: ['joehughesjr', ''],
    })
    const page = await github.grants(T)
    expect(page.repos).toEqual([
      { owner: 'hanzoai', name: 'cloud', fullName: 'hanzoai/cloud', private: true, branch: 'main', imported: true, status: 'synced' },
      { owner: 'hanzo-apps', name: 'ai', fullName: 'hanzo-apps/ai', private: false, branch: 'main', imported: false, status: '' },
    ])
    expect(github.accounts(page)).toEqual([
      { name: 'hanzo-apps', count: 1, blocked: false },
      { name: 'hanzoai', count: 1, blocked: false },
      { name: 'joehughesjr', count: 0, blocked: true },
    ])
  })

  it('queues a mirror by owner and name', async () => {
    const seen = answer(202, { queued: 2, repos: ['hanzoai/cloud', 'hanzoai/ai'] })
    expect(await github.bring(T, ['hanzoai/cloud', ' hanzoai/ai '])).toBe(2)
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.hanzo.ai/v1/provider/github/repos/import',
      body: { repos: ['hanzoai/cloud', 'hanzoai/ai'] },
    })
    await expect(github.bring(T, ['  '])).rejects.toThrow('Choose a repository first')
  })

  it('reads the connection and disconnects', async () => {
    answer(200, { configured: true, connected: true, login: 'zeekay', connectedAt: '2026-09-24T12:00:00Z' })
    expect(await github.connection(T)).toEqual({ configured: true, connected: true, login: 'zeekay' })
    const seen = answer(200, { disconnected: true })
    await github.disconnect(T)
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/provider/github/user/disconnect' })
  })
})

describe('coding', () => {
  it('sends only what was asked', () => {
    expect(coding.body({ prompt: ' fix it ', repo: 'acme/cloud', base: 'main', targetId: '', mode: 'build' })).toEqual({
      prompt: 'fix it',
      repo: 'acme/cloud',
      base: 'main',
      mode: 'build',
      desktop: true,
    })
    expect(coding.body({ prompt: 'fix it', targetId: 'tgt_1' })).toEqual({ prompt: 'fix it', targetId: 'tgt_1' })
  })

  it('starts a run and answers its session', async () => {
    const seen = answer(202, { sessionId: 'sess_1', repo: 'acme/cloud', branch: 'agent/sess_1', project: 'cloud', routed: false, targetId: '' })
    const run = await coding.start(T, { prompt: 'fix the auth test', repo: 'acme/cloud', base: 'main' })
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/agent/coding', body: { prompt: 'fix the auth test', repo: 'acme/cloud', base: 'main', desktop: true } })
    expect(run).toEqual({ session: 'sess_1', repo: 'acme/cloud', branch: 'agent/sess_1', routed: false, target: '' })
  })

  it('sends a plan to the sandbox with its model and effort', async () => {
    const seen = answer(202, { sessionId: 'sess_1' })
    await coding.start(T, { prompt: 'what would it take', mode: 'plan', model: 'zen6-coder', effort: 'high' })
    expect(seen[0]).toMatchObject({ body: { prompt: 'what would it take', mode: 'plan', model: 'zen6-coder', effort: 'high' } })
    expect(coding.unhonoured('plan')).toBe('')
    expect(coding.unhonoured('build', 'tgt_1')).toBe('')
    expect(coding.unhonoured(undefined)).toBe('')
  })

  it('refuses a plan routed to a machine, before sending', async () => {
    const seen = answer(202, { sessionId: 'sess_1' })
    await expect(coding.start(T, { prompt: 'what would it take', mode: 'plan', targetId: 'tgt_1' })).rejects.toMatchObject({ status: 400 })
    expect(seen).toHaveLength(0)
    expect(coding.unhonoured('plan', 'tgt_1')).toMatch(/sandbox/)
  })

  it('refuses an admitted run with no session, and an empty ask before sending', async () => {
    answer(202, { repo: 'x' })
    await expect(coding.start(T, { prompt: 'x' })).rejects.toMatchObject({ status: 502 })
    const seen = answer(202, {})
    await expect(coding.start(T, { prompt: '  ' })).rejects.toMatchObject({ status: 400 })
    expect(seen).toHaveLength(0)
  })
})

describe('sessions', () => {
  it('lists coding runs newest first as the platform orders them', async () => {
    const seen = answer(200, { sessions: [{ id: 'sess_2', title: 'b', status: 'running' }, { title: 'no id' }] })
    const rows = await sessions.list(T, { kind: 'coding', limit: 30 })
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/agent/sessions?kind=coding&limit=30')
    expect(rows.map((r) => r.id)).toEqual(['sess_2'])
  })

  it('reads one run with its recent events', async () => {
    const seen = answer(200, { id: 'sess_1', status: 'done', recentEvents: [{ id: 'e1', seq: 1, kind: 'status', payload: { status: 'started' } }] })
    const d = await sessions.get(T, 'sess_1')
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/agent/sessions/sess_1')
    expect(d.recent[0]).toMatchObject({ id: 'e1', seq: 1, kind: 'status' })
  })

  it('steers and stops with the reason as the message', async () => {
    const seen = answer(200, { command: 'message' })
    await sessions.message(T, 'sess_1', ' use the staging key ')
    await sessions.stop(T, 'sess_1')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/agent/sessions/sess_1/message', body: { message: 'use the staging key' } })
    expect(seen[1]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/agent/sessions/sess_1/stop', body: { message: 'Stopped from the builder' } })
    await expect(sessions.message(T, 'sess_1', ' ')).rejects.toMatchObject({ status: 400 })
  })
})

describe('places, projects, git, platform', () => {
  it('puts the sandbox first and keeps every machine the org registered', async () => {
    const seen = answer(200, { targets: [{ id: 'tgt_1', label: 'dgx', kind: 'gpu', status: 'online', capacity: '1× GB10', metricsAt: '2026-09-27T11:59:40Z' }, { host: 'no-id' }] })
    const list = await places(T)
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/agent/targets')
    expect(list).toEqual([SANDBOX, { id: 'tgt_1', label: 'dgx', kind: 'gpu', status: 'online', capacity: '1× GB10' }])
  })

  it('frames only an https (or loopback) address', () => {
    expect(safe('https://chat2.hanzo.app')).toBe('https://chat2.hanzo.app/')
    expect(safe('http://localhost:3000/x', true)).toBe('http://localhost:3000/x')
    expect(safe('http://localhost:3000/x', false)).toBe('')
    expect(safe('javascript:alert(1)')).toBe('')
    expect(safe('http://evil.example')).toBe('')
    expect(project({ slug: 'a', liveUrl: 'data:text/html,x', repo: { url: 'http://git.example.com/hanzoai/font.git', branch: 'main' } })).toMatchObject({ live: '', repo: 'http://git.example.com/hanzoai/font.git', branch: 'main' })
    expect(name('http://git.example.com/hanzoai/font.git')).toBe('font')
  })

  it('lists projects most recently changed first', async () => {
    answer(200, [{ slug: 'old', updatedAt: 1 }, { slug: 'new', updatedAt: 9 }, { name: 'no slug' }])
    expect((await projects(T)).map((p) => p.slug)).toEqual(['new', 'old'])
  })

  it('reads a directory and a file at a ref', async () => {
    const seen = answer(200, { entries: [{ name: 'src', path: 'src', type: 'tree' }, { name: 'go.mod', path: 'go.mod', type: 'blob', size: 42 }] })
    expect(await git.tree(T, 'cloud', 'agent/sess_1')).toEqual([
      { name: 'src', path: 'src', dir: true, size: 0 },
      { name: 'go.mod', path: 'go.mod', dir: false, size: 42 },
    ])
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/git/repos/cloud/tree?ref=agent%2Fsess_1')
    answer(200, { path: 'big.bin', binary: true, content: 'AAAA', size: 3 })
    expect(await git.blob(T, 'cloud', 'main', 'big.bin')).toEqual({ path: 'big.bin', text: '', binary: true, truncated: false, size: 3 })
  })

  it('declares a repository into a project, on a branch by default, with what the platform says of the review', async () => {
    const REVIEW =
      'This deploy opened a review: the declaration is on a branch of universe and deploys nothing until it is merged. The branch is deleted once main declares this tag, or after 7 days if it is not merged.'
    const seen = answer(202, {
      app: { name: 'site' },
      build: { id: 'bld_1', job: 'j', image: 'ghcr.io/hanzo/site:bld_1', status: 'building' },
      declaration: { mode: 'branch', ref: 'deploy/hanzo/site/bld_1', review: 'https://github.com/hanzoai/universe/compare/main...deploy', live: false },
      notice: REVIEW,
    })
    const out = await platform.declare(T, { repo: platform.clone('acme/Site'), ref: '', name: 'Site!', project: 'My Shop', mode: 'branch' })
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.hanzo.ai/v1/platform/apps',
      body: { repo: 'https://github.com/acme/Site.git', ref: 'main', name: 'site', partOf: 'my-shop', mode: 'branch' },
    })
    expect(out).toEqual({
      build: { id: 'bld_1', job: 'j', image: 'ghcr.io/hanzo/site:bld_1', status: 'building' },
      mode: 'branch',
      ref: 'deploy/hanzo/site/bld_1',
      review: 'https://github.com/hanzoai/universe/compare/main...deploy',
      live: false,
      notice: REVIEW,
    })
  })

  it('never shows a review link that is not https', async () => {
    answer(202, { declaration: { review: 'javascript:alert(1)' } })
    expect((await platform.declare(T, { repo: 'r', ref: 'main', name: 'a', project: 'a', mode: 'branch' })).review).toBe('')
    expect(platform.label('--Ünïcode__App--')).toBe('n-code-app')
    expect(platform.label('!!!')).toBe('app')
  })
})

describe('templates', () => {
  it('reads the public catalog with no bearer and no org', async () => {
    const seen = answer(200, { data: [{ slug: 'shop', title: 'Shop', source: 'https://github.com/hanzoai/shop' }, { title: 'no slug' }] })
    const { templates } = await import('./projects.ts')
    const list = await templates(T)
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/templates')
    expect(seen[0].headers.has('authorization')).toBe(false)
    expect(seen[0].headers.has('x-org-id')).toBe(false)
    expect(list.map((x) => x.slug)).toEqual(['shop'])
  })

  it('forks a starter into a project', async () => {
    const seen = answer(201, { slug: 'shop', name: 'shop', liveUrl: 'https://shop.hanzo.app' })
    const { fork } = await import('./projects.ts')
    expect((await fork(T, 'shop')).live).toBe('https://shop.hanzo.app/')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/projects/fork', body: { slug: 'shop' } })
  })
})

describe('models', () => {
  it('reads the catalog at /v1/models, every row it lists, and the limits at /v1/ai/limits', async () => {
    const seen = answer(200, { data: [{ id: 'zen5-coder', family: 'zen', class: 'ours' }, { id: 'anthropic/claude-opus-5.5', class: 'premium' }] })
    const { models, limits } = await import('./models.ts')
    const list = await models(T)
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/models')
    expect(list).toEqual([
      { id: 'zen5-coder', family: 'zen', class: 'ours' },
      { id: 'anthropic/claude-opus-5.5', class: 'premium' },
    ])
    const asked = answer(200, { plan: '' })
    expect(await limits(T)).toEqual({ plan: '' })
    expect(asked[0].url).toBe('https://api.hanzo.ai/v1/ai/limits')
  })
})

describe('verdict', () => {
  it('records a verdict on the event bus and says when it did not land', async () => {
    const seen = answer(200, { accepted: 1, dropped: 0 })
    const { verdict } = await import('./verdict.ts')
    await verdict(T, 'sess_1', 'shop', 'up')
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.hanzo.ai/v1/event',
      body: { type: 'track', event: 'build.verdict', sessionId: 'sess_1', properties: { verdict: 'up', project: 'shop' } },
    })
    answer(200, { accepted: 0, dropped: 1 })
    await expect(verdict(T, 'sess_1', 'shop', 'down')).rejects.toThrow('not recorded')
  })
})

describe('forge', () => {
  it('lists codebases and maps one onto the chip', async () => {
    const seen = answer(200, {
      data: [
        { org: 'hanzo', name: 'cloud', defaultBranch: 'main', public: false, cloneUrl: 'https://api.hanzo.ai/v1/git/hanzo/cloud.git', description: 'the platform' },
        { name: '' },
      ],
    })
    const { asRepo, codebases } = await import('./codebases.ts')
    const list = await codebases(T, 'clo')
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/git/repos')
    expect(list.map((c) => c.name)).toEqual(['cloud'])
    expect(asRepo(list[0])).toMatchObject({ full_name: 'hanzo/cloud', forge: true, default_branch: 'main', private: true })
  })

  it('creates a repository by name and refuses a path', async () => {
    const seen = answer(201, { name: 'notes', defaultBranch: 'main', org: 'hanzo' })
    const { create } = await import('./codebases.ts')
    const row = await create(T, 'notes', 'scratch')
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/git/repos')
    expect(seen[0].body).toEqual({ name: 'notes', description: 'scratch' })
    expect(row.name).toBe('notes')
    await expect(create(T, 'hanzo/notes')).rejects.toThrow(/name/)
  })

  it('reads a codebase with its branches', async () => {
    answer(200, { name: 'cloud', defaultBranch: 'main', branches: ['main', 'agent/1'] })
    const { one } = await import('./codebases.ts')
    const got = await one(T, 'cloud')
    expect(got?.branches).toEqual(['main', 'agent/1'])
  })

  it('lists boards and a board\'s issues from the forge', async () => {
    const seen = answer(200, [{ key: 'cloud', name: 'cloud', id: 'hanzo/cloud' }])
    const { boards, issues } = await import('./work.ts')
    expect((await boards(T)).map((b) => b.key)).toEqual(['cloud'])
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/task/projects')

    const issuesSeen = answer(200, [{ projectKey: 'cloud', number: 4, title: 'Ship it', status: 'todo', identifier: 'cloud#4', repo: 'cloud' }])
    const rows = await issues(T, 'cloud')
    expect(issuesSeen[0].url).toBe('https://api.hanzo.ai/v1/task/projects/cloud/issues')
    expect(rows[0]).toMatchObject({ identifier: 'cloud#4', repo: 'cloud', status: 'todo' })

    const all = answer(200, [])
    await issues(T)
    expect(all[0].url).toBe('https://api.hanzo.ai/v1/task/board')
  })
})

describe('automations', () => {
  const ROW = {
    id: 'flow_1',
    name: 'Morning brief',
    instructions: 'Summarize my day.',
    project: null,
    model: 'zen5',
    schedule: { kind: 'weekdays', at: '08:00', tz: 'America/Los_Angeles' },
    permissions: 'ask',
    notify: true,
    postTo: [],
    enabled: true,
    draft: false,
    next: '2026-10-05T15:00:00Z',
    last: { id: 'run_1', status: 'succeeded', at: '2026-10-04T15:00:00Z', summary: 'Three meetings.' },
    created: '2026-10-01T00:00:00Z',
    updated: '2026-10-02T00:00:00Z',
  }

  it('lists the org\'s automations as the platform says them', async () => {
    const seen = answer(200, { data: [ROW, { id: 'flow_2', name: 'trial', draft: true, schedule: { kind: 'manual', tz: 'UTC' } }, { name: 'no id' }] })
    const { automations } = await import('./auto.ts')
    const rows = await automations(T)
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/auto/automations')
    expect(seen[0].headers.get('x-org-id')).toBe('hanzo')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(ROW)
    expect(rows[1]).toMatchObject({ id: 'flow_2', name: 'trial', draft: true, instructions: '', enabled: false, model: null, permissions: 'ask', last: null })
  })

  it('creates one with what the editor holds, and reads one by id', async () => {
    const seen = answer(201, ROW)
    const { create, automation } = await import('./auto.ts')
    const d = { name: 'Morning brief', instructions: 'Summarize my day.', model: null, schedule: { kind: 'weekdays', at: '08:00', tz: 'America/Los_Angeles' }, permissions: 'ask', notify: true, postTo: [] as string[], enabled: false } as const
    expect((await create(T, d)).id).toBe('flow_1')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/auto/automations', body: d })
    const one = answer(200, ROW)
    await automation(T, 'flow_1')
    expect(one[0].url).toBe('https://api.hanzo.ai/v1/auto/automations/flow_1')
  })

  it('sends a change as only what changed, and switches by enabled alone', async () => {
    const { changes, save } = await import('./auto.ts')
    const was = { name: 'Morning brief', instructions: 'Summarize my day.', model: 'zen5' as string | null, schedule: { kind: 'weekdays' as const, at: '08:00', tz: 'America/Los_Angeles' }, permissions: 'ask' as const, notify: true, postTo: [] as string[], enabled: true }
    expect(changes(was, { ...was })).toEqual({})
    expect(changes(was, { ...was, enabled: false })).toEqual({ enabled: false })
    expect(changes(was, { ...was, model: null, schedule: { kind: 'daily' as const, at: '09:00', tz: 'UTC' } })).toEqual({ model: null, schedule: { kind: 'daily', at: '09:00', tz: 'UTC' } })
    const seen = answer(200, ROW)
    await save(T, 'flow_1', { enabled: false })
    expect(seen[0]).toMatchObject({ method: 'PATCH', url: 'https://api.hanzo.ai/v1/auto/automations/flow_1', body: { enabled: false } })
  })

  it('runs one now, reads its runs, and deletes it', async () => {
    const { remove, runs, start } = await import('./auto.ts')
    const started = answer(201, { run: { id: 'run_2', status: 'running' } })
    expect(await start(T, 'flow_1')).toEqual({ id: 'run_2', status: 'running' })
    expect(started[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/auto/automations/flow_1/run' })
    const listed = answer(200, {
      data: [
        { id: 'run_2', status: 'failed', at: '2026-10-04T15:00:00Z', finished: '2026-10-04T15:02:00Z', summary: 'Failed: no sandbox.', transcript: 'https://hanzo.ai/dev?run=sess_0992f90537264a6b154ebff799f38e1c' },
        { id: 'run_1', status: 'skipped', at: '2026-10-04T14:00:00Z', finished: null, summary: 'Skipped: the previous run was still going.', transcript: null },
      ],
    })
    const rows = await runs(T, 'flow_1')
    expect(listed[0].url).toBe('https://api.hanzo.ai/v1/auto/automations/flow_1/runs')
    expect(rows[0]).toMatchObject({ id: 'run_2', status: 'failed', session: 'sess_0992f90537264a6b154ebff799f38e1c' })
    expect(rows[1]).toMatchObject({ id: 'run_1', status: 'skipped', session: null })
    const gone = answer(204, undefined)
    await remove(T, 'flow_1')
    expect(gone[0]).toMatchObject({ method: 'DELETE', url: 'https://api.hanzo.ai/v1/auto/automations/flow_1' })
  })

  it('carries where an automation posts, reads a run\'s post and where it went, and answers a review', async () => {
    const { read, runs, review } = await import('./auto.ts')
    expect(read({ id: 'flow_1', postTo: ['x', 'linkedin', 7] })?.postTo).toEqual(['x', 'linkedin'])
    expect(read({ id: 'flow_1' })?.postTo).toEqual([])
    answer(200, {
      data: [
        { id: 'run_1', status: 'review', at: '2026-10-04T15:00:00Z', summary: 'Waiting for your review: post it or discard it.', draft: 'Shipped three things.', posts: [] },
        { id: 'run_0', status: 'succeeded', at: '2026-10-03T15:00:00Z', draft: 'Hello.', posts: [{ to: 'x', url: 'https://x.com/i/status/1' }, { to: 'linkedin', error: 'LinkedIn is not connected' }, { url: 'nowhere' }] },
      ],
    })
    const rows = await runs(T, 'flow_1')
    expect(rows[0]).toMatchObject({ status: 'review', draft: 'Shipped three things.', posts: [] })
    expect(rows[1].posts).toEqual([
      { to: 'x', url: 'https://x.com/i/status/1', error: '' },
      { to: 'linkedin', url: '', error: 'LinkedIn is not connected' },
    ])
    const seen = answer(200, { id: 'run_1', status: 'running', posts: [] })
    expect((await review(T, 'flow_1', 'run_1', true)).status).toBe('running')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/auto/automations/flow_1/runs/run_1/review', body: { post: true } })
  })

  it('connects a social account only at its own consent page', async () => {
    const { authorize, SOCIAL } = await import('./provider.ts')
    expect(SOCIAL.map((s) => s.id)).toEqual(['x', 'linkedin', 'facebook', 'instagram', 'tiktok'])
    expect(SOCIAL.filter((s) => s.posts).map((s) => s.id)).toEqual(['x', 'linkedin', 'facebook'])
    answer(200, { authorizeUrl: 'https://twitter.com/i/oauth2/authorize?client_id=a' })
    expect(await authorize(T, 'x', 'https://hanzo.ai/?at=-/settings/integrations')).toContain('twitter.com')
    answer(200, { authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization?x=1' })
    expect(await authorize(T, 'linkedin')).toContain('linkedin.com')
    answer(200, { authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth?x=1' })
    expect(await authorize(T, 'facebook')).toContain('facebook.com')
    answer(200, { authorizeUrl: 'https://evil.example/oauth' })
    await expect(authorize(T, 'x')).rejects.toThrow('did not name a x address')
  })

  it('reads the starters from /v1/auto/templates', async () => {
    const seen = answer(200, { data: [{ key: 'review', name: 'Weekly review', description: 'Fridays.', instructions: 'Summarize my week.', schedule: { kind: 'weekly', day: 'fri', at: '16:00' }, icon: 'list-checks' }, { name: 'no key' }] })
    const { starters } = await import('./auto.ts')
    expect(await starters(T)).toEqual([{ key: 'review', name: 'Weekly review', description: 'Fridays.', instructions: 'Summarize my week.', schedule: { kind: 'weekly', day: 'fri', at: '16:00' } }])
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/auto/templates')
  })

  it('says a schedule the way a person does', async () => {
    const { words } = await import('./auto.ts')
    expect(words({ kind: 'manual', tz: 'UTC' })).toBe('When you run it')
    expect(words({ kind: 'hourly', at: '00:15', tz: 'UTC' })).toBe('Every hour at :15')
    expect(words({ kind: 'daily', at: '09:00', tz: 'Europe/London' })).toBe('Every day at 09:00 · Europe/London')
    expect(words({ kind: 'weekdays', at: '08:00', tz: 'UTC' })).toBe('Weekdays at 08:00 · UTC')
    expect(words({ kind: 'weekly', day: 'fri', at: '16:00', tz: 'UTC' })).toBe('Fridays at 16:00 · UTC')
    expect(words({ kind: 'cron', cron: '30 7 * * 1-5', tz: 'UTC' })).toBe('Cron 30 7 * * 1-5 · UTC')
  })
})

describe('ours', () => {
  it('keeps a project to the runs on its own repository', async () => {
    const { address, ours } = await import('./projects.ts')
    expect(address('https://github.com/acme/Cloud.git')).toBe('acme/Cloud')
    expect(address('http://git.example.com/hanzoai/font')).toBe('hanzoai/font')
    expect(ours('acme/cloud', 'https://github.com/acme/Cloud.git')).toBe(true)
    expect(ours('font', 'http://git.example.com/hanzoai/font')).toBe(true)
    expect(ours('mallory/cloud', 'https://github.com/acme/cloud.git')).toBe(false)
    expect(ours('anything', '')).toBe(true)
  })
})

describe('a run\'s sandbox', () => {
  it('frames a door at the address its ticket names, a shell reattaching by name', async () => {
    const seen = answer(201, { ticket: 'k', expiresIn: 30, url: '/v1/sandbox/m_1/terminal?ticket=k' })
    expect(await sandbox.door(T, 'm_1', 'terminal', 'run-abc')).toBe('https://api.hanzo.ai/v1/sandbox/m_1/terminal?ticket=k&arg=run-abc')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/sandbox/m_1/terminal/ticket' })
    answer(201, { url: '/v1/sandbox/m_1/screen?ticket=s' })
    expect(await sandbox.door(T, 'm_1', 'screen', 'run-abc')).toBe('https://api.hanzo.ai/v1/sandbox/m_1/screen?ticket=s')
    answer(201, { url: 'https://elsewhere.example/x' })
    await expect(sandbox.door(T, 'm_1', 'screen')).rejects.toBeInstanceOf(Refusal)
  })

  it('reads a directory as names and a file as text', async () => {
    const seen = answer(200, { path: '/work', dir: true, entries: ['src', '.env', 'README.md'] })
    expect(await sandbox.read(T, 'm_1', '')).toMatchObject({ dir: true, names: ['.env', 'README.md', 'src'] })
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/sandbox/read', body: { id: 'm_1', path: '' } })
    answer(200, { path: '/work/README.md', data: btoa('# hi\n') })
    expect(await sandbox.read(T, 'm_1', 'README.md')).toMatchObject({ dir: false, text: '# hi\n', binary: false })
    answer(200, { path: '/work/a.bin', data: btoa('\u0000\u0001') })
    expect(await sandbox.read(T, 'm_1', 'a.bin')).toMatchObject({ binary: true, text: '' })
  })
})

describe('a run\'s changes', () => {
  it('reads commits, patches and the pull request, dropping what it cannot name', async () => {
    const seen = answer(200, {
      repo: 'hanzoai/universe',
      base: 'main',
      head: 'agent/ab12',
      commits: [{ sha: 'a1b2c3d4', message: 'add the widget', author: 'Hanzo Dev', date: '2026-09-27T10:00:00Z' }, { message: 'no sha' }],
      files: [
        { path: 'b.go', from: 'a.go', status: 'renamed', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' },
        { path: 'c.go', status: 'weird', additions: 2 },
      ],
      pull: { number: 7, url: 'https://git.hanzo.ai/hanzoai/universe/pulls/7', title: 'Add the widget', state: 'open', mergeable: true, reviews: [{ author: 'z', state: 'APPROVED', body: 'ship it', at: '2026-09-27T11:00:00Z' }] },
    })
    const c = await changes.read(T, 'sess_1')
    expect(seen[0]).toMatchObject({ method: 'GET', url: 'https://api.hanzo.ai/v1/agent/coding/sess_1/changes' })
    expect(c.commits).toHaveLength(1)
    expect(c.files[0]).toMatchObject({ path: 'b.go', from: 'a.go', status: 'renamed' })
    expect(c.files[1]).toMatchObject({ status: 'modified', deletions: 0, patch: '' })
    expect(c.pull).toMatchObject({ number: 7, state: 'open', mergeable: true, reviews: [{ author: 'z', state: 'APPROVED' }] })
  })

  it('answers empty before the run pushes', () => {
    expect(changes.changes({ repo: 'hanzoai/universe', base: 'main', head: 'agent/ab12', commits: [], files: [], pull: null })).toMatchObject({ commits: [], files: [], pull: null })
  })

  it('reads the branch in /v1/git\'s shapes', async () => {
    const seen = answer(200, { ref: 'agent/ab12', entries: [{ name: 'src', path: 'src', type: 'tree', size: 0 }] })
    expect(await changes.tree(T, 'sess_1', 'src')).toEqual([{ name: 'src', path: 'src', dir: true, size: 0 }])
    expect(seen[0]).toMatchObject({ url: 'https://api.hanzo.ai/v1/agent/coding/sess_1/tree?path=src' })
  })
})

describe('how long setup takes', () => {
  const run = (mode: string, minutes: number, status = 'done') =>
    sessions.session({ id: `s${minutes}`, mode, status, createdAt: '2026-09-27T10:00:00Z', endedAt: new Date(Date.parse('2026-09-27T10:00:00Z') + minutes * 60_000).toISOString() })

  it('says the median and the ninetieth percentile of finished setup runs', () => {
    expect(sessions.took([run('setup', 4), run('setup', 6), run('setup', 9), run('setup', 18), run('build', 60), run('setup', 99, 'error')], 'setup')).toEqual([9, 18])
  })

  it('says nothing under three', () => {
    expect(sessions.took([run('setup', 4), run('setup', 6)], 'setup')).toBeNull()
  })
})
