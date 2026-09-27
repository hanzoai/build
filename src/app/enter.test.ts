import { describe, expect, it, vi } from 'vitest'

import { enter } from './enter.ts'

describe('signing in keeps the page when it can', () => {
  it('completes in the popup and never redirects', async () => {
    const door = { login: vi.fn(), loginPopup: vi.fn(async () => undefined) }
    expect(await enter(door)).toBe(true)
    expect(door.loginPopup).toHaveBeenCalledOnce()
    expect(door.login).not.toHaveBeenCalled()
  })

  it('falls back to the redirect when the browser refuses the popup', async () => {
    const door = {
      login: vi.fn(),
      loginPopup: vi.fn(async () => {
        throw new Error('Failed to open login popup — blocked by browser?')
      }),
    }
    expect(await enter(door)).toBe(false)
    expect(door.login).toHaveBeenCalledOnce()
  })
})
