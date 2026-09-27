/**
 * The org's machines: its own computers a run can be sent to, beside the sandbox.
 *
 *   GET    /v1/agent/targets            {targets: [...]}, newest first
 *   POST   /v1/agent/targets            register one by hand {label, kind, host}
 *   PATCH  /v1/agent/targets/{id}       rename it, drain it, bring it back
 *   DELETE /v1/agent/targets/{id}       deregister it
 *   POST   /v1/agent/targets/{id}/key   mint or rotate its claim key, answered once
 *
 * A machine belongs to the member who registered it. Only that member or an org
 * admin changes, removes or keys it, and the platform answers anyone else the
 * same 404 an unknown id gets — the record names no owner — so a 404 here is
 * said as that rule. `hanzo link`, run on the machine, registers it under its
 * hostname and keeps it online while it runs.
 */
import { call, Refusal, seg, type Target } from './call.ts'

export const KINDS = ['laptop', 'gpu', 'cloud', 'cluster', 'machine'] as const
export type Kind = (typeof KINDS)[number]

export interface Machine {
  /** `tgt_…` */
  id: string
  label: string
  /** laptop | gpu | cloud | cluster | machine */
  kind: string
  /** online | offline | draining, as the platform judges it from the last heartbeat. */
  status: string
  /** "10 vCPU / 122G / 1× GB10", when the machine reported one. */
  capacity: string
  /** The hostname its runs report, or '' for one addressed by id only. */
  host: string
  /** The org's runs mapped to it, and how many of those are running now. */
  sessions: number
  running: number
  /** When it last beat, RFC 3339, or '' when it never has. */
  seen: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function machine(raw: unknown): Machine {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    id: str(o.id),
    label: str(o.label) || str(o.host) || str(o.id),
    kind: str(o.kind),
    status: str(o.status),
    capacity: str(o.capacity),
    host: str(o.host),
    sessions: num(o.sessions),
    running: num(o.running),
    seen: str(o.metricsAt),
  }
}

export async function machines(t: Target): Promise<Machine[]> {
  const raw = (await call<{ targets?: unknown }>(t, 'GET', '/v1/agent/targets')) ?? {}
  return (Array.isArray(raw.targets) ? raw.targets : []).map(machine).filter((m) => m.id)
}

/** The platform's 404 for a machine that is someone else's, said as the rule it is. */
async function owned<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof Refusal && e.status === 404) throw new Refusal(404, 'This machine is gone, or not yours to change: only the member who linked it, or an org admin, can.')
    throw e
  }
}

/** Register a machine by hand. `hanzo link` on a machine with this hostname takes the row over. */
export async function add(t: Target, what: { label: string; kind: Kind; host?: string }): Promise<Machine> {
  const label = what.label.trim()
  if (!label) throw new Error('A machine needs a name')
  const host = (what.host ?? '').trim()
  return machine(await call<unknown>(t, 'POST', '/v1/agent/targets', { label, kind: what.kind, ...(host ? { host } : {}) }))
}

/** Rename a machine, or drain it (`draining`) and bring it back (`online`). */
export async function change(t: Target, id: string, what: { label?: string; status?: 'online' | 'draining' }): Promise<Machine> {
  const body: { label?: string; status?: string } = {}
  if (what.label !== undefined) {
    const label = what.label.trim()
    if (!label) throw new Error('A machine needs a name')
    body.label = label
  }
  if (what.status !== undefined) body.status = what.status
  return machine(await owned(call<unknown>(t, 'PATCH', `/v1/agent/targets/${seg(id)}`, body)))
}

export async function remove(t: Target, id: string): Promise<void> {
  await owned(call<unknown>(t, 'DELETE', `/v1/agent/targets/${seg(id)}`))
}

/**
 * Mint the machine's claim key, answered this once: only its hash is kept, and
 * minting again ends the key before it. A runner on the machine sends it as
 * `X-Target-Key` when it claims the runs sent there.
 */
export async function key(t: Target, id: string): Promise<string> {
  const r = await owned(call<{ claimKey?: unknown }>(t, 'POST', `/v1/agent/targets/${seg(id)}/key`))
  const k = str(r?.claimKey)
  if (!k) throw new Error('The platform answered no key')
  return k
}
