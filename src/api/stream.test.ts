/**
 * The session stream: frames split anywhere, comments ignored, reconnects on a
 * dropped feed, and stops for good on a refusal.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Target } from './call.ts'
import { watch, type Event, type Session } from './sessions.ts'
import { parse, read } from './sse.ts'
import { merge, outcome, said } from './turn.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

const body = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s))
      c.close()
    },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parse', () => {
  it('splits frames at blank lines and keeps the unfinished tail', () => {
    const out = parse('event: session\ndata: {"id":"a"}\n\n: ping\n\nevent: event\ndata: {"se')
    expect(out.frames).toEqual([{ event: 'session', data: '{"id":"a"}', id: '' }])
    expect(out.rest).toBe('event: event\ndata: {"se')
  })

  it('joins data lines, defaults the event name, reads CRLF', () => {
    expect(parse('data: a\r\ndata: b\r\nid: 7\r\n\r\n').frames).toEqual([{ event: 'message', data: 'a\nb', id: '7' }])
  })

  it('reads a frame split across chunks', async () => {
    const got: string[] = []
    await read(body('event: ev', 'ent\ndata: {"seq"', ':1}\n', '\n'), (f) => got.push(`${f.event} ${f.data}`))
    expect(got).toEqual(['event {"seq":1}'])
  })
})

describe('watch', () => {
  it('follows one tree, reports each open, and reconnects after a drop', async () => {
    vi.useFakeTimers()
    const ctl = new AbortController()
    const urls: string[] = []
    const auth: (string | null)[] = []
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        urls.push(url)
        auth.push(new Headers(init.headers).get('authorization'))
        n += 1
        if (n === 1) return new Response(body('event: session\ndata: {"id":"sess_1","status":"running"}\n\n'), { status: 200 })
        if (n === 2) return new Response(body('event: event\ndata: {"id":"e1","seq":3,"kind":"log","payload":{"message":"go test"}}\n\n'), { status: 200 })
        ctl.abort()
        return new Response(null, { status: 200 })
      }),
    )
    const sessions: Session[] = []
    const events: Event[] = []
    const opens: number[] = []
    const done = watch(T, 'sess_1', { session: (s) => sessions.push(s), event: (e) => events.push(e), open: (a) => opens.push(a) }, ctl.signal)
    await vi.runAllTimersAsync()
    await done
    expect(urls[0]).toBe('https://api.hanzo.ai/v1/agent/sessions/stream?root=sess_1')
    expect(auth[0]).toBe('Bearer tok')
    expect(sessions.map((s) => s.status)).toEqual(['running'])
    expect(events.map((e) => e.seq)).toEqual([3])
    expect(opens).toEqual([0, 1])
  })

  it('ends on a refusal instead of retrying it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))
    await expect(watch(T, 'sess_1', {}, new AbortController().signal)).rejects.toMatchObject({ status: 403 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('turns', () => {
  it('says a coding run in sentences, never its payload', () => {
    expect(said({ kind: 'status', payload: { status: 'started', repo: 'x', branch: 'agent/sess_1' } })).toBe('Started on agent/sess_1')
    expect(said({ kind: 'tool-call', payload: { step: 'test', message: 'go test ./...', status: 'ok' } })).toBe('go test ./...')
    expect(said({ kind: 'status', payload: '{"status":"done","changed":true,"branch":"agent/sess_1","pr":"#42"}' })).toBe('Pushed agent/sess_1 — #42')
    expect(said({ kind: 'status', payload: { status: 'done', changed: false } })).toBe('Done — nothing to change')
    // A plan's answer is its final status, read as text.
    expect(said({ kind: 'status', payload: { status: 'done', mode: 'plan', changed: false, plan: '1. Read auth.go\n2. Add a test' } })).toBe('1. Read auth.go\n2. Add a test')
    expect(said({ kind: 'status', payload: { status: 'done', mode: 'plan', changed: false } })).toBe('Planned — the run answered with no plan')
    expect(said({ kind: 'status', payload: { status: 'error', error: 'clone failed' } })).toBe('clone failed')
    expect(said({ kind: 'event', payload: { type: 'done', changed: ['/home/runner/work/a.ts', '/tmp/b.ts'] } })).toBe('Done — changed a.ts, b.ts')
    expect(said({ kind: 'log', payload: { host: 'box', cwd: '/secret' } })).toBe('')
  })

  it('reads how the run ended off its narration, and never a link or a branch', () => {
    const o = outcome([
      { seq: 2, kind: 'status', payload: { status: 'done', branch: 'attacker', url: 'https://evil.example/pr', prError: 'no token' } },
      { seq: 1, kind: 'status', payload: { status: 'started', branch: 'agent/sess_1' } },
    ])
    expect(o).toEqual({ status: 'done', problem: 'no token' })
  })

  it('merges a read and a feed without doubling a turn', () => {
    const a = [{ id: 'e1', seq: 1 }, { id: 'e2', seq: 2 }]
    const b = [{ id: 'e2', seq: 2 }, { id: 'e3', seq: 3 }]
    expect(merge(a, b).map((e) => e.seq)).toEqual([1, 2, 3])
  })
})

describe('who', () => {
  it('shortens a subject to its org and first block', async () => {
    const { who } = await import('./turn.ts')
    expect(who('hanzo/2d4d67ab-30f1-474e-b81f-f60461852259')).toBe('hanzo/2d4d67ab')
    expect(who('agent')).toBe('agent')
    expect(who('2d4d67ab-30f1-474e-b81f-f60461852259')).toBe('2d4d67ab')
  })
})

describe('pull', () => {
  it('draws a pull request in the same repository as the run, on GitHub or the platform git, and nothing else', async () => {
    const { pull } = await import('./turn.ts')
    expect(pull('https://github.com/hanzo-inc/cloud/pull/42', 'hanzo-inc/cloud')).toEqual({ href: 'https://github.com/hanzo-inc/cloud/pull/42', label: '#42' })
    expect(pull('https://git.hanzo.ai/hanzo/site/pulls/7', 'Hanzo/Site')).toEqual({ href: 'https://git.hanzo.ai/hanzo/site/pulls/7', label: '#7' })
    for (const [bad, repo] of [
      ['https://github.com/mallory/cloud/pull/1', 'hanzo-inc/cloud'],
      ['https://github.com/hanzo-inc/cloud/pull/1', ''],
      ['https://github.com.evil.example/a/b/pull/1', 'a/b'],
      ['https://evil.example/a/b/pull/1', 'a/b'],
      ['javascript:alert(1)', 'a/b'],
      ['https://github.com/a/b/issues/1', 'a/b'],
      ['http://github.com/a/b/pull/1', 'a/b'],
    ])
      expect(pull(bad, repo)).toEqual({ href: '', label: '' })
  })
})
