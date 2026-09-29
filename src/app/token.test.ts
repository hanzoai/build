import { afterEach, describe, expect, it, vi } from 'vitest'

import { administers, bearer, org, orgs, own, selectOrg, subject, watch } from './token.ts'

/** Web Storage as a browser has it: the kept keys are the object's own. */
class Kept {
  getItem(k: string): string | null {
    return Object.hasOwn(this, k) ? (this as unknown as Record<string, string>)[k]! : null
  }
  setItem(k: string, v: string) {
    ;(this as unknown as Record<string, string>)[k] = String(v)
  }
  removeItem(k: string) {
    delete (this as unknown as Record<string, string>)[k]
  }
}

/** A browser whose storage holds `seed`. */
function browser(seed: Record<string, string> = {}): Kept {
  const store = new Kept()
  for (const [k, v] of Object.entries(seed)) store.setItem(k, v)
  vi.stubGlobal('window', { localStorage: store })
  return store
}

/** A browser that refuses storage: every access throws, as a blocked site's does. */
function refusing() {
  vi.stubGlobal('window', {
    get localStorage(): Storage {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (claims: object) => `${b64({ alg: 'none' })}.${b64(claims)}.x`
const ACCESS = 'hanzo_iam_access_token'
const ORG = 'hanzo_iam_current_org'

afterEach(() => vi.unstubAllGlobals())

describe('the stored session', () => {
  it('answers nothing on a server, where there is no window', () => {
    expect(bearer()).toBeNull()
    expect(subject()).toBeUndefined()
    expect(orgs()).toEqual([])
    expect(org()).toBeNull()
    expect(selectOrg('acme')).toBe(false)
    expect(administers('acme')).toBe(false)
    expect(() => own('acme/dave')).not.toThrow()
  })

  it('reads the bearer and its subject from the SDK’s own key', () => {
    const t = jwt({ sub: 'acme/dave' })
    browser({ [ACCESS]: t })
    expect(bearer()).toBe(t)
    expect(subject()).toBe('acme/dave')
  })

  it('names no subject for an empty, missing or non-string sub', () => {
    browser({ [ACCESS]: jwt({ sub: '' }) })
    expect(subject()).toBeUndefined()
    browser({ [ACCESS]: jwt({ sub: 7 }) })
    expect(subject()).toBeUndefined()
    browser()
    expect(subject()).toBeUndefined()
  })

  it('reads as signed out, not as an exception, in a browser that refuses storage', () => {
    refusing()
    expect(bearer()).toBeNull()
    expect(subject()).toBeUndefined()
    expect(org()).toBeNull()
    expect(selectOrg('acme')).toBe(false)
    expect(() => own('acme/dave')).not.toThrow()
  })
})

describe('one person’s browser', () => {
  it('leaves everything in place for the same person', () => {
    const store = browser({ 'hanzo:who': 'acme/dave', 'hanzo.build.new.acme': '{}', [ORG]: 'acme' })
    own('acme/dave')
    expect(store.getItem('hanzo.build.new.acme')).toBe('{}')
    expect(store.getItem(ORG)).toBe('acme')
  })

  it('empties the last person’s selections when another arrives, and keeps the arriving session', () => {
    const store = browser({
      'hanzo:who': 'acme/erin',
      'hanzo.build.new.acme': '{"ask":"hers"}',
      'hanzo.build.rail': 'true',
      [ORG]: 'acme',
      hanzo_iam_current_project: 'p1',
      [ACCESS]: 'tok',
      hanzo_iam_refresh_token: 'ref',
      theme: 'dark',
    })
    own('acme/dave')
    expect(store.getItem('hanzo:who')).toBe('acme/dave')
    expect(store.getItem('hanzo.build.new.acme')).toBeNull()
    expect(store.getItem('hanzo.build.rail')).toBeNull()
    expect(store.getItem(ORG)).toBeNull()
    expect(store.getItem('hanzo_iam_current_project')).toBeNull()
    expect(store.getItem(ACCESS)).toBe('tok')
    expect(store.getItem('hanzo_iam_refresh_token')).toBe('ref')
    // Not this app's key, so not this app's to remove.
    expect(store.getItem('theme')).toBe('dark')
  })

  it('a sign-out forgets who it was', () => {
    const store = browser({ 'hanzo:who': 'acme/dave', 'hanzo.build.slack': 'true' })
    own(undefined)
    expect(store.getItem('hanzo:who')).toBeNull()
    expect(store.getItem('hanzo.build.slack')).toBeNull()
  })

  it('a browser nobody has signed in to stays as it is', () => {
    const store = browser({ 'hanzo.build.rail': 'true' })
    own(undefined)
    expect(store.getItem('hanzo.build.rail')).toBe('true')
  })
})

describe('the organizations', () => {
  const two = jwt({ orgs: [{ org: 'acme', role: 'admin' }, null, { org: '' }, { org: 7 }, { org: 'beta', role: 'member' }, { org: 'acme' }] })

  it('lists each org the token names once, home first', () => {
    browser({ [ACCESS]: two })
    expect(orgs()).toEqual(['acme', 'beta'])
    browser({ [ACCESS]: jwt({ orgs: 'acme', owner: 'hanzo' }) })
    expect(orgs()).toEqual([])
  })

  it('works in the chosen org, a sole org without a choice, and none when it is not a choice yet', () => {
    browser({ [ACCESS]: two, [ORG]: 'beta' })
    expect(org()).toBe('beta')
    browser({ [ACCESS]: two, [ORG]: 'elsewhere' })
    expect(org()).toBeNull()
    browser({ [ACCESS]: two })
    expect(org()).toBeNull()
    browser({ [ACCESS]: jwt({ orgs: [{ org: 'acme' }] }), [ORG]: 'elsewhere' })
    expect(org()).toBe('acme')
    browser()
    expect(org()).toBeNull()
  })

  it('selects only an org the person belongs to', () => {
    const store = browser({ [ACCESS]: two })
    expect(selectOrg('gamma')).toBe(false)
    expect(store.getItem(ORG)).toBeNull()
    expect(selectOrg('beta')).toBe(true)
    expect(store.getItem(ORG)).toBe('beta')
  })

  it('says no when the choice cannot be kept, as in a browser whose storage is full', () => {
    const store = browser({ [ACCESS]: two })
    store.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    expect(selectOrg('beta')).toBe(false)
    expect(store.getItem(ORG)).toBeNull()
  })

  it('reads admin off the stored token', () => {
    browser({ [ACCESS]: two })
    expect(administers('acme')).toBe(true)
    expect(administers('beta')).toBe(false)
    expect(administers(null)).toBe(false)
  })
})

describe('following the session other tabs share', () => {
  const dave = jwt({ sub: 'acme/dave' })

  /** A tab at `path` whose storage holds `seed`; `other` is another tab writing `key` (null clears the store). */
  function tab(seed: Record<string, string>, path = '/') {
    const store = new Kept()
    for (const [k, v] of Object.entries(seed)) store.setItem(k, v)
    const heard = new Set<(e: StorageEvent) => void>()
    vi.stubGlobal('window', {
      localStorage: store,
      location: { pathname: path },
      addEventListener: (_: string, fn: (e: StorageEvent) => void) => heard.add(fn),
      removeEventListener: (_: string, fn: (e: StorageEvent) => void) => heard.delete(fn),
    })
    const other = (key: string | null, value: string | null = null) => {
      if (key === null) for (const k of Object.keys(store)) store.removeItem(k)
      else if (value === null) store.removeItem(key)
      else store.setItem(key, value)
      for (const fn of [...heard]) fn({ storageArea: store, key } as unknown as StorageEvent)
    }
    return { other, heard }
  }

  it('moves, to nobody, when another tab signs out', () => {
    const { other } = tab({ [ACCESS]: dave })
    const moved = vi.fn()
    watch(subject(), moved)
    other(ACCESS)
    expect(moved).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('reads a cleared store as a sign-out', () => {
    const { other } = tab({ [ACCESS]: dave })
    const moved = vi.fn()
    watch(subject(), moved)
    other(null)
    expect(moved).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('moves to whoever signs in in another tab', () => {
    const { other } = tab({ [ACCESS]: dave })
    const moved = vi.fn()
    watch(subject(), moved)
    other(ACCESS, jwt({ sub: 'acme/erin' }))
    expect(moved).toHaveBeenCalledExactlyOnceWith('acme/erin')
  })

  it('stays for a refresh in another tab, and for keys that are not the token', () => {
    const { other } = tab({ [ACCESS]: dave })
    const moved = vi.fn()
    watch(subject(), moved)
    other(ACCESS, jwt({ sub: 'acme/dave', exp: 2 }))
    other(ORG, 'acme')
    other('hanzo_iam_refresh_lease')
    expect(moved).not.toHaveBeenCalled()
  })

  it('leaves a tab on the sign-in callback to finish its own sign-in', () => {
    const { other } = tab({}, '/auth/callback')
    const moved = vi.fn()
    watch(subject(), moved)
    other(ACCESS, dave)
    expect(moved).not.toHaveBeenCalled()
  })

  it('stops following once let go', () => {
    const { other, heard } = tab({ [ACCESS]: dave })
    const moved = vi.fn()
    watch(subject(), moved)()
    expect(heard.size).toBe(0)
    other(ACCESS)
    expect(moved).not.toHaveBeenCalled()
  })
})
