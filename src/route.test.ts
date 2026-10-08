import { describe, expect, it } from 'vitest'

import { path, route } from './route.ts'

const ID = 'sess_0992f90537264a6b154ebff799f38e1c'
const FLOW = 'flow_c2b111c12ea23f05f55b3d973dbeb267'

describe('route', () => {
  it.each([
    ['', { kind: 'new' }],
    ['/', { kind: 'new' }],
    [ID, { kind: 'run', id: ID }],
    [`/${ID}/`, { kind: 'run', id: ID }],
    ['-/artifacts', { kind: 'screen', screen: 'artifacts' }],
    ['-/templates', { kind: 'screen', screen: 'templates' }],
    ['-/projects', { kind: 'screen', screen: 'projects' }],
    ['-/issues', { kind: 'screen', screen: 'issues' }],
    ['-/automations', { kind: 'screen', screen: 'automations' }],
    [`-/automations/${FLOW}`, { kind: 'automation', id: FLOW }],
    ['-/automations/new', { kind: 'automation', id: 'new' }],
    ['-/sync', { kind: 'screen', screen: 'sync' }],
    ['-/mcp', { kind: 'screen', screen: 'mcp' }],
    ['-/settings', { kind: 'settings', section: 'general' }],
    ['-/settings/account', { kind: 'settings', section: 'account' }],
    ['-/customize', { kind: 'customize', tab: 'skills' }],
    ['-/customize/connectors', { kind: 'customize', tab: 'connectors' }],
    ['-/plans', { kind: 'screen', screen: 'plans' }],
    ['-/settings/environments/', { kind: 'settings', section: 'environments' }],
    ['mega-shop', { kind: 'project', slug: 'mega-shop' }],
    ['artifacts', { kind: 'project', slug: 'artifacts' }],
    ['hanzo/circle', { kind: 'repo', org: 'hanzo', name: 'circle' }],
    ['/acme/Shop.web_2/', { kind: 'repo', org: 'acme', name: 'Shop.web_2' }],
  ])('%s', (p, r) => expect(route(p)).toEqual(r))

  it.each(['sess_nothex', 'Mega-Shop', '-/elsewhere', '-/settings/elsewhere', '-/settings/skills', '-/customize/elsewhere', '-/automations/flow_nothex', '-/automations/../x', '-leading', '-/codebases', 'a/b/c', 'a/-b', '.a/b', 'a//b', 'x'.repeat(41), `a/${'x'.repeat(65)}`, '../etc', 'javascript:alert(1)', 'https://evil.example'])(
    'reads %s as the empty state',
    (p) => expect(route(p)).toEqual({ kind: 'new' }),
  )

  it('inverts', () => {
    for (const p of ['', ID, '-/artifacts', '-/projects', '-/issues', '-/automations', `-/automations/${FLOW}`, '-/automations/new', '-/sync', '-/mcp', '-/settings', '-/settings/machines', '-/customize', '-/customize/plugins', '-/plans', 'mega-shop', 'hanzo/circle']) expect(path(route(p))).toBe(p)
  })
})
