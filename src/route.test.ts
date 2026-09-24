import { describe, expect, it } from 'vitest'

import { path, route } from './route.ts'

const ID = 'sess_0992f90537264a6b154ebff799f38e1c'

describe('route', () => {
  it.each([
    ['', { kind: 'new' }],
    ['/', { kind: 'new' }],
    [ID, { kind: 'run', id: ID }],
    [`/${ID}/`, { kind: 'run', id: ID }],
    ['-/artifacts', { kind: 'screen', screen: 'artifacts' }],
    ['-/templates', { kind: 'screen', screen: 'templates' }],
    ['mega-shop', { kind: 'project', slug: 'mega-shop' }],
    ['artifacts', { kind: 'project', slug: 'artifacts' }],
  ])('%s', (p, r) => expect(route(p)).toEqual(r))

  it.each(['sess_nothex', 'Mega-Shop', '-/elsewhere', '-leading', 'a/b', 'x'.repeat(41), '../etc', 'javascript:alert(1)', 'https://evil.example'])(
    'reads %s as the empty state',
    (p) => expect(route(p)).toEqual({ kind: 'new' }),
  )

  it('inverts', () => {
    for (const p of ['', ID, '-/artifacts', 'mega-shop']) expect(path(route(p))).toBe(p)
  })
})
