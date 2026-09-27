/**
 * A run's controls and its transcript: the addresses and bodies for paging,
 * pausing, resuming, renaming and sharing a run; the follow-up and the approved
 * plan a finished run starts; the cards its events draw; and the markdown the
 * agent writes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { blocks, spans } from '../markdown.ts'
import type { Target } from './call.ts'
import { approve, followUp, headline, type Earlier } from './coding.ts'
import { reads, sections, unwrap, words } from './harness.ts'
import * as sessions from './sessions.ts'
import { answer, cards, settled, steps, type Card } from './turn.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

interface Seen {
  url: string
  method: string
  body: unknown
}

function answerWith(status: number, body: unknown) {
  const seen: Seen[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }),
  )
  return seen
}

afterEach(() => vi.unstubAllGlobals())

describe('sessions', () => {
  it('pages the list with its filters and hands back the cursor', async () => {
    const seen = answerWith(200, { sessions: [{ id: 'sess_1', title: 'a', published: true, org: 'hanzo' }, { title: 'no id' }], next: 'c2' })
    const p = await sessions.page(T, { kind: 'coding', status: 'paused', limit: 50, after: 'c1' })
    expect(seen[0]!.url).toBe('https://api.hanzo.ai/v1/agent/sessions?kind=coding&status=paused&limit=50&after=c1')
    expect(p.next).toBe('c2')
    expect(p.sessions.map((s) => [s.id, s.published, s.org])).toEqual([['sess_1', true, 'hanzo']])
  })

  it('reads the last page as having no cursor', async () => {
    answerWith(200, { sessions: [] })
    expect((await sessions.page(T)).next).toBe('')
  })

  it('pauses and resumes at the run’s own address', async () => {
    const seen = answerWith(200, { command: 'pause' })
    await sessions.pause(T, 'sess_1')
    await sessions.resume(T, 'sess_1')
    expect(seen.map((s) => [s.method, s.url, s.body])).toEqual([
      ['POST', 'https://api.hanzo.ai/v1/agent/sessions/sess_1/pause', {}],
      ['POST', 'https://api.hanzo.ai/v1/agent/sessions/sess_1/resume', {}],
    ])
  })

  it('renames with a trimmed title, and refuses an empty or overlong one before sending', async () => {
    const seen = answerWith(200, { id: 'sess_1', title: 'New name' })
    const s = await sessions.rename(T, 'sess_1', '  New name ')
    expect(seen[0]).toEqual({ url: 'https://api.hanzo.ai/v1/agent/sessions/sess_1', method: 'PATCH', body: { title: 'New name' } })
    expect(s.title).toBe('New name')
    await expect(sessions.rename(T, 'sess_1', '  ')).rejects.toThrow('Give the run a name')
    await expect(sessions.rename(T, 'sess_1', 'x'.repeat(513))).rejects.toThrow('at most 512')
    expect(seen).toHaveLength(1)
  })

  it('shares and withdraws a run’s story, and names its public address', async () => {
    const seen = answerWith(200, { id: 'sess_1', published: true })
    expect((await sessions.publish(T, 'sess_1', true)).published).toBe(true)
    await sessions.publish(T, 'sess_1', false)
    expect(seen.map((s) => s.body)).toEqual([{ published: true }, { published: false }])
    expect(sessions.story(T, 'hanzo', 'shop')).toBe('https://api.hanzo.ai/v1/agent/builds/hanzo/shop')
    expect(sessions.story(T, 'hanzo', '')).toBe('')
  })
})

const EARLIER: Earlier = {
  id: 'sess_1',
  title: 'universe: Add the widget',
  repo: 'hanzoai/universe',
  base: 'main',
  environment: 'sandbox',
  project: '',
  mode: 'build',
  pushed: true,
}

describe('a follow-up', () => {
  it('starts from the branch a run pushed, and says which run it follows', () => {
    const ask = followUp(EARLIER, ' now add tests ')
    expect(ask).toMatchObject({ repo: 'hanzoai/universe', after: 'sess_1', mode: 'build' })
    expect(ask.base).toBeUndefined()
    expect(ask.targetId).toBeUndefined()
    expect(ask.prompt).toBe('now add tests\n\nThis follows an earlier run on this codebase: “Add the widget”. Its work so far is on this branch; build on it.')
  })

  it('starts where the run started when it pushed nothing — `after` would name a branch that does not exist', () => {
    const ask = followUp({ ...EARLIER, pushed: false, mode: 'plan' }, 'go on')
    expect(ask.after).toBeUndefined()
    expect(ask).toMatchObject({ base: 'main', mode: 'plan' })
  })

  it('goes on with nothing said as the platform does: the ask, and carry on', () => {
    expect(followUp(EARLIER, '').prompt).toBe(
      'Add the widget\n\nAn earlier run already worked on this; its work so far is on this branch. Build on it. Continue where the earlier run left off.',
    )
  })

  it('stays on the machine and in the project the run was on', () => {
    expect(followUp({ ...EARLIER, environment: 'tgt_1', project: 'widgets' }, 'x')).toMatchObject({ targetId: 'tgt_1', project: 'widgets' })
  })

  it('builds an approved plan from where the plan read, titled by its ask', () => {
    const ask = approve({ ...EARLIER, mode: 'plan', pushed: false }, '1. Read it\n2. Change it\n')
    expect(ask).toMatchObject({ mode: 'build', base: 'main', repo: 'hanzoai/universe' })
    expect(ask.after).toBeUndefined()
    expect(ask.prompt).toBe('Add the widget\n\nCarry out this plan:\n\n1. Read it\n2. Change it')
  })

  it('reads the ask out of a title that leads with the codebase', () => {
    expect(headline('universe: Add the widget', 'hanzoai/universe')).toBe('Add the widget')
    expect(headline('Something else', 'hanzoai/universe')).toBe('Something else')
  })
})

describe('the harness grammar', () => {
  it('splits a command as a shell does', () => {
    expect(words(`/bin/bash -lc 'sed -n '"'"'1,40p'"'"' src/a.ts'`)).toEqual(['/bin/bash', '-lc', "sed -n '1,40p' src/a.ts"])
    expect(words('echo "a \\"b\\"" c\\ d')).toEqual(['echo', 'a "b"', 'c d'])
  })

  it('takes a command out of the shell it ran in', () => {
    expect(unwrap(`bash -lc 'ls -la'`)).toBe('ls -la')
    expect(unwrap('go test ./...')).toBe('go test ./...')
  })

  it('knows a command that only reads one file', () => {
    expect(reads(`/bin/bash -lc 'sed -n '"'"'1,200p'"'"' src/main.go'`)).toBe('src/main.go')
    expect(reads(`bash -lc 'cat README.md'`)).toBe('README.md')
    expect(reads('head -n 40 a.ts')).toBe('a.ts')
    expect(reads('nl -ba a.ts')).toBe('a.ts')
    expect(reads(`bash -lc 'cat a.ts | wc -l'`)).toBe('')
    expect(reads('cat a.ts b.ts')).toBe('')
    expect(reads('rg foo')).toBe('')
  })

  it('splits a diff by the file each section changes', () => {
    const d = sections('diff --git a/a.ts b/a.ts\nindex 1..2\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b.ts b/b.ts\n@@ -0,0 +1 @@\n+z')
    expect([...d.entries()]).toEqual([
      ['a.ts', '@@ -1 +1 @@\n-x\n+y'],
      ['b.ts', '@@ -0,0 +1 @@\n+z'],
    ])
  })
})

const ev = (seq: number, kind: string, payload: unknown) => ({ id: `e${seq}`, sessionId: 's', seq, kind, actor: 'a', payload, createdAt: '' })

/** What `dev exec` printed for one short turn, as the sandbox narrated it. */
const OUT = [
  'Hanzo Dev v0.6.94',
  '--------',
  'workdir: /work/universe',
  'model: zen6-coder',
  '--------',
  'user',
  'Add the widget',
  'codex',
  'I will look at the code first.',
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
  'mcp: run/ask_user started',
  'mcp: run/ask_user (completed)',
  'web search: go table tests',
  'codex',
  'Added **New**. See `widget.go`.',
  'tokens used',
  '1,234',
  'Added **New**. See `widget.go`.',
  '',
].join('\n')

describe('cards', () => {
  const run = [
    ev(1, 'status', { status: 'started', branch: 'agent/ab12' }),
    ev(2, 'tool-call', { step: 'lease', message: 'leasing a dev sandbox', status: 'running' }),
    ev(3, 'tool-call', { step: 'leased', message: 'sandbox m_1 (dev)', status: 'running' }),
    ev(4, 'tool-call', { step: 'clone', message: 'cloning the codebase', status: 'running' }),
    ev(5, 'log', { message: 'Cloning into universe…\n' }),
    ev(6, 'tool-call', { step: 'exit', message: 'exit 0' }),
    ev(7, 'tool-call', { step: '', message: 'running the task', status: 'running' }),
    // Cut by a clock, mid-line, as the sandbox cuts it.
    ev(8, 'log', { message: OUT.slice(0, 200) }),
    ev(9, 'control', { command: 'message', message: 'use table tests' }),
    ev(10, 'log', { message: OUT.slice(200) }),
    ev(11, 'tool-call', { step: 'exit', message: 'exit 0' }),
    // The run commits what the agent left before it pushes.
    ev(12, 'log', { message: '1a2b3c4\n' }),
    ev(13, 'tool-call', { step: 'exit', message: 'exit 0' }),
    ev(14, 'log', { message: ' widget.go | 1 +\n' }),
    ev(15, 'tool-call', { step: 'exit', message: 'exit 0' }),
    ev(16, 'tool-call', { step: 'push', message: 'pushing agent/ab12', status: 'running' }),
    ev(17, 'tool-call', { step: 'done', message: 'finished', status: 'ok' }),
    ev(18, 'status', { status: 'done', changed: true, branch: 'agent/ab12' }),
  ]
  const got = cards(run, 'build')
  const of = <K extends Card['kind']>(k: K) => got.filter((c): c is Extract<Card, { kind: K }> => c.kind === k)

  it('draws the run’s own steps, each with its output', () => {
    expect(of('step').slice(0, 2).map((s) => [s.name, s.ran, s.output])).toEqual([
      ['Sandbox', 'done', ''],
      ['Clone', 'done', 'Cloning into universe…\n'],
    ])
    expect(of('step').map((s) => s.name)).toEqual(['Sandbox', 'Clone', 'run/ask_user', 'Web search', 'Commit', 'Push'])
    expect(of('step').find((s) => s.name === 'Commit')).toMatchObject({ output: '1a2b3c4\n widget.go | 1 +\n', ran: 'done' })
  })

  it('reads the agent’s output by what each part is, and drops the sandbox’s directory', () => {
    expect(of('read')).toMatchObject([{ file: 'widget.go', ran: 'done' }])
    expect(of('shell')).toMatchObject([{ command: 'go test ./...', output: 'FAIL widgets', ran: 'error' }])
    expect(of('edit')).toMatchObject([{ files: ['widget.go'], patch: '@@ -1 +1,2 @@\n package widget\n+func New() {}', ran: 'done' }])
    expect(JSON.stringify(got)).not.toContain('/work/universe')
    expect(JSON.stringify(got)).not.toContain('zen6-coder')
  })

  it('draws what the agent said once, and a person’s words as theirs', () => {
    const said = of('said')
    expect(said.filter((s) => s.who === 'agent').map((s) => s.text)).toEqual(['I will look at the code first.', 'Added **New**. See `widget.go`.'])
    // The ask opens the transcript, then the person's steering.
    expect(said.filter((s) => s.who === 'person').map((s) => s.text)).toEqual(['Add the widget', 'use table tests'])
    expect(of('note').map((n) => n.text)).toEqual(['Started on agent/ab12', 'Pushed agent/ab12'])
  })

  it('reads the same output the same way however it was cut', () => {
    const whole = cards([ev(7, 'tool-call', { message: 'running the task' }), ev(8, 'log', { message: OUT })], 'build')
    const bytes = cards([ev(7, 'tool-call', { message: 'running the task' }), ...OUT.split('').map((c, i) => ev(8 + i, 'log', { message: c }))], 'build')
    const strip = (cs: Card[]) => cs.map(({ key: _, ...c }) => c)
    expect(strip(bytes)).toEqual(strip(whole))
  })

  it('draws a plan run’s answer as its plan, once', () => {
    const plan = '1. Read widget.go\n2. Add New'
    const got = cards(
      [
        ev(1, 'tool-call', { message: 'running the task' }),
        ev(2, 'log', { message: `codex\n${plan}\n` }),
        ev(3, 'tool-call', { step: 'exit', message: 'exit 0' }),
        ev(4, 'status', { status: 'done', mode: 'plan', changed: false, plan }),
      ],
      'plan',
    )
    expect(got.map((c) => c.kind)).toEqual(['plan'])
    expect(answer([ev(4, 'status', { status: 'done', plan })])).toBe(plan)
  })

  it('never draws a plan for a run whose record is not a plan', () => {
    expect(cards([ev(1, 'status', { status: 'done', mode: 'plan', changed: false, plan: 'do it' })], 'build').map((c) => c.kind)).toEqual(['note'])
  })

  it('says what a person asked of the run', () => {
    const got = cards([ev(1, 'control', { command: 'pause' }), ev(2, 'control', { command: 'stop', message: 'Stopped from the builder' })])
    expect(got.map((c) => (c.kind === 'note' ? c.text : c.kind))).toEqual(['Pause asked', 'Stop asked'])
  })
})

describe('steps', () => {
  it('lists the run’s steps, not the ends of the commands in them, and settles each one another followed', () => {
    expect(
      steps([
        ev(1, 'tool-call', { step: 'lease', status: 'running' }),
        ev(2, 'tool-call', { step: 'clone', status: 'running' }),
        ev(3, 'tool-call', { step: 'exit', message: 'exit 0' }),
        ev(4, 'tool-call', { step: 'install', status: 'running' }),
      ]),
    ).toEqual([
      { name: 'lease', done: true },
      { name: 'clone', done: true },
      { name: 'install', done: false },
    ])
  })
})

describe('settled', () => {
  it('waits for the run to say where its work was kept', () => {
    expect(settled([ev(1, 'status', { status: 'started' })])).toEqual({ settled: false, pushed: false })
    expect(settled([ev(1, 'status', { status: 'started' }), ev(2, 'status', { status: 'stopped', changed: true, branch: 'agent/x' })])).toEqual({
      settled: true,
      pushed: true,
    })
    expect(settled([ev(1, 'status', { status: 'done', changed: false })])).toEqual({ settled: true, pushed: false })
    expect(settled([ev(1, 'status', { status: 'paused', changed: true })]).pushed).toBe(true)
  })
})

describe('prose', () => {
  it('reads the blocks an agent writes', () => {
    const md = '# Done\n\nChanged two files:\n\n- `a.ts`\n  still a\n- b.ts\n\n1. one\n2. two\n\n```go\nfunc New() {}\n```\n\n> quoted\n\n---\n\n| a | b |\n|---|---|\n| 1 | 2 |\nlast\nline'
    expect(blocks(md)).toEqual([
      { kind: 'heading', level: 1, text: 'Done' },
      { kind: 'paragraph', text: 'Changed two files:' },
      { kind: 'list', ordered: false, start: 1, items: [{ text: '`a.ts` still a', depth: 0 }, { text: 'b.ts', depth: 0 }] },
      { kind: 'list', ordered: true, start: 1, items: [{ text: 'one', depth: 0 }, { text: 'two', depth: 0 }] },
      { kind: 'code', lang: 'go', text: 'func New() {}' },
      { kind: 'quote', text: 'quoted' },
      { kind: 'rule' },
      { kind: 'table', head: ['a', 'b'], rows: [['1', '2']] },
      { kind: 'paragraph', text: 'last line' },
    ])
  })

  it('draws a link only to an http(s) address', () => {
    expect(spans('see [docs](https://docs.hanzo.ai) and [x](javascript:alert(1)) or ![img](https://t.example/p.png)')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'docs', href: 'https://docs.hanzo.ai' },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'x' },
      { kind: 'text', text: ' or ' },
      { kind: 'text', text: 'img' },
    ])
  })

  it('reads inline code, bold, italics and a bare address', () => {
    expect(spans('**New** in `a_b.ts`, _now_, at https://hanzo.build.')).toEqual([
      { kind: 'strong', text: 'New' },
      { kind: 'text', text: ' in ' },
      { kind: 'code', text: 'a_b.ts' },
      { kind: 'text', text: ', ' },
      { kind: 'em', text: 'now' },
      { kind: 'text', text: ', at ' },
      { kind: 'link', text: 'https://hanzo.build', href: 'https://hanzo.build' },
      { kind: 'text', text: '.' },
    ])
  })
})
