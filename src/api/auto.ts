/**
 * Automations: flows that run themselves.
 *
 *   GET    /v1/auto/flows              {data: [flow]}   newest updated first
 *   GET    /v1/auto/flows/{id}         the flow and its latest version (the name)
 *   POST   /v1/auto/flows              a disabled draft
 *   POST   /v1/auto/flows/{id}/enable
 *   POST   /v1/auto/flows/{id}/disable
 *
 * The list page records the id and whether the trigger is armed. The name lives
 * on the latest version, so each row is read once more.
 */
import { call, seg, type Target } from './call.ts'

export interface Automation {
  id: string
  name: string
  /** ENABLED or DISABLED. */
  status: string
  /** Unix milliseconds, or 0. */
  updated: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

export function automation(raw: unknown): Automation | null {
  const o = obj(raw)
  const id = str(o.id)
  if (!id) return null
  const version = obj(o.version)
  return {
    id,
    name: str(version.displayName) || str(o.displayName) || id,
    status: str(o.status) || 'DISABLED',
    updated: typeof o.updated === 'number' ? o.updated : 0,
  }
}

export async function flows(t: Target): Promise<Automation[]> {
  const raw = await call<unknown>(t, 'GET', '/v1/auto/flows')
  const data = Array.isArray(obj(raw).data) ? (obj(raw).data as unknown[]) : []
  const rows = data.map(automation).filter((a): a is Automation => a !== null).slice(0, 40)
  return Promise.all(
    rows.map(async (a) => {
      if (a.name !== a.id) return a
      try {
        return automation(await call<unknown>(t, 'GET', `/v1/auto/flows/${seg(a.id)}`)) ?? a
      } catch {
        return a
      }
    }),
  )
}

/** A disabled draft. Creating it does not arm the trigger. */
export async function add(t: Target, name: string): Promise<Automation> {
  const displayName = name.trim()
  if (!displayName) throw new Error('Name the automation')
  const raw = await call<unknown>(t, 'POST', '/v1/auto/flows', {
    displayName,
    trigger: {
      name: 'trigger',
      type: 'PIECE_TRIGGER',
      displayName: 'Start',
      strategy: 'MANUAL',
      settings: { pieceName: 'core', triggerName: 'manual' },
    },
  })
  const row = automation(raw)
  if (!row) throw new Error('The automation was created and did not come back named')
  return row
}

/** Arm or disarm the trigger. A disarmed flow can still be started on demand. */
export async function arm(t: Target, id: string, on: boolean): Promise<void> {
  await call(t, 'POST', `/v1/auto/flows/${seg(id)}/${on ? 'enable' : 'disable'}`)
}
