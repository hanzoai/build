/**
 * A repository's files at one revision, from the platform's native git.
 *
 *   GET /v1/git/repos/{name}/tree?ref=&path=   one directory, dirs first
 *   GET /v1/git/repos/{name}/blob?ref=&path=   one file; binary is base64,
 *                                              past 1 MiB it is truncated with no content
 *
 * A run pushes its branch to native git, so these read what a run wrote at the
 * branch it wrote it on.
 */
import { call, query, seg, type Target } from './call.ts'

export interface Entry {
  name: string
  path: string
  dir: boolean
  size: number
}

export interface Blob {
  path: string
  /** Text, or '' when the file is binary or past the view cap. */
  text: string
  binary: boolean
  truncated: boolean
  size: number
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function tree(t: Target, repo: string, ref: string, path = ''): Promise<Entry[]> {
  const raw = await call<{ entries?: unknown }>(t, 'GET', `/v1/git/repos/${seg(repo)}/tree${query({ ref, path })}`)
  const rows = Array.isArray(raw?.entries) ? raw.entries : []
  return rows
    .map((r) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
      return {
        name: str(o.name),
        path: str(o.path),
        dir: o.type === 'tree',
        size: typeof o.size === 'number' ? o.size : 0,
      }
    })
    .filter((e) => e.path)
}

export async function blob(t: Target, repo: string, ref: string, path: string): Promise<Blob> {
  const o = (await call<Record<string, unknown>>(t, 'GET', `/v1/git/repos/${seg(repo)}/blob${query({ ref, path })}`)) ?? {}
  const binary = o.binary === true
  const truncated = o.truncated === true
  return {
    path: str(o.path) || path,
    text: binary || truncated ? '' : str(o.content),
    binary,
    truncated,
    size: typeof o.size === 'number' ? o.size : 0,
  }
}
