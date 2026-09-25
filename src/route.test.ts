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
    ['-/codebases', { kind: 'screen', screen: 'codebases' }],
    ['-/projects', { kind: 'screen', screen: 'projects' }],
    ['-/issues', { kind: 'screen', screen: 'issues' }],
    ['-/automations', { kind: 'screen', screen: 'automations' }],
    ['-/sync', { kind: 'screen', screen: 'sync' }],
    ['mega-shop', { kind: 'project', slug: 'mega-shop' }],
    ['artifacts', { kind: 'project', slug: 'artifacts' }],
  ])('%s', (p, r) => expect(route(p)).toEqual(r))

  it.each(['sess_nothex', 'Mega-Shop', '-/elsewhere', '-leading', 'a/b', 'x'.repeat(41), '../etc', 'javascript:alert(1)', 'https://evil.example'])(
    'reads %s as the empty state',
    (p) => expect(route(p)).toEqual({ kind: 'new' }),
  )

  it('inverts', () => {
    for (const p of ['', ID, '-/artifacts', '-/codebases', '-/projects', '-/issues', '-/automations', '-/sync', 'mega-shop']) expect(path(route(p))).toBe(p)
  })
})
