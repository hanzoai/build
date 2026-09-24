/**
 * Where a run can run: the platform's sandbox, or one of the org's machines.
 *
 *   GET /v1/agent/targets → {targets: [...]}, newest first
 *
 * The sandbox is not a row the platform lists — it is what a run gets when it
 * names no target — so it is the first place here and carries no id. A machine
 * can take a run only while it is online.
 */
import { call, type Target } from './call.ts'

export interface Place {
  /** `tgt_…`, or '' for the sandbox. */
  id: string
  label: string
  /** laptop | gpu | cloud | … as the platform names it; 'sandbox' for the sandbox. */
  kind: string
  /** online | offline | draining; the sandbox is always online. */
  status: string
  /** "10 vCPU / 122G / 1× GB10", when the machine reported one. */
  capacity: string
}

export const SANDBOX: Place = { id: '', label: 'Hanzo sandbox', kind: 'sandbox', status: 'online', capacity: '' }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function places(t: Target): Promise<Place[]> {
  const raw = (await call<{ targets?: unknown }>(t, 'GET', '/v1/agent/targets')) ?? {}
  const rows = Array.isArray(raw.targets) ? raw.targets : []
  const machines = rows
    .map((r) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      return {
        id: str(o.id),
        label: str(o.label) || str(o.host) || str(o.id),
        kind: str(o.kind),
        status: str(o.status),
        capacity: str(o.capacity),
      }
    })
    .filter((p) => p.id)
  return [SANDBOX, ...machines]
}

/** Whether a run sent here now would be taken. */
export const ready = (p: Place): boolean => p.status === 'online'
