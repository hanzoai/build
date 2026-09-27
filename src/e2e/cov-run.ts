/**
 * One run on a stubbed platform the cov-run specs change as they go: its record
 * and events, what its side pane reads (the environment, the pushed changes,
 * the branch and the sandbox), and what each write answers. The page re-reads
 * the run each time its stream reconnects, about every second, so a change to
 * `world` shows up the way the platform's own would.
 *
 * `over` answers first, for the one call a test makes fail or say something
 * else; `hold` keeps an answer back until the test lets it go.
 */
import type { Page } from '@playwright/test'

import { ORG, SESSION, signIn, type Answer, type Sent } from './signed.ts'

export { ORG, SESSION }
export const NEXT = `sess_${'c'.repeat(32)}`
export const BOX = `m_${'d'.repeat(24)}`
export const PR = 'https://git.hanzo.ai/hanzoai/universe/pulls/7'

export interface World {
  record: Record<string, unknown>
  events: Record<string, unknown>[]
  /** Frames the stream's next connection carries, then none. */
  frames: string
  env: Record<string, unknown>
  changes: Record<string, unknown>
  /** A directory on the run's branch, by path. */
  tree: Record<string, unknown[]>
  /** A file on the run's branch, by path. */
  blob: Record<string, Record<string, unknown>>
  /** A path in the sandbox, by path. */
  box: Record<string, Record<string, unknown>>
  /** What the list of runs answers. */
  list: Record<string, unknown>
  /** What each door's page does once framed: the script it runs. */
  page: { screen: string; terminal: string }
}

let seq = 0
/** One event of the run. */
export const ev = (kind: string, payload: unknown, at = ++seq) => ({ id: `e${at}`, sessionId: SESSION, seq: at, kind, actor: `${ORG}/dave`, payload, createdAt: '' })

/** A door page that tells the window framing it what `says` says. */
export const tells = (source: string, says: object) => `parent.postMessage(${JSON.stringify({ source, ...says })}, '*')`

/** A finished build run on universe that pushed a branch and holds no sandbox. */
export function finished(): Record<string, unknown> {
  return {
    id: SESSION,
    org: ORG,
    title: 'universe: Add the widget',
    status: 'done',
    kind: 'coding',
    repo: 'hanzoai/universe',
    base: 'main',
    branch: 'agent/ab12',
    environment: 'sandbox',
    mode: 'build',
    project: '',
    published: false,
    sandbox: '',
    pr: '',
    events: 0,
  }
}

/** The platform for one run, signed in as an org admin; `kept` seeds the browser's storage. */
export async function rig(p: Page, shape: Partial<World> = {}, over: Answer = () => undefined, kept: Record<string, unknown> = {}) {
  const world: World = {
    record: finished(),
    events: [],
    frames: '',
    env: { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' },
    changes: { repo: 'hanzoai/universe', base: 'main', head: '', commits: [], files: [], pull: null },
    tree: { '': [] },
    blob: {},
    box: { '': { path: '/work', dir: true, entries: [] } },
    list: { sessions: [], next: '' },
    page: { screen: tells('hanzo-screen', { ready: true }), terminal: tells('hanzo-term', { ready: true }) },
    ...shape,
  }
  const sent: Sent[] = await signIn(
    p,
    (s) => {
      const said = over(s)
      if (said) return said
      const { method, path, query, body } = s
      const q = new URLSearchParams(query)
      if (path === `/v1/agent/sessions/${SESSION}` && method === 'GET') return { json: { ...world.record, recentEvents: world.events } }
      if (path === `/v1/agent/sessions/${SESSION}` && method === 'PATCH') {
        Object.assign(world.record, body)
        return { json: world.record }
      }
      if (path === '/v1/agent/sessions/stream') {
        const text = world.frames
        world.frames = ''
        return { text, type: 'text/event-stream' }
      }
      if (/^\/v1\/agent\/sessions\/[^/]+\/(message|pause|resume|stop)$/.test(path)) return { json: { command: path.split('/').pop() } }
      if (path === '/v1/agent/sessions') return { json: world.list }
      if (path === '/v1/agent/coding' && method === 'POST') return { status: 202, json: { sessionId: NEXT, repo: 'universe', branch: 'agent/cd34' } }
      if (path === `/v1/agent/sessions/${NEXT}`) return { json: { id: NEXT, title: 'universe: the next run', status: 'running', kind: 'coding', recentEvents: [] } }
      if (path === '/v1/event') return { json: { accepted: 1, dropped: 0 } }
      if (path === '/v1/models') return { json: { data: [{ id: 'zen5-coder' }, { id: 'zen5-flash' }] } }
      if (path.startsWith('/v1/environment/')) {
        const secret = /\/secrets\/([^/]+)$/.exec(path)?.[1]
        const env = world.env as { secrets: string[]; state: string; proposal?: unknown }
        if (secret && method === 'PUT') env.secrets = [...env.secrets.filter((n) => n !== secret), secret]
        else if (secret && method === 'DELETE') env.secrets = env.secrets.filter((n) => n !== secret)
        else if (method === 'PUT') Object.assign(env, body, { state: 'ready', proposal: null })
        return { json: env }
      }
      if (path === `/v1/agent/coding/${SESSION}/changes`) return { json: world.changes }
      if (path === `/v1/agent/coding/${SESSION}/tree`) return { json: { entries: world.tree[q.get('path') ?? ''] ?? [] } }
      if (path === `/v1/agent/coding/${SESSION}/blob`) {
        const file = world.blob[q.get('path') ?? '']
        return file ? { json: file } : { status: 404, json: { detail: 'No such file on the branch' } }
      }
      if (path === '/v1/sandbox/read') {
        const at = world.box[(body as { path: string }).path]
        return at ? { json: at } : { status: 404, json: { detail: 'No such path in the sandbox' } }
      }
      const ticket = /^\/v1\/sandbox\/([^/]+)\/(screen|terminal)\/ticket$/.exec(path)
      if (ticket) return { status: 201, json: { ticket: 't', expiresIn: 30, url: `/v1/sandbox/${ticket[1]}/${ticket[2]}?ticket=t${sent.filter((x) => x.path === path).length}` } }
      const door = /^\/v1\/sandbox\/[^/]+\/(screen|terminal)$/.exec(path)
      if (door) {
        const which = door[1] as 'screen' | 'terminal'
        return { text: `<!doctype html><body style="margin:0;background:#000;color:#fff"><p>the ${which} ${query}</p><script>${world.page[which]}</script></body>`, type: 'text/html' }
      }
      return undefined
    },
    kept,
  )
  return { sent, world }
}

/** Keeps a matching call's answer back until `go` is called. */
export async function hold(p: Page, match: (url: URL, method: string) => boolean) {
  let go = () => {}
  const gate = new Promise<void>((r) => (go = r))
  await p.route(
    (u) => match(u, ''),
    async (r) => {
      if (!match(new URL(r.request().url()), r.request().method())) return r.fallback()
      await gate
      await r.fallback()
    },
  )
  return () => go()
}

/** The calls sent with `method` to `path`. */
export const to = (sent: Sent[], method: string, path: string) => sent.filter((s) => s.method === method && s.path === path)

/** A clipboard that keeps what it is given, or refuses, and a Notification the test can grant, deny or take back. */
export async function browser(p: Page, o: { clipboard?: 'keeps' | 'refuses'; notify?: 'default' | 'granted' | 'denied' | 'none'; grants?: boolean } = {}) {
  await p.addInitScript((o) => {
    const w = window as unknown as Record<string, unknown>
    w.copied = [] as string[]
    if (o.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (s: string) => {
            if (o.clipboard === 'refuses') throw new DOMException('Write permission denied.', 'NotAllowedError')
            ;(w.copied as string[]).push(s)
          },
        },
      })
    }
    if (o.notify === 'none') {
      delete w.Notification
    } else if (o.notify) {
      const shown: { title: string; body: string }[] = []
      w.shown = shown
      w.asked = 0
      class Note {
        static permission = o.notify
        static async requestPermission() {
          w.asked = (w.asked as number) + 1
          Note.permission = o.grants ? 'granted' : 'denied'
          return Note.permission
        }
        constructor(title: string, init?: { body?: string }) {
          shown.push({ title, body: init?.body ?? '' })
        }
        close() {}
      }
      w.Notification = Note
    }
  }, o)
}
