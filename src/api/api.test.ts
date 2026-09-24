/**
 * The transport contract: exact addresses, headers and bodies for every op the
 * builder calls, and what each makes of the answer. `fetch` is replaced per
 * test with a recorder that answers what the test says the platform answers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { call, query, Refusal, type Target } from './call.ts'
import * as coding from './coding.ts'
import * as git from './git.ts'
import * as github from './github.ts'
import { places, SANDBOX } from './places.ts'
import * as platform from './platform.ts'
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
      repos: [{ owner: 'hanzo-inc', name: 'cloud', full_name: 'hanzo-inc/cloud', private: true, default_branch: 'main', pushed_at: '2026-09-24T00:00:00Z', installation_id: 7 }],
      next: 'c2',
      total: 180,
      unread: ['hanzo-labs'],
      connected: true,
    })
    const page = await github.repos(T, { q: ' clo ', after: 'c1' })
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/provider/github/repos?q=clo&limit=50&after=c1')
    expect(page).toEqual({
      repos: [{ owner: 'hanzo-inc', name: 'cloud', full_name: 'hanzo-inc/cloud', private: true, default_branch: 'main', pushed_at: '2026-09-24T00:00:00Z', installation_id: 7 }],
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
    expect(coding.body({ prompt: ' fix it ', repo: 'hanzo-inc/cloud', base: 'main', targetId: '', mode: 'build' })).toEqual({
      prompt: 'fix it',
      repo: 'hanzo-inc/cloud',
      base: 'main',
      mode: 'build',
    })
  })

  it('starts a run and answers its session', async () => {
    const seen = answer(202, { sessionId: 'sess_1', repo: 'hanzo-inc/cloud', branch: 'agent/sess_1', project: 'cloud', routed: false, targetId: '' })
    const run = await coding.start(T, { prompt: 'fix the auth test', repo: 'hanzo-inc/cloud', base: 'main' })
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/agent/coding', body: { prompt: 'fix the auth test', repo: 'hanzo-inc/cloud', base: 'main' } })
    expect(run).toEqual({ session: 'sess_1', repo: 'hanzo-inc/cloud', branch: 'agent/sess_1', project: 'cloud', routed: false, target: '' })
  })

  it('refuses a plan ask the platform would run as a build, before sending', async () => {
    const seen = answer(202, { sessionId: 'sess_1' })
    await expect(coding.start(T, { prompt: 'what would it take', mode: 'plan' })).rejects.toMatchObject({ status: 400 })
    expect(seen).toHaveLength(0)
    expect(coding.unhonoured('build')).toBe('')
    expect(coding.unhonoured(undefined)).toBe('')
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
    const seen = answer(200, { targets: [{ id: 'tgt_1', label: 'dgx', kind: 'gpu', status: 'online', capacity: '1× GB10' }, { host: 'no-id' }] })
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
    expect(project({ slug: 'a', liveUrl: 'data:text/html,x', repo: { url: 'http://hanzo-git.hanzo.svc/hanzoai/font.git', branch: 'main' } })).toMatchObject({ live: '', repo: 'http://hanzo-git.hanzo.svc/hanzoai/font.git', branch: 'main' })
    expect(name('http://hanzo-git.hanzo.svc/hanzoai/font.git')).toBe('font')
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

  it('declares a repository into a project, on a branch by default', async () => {
    const seen = answer(202, {
      app: { name: 'site' },
      build: { id: 'bld_1', job: 'j', image: 'ghcr.io/hanzo/site:bld_1', status: 'building' },
      declaration: { mode: 'branch', ref: 'deploy/hanzo/site/bld_1', review: 'https://github.com/hanzoai/universe/compare/main...deploy', live: false },
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
  it('lists the catalog with the router first and batch lanes dropped', async () => {
    const seen = answer(200, { data: [{ id: 'zen5-coder' }, { id: 'anthropic/claude-opus-5.5' }, { id: 'anthropic/claude-opus-5.5:batch' }, { id: 'enso' }] })
    const { models } = await import('./models.ts')
    const list = await models(T)
    expect(seen[0].url).toBe('https://api.hanzo.ai/v1/models')
    expect(list).toEqual([
      { id: 'enso', label: 'Enso' },
      { id: 'zen5-coder', label: 'Zen5 Coder' },
      { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5' },
    ])
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

describe('ours', () => {
  it('keeps a project to the runs on its own repository', async () => {
    const { address, ours } = await import('./projects.ts')
    expect(address('https://github.com/hanzo-inc/Cloud.git')).toBe('hanzo-inc/Cloud')
    expect(address('http://hanzo-git.hanzo.svc/hanzoai/font')).toBe('hanzoai/font')
    expect(ours('hanzo-inc/cloud', 'https://github.com/hanzo-inc/Cloud.git')).toBe(true)
    expect(ours('font', 'http://hanzo-git.hanzo.svc/hanzoai/font')).toBe(true)
    expect(ours('mallory/cloud', 'https://github.com/hanzo-inc/cloud.git')).toBe(false)
    expect(ours('anything', '')).toBe(true)
  })
})
