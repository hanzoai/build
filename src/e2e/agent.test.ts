/**
 * A live turn through the local agent, then the same projection the run page uses.
 *
 * Off unless HANZO_E2E=1 (`pnpm e2e`). The GPU pool is the agent's configured
 * target. When it has no replica, the turn still runs on the local agent on
 * this machine. The events are the coding plane's: a tool-call, a log, a status.
 */
import { describe, expect, it } from 'vitest'

import { outcome, said, shell, steps } from '../api/turn.ts'

const LIVE = process.env.HANZO_E2E === '1'
const POOL = process.env.HANZO_POOL || 'http://10.0.0.19:1235/v1'
const LOCAL = process.env.HANZO_LOCAL_AGENT || 'http://127.0.0.1:11434'
const MODEL = process.env.HANZO_E2E_MODEL || 'qwen3:0.6b'

async function up(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok || res.status === 503
  } catch {
    return false
  }
}

function jsonOf(text: string): { steps: { name: string; status: string }[]; command: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(text)
  return JSON.parse(text.slice(start, end + 1)) as { steps: { name: string; status: string }[]; command: string }
}

describe.skipIf(!LIVE)('local agent', () => {
  it('reads the GPU pool the agent is pointed at', async () => {
    if (!(await up(`${POOL}/models`))) throw new Error(`The GPU pool is not reachable at ${POOL}`)
    const res = await fetch(`${POOL}/models`, { signal: AbortSignal.timeout(5000) })
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { data?: { id?: string }[] }
    const ids = (body.data ?? []).map((m) => m.id)
    expect(ids).toContain('qwen3.8')
  })

  it('runs one agent turn on the local model and projects it like a sandbox run', async () => {
    if (!(await up(`${LOCAL}/api/tags`))) throw new Error(`The local agent is not running at ${LOCAL}`)
    const res = await fetch(`${LOCAL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 80 },
        messages: [
          {
            role: 'user',
            content:
              'Reply with exactly {"steps":[{"name":"read","status":"ok"}],"command":"ls"} and no other keys.',
          },
        ],
      }),
    })
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { message?: { content?: string } }
    const turn = jsonOf(body.message?.content ?? '')
    expect(turn.command).toBe('ls')
    expect(turn.steps[0]).toMatchObject({ name: 'read', status: 'ok' })

    const events = [
      { seq: 1, kind: 'tool-call', payload: { step: turn.steps[0].name, status: turn.steps[0].status, message: turn.command } },
      { seq: 2, kind: 'log', payload: { stdout: 'README.md\n' } },
      { seq: 3, kind: 'status', payload: { status: 'done' } },
    ]
    expect(steps(events)).toEqual([{ name: 'read', done: true }])
    expect(shell(events)).toEqual([
      { role: 'cmd', text: 'read' },
      { role: 'out', text: 'ls' },
      { role: 'out', text: 'README.md\n' },
    ])
    expect(said(events[1])).toBe('')
    expect(outcome(events)).toEqual({ status: 'done', problem: '' })
  })
})
