/**
 * A run's sandbox after the run: where it is in its life, parking and resuming
 * it, what it serves and the address that opens it, a door asked of a parked
 * sandbox, and what the run left.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Target } from './call.ts'
import { artifact, artifacts } from './coding.ts'
import * as sandbox from './sandbox.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

type Reply = { status: number; body?: unknown }

/** Answers each call in turn, keeping what was sent; the last reply repeats. */
function replies(...rs: Reply[]) {
  const seen: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      seen.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined })
      const r = rs[Math.min(seen.length - 1, rs.length - 1)]!
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
    }),
  )
  return seen
}

afterEach(() => vi.unstubAllGlobals())

describe('a sandbox', () => {
  it('reads where it is in its life, and one no longer held as gone', async () => {
    replies({ status: 200, body: { id: 'm_1', status: 'parked', expiresAt: 1790726400 } })
    expect(await sandbox.sandbox(T, 'm_1')).toEqual({ id: 'm_1', state: 'parked', ends: 1790726400000, error: '' })
    replies({ status: 404, body: { detail: 'not found' } })
    expect(await sandbox.sandbox(T, 'm_1')).toMatchObject({ state: 'gone' })
    replies({ status: 200, body: { status: 'paused' } })
    expect(await sandbox.sandbox(T, 'm_1')).toMatchObject({ state: 'parked' })
    replies({ status: 200, body: { status: 'error', error: 'no capacity' } })
    expect(await sandbox.sandbox(T, 'm_1')).toMatchObject({ state: 'error', error: 'no capacity' })
  })

  it('parks and resumes under its own id', async () => {
    const seen = replies({ status: 200, body: { status: 'parked' } }, { status: 200, body: { status: 'running' } })
    expect(await sandbox.park(T, 'm_1')).toMatchObject({ state: 'parked' })
    expect(await sandbox.wake(T, 'm_1')).toMatchObject({ state: 'running' })
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual(['POST https://api.hanzo.ai/v1/sandbox/m_1/pause', 'POST https://api.hanzo.ai/v1/sandbox/m_1/resume'])
  })

  it('resumes a parked sandbox when its door is asked for, then asks again', async () => {
    const seen = replies(
      { status: 409, body: { detail: 'the sandbox is parked' } },
      { status: 200, body: { status: 'running' } },
      { status: 200, body: { url: '/v1/sandbox/m_1/screen?ticket=s' } },
    )
    expect(await sandbox.door(T, 'm_1', 'screen')).toBe('https://api.hanzo.ai/v1/sandbox/m_1/screen?ticket=s')
    expect(seen.map((s) => s.url)).toEqual([
      'https://api.hanzo.ai/v1/sandbox/m_1/screen/ticket',
      'https://api.hanzo.ai/v1/sandbox/m_1/resume',
      'https://api.hanzo.ai/v1/sandbox/m_1/screen/ticket',
    ])
  })

  it('lists what listens, and opens a port at its own origin', async () => {
    replies({ status: 200, body: { ports: [{ port: 3000, host: 'sandbox-ab-preview-3000.hanzo.app' }, { port: 0 }, 'junk', { port: 70000 }] } })
    expect(await sandbox.ports(T, 'm_1')).toEqual([{ port: 3000, host: 'sandbox-ab-preview-3000.hanzo.app' }])
    const seen = replies({ status: 201, body: { url: 'https://sandbox-ab-preview-3000.hanzo.app/_hanzo/enter?ticket=t', port: 3000, expiresIn: 30 } })
    expect(await sandbox.preview(T, 'm_1', 3000)).toBe('https://sandbox-ab-preview-3000.hanzo.app/_hanzo/enter?ticket=t')
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'https://api.hanzo.ai/v1/sandbox/m_1/preview', body: { port: 3000 } })
  })

  it('refuses a preview address that is not https', async () => {
    replies({ status: 201, body: { url: 'javascript:alert(1)' } })
    await expect(sandbox.preview(T, 'm_1', 3000)).rejects.toMatchObject({ status: 502 })
  })
})

describe('what a run left', () => {
  it('reads its artifacts, dropping any it cannot name', async () => {
    replies({
      status: 200,
      body: {
        session: 'sess_1',
        saved: '2026-09-29T19:00:00Z',
        artifacts: [
          { name: 'src/a.ts', kind: 'file', size: 12, sha256: 'ab' },
          { name: 'changes.patch', kind: 'patch', size: 40 },
          { name: 'preview 3000', kind: 'preview', port: 3000, url: 'sandbox-ab-preview-3000.hanzo.app' },
          { name: 'pull', kind: 'pull', url: 'https://github.com/o/r/pull/4' },
          { kind: 'file' },
          { name: 'x', kind: 'other' },
        ],
      },
    })
    const left = await artifacts(T, 'sess_1')
    expect(left.saved).toBe('2026-09-29T19:00:00Z')
    expect(left.artifacts.map((a) => [a.kind, a.name])).toEqual([
      ['file', 'src/a.ts'],
      ['patch', 'changes.patch'],
      ['preview', 'preview 3000'],
      ['pull', 'pull'],
    ])
  })

  it('fetches a stored artifact’s bytes by its path', async () => {
    const seen = replies({ status: 200, body: 'hello' })
    expect(await (await artifact(T, 'sess_1', 'src/a b.ts')).text()).toBe('"hello"')
    expect(seen[0]!.url).toBe('https://api.hanzo.ai/v1/agent/coding/sess_1/artifacts/src/a%20b.ts')
  })
})
