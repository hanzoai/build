import { afterEach, describe, expect, it, vi } from 'vitest'

import { back, enter, form } from './enter.ts'

/** A tab at `href` with a sessionStorage of its own. */
function tab(href: string) {
  const u = new URL(href)
  const store = new Map<string, string>()
  vi.stubGlobal('window', {
    location: { pathname: u.pathname, search: u.search, hash: u.hash },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

describe('signing in is one trip, in this tab', () => {
  it('writes down where the tab is and leaves for hanzo.id', () => {
    tab('http://localhost:3200/-/codebases?view=all#top')
    const door = { login: vi.fn(async () => undefined) }
    enter(door)
    expect(door.login).toHaveBeenCalledOnce()
    expect(back()).toBe('/-/codebases?view=all#top')
  })

  it('reads the address once, and then lands on New', () => {
    tab('http://localhost:3200/sess_0123456789abcdef0123456789abcdef')
    enter({ login: async () => undefined })
    expect(back()).toBe('/sess_0123456789abcdef0123456789abcdef')
    expect(back()).toBe('/')
  })

  it('never returns off this page, or to the callback it is answering', () => {
    for (const held of ['//evil.example/x', '/\\evil.example', 'https://evil.example/', '/auth/callback?code=c&state=s', '/auth/callback']) {
      tab('http://localhost:3200/').set('signin.destination', held)
      expect(back(), held).toBe('/')
    }
  })

  it('still leaves, and lands on New, in a browser that refuses storage', () => {
    vi.stubGlobal('window', {
      location: { pathname: '/-/sync', search: '', hash: '' },
      get sessionStorage(): Storage {
        throw new Error('SecurityError')
      },
    })
    const door = { login: vi.fn(async () => undefined) }
    enter(door)
    expect(door.login).toHaveBeenCalledOnce()
    expect(back()).toBe('/')
  })
})

describe('a tab that followed a sign-out made in another', () => {
  it('asks hanzo.id for the sign-in form on its next trip, and only that one', () => {
    tab('http://localhost:3200/-/codebases')
    const door = { login: vi.fn(async () => undefined) }
    form()
    enter(door)
    expect(door.login).toHaveBeenLastCalledWith({ additionalParams: { prompt: 'login' } })
    enter(door)
    expect(door.login).toHaveBeenLastCalledWith(undefined)
  })

  it('does not honour a note from long ago', () => {
    tab('http://localhost:3200/').set('signin.form', String(Date.now() - 60_000))
    const door = { login: vi.fn(async () => undefined) }
    enter(door)
    expect(door.login).toHaveBeenLastCalledWith(undefined)
  })
})
