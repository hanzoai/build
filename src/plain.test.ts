import { describe, expect, it } from 'vitest'

import { cards, type Card } from './api/turn.ts'
import { doing, fold, isProcess, plainPath, ranOf, worked } from './plain.ts'

const said = (key: string, text: string, who: 'person' | 'agent' = 'agent'): Card => ({ kind: 'said', key, who, text })
const shell = (key: string, command: string, ran: 'running' | 'done' = 'done'): Card => ({ kind: 'shell', key, command, output: '', ran })
const read = (key: string, ...names: string[]): Card => ({
  kind: 'explore',
  key,
  calls: [{ actions: names.map((name) => ({ type: 'read' as const, command: `cat ${name}`, name, path: name })), exit: 0 }],
  ran: 'done',
})
const edit = (key: string, ...paths: string[]): Card => ({ kind: 'edit', key, files: paths.map((path) => ({ path, kind: 'update' as const, added: 1, removed: 0 })), ran: 'done' })
const step = (key: string, name: string, detail = ''): Card => ({ kind: 'step', key, name, detail, output: '', ran: 'done' })

describe('result first: the process folds into one plain line (hanzo-inc/app issues 317 and 321)', () => {
  it('says the home folder and the workspace in words', () => {
    expect(plainPath('~')).toBe('your home folder')
    expect(plainPath('ls ~')).toBe('ls your home folder')
    expect(plainPath('~/notes/todo.md')).toBe('notes/todo.md in your home folder')
    expect(plainPath('$HOME/.bashrc')).toBe('.bashrc in your home folder')
    expect(plainPath('/Users/alex/site/index.html')).toBe('site/index.html in your home folder')
    expect(plainPath('/home/z/work')).toBe('work in your home folder')
    expect(plainPath('your workspace at /work.')).toBe('your workspace at your project.')
    expect(plainPath('/work/src/app.ts')).toBe('src/app.ts')
    // Anything else is left as it was written.
    expect(plainPath('src/app.ts')).toBe('src/app.ts')
    expect(plainPath('approx ~5 minutes')).toBe('approx ~5 minutes')
    expect(plainPath('/workspace/x')).toBe('/workspace/x')
    const french = ((s: string, v?: Record<string, string>) => `fr:${s}${v?.path ? `:${v.path}` : ''}`) as never
    expect(plainPath('~/a', french)).toBe('fr:{path} in your home folder:a')
  })

  it('keeps what a person reads, and gathers each run of process cards between them', () => {
    const run = [
      said('a', 'Make me a landing page', 'person'),
      { kind: 'note', key: 'n', text: 'Started on agent/16a6bce87b3e', step: true } as Card,
      step('s1', 'Sandbox', 'leasing a desktop sandbox'),
      step('s2', 'Workspace'),
      read('r', 'index.html', 'style.css'),
      shell('c', 'npm run build'),
      edit('e', 'index.html'),
      said('b', 'Your page is live.'),
      step('err', 'Error'),
      { kind: 'note', key: 'end', text: 'Done — published' } as Card,
    ]
    const out = fold(run)
    expect(out.map((x) => x.kind)).toEqual(['said', 'work', 'said', 'step', 'note'])
    const work = out[1]!
    expect(work.kind === 'work' && work.key).toBe('work:n')
    expect(work.kind === 'work' && work.cards.map((c) => c.key)).toEqual(['n', 's1', 's2', 'r', 'c', 'e'])
    // The reason a run failed and how it ended are never folded away.
    expect(isProcess(step('x', 'Error'))).toBe(false)
    expect(isProcess({ kind: 'note', key: 'x', text: 'Done' })).toBe(false)
  })

  it('says what the work was in counts and words, never as commands or paths', () => {
    const line = worked([step('s', 'Sandbox'), read('r', 'a.ts', 'b.ts', 'a.ts'), shell('c1', 'ls ~'), shell('c2', 'npm test'), edit('e', '/Users/alex/site/index.html')])
    expect(line).toBe('Set up the workspace, read 2 files, ran 2 commands, changed site/index.html in your home folder')
    expect(line).not.toMatch(/~|npm|ls /)
    expect(worked([edit('e', 'a.ts', 'b.ts', 'c.ts')])).toBe('Changed 3 files')
    expect(worked([{ kind: 'think', key: 't', text: 'Hmm' }])).toBe('Thought it through')
    expect(worked([step('k', 'Check', 'the agent changed nothing'), step('kept', 'Keep the sandbox', 'sandbox m_c06cee94 is kept')])).toBe('Checked the work')
    expect(worked([step('q', 'Search', 'weather'), step('m', 'Called', 'github.create_issue')])).toBe('Searched the web, used a tool')
  })

  it('says what is happening now while the work goes on', () => {
    expect(doing(shell('c', 'rm -rf ~/tmp', 'running'))).toBe('Running a command')
    expect(doing(edit('e', '/work/src/app.ts'))).toBe('Changing src/app.ts')
    expect(doing(step('s', 'Install'))).toBe('Setting up the workspace')
    expect(ranOf([shell('a', 'x'), shell('b', 'y', 'running')])).toBe('running')
    expect(ranOf([shell('a', 'x'), shell('b', 'y', 'running')], (r) => (r === 'running' ? 'cancelled' : r))).toBe('cancelled')
    expect(ranOf([shell('a', 'x'), said('s', 'hi')])).toBe('done')
    // A finished run whose sandbox is kept reads as done, not cut off.
    const kept: Card = { kind: 'step', key: 'k', name: 'Keep the sandbox', detail: 'sandbox m_1 is kept', output: '', ran: 'running' }
    const ended = (r: 'running' | 'done' | 'error' | 'cancelled') => (r === 'running' ? 'cancelled' : r)
    expect(ranOf([step('c', 'Check'), kept], ended)).toBe('done')
    expect(ranOf([kept], ended)).toBe('done')
  })

  it('marks the lines that say a run got going as process, and its end as not', () => {
    const ev = (seq: number, payload: Record<string, unknown>) => ({ kind: 'status' as const, seq, payload: JSON.stringify(payload) })
    const drawn = cards([ev(1, { status: 'started', branch: 'agent/1' }), ev(2, { status: 'routed' }), ev(3, { status: 'done', changed: false })])
    expect(drawn).toEqual([
      { kind: 'note', key: expect.any(String), text: 'Started on agent/1', step: true },
      { kind: 'note', key: expect.any(String), text: 'Sent to a machine', step: true },
      { kind: 'note', key: expect.any(String), text: 'Done — nothing to change' },
    ])
  })
})
