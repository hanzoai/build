/**
 * Where a run can run: the platform's sandbox, or one of the org's machines.
 *
 *   GET /v1/agent/targets → {targets: [...]}, newest first (machines.ts)
 *
 * The sandbox is not a row the platform lists — it is what a run gets when it
 * names no target — so it is the first place here and carries no id. A machine
 * can take a run only while it is online.
 */
import type { Target } from './call.ts'
import { machines } from './machines.ts'

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

export async function places(t: Target): Promise<Place[]> {
  const list = await machines(t)
  return [SANDBOX, ...list.map(({ id, label, kind, status, capacity }) => ({ id, label, kind, status, capacity }))]
}

/** Whether a run sent here now would be taken. */
export const ready = (p: Place): boolean => p.status === 'online'
