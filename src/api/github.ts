/**
 * GitHub, as the platform's GitHub App sees it for the signed-in person.
 *
 *   GET    /v1/provider/github/repos?q=&owner=&limit=&after=
 *   GET    /v1/provider/github/repos/{owner}/{repo}/branches?q=&limit=&after=
 *   GET    /v1/provider/github/user            the person's own connection
 *   POST   /v1/provider/github/user/connect    → {url} to authorize at GitHub
 *   DELETE /v1/provider/github/user            disconnect
 *
 * Paged by an opaque `after` cursor; `next` is the cursor for the page after
 * this one, or empty when there is none. Rows are read defensively: a field the
 * platform left out is an empty value here, never `undefined` in a label.
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
  /** Every repository the grant reaches, when the platform counted them. */
  total: number
  /** How many of those this page could not list (unreadable installations). */
  unread: number
  /** Whether the person has a GitHub connection at all. */
  connected: boolean
}

export interface Branch {
  name: string
  protected: boolean
  /** The tip, or ''. */
  sha: string
}

export interface Branches {
  branches: Branch[]
  next: string
}

export interface Connection {
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
  return { name: str(b.name), protected: b.protected === true, sha: str(b.sha) }
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
    unread: num(raw.unread),
    connected: raw.connected !== false,
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
  }
}

export async function connection(t: Target): Promise<Connection> {
  const raw = obj(await call<unknown>(t, 'GET', '/v1/provider/github/user'))
  return { connected: raw.connected === true, login: str(raw.login) }
}

/** Where to send the person to authorize the platform at GitHub. */
export async function connect(t: Target, back: string): Promise<string> {
  const raw = obj(await call<unknown>(t, 'POST', '/v1/provider/github/user/connect', { redirect: back }))
  const url = str(raw.url)
  if (!/^https:\/\/github\.com\//.test(url)) throw new Error('The platform did not name a GitHub address to connect at')
  return url
}

export async function disconnect(t: Target): Promise<void> {
  await call<unknown>(t, 'DELETE', '/v1/provider/github/user')
}
