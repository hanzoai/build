/**
 * The model a surface starts its next run on, and how a pick changes it.
 *
 * A premium pick holds HERE, for the runs started from this screen, and is
 * never kept as the default — the next New opens on what was kept, Enso unless
 * the person kept another. Any other pick is kept. A kept premium model (from
 * before this rule) is not a default either, so Enso stands in for it.
 */
import { useState } from 'react'

import { ENSO, type Model } from './api/models.ts'

export function usePick(kept: string, keep: (id: string) => void, catalog: readonly Model[]) {
  const [once, setOnce] = useState<string | null>(null)
  const premium = (id: string) => catalog.find((m) => m.id === id)?.class === 'premium'
  const pick = (id: string) => {
    if (premium(id)) return setOnce(id)
    setOnce(null)
    keep(id)
  }
  return [once ?? (premium(kept) ? ENSO : kept), pick] as const
}
