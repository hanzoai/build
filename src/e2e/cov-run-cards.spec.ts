/**
 * A run's transcript, card by card, on a stubbed platform (cov-run.ts): reads
 * gathered into one row of chips, a command's output and the tail of a long
 * one, edits of one file, of several, and of none the harness named, a step with
 * and without output, and a command still going — cut off once the run ends.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { ev, finished, rig, SESSION } from './cov-run.ts'

const transcript = (p: Page) => p.getByLabel('Transcript')

/** What `dev exec` printed: reads, commands, three patches and a command it never finished. */
const OUT = [
  'user',
  'Fix the build',
  'codex',
  'Looking at the build.',
  'exec',
  `bash -lc 'cat src/a.ts' in /w`,
  ' succeeded in 1ms:',
  'exec',
  `bash -lc 'cat src/b.ts' in /w`,
  ' succeeded in 1ms:',
  'exec',
  `bash -lc 'go build' in /w`,
  ' exited 1 in 2s:',
  `${'x'.repeat(7000)}THE END`,
  'exec',
  `bash -lc 'rm -rf dist' in /w`,
  ' declined:',
  'exec',
  `bash -lc 'cat src/c.ts' in /w`,
  ' succeeded in 1ms:',
  'apply patch',
  'patch: completed',
  '/w/a.ts',
  'diff --git a/a.ts b/a.ts',
  '@@ -1 +1 @@',
  '-a',
  '+b',
  'apply patch',
  'patch: completed',
  'a.ts',
  'b.ts',
  'diff --git a/a.ts b/a.ts',
  '@@ -1 +1 @@',
  '-a',
  '+b',
  'diff --git a/b.ts b/b.ts',
  '@@ -0,0 +1 @@',
  '+c',
  'patch: completed',
  'patch: failed',
  '/w/gone.ts',
  'exec',
  `bash -lc 'go test ./...' in /w`,
  '',
].join('\n')

const run = [
  ev('tool-call', { step: 'lease', message: 'leasing a dev sandbox', status: 'ok' }),
  ev('tool-call', { step: 'clone', message: 'cloning the codebase', status: 'running' }),
  ev('log', { message: 'Cloning into universe…\n' }),
  ev('tool-call', { step: 'exit', message: 'exit 0' }),
  ev('tool-call', { message: 'running the task', status: 'running' }),
  ev('log', { message: OUT }),
]

test('each card draws what it is, and a command the run never finished is cut off', async ({ page: p }, info) => {
  await rig(p, { events: run })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  await expect(t.locator('[data-role="user"]')).toHaveText('Fix the build')
  // Two reads in a row are one row of chips; a read after a command starts a row of its own.
  const chips = t.getByLabel(/^Read src\//)
  await expect(chips).toHaveCount(3)
  const [a, b, c] = [await chips.nth(0).boundingBox(), await chips.nth(1).boundingBox(), await chips.nth(2).boundingBox()]
  expect(a!.y).toBe(b!.y)
  expect(c!.y).toBeGreaterThan(a!.y)
  const build = t.getByLabel('Command go build')
  await expect(build).toHaveAttribute('data-status', 'error')
  await build.getByText('go build').click()
  // A long output shows its last six thousand characters.
  const output = build.getByText(/^\$ go build\s…x+THE END$/)
  await expect(output).toBeVisible()
  expect((await output.textContent())!.length).toBe('$ go build\n…'.length + 6000)
  await expect(t.getByLabel('Command rm -rf dist')).toHaveAttribute('data-status', 'cancelled')
  await t.getByLabel('Command rm -rf dist').getByText('rm -rf dist').click()
  await expect(t.getByLabel('Command rm -rf dist').getByText('$ rm -rf dist', { exact: true })).toBeVisible()
  await expect(t.getByLabel('Command go test ./...')).toHaveAttribute('data-status', 'cancelled')
  await p.screenshot({ path: info.outputPath('cards.png'), fullPage: true })
})

test('an edit names its file, its files, or says the harness named none', async ({ page: p }) => {
  await rig(p, { events: run })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  const one = t.getByLabel('Edited a.ts', { exact: true })
  await expect(one.getByText('Edited', { exact: true })).toBeVisible()
  await one.getByText('Edited', { exact: true }).click()
  await expect(one.getByText('+b')).toBeVisible()
  const two = t.getByLabel('Edited a.ts, b.ts')
  await expect(two.getByText('Edited 2 files')).toBeVisible()
  await two.getByText('Edited 2 files').click()
  await expect(two.getByText('+c')).toBeVisible()
  await expect(two.getByText('b.ts', { exact: true }).last()).toBeVisible()
  const none = t.getByLabel('Edited files', { exact: true })
  await none.getByText('Edited files').click()
  await expect(none.getByText('The harness named no files.')).toBeVisible()
  const gone = t.getByLabel('Edited gone.ts')
  await expect(gone).toHaveAttribute('data-status', 'error')
  await gone.getByText('Edited', { exact: true }).click()
  await expect(gone.getByText('gone.ts', { exact: true }).last()).toBeVisible()
})

test('a step opens onto its output, and one with none does not open', async ({ page: p }) => {
  await rig(p, { events: run })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  const clone = t.getByLabel('Clone cloning the codebase')
  await clone.getByText('Clone', { exact: true }).click()
  await expect(clone.getByText('Cloning into universe…')).toBeVisible()
  await expect(t.getByLabel('Sandbox leasing a dev sandbox').locator('svg')).toHaveCount(1)
})

test('while the run works, a command still going is shown going', async ({ page: p }) => {
  await rig(p, { record: { ...finished(), status: 'running' }, events: run })
  await p.goto(`/${SESSION}`)
  await expect(transcript(p).getByLabel('Command go test ./...')).toHaveAttribute('data-status', 'running')
})
