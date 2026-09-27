/**
 * Plugins: TypeScript connectors an org builds, and what this deployment mounts.
 *
 *   GET    /v1/tool/plugins/authored        {plugins: [plugin]}, newest first, each with its source
 *   POST   /v1/tool/plugins/build           {name, provider?, source | spec} → 201 {bytes, generated, plugin}
 *   DELETE /v1/tool/plugins/authored/{id}   {deleted}
 *   GET    /v1/tool/plugins                 {plugins: [{name, enabled, prefixes}]}
 *
 * Building is the gate: the platform bundles the source and compiles it in the
 * runtime that will run it, and keeps it only if both succeed — a failure is a
 * 422 whose reason is the bundler's. A spec (an OpenAPI document or prose) has a
 * model write the source, which comes back to be read. A plugin never carries a
 * credential: it names the connectors provider whose credential it reads when it
 * runs. The mounted list is the deployment's own subsystems, read-only.
 */
import { call, seg, type Target } from './call.ts'

export interface Plugin {
  /** What a delete addresses. */
  id: string
  name: string
  /** The connectors provider whose credential it reads, or ''. */
  provider: string
  /** The TypeScript as written or generated. */
  source: string
  /** When it was last built, Unix seconds. */
  built: number
}

export interface Mount {
  name: string
  enabled: boolean
  prefixes: string[]
}

export interface Built {
  plugin: Plugin
  /** The size of the bundle the runtime executes. */
  bytes: number
  /** Whether a model wrote the source from a spec. */
  generated: boolean
}

/** A plugin's name: one lowercase path segment, the id it runs by. */
export const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const rows = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export function plugin(raw: unknown): Plugin {
  const o = obj(raw)
  return { id: str(o.id), name: str(o.name), provider: str(o.provider), source: str(o.source), built: num(o.createdAt) }
}

export async function authored(t: Target): Promise<Plugin[]> {
  return rows(obj(await call<unknown>(t, 'GET', '/v1/tool/plugins/authored')).plugins).map(plugin).filter((p) => p.id)
}

export async function mounted(t: Target): Promise<Mount[]> {
  return rows(obj(await call<unknown>(t, 'GET', '/v1/tool/plugins')).plugins)
    .map((r) => {
      const o = obj(r)
      return { name: str(o.name), enabled: o.enabled === true, prefixes: rows(o.prefixes).map(str).filter(Boolean) }
    })
    .filter((m) => m.name)
}

export interface Build {
  name: string
  provider: string
  /** Exactly one of the two carries text. */
  source: string
  spec: string
}

/** Why a plugin cannot be built as it stands, or '' when it can. */
export function refuse(b: Build): string {
  if (!NAME.test(b.name)) return 'A name is one lowercase word: letters, digits, _ or -'
  if (!b.source.trim() === !b.spec.trim()) return 'Give the TypeScript or the API it calls, one of the two'
  return ''
}

export async function build(t: Target, b: Build): Promise<Built> {
  const why = refuse(b)
  if (why) throw new Error(why)
  const body: Record<string, string> = { name: b.name }
  if (b.provider.trim()) body.provider = b.provider.trim()
  if (b.source.trim()) body.source = b.source
  else body.spec = b.spec
  const r = obj(await call<unknown>(t, 'POST', '/v1/tool/plugins/build', body))
  return { plugin: plugin(r.plugin), bytes: num(r.bytes), generated: r.generated === true }
}

export async function remove(t: Target, id: string): Promise<void> {
  await call<unknown>(t, 'DELETE', `/v1/tool/plugins/authored/${seg(id)}`)
}
