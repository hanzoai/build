import { afterEach, describe, expect, it, vi } from 'vitest'

import { hire, missing, run, type Cast } from './agents.ts'

const CAST: Cast[] = [
  { name: 'dev', description: 'Dev — Engineer', model: 'enso-flash', instructions: 'You are Dev.' },
  { name: 'qa', description: 'QA — Automated Testing & Verification', model: 'enso-auto', instructions: '' },
]
const t = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'acme' }

afterEach(() => vi.unstubAllGlobals())

describe('the default cast', () => {
  it('is what the org has no agent for, by name in any case', () => {
    expect(missing(CAST, [{ name: 'DEV' }]).map((c) => c.name)).toEqual(['qa'])
    expect(missing(CAST, [])).toEqual(CAST)
  })

  it('is made one member at a time, each with a budget, and stops at the first refusal', async () => {
    const sent: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        sent.push(body)
        return body.name === 'qa' ? new Response(JSON.stringify({ detail: 'over the agent limit' }), { status: 403 }) : new Response(JSON.stringify({ name: body.name }), { status: 201 })
      }),
    )
    const out = await hire(t, CAST, [])
    expect(out.made).toEqual(['dev'])
    expect(out.error).toBeTruthy()
    expect(sent[0]).toMatchObject({ name: 'dev', description: 'Dev — Engineer', model: 'enso-flash', instructions: 'You are Dev.', cap_micro_usd: 10_000_000, max_task_micro_usd: 1_000_000, period: 'month' })
  })

  it('reads a run as its profile lists it', () => {
    expect(run({ id: 'run_1', status: 'ok', model: 'enso', input: 'hi', output: 'hello', durationMs: 12, createdAt: '2026-10-20T00:00:00Z' })).toEqual({ id: 'run_1', status: 'ok', model: 'enso', input: 'hi', output: 'hello', error: '', ms: 12, at: '2026-10-20T00:00:00Z' })
  })
})
