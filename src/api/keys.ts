/**
 * A person's own API keys: one secret key (sk-, it belongs on a server) and one
 * publishable key (pk-, safe in a page's source), at most one of each.
 *
 *   GET    /v1/account/keys             {keys: [{type, prefix, key?, limit?, createdAt}]}
 *   POST   /v1/account/keys             {type, limit?} → {key, type, limit}, answered once
 *   DELETE /v1/account/keys?type=…      revoke that one
 *
 * Creating is rotating: a new key of a type ends the one before it. A secret key
 * is answered once and by its prefix after; a publishable key is public by
 * construction and always comes back whole. A limit only narrows what a key may
 * reach — `model:zen5`, `project:acme`, `product:commerce`, `model:*`.
 */
import { call, query, type Target } from './call.ts'

export const KINDS = ['secret', 'publishable'] as const
export type Kind = (typeof KINDS)[number]

export interface Key {
  type: Kind
  /** The recognizable head, never enough to use the key. */
  prefix: string
  /** The whole key: a publishable key's only. */
  key: string
  /** `kind:name` entries; none reaches whatever its holder does. */
  limit: string[]
  /** When it last changed, as IAM records it. */
  created: string
}

export interface Minted {
  type: Kind
  /** The key itself. A secret one is never readable again. */
  key: string
  limit: string[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s !== '') : [])
const kind = (v: unknown): Kind | null => (KINDS.includes(v as Kind) ? (v as Kind) : null)

export async function keys(t: Target): Promise<Key[]> {
  const r = await call<{ keys?: unknown }>(t, 'GET', '/v1/account/keys')
  const rows = Array.isArray(r?.keys) ? r.keys : []
  const out: Key[] = []
  for (const raw of rows) {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const type = kind(o.type)
    if (!type) continue
    out.push({ type, prefix: str(o.prefix), key: str(o.key), limit: list(o.limit), created: str(o.createdAt) })
  }
  return out
}

/** A `kind:name` limit: a lowercase kind, a colon, and a name or `*`. */
export const LIMIT = /^[a-z][a-z0-9-]*:[^\s,:]+$/

/** The limits a person typed, split on commas and spaces; throws on the first that is not one. */
export function limits(raw: string): string[] {
  const out = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const bad = out.find((s) => !LIMIT.test(s))
  if (bad) throw new Error(`${bad} is not a limit — write it as kind:name, like model:zen5`)
  return out
}

/** Create a key of this type, ending the one before it. The answer is the only time a secret key is shown. */
export async function mint(t: Target, type: Kind, limit: string[] = []): Promise<Minted> {
  const r = await call<Record<string, unknown>>(t, 'POST', '/v1/account/keys', limit.length ? { type, limit } : { type })
  const key = str(r?.key) || str(r?.accessKey)
  if (!key) throw new Error('The platform answered no key')
  return { type: kind(r?.type) ?? type, key, limit: list(r?.limit) }
}

export async function revoke(t: Target, type: Kind): Promise<void> {
  await call<unknown>(t, 'DELETE', `/v1/account/keys${query({ type })}`)
}
