/**
 * Adding a repository to a project, which is how a project is published.
 *
 *   POST /v1/platform/apps {repo, ref, name, partOf, mode, tag?}
 *     → 202 {app, build?: {id, job, image, status}, declaration: {mode, ref, review, live, …}}
 *   GET  /v1/platform/builds → {builds: [{id, repo, commit, status, startedAt, duration}]}
 *
 * The declaration is a values file in universe. `branch` (the default) opens a
 * review and deploys nothing; `commit` writes main and CD applies it — and it
 * refuses to name an image that is not built yet, so publishing to main is two
 * calls: build on a branch, then commit that tag once the build is green. An
 * org admin gets both; anyone else gets the review link.
 */
import { call, type Target } from './call.ts'

export interface Declare {
  /** The https clone URL. */
  repo: string
  /** Branch, tag or sha to build. */
  ref: string
  /** The app's name: a DNS-1123 label. */
  name: string
  /** The project it joins. */
  project: string
  mode: 'branch' | 'commit'
  /** Release an image an earlier call built, instead of building. */
  tag?: string
}

export interface Declared {
  build: { id: string; job: string; image: string; status: string } | null
  mode: string
  /** Where the declaration landed: main for a commit, the review branch otherwise. */
  ref: string
  /** The pull request to open for a branch write, or ''. */
  review: string
  /** Whether anything can deploy from this write. */
  live: boolean
}

export interface Build {
  id: string
  repo: string
  commit: string
  status: string
  startedAt: string
  duration: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

/** A DNS-1123 label from anything: what an app may be named. */
export function label(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '')
  return out || 'app'
}

/** An https address, or '' — a review link is shown as a link only when it is one. */
export const https = (url: string): string => (/^https:\/\/[^\s]+$/.test(url) ? url : '')

export function body(d: Declare): Record<string, string> {
  const out: Record<string, string> = {
    repo: d.repo,
    ref: d.ref || 'main',
    name: label(d.name),
    partOf: label(d.project),
    mode: d.mode,
  }
  if (d.tag) out.tag = d.tag
  return out
}

export async function declare(t: Target, d: Declare): Promise<Declared> {
  const raw = obj(await call<unknown>(t, 'POST', '/v1/platform/apps', body(d)))
  const b = raw.build ? obj(raw.build) : null
  const dec = obj(raw.declaration)
  return {
    build: b ? { id: str(b.id), job: str(b.job), image: str(b.image), status: str(b.status) } : null,
    mode: str(dec.mode),
    ref: str(dec.ref),
    review: https(str(dec.review)),
    live: dec.live === true,
  }
}

export async function builds(t: Target): Promise<Build[]> {
  const raw = obj(await call<unknown>(t, 'GET', '/v1/platform/builds'))
  return (Array.isArray(raw.builds) ? raw.builds : []).map((r) => {
    const o = obj(r)
    return {
      id: str(o.id),
      repo: str(o.repo),
      commit: str(o.commit),
      status: str(o.status),
      startedAt: str(o.startedAt),
      duration: str(o.duration),
    }
  })
}

/** The clone URL for a GitHub repository. */
export const clone = (fullName: string): string => `https://github.com/${fullName}.git`
