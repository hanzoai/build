/**
 * The agent's own output, read as cards: every header `dev exec` prints, every
 * way a command, a patch, a tool call and a plan can end, and the shell words
 * and diffs the cards are made of.
 */
import { describe, expect, it } from 'vitest'

import { harness, reads, sections, shown, unwrap, words } from './harness.ts'
import type { Card } from './turn.ts'

/** A card without its key, still told apart by its kind. */
type Bare = { [K in Card['kind']]: Omit<Extract<Card, { kind: K }>, 'key'> }[Card['kind']]

/** The cards one whole output reads as, without their keys. */
function read(...chunks: string[]): Bare[] {
  const out: Card[] = []
  let n = 0
  const h = harness(out, () => `k${n++}`)
  for (const c of chunks) h.feed(c)
  h.end()
  return out.map(({ key: _, ...c }) => c as Bare)
}

describe('words', () => {
  it('groups quotes, joins adjacent pieces and escapes as sh does', () => {
    expect(words(`a 'b c' "d \\"e\\"" f\\ g`)).toEqual(['a', 'b c', 'd "e"', 'f g'])
    expect(words(`'it'"'"'s'`)).toEqual(["it's"])
  })

  it('keeps an empty quoted word and drops runs of spaces', () => {
    expect(words(`echo ''   x  `)).toEqual(['echo', '', 'x'])
  })

  it('keeps a backslash that ends the line, inside quotes or out', () => {
    expect(words('a\\')).toEqual(['a\\'])
    expect(words('"a\\')).toEqual(['a\\'])
  })
})

describe('unwrap', () => {
  it('takes the command out of sh, bash or zsh run with -c or -lc', () => {
    expect(unwrap(`/bin/zsh -c 'ls'`)).toBe('ls')
    expect(unwrap(`sh -lc 'pwd'`)).toBe('pwd')
  })

  it('leaves anything else as it was', () => {
    expect(unwrap(`bash -x 'ls'`)).toBe(`bash -x 'ls'`)
    expect(unwrap(`python -c 'print(1)'`)).toBe(`python -c 'print(1)'`)
    expect(unwrap('bash -lc')).toBe('bash -lc')
  })
})

describe('reads', () => {
  it('names the one file a sed, head or tail prints', () => {
    expect(reads(`sed -n '5p' a.ts`)).toBe('a.ts')
    expect(reads('tail -n 20 log.txt')).toBe('log.txt')
    expect(reads('tail b.txt')).toBe('b.txt')
    expect(reads('cat -n c.txt')).toBe('c.txt')
  })

  it('names nothing for a sed that is not a plain print, or anything redirected', () => {
    expect(reads(`sed -i 's/a/b/' a.ts`)).toBe('')
    expect(reads(`sed -n 's/a/b/p' a.ts`)).toBe('')
    expect(reads(`sed -n '1p' a.ts b.ts`)).toBe('')
    expect(reads('cat a > b')).toBe('')
    expect(reads('head')).toBe('')
  })
})

describe('shown', () => {
  it('keeps a relative path and names an absolute one by its last part', () => {
    expect(shown('src/a.ts')).toBe('src/a.ts')
    expect(shown('/work/universe/src/')).toBe('src')
  })
})

describe('sections', () => {
  it('skips what comes before the first file and each file’s header lines', () => {
    const d = sections('preamble\n@@ not a file\ndiff --git a/x b/x\nnew file mode 100644\n@@ -0,0 +1 @@\n+x')
    expect([...d.entries()]).toEqual([['x', '@@ -0,0 +1 @@\n+x']])
  })

  it('reads a diff with no files as none', () => {
    expect(sections('').size).toBe(0)
  })
})

describe('harness', () => {
  it('skips the banner and says what the agent said, joined line by line', () => {
    expect(read('Hanzo Dev v1.0.0\n--------\nworkdir: /w\n--------\ncodex\nfirst\nsecond\n')).toEqual([{ kind: 'said', who: 'agent', text: 'first\nsecond' }])
  })

  it('strips colour codes and carriage returns', () => {
    expect(read('\u001b[1mthinking\u001b[0m\r\nweighing it\r\n')).toEqual([{ kind: 'said', who: 'agent', text: 'weighing it' }])
  })

  it('draws what the person asked, every line of it to the next header', () => {
    expect(read('user\nAdd the widget\n\nwarning: keep it small\n  ✓ and tested\ncodex\nOn it.\n')).toEqual([
      { kind: 'said', who: 'person', text: 'Add the widget\n\nwarning: keep it small\n  ✓ and tested' },
      { kind: 'said', who: 'agent', text: 'On it.' },
    ])
  })

  it('takes what the platform told the agent off the ask, and what a follow-up added after it', () => {
    const task = [
      'When a decision needs the person you are working for, call ask_user with the options rather than guessing or stopping.',
      '',
      'These environment variables are named on this codebase and not set: TOKEN.',
      "This codebase's install script has already run in this checkout.",
      '',
      'Plan only. Read the repository and answer with a plan for the task below.',
      '',
      'Add the widget',
      '',
      'with tests',
      '',
      'This follows an earlier run on this codebase: “Start”. Its work so far is on this branch; build on it.',
    ].join('\n')
    expect(read(`user\n${task}\ncodex\nOn it.\n`)[0]).toEqual({ kind: 'said', who: 'person', text: 'Add the widget\n\nwith tests' })
  })

  it('keeps a setup’s ask past its instructions and answer block, and a bare follow-up’s own line', () => {
    const setup = "Set up this repository's development environment. End with:\n\n```environment\n{}\n```\n\nSet up the environment"
    expect(read(`user\n${setup}`)).toEqual([{ kind: 'said', who: 'person', text: 'Set up the environment' }])
    expect(read('user\nContinue where the earlier run left off.\n')).toEqual([{ kind: 'said', who: 'person', text: 'Continue where the earlier run left off.' }])
    expect(read('user\nPlan only. Read the repository and answer.\n\nexec\nls\n')).toEqual([{ kind: 'shell', command: 'ls', output: '', ran: 'running' }])
  })

  it('reads a command however it ended, and keeps a shell’s output', () => {
    const got = read(
      [
        'exec',
        `bash -lc 'go build' in /w`,
        ' succeeded in 1.2s:',
        'built',
        'again',
        'exec',
        'rm -rf /',
        ' declined:',
        'exec',
        `bash -lc 'go vet' in /w`,
        ' in progress:',
        'exec',
        `bash -lc 'make' in /w`,
        ' exited -1 in 3ms:',
        'boom',
        '',
      ].join('\n'),
    )
    expect(got).toEqual([
      { kind: 'shell', command: 'go build', output: 'built\nagain', ran: 'done' },
      { kind: 'shell', command: 'rm -rf /', output: '', ran: 'cancelled' },
      { kind: 'shell', command: 'go vet', output: '', ran: 'running' },
      { kind: 'shell', command: 'make', output: 'boom', ran: 'error' },
    ])
  })

  it('draws a command that only reads a file as the file, and drops what it printed', () => {
    expect(read(`exec\nbash -lc 'cat /w/a.ts' in /w\n succeeded in 1ms:\nconst a = 1\n`)).toEqual([{ kind: 'read', file: 'a.ts', ran: 'done' }])
  })

  it('reads an ending with no command open as prose', () => {
    expect(read(' succeeded in 4ms:\n')).toEqual([{ kind: 'said', who: 'agent', text: ' succeeded in 4ms:' }])
  })

  it('keeps each edit to its own files’ sections of the turn’s diff', () => {
    const diff = ['diff --git a/a.ts b/a.ts', '@@ -1 +1 @@', '-a', '+b', 'diff --git a/b.ts b/b.ts', '@@ -0,0 +1 @@', '+c'].join('\n')
    const got = read(['apply patch', 'patch: completed', '/w/a.ts', '', 'b.ts', diff, 'codex', 'done', ''].join('\n'))
    expect(got[0]).toEqual({ kind: 'edit', files: ['a.ts', 'b.ts'], patch: 'a.ts\n@@ -1 +1 @@\n-a\n+b\nb.ts\n@@ -0,0 +1 @@\n+c', ran: 'done' })
    expect(got[1]).toEqual({ kind: 'said', who: 'agent', text: 'done' })
  })

  it('names the files the diff names when the patch named none, and a file the diff left out by its name', () => {
    expect(read('patch: completed\ndiff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n+x\n')).toEqual([{ kind: 'edit', files: ['x.ts'], patch: '@@ -1 +1 @@\n+x', ran: 'done' }])
    expect(read('patch: failed\n/w/gone.ts\n')).toEqual([{ kind: 'edit', files: ['gone.ts'], patch: '', ran: 'error' }])
  })

  it('opens a new edit for each patch that ends, and keeps one still going', () => {
    const got = read('apply patch\npatch: in_progress\na.ts\npatch: completed\npatch: declined\nb.ts\n')
    expect(got.map((c) => (c.kind === 'edit' ? [c.files, c.ran] : c.kind))).toEqual([
      [['a.ts'], 'done'],
      [['b.ts'], 'error'],
    ])
  })

  it('ends a diff at the next header or a line a header owns', () => {
    const got = read('patch: completed\ndiff --git a/a b/a\n@@ -1 +1 @@\n+a\nmcp: fs/read (completed)\n')
    expect(got).toEqual([
      { kind: 'edit', files: ['a'], patch: '@@ -1 +1 @@\n+a', ran: 'done' },
      { kind: 'step', name: 'fs/read', detail: 'tool', output: '', ran: 'done' },
    ])
  })

  it('reads a line a header seems to own but does not as prose', () => {
    expect(read('patch: odd\n')).toEqual([{ kind: 'said', who: 'agent', text: 'patch: odd' }])
  })

  it('draws a tool call once from its start to its end', () => {
    const got = read('mcp: a/x started\nmcp: a/x started\nmcp: a/x (completed)\nmcp: b/y (failed)\nmcp: c/z (in_progress)\n')
    expect(got.map((c) => (c.kind === 'step' ? [c.name, c.ran] : c.kind))).toEqual([
      ['a/x', 'running'],
      ['a/x', 'done'],
      ['b/y', 'error'],
      ['c/z', 'running'],
    ])
  })

  it('draws a web search once though it is printed as it starts and as it lands', () => {
    const got = read('web search: go\nweb search: go\ncodex\nfound it\nweb search: rust\n')
    expect(got.map((c) => (c.kind === 'step' ? c.detail : c.kind))).toEqual(['go', 'said', 'rust'])
  })

  it('draws warnings and errors as notes, and says an interruption and a compaction', () => {
    const got = read('warning: slow\nERROR: it broke\ndeprecated: old flag\nmodel rerouted: to zen\nturn interrupted\ncontext compacted\nhook: ran a hook\n')
    expect(got.map((c) => (c.kind === 'note' ? c.text : c.kind))).toEqual([
      'warning: slow',
      'it broke',
      'deprecated: old flag',
      'model rerouted: to zen',
      'The agent was interrupted',
      'The agent compacted its context',
    ])
  })

  it('draws the plan as one step, marking done, current and waiting items', () => {
    const got = read('  ✓ read\n  → write\n  • test\nnow writing\n')
    expect(got).toEqual([
      { kind: 'step', name: 'Plan', detail: '', output: '✓ read\n● write\n○ test', ran: 'done' },
      { kind: 'said', who: 'agent', text: 'now writing' },
    ])
  })

  it('reads a plan-like line inside what the agent said or a command printed as that', () => {
    const got = read(`codex\n  ✓ said\nexec\nbash -lc 'ls' in /w\n succeeded in 1ms:\n  ✓ printed\n`)
    expect(got).toEqual([
      { kind: 'said', who: 'agent', text: '  ✓ said' },
      { kind: 'shell', command: 'ls', output: '  ✓ printed', ran: 'done' },
    ])
  })

  it('draws the final message once, and the bare copy after the tokens only when it said nothing else', () => {
    expect(read('codex\nAll done.\ntokens used\n12\nAll done.\n')).toEqual([{ kind: 'said', who: 'agent', text: 'All done.' }])
    expect(read('tokens used\n12\nOnly here.\n\n')).toEqual([{ kind: 'said', who: 'agent', text: 'Only here.' }])
  })

  it('reads the last line without its newline, and drops blank prose and empty messages', () => {
    expect(read('\n\ncodex\n', 'the end')).toEqual([{ kind: 'said', who: 'agent', text: 'the end' }])
    expect(read('codex\n')).toEqual([])
  })

  it('reads a line cut across chunks once it is whole', () => {
    expect(read('cod', 'ex\nhel', 'lo\n')).toEqual([{ kind: 'said', who: 'agent', text: 'hello' }])
  })
})
