import { describe, expect, it } from 'vitest'

import { step } from './stay.ts'

const page = 'https://hanzo.build/-/codebases'

describe('this page stays on its own frontend', () => {
  it('keeps a platform address on this page', () => {
    expect(step('https://platform.hanzo.ai/platform/settings', page)).toEqual({ kind: 'stay' })
    expect(step('https://platform.hanzo.ai/platform/plugins', page)).toEqual({ kind: 'stay' })
    expect(step('https://platform.hanzo.ai/platform/computers', page)).toEqual({ kind: 'stay' })
  })

  it('routes an address on this origin inside the app', () => {
    expect(step('/-/sync', page)).toEqual({ kind: 'here', path: '/-/sync' })
    expect(step('https://hanzo.build/', page)).toEqual({ kind: 'here', path: '/' })
    expect(step('https://hanzo.build/platform/computers', page)).toEqual({ kind: 'here', path: '/' })
  })

  it('follows the GitHub grant', () => {
    expect(step('https://github.com/apps/hanzo/installations/new', page)).toEqual({
      kind: 'away',
      href: 'https://github.com/apps/hanzo/installations/new',
    })
  })
})
