/**
 * GitHub, as the platform's GitHub App sees it for the signed-in person.
 *
 *   GET  /v1/provider/github/repos?q=&owner=&limit=&after=           most recently pushed first
 *   GET  /v1/provider/github/repos/{owner}/{repo}/branches?q=&limit=&after=   default first
 *   GET  /v1/provider/github/user              the person's own connection
 *   POST /v1/provider/github/user/connect      → {authorizeUrl}
 *   POST /v1/provider/github/user/disconnect
 *
 * Paged by an opaque `after` cursor; `next` is the cursor for the page after
 * this one, or empty on the last. Rows are read defensively: a field the
 * platform left out is an empty value here, never `undefined` in a label.
 *
 * `connected` false with repositories is an org admin seeing the org's
 * installations; false with none is the cue to connect. GitHub returns a
 * connecting person to the console's /connectors?complete=github&grant=<id>,
 * which completes it.
 */
import { call, query, seg, type Target } from './call.ts'

export interface Repo {
  owner: string
  name: string
  /** `owner/name`. */
  full_name: string
  private: boolean
  default_branch: string
  /** RFC 3339, or '' when GitHub did not say. */
  pushed_at: string
  /** The App installation that grants access, or 0 for the person's own grant. */
  installation_id: number
}

export interface Repos {
  repos: Repo[]
  next: string
  /** How many repositories match, across every page. */
  total: number
  /** The installations that could not be read: a short list is then not the whole one. */
  unread: string[]
  /** Whether this answer is the person's OWN GitHub. */
  connected: boolean
}

export interface Branch {
  name: string
  /** The sha it points at, or ''. */
  commit: string
  default: boolean
}

export interface Branches {
  branches: Branch[]
  next: string
  total: number
}

export interface Connection {
  /** Whether this deployment can connect anyone at all. */
  configured: boolean
  connected: boolean
  /** The GitHub login, when connected. */
  login: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

export function repo(raw: unknown): Repo {
  const r = obj(raw)
  const owner = str(r.owner)
  const name = str(r.name)
  return {
    owner,
    name,
    full_name: str(r.full_name) || (owner && name ? `${owner}/${name}` : name),
    private: r.private === true,
    default_branch: str(r.default_branch),
    pushed_at: str(r.pushed_at),
    installation_id: num(r.installation_id),
  }
}

export function branch(raw: unknown): Branch {
  const b = obj(raw)
  return { name: str(b.name), commit: str(b.commit), default: b.default === true }
}

export interface RepoQuery {
  q?: string
  owner?: string
  limit?: number
  after?: string
}

export async function repos(t: Target, p: RepoQuery = {}, signal?: AbortSignal): Promise<Repos> {
  const raw = obj(
    await call<unknown>(
      t,
      'GET',
      `/v1/provider/github/repos${query({ q: p.q?.trim(), owner: p.owner, limit: p.limit ?? 50, after: p.after })}`,
      undefined,
      { signal },
    ),
  )
  return {
    repos: (Array.isArray(raw.repos) ? raw.repos : []).map(repo).filter((r) => r.name),
    next: str(raw.next),
    total: num(raw.total),
    unread: (Array.isArray(raw.unread) ? raw.unread : []).filter((x): x is string => typeof x === 'string'),
    connected: raw.connected === true,
  }
}

export interface BranchQuery {
  q?: string
  limit?: number
  after?: string
}

export async function branches(
  t: Target,
  owner: string,
  name: string,
  p: BranchQuery = {},
  signal?: AbortSignal,
): Promise<Branches> {
  const raw = obj(
    await call<unknown>(
      t,
      'GET',
      `/v1/provider/github/repos/${seg(owner)}/${seg(name)}/branches${query({ q: p.q?.trim(), limit: p.limit ?? 50, after: p.after })}`,
      undefined,
      { signal },
    ),
  )
  return {
    branches: (Array.isArray(raw.branches) ? raw.branches : []).map(branch).filter((b) => b.name),
    next: str(raw.next),
    total: num(raw.total),
  }
}

export async function connection(t: Target): Promise<Connection> {
  const raw = obj(await call<unknown>(t, 'GET', '/v1/provider/github/user'))
  return { configured: raw.configured === true, connected: raw.connected === true, login: str(raw.login) }
}

/** Where to send the person to authorize the platform's GitHub App — github.com only. */
export async function connect(t: Target): Promise<string> {
  const raw = obj(await call<unknown>(t, 'POST', '/v1/provider/github/user/connect'))
  const url = str(raw.authorizeUrl)
  if (!/^https:\/\/github\.com\//.test(url)) throw new Error('The platform did not name a GitHub address to connect at')
  return url
}

export async function disconnect(t: Target): Promise<void> {
  await call<unknown>(t, 'POST', '/v1/provider/github/user/disconnect')
}
