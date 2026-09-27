/**
 * A run and its side pane, at the edges of what the platform answers: thin and
 * empty records, the stream's drops and junk, what a follow-up carries from a
 * run that kept nothing, and the sandbox, changes and environment reads when an
 * answer leaves fields out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Target } from './call.ts'
import * as changes from './changes.ts'
import { approve, followUp, headline, start, unhonoured, type Earlier } from './coding.ts'
import { environment, environments, read as readEnvironment } from './environment.ts'
import * as sandbox from './sandbox.ts'
import * as sessions from './sessions.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

interface Seen {
  url: string
  method: string
  body: unknown
}

/** Answers every call with `status` and `body` (no body when undefined), keeping what was sent. */
function answer(status: number, body?: unknown) {
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

const stream = (...chunks: string[]) =>
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

describe('a run’s record', () => {
  it('reads a record that is not an object as an empty one', () => {
    expect(sessions.session(null)).toMatchObject({ id: '', title: '', published: false, events: 0 })
    expect(sessions.session({ events: Number.NaN }).events).toBe(0)
    expect(sessions.event('junk')).toMatchObject({ id: '', seq: 0, payload: undefined })
  })

  it('reads a list with no sessions, and a run with no recent events', async () => {
    answer(200, { next: 3 })
    expect(await sessions.page(T)).toEqual({ sessions: [], next: '' })
    answer(200, { id: 'sess_1' })
    expect((await sessions.get(T, 'sess_1')).recent).toEqual([])
  })

  it('refuses to send an empty steer, and stops with the builder’s own reason', async () => {
    const seen = answer(200, {})
    await expect(sessions.message(T, 'sess_1', '   ')).rejects.toMatchObject({ status: 400, message: 'Say something to the run' })
    await sessions.stop(T, 'sess_1')
    expect(seen).toEqual([{ url: 'https://api.hanzo.ai/v1/agent/sessions/sess_1/stop', method: 'POST', body: { message: 'Stopped from the builder' } }])
  })

  it('counts only finished runs with a real span', () => {
    const run = (createdAt: string, endedAt: string) => sessions.session({ id: 'x', mode: 'setup', status: 'done', createdAt, endedAt })
    const spans = [run('2026-09-27T10:00:00Z', '2026-09-27T10:00:10Z'), run('2026-09-27T10:00:00Z', '2026-09-27T10:00:20Z'), run('2026-09-27T10:00:00Z', '2026-09-27T10:00:30Z')]
    expect(sessions.took([...spans, run('bad', '2026-09-27T10:00:00Z'), run('2026-09-27T10:00:00Z', '2026-09-27T09:00:00Z'), run('2026-09-27T10:00:00Z', '')], 'setup')).toEqual([1, 1])
  })
})

describe('watch', () => {
  it('skips frames it cannot read or has no hand for, and reconnects after a failed or bodiless answer', async () => {
    vi.useFakeTimers()
    const ctl = new AbortController()
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1
        if (n === 1) return new Response(stream('event: session\ndata: {not json\n\nevent: ping\ndata: {}\n\nevent: event\ndata: {"event":{"id":"e1","seq":1}}\n\nevent: session\ndata: {"session":{"id":"s"}}\n\n'), { status: 200 })
        if (n === 2) return new Response('down', { status: 502 })
        if (n === 3) return new Response(null, { status: 200 })
        ctl.abort()
        throw new DOMException('aborted', 'AbortError')
      }),
    )
    const opens: number[] = []
    const done = sessions.watch(T, 'sess_1', { open: (a) => opens.push(a) }, ctl.signal)
    await vi.runAllTimersAsync()
    await done
    expect(n).toBe(4)
    expect(opens).toEqual([0])
  })

  it('backs off longer after each failure, and stops waiting when it is let go', async () => {
    vi.useFakeTimers()
    const ctl = new AbortController()
    const at: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        at.push(Date.now())
        throw new TypeError('Failed to fetch')
      }),
    )
    const done = sessions.watch(T, 'sess_1', {}, ctl.signal)
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000)
    ctl.abort()
    await done
    expect(at.map((t) => t - at[0]!)).toEqual([0, 2000, 6000, 14000])
  })

  it('ends on a 401 as on a 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    await expect(sessions.watch(T, 'sess_1', {}, new AbortController().signal)).rejects.toMatchObject({ status: 401, message: 'This account cannot follow this run' })
  })
})

describe('a run’s changes', () => {
  it('reads a thin answer as nothing pushed', () => {
    expect(changes.changes(null)).toEqual({ repo: '', base: '', head: '', commits: [], files: [], pull: null })
    expect(changes.changes({ commits: 'x', files: {}, pull: { number: 0 } }).pull).toBeNull()
  })

  it('reads a pull request’s state and mergeability as the forge said, or as open and unknown', () => {
    expect(changes.changes({ pull: { number: 3, state: 'merged', mergeable: false } }).pull).toMatchObject({ state: 'merged', mergeable: false, reviews: [] })
    expect(changes.changes({ pull: { number: 3, state: 'draft', mergeable: 'yes' } }).pull).toMatchObject({ state: 'open', mergeable: null })
  })

  it('reads one file at the run’s branch', async () => {
    const seen = answer(200, { path: 'a.go', content: 'package a', size: 9 })
    expect(await changes.blob(T, 'sess_1', 'a.go')).toEqual({ path: 'a.go', text: 'package a', binary: false, truncated: false, size: 9 })
    expect(seen[0]!.url).toBe('https://api.hanzo.ai/v1/agent/coding/sess_1/blob?path=a.go')
    answer(200, { entries: [] })
    await changes.tree(T, 'sess_1')
  })
})

describe('a run’s sandbox', () => {
  it('refuses a ticket answer with no address, even an empty one', async () => {
    answer(204)
    await expect(sandbox.door(T, 'm_1', 'screen')).rejects.toMatchObject({ status: 502 })
  })

  it('reads an empty answer as the path asked for, a file past the cap as too large, and junk names out', async () => {
    answer(204)
    expect(await sandbox.read(T, 'm_1', 'a.txt')).toEqual({ path: 'a.txt', dir: false, names: [], text: '', binary: false, truncated: false })
    answer(200, { dir: true, entries: 'nope' })
    expect((await sandbox.read(T, 'm_1', 'd')).names).toEqual([])
    answer(200, { dir: true, entries: ['b', 7, 'a'], data: btoa('ignored') })
    expect(await sandbox.read(T, 'm_1', 'd')).toMatchObject({ names: ['a', 'b'], text: '' })
    answer(200, { data: btoa('x'.repeat((1 << 20) + 1)) })
    expect(await sandbox.read(T, 'm_1', 'big')).toMatchObject({ truncated: true, text: '' })
  })
})

describe('a codebase’s environment', () => {
  it('reads a non-object answer as a codebase with none, named by its address', async () => {
    answer(200, 'nope')
    expect(await readEnvironment(T, 'site')).toMatchObject({ repo: 'site', state: 'none', proposal: null })
    expect(environment(null)).toMatchObject({ repo: '' })
  })

  it('reads an empty list answer as no environments', async () => {
    answer(204)
    expect(await environments(T)).toEqual([])
  })
})

describe('coding', () => {
  const earlier: Earlier = { id: 'sess_1', title: 'Add the widget', repo: '', base: '', environment: '', project: '', mode: 'build', pushed: false }

  it('says nothing is refused for a build, or a plan with no machine', () => {
    expect(unhonoured('build', 'tgt_1')).toBe('')
    expect(unhonoured('plan')).toBe('')
    expect(unhonoured('setup', '  ')).toBe('')
  })

  it('reads the ask out of a title when the run had no codebase', () => {
    expect(headline('  Add the widget ', '')).toBe('Add the widget')
  })

  it('follows up a run with no codebase and nothing kept from where it started', () => {
    expect(followUp(earlier, 'and tests')).toEqual({ repo: undefined, project: undefined, targetId: undefined, base: undefined, prompt: 'and tests\n\nThis follows an earlier run on this codebase: “Add the widget”.', mode: 'build' })
    expect(followUp({ ...earlier, title: '' }, 'and tests').prompt).toBe('and tests\n\nThis follows an earlier run on this codebase.')
    expect(followUp({ ...earlier, title: '' }, '').prompt).toBe('Continue where the earlier run left off.')
  })

  it('builds a plan whose run had no title from the plan alone', () => {
    expect(approve({ ...earlier, title: '' }, ' 1. do it ').prompt).toBe('Carry out this plan:\n\n1. do it')
  })

  it('starts a run whose answer names nothing but its session', async () => {
    answer(202, { sessionId: 'sess_2', routed: 'yes' })
    expect(await start(T, { prompt: 'go' })).toEqual({ session: 'sess_2', repo: '', branch: '', project: '', routed: false, target: '' })
  })
})
