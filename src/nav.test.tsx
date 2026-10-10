import { describe, expect, it, vi } from 'vitest'

import type { Host } from './host.tsx'
import { nav, NEW } from './nav.tsx'
import { route } from './route.ts'

// The marks are react-native-svg drawings, which a node test cannot load; what a place is and where it goes is plain data.
vi.mock('@hanzogui/lucide-icons-2', () =>
  Object.fromEntries(['Blocks', 'BookOpen', 'CircleDot', 'Container', 'Cpu', 'FolderGit2', 'LayoutTemplate', 'SlidersHorizontal', 'SquarePen', 'Workflow'].map((n) => [n, () => null])),
)
vi.mock('./foot.tsx', () => ({ DOCS: 'https://docs.hanzo.ai/docs/dev' }))

const host = (path = ''): Host => ({
  name: 'Hanzo Dev',
  api: 'https://api.hanzo.ai',
  token: () => 'tok',
  org: 'acme',
  person: { name: 'Dave', email: 'dave@acme.test', avatar: '' },
  admin: true,
  path,
  go: () => {},
  links: { github: '', customize: '', settings: '', home: '' },
  open: () => {},
})

describe('the builder’s places, once for every rail', () => {
  it('lists every place, grouped in the order a customer asks, and nothing behind a More', () => {
    expect(nav(host(), () => {}).map((g) => [g.label, g.links.map((l) => l.label)])).toEqual([
      ['Work', ['New run', 'Projects', 'Issues']],
      ['Make', ['Artifacts', 'Templates', 'Automations']],
      ['Run', ['Machines', 'Environments']],
      ['Setup', ['Customize', 'Docs']],
    ])
  })

  it('moves to an address the grammar reads back as that place', () => {
    // Issues forgets the board it last pinned, in this browser: one with nothing kept.
    vi.stubGlobal('window', { dispatchEvent: () => true })
    const seen: string[] = []
    const all = nav(host(), (p) => seen.push(p)).flatMap((g) => g.links)
    for (const l of all.filter((l) => l.id !== 'docs')) l.onPress?.()
    expect(seen.map((p) => route(p))).toEqual([
      { kind: 'new' },
      { kind: 'screen', screen: 'projects' },
      { kind: 'screen', screen: 'issues' },
      { kind: 'screen', screen: 'artifacts' },
      { kind: 'screen', screen: 'templates' },
      { kind: 'screen', screen: 'automations' },
      { kind: 'settings', section: 'machines' },
      { kind: 'settings', section: 'environments' },
      { kind: 'customize', tab: 'skills' },
    ])
    vi.unstubAllGlobals()
  })

  it('opens the docs in a tab of their own, not in the builder', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })
    const go = vi.fn()
    nav(host(), go)
      .flatMap((g) => g.links)
      .find((l) => l.id === 'docs')
      ?.onPress?.()
    expect(go).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith('https://docs.hanzo.ai/docs/dev', '_blank', 'noopener,noreferrer')
    vi.unstubAllGlobals()
  })

  it.each([
    ['', NEW],
    ['-/projects', 'projects'],
    ['-/sync', 'projects'],
    ['acme/shop', 'projects'],
    ['-/automations/new', 'automations'],
    ['-/settings/machines', 'machines'],
    ['-/settings/environments', 'environments'],
    ['-/customize/agents', 'customize'],
    ['-/mcp', 'customize'],
  ])('marks %j as %s, and only that one', (path, id) => {
    const lit = nav(host(path), () => {})
      .flatMap((g) => g.links)
      .filter((l) => l.active)
      .map((l) => l.id)
    expect(lit).toEqual([id])
  })
})
