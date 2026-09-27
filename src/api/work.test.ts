/**
 * Projects and issues as the forge answers them: the boards, one board's issues
 * or every board's, in whichever envelope the list arrives, with thin rows
 * filled and rows with nothing to show dropped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Target } from './call.ts'
import { board, boards, issues, work } from './work.ts'

const T: Target = { api: 'https://api.hanzo.ai', token: () => 'tok', org: 'hanzo' }

function answer(body: unknown) {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  return urls
}

afterEach(() => vi.unstubAllGlobals())

describe('boards', () => {
  it('reads a bare list, names a board by its key when it has no name, and drops one with no key', async () => {
    const urls = answer([{ key: 'WEB' }, { key: 'API', id: 'p2', name: 'The API', description: 'Endpoints' }, { name: 'no key' }, null])
    expect(await boards(T)).toEqual([
      { id: 'WEB', key: 'WEB', name: 'WEB', description: '' },
      { id: 'p2', key: 'API', name: 'The API', description: 'Endpoints' },
    ])
    expect(urls).toEqual(['https://api.hanzo.ai/v1/task/projects'])
  })

  it('reads a list in a data envelope, and anything else as none', async () => {
    answer({ data: [{ key: 'WEB' }] })
    expect((await boards(T)).map((b) => b.key)).toEqual(['WEB'])
    answer({ data: 'nope' })
    expect(await boards(T)).toEqual([])
    expect(board('x')).toBeNull()
  })
})

describe('issues', () => {
  it('reads every board’s issues from the board, filling what a row leaves out', async () => {
    const urls = answer({ issues: [{ title: 'Fix it', projectKey: 'WEB', number: 4 }, { projectKey: 'API', number: 'x' }, { title: 'Loose' }, { number: 9 }] })
    expect(await issues(T)).toEqual([
      { id: 'WEB#4', identifier: 'WEB#4', project: 'WEB', number: 4, kind: 'issue', title: 'Fix it', status: 'backlog', priority: 'none', assignee: '', repo: '' },
      { id: 'API#0', identifier: '', project: 'API', number: 0, kind: 'issue', title: 'Untitled', status: 'backlog', priority: 'none', assignee: '', repo: '' },
      { id: '#0', identifier: '', project: '', number: 0, kind: 'issue', title: 'Loose', status: 'backlog', priority: 'none', assignee: '', repo: '' },
    ])
    expect(urls).toEqual(['https://api.hanzo.ai/v1/task/board'])
  })

  it('reads one board’s issues at its own address, keeping what each row says', async () => {
    const row = { id: 'i1', identifier: 'WEB-1', projectKey: 'WEB', number: 1, kind: 'bug', title: 'Crash', status: 'todo', priority: 'high', assignee: 'z', repo: 'site' }
    const urls = answer({ data: [row] })
    expect(await issues(T, 'W B')).toEqual([{ id: 'i1', identifier: 'WEB-1', project: 'WEB', number: 1, kind: 'bug', title: 'Crash', status: 'todo', priority: 'high', assignee: 'z', repo: 'site' }])
    expect(urls).toEqual(['https://api.hanzo.ai/v1/task/projects/W%20B/issues'])
    expect(work(undefined)).toBeNull()
  })
})
