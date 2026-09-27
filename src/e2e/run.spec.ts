/**
 * A live run's side pane, signed in against a stubbed platform (signed.ts): its
 * desktop and shell framed from the sandbox's own pages, what it pushed, its
 * files live and on the branch, and what it produced.
 */
import { expect, test, type Page } from '@playwright/test'

import { SESSION, signIn } from './signed.ts'

const BOX = `m_${'b'.repeat(24)}`
const PR = 'https://git.hanzo.ai/hanzoai/universe/pulls/7'

/** What cloud's own pages do once their socket is up: tell the window that frames them. */
const page = (source: string, says: string) =>
  `<!doctype html><html><body style="margin:0;background:#101820;color:#fff;font:14px sans-serif"><p>${says}</p>` +
  `<script>parent.postMessage({ source: '${source}', ready: true }, '*')</script></body></html>`

function platform(p: Page, status = 'running') {
  return signIn(p, ({ method, path, query, body }) => {
    if (path === `/v1/agent/sessions/${SESSION}`) {
      return {
        json: {
          id: SESSION,
          title: 'universe: Add the widget',
          status,
          kind: 'coding',
          repo: 'hanzoai/universe',
          base: 'main',
          branch: 'agent/ab12',
          environment: 'sandbox',
          mode: 'build',
          project: 'widgets',
          sandbox: BOX,
          pr: PR,
          createdAt: '2026-09-27T10:00:00Z',
          recentEvents: [
            { id: 'e1', sessionId: SESSION, seq: 1, kind: 'tool-call', payload: { step: 'install', message: 'pnpm install', status: 'running' } },
            { id: 'e2', sessionId: SESSION, seq: 2, kind: 'log', payload: { message: 'go test ./...\nok  widgets 0.2s' } },
          ],
        },
      }
    }
    if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
    if (path === `/v1/sandbox/${BOX}/screen/ticket`) return { status: 201, json: { ticket: 's', expiresIn: 30, url: `/v1/sandbox/${BOX}/screen?ticket=s` } }
    if (path === `/v1/sandbox/${BOX}/terminal/ticket`) return { status: 201, json: { ticket: 't', expiresIn: 30, url: `/v1/sandbox/${BOX}/terminal?ticket=t` } }
    if (path === `/v1/sandbox/${BOX}/screen`) return { text: page('hanzo-screen', 'the desktop'), type: 'text/html' }
    if (path === `/v1/sandbox/${BOX}/terminal`) return { text: page('hanzo-term', `the shell ${query}`), type: 'text/html' }
    if (path === '/v1/sandbox/read' && method === 'POST') {
      const at = (body as { path?: string }).path ?? ''
      if (at === '') return { json: { path: '/work', dir: true, entries: ['src', 'README.md'] } }
      if (at === 'src') return { json: { path: '/work/src', dir: true, entries: ['main.go'] } }
      return { json: { path: `/work/${at}`, data: Buffer.from(`# ${at}\n`).toString('base64') } }
    }
    if (path === `/v1/agent/coding/${SESSION}/changes`) {
      return {
        json: {
          repo: 'hanzoai/universe',
          base: 'main',
          head: 'agent/ab12',
          commits: [{ sha: 'a1b2c3d4e5f6', message: 'Add the widget', author: 'Hanzo Dev', date: '2026-09-27T10:05:00Z' }],
          files: [{ path: 'widget.go', status: 'added', additions: 2, deletions: 0, patch: '@@ -0,0 +1,2 @@\n+package widget\n+func New() {}' }],
          pull: { number: 7, url: PR, title: 'Add the widget', state: 'open', mergeable: true, reviews: [{ author: 'z', state: 'APPROVED', body: 'ship it', at: '2026-09-27T11:00:00Z' }] },
        },
      }
    }
    if (path === `/v1/agent/coding/${SESSION}/tree`) return { json: { ref: 'agent/ab12', entries: [{ name: 'widget.go', path: 'widget.go', type: 'blob', size: 30 }] } }
    if (path === '/v1/environment/universe') return { json: { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' } }
    return undefined
  })
}

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
  await expect(p.getByText('Pull request #7')).toBeVisible()
  await expect(p.getByText('agent/ab12', { exact: true })).toBeVisible()
  await expect(p.getByText('widgets', { exact: true })).toBeVisible()
  await p.screenshot({ path: info.outputPath('artifacts.png') })
})

test('a finished run’s desktop and shell say they closed', async ({ page: p }) => {
  await platform(p, 'done')
  await p.goto(`/${SESSION}`)
  await tab(p, 'Desktop').click()
  await expect(p.getByText('This run’s desktop closed when the run stopped.')).toBeVisible()
  await tab(p, 'Terminal').click()
  await expect(desk(p).getByRole('button', { name: 'Shell' })).toHaveCount(0)
  await expect(desk(p).getByText('ok  widgets 0.2s')).toBeVisible()
})
