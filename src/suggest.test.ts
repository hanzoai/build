import { describe, expect, it } from 'vitest'

import type { Automation } from './api/auto.ts'
import { prefs } from './api/pref.ts'
import type { Session } from './api/sessions.ts'
import type { Issue } from './merge.ts'
import {
  answer,
  DAY,
  dismissed,
  due,
  hash,
  idOf,
  inputs,
  MODEL,
  QUIET,
  REMEMBER,
  request,
  SCHEMA,
  seed,
  shown,
  fill,
  STARTERS,
  sig,
  skip,
  stale,
  kept,
  type Input,
  type Kept,
} from './suggest.ts'

const PR = 'https://github.com/hanzo-inc/app/pull/29'
const BUG = 'https://github.com/hanzo-inc/kai/issues/12'
const FORGE = 'https://git.hanzo.ai/hanzoai/git/issues/1'

const issue = (o: Partial<Issue>): Issue => ({
  key: o.url ?? 'k',
  repo: '',
  forge: '',
  hint: '',
  number: 1,
  title: 'An issue',
  body: '',
  state: 'open',
  labels: [],
  assignees: [],
  url: '',
  sources: ['github'],
  updated: '2026-10-19T10:00:00Z',
  created: '',
  kind: 'issue',
  status: 'todo',
  priority: 'none',
  pull: false,
  board: '',
  ...o,
})

const run = (o: Partial<Session>): Session => ({
  id: 'sess_1',
  title: 'A run',
  status: 'done',
  agent: 'hanzo',
  actor: 'acme/u1',
  repo: 'acme/app',
  project: '',
  target: '',
  kind: 'coding',
  base: 'main',
  branch: 'agent/x',
  environment: 'sandbox',
  mode: 'build',
  pr: '',
  sandbox: '',
  org: 'acme',
  published: false,
  events: 3,
  createdAt: '2026-10-19T09:00:00Z',
  updatedAt: '2026-10-19T09:30:00Z',
  endedAt: '',
  ...o,
})

const flow = (o: Partial<Automation>): Automation => ({
  id: 'auto_1',
  name: 'Monday brief',
  instructions: 'Brief me every Monday on adoption signals.\nKeep it short.',
  model: null,
  schedule: { kind: 'weekly', at: '09:00', day: 'mon' },
  permissions: 'ask',
  notify: true,
  postTo: [],
  enabled: true,
  source: 'chat',
  project: null,
  draft: false,
  next: null,
  last: null,
  created: '2026-10-01T00:00:00Z',
  updated: '2026-10-18T00:00:00Z',
  ...o,
})

const NONE = { conversations: [], issues: [], runs: [], automations: [], files: [], me: 'acme/u1' }

const SOME: Input[] = [
  { kind: 'pull', key: PR, title: 'Login redirects new emails to /signup', state: 'closed', text: 'hanzo-inc/app', href: PR, updated: '2026-10-20T08:00:00Z' },
  { kind: 'issue', key: BUG, title: 'Kai P0 mapping bug', state: 'todo', text: 'hanzo-inc/kai', href: BUG, updated: '2026-10-19T08:00:00Z' },
  { kind: 'conversation', key: 'c1', title: 'Enso sales targets', state: '', text: '', href: '', updated: '2026-10-18T08:00:00Z' },
]

/** A chat completion whose first choice says `text`. */
const said = (text: string) => ({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }] })
const rows = (...r: object[]) => said(JSON.stringify({ rows: r }))
const ROW = { icon: 'github', title: 'Hanzo app login fixes landed', href: PR, summary: 'PR #29 closed.', action: 'Verify the user flow', prompt: `Check the login flow ${PR} changed.` }

describe('what the model reads', () => {
  it('is the person’s activity: their own runs, a GitHub address kept, the forge’s too, a draft automation left out', () => {
    const got = inputs({
      ...NONE,
      issues: [issue({ url: BUG, title: 'Kai P0 mapping bug', repo: 'hanzo-inc/kai', body: '\n\nThe mapping drops rows.\nMore.' }), issue({ url: FORGE, title: 'Resolver panic', state: 'closed', updated: '2026-10-10T00:00:00Z' })],
      runs: [run({ id: 'sess_mine', pr: PR }), run({ id: 'sess_theirs', actor: 'acme/u2' })],
      automations: [flow({}), flow({ id: 'auto_2', draft: true })],
      conversations: [{ id: 'c1', title: 'Enso sales targets', updated: '2026-10-20T07:00:00Z', pinned: false }],
    })
    expect(got.map((i) => [i.kind, i.key, i.state, i.href])).toEqual([
      ['conversation', 'c1', '', ''],
      ['issue', BUG, 'todo', BUG],
      ['run', 'sess_mine', 'done', PR],
      ['automation', 'auto_1', 'on', ''],
      ['issue', FORGE, 'closed', FORGE],
    ])
    expect(got.find((i) => i.key === BUG)?.text).toBe('hanzo-inc/kai: The mapping drops rows.')
    expect(got.find((i) => i.kind === 'automation')?.text).toBe('Brief me every Monday on adoption signals.')
  })

  it('reads no run without knowing who the person is', () => {
    expect(inputs({ ...NONE, me: '', runs: [run({ actor: '' })] })).toEqual([])
  })

  it('takes each kind’s newest few', () => {
    const many = Array.from({ length: 20 }, (_, n) => ({ id: `c${n}`, title: `Talk ${n}`, updated: `2026-10-${String(n + 1).padStart(2, '0')}T00:00:00Z`, pinned: false }))
    const got = inputs({ ...NONE, conversations: many })
    expect(got).toHaveLength(8)
    expect(got[0]!.key).toBe('c19')
  })

  it('seeds from signup and Settings', () => {
    expect(seed({ callName: 'Z', work: ' Engineering ', instructions: '' }, { onboarding: { role: 'Software engineer', use: 'team', plan: 'pro' }, terms: {} })).toEqual({
      name: 'Z',
      work: 'Engineering',
      role: 'Software engineer',
      use: 'team',
    })
    expect(seed({}, null)).toEqual({})
  })
})

describe('the request', () => {
  it('asks Hanzo’s model under a strict schema, and nothing when there is nothing', () => {
    expect(request([], {}, [], new Date('2026-10-20T00:00:00Z'))).toBeNull()
    const r = request(SOME, { role: 'Software engineer' }, [BUG], new Date('2026-10-20T00:00:00Z'))!
    expect(r.model).toBe(MODEL)
    expect(r.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'suggestions', strict: true, schema: SCHEMA } })
    const user = JSON.parse((r.messages as { content: string }[])[1]!.content)
    expect(user.today).toBe('2026-10-20')
    expect(user.person).toEqual({ role: 'Software engineer' })
    expect(user.skip).toEqual([BUG])
    expect(user.activity[0]).toEqual({ kind: 'pull', title: 'Login redirects new emails to /signup', state: 'closed', text: 'hanzo-inc/app', href: PR, updated: '2026-10-20' })
  })

  it('seeds an account with no activity from signup alone', () => {
    const r = request([], { work: 'Design' }, [], new Date())!
    expect(JSON.parse((r.messages as { content: string }[])[1]!.content).activity).toEqual([])
  })
})

describe('the answer', () => {
  it('is the rows, each with its source’s icon and a stable id', () => {
    const got = answer(rows(ROW, { ...ROW, icon: 'chat', title: 'Kai P0 mapping bug is open', href: BUG, action: 'Audit the fix path.' }), SOME)
    expect(got).toEqual([
      { id: hash(PR), icon: 'github', title: 'Hanzo app login fixes landed', href: PR, summary: 'PR #29 closed.', action: 'Verify the user flow', prompt: ROW.prompt },
      { id: hash(BUG), icon: 'github', title: 'Kai P0 mapping bug is open', href: BUG, summary: 'PR #29 closed.', action: 'Audit the fix path', prompt: ROW.prompt },
    ])
  })

  it('drops a row whose address is not an input’s, or that lacks a field', () => {
    expect(answer(rows({ ...ROW, href: 'https://github.com/elsewhere/x/pull/1' }), SOME)).toEqual([])
    expect(answer(rows({ ...ROW, href: 'javascript:alert(1)' }), SOME)).toEqual([])
    expect(answer(rows({ ...ROW, prompt: ' ' }), SOME)).toEqual([])
    expect(answer(rows({ ...ROW, action: '' }), SOME)).toEqual([])
  })

  it('keeps a row with no address, its icon as said, chat for an unknown one, never GitHub’s mark', () => {
    const got = answer(rows({ ...ROW, href: '', icon: 'agent', title: 'Monday brief' }, { ...ROW, href: '', icon: 'robot', title: 'Other' }, { ...ROW, href: '', icon: 'github', title: 'Issue' }), SOME)
    expect(got.map((r) => [r.icon, r.href, r.id])).toEqual([
      ['agent', '', idOf('', 'Monday brief')],
      ['chat', '', idOf('', 'Other')],
      ['task', '', idOf('', 'Issue')],
    ])
  })

  it('is one row a source, three at most', () => {
    expect(answer(rows(ROW, ROW), SOME)).toHaveLength(1)
    const four = ['a', 'b', 'c', 'd'].map((t) => ({ ...ROW, href: '', title: t }))
    expect(answer(rows(...four), SOME).map((r) => r.title)).toEqual(['a', 'b', 'c'])
  })

  it('reads JSON after a model’s preamble, and none from prose, an error or no answer', () => {
    expect(answer(said(`Here you go:\n${JSON.stringify({ rows: [ROW] })}\n`), SOME)).toHaveLength(1)
    expect(answer(said('Nothing to suggest.'), SOME)).toEqual([])
    expect(answer(said('{"rows": []}'), SOME)).toEqual([])
    expect(answer({ error: { message: 'no' } }, SOME)).toEqual([])
    expect(answer(null, SOME)).toEqual([])
  })
})

describe('the fingerprint and when rows are made again', () => {
  it('moves with a new source or a new state, not with order or time', () => {
    const a = sig(SOME, {})
    expect(sig([...SOME].reverse(), {})).toBe(a)
    expect(sig(SOME.map((i) => ({ ...i, updated: '2026-10-21T00:00:00Z' })), {})).toBe(a)
    expect(sig(SOME.map((i, n) => (n ? i : { ...i, state: 'open' })), {})).not.toBe(a)
    expect(sig(SOME.slice(1), {})).not.toBe(a)
    expect(sig(SOME, { role: 'Designer' })).not.toBe(a)
  })

  const at = Date.parse('2026-10-20T12:00:00Z')
  const was = (ago: number, s = 'x'): Kept => ({ at: new Date(at - ago).toISOString(), sig: s, rows: [], dismissed: [] })

  it('is due with none kept, a day on, or once the activity moved and the rows are not new', () => {
    expect(due(null, 'x', at)).toBe(true)
    expect(due(was(DAY), 'x', at)).toBe(true)
    expect(due(was(DAY - 1), 'x', at)).toBe(false)
    expect(due(was(QUIET - 1), 'y', at)).toBe(false)
    expect(due(was(QUIET), 'y', at)).toBe(true)
    expect(due({ ...was(0), at: 'garbage' }, 'x', at)).toBe(true)
  })

  it('reads no source while kept rows are new', () => {
    expect(stale(null, at)).toBe(true)
    expect(stale(was(QUIET - 1), at)).toBe(false)
    expect(stale(was(QUIET), at)).toBe(true)
  })
})

describe('what the account keeps', () => {
  const row = { id: 'r1', icon: 'github', title: 'T', href: PR, summary: 'S', action: 'A', prompt: 'P' }

  it('reads the suggest key, a row that is not one dropped', () => {
    expect(kept(undefined)).toBeUndefined()
    expect(kept({ at: '2026-10-20T00:00:00Z', sig: 'x', rows: [row, { ...row, href: 'http://x' }, { ...row, prompt: '' }, 'junk'], dismissed: ['r9', 3] })).toEqual({
      at: '2026-10-20T00:00:00Z',
      sig: 'x',
      rows: [row],
      dismissed: ['r9'],
    })
  })

  it('rides the preference document with the builder’s other keys', () => {
    const doc = prefs({ theme: 'dark', suggest: { at: 'a', sig: 's', rows: [row], dismissed: [] }, gear: {} })
    expect(doc).toEqual({ theme: 'dark', suggest: { at: 'a', sig: 's', rows: [row], dismissed: [] } })
  })

  it('draws the rows not dismissed, and remembers a dismissal first', () => {
    const k: Kept = { at: 'a', sig: 's', rows: [row as Kept['rows'][number], { ...(row as Kept['rows'][number]), id: 'r2', href: BUG }], dismissed: [] }
    expect(shown(k).map((r) => r.id)).toEqual(['r1', 'r2'])
    const after = dismissed(k, 'r1')
    expect(shown(after).map((r) => r.id)).toEqual(['r2'])
    expect(dismissed(after, 'r1').dismissed).toEqual(['r1'])
    expect(shown(null)).toEqual([])
  })

  it('fills to three with what Hanzo does, never past a dismissal, and none before the rows are read', () => {
    const one: Kept = { at: 'a', sig: 's', rows: [row as Kept['rows'][number]], dismissed: [] }
    expect(fill(one).map((r) => r.id)).toEqual(['r1', STARTERS[0]!.id, STARTERS[1]!.id])
    expect(fill({ ...one, rows: [] }).map((r) => r.id)).toEqual(STARTERS.map((r) => r.id))
    expect(fill(dismissed(one, STARTERS[0]!.id)).map((r) => r.id)).toEqual(['r1', STARTERS[1]!.id, STARTERS[2]!.id])
    expect(fill(null)).toEqual([])
  })

  it('forgets the oldest dismissal past the limit', () => {
    let k: Kept = { at: 'a', sig: 's', rows: [], dismissed: [] }
    for (let n = 0; n <= REMEMBER; n++) k = dismissed(k, `r${n}`)
    expect(k.dismissed).toHaveLength(REMEMBER)
    expect(k.dismissed[0]).toBe(`r${REMEMBER}`)
    expect(k.dismissed).not.toContain('r0')
  })

  it('tells the model to skip what was dismissed', () => {
    const k: Kept = { at: 'a', sig: 's', rows: [{ id: idOf('', 'Old idea'), icon: 'chat', title: 'Old idea', href: '', summary: '', action: 'A', prompt: 'P' }], dismissed: [hash(BUG), idOf('', 'Old idea')] }
    expect(skip(k, SOME)).toEqual([BUG, 'Old idea'])
    expect(skip(null, SOME)).toEqual([])
  })
})
