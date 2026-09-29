/**
 * A live run's side pane, signed in against a stubbed platform (stubs.ts): its
 * desktop and shell framed from the sandbox's own pages, what it pushed, its
 * files live and on the branch, and what it produced.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { SESSION } from './signed.ts'
import { BOX, run as platform } from './stubs.ts'

const desk = (p: Page) => p.getByRole('complementary', { name: 'Run details' })
const tab = (p: Page, name: string) => desk(p).getByRole('button', { name, exact: true }).first()

test('the Desktop tab frames the run’s screen', async ({ page: p }, info) => {
  await platform(p)
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(p.frameLocator('iframe[title="The run’s desktop"]').getByText('the desktop')).toBeVisible()
  await expect(p.getByText('Connecting to the desktop…')).toHaveCount(0)
  await p.screenshot({ path: info.outputPath('desktop.png') })
})

test('the Terminal tab opens a shell that reattaches by the run’s name, and keeps the agent’s log', async ({ page: p }, info) => {
  await platform(p)
  await p.goto(`/${SESSION}`)
  await tab(p, 'Terminal').click()
  const shell = p.frameLocator('iframe[title="The run’s terminal"]')
  await expect(shell.getByText(/the shell \?ticket=t&arg=run-aaaaaaaaaaaa/)).toBeVisible()
  await desk(p).getByRole('button', { name: 'Agent log' }).click()
  await expect(desk(p).getByText('ok  widgets 0.2s')).toBeVisible()
  await p.screenshot({ path: info.outputPath('terminal-log.png') })
})

test('the Git tab shows the diff, the review and the commits', async ({ page: p }, info) => {
  await platform(p)
  await p.goto(`/${SESSION}`)
  await tab(p, 'Git').click()
  await expect(p.getByText('agent/ab12 → main · 1 file +2 −0')).toBeVisible()
  await p.getByRole('button', { name: 'Show widget.go' }).click()
  await expect(p.getByText('+package widget')).toBeVisible()
  await p.screenshot({ path: info.outputPath('git-diff.png') })
  await p.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(p.getByText('#7 Add the widget')).toBeVisible()
  await expect(p.getByText('Open · ready to merge')).toBeVisible()
  await expect(p.getByText(/z · approved/)).toBeVisible()
  await p.getByRole('button', { name: 'Commits', exact: true }).click()
  await expect(p.getByText('a1b2c3d')).toBeVisible()
})

test('the Files tab reads the sandbox live and the branch, and lists the artifacts', async ({ page: p }, info) => {
  const sent = await platform(p)
  await p.goto(`/${SESSION}`)
  await tab(p, 'Files').click()
  await expect(p.getByText('/work', { exact: true })).toBeVisible()
  await p.getByRole('button', { name: 'Open src' }).click()
  await expect(p.getByText('/work/src', { exact: true })).toBeVisible()
  await p.getByRole('button', { name: 'Open main.go' }).click()
  await expect(p.getByText('# src/main.go')).toBeVisible()
  expect(sent.some((s) => s.path === '/v1/sandbox/read' && (s.body as { id?: string }).id === BOX)).toBe(true)
  await p.getByRole('button', { name: 'Branch', exact: true }).click()
  await expect(p.getByRole('button', { name: 'Read widget.go' })).toBeVisible()
  await desk(p).getByRole('button', { name: 'Artifacts', exact: true }).click()
  await expect(desk(p).getByRole('button', { name: 'widget.go' })).toBeVisible()
  await expect(desk(p).getByRole('button', { name: 'changes.patch' })).toBeVisible()
  await expect(p.getByText('Pull request #7')).toBeVisible()
  await expect(p.getByText('agent/ab12', { exact: true })).toBeVisible()
  await expect(p.getByText('widgets', { exact: true })).toBeVisible()
  await p.screenshot({ path: info.outputPath('artifacts.png') })
})

test('a finished run keeps its sandbox suspended, and its terminal keeps the agent’s log', async ({ page: p }) => {
  await platform(p, 'done')
  await p.goto(`/${SESSION}`)
  await expect(desk(p).getByLabel('Sandbox').getByText(/Sandbox suspended · its files are kept until/)).toBeVisible()
  await expect(desk(p).getByRole('button', { name: 'Resume' })).toBeVisible()
  await tab(p, 'Terminal').click()
  await expect(desk(p).getByRole('button', { name: 'Shell' })).toHaveCount(0)
  await expect(desk(p).getByText('ok  widgets 0.2s')).toBeVisible()
})
