/**
 * Working in a folder on this computer, with no repository (hanzo-inc/app issues 309 and 310).
 *
 * A HOST THAT HAS THE COMPUTER says so. Hanzo Desktop can open a folder dialog and run the coding agent in a folder
 * (`dev exec -C <folder>`), so it hands the builder a `Local` (host.tsx); a browser page has no folder of its own and
 * hands none, and New then offers the cloud workspace and the org's machines as before. Nothing here sniffs a user
 * agent: the host says what it has.
 *
 * AUTO IS THE FOLDER USED LAST. A person who chose no folder works in the one they worked in most recently, on this
 * computer; one who never opened any is asked for one, once, on their first send, and that folder is then the one
 * Auto picks. Choosing a folder in the pill keeps it for the next New; choosing Auto again goes back to the most
 * recent. That is the whole rule, so a person can always say where a run will go before they send it.
 *
 * A run on this computer reads, edits and runs in its folder and nowhere else (the agent's workspace-write sandbox),
 * and it needs no repository: a folder that is a git checkout keeps its history, and one that is not stays one.
 */
import { phrase } from '@hanzo/i18n'

import type { Say } from '@hanzo/i18n/react'

import { english } from './say.ts'

/** A folder on this computer, as the host keeps it. */
export interface Folder {
  /** The absolute path the agent runs in. */
  path: string
  /** Its last segment, or the name the person gave it. */
  name: string
  /** When a run last used it (ms since the epoch); 0 when never. */
  used?: number
}

/** What a run on this computer answers with once it has finished. */
export interface Done {
  ok: boolean
  /** What the agent printed: its answer and what it changed. */
  output: string
}

/** What a host with the computer can do with its folders. */
export interface Local {
  /** The folders this computer has opened in Hanzo, in any order (`recent` sorts them). */
  folders: () => readonly Folder[]
  /** The computer's own folder dialog; null when the person closes it. The folder chosen is kept. */
  pick: () => Promise<Folder | null>
  /** Mark a folder as the one used now, so Auto picks it next. */
  use: (path: string) => void
  /** Run the coding agent in `folder` with `prompt`, and answer once it has finished. */
  run: (folder: string, prompt: string) => Promise<Done>
}

/** The place id New keeps for this computer. A machine's is `tgt_…` and the cloud workspace's is ''. */
export const HERE = 'here'

/** The folders, most recently used first; a folder never used goes last, in the order the host gave. */
export function recent(folders: readonly Folder[]): Folder[] {
  return folders
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (b.f.used ?? 0) - (a.f.used ?? 0) || a.i - b.i)
    .map(({ f }) => f)
}

/** The folder Auto picks: the one used most recently, or null when this computer has opened none. */
export function auto(folders: readonly Folder[]): Folder | null {
  return recent(folders)[0] ?? null
}

/**
 * The folder a run goes to: the one chosen (`kept`, a path), while this computer still lists it, else Auto's.
 * A chosen folder the host no longer lists was removed, and is not where the next run goes.
 */
export function where(folders: readonly Folder[], kept: string): { folder: Folder | null; auto: boolean } {
  const chosen = kept ? folders.find((f) => f.path === kept) : undefined
  if (chosen) return { folder: chosen, auto: false }
  return { folder: auto(folders), auto: true }
}

/** A folder's last segment, for a path the host gave no name. */
export function named(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || path
}

/**
 * Why a run on this computer stopped before it began, in the reader's words: the agent is not installed, or the
 * host refused. What the agent itself printed is its answer, and is shown as it is.
 */
export function failed(e: unknown, say: Say = english): string {
  const why = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (/failed to invoke dev|no such file|not found|os error 2|cannot find/i.test(why)) {
    return say('The Hanzo Dev agent is not installed on this computer. Install it with `npm install -g @hanzo/dev`, then send again.')
  }
  return why ? say('The run on this computer could not start: {why}', { why }) : say('The run on this computer could not start. Try again.')
}

/** Words New marks for the reader's language (`phrase`), drawn through `t`. */
export const WORDS = {
  here: phrase('This computer'),
  auto: phrase('Auto'),
  choose: phrase('Choose folder…'),
  pick: phrase('Choose a folder for this run'),
} as const
