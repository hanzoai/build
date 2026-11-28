import { describe, expect, it } from 'vitest'

import * as devMode from './dev-mode.ts'
import * as handoff from './handoff.ts'
import * as mind from './mind.ts'
import * as names from './names.ts'
import * as plan from './plan.ts'
import * as route from './route.ts'

describe('@hanzo/build compatibility shim over @hanzo/dev', () => {
  it('re-exports @hanzo/dev/plan', () => {
    expect(typeof plan.label).toBe('function')
    expect(typeof plan.said).toBe('function')
    expect(typeof plan.ways).toBe('function')
  })

  it('re-exports @hanzo/dev/route', () => {
    expect(typeof route.route).toBe('function')
    expect(typeof route.path).toBe('function')
    expect(typeof route.href).toBe('function')
    expect(typeof route.parse).toBe('function')
  })

  it('re-exports @hanzo/dev/mind', () => {
    expect(Array.isArray(mind.EFFORTS)).toBe(true)
    expect(typeof mind.useMind).toBe('function')
  })

  it('re-exports @hanzo/dev/handoff', () => {
    expect(typeof handoff.DEV_HANDOFF).toBe('string')
    expect(typeof handoff.takeHandoff).toBe('function')
  })

  it('re-exports @hanzo/dev/dev-mode', () => {
    expect(typeof devMode.DEV_MODE_KEY).toBe('string')
    expect(typeof devMode.useDevMode).toBe('function')
    expect(typeof devMode.formatDeviceLabel).toBe('function')
  })

  it('re-exports @hanzo/dev/names', () => {
    expect(typeof names.deviceKey).toBe('function')
    expect(typeof names.friendly).toBe('function')
    expect(typeof names.useDeviceNames).toBe('function')
  })
})
