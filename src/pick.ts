/**
 * The model a surface starts its next run on, and how a pick changes it.
 *
 * A premium pick holds HERE, for the runs started from this screen, and is
 * never kept as the default — the next New opens on what was kept, Enso unless
 * the person kept another. Any other pick is kept. A kept premium model (from
 * before this rule) is not a default either, so Enso stands in for it.
 */
import { useEffect, useState } from 'react'

import { defaultModel, parseModels } from '@hanzo/ui/models/catalog'

import { Refusal, type Target } from './api/call.ts'
import { ENSO, models as readModels, type Model } from './api/models.ts'
import { useRead } from './data.ts'

/**
 * What a run starts on with nothing picked on this screen: Enso when Enso is
 * kept — the router serves every ask whether or not a catalog lists it — else
 * the kept model while the catalog still offers it (or has not answered yet),
 * else the catalog's own default for a conversation, else Enso. Never '' — an
 * empty chooser reads "Choose a model" and the run would name nothing on purpose.
 */
export function standing(kept: string, catalog: readonly Model[]): string {
  if (kept === ENSO) return ENSO
  const premium = catalog.find((m) => m.id === kept)?.class === 'premium'
  const offered = catalog.length === 0 || catalog.some((m) => m.id === kept)
  if (kept && !premium && offered) return kept
  return defaultModel(catalog, 'chat') || ENSO
}

export function usePick(kept: string, keep: (id: string) => void, catalog: readonly Model[]) {
  const [once, setOnce] = useState<string | null>(null)
  const premium = (id: string) => catalog.find((m) => m.id === id)?.class === 'premium'
  const pick = (id: string) => {
    if (premium(id)) return setOnce(id)
    setOnce(null)
    keep(id)
  }
  return [once ?? standing(kept, catalog), pick] as const
}

const LAST = 'hanzo.build.models'

/** The router alone: what a chooser offers before any list was ever read, so it reads "Enso" and not an id. */
const ROUTER: Model[] = parseModels([{ id: ENSO, name: 'Enso', family: 'enso', class: 'ours' }])

/** The last list this browser read, or none. */
function last(): Model[] {
  try {
    const kept = parseModels(JSON.parse(window.localStorage.getItem(LAST) ?? 'null'))
    return kept.length ? kept : []
  } catch {
    return []
  }
}

/**
 * The model list, with the last good one kept in this browser: the gateway
 * answers 429 once the org's quota is spent, and a list that vanishes then
 * leaves nothing to choose from. A failed read shows the kept list with a note;
 * with none kept, Enso alone, and the reason in the chooser.
 */
export function useCatalog(t: Target, signed: boolean): { list: Model[]; shown: Model[]; loading: boolean; error: string | null; note: string } {
  const [first] = useState(last)
  const read = useRead(signed ? () => readModels(t) : null, first, [t, signed])
  useEffect(() => {
    if (read.error || !read.value.length || read.value === first) return
    try {
      window.localStorage.setItem(LAST, JSON.stringify(read.value))
    } catch {
      /* the next page reads the list again */
    }
  }, [read.value, read.error, first])
  const failed = read.error !== null
  const held = read.value.length > 0
  const spent = read.error instanceof Refusal && read.error.status === 429
  return {
    // What was read, for the pick to stand on: an empty list keeps the person's pick.
    list: read.value,
    // What the chooser draws.
    shown: held ? read.value : ROUTER,
    loading: read.loading && !held,
    error: failed && !held ? (spent ? 'The model list is resting: this organization’s quota is spent.' : 'The model list could not be read right now.') : null,
    note: failed && held ? 'The model list could not be refreshed; these are the models as last read.' : '',
  }
}
