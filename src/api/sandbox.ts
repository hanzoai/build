/**
 * A run's sandbox while the run holds it: a door into its screen or its shell,
 * and its working tree as it is right now.
 *
 *   POST /v1/sandbox/{id}/{screen|terminal}/ticket  one ticket, spent when the page's socket opens (30 s)
 *   POST /v1/sandbox/read {id, path}               a directory's names, or a file's bytes
 *
 * The door is cloud's own page — noVNC for the screen, xterm for the shell — so
 * the builder frames it and never speaks the socket itself. The sandbox is gone
 * when the run ends, and every call here then answers 404.
 */
import { call, Refusal, seg, type Target } from './call.ts'

export type Door = 'screen' | 'terminal'

/** A shell's tmux session name: the sandbox reattaches to it when the door opens again. */
export const NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/

/** Where to frame one door, with a fresh ticket in its address. */
export async function door(t: Target, sandbox: string, which: Door, session = ''): Promise<string> {
  const r = await call<{ url?: unknown }>(t, 'POST', `/v1/sandbox/${seg(sandbox)}/${which}/ticket`)
  const path = typeof r?.url === 'string' ? r.url : ''
  if (!path.startsWith('/v1/')) throw new Refusal(502, 'The sandbox answered with no address to open')
  const arg = which === 'terminal' && NAME.test(session) ? `&arg=${session}` : ''
  return `${t.api}${path}${arg}`
}

export interface Node {
  /** The resolved path inside the sandbox. */
  path: string
  dir: boolean
  /** A directory's entries, bare names, sorted. */
  names: string[]
  /** A file's text, or '' when it is binary or past the view cap. */
  text: string
  binary: boolean
  truncated: boolean
}

/** What a file shows at most. */
const CAP = 1 << 20

/** One path in the sandbox, relative to its working directory. */
export async function read(t: Target, sandbox: string, path: string): Promise<Node> {
  const o = (await call<Record<string, unknown>>(t, 'POST', '/v1/sandbox/read', { id: sandbox, path })) ?? {}
  const dir = o.dir === true
  const names = Array.isArray(o.entries) ? o.entries.filter((n): n is string => typeof n === 'string').sort() : []
  const bytes = !dir && typeof o.data === 'string' ? decode(o.data) : new Uint8Array()
  const binary = bytes.includes(0)
  const truncated = bytes.length > CAP
  return {
    path: typeof o.path === 'string' ? o.path : path,
    dir,
    names,
    text: binary || truncated ? '' : new TextDecoder().decode(bytes),
    binary,
    truncated,
  }
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
