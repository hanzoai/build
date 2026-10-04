/**
 * The choice New starts from, kept in this browser so a codebase or an issue
 * opened from its own screen is what the composer is holding when it mounts.
 *
 * The key is the one `useKept` in New writes. A merge keeps the mode, the
 * model and the machine; it only replaces the fields the caller names.
 */
import { asRepo, type Codebase, type ForgeRepo } from './api/codebases.ts'

export interface Choice {
  repo: ForgeRepo | null
  branch: string
  place: string
  mode: string
  model: string
  effort: string
  /** A draft handed over by another screen. New copies it once and clears it. */
  ask: string
}

const KEY = (org: string | null) => `hanzo.build.new.${org ?? 'none'}`

export const boardKey = (org: string | null) => `hanzo.build.board.${org ?? 'none'}`

function read(org: string | null): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(KEY(org))
    const v = raw ? JSON.parse(raw) : null
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function write(org: string | null, value: Record<string, unknown>) {
  try {
    window.localStorage.setItem(KEY(org), JSON.stringify(value))
  } catch {
    /* the next New starts empty */
  }
}

/** Point New at a forge codebase, and optionally a first draft. */
export function pinCodebase(org: string | null, c: Codebase, ask = '') {
  const repo = asRepo(c)
  write(org, { ...read(org), repo, branch: repo.default_branch, ask })
}

/** Which board Issues is showing. '' is every board. */
export function pinBoard(org: string | null, key: string) {
  try {
    window.localStorage.setItem(boardKey(org), JSON.stringify(key))
  } catch {
    /* Issues then shows every board */
  }
  window.dispatchEvent(new CustomEvent('hanzo-board', { detail: key }))
}

/**
 * A repository on GitHub, chosen from the org's installation: the run works there.
 * Its `full_name` is GitHub's address, `github.com/owner/name` — what the list
 * shows, so a forge codebase of the same name is never mistaken for it, and what
 * a coding run takes to clone, push and propose on GitHub.
 */
export interface HubRepo {
  owner: string
  name: string
  full_name: string
  private: boolean
  default_branch: string
  pushed_at: string
  installation_id: number
  github: true
}

export const isHub = (repo: { github?: boolean; full_name?: string } | null): repo is HubRepo =>
  Boolean(repo && repo.github === true && repo.full_name?.startsWith('github.com/'))

/** A GitHub listing row as the composer offers it. */
export const asHub = (r: Omit<HubRepo, 'github'>): HubRepo => ({ ...r, full_name: `github.com/${r.owner}/${r.name}`, github: true })

export const isForge = (repo: { forge?: boolean; name?: string } | null): repo is ForgeRepo =>
  Boolean(repo && repo.forge === true && repo.name)

/** A repository queued onto the forge and not reported landed yet. */
export interface Pending {
  fullName: string
  name: string
}

const syncingKey = (org: string | null) => `hanzo.build.sync.${org ?? 'none'}`

export function readPending(org: string | null): Pending[] {
  try {
    const raw = window.sessionStorage.getItem(syncingKey(org))
    const v = raw ? JSON.parse(raw) : []
    if (!Array.isArray(v)) return []
    return v.filter(
      (p): p is Pending =>
        Boolean(p) && typeof p === 'object' && typeof p.fullName === 'string' && p.fullName !== '' && typeof p.name === 'string' && p.name !== '',
    )
  } catch {
    return []
  }
}

export function writePending(org: string | null, rows: Pending[]) {
  try {
    if (rows.length === 0) window.sessionStorage.removeItem(syncingKey(org))
    else window.sessionStorage.setItem(syncingKey(org), JSON.stringify(rows))
  } catch {
    /* the table then omits the in-flight rows */
  }
}
