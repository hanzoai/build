/**
 * The models a run can be routed through, from the platform's own catalog.
 *
 *   GET /v1/models → {data: [{id, …}]}
 *
 * `enso` is the router: it picks a model per step, which is why it is the
 * default and why it is not a model a person has to understand to use.
 *
 * After what the gateway serves come the models nobody can call yet, from
 * @hanzo/ui's `RESEARCH`: listed so a person knows they exist, disabled so no
 * run is ever started on one, with where to ask for access.
 */
import { RESEARCH } from '@hanzo/ui/models/catalog'

import { call, type Target } from './call.ts'

export interface Model {
  id: string
  label: string
  /** Listed and never chosen. */
  disabled?: boolean
  hint?: string
  /** Where a person asks for access to a model they cannot call. */
  request?: string
}

export const ENSO = 'enso'

/** A readable name for an id: `anthropic/claude-opus-5.5` → `Claude Opus 5.5`, `zen5-coder` → `Zen5 Coder`. */
export function label(id: string): string {
  const tail = id.slice(id.lastIndexOf('/') + 1).replace(/:.*$/, '')
  return tail
    .split('-')
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ')
}

export async function models(t: Target): Promise<Model[]> {
  const raw = await call<{ data?: unknown }>(t, 'GET', '/v1/models')
  const rows = Array.isArray(raw?.data) ? raw.data : []
  const ids = rows
    .map((r) => (r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' ? (r as { id: string }).id : ''))
    .filter((id) => id && !id.endsWith(':batch'))
  const out = [...new Set([ENSO, ...ids])]
  return [
    ...out.map((id) => ({ id, label: label(id) })),
    ...RESEARCH.filter((m) => !out.includes(m.id)).map((m) => ({
      id: m.id,
      label: m.label ?? label(m.id),
      disabled: true,
      hint: 'Research preview',
      request: m.request,
    })),
  ]
}

/**
 * The models an agent may think with on a surface a customer reads: Hanzo's own
 * SKUs — Enso, Zen and the free tier — by their Hanzo names, and none of the
 * embedding, guard, rerank, speech or vision models, which hold no conversation.
 */
export function skus(list: readonly Model[]): Model[] {
  return list.filter((m) => /^(enso|zen\d*|free)(-[a-z0-9]+)*$/.test(m.id) && !/-(embedding|guard|rerank|scribe|vl|voice)\b/.test(m.id))
}
