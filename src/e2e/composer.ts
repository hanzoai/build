/**
 * New's composer against a stubbed platform, for the specs that attach and
 * dictate (cov-app.spec.ts, cov-app-media.spec.ts): signed in as an org admin,
 * holding a codebase whose environment is ready.
 */
import type { Page } from '@playwright/test'

import { ORG, SESSION, signIn, type Reply } from './signed.ts'
import { KEPT } from './stubs.ts'

/**
 * A start answers 202, the person's settings are `prefs` and a write merges in,
 * and a recording is transcribed as `heard` says, held until `hold` resolves.
 * Answers what the page sent, and each recording's multipart body.
 */
export async function composer(page: Page, { heard = { json: { text: ' add a cart ' } } as Reply, hold = Promise.resolve(), prefs = {} as Record<string, unknown> } = {}) {
  const sent = await signIn(
    page,
    ({ method, path, body }) => {
      // The kept codebase is one of the org's repositories, so New offers it rather than asking for one.
      if (path === '/v1/git/repos') return { json: { data: [{ name: 'universe', org: ORG, defaultBranch: 'main' }] } }
      if (path === '/v1/environment/universe') return { json: { repo: 'universe', install: 'pnpm i', start: '', secrets: [], state: 'ready' } }
      if (path === '/v1/agent/coding' && method === 'POST') return { status: 202, json: { sessionId: SESSION, repo: 'universe', branch: '' } }
      if (path === '/v1/pref' && method === 'GET') return { json: { prefs, updatedAt: 1 } }
      if (path === '/v1/pref' && method === 'PATCH') return { json: { prefs: { ...prefs, ...(body as object) }, updatedAt: 2 } }
      return undefined
    },
    KEPT,
  )
  // Multipart, which signed.ts does not read: answered here.
  const heardBy: string[] = []
  await page.route('**/v1/audio/transcriptions', async (r) => {
    heardBy.push(r.request().postData() ?? '')
    await hold
    await r.fulfill(heard.text !== undefined ? { status: heard.status ?? 200, body: heard.text } : { status: heard.status ?? 200, json: heard.json })
  })
  return { sent, heardBy }
}

export const ask = (page: Page) => page.getByRole('textbox', { name: 'Describe a task or ask a question' })

/** The line New says what happened on. */
export const status = (page: Page) => page.getByRole('status')
