// The projects this reader has starred.
//
// IT LIVES WITH THE READER, in this browser. Starring is a preference, not a
// fact about the org: the platform publishes no starred field, and inventing a
// server one would make one person's shortlist everybody's.

import { useCallback, useEffect, useState } from 'react'

/** One store, one shortlist per kind, so two kinds never collide on an id that
 *  happens to match. */
const keyOf = (kind: string) => `hanzo.starred-${kind}`

const read = (kind: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(keyOf(kind)) || '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * The starred ids, and the toggle that sets them.
 *
 * Read in an effect rather than in the initialiser, because storage is a fact
 * only the browser holds and reading it during the render that hydrates is how
 * the served markup and the client disagree about a filled star.
 *
 * Every hook instance listens for the change, so starring in one place lights
 * the star in another in the same tick — one set, no prop threaded between the
 * components that separate them.
 */
export function useStarred(kind = 'projects'): [Set<string>, (id: string) => void] {
  const [starred, setStarred] = useState<Set<string>>(new Set())

  useEffect(() => {
    setStarred(read(kind))
    const sync = () => setStarred(read(kind))
    window.addEventListener(keyOf(kind), sync)
    // `storage` is the OTHER tab. A reader with the app open twice should not
    // see two different shortlists.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(keyOf(kind), sync)
      window.removeEventListener('storage', sync)
    }
  }, [kind])

  const toggle = useCallback(
    (id: string) => {
      const next = read(kind)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(keyOf(kind), JSON.stringify([...next]))
      } catch {
        /* a browser that refuses storage still gets the star for this session */
      }
      window.dispatchEvent(new Event(keyOf(kind)))
    },
    [kind],
  )

  return [starred, toggle]
}
