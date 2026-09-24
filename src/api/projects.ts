/**
 * The org's projects: what it has built, and where each one is served.
 *
 *   GET /v1/projects → Project[]
 *
 * `slug` is the one key every surface shares — the address under /dev, the
 * site's name, the `project` a run is tagged with.
 */
import { call, type Target } from './call.ts'

export interface Project {
  slug: string
  name: string
  /** The clone URL, or '' for a project with no repository. */
  repo: string
  /** The branch pushes to which rebuild it, or ''. */
  branch: string
  status: string
  /** The deployed address, or '' when nothing has shipped. */
  live: string
  updated: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const loopback = (host: string): boolean => host === 'localhost' || host === '127.0.0.1'

/** Whether this page itself is served from loopback — local work. */
const here = (): boolean => typeof window !== 'undefined' && loopback(window.location.hostname)

/** An address the preview may frame: https, or http on loopback when the builder is local too. */
export function safe(url: string, local = here()): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return u.toString()
    // Loopback only for a builder that is itself on loopback: a published row
    // must not point colleagues' browsers at their own local services.
    if (local && u.protocol === 'http:' && loopback(u.hostname)) return u.toString()
  } catch {
    /* not an address */
  }
  return ''
}

export function project(raw: unknown): Project {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const repo = (p.repo && typeof p.repo === 'object' ? p.repo : {}) as Record<string, unknown>
  return {
    slug: str(p.slug),
    name: str(p.name) || str(p.slug),
    repo: str(repo.url),
    branch: str(repo.branch),
    status: str(p.status),
    live: safe(str(p.liveUrl)),
    updated: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
  }
}

export async function projects(t: Target): Promise<Project[]> {
  const raw = await call<unknown>(t, 'GET', '/v1/projects')
  const rows = Array.isArray(raw) ? raw : Array.isArray((raw as { data?: unknown })?.data) ? (raw as { data: unknown[] }).data : []
  return rows
    .map(project)
    .filter((p) => p.slug)
    .sort((a, b) => b.updated - a.updated)
}

/** The repository name a project's clone URL names — the last path segment, without `.git`. */
export function name(clone: string): string {
  const cut = clone.replace(/\.git$/, '').replace(/\/+$/, '')
  return cut.slice(cut.lastIndexOf('/') + 1)
}

/** A starter from the public catalog. */
export interface Template {
  slug: string
  title: string
  category: string
  description: string
  framework: string
  /** The repository the starter is cut from. */
  source: string
}

/** The public catalog. It is reference content: no bearer, no org. */
export async function templates(t: Target): Promise<Template[]> {
  const raw = await call<{ data?: unknown }>({ api: t.api, token: () => null, org: null }, 'GET', '/v1/templates')
  const rows = Array.isArray(raw?.data) ? raw.data : []
  return rows
    .map((r) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      return {
        slug: str(o.slug),
        title: str(o.title) || str(o.slug),
        category: str(o.category),
        description: str(o.description),
        framework: str(o.framework),
        source: str(o.source),
      }
    })
    .filter((x) => x.slug)
}

/**
 * Take a copy of a starter: a project whose repository is the starter's own,
 * so what opens is that template rather than a model's imitation of it.
 */
export async function fork(t: Target, slug: string): Promise<Project> {
  return project(await call<unknown>(t, 'POST', '/v1/projects/fork', { slug }))
}
