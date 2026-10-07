/**
 * Projects and issues, as the forge holds them.
 *
 * A project is a board. A board is a repository that has work on it, so the
 * list is the forge's answer and not a second copy of it.
 *
 *   GET /v1/task/projects                     the boards
 *   GET /v1/task/board                        every board's issues
 *   GET /v1/task/projects/{key}/issues        one board's issues
 *
 * Creating, renaming and deleting a board are forge operations. This surface
 * reads the work and opens a run against it.
 */
import { call, seg, type Target } from './call.ts'

export interface Board {
  id: string
  key: string
  name: string
  description: string
}

export interface Work {
  id: string
  /** `<key>#<number>`, the handle a person reads. */
  identifier: string
  project: string
  number: number
  kind: string
  title: string
  status: string
  priority: string
  assignee: string
  /** The repository the item is bound to, or ''. */
  repo: string
  /** Where it was opened: `git` (the forge, or mirrored from GitHub), `team`, `agent`, … */
  source: string
  labels: string[]
  /** Its page upstream (a GitHub issue for a mirrored one), https only, or ''. */
  url: string
  /** Unix milliseconds, or 0 when the platform did not say. */
  created: number
  updated: number
}

/** The project an item is filed under: its repository, else its board. */
export const projectOf = (w: Work): string => w.repo || w.project

/** Done and canceled are closed; every other column is open work. */
export const closed = (w: Work): boolean => w.status === 'done' || w.status === 'canceled'

/** Whether `w` belongs to the project `key` — by repository or by board, either case. */
export function inProject(w: Work, key: string): boolean {
  const k = key.toLowerCase()
  return w.repo.toLowerCase() === k || w.project.toLowerCase() === k
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
/** The platform states seconds; a value already in milliseconds is kept. */
const when = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? (v < 1e12 ? v * 1000 : v) : 0)
const https = (v: unknown): string => (typeof v === 'string' && /^https:\/\//.test(v) ? v : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

function rows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  const o = obj(raw)
  if (Array.isArray(o.data)) return o.data
  if (Array.isArray(o.issues)) return o.issues
  return []
}

export function board(raw: unknown): Board | null {
  const o = obj(raw)
  const key = str(o.key)
  if (!key) return null
  return { id: str(o.id) || key, key, name: str(o.name) || key, description: str(o.description) }
}

export function work(raw: unknown): Work | null {
  const o = obj(raw)
  const title = str(o.title)
  const project = str(o.projectKey)
  const number = typeof o.number === 'number' ? o.number : 0
  if (!title && !project) return null
  return {
    id: str(o.id) || `${project}#${number}`,
    identifier: str(o.identifier) || (project && number ? `${project}#${number}` : ''),
    project,
    number,
    kind: str(o.kind) || 'issue',
    title: title || 'Untitled',
    status: str(o.status) || 'backlog',
    priority: str(o.priority) || 'none',
    assignee: str(o.assignee),
    repo: str(o.repo),
    source: str(o.source),
    labels: Array.isArray(o.labels) ? o.labels.filter((l): l is string => typeof l === 'string' && l !== '') : [],
    url: https(o.url) || https(o.extRef),
    created: when(o.createdAt),
    updated: when(o.updatedAt),
  }
}

export async function boards(t: Target): Promise<Board[]> {
  const raw = await call<unknown>(t, 'GET', '/v1/task/projects')
  return rows(raw)
    .map(board)
    .filter((b): b is Board => b !== null)
}

/** A board's issues, or every board's when `key` is empty. */
export async function issues(t: Target, key = ''): Promise<Work[]> {
  const path = key ? `/v1/task/projects/${seg(key)}/issues` : '/v1/task/board'
  const raw = await call<unknown>(t, 'GET', path)
  return rows(raw)
    .map(work)
    .filter((w): w is Work => w !== null)
}
