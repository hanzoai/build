import { afterEach, describe, expect, it, vi } from 'vitest'

import { LANGUAGES, spoken } from './voice.ts'

afterEach(() => vi.unstubAllGlobals())

describe('the language dictation listens in', () => {
  it('is this browser’s, when dictation offers it', () => {
    vi.stubGlobal('navigator', { language: 'fr-CA' })
    expect(spoken()).toBe('fr')
    vi.stubGlobal('navigator', { language: 'ja' })
    expect(spoken()).toBe('ja')
  })

  it('is English for a language it does not offer, and where there is no browser', () => {
    vi.stubGlobal('navigator', { language: 'pt-BR' })
    expect(spoken()).toBe('en')
    vi.stubGlobal('navigator', undefined)
    expect(spoken()).toBe('en')
  })

  it('offers each language once, by its own name', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['en', 'es', 'fr', 'de', 'ja', 'zh'])
    expect(LANGUAGES.find((l) => l.id === 'de')?.label).toBe('Deutsch')
  })
})
