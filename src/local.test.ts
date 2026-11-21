import { describe, expect, it } from 'vitest'

import { auto, failed, HERE, named, recent, where, type Folder } from './local.ts'

const a: Folder = { path: '/Users/me/site', name: 'site', used: 100 }
const b: Folder = { path: '/Users/me/api', name: 'api', used: 300 }
const c: Folder = { path: '/Users/me/notes', name: 'notes' }

describe('a folder on this computer (hanzo-inc/app issues 309 and 310)', () => {
  it('lists the folder used most recently first, and one never used last', () => {
    expect(recent([a, c, b]).map((f) => f.name)).toEqual(['api', 'site', 'notes'])
  })

  it('Auto picks the folder used last', () => {
    expect(auto([a, b, c])?.path).toBe('/Users/me/api')
  })

  it('Auto has nothing to pick on a computer that opened no folder', () => {
    expect(auto([])).toBeNull()
    expect(where([], '')).toEqual({ folder: null, auto: true })
  })

  it('a folder the person chose wins over Auto while the computer still lists it', () => {
    expect(where([a, b], '/Users/me/site')).toEqual({ folder: a, auto: false })
  })

  it('a chosen folder the computer no longer lists falls back to Auto', () => {
    expect(where([a, b], '/Users/me/gone')).toEqual({ folder: b, auto: true })
  })

  it('names a folder by its last segment', () => {
    expect(named('/Users/me/site/')).toBe('site')
    expect(named('C:\\work\\api')).toBe('api')
  })

  it('says how to install the agent when the computer has none, and never asks for a repository', () => {
    const missing = failed(new Error('Failed to invoke dev at "dev": No such file or directory (os error 2)'))
    expect(missing).toContain('npm install -g @hanzo/dev')
    expect(missing).not.toMatch(/repositor|github/i)
    expect(failed(new Error('permission denied'))).toBe('The run on this computer could not start: permission denied')
  })

  it("keeps This computer's place id apart from a machine's and the sandbox's", () => {
    expect(HERE).not.toBe('')
    expect(HERE.startsWith('tgt_')).toBe(false)
  })
})
