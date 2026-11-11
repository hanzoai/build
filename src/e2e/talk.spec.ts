/**
 * Dev as a conversation (api/talk.ts), signed in against a stubbed platform: the
 * first thing said opens a conversation and starts no coding run, and every
 * follow-up continues that same conversation at the same address.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { ORG, signIn, type Sent } from './signed.ts'
import { KEPT, MODELS } from './stubs.ts'

const TALKING = `sess_${'c'.repeat(32)}`

/** The platform for one conversation: each thing said is answered, and the conversation rests between turns. */
function platform(page: Page): Promise<Sent[]> {
  const events: Record<string, unknown>[] = []
  const ev = (kind: string, payload: unknown) =>
    events.push({ id: `e${events.length + 1}`, sessionId: TALKING, seq: events.length + 1, kind, actor: `${ORG}/dave`, payload, createdAt: '' })
  return signIn(
    page,
    ({ method, path, body }) => {
      if (path === '/v1/agent/turns' && method === 'POST') {
        const said = (body as { input: string }).input
        ev('message', { role: 'user', text: said })
        if (said === 'build the page')
          ev('status', { status: 'asked', question: 'qst_1', text: 'Start a coding run: build the page', options: [{ label: 'Start it' }, { label: 'Not now' }] })
        else ev('message', { text: `You said: ${said}` })
        return { json: { sessionId: TALKING, runId: `run_${events.length}` } }
      }
      if (path === `/v1/agent/sessions/${TALKING}/events`) return { json: { events } }
      if (path === `/v1/agent/sessions/${TALKING}/answer` && method === 'POST') {
        const { question, text } = body as { question: string; text: string }
        ev('status', { status: 'answered', question, answer: text, chosen: true })
        return { json: { question, text } }
      }
      if (path === `/v1/agent/sessions/${TALKING}`) {
        return { json: { id: TALKING, org: ORG, title: 'hello', status: 'paused', channel: 'app', rootSessionId: TALKING, recentEvents: events.slice(-1) } }
      }
      if (path === '/v1/agent/sessions/stream') return { text: '', type: 'text/event-stream' }
      if (path === '/v1/models') return { json: MODELS }
      if (path === '/v1/git/repos') return { json: { data: [{ name: 'universe', org: ORG, defaultBranch: 'main' }] } }
      return undefined
    },
    KEPT,
  )
}

const posted = (sent: Sent[], path: string) => sent.filter((s) => s.method === 'POST' && s.path === path)

test('the first thing said in Dev opens a conversation and starts no run, and a follow-up stays on its address', async ({ page: p, baseURL }, info) => {
  const sent = await platform(p)
  await p.goto('/')
  const ask = p.getByRole('textbox', { name: 'Describe a task or ask a question' })
  await ask.fill('hello', { timeout: 45_000 })
  await ask.press('Enter')

  // One conversation, at its own address; nothing was started that leases a sandbox.
  await expect(p).toHaveURL(new URL(`/${TALKING}`, baseURL).href)
  expect(posted(sent, '/v1/agent/turns')[0]?.body).toMatchObject({ input: 'hello', repo: 'universe', base: 'main', mode: 'auto' })
  expect(posted(sent, '/v1/agent/turns')[0]?.body).not.toHaveProperty('session')
  expect(posted(sent, '/v1/agent/coding')).toHaveLength(0)
  const transcript = p.getByLabel('Transcript')
  await expect(transcript.getByText('You said: hello')).toBeVisible()

  // The follow-up continues the same conversation, and the page never moves.
  const reply = p.getByRole('textbox', { name: 'Reply to this conversation' })
  await reply.fill('now build it')
  await reply.press('Enter')
  await expect.poll(() => posted(sent, '/v1/agent/turns').length).toBe(2)
  // The conversation keeps its code: a follow-up names only what was said, and the model.
  expect(posted(sent, '/v1/agent/turns')[1]?.body).toMatchObject({ session: TALKING, input: 'now build it' })
  expect(posted(sent, '/v1/agent/turns')[1]?.body).not.toHaveProperty('repo')
  await expect(transcript.getByText('You said: now build it')).toBeVisible()
  await expect(transcript.getByText('You said: hello')).toBeVisible()
  await expect(p).toHaveURL(new URL(`/${TALKING}`, baseURL).href)
  expect(posted(sent, '/v1/agent/coding')).toHaveLength(0)
  await p.screenshot({ path: info.outputPath('conversation.png') })
})

test('a question a turn asks is answered on its card, and nothing steers a build', async ({ page: p }) => {
  const sent = await platform(p)
  await p.goto('/')
  const ask = p.getByRole('textbox', { name: 'Describe a task or ask a question' })
  await ask.fill('build the page', { timeout: 45_000 })
  await ask.press('Enter')
  // The turn asks, as Manual does before a build starts; the card carries the options.
  const question = p.getByLabel('Question')
  await expect(question.getByText('Start a coding run: build the page')).toBeVisible()
  await question.getByRole('button', { name: 'Start it' }).click()
  await expect.poll(() => posted(sent, `/v1/agent/sessions/${TALKING}/answer`).length).toBe(1)
  expect(posted(sent, `/v1/agent/sessions/${TALKING}/answer`)[0]?.body).toEqual({ question: 'qst_1', text: 'Start it', chosen: true })
  await expect(question.getByText('✓ Start it')).toBeVisible()
  expect(sent.filter((s) => s.path.endsWith('/steer'))).toHaveLength(0)
})
