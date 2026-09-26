/**
 * Setting a codebase's environment up from New, signed in as an org admin. The
 * platform is this file's: the token is an unsigned stand-in, and IAM's userinfo
 * and every /v1 answer are stubbed, so it checks what the page draws and what it
 * sends — not what the platform does with it.
 */
import { expect, test, type Page } from '@playwright/test'

const ORG = 'acme'
const REPO = 'universe'
const SESSION = `sess_${'a'.repeat(32)}`

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const TOKEN = [
  b64({ alg: 'none', typ: 'JWT' }),
  b64({ sub: `${ORG}/dave`, email: 'dave@acme.test', orgs: [{ org: ORG, role: 'admin' }] }),
  'x',
].join('.')

interface Sent {
  method: string
  path: string
  body: unknown
}

/** Signs the page in and answers for the platform; returns what the page sent. */
async function platform(page: Page): Promise<Sent[]> {
  const sent: Sent[] = []
  const env = { repo: REPO, install: '', start: '', secrets: [] as string[], state: 'none', session: '', proposal: null }
  await page.addInitScript(
    ([token, org, repo]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('hanzo:who', `${org}/dave`)
      localStorage.setItem('hanzo_iam_access_token', token)
      localStorage.setItem('hanzo_iam_expires_at', String(Date.now() + 3_600_000))
      localStorage.setItem(
        `hanzo.build.new.${org}`,
        JSON.stringify({
          repo: { owner: org, name: repo, full_name: `${org}/${repo}`, private: true, default_branch: 'main', pushed_at: '', installation_id: 0, forge: true, clone: '' },
          branch: 'main',
          place: '',
          mode: 'build',
          model: '',
          effort: 'medium',
          ask: '',
        }),
      )
    },
    [TOKEN, ORG, REPO],
  )
  await page.route('**/.well-known/openid-configuration', (r) => r.fulfill({ status: 404 }))
  await page.route('**/v1/iam/oauth/userinfo', (r) => r.fulfill({ json: { sub: `${ORG}/dave`, name: 'Dave', email: 'dave@acme.test' } }))
  await page.route(
    (u) => u.pathname.startsWith('/v1/') && !u.pathname.startsWith('/v1/iam/'),
    async (r) => {
      const req = r.request()
      const path = new URL(req.url()).pathname
      const body = req.postData() ? JSON.parse(req.postData()!) : null
      sent.push({ method: req.method(), path, body })
      if (path === `/v1/environment/${REPO}` && req.method() === 'PUT') {
        Object.assign(env, body, { state: 'ready' })
        return r.fulfill({ json: env })
      }
      if (path === `/v1/environment/${REPO}`) return r.fulfill({ json: env })
      if (path === '/v1/agent/coding') return r.fulfill({ status: 202, json: { sessionId: SESSION, repo: REPO, branch: '' } })
      return r.fulfill({ json: { data: [] } })
    },
  )
  return sent
}

test('New offers to set up a codebase that has no environment', async ({ page }, info) => {
  await platform(page)
  await page.goto('/')
  await expect(page.getByText(`${REPO} has no environment yet, so every run starts it bare.`)).toBeVisible()
  await page.getByRole('button', { name: 'Set up environment' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Set up an environment')).toBeVisible()
  await expect(dialog.getByText(REPO, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Skip & save' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Start agent' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('setup-dialog.png') })
})

test('Skip & save keeps an empty environment and the offer goes away', async ({ page }) => {
  const sent = await platform(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Set up environment' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Skip & save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(`${REPO} has no environment yet`)).toHaveCount(0)
  expect(sent).toContainEqual({ method: 'PUT', path: `/v1/environment/${REPO}`, body: { install: '', start: '' } })
})

test('Start agent opens a setup run titled by its first line', async ({ page }) => {
  const sent = await platform(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Set up environment' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start agent' }).click()
  await expect(page).toHaveURL(new RegExp(`/${SESSION}$`))
  const run = sent.find((s) => s.method === 'POST' && s.path === '/v1/agent/coding')
  const body = run?.body as { mode?: string; repo?: string; prompt?: string }
  expect(body.mode).toBe('setup')
  expect(body.repo).toBe(REPO)
  expect(body.prompt?.split('\n')[0]).toBe('Set up the environment')
})
