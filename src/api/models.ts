/**
 * The models a run can be routed through, from the platform's own catalog.
 *
 *   GET /v1/models → {data: [{id, …}]}
 *
 * `enso` is the router: it picks a model per step, which is why it is the
 * default and why it is not a model a person has to understand to use.
 */
import { call, type Target } from './call.ts'

export interface Model {
  id: string
  label: string
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
  return out.map((id) => ({ id, label: label(id) }))
}
