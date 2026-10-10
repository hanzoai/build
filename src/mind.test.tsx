import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Target } from './api/call.ts'
import { ENSO } from './api/models.ts'
import { catalog, EFFORTS, FIRST, keep, kept, nameOf, reasons, useMind } from './mind.ts'

/** A browser's storage and events, enough for the store: what was written, and who heard. */
function browser(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed))
  const heard: string[] = []
  const target = new EventTarget()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: (e: Event) => {
      heard.push(e.type)
      return target.dispatchEvent(e)
    },
  })
  return { items, heard }
}

const CATALOG = [
  { id: 'enso-auto', name: 'Enso', family: 'enso' as const, class: 'ours' as const, supports_reasoning: true },
  { id: 'zen6', name: 'Zen 6', family: 'zen' as const, class: 'ours' as const, supports_reasoning: true },
  { id: 'zen6-flash', name: 'Zen 6 Flash', family: 'zen' as const, class: 'ours' as const },
  { id: 'opus', name: 'Opus', class: 'premium' as const, supports_reasoning: true },
]

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('the kept choice', () => {
  it('is Enso at Medium where nothing is kept, and on a server', () => {
    expect(FIRST).toEqual({ model: ENSO, effort: 'medium' })
    expect(kept()).toEqual(FIRST)
    browser()
    expect(kept()).toEqual(FIRST)
  })

  it('is kept under one key for Chat and Dev, and the change is announced', () => {
    const { items, heard } = browser()
    keep({ model: 'zen6' })
    keep({ effort: 'high' })
    expect(JSON.parse(items.get('hanzo.mind')!)).toEqual({ model: 'zen6', effort: 'high' })
    expect(heard).toEqual(['hanzo:mind', 'hanzo:mind'])
    expect(kept()).toEqual({ model: 'zen6', effort: 'high' })
  })

  it('reads what another tab kept', () => {
    const { items } = browser()
    expect(kept()).toEqual(FIRST)
    items.set('hanzo.mind', JSON.stringify({ model: 'zen6-flash', effort: 'low' }))
    expect(kept()).toEqual({ model: 'zen6-flash', effort: 'low' })
  })

  it('reads an effort it does not know, a blank model and a broken entry as the defaults', () => {
    browser({ 'hanzo.mind': JSON.stringify({ model: '  ', effort: 'extreme' }) })
    expect(kept()).toEqual(FIRST)
    browser({ 'hanzo.mind': '{not json' })
    expect(kept()).toEqual(FIRST)
  })

  it('holds a choice for the page where the browser refuses to store it', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
      },
      dispatchEvent: () => true,
    })
    keep({ model: 'zen6', effort: 'low' })
    expect(kept()).toEqual({ model: 'zen6', effort: 'low' })
  })

  it('offers the efforts both planes take, and nothing else', () => {
    expect(EFFORTS.map((e) => e.id)).toEqual(['low', 'medium', 'high'])
  })
})

describe('the catalog', () => {
  it('lets Enso and a model it does not describe take an effort, and a listed model only if it reasons', () => {
    expect(reasons(ENSO, [])).toBe(true)
    expect(reasons('zen6', CATALOG)).toBe(true)
    expect(reasons('zen6-flash', CATALOG)).toBe(false)
    expect(reasons('unlisted', CATALOG)).toBe(true)
  })

  it('names a model as the catalog does, and the router as Enso', () => {
    expect(nameOf(ENSO, [])).toBe('Enso')
    expect(nameOf('zen6', CATALOG)).toBe('Zen 6')
  })

  it('is asked for once per platform, and asked again after a refusal', async () => {
    let asked = 0
    let refuse = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        asked++
        if (refuse) return new Response(JSON.stringify({ detail: 'down' }), { status: 503 })
        return new Response(JSON.stringify({ data: CATALOG }), { status: 200 })
      }),
    )
    const t: Target = { api: 'https://api.test', token: () => 'tok', org: 'acme' }
    await expect(catalog(t)).rejects.toThrow('down')
    refuse = false
    const [a, b] = await Promise.all([catalog(t), catalog(t)])
    expect(a.map((m) => m.id)).toEqual(['enso-auto', 'zen6', 'zen6-flash', 'opus'])
    expect(b).toBe(a)
    expect(asked).toBe(2)
  })

  it('starts a surface on Enso at Medium, with the catalog already read on the first render', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: CATALOG }), { status: 200 })))
    const t: Target = { api: 'https://api.first', token: () => 'tok', org: null }
    await catalog(t)
    let seen: ReturnType<typeof useMind> | null = null
    const Reads = () => {
      seen = useMind(t)
      return null
    }
    renderToString(<Reads />)
    expect(seen).toMatchObject({ model: ENSO, effort: 'medium', loading: false, error: null })
    expect(seen!.models).toHaveLength(4)
  })
})
