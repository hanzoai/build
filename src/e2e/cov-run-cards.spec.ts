/**
 * A run's transcript, card by card, on a stubbed platform (cov-run.ts), drawn
 * from the agent's own narration: its reasoning folded, a command's output and
 * the tail of a long one, a command declined, edits of one file, of several, of
 * none named and one that failed, its plan as a checklist, a step with no output,
 * and a command still going — cut off once the run ends. Raw log never shows.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { ev, finished, rig, SESSION } from './cov-run.ts'

const transcript = (p: Page) => p.getByLabel('Transcript')

/** One item of the agent's narration, as it finished or as it stands. */
const item = (id: string, it: Record<string, unknown>, type = 'item.completed') => ev('event', { type, item: { id, ...it } })

const run = [
  ev('tool-call', { step: 'lease', message: 'leasing a dev sandbox', status: 'ok' }),
  ev('tool-call', { step: 'clone', message: 'cloning the codebase', status: 'running' }),
  ev('log', { message: 'Cloning into universe…\n' }),
  ev('tool-call', { step: 'exit', message: 'exit 0' }),
  ev('message', { role: 'user', text: 'Fix the build' }),
  item('r0', { type: 'reasoning', text: '**Reading the build**\nThe build fails on a.ts.' }),
  item('m0', { type: 'agent_message', text: 'Looking at the build.' }),
  item('c0', { type: 'command_execution', command: 'go build', aggregated_output: `${'x'.repeat(7000)}THE END`, exit_code: 1, status: 'failed' }),
  item('c1', { type: 'command_execution', command: 'rm -rf dist', aggregated_output: '', status: 'declined' }),
  item('f0', { type: 'file_change', changes: [{ path: '/work/a.ts', kind: 'update' }], status: 'completed' }),
  item('f1', { type: 'file_change', changes: [{ path: 'a.ts', kind: 'update' }, { path: 'b.ts', kind: 'add' }], status: 'completed' }),
  item('f2', { type: 'file_change', changes: [], status: 'completed' }),
  item('f3', { type: 'file_change', changes: [{ path: '/work/gone.ts', kind: 'delete' }], status: 'failed' }),
  item('t0', { type: 'todo_list', items: [{ text: 'Read the build', completed: true }, { text: 'Fix it', completed: false }] }, 'item.started'),
  item('c2', { type: 'command_execution', command: 'go test ./...', aggregated_output: '', status: 'in_progress' }, 'item.started'),
  ev('log', { message: 'raw stderr the agent printed\n' }),
]

test('each card draws what it is, and a command the run never finished is cut off', async ({ page: p }, info) => {
  await rig(p, { events: run })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  await expect(t.locator('[data-role="user"]')).toHaveText('Fix the build')
  const thought = t.getByLabel('Thought')
  await expect(thought.getByText('Reading the build')).toBeVisible()
  await thought.getByText('Thought', { exact: true }).click()
  await expect(thought.getByText('The build fails on a.ts.')).toBeVisible()
  const build = t.getByLabel('Command go build')
  await expect(build).toHaveAttribute('data-status', 'error')
  await build.getByText('go build').click()
  // A long output shows its last six thousand characters.
  const output = build.getByText(/^\$ go build\s…x+THE END$/)
  await expect(output).toBeVisible()
  expect((await output.textContent())!.length).toBe('$ go build\n…'.length + 6000)
  await expect(t.getByLabel('Command rm -rf dist')).toHaveAttribute('data-status', 'cancelled')
  await expect(t.getByLabel('Command go test ./...')).toHaveAttribute('data-status', 'cancelled')
  const plan = t.getByLabel('Plan checklist')
  await expect(plan.getByText('✓')).toHaveCount(1)
  await expect(plan.getByText('Fix it')).toBeVisible()
  await expect(t.getByText('raw stderr the agent printed')).toHaveCount(0)
  await expect(t.getByText('Cloning into universe…')).toHaveCount(0)
  await p.screenshot({ path: info.outputPath('cards.png'), fullPage: true })
})

test('an edit names its file, its files, or says the agent named none', async ({ page: p }) => {
  await rig(p, { events: run })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  const one = t.getByLabel('Edited a.ts', { exact: true })
  await expect(one.getByText('Edited', { exact: true })).toBeVisible()
  await one.getByText('Edited', { exact: true }).click()
  await expect(one.getByText(/The diff is in the run’s Git tab/)).toBeVisible()
  const two = t.getByLabel('Edited a.ts, b.ts')
  await expect(two.getByText('Edited 2 files')).toBeVisible()
  const none = t.getByLabel('Edited files', { exact: true })
  await none.getByText('Edited files').click()
  await expect(none.getByText('The agent named no files.')).toBeVisible()
  await expect(t.getByLabel('Edited gone.ts')).toHaveAttribute('data-status', 'error')
})

test('a step with no output does not open', async ({ page: p }) => {
  await rig(p, { events: run })
  await p.goto(`/${SESSION}`)
  const t = transcript(p)
  await expect(t.getByLabel('Sandbox leasing a dev sandbox').locator('svg')).toHaveCount(1)
  await expect(t.getByLabel('Clone cloning the codebase').locator('svg')).toHaveCount(1)
})

test('while the run works, a command still going is shown going', async ({ page: p }) => {
  await rig(p, { record: { ...finished(), status: 'running' }, events: run })
  await p.goto(`/${SESSION}`)
  await expect(transcript(p).getByLabel('Command go test ./...')).toHaveAttribute('data-status', 'running')
})
