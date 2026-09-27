import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, origin } from './where.ts'

/** A page at `href`. */
const at = (href: string) => {
  const u = new URL(href)
  vi.stubGlobal('window', { location: { origin: u.origin, hostname: u.hostname } })
}

afterEach(() => vi.unstubAllGlobals())

describe('where this page signs in', () => {
  it('is hanzo.id as the hanzo-build client, returning to this origin', () => {
    at('https://hanzo.build/-/codebases')
    expect(origin({})).toEqual({
      serverUrl: 'https://hanzo.id',
      clientId: 'hanzo-build',
      redirectUri: 'https://hanzo.build/auth/callback',
      organization: 'hanzo',
    })
  })

  it('is the issuer and client a fork names', () => {
    at('http://localhost:3200/')
    expect(origin({ VITE_HANZO_CLIENT_ID: 'lux-build', VITE_HANZO_IAM: 'https://lux.id//' })).toEqual({ serverUrl: 'https://lux.id', clientId: 'lux-build', redirectUri: 'http://localhost:3200/auth/callback', organization: 'lux' })
  })
})

describe('where the platform is', () => {
  it('is api.hanzo.ai from a hanzo.ai host or hanzo.build', () => {
    for (const page of ['https://hanzo.ai/dev', 'https://app.hanzo.ai/dev', 'https://hanzo.build/']) {
      at(page)
      expect(api({}), page).toBe('https://api.hanzo.ai')
    }
  })

  it('is this page’s own origin anywhere else, where /v1 is proxied', () => {
    at('http://localhost:3200/-/codebases')
    expect(api({})).toBe('http://localhost:3200')
    at('https://nothanzo.ai/')
    expect(api({})).toBe('https://nothanzo.ai')
  })

  it('is the platform a fork names', () => {
    at('https://hanzo.build/')
    expect(api({ VITE_HANZO_API: 'https://api.lux.network/' })).toBe('https://api.lux.network')
  })
})
