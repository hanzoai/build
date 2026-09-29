/**
 * What a run's events say: every lifecycle sentence, the shell and the steps
 * beside the transcript, how a run ended and whether it kept its work, and the
 * cards each kind of event draws.
 */
import { describe, expect, it } from 'vitest'

import { answer, cards, decode, merge, outcome, said, settled, shell, steps, who, type Card } from './turn.ts'

const ev = (seq: number, kind: string, payload: unknown) => ({ id: `e${seq}`, seq, kind, payload })
const status = (payload: Record<string, unknown>, mode = '') => said({ kind: 'status', payload }, mode)

/** A card without its key, still told apart by its kind. */
type Bare = { [K in Card['kind']]: Omit<Extract<Card, { kind: K }>, 'key'> }[Card['kind']]
const bare = (cs: Card[]): Bare[] => cs.map(({ key: _, ...c }) => c as Bare)

describe('decode', () => {
  it('takes an object as it is, and a JSON object out of a string', () => {
    expect(decode({ a: 1 })).toEqual({ a: 1 })
    expect(decode('  {"a":1} ')).toEqual({ a: 1 })
  })

  it('keeps prose, even prose that opens with a brace, and reads anything else as nothing', () => {
    expect(decode('hello')).toBe('hello')
    expect(decode('{not json')).toBe('{not json')
    expect(decode(7)).toBeNull()
    expect(decode(null)).toBeNull()
  })
})

describe('said', () => {
  it('says how a run started and where it went', () => {
    expect(status({ status: 'started' })).toBe('Started')
    expect(status({ status: 'routed' })).toBe('Sent to a machine')
  })

  it('says how a run finished, by its mode', () => {
    expect(status({ status: 'done', plan: 'Use pnpm' }, 'setup')).toBe('Use pnpm')
    expect(status({ status: 'done' }, 'setup')).toBe('Set up — the run answered with no environment')
    expect(status({ status: 'done', branch: 'agent/x', prError: 'no token', pr: 'https://x' })).toBe('Pushed agent/x — the pull request could not be opened')
    expect(status({ status: 'done', pr: 'https://x' })).toBe('Done — https://x')
    expect(status({ status: 'done' })).toBe('Done')
  })

  it('says a run on a project with a site published what it pushed, or why it did not', () => {
    expect(status({ status: 'done', changed: true, branch: 'agent/x', pr: '#4', live: 'https://shop.hanzo.app' })).toBe('Pushed agent/x — #4 — published')
    expect(status({ status: 'done', changed: true, branch: 'agent/x', pr: '#4', unpublished: 'coding: the build exited 1: missing script: build' })).toBe(
      'Pushed agent/x — #4 — not published: coding: the build exited 1: missing script: build',
    )
    // Why it did not is said even beside an address.
    expect(status({ status: 'done', live: 'https://shop.hanzo.app', unpublished: 'the store refused index.html' })).toBe('Done — not published: the store refused index.html')
    expect(status({ status: 'done', live: 7, unpublished: false })).toBe('Done')
  })

  it('says an error, a stop, a pause and a follow-up, with the work kept only when it was', () => {
    expect(status({ status: 'error' })).toBe('The run hit an error')
    expect(status({ status: 'error', error: 'the dev harness exited 1: ERROR stream disconnected - retries exhausted' })).toBe(
      'The model did not answer. Try again in a moment, or pick another model.',
    )
    expect(status({ status: 'error', error: 'unexpected status 402 Payment Required: insufficient balance' })).toBe('Your balance is out of credit. Add credit, then try again.')
    expect(status({ status: 'error', error: 'model "enso-flash": every provider refused — tried enso (402)' })).toBe(
      'The model did not answer. Try again in a moment, or pick another model.',
    )
    expect(status({ status: 'error', error: 'panic at line 503 of main.go' })).toBe('The run stopped with an error. Try again, or follow up with what to change.')
    expect(status({ status: 'stopped', branch: 'agent/x', changed: true })).toBe('Stopped — work kept on agent/x')
    expect(status({ status: 'stopped', branch: 'agent/x', changed: false })).toBe('Stopped')
    expect(status({ status: 'stopped', changed: true })).toBe('Stopped')
    expect(status({ status: 'paused', branch: 'agent/x', changed: true })).toBe('Paused — work kept on agent/x')
    expect(status({ status: 'paused' })).toBe('Paused')
    expect(status({ status: 'followed', next: 'sess_2' })).toBe('Continued in a follow-up run')
    expect(status({ status: 'followed' })).toBe('The follow-up run could not start')
  })

  it('says a status it does not know by its name, and nothing for none', () => {
    expect(status({ status: 'queued' })).toBe('queued')
    expect(status({})).toBe('')
  })

  it('reads the first thing an event says, in order', () => {
    expect(said({ kind: 'log', payload: 'plain words' })).toBe('plain words')
    expect(said({ kind: 'log', payload: 3 })).toBe('')
    expect(said({ kind: 'log', payload: { message: '', text: 'the text' } })).toBe('the text')
    expect(said({ kind: 'log', payload: { content: 'the content' } })).toBe('the content')
    expect(said({ kind: 'log', payload: { result: 'the result' } })).toBe('the result')
    expect(said({ kind: 'tool-call', payload: { command: 'ls' } })).toBe('ls')
    expect(said({ kind: 'tool-call', payload: { step: 'lease' } })).toBe('lease')
    expect(said({ kind: 'tool-call', payload: { name: 'fs/read' } })).toBe('fs/read')
  })

  it('names the files a finished event changed, by name, and counts many', () => {
    expect(said({ kind: 'event', payload: { type: 'done', changed: [] } })).toBe('Done — no files changed')
    expect(said({ kind: 'event', payload: { type: 'done', changed: ['/w/a/', 7] } })).toBe('Done — changed a')
    expect(said({ kind: 'event', payload: { type: 'done', changed: ['a', 'b', 'c', 'd'] } })).toBe('Done — changed 4 files')
  })

  it('says an error event’s reason, or that there was one', () => {
    expect(said({ kind: 'event', payload: { type: 'error', error: 'clone failed' } })).toBe('clone failed')
    expect(said({ kind: 'event', payload: { type: 'error' } })).toBe('The run hit an error')
  })
})

describe('shell', () => {
  it('prints a tool call’s command once, then what it said, printed and complained', () => {
    const lines = shell([
      ev(1, 'tool-call', { step: 'test', message: 'test', stdout: 'ok', stderr: 'warn' }),
      ev(2, 'tool-call', { message: 'no step' }),
      ev(3, 'log', { text: 'from text' }),
      ev(4, 'log', { command: 'from command' }),
      ev(5, 'log', ''),
      ev(6, 'log', 9),
      ev(7, 'log', 'bare'),
    ])
    expect(lines).toEqual([
      { role: 'cmd', text: 'test' },
      { role: 'out', text: 'ok' },
      { role: 'out', text: 'warn' },
      { role: 'out', text: 'no step' },
      { role: 'out', text: 'from text' },
      { role: 'out', text: 'from command' },
      { role: 'out', text: 'bare' },
    ])
  })

  it('keeps the last four hundred lines', () => {
    const lines = shell(Array.from({ length: 450 }, (_, i) => ev(i + 1, 'log', `line ${i + 1}`)))
    expect(lines).toHaveLength(400)
    expect(lines[0]!.text).toBe('line 51')
  })
})

describe('steps', () => {
  it('skips what is not a named step, and settles one that ended in error', () => {
    expect(
      steps([
        ev(1, 'tool-call', 'prose'),
        ev(2, 'tool-call', 5),
        ev(3, 'tool-call', { message: 'unnamed' }),
        ev(4, 'tool-call', { step: 'build', status: 'error' }),
      ]),
    ).toEqual([{ name: 'build', done: true }])
    expect(steps([ev(1, 'tool-call', { step: 'push', status: 'done' })])).toEqual([{ name: 'push', done: true }])
  })
})

describe('outcome', () => {
  it('keeps the latest status and problem, and skips what says neither', () => {
    expect(
      outcome([
        ev(1, 'status', { status: 'started', prError: 'no token' }),
        ev(2, 'status', 'prose'),
        ev(3, 'status', 4),
        ev(4, 'status', {}),
        ev(5, 'log', { status: 'done' }),
      ]),
    ).toEqual({ status: 'started', problem: 'no token', published: 0 })
  })

  it('keeps where the latest status said the run’s work went live, and never the address', () => {
    expect(
      outcome([
        ev(9, 'status', { status: 'done', changed: true, live: 'https://shop.hanzo.app' }),
        ev(2, 'status', { status: 'done', changed: true, live: 'https://evil.example' }),
        ev(12, 'status', { status: 'done', changed: true, unpublished: 'the build exited 1' }),
        ev(14, 'log', { live: 'https://shop.hanzo.app' }),
      ]),
    ).toEqual({ status: 'done', problem: '', published: 9 })
    expect(outcome([ev(3, 'status', { status: 'done', live: '' })]).published).toBe(0)
  })
})

describe('merge', () => {
  it('tells apart turns with no sequence by their id', () => {
    expect(merge([{ id: 'a', seq: 0 }], [{ id: 'b', seq: 0 }, { id: 'a', seq: 0 }]).map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('who', () => {
  it('keeps a subject it cannot shorten', () => {
    expect(who('hanzo/')).toBe('hanzo/')
    expect(who('-x')).toBe('-x')
  })
})

describe('answer and settled', () => {
  it('reads the plan off the last finished status only', () => {
    expect(answer([ev(1, 'log', { status: 'done', plan: 'no' }), ev(2, 'status', 'prose'), ev(3, 'status', { status: 'error', plan: 'no' })])).toBe('')
  })

  it('settles on an error, a stop or a pause, and keeps the work only when it changed', () => {
    expect(settled([ev(1, 'log', { status: 'done' }), ev(2, 'status', 'prose')])).toEqual({ settled: false, pushed: false })
    expect(settled([ev(1, 'status', { status: 'error' })])).toEqual({ settled: true, pushed: false })
    expect(settled([ev(1, 'status', { status: 'stopped', changed: true })])).toEqual({ settled: true, pushed: true })
    expect(settled([ev(1, 'status', { status: 'running' })])).toEqual({ settled: false, pushed: false })
  })
})

describe('cards', () => {
  it('says a run’s error in one line, with what it said folded into an Error step', () => {
    const raw = 'the dev harness exited 1: 2026-09-29T16:08:00Z ERROR code_core::codex::streaming: stream disconnected - retries exhausted'
    const got = cards([ev(1, 'status', { status: 'error', error: raw })]).map(({ key: _, ...c }) => c)
    expect(got).toEqual([
      { kind: 'note', text: 'The model did not answer. Try again in a moment, or pick another model.' },
      { kind: 'step', name: 'Error', detail: '', output: raw, ran: 'error' },
    ])
  })

  it('draws the run’s own steps as they move, naming a step it does not know', () => {
    const got = cards([
      ev(1, 'tool-call', 'prose'),
      ev(2, 'tool-call', { step: 'leased', message: 'no lease to finish' }),
      ev(3, 'tool-call', { message: 'unnamed' }),
      ev(4, 'tool-call', { step: 'ended' }),
      ev(5, 'tool-call', { step: 'install', message: 'pnpm install', status: 'running' }),
      ev(6, 'tool-call', { step: 'install', status: 'ok' }),
      ev(7, 'tool-call', { step: 'install', message: 'installed', status: 'running' }),
      ev(8, 'tool-call', { step: 'exit', message: 'exit 1' }),
      ev(9, 'tool-call', { step: 'exit', message: 'exit 0' }),
      ev(10, 'tool-call', { step: 'migrate', message: 'migrating', status: 'error' }),
    ])
    expect(bare(got)).toEqual([
      { kind: 'step', name: 'Install', detail: 'installed', output: '', ran: 'error' },
      { kind: 'step', name: 'Migrate', detail: 'migrating', output: '', ran: 'error' },
    ])
  })

  it('ends a command with nothing open as nothing', () => {
    expect(cards([ev(1, 'tool-call', { step: 'exit', message: 'exit 0' })])).toEqual([])
  })

  it('reads a bare log line as the agent’s, and drops an empty one', () => {
    expect(bare(cards([ev(1, 'log', 'codex\nhi\n'), ev(2, 'log', { text: 'there\n' }), ev(3, 'log', {})]))).toEqual([{ kind: 'said', who: 'agent', text: 'hi\nthere' }])
  })

  it('draws a setup run’s answer as what the agent said, once', () => {
    const got = cards(
      [
        ev(1, 'tool-call', { message: 'running the task' }),
        ev(2, 'log', { message: 'codex\nUse pnpm\n' }),
        ev(3, 'status', { status: 'done', plan: 'Use pnpm' }),
      ],
      'setup',
    )
    expect(bare(got)).toEqual([{ kind: 'said', who: 'agent', text: 'Use pnpm' }])
  })

  it('keeps a person’s words that match the answer, and a status that says nothing draws nothing', () => {
    const got = cards([ev(1, 'message', { role: 'user', text: 'Use pnpm' }), ev(2, 'status', 'prose'), ev(3, 'status', {}), ev(4, 'status', { status: 'done', plan: 'Use pnpm' })], 'plan')
    expect(bare(got)).toEqual([
      { kind: 'said', who: 'person', text: 'Use pnpm' },
      { kind: 'plan', text: 'Use pnpm' },
    ])
  })

  it('draws the person’s ask once: from their own message when there is one, else from the harness', () => {
    const task = (seq: number, words: string) => [ev(seq, 'tool-call', { message: 'running the task' }), ev(seq + 1, 'log', { message: `user\n${words}\ncodex\nOn it.\n` })]
    const heard = cards([ev(1, 'message', { role: 'user', text: 'Add the widget' }), ...task(2, 'Add the widget')])
    expect(bare(heard).map((c) => (c.kind === 'said' ? `${c.who}: ${c.text}` : c.kind))).toEqual(['person: Add the widget', 'agent: On it.'])
    const steered = cards([...task(1, 'Add the widget'), ev(3, 'control', { command: 'message', message: 'and tests' }), ...task(4, 'and tests')])
    expect(bare(steered).map((c) => (c.kind === 'said' ? `${c.who}: ${c.text}` : c.kind))).toEqual(['person: Add the widget', 'agent: On it.', 'person: and tests', 'agent: On it.'])
  })

  it('opens with the ask, ahead of the steps that set the run up, and leaves a steer where it was said', () => {
    const asked = cards([
      ev(1, 'status', { status: 'started' }),
      ev(2, 'tool-call', { step: 'clone', status: 'ok' }),
      ev(3, 'tool-call', { message: 'running the task' }),
      ev(4, 'log', { message: 'user\nAdd the widget\n' }),
    ])
    expect(bare(asked).map((c) => c.kind + (c.kind === 'said' ? `:${c.who}` : ''))).toEqual(['said:person', 'note', 'step'])
    const steered = cards([ev(1, 'status', { status: 'started' }), ev(2, 'control', { command: 'message', message: 'faster' })])
    expect(bare(steered).map((c) => c.kind)).toEqual(['note', 'said'])
  })

  it('says what a person asked, and nothing for a control it cannot read', () => {
    const got = cards([
      ev(1, 'control', 'prose'),
      ev(2, 'control', { command: 'message', message: 'faster' }),
      ev(3, 'control', { command: 'message' }),
      ev(4, 'control', { command: 'resume' }),
      ev(5, 'control', { command: 'reboot' }),
    ])
    expect(bare(got)).toEqual([
      { kind: 'said', who: 'person', text: 'faster' },
      { kind: 'note', text: 'Resume asked' },
    ])
  })

  it('draws a message by who sent it, whichever field carries its words', () => {
    const got = cards([
      ev(1, 'message', 'bare words'),
      ev(2, 'message', { role: 'assistant', content: 'from content' }),
      ev(3, 'message', { message: 'from message' }),
      ev(4, 'message', {}),
      ev(5, 'heartbeat', { at: 1 }),
    ])
    expect(bare(got)).toEqual([
      { kind: 'said', who: 'agent', text: 'bare words' },
      { kind: 'said', who: 'agent', text: 'from content' },
      { kind: 'said', who: 'agent', text: 'from message' },
    ])
  })
})
