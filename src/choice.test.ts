import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Codebase } from './api/codebases.ts'
import { asHub, boardKey, isForge, isHub, pinBoard, pinCodebase, readPending, writePending } from './choice.ts'

/** Web Storage as a browser has it. */
function area(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  }
}

const refuse = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError')
}

/** A browser with these two storage areas, which hears the events the page raises. */
function browser(local = area(), session = area()) {
  const heard: string[] = []
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session, dispatchEvent: (e: Event) => heard.push(e.type) })
  return { local, session, heard }
}

/** A browser whose storage throws on every access. */
function refusing() {
  const heard: string[] = []
  const blocked = { getItem: refuse, setItem: refuse, removeItem: refuse }
  vi.stubGlobal('window', { localStorage: blocked, sessionStorage: blocked, dispatchEvent: (e: Event) => heard.push(e.type) })
  return heard
}

const WIDGET: Codebase = { org: 'acme', name: 'widget', description: '', branch: 'trunk', public: false, clone: 'https://git/acme/widget.git', updated: '', branches: [] }

afterEach(() => vi.unstubAllGlobals())

describe('pointing New at a codebase', () => {
  it('replaces the codebase, branch and draft, and keeps the mode, model and machine', () => {
    const { local } = browser(area({ 'hanzo.build.new.acme': JSON.stringify({ mode: 'plan', model: 'zen5.8', place: 'tgt_1', ask: 'old' }) }))
    pinCodebase('acme', WIDGET, 'Fix the build')
    expect(JSON.parse(local.getItem('hanzo.build.new.acme')!)).toEqual({
      mode: 'plan',
      model: 'zen5.8',
      place: 'tgt_1',
      repo: { owner: 'acme', name: 'widget', full_name: 'acme/widget', private: true, default_branch: 'trunk', pushed_at: '', installation_id: 0, forge: true, clone: 'https://git/acme/widget.git' },
      branch: 'trunk',
      ask: 'Fix the build',
    })
  })

  it('starts from nothing in a browser that kept nothing', () => {
    const { local } = browser()
    pinCodebase('acme', WIDGET)
    expect(JSON.parse(local.getItem('hanzo.build.new.acme')!)).toMatchObject({ branch: 'trunk', ask: '' })
  })

  it('starts from nothing when what is kept is not a choice', () => {
    for (const kept of ['not json', '"a string"', 'null']) {
      const { local } = browser(area({ 'hanzo.build.new.none': kept }))
      pinCodebase(null, WIDGET)
      expect(JSON.parse(local.getItem('hanzo.build.new.none')!)).toMatchObject({ branch: 'trunk', ask: '' })
    }
  })

  it('does nothing it cannot keep in a browser that refuses storage', () => {
    refusing()
    expect(() => pinCodebase('acme', WIDGET)).not.toThrow()
  })
})

describe('the board Issues shows', () => {
  it('is kept per org and announced', () => {
    const { local, heard } = browser()
    pinBoard('acme', 'web')
    expect(local.getItem(boardKey('acme'))).toBe('"web"')
    expect(boardKey(null)).toBe('hanzo.build.board.none')
    expect(heard).toEqual(['hanzo-board'])
  })

  it('is still announced when it cannot be kept', () => {
    const heard = refusing()
    pinBoard('acme', 'web')
    expect(heard).toEqual(['hanzo-board'])
  })
})

describe('a codebase on the forge', () => {
  it('is one chosen from the forge’s list, with a name', () => {
    expect(isForge({ forge: true, name: 'widget' })).toBe(true)
    expect(isForge({ forge: true, name: '' })).toBe(false)
    expect(isForge({ name: 'widget' })).toBe(false)
    expect(isForge(null)).toBe(false)
  })
})

describe('repositories on their way to the forge', () => {
  it('are kept for this tab and read back', () => {
    const { session } = browser()
    const rows = [{ fullName: 'acme/api', name: 'api' }]
    writePending('acme', rows)
    expect(readPending('acme')).toEqual(rows)
    writePending('acme', [])
    expect(session.has('hanzo.build.sync.acme')).toBe(false)
    expect(readPending('acme')).toEqual([])
  })

  it('drop what is not a repository, and read nothing from what is not a list', () => {
    browser(area(), area({ 'hanzo.build.sync.none': JSON.stringify([{ fullName: 'acme/api', name: 'api' }, null, 'x', { fullName: '', name: 'a' }, { fullName: 'a/b', name: '' }, { fullName: 'a/b' }]) }))
    expect(readPending(null)).toEqual([{ fullName: 'acme/api', name: 'api' }])
    browser(area(), area({ 'hanzo.build.sync.none': '{"fullName":"a/b"}' }))
    expect(readPending(null)).toEqual([])
    browser(area(), area({ 'hanzo.build.sync.none': 'not json' }))
    expect(readPending(null)).toEqual([])
  })

  it('are none, and forgotten quietly, in a browser that refuses storage', () => {
    refusing()
    expect(readPending('acme')).toEqual([])
    expect(() => writePending('acme', [{ fullName: 'acme/api', name: 'api' }])).not.toThrow()
  })
})

describe('a GitHub choice', () => {
  const row = { owner: 'webby-ai', name: 'intel-hub', full_name: 'webby-ai/intel-hub', private: true, default_branch: 'main', pushed_at: '', installation_id: 7 }

  it('is offered under GitHub’s address, so a forge codebase of the same name stays distinct', () => {
    const hub = asHub(row)
    expect(hub.full_name).toBe('github.com/webby-ai/intel-hub')
    expect(isHub(hub)).toBe(true)
    expect(isForge(hub)).toBe(false)
  })

  it('is never a forge row, and a forge row is never one', () => {
    expect(isHub({ forge: true, name: 'intel-hub', full_name: 'webby-ai/intel-hub' } as never)).toBe(false)
    expect(isHub({ github: true, full_name: 'webby-ai/intel-hub' })).toBe(false)
    expect(isHub(null)).toBe(false)
  })
})
