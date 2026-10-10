import { afterEach, describe, expect, it, vi } from 'vitest'

import { address, moved, name, opened, PAGE, read, shut, type Tabs } from './tabs.ts'

const SEED: Tabs = {
  tabs: [
    { id: 'artifacts', kind: 'artifacts', title: 'Artifacts' },
    { id: 'preview', kind: 'preview', title: 'Preview' },
    { id: 'terminal', kind: 'terminal', title: 'Terminal' },
  ],
  at: 'terminal',
}

afterEach(() => vi.unstubAllGlobals())

describe('the panel’s tabs', () => {
  it('chooses a kind already open rather than opening it twice', () => {
    const next = opened(SEED, { kind: 'preview', title: 'Preview' })
    expect(next.tabs).toHaveLength(3)
    expect(next.at).toBe('preview')
  })

  it('adds a kind that is not open at the end and chooses it', () => {
    const next = opened(SEED, { kind: 'files', title: 'Files' })
    expect(next.tabs.map((t) => t.id)).toEqual(['artifacts', 'preview', 'terminal', 'files'])
    expect(next.at).toBe('files')
  })

  it('opens a page once per thing: the same artifact twice is one tab', () => {
    const once = opened(SEED, { kind: PAGE, title: 'index.html', body: '<h1>hi</h1>', type: 'text/html' })
    const twice = opened(once, { kind: PAGE, title: 'index.html', body: '<h1>hi</h1>', type: 'text/html' })
    expect(twice.tabs).toHaveLength(4)
    expect(twice.at).toBe(once.at)
    const other = opened(twice, { kind: PAGE, title: 'about.html', body: '<h1>about</h1>', type: 'text/html' })
    expect(other.tabs).toHaveLength(5)
    expect(other.at).not.toBe(once.at)
  })

  it('shuts a tab and chooses the one to its right, else its left', () => {
    expect(shut(SEED, 'terminal')).toEqual({ tabs: SEED.tabs.slice(0, 2), at: 'preview' })
    expect(shut({ ...SEED, at: 'artifacts' }, 'artifacts').at).toBe('preview')
    expect(shut({ ...SEED, at: 'artifacts' }, 'preview').at).toBe('artifacts')
    expect(shut({ tabs: [SEED.tabs[0]!], at: 'artifacts' }, 'artifacts')).toEqual({ tabs: [], at: null })
  })

  it('moves a tab to a place, the others closing up', () => {
    expect(moved(SEED, 'terminal', 0).tabs.map((t) => t.id)).toEqual(['terminal', 'artifacts', 'preview'])
    expect(moved(SEED, 'artifacts', 9).tabs.map((t) => t.id)).toEqual(['preview', 'terminal', 'artifacts'])
    expect(moved(SEED, 'gone', 0)).toBe(SEED)
  })

  it('restores what was kept, dropping a page that held only an object URL', () => {
    const kept = {
      tabs: [
        { id: 'terminal', kind: 'terminal', title: 'Terminal' },
        { id: 'p1', kind: PAGE, title: 'old', url: 'blob:https://hanzo.ai/1' },
        { id: 'p2', kind: PAGE, title: 'index.html', body: '<h1>hi</h1>', type: 'text/html' },
        { id: 'p3', kind: PAGE, title: 'hanzo.ai', url: 'https://hanzo.ai' },
        { nonsense: true },
      ],
      at: 'p1',
    }
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => (k === 'hanzo.side.chat:thread:1' ? JSON.stringify(kept) : null) } })
    const back = read('chat:thread:1')!
    expect(back.tabs.map((t) => t.id)).toEqual(['terminal', 'p2', 'p3'])
    // A chosen tab that is no longer there is not a choice.
    expect(back.at).toBe('terminal')
    expect(read('chat:thread:none')).toBeNull()
  })

  it('names an address by its host and path, and opens a typed one', () => {
    expect(name('https://hanzo.ai/docs')).toBe('hanzo.ai/docs')
    expect(name('https://hanzo.ai/')).toBe('hanzo.ai')
    expect(address('hanzo.ai')).toBe('https://hanzo.ai')
    expect(address('localhost:3000')).toBe('http://localhost:3000')
    expect(address('  ')).toBe('')
  })
})
