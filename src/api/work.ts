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
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
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
