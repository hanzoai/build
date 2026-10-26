import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Target } from './api/call.ts'
import { ENSO } from './api/models.ts'
import { catalog, EFFORTS, FIRST, keep, kept, level, nameOf, useMind } from './mind.ts'

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
  it('is Enso at Auto where nothing is kept, and on a server', () => {
    expect(FIRST).toEqual({ model: ENSO, effort: 'auto' })
    expect(kept()).toEqual(FIRST)
    browser()
    expect(kept()).toEqual(FIRST)
  })

  it('is kept under one key for Chat and Dev, and the change is announced', () => {
    const { items, heard } = browser()
    keep({ model: 'zen6' })
    keep({ effort: 'xhigh' })
    expect(JSON.parse(items.get('hanzo.mind')!)).toEqual({ model: 'zen6', effort: 'xhigh' })
    expect(heard).toEqual(['hanzo:mind', 'hanzo:mind'])
    expect(kept()).toEqual({ model: 'zen6', effort: 'xhigh' })
  })

  it('reads what another tab kept', () => {
    const { items } = browser()
    expect(kept()).toEqual(FIRST)
    items.set('hanzo.mind', JSON.stringify({ model: 'zen6-flash', effort: 'max' }))
    expect(kept()).toEqual({ model: 'zen6-flash', effort: 'max' })
  })

  it('reads an effort it does not know, a blank model and a broken entry as the defaults', () => {
    browser({ 'hanzo.mind': JSON.stringify({ model: '  ', effort: 'extreme' }) })
    expect(kept()).toEqual(FIRST)
    // Low and Medium were offered once; a choice kept from then opens on Auto, which a run sends as medium.
    for (const effort of ['low', 'medium']) {
      browser({ 'hanzo.mind': JSON.stringify({ model: 'zen6', effort }) })
      expect(kept()).toEqual({ model: 'zen6', effort: 'auto' })
    }
    browser({ 'hanzo.mind': '{not json' })
    expect(kept()).toEqual(FIRST)
  })

  it('keeps only an effort it offers, whoever asks', () => {
    const { items } = browser()
    keep({ model: 'zen6', effort: 'max' })
    keep({ effort: 'low' as never })
    expect(JSON.parse(items.get('hanzo.mind')!)).toEqual({ model: 'zen6', effort: 'auto' })
    keep({ model: 'zen6-flash' })
    expect(kept()).toEqual({ model: 'zen6-flash', effort: 'auto' })
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
    keep({ model: 'zen6', effort: 'auto' })
    expect(kept()).toEqual({ model: 'zen6', effort: 'auto' })
  })

  it('offers Auto, High, XHigh and Max, in that order, and nothing else', () => {
    expect(EFFORTS.map((e) => e.label)).toEqual(['Auto', 'High', 'XHigh', 'Max'])
  })

  it('names to a coding run only an effort it takes: medium for Auto, high for the rest', () => {
    expect(EFFORTS.map((e) => level(e.id))).toEqual(['medium', 'high', 'high', 'high'])
  })
})

describe('the catalog', () => {
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

  it('starts a surface on Enso at Auto, with the catalog already read on the first render', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: CATALOG }), { status: 200 })))
    const t: Target = { api: 'https://api.first', token: () => 'tok', org: null }
    await catalog(t)
    let seen: ReturnType<typeof useMind> | null = null
    const Reads = () => {
      seen = useMind(t)
      return null
    }
    renderToString(<Reads />)
    expect(seen).toMatchObject({ model: ENSO, effort: 'auto', loading: false, error: null })
    expect(seen!.models).toHaveLength(4)
  })
})
