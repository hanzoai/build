import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEV_MODE_EVENT, DEV_MODE_KEY, formatDeviceLabel, getDevMode, setDevMode } from './dev-mode.ts'

afterEach(() => vi.unstubAllGlobals())

describe('Developer mode and friendly device labels', () => {
  it('syncs hanzo.dev_mode via localStorage and hanzo:dev-mode event', () => {
    const store = new Map<string, string>()
    const events: string[] = []
    const target = new EventTarget()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: (e: Event) => {
        events.push(e.type)
        return target.dispatchEvent(e)
      },
    })
    expect(getDevMode()).toBe(false)
    setDevMode(true)
    expect(store.get(DEV_MODE_KEY)).toBe('true')
    expect(events).toContain(DEV_MODE_EVENT)
    expect(getDevMode()).toBe(true)
  })

  it('formats technical machine strings into neutral Local - Device labels in Simple Mode and preserves hardware detail', () => {
    expect(formatDeviceLabel('MacBook-Pro.local · 16 vCPU / 64G', { devMode: false })).toEqual({
      title: 'Local - Device',
      detail: 'MacBook-Pro.local · 16 vCPU / 64G',
    })
    expect(formatDeviceLabel('MacBook GPU M2', { devMode: false })).toEqual({
      title: 'Local - Device',
      detail: 'MacBook GPU M2',
    })
    expect(formatDeviceLabel('workstation.local (shell-1)', { devMode: false })).toEqual({
      title: 'Local - Device',
      detail: 'workstation.local (shell-1)',
    })
    expect(formatDeviceLabel('cloud-1 · shell-1', { devMode: false })).toEqual({
      title: 'Cloud workspace',
      detail: 'cloud-1 · shell-1',
    })
    expect(formatDeviceLabel('Hanzo sandbox', { devMode: false })).toEqual({
      title: 'Cloud workspace',
      detail: 'Managed Hanzo cloud workspace',
    })
  })
})
