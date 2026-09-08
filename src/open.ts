// What the builder is showing: the open run, and the open project.
//
// OUTSIDE REACT, because the pane, the column beside it and the frame around
// them all read it, and the router mounts and unmounts the components between.
// A module is above every component, so a route change cannot destroy it. It
// resets on a real page load, which is correct — a fresh document is a fresh
// workspace.
//
// THE ADDRESS IS PART OF THE STORE, not a second copy of it kept in step by
// whoever remembers. A selection you can link to is one a reload lands on and
// one a reader can send to somebody; a selection only a component knows is
// neither. So the address is seeded here at load and rewritten here on every
// change, and no surface owns a synchronising effect.

import { useSyncExternalStore } from 'react'

export interface Open {
  /** The open run, by the session the platform narrates it in, or null. */
  session: string | null
  openSession: (id: string | null) => void
  /** The open project, by id, or null for the list of them. */
  project: string | null
  openProject: (id: string | null) => void
}

interface Selection {
  session: string | null
  project: string | null
}

/** The initial selection, and a stable reference: React compares snapshots by
 *  identity, so a fresh object per read is an infinite render. */
const EMPTY: Selection = { session: null, project: null }

const param = (name: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

let selection: Selection = { session: param('session'), project: param('project') }

const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Put the selection in the address, without a history entry: opening a project
 *  is not a page a Back button should have to walk out of one field at a time. */
function address(next: Selection): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    for (const [name, value] of Object.entries(next)) {
      if (value) url.searchParams.set(name, value)
      else url.searchParams.delete(name)
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* an address this browser will not rewrite still leaves the store correct */
  }
}

function set(next: Selection): void {
  if (next.session === selection.session && next.project === selection.project) return
  selection = next
  address(next)
  for (const listener of listeners) listener()
}

/** Opens a run, or empties the pane with null. */
export function openSession(id: string | null): void {
  set({ ...selection, session: id })
}

/** Opens a project, or returns to the list of them with null. */
export function openProject(id: string | null): void {
  set({ ...selection, project: id })
}

export function useOpen(): Open {
  const current = useSyncExternalStore(
    subscribe,
    () => selection,
    () => EMPTY,
  )
  return {
    session: current.session,
    openSession,
    project: current.project,
    openProject,
  }
}
