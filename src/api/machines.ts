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

export interface GPU {
  vendor?: string
  model?: string
  memory?: number
}

export interface MachineSpec {
  os?: string
  arch?: string
  cpus?: number
  memory?: number
  gpus?: GPU[]
}

export interface MachineMetrics {
  load1?: number
  load5?: number
  load15?: number
  memUsed?: number
  memFree?: number
  gpuUtil?: number
  cpuUtil?: number
  cpuTemp?: number
  gpuTemp?: number
  gpuPower?: number
  gpuPowerLimit?: number
  gpuMemUsed?: number
  gpuMemTotal?: number
  diskUsed?: number
  diskTotal?: number
  diskRead?: number
  diskWrite?: number
  netRx?: number
  netTx?: number
  model?: string
  decode?: number
  prefill?: number
  ttft?: number
  running?: number
  waiting?: number
  at?: number
}

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
  serving?: boolean
  createdAt?: string
  updatedAt?: string
  spec?: MachineSpec
  metrics?: MachineMetrics
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const val = bytes / Math.pow(k, i)
  return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${sizes[i]}`
}

export function formatPercent(fraction?: number): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return ''
  return `${Math.round(fraction * 100)}%`
}

export function formatRelative(isoDate?: string): string {
  if (!isoDate) return ''
  const t = new Date(isoDate).getTime()
  if (Number.isNaN(t)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function specSummary(m: Machine): string {
  if (m.spec) {
    const parts: string[] = []
    if (m.spec.cpus) parts.push(`${m.spec.cpus} vCPU`)
    if (m.spec.memory) parts.push(formatBytes(m.spec.memory))
    if (m.spec.gpus && m.spec.gpus.length > 0) {
      const g = m.spec.gpus[0]
      parts.push(`${m.spec.gpus.length}× ${g.model || g.vendor || 'GPU'}${g.memory ? ` (${formatBytes(g.memory)})` : ''}`)
    }
    if (parts.length > 0) return parts.join(' · ')
  }
  return m.capacity || ''
}

export function machine(raw: unknown): Machine {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const specObj = obj(o.spec)
  const metricsObj = obj(o.metrics)

  let spec: MachineSpec | undefined
  if (Object.keys(specObj).length > 0) {
    const rawGpus = Array.isArray(specObj.gpus) ? specObj.gpus : []
    spec = {
      os: str(specObj.os),
      arch: str(specObj.arch),
      cpus: num(specObj.cpus),
      memory: num(specObj.memory),
      gpus: rawGpus.map((g: unknown) => {
        const go = obj(g)
        return { vendor: str(go.vendor), model: str(go.model), memory: num(go.memory) }
      }),
    }
  }

  let metrics: MachineMetrics | undefined
  if (Object.keys(metricsObj).length > 0) {
    metrics = {
      load1: num(metricsObj.load1),
      load5: num(metricsObj.load5),
      load15: num(metricsObj.load15),
      memUsed: num(metricsObj.memUsed),
      memFree: num(metricsObj.memFree),
      gpuUtil: num(metricsObj.gpuUtil),
      cpuUtil: num(metricsObj.cpuUtil),
      cpuTemp: num(metricsObj.cpuTemp),
      gpuTemp: num(metricsObj.gpuTemp),
      gpuPower: num(metricsObj.gpuPower),
      gpuPowerLimit: num(metricsObj.gpuPowerLimit),
      gpuMemUsed: num(metricsObj.gpuMemUsed),
      gpuMemTotal: num(metricsObj.gpuMemTotal),
      diskUsed: num(metricsObj.diskUsed),
      diskTotal: num(metricsObj.diskTotal),
      diskRead: num(metricsObj.diskRead),
      diskWrite: num(metricsObj.diskWrite),
      netRx: num(metricsObj.netRx),
      netTx: num(metricsObj.netTx),
      model: str(metricsObj.model),
      decode: num(metricsObj.decode),
      prefill: num(metricsObj.prefill),
      ttft: num(metricsObj.ttft),
      running: num(metricsObj.running),
      waiting: num(metricsObj.waiting),
    }
  }

  const m: Machine = {
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

  Object.defineProperties(m, {
    serving: { value: o.serving === true, enumerable: false, writable: true },
    createdAt: { value: str(o.createdAt), enumerable: false, writable: true },
    updatedAt: { value: str(o.updatedAt), enumerable: false, writable: true },
    spec: { value: spec, enumerable: false, writable: true },
    metrics: { value: metrics, enumerable: false, writable: true },
  })

  return m
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

/**
 * Register a machine by hand. One left unnamed takes its hostname, the name `hanzo
 * link` gives it; `hanzo link` on a machine with this hostname takes the row over.
 */
export async function add(t: Target, what: { label: string; kind: Kind; host?: string; capacity?: string }): Promise<Machine> {
  const host = (what.host ?? '').trim()
  const label = what.label.trim() || host
  if (!label) throw new Error('A machine needs a name or a hostname')
  const body: Record<string, unknown> = { label, kind: what.kind }
  if (host) body.host = host
  if (what.capacity?.trim()) body.capacity = what.capacity.trim()
  return machine(await call<unknown>(t, 'POST', '/v1/agent/targets', body))
}

/**
 * A machine's status as a person reads it. The platform reports a hand-registered
 * machine at its registered status until a heartbeat arrives, so `online` holds only
 * once one has; before that it is `not seen yet`, and nothing is there to take a run.
 */
export function state(m: Machine): string {
  return m.status === 'online' && !m.seen ? 'not seen yet' : m.status
}

/** Rename a machine, or drain it (`draining`) and bring it back (`online`). */
export async function change(
  t: Target,
  id: string,
  what: { label?: string; status?: 'online' | 'draining'; capacity?: string; kind?: Kind; host?: string }
): Promise<Machine> {
  const body: Record<string, unknown> = {}
  if (what.label !== undefined) {
    const label = what.label.trim()
    if (!label) throw new Error('A machine needs a name')
    body.label = label
  }
  if (what.status !== undefined) body.status = what.status
  if (what.capacity !== undefined) body.capacity = what.capacity.trim()
  if (what.kind !== undefined) body.kind = what.kind
  if (what.host !== undefined) body.host = what.host.trim()
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
