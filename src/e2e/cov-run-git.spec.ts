/**
 * What a run pushed and what it holds, on a stubbed platform (cov-run.ts): the
 * Git tab's diff, review and commits in every state the forge answers — nothing
 * pushed, renamed, binary and too large, reviews of each kind — read again while
 * the run works; and the Files tab's live sandbox, its branch and what the run
 * produced.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { BOX, finished, hold, PR, rig, SESSION, to } from './cov-run.ts'

const desk = (p: Page) => p.getByRole('complementary', { name: 'Run details' })
const tab = (p: Page, name: string) => desk(p).getByRole('button', { name, exact: true }).first()
const CHANGES = `/v1/agent/coding/${SESSION}/changes`
const b64 = (s: string) => Buffer.from(s).toString('base64')

const pushed = {
  repo: 'hanzoai/universe',
  base: 'main',
  head: 'agent/ab12',
  commits: [
    { sha: 'a1b2c3d4e5f6', message: 'Add the widget', author: 'Hanzo Dev', date: '2026-09-27T10:05:00Z' },
    { sha: 'b2c3d4e5f6a7', message: 'Tidy', author: 'Hanzo Dev', date: 'not a date' },
    { sha: 'c3d4e5f6a7b8', message: 'Anonymous', author: '', date: '2026-09-27T11:00:00Z' },
  ],
  files: [
    { path: 'widget.go', status: 'added', additions: 3, deletions: 0, patch: '@@ -0,0 +1,3 @@\n+package widget\n\n-old line' },
    { path: 'new.go', from: 'old.go', status: 'renamed', additions: 0, deletions: 0, patch: '' },
    { path: 'logo.png', status: 'modified', additions: 0, deletions: 0, patch: '' },
    { path: 'huge.json', status: 'modified', additions: 900, deletions: 900, patch: '', truncated: true },
    { path: 'big.go', status: 'deleted', additions: 0, deletions: 400, patch: '@@ -1,400 +0,0 @@\n-a', truncated: true },
  ],
  pull: {
    number: 7,
    url: PR,
    title: 'Add the widget',
    state: 'open',
    mergeable: false,
    reviews: [
      { author: 'z', state: 'APPROVED', body: 'ship it', at: '2026-09-27T11:00:00Z' },
      { author: '', state: 'REQUEST_CHANGES', body: '', at: '' },
      { author: 'a', state: 'COMMENT', body: 'nit', at: 'not a date' },
      { author: 'b', state: 'DISMISSED', body: '', at: '' },
      { author: 'c', state: '', body: '', at: '' },
    ],
  },
}

test('the diff opens each file onto its change, or says why it cannot', async ({ page: p }, info) => {
  await rig(p, { changes: pushed })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('agent/ab12 → main · 5 files +903 −1300')).toBeVisible()
  const show = (path: string) => desk(p).getByRole('button', { name: `Show ${path}` })
  await show('widget.go').click()
  for (const line of ['@@ -0,0 +1,3 @@', '+package widget', '-old line']) await expect(desk(p).getByText(line, { exact: true })).toBeVisible()
  await desk(p).getByRole('button', { name: 'Hide widget.go' }).click()
  await expect(desk(p).getByText('+package widget')).toHaveCount(0)
  await expect(show('new.go').getByText('old.go → new.go')).toBeVisible()
  await expect(show('new.go').getByText('R', { exact: true })).toBeVisible()
  await show('logo.png').click()
  await expect(desk(p).getByText('Binary file')).toBeVisible()
  await show('huge.json').click()
  await expect(desk(p).getByText('Too large to show here.')).toBeVisible()
  await show('big.go').click()
  await expect(show('big.go').getByText('D', { exact: true })).toHaveCount(0)
  await expect(desk(p).getByText('The rest of this file’s change is too large to show here.')).toBeVisible()
  await p.screenshot({ path: info.outputPath('diff.png') })
})

test('the review says where the pull request stands and what each reviewer said', async ({ page: p }, info) => {
  await rig(p, { changes: pushed })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await tab(p, 'Review').click()
  await expect(desk(p).getByText('#7 Add the widget')).toBeVisible()
  await expect(desk(p).getByText('Open · conflicts with its base')).toBeVisible()
  await expect(desk(p).getByRole('link', { name: 'Open pull request #7' })).toHaveAttribute('href', PR)
  const at = new Date('2026-09-27T11:00:00Z')
  const when = await p.evaluate((iso) => new Date(iso).toLocaleString(), at.toISOString())
  await expect(desk(p).getByText(`z · approved · ${when}`)).toBeVisible()
  await expect(desk(p).getByText('ship it')).toBeVisible()
  await expect(desk(p).getByText('Someone · asked for changes', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('a · commented', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('b · dismissed', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('c · reviewed', { exact: true })).toBeVisible()
  await p.screenshot({ path: info.outputPath('review.png') })
})

test('the review reads merged, closed, ready and undecided pulls, and links only an https one', async ({ page: p }) => {
  const { world } = await rig(p, { changes: { ...pushed, pull: { ...pushed.pull, state: 'merged', reviews: [] } } })
  await p.goto(`/${SESSION}`)
  const again = async () => {
    await tab(p, 'Files').click()
    await tab(p, 'Git').click()
    await tab(p, 'Review').click()
  }
  await again()
  await expect(desk(p).getByText('Merged', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('No reviews yet')).toBeVisible()
  world.changes = { ...pushed, pull: { ...pushed.pull, state: 'closed', url: 'http://git.hanzo.ai/x' } }
  await again()
  await expect(desk(p).getByText('Closed', { exact: true })).toBeVisible()
  await expect(desk(p).getByRole('link', { name: 'Open pull request #7' })).toHaveCount(0)
  world.changes = { ...pushed, pull: { ...pushed.pull, mergeable: true } }
  await again()
  await expect(desk(p).getByText('Open · ready to merge')).toBeVisible()
  world.changes = { ...pushed, pull: { ...pushed.pull, mergeable: null } }
  await again()
  await expect(desk(p).getByText('Open', { exact: true })).toBeVisible()
})

test('the commits say who made each and when, as far as the forge says', async ({ page: p }) => {
  await rig(p, { changes: { ...pushed, files: [pushed.files[0]] } })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('agent/ab12 → main · 1 file +3 −0')).toBeVisible()
  await tab(p, 'Commits').click()
  const when = await p.evaluate(() => new Date('2026-09-27T10:05:00Z').toLocaleString())
  await expect(desk(p).getByText('a1b2c3d')).toBeVisible()
  await expect(desk(p).getByText(`Hanzo Dev · ${when}`)).toBeVisible()
  await expect(desk(p).getByText('Hanzo Dev', { exact: true })).toBeVisible()
  const late = await p.evaluate(() => new Date('2026-09-27T11:00:00Z').toLocaleString())
  await expect(desk(p).getByText(late, { exact: true })).toBeVisible()
})

test('a branch pushed with no change in it says only where it goes', async ({ page: p }) => {
  await rig(p, { changes: { ...pushed, files: [], pull: null } })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('agent/ab12 → main', { exact: true })).toBeVisible()
  await expect(desk(p).getByText('No pushed changes')).toBeVisible()
})

test('before a run pushes, each view says there is nothing yet', async ({ page: p }) => {
  await rig(p)
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('No pushed changes')).toBeVisible()
  await expect(desk(p).getByText(/ → main/)).toHaveCount(0)
  await tab(p, 'Review').click()
  await expect(desk(p).getByText('No pull request yet. The run opens one when it pushes its changes.')).toBeVisible()
  await tab(p, 'Commits').click()
  await expect(desk(p).getByText('No pushed commits')).toBeVisible()
})

test('the Git tab says it is reading, and says why the forge would not answer', async ({ page: p }) => {
  const { world } = await rig(p, {}, ({ path }) => (path === CHANGES && world.record.title === 'refused' ? { status: 502, json: { detail: 'The forge is unreachable' } } : undefined))
  const go = await hold(p, CHANGES)
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('Reading the branch…')).toBeVisible()
  go()
  await expect(desk(p).getByText('No pushed changes')).toBeVisible()
  world.record.title = 'refused'
  await expect(p.getByRole('heading', { name: 'refused' })).toBeVisible()
  await tab(p, 'Files').click()
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('The forge is unreachable')).toBeVisible()
})

test('while the run works its changes are read again every little while, and not once it has finished', async ({ page: p }) => {
  await p.clock.install()
  const { sent, world } = await rig(p, { record: { ...finished(), status: 'running' }, changes: pushed })
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(desk(p).getByText('agent/ab12 → main · 5 files +903 −1300')).toBeVisible()
  const reads = () => to(sent, 'GET', CHANGES).length
  const before = reads()
  await p.clock.runFor(15_000)
  await expect.poll(reads).toBeGreaterThan(before)
  world.record.status = 'done'
  await p.clock.runFor(2_000)
  await expect(p.getByPlaceholder('Follow up — continues in a new run')).toBeVisible()
  const settled = reads()
  await p.clock.runFor(30_000)
  await expect(p.getByPlaceholder('Follow up — continues in a new run')).toBeVisible()
  expect(reads()).toBe(settled)
})

test.describe('the Files tab', () => {
  const live = { ...finished(), status: 'running', sandbox: BOX }
  const box = {
    '': { path: '/work', dir: true, entries: ['src', 'README.md', 'logo.png', 'dump.bin', 'empty.txt', 'ghost', 7] },
    src: { path: '/work/src', dir: true, entries: ['lib'] },
    'src/lib': { path: '/work/src/lib', dir: true, entries: [] },
    'README.md': { path: '/work/README.md', data: b64('# universe\n') },
    'logo.png': { path: '/work/logo.png', data: Buffer.from([0x89, 0, 1]).toString('base64') },
    'dump.bin': { path: '/work/dump.bin', data: b64('x'.repeat((1 << 20) + 1)) },
    'empty.txt': { path: '/work/empty.txt', data: '' },
  }

  test('reads the sandbox as it is: up and down its directories, and each kind of file', async ({ page: p }, info) => {
    const { sent } = await rig(p, { record: live, box })
    await p.goto(`/${SESSION}`)
    await tab(p, 'Files').click()
    const where = (w: string) => desk(p).getByText(w, { exact: true })
    await expect(where('/work')).toBeVisible()
    await desk(p).getByRole('button', { name: 'Open src' }).click()
    await expect(where('/work/src')).toBeVisible()
    await desk(p).getByRole('button', { name: 'Open lib' }).click()
    await expect(where('/work/src/lib')).toBeVisible()
    await expect(desk(p).getByText('This directory is empty.')).toBeVisible()
    await desk(p).getByRole('button', { name: 'Up one directory' }).click()
    await expect(where('/work/src')).toBeVisible()
    await desk(p).getByRole('button', { name: 'Up one directory' }).click()
    await expect(where('/work')).toBeVisible()
    await expect(desk(p).getByRole('button', { name: 'Up one directory' })).toHaveCount(0)
    const read = async (name: string, says: string) => {
      await desk(p).getByRole('button', { name: `Open ${name}` }).click()
      await expect(where(name).last()).toBeVisible()
      await expect(desk(p).getByText(says, { exact: true })).toBeVisible()
    }
    await read('README.md', '# universe\n')
    await p.screenshot({ path: info.outputPath('live.png') })
    await read('logo.png', 'Binary file')
    await read('dump.bin', 'Too large to show')
    await read('empty.txt', 'Empty file')
    await read('ghost', 'No such path in the sandbox')
    expect(to(sent, 'POST', '/v1/sandbox/read').every((s) => (s.body as { id: string }).id === BOX)).toBe(true)
  })

  test('says it is reading the sandbox, and why the sandbox would not answer', async ({ page: p }) => {
    await rig(p, { record: live, box: {} })
    const go = await hold(p, '/v1/sandbox/read', 'POST')
    await p.goto(`/${SESSION}`)
    await tab(p, 'Files').click()
    await expect(desk(p).getByText('Reading…')).toBeVisible()
    go()
    await expect(desk(p).getByText('No such path in the sandbox')).toBeVisible()
  })

  test('reads the branch, and goes back to the sandbox, once the run has one', async ({ page: p }) => {
    const { world } = await rig(p, {
      record: { ...finished(), status: 'running' },
      box,
      tree: {
        '': [
          { name: 'docs', path: 'docs', type: 'tree' },
          { name: 'widget.go', path: 'widget.go', type: 'blob', size: 30 },
          { name: 'art.png', path: 'art.png', type: 'blob' },
          { name: 'data.csv', path: 'data.csv', type: 'blob' },
          { name: 'blank.txt', path: 'blank.txt', type: 'blob' },
          { name: 'lost.go', path: 'lost.go', type: 'blob' },
        ],
        docs: [{ name: 'api', path: 'docs/api', type: 'tree' }],
        'docs/api': [],
      },
      blob: {
        'widget.go': { path: 'widget.go', content: 'package widget' },
        'art.png': { path: 'art.png', binary: true },
        'data.csv': { path: 'data.csv', truncated: true },
        'blank.txt': { path: 'blank.txt', content: '' },
      },
    })
    await p.goto(`/${SESSION}`)
    await tab(p, 'Files').click()
    // No sandbox yet: the branch, with no choice of where to read.
    await expect(desk(p).getByText('hanzoai/universe@agent/ab12', { exact: true })).toBeVisible()
    await expect(desk(p).getByRole('button', { name: 'Live', exact: true })).toHaveCount(0)
    await desk(p).getByRole('button', { name: 'Open docs' }).click()
    await expect(desk(p).getByText('hanzoai/universe@agent/ab12/docs', { exact: true })).toBeVisible()
    await desk(p).getByRole('button', { name: 'Open api' }).click()
    await expect(desk(p).getByText('hanzoai/universe@agent/ab12/docs/api', { exact: true })).toBeVisible()
    await expect(desk(p).getByText('This directory is empty.')).toBeVisible()
    await desk(p).getByRole('button', { name: 'Up one directory' }).click()
    await expect(desk(p).getByText('hanzoai/universe@agent/ab12/docs', { exact: true })).toBeVisible()
    await desk(p).getByRole('button', { name: 'Up one directory' }).click()
    for (const [name, says] of [
      ['widget.go', 'package widget'],
      ['art.png', 'Binary file'],
      ['data.csv', 'Too large to show'],
      ['blank.txt', 'Empty file'],
      ['lost.go', 'No such file on the branch'],
    ]) {
      await desk(p).getByRole('button', { name: `Read ${name}` }).click()
      await expect(desk(p).getByText(says, { exact: true })).toBeVisible()
    }
    world.record.sandbox = BOX
    await expect(desk(p).getByRole('button', { name: 'Live', exact: true })).toBeVisible()
    await desk(p).getByRole('button', { name: 'Live', exact: true }).click()
    await expect(desk(p).getByText('/work', { exact: true })).toBeVisible()
    await desk(p).getByRole('button', { name: 'Branch', exact: true }).click()
    await expect(desk(p).getByText('hanzoai/universe@agent/ab12', { exact: true })).toBeVisible()
  })

  test('says it is reading the branch, why the forge would not answer, and names a branchless run by its repository', async ({ page: p }) => {
    await rig(p, { record: { ...finished(), branch: '' } }, ({ path }) => (path.endsWith('/tree') ? { status: 502, json: { detail: 'The forge is unreachable' } } : undefined))
    const go = await hold(p, `/v1/agent/coding/${SESSION}/tree`)
    await p.goto(`/${SESSION}`)
    await tab(p, 'Files').click()
    await expect(desk(p).getByText('hanzoai/universe', { exact: true })).toBeVisible()
    await expect(desk(p).getByText('Reading…')).toBeVisible()
    go()
    await expect(desk(p).getByText('The forge is unreachable')).toBeVisible()
  })

  test('lists what the run produced, each where it leads', async ({ page: p }, info) => {
    await rig(p, { record: { ...finished(), pr: PR, project: 'widgets', mode: 'setup' } })
    await p.goto(`/${SESSION}`)
    await tab(p, 'Files').click()
    await desk(p).getByRole('button', { name: 'Artifacts', exact: true }).click()
    await expect(desk(p).getByRole('link', { name: 'Pull request #7' })).toHaveAttribute('href', PR)
    await expect(desk(p).getByText('The branch this run pushes to in hanzoai/universe')).toBeVisible()
    await p.screenshot({ path: info.outputPath('artifacts.png') })
    await desk(p).getByRole('button', { name: 'Environment proposal' }).click()
    await expect(desk(p).getByText('This run', { exact: true })).toBeVisible()
    await tab(p, 'Files').click()
    await desk(p).getByRole('button', { name: 'Artifacts', exact: true }).click()
    await desk(p).getByRole('button', { name: 'widgets' }).click()
    await expect(p).toHaveURL(/\/widgets$/)
  })

  test('says when a run produced nothing, and names a branch with no repository plainly', async ({ page: p }) => {
    const { world } = await rig(p, { record: { ...finished(), branch: '' } })
    await p.goto(`/${SESSION}`)
    await tab(p, 'Files').click()
    await desk(p).getByRole('button', { name: 'Artifacts', exact: true }).click()
    await expect(desk(p).getByText('This run has produced no artifacts yet.')).toBeVisible()
    world.record = { ...world.record, repo: '', branch: 'agent/ab12' }
    await expect(desk(p).getByText('The branch this run pushes to', { exact: true })).toBeVisible()
    // Files, beside Artifacts, goes back to the run's files.
    await desk(p).getByRole('button', { name: 'Files', exact: true }).nth(1).click()
    await expect(desk(p).getByText('This directory is empty.')).toBeVisible()
  })
})
