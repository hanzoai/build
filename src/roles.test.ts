import { describe, expect, it } from 'vitest'

import type { Catalogue } from './api/skills.ts'
import { MOST, RECOMMENDED, recommend, WORK } from './roles.ts'

const every = (names: readonly string[]): Catalogue => ({
  skills: names.map((name) => ({ name, description: `What ${name} does`, product: name.split('_')[0]! })),
  products: [],
})

describe('the skills a work recommends', () => {
  it('names a list for every work the account offers, and none for "something else"', () => {
    for (const w of WORK) expect(w.id in RECOMMENDED, w.id).toBe(w.id !== 'other')
    expect(Object.keys(RECOMMENDED).every((id) => WORK.some((w) => w.id === id))).toBe(true)
  })

  it('keeps each list within what one click can sensibly add, and free of repeats', () => {
    for (const [id, names] of Object.entries(RECOMMENDED)) {
      expect(names.length, id).toBeLessThanOrEqual(MOST)
      expect(new Set(names).size, id).toBe(names.length)
    }
  })

  it('offers the catalogue entries of the work, in the order the list gives them', () => {
    const all = every(Object.values(RECOMMENDED).flat())
    expect(recommend('marketing', all).map((e) => e.name)).toEqual([...RECOMMENDED.marketing!])
    expect(recommend('marketing', all)[0]).toMatchObject({ description: 'What marketing_summary does', product: 'marketing' })
  })

  it('leaves out a skill the catalogue no longer serves, rather than offering what cannot be added', () => {
    const all = every(RECOMMENDED.education!.filter((n) => n !== 'knowledge_graph'))
    const names = recommend('education', all).map((e) => e.name)
    expect(names).not.toContain('knowledge_graph')
    expect(names).toEqual(RECOMMENDED.education!.filter((n) => n !== 'knowledge_graph'))
  })

  it('offers nothing for no work, an unknown one, "something else", or before the catalogue is read', () => {
    const all = every(Object.values(RECOMMENDED).flat())
    expect(recommend(undefined, all)).toEqual([])
    expect(recommend('', all)).toEqual([])
    expect(recommend('astronaut', all)).toEqual([])
    expect(recommend('other', all)).toEqual([])
    expect(recommend('marketing', null)).toEqual([])
  })
})
