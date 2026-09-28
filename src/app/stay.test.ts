import { describe, expect, it } from 'vitest'

import { follow, step } from './stay.ts'

const page = 'https://build.test/-/codebases'

describe('this page stays on its own frontend', () => {
  it('keeps a platform address on this page', () => {
    expect(step('https://platform.hanzo.ai/platform/settings', page)).toEqual({ kind: 'stay' })
    expect(step('https://platform.hanzo.ai/platform/plugins', page)).toEqual({ kind: 'stay' })
    expect(step('https://platform.hanzo.ai/platform/computers', page)).toEqual({ kind: 'stay' })
  })

  it('routes an address on this origin inside the app', () => {
    expect(step('/-/sync', page)).toEqual({ kind: 'here', path: '/-/sync' })
    expect(step('https://build.test/', page)).toEqual({ kind: 'here', path: '/' })
    expect(step('https://build.test/platform/computers', page)).toEqual({ kind: 'here', path: '/' })
  })

  it('stays put for an address it cannot read', () => {
    expect(step('/-/sync', 'about:blank')).toEqual({ kind: 'stay' })
    expect(step('https://[bad', page)).toEqual({ kind: 'stay' })
  })

  it('follows the GitHub grant', () => {
    expect(step('https://github.com/apps/hanzo/installations/new', page)).toEqual({
      kind: 'away',
      href: 'https://github.com/apps/hanzo/installations/new',
    })
  })
})

describe('following a click', () => {
  const moves = (href: string) => {
    const out: string[] = []
    follow(href, page, { here: (p) => out.push(`here ${p}`), away: (h) => out.push(`away ${h}`) })
    return out
  }

  it('moves in the router, leaves for the grant, and otherwise stays', () => {
    expect(moves('/-/sync')).toEqual(['here /-/sync'])
    expect(moves('https://github.com/apps/hanzo/installations/new')).toEqual(['away https://github.com/apps/hanzo/installations/new'])
    expect(moves('https://platform.hanzo.ai/platform/settings')).toEqual([])
  })
})
