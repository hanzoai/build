/**
 * Customize past the happy path: what a visitor and a member see, every
 * loading, empty, refused, slow and no-match state of the four tabs, the rows
 * the platform answers thinly, and every write that fails and says why. A
 * refusal is said in plain words with a way to ask again — never the
 * platform's own text, which these stubs make distinctive so its absence can
 * be checked — except where it names what was wrong with what was sent.
 *
 * The shared stubs (stubs.ts) answer the platform; `over` answers some calls
 * differently ahead of them — a refusal, a held answer, other rows — and passes
 * the rest on. Each test opens the page once and moves inside it, so what it
 * drew is still counted when it ends.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import { mounted, went } from './mount.ts'
import type { Reply, Sent } from './signed.ts'
import { catalogue, customize, LISTINGS, PNG, visitor } from './stubs.ts'

type Over = (s: Sent) => Reply | undefined | Promise<Reply | undefined>

/** Answers what `answer` names ahead of the stubs under it, which answer the rest; returns every /v1 call the page made. */
async function over(page: Page, answer: Over): Promise<Sent[]> {
  const sent: Sent[] = []
  await page.route(
    (u) => u.pathname.startsWith('/v1/') && !u.pathname.startsWith('/v1/iam/'),
    async (r) => {
      const req = r.request()
      const url = new URL(req.url())
      const raw = req.postData()
      const one: Sent = { method: req.method(), path: url.pathname, query: url.search, body: raw ? JSON.parse(raw) : null }
      sent.push(one)
      const reply = await answer(one)
      if (!reply) return r.fallback()
      if (reply.text !== undefined) return r.fulfill({ status: reply.status ?? 200, body: reply.text, contentType: reply.type ?? 'text/plain' })
      return r.fulfill({ status: reply.status ?? 200, json: reply.json ?? {} })
    },
  )
  return sent
}

/** An answer held until `release` is called, to see what the page draws while it waits. */
function held() {
  let release = () => {}
  const until = new Promise<void>((done) => (release = done))
  return { until, release: () => release() }
}

/** The platform's refusal, as problem details. */
const refused = (status: number, detail: string): Reply => ({ status, json: { status, title: 'Refused', detail } })

/** Signs the page in as a member of the org rather than an org admin. */
async function member(page: Page) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = [b64({ alg: 'none' }), b64({ sub: 'acme/zed', email: 'zed@acme.test', orgs: [{ org: 'acme', role: 'member' }] }), 'x'].join('.')
  await page.addInitScript((t) => localStorage.setItem('hanzo_iam_access_token', t), token)
}

const sentTo = (sent: Sent[], method: string, path: string) => sent.filter((s) => s.method === method && s.path === path)
const browse = (page: Page) => page.getByRole('button', { name: 'Browse', exact: true })
const yours = (page: Page) => page.getByRole('button', { name: /^Yours/ })
/** What a 5xx is said as, wherever it lands. */
const DOWN = 'Hanzo could not answer just now. Try again.'

test('a visitor reads the catalogue, the fleet’s servers and the presets, and is asked to sign in for the rest', async ({ page }, info) => {
  await visitor(page)
  await mounted(page, { path: '-/customize', org: null, admin: false, person: null, signIn: true })

  // Browse is what everyone lands on; nothing there is a visitor's to add.
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('3 skills', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New skill' })).toHaveCount(0)
  await page.getByRole('button', { name: 'git_repos', exact: true }).click()
  const reader = page.getByRole('dialog', { name: 'git_repos' })
  await expect(reader.getByText('What git_repos does, step by step.')).toBeVisible()
  await expect(reader.getByRole('button', { name: 'Add to your skills' })).toHaveCount(0)
  await reader.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await yours(page).click()
  await expect(page.getByText('Sign in to see your skills.')).toBeVisible()

  await page.getByRole('tab', { name: 'Connectors' }).click()
  await expect(page.getByText('Sign in to browse connectors.')).toBeVisible()
  await page.getByRole('button', { name: 'Show built-in servers' }).click()
  await expect(page.getByText('2 servers · 3 operations')).toBeVisible()
  await page.screenshot({ path: info.outputPath('visitor-connectors.png'), fullPage: true })
  await yours(page).click()
  await expect(page.getByText('Sign in to see your connectors.')).toBeVisible()

  await page.getByRole('tab', { name: 'Plugins' }).click()
  await expect(page.getByText('Sign in to browse plugins.')).toBeVisible()
  await yours(page).click()
  await expect(page.getByText('Sign in to see your plugins.')).toBeVisible()

  await page.getByRole('tab', { name: 'Agents' }).click()
  await expect(page.getByText('Product & Fashion Create', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Add|Use) / })).toHaveCount(0)
  await yours(page).click()
  await expect(page.getByText('Sign in to see your agents.')).toBeVisible()

  // Sign in is the host's to do.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect.poll(() => went(page)).toContain('sign in')
})

// Skills.

test('skills: the org’s own as the platform answers them, a catalogue skill that cannot be read, and one from a repository revised', async ({ page }, info) => {
  const own: Record<string, unknown>[] = [
    { id: 'deploy', name: 'deploy', content: '# Deploy\n\nShip it.', source: 'acme/universe' },
    { id: 'notes', name: 'notes' },
    { id: 'triage', name: 'triage', description: 'How we triage', content: '# Triage', createdAt: 1790000000, admitted: false },
  ]
  const on = new Set(['skill_deploy', 'skill_kms_secrets', 'gh_search'])
  await catalogue(page)
  await page.route('**/.well-known/agent-skills/kms_secrets/SKILL.md', (r) => r.fulfill({ status: 404, json: { error: 'no such skill' } }))
  await customize(page)
  const sent = await over(page, ({ method, path, body }) => {
    const b = (body ?? {}) as Record<string, unknown>
    if (path === '/v1/tool/skills/authored') return { json: { skills: own } }
    if (path === '/v1/tool/skills' && method === 'GET') {
      return { json: { source: 'skill', tools: [...on].map((name) => ({ name, source: name.startsWith('skill_') ? 'skill' : 'mcp', activated: true })) } }
    }
    if (path === '/v1/tool/skills' && method === 'POST') {
      const i = own.findIndex((s) => s.name === b.name)
      own[i] = { ...own[i], ...b }
      return { status: 201, json: { skill: own[i] } }
    }
    if (path === '/v1/tool/activation' && method === 'PUT') {
      for (const n of b.activate as string[]) on.add(n)
      for (const n of b.deactivate as string[]) on.delete(n)
      return { json: { enabled: [...on] } }
    }
    return undefined
  })
  await page.goto('/-/customize')
  await yours(page).click()

  const mine = page.getByRole('list', { name: 'Your skills' })
  const card = (text: string) => mine.getByRole('listitem').filter({ hasText: text })
  // No description: the SKILL.md's first line says what it is. Neither: the card is its name alone.
  await expect(card('deploy').getByText('Deploy', { exact: true })).toBeVisible()
  await expect(card('deploy').getByText('From acme/universe')).toBeVisible()
  await expect(card('notes')).toHaveText(/^N\s*notes$/)
  await expect(card('triage').getByText(/^Saved .+ · Not in runs until an admin saves it$/)).toBeVisible()
  // An added skill is a catalogue skill; a tool that is not a skill is not listed.
  const added = page.getByRole('list', { name: 'Added skills' })
  await expect(added.getByRole('listitem')).toHaveCount(1)
  await expect(added.getByText('kms_secrets', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('skills-thin.png') })

  await page.getByLabel('Search skills').fill('zzz')
  await expect(page.getByText('No skill of yours matches “zzz”.')).toBeVisible()
  await expect(added).toHaveCount(0)
  await page.getByLabel('Search skills').fill('')

  await added.getByRole('button', { name: 'kms_secrets', exact: true }).click()
  const reader = page.getByRole('dialog', { name: 'kms_secrets' })
  await expect(reader.getByText('Not found. It may have been removed.')).toBeVisible()
  await expect(reader.getByText('no such skill')).toHaveCount(0)
  await expect(reader.getByText('On for your organization.')).toBeVisible()
  await reader.getByRole('button', { name: 'Remove' }).click()
  await expect(reader.getByRole('button', { name: 'Add to your skills' })).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['skill_kms_secrets'] })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('kms_secrets is off')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Added skills' })).toHaveCount(0)

  await card('deploy').getByRole('button', { name: 'deploy', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'deploy' })
  await expect(editor.getByText('Read from acme/universe. The next push of that repository replaces what is saved here.')).toBeVisible()
  await expect(editor.getByLabel('Name')).toBeDisabled()
  await expect(editor.getByText('A skill keeps its name. Save under another name to make a new one.')).toBeVisible()
  await editor.getByLabel('Description').fill('Ship to production')
  const puts = sentTo(sent, 'PUT', '/v1/tool/activation').length
  await editor.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // A revised skill keeps its switch: it is written, and nothing is switched.
  await expect(page.getByText('deploy is saved', { exact: true })).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/skills').at(-1)?.body).toEqual({ name: 'deploy', description: 'Ship to production', content: '# Deploy\n\nShip it.' })
  expect(sentTo(sent, 'PUT', '/v1/tool/activation')).toHaveLength(puts)
  await expect(card('deploy').getByText('Ship to production')).toBeVisible()
})

test('skills: while they are read the page says so, and then what is on arrives', async ({ page }) => {
  const own = held()
  const lit = held()
  await catalogue(page)
  await customize(page)
  await over(page, async ({ method, path }) => {
    if (path === '/v1/tool/skills/authored') {
      await own.until
      return { json: { skills: [] } }
    }
    if (path === '/v1/tool/skills' && method === 'GET') await lit.until
    return undefined
  })
  await page.goto('/-/customize')
  await yours(page).click()
  await expect(page.getByText('Loading your skills…')).toBeVisible()
  // The org's own are read, and there are none; what is on is still being read.
  const read = page.waitForResponse('**/v1/tool/skills/authored')
  own.release()
  await read
  await expect(page.getByText('Loading your skills…')).toBeVisible()
  lit.release()
  // None written here, so no heading for them; two added from Hanzo.
  await expect(page.getByRole('heading', { name: 'Made by your team' })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Added skills' }).getByRole('listitem')).toHaveCount(2)
  await expect(yours(page)).toHaveAccessibleName('Yours, 2')
})

test('skills: a refused read of the org’s own is said', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  await over(page, ({ method, path }) => {
    if (path === '/v1/tool/skills/authored') return refused(503, 'the skill store is down')
    if (path === '/v1/tool/skills' && method === 'GET') return { json: { tools: [] } }
    return undefined
  })
  await page.goto('/-/customize')
  await yours(page).click()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the skill store is down')).toHaveCount(0)
})

test('skills: a refused read of what is on is said when the org has none of its own', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  await over(page, ({ method, path }) => {
    if (path === '/v1/tool/skills/authored') return { json: { skills: [] } }
    if (path === '/v1/tool/skills' && method === 'GET') return refused(503, 'the tool plane is down')
    return undefined
  })
  await page.goto('/-/customize')
  await yours(page).click()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the tool plane is down')).toHaveCount(0)
})

test('skills: a switch the platform refuses says why, and a list that cannot be read again stays as it was', async ({ page }) => {
  let lit = 0
  await catalogue(page)
  await customize(page)
  const sent = await over(page, ({ method, path }) => {
    if (path === '/v1/tool/skills' && method === 'GET' && ++lit > 1) return refused(503, 'the tool plane is down')
    if (path === '/v1/tool/activation' && method === 'PUT' && lit > 1) return refused(503, 'switching is paused')
    return undefined
  })
  await page.goto('/-/customize')
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your skills' })
  await mine.getByRole('switch', { name: 'triage on' }).click()
  // Switched off; the read after it is refused, so what was read stays on screen.
  await expect(page.getByText('triage is off')).toBeVisible()
  await expect(mine.getByText('triage', { exact: true })).toBeVisible()
  await mine.getByRole('switch', { name: 'triage on' }).click()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('switching is paused')).toHaveCount(0)
  expect(sentTo(sent, 'PUT', '/v1/tool/activation')).toHaveLength(2)

  await browse(page).click()
  await page.getByRole('button', { name: 'Add git_repos' }).click()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add git_repos' })).toBeVisible()
})

test('skills: a catalogue read a page at a time, searched, refused once and kept, and empty', async ({ page }, info) => {
  const many = {
    products: [{ name: 'git', skill_count: 70 }],
    skills: Array.from({ length: 70 }, (_, i) => ({ name: `git_op_${String(i).padStart(2, '0')}`, description: `Git operation ${i}.`, service: 'git' })),
  }
  // What the catalogue answers now: the page reads it on every turn to Discover.
  let now: { status?: number; json: unknown } = { status: 503, json: { detail: 'the catalogue is rebuilding' } }
  await customize(page)
  await page.route('**/.well-known/agent-skills/index.json', (r) => r.fulfill(now))
  await page.goto('/-/customize')
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  const again = async () => {
    await yours(page).click()
    await browse(page).click()
  }

  // Refused: said plainly, with the one control that asks again.
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the catalogue is rebuilding')).toHaveCount(0)
  now = { json: many }
  await page.getByRole('button', { name: 'Try again' }).click()
  const shelf = page.getByRole('list', { name: 'Skills to add' })
  await expect(page.getByText('70 skills', { exact: true })).toBeVisible()
  await expect(shelf.getByRole('listitem')).toHaveCount(60)
  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(shelf.getByRole('listitem')).toHaveCount(70)
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('skills-many.png') })
  await page.getByLabel('Search skills').fill('no such operation')
  await expect(page.getByText('No skill matches “no such operation”.')).toBeVisible()
  await page.getByLabel('Search skills').fill('')

  // Refused, saying nothing of its own: what was read stays.
  now = { status: 503, json: {} }
  await again()
  await expect(page.getByText('70 skills', { exact: true })).toBeVisible()

  now = { json: { skills: [], products: [] } }
  await again()
  await expect(page.getByText('There are no skills to add yet.')).toBeVisible()
})

test('skills: an org with none is pointed at the catalogue, and a new skill the platform refuses says why', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  const sent = await over(page, ({ method, path }) => {
    if (path === '/v1/tool/skills/authored') return { json: { skills: [] } }
    if (path === '/v1/tool/skills' && method === 'GET') return { json: { tools: [] } }
    if (path === '/v1/tool/skills' && method === 'POST') return refused(422, 'SKILL.md: the front matter is not YAML')
    return undefined
  })
  await page.goto('/-/customize')
  await yours(page).click()
  await expect(page.getByText('No skills yet', { exact: true })).toBeVisible()
  await expect(page.getByText('Add one from Hanzo, or write your own.')).toBeVisible()

  // The empty state's own next step opens the same dialog as the bar's.
  await page.getByRole('button', { name: 'Write a skill' }).click()
  await expect(page.getByRole('dialog', { name: 'New skill' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'New skill' }).click()
  let dialog = page.getByRole('dialog', { name: 'New skill' })
  await dialog.getByLabel('Name').fill('deploy')
  await dialog.getByLabel('SKILL.md').fill('---\n: bad\n---\n# Deploy')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText('SKILL.md: the front matter is not YAML')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation')).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'New skill' }).click()
  dialog = page.getByRole('dialog', { name: 'New skill' })
  await expect(dialog.getByLabel('Name')).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Browse skills' }).click()
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('3 skills', { exact: true })).toBeVisible()
})

test('skills: a delete the platform refuses stays open and says why, and Cancel keeps the skill', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  const sent = await over(page, ({ method, path }) => (method === 'DELETE' && path === '/v1/tool/skills/triage' ? refused(409, 'triage is named by 2 agents') : undefined))
  await page.goto('/-/customize')
  await yours(page).click()
  await page.getByRole('list', { name: 'Your skills' }).getByRole('button', { name: 'triage', exact: true }).click()
  await page.getByRole('dialog', { name: 'triage' }).getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete triage?' })
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(confirm.getByText('triage is named by 2 agents')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/skills/triage')).toHaveLength(1)
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete triage?' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'triage' })).toBeVisible()
})

test('skills: a member reads what is on and off, opens a skill to read it, and adds nothing', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  await member(page)
  await over(page, ({ path }) =>
    path === '/v1/tool/skills/authored'
      ? {
          json: {
            skills: [
              { id: 'triage', name: 'triage', description: 'How we triage an issue', content: '# Triage\n\nRead it first.', createdAt: 1790000000 },
              { id: 'deploy', name: 'deploy', description: 'How we ship', content: '# Deploy', createdAt: 1790000000 },
            ],
          },
        }
      : undefined,
  )
  await page.goto('/-/customize')
  await expect(page.getByText('Only an org admin can add or change skills. You can see what is on.')).toBeVisible()
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your skills' })
  await expect(mine.getByRole('listitem').filter({ hasText: 'triage' }).getByText('On', { exact: true })).toBeVisible()
  await expect(mine.getByRole('listitem').filter({ hasText: 'deploy' }).getByText('Off', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Added skills' }).getByText('git_branches', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0)

  await mine.getByRole('button', { name: 'triage', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'triage' })
  await expect(editor.getByText('Only an org admin can write or delete skills.')).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await editor.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await browse(page).click()
  await expect(page.getByText('3 skills', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await page.getByRole('button', { name: 'git_repos', exact: true }).click()
  const reader = page.getByRole('dialog', { name: 'git_repos' })
  await expect(reader.getByText('What git_repos does, step by step.')).toBeVisible()
  await expect(reader.getByRole('button', { name: 'Add to your skills' })).toHaveCount(0)
})

// Connectors.

test('connectors: the org’s servers as the platform answers them, and one server’s tools switched one at a time and all at once', async ({ page }, info) => {
  await catalogue(page)
  const sent = await customize(page, [
    { id: 'docs', org: 'acme', name: 'Docs', url: 'https://docs.example.com/mcp/', admitted: false },
    { id: 'gh', org: 'acme', name: 'GitHub', url: 'https://api.githubcopilot.com/mcp', hasSecret: true, listing: 'io.github_mcp', createdAt: 1790000000 },
    { id: 'old', org: 'acme', url: 'https://old.example.com/mcp' },
  ])
  await page.goto('/-/customize/connectors')
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your connectors' })
  const card = (text: string) => mine.getByRole('listitem').filter({ hasText: text })
  await expect(card('Docs').getByText('docs.example.com/mcp', { exact: true })).toBeVisible()
  await expect(card('Docs').getByText('0 of 2 tools on · Added by URL · Not in runs until an admin adds it again')).toBeVisible()
  await expect(card('GitHub').getByText('0 of 2 tools on · From Browse · Secret in KMS')).toBeVisible()
  // A server answered without a name is drawn by its address, its mark a question.
  await expect(card('old.example.com/mcp')).toHaveText(/^\?\s*old\.example\.com\/mcp\s*0 of 2 tools on · Added by URL$/)
  await page.screenshot({ path: info.outputPath('connectors-thin.png') })

  await page.getByLabel('Search connectors').fill('zzz')
  await expect(page.getByText('No connector of yours matches “zzz”.')).toBeVisible()
  await page.getByLabel('Search connectors').fill('')

  await card('GitHub').getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByRole('dialog', { name: 'GitHub' }).getByText('A secret is sealed in KMS and sent in its header.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await card('Docs').getByRole('button', { name: 'Docs' }).click()
  const detail = page.getByRole('dialog', { name: 'Docs' })
  await expect(detail.getByText('No secret: it is called as it is.')).toBeVisible()
  const link = detail.getByRole('switch', { name: 'create_payment_link on' })
  const list = detail.getByRole('switch', { name: 'list_customers on' })
  await expect(link).not.toBeChecked()
  await link.click()
  await expect(link).toBeChecked()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['docs_create_payment_link'], deactivate: [] })
  await detail.getByRole('button', { name: 'Turn all on' }).click()
  await expect(list).toBeChecked()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['docs_list_customers'], deactivate: [] })
  await detail.getByRole('button', { name: 'Turn all off' }).click()
  await expect(link).not.toBeChecked()
  await expect(list).not.toBeChecked()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: [], deactivate: ['docs_create_payment_link', 'docs_list_customers'] })
  await detail.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Its card reads the tools again: off, every one.
  await expect(card('Docs').getByRole('switch', { name: 'Docs on' })).not.toBeChecked()
  await card('Docs').getByRole('switch', { name: 'Docs on' }).click()
  await expect(page.getByText('Docs is on')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['docs_create_payment_link', 'docs_list_customers'], deactivate: [] })
  await expect(card('Docs').getByText('2 of 2 tools on · Added by URL · Not in runs until an admin adds it again')).toBeVisible()
})

test('connectors: a server’s tools while they are asked for, when the ask is refused, when it lists none, and a switch refused', async ({ page }) => {
  const asking = held()
  let now: 'held' | 'none' | 'one' = 'held'
  await catalogue(page)
  await customize(page, [{ id: 'docs', org: 'acme', name: 'Docs', url: 'https://docs.example.com/mcp' }])
  await over(page, async ({ method, path, query }) => {
    if (path === '/v1/tool' && query.includes('source=mcp')) {
      if (now === 'none') return { json: { tools: [] } }
      if (now === 'one') return { json: { tools: [{ name: 'docs_search', source: 'mcp', activated: true }] } }
      await asking.until
      return refused(502, 'docs did not answer tools/list')
    }
    if (path === '/v1/tool/activation' && method === 'PUT') return refused(503, 'switching is paused')
    return undefined
  })
  await page.goto('/-/customize/connectors')
  await yours(page).click()
  const open = async () => {
    await page.getByRole('list', { name: 'Your connectors' }).getByRole('button', { name: 'Docs' }).click()
    return page.getByRole('dialog', { name: 'Docs' })
  }

  let detail = await open()
  await expect(detail.getByText('Loading its tools…')).toBeVisible()
  asking.release()
  await expect(detail.getByText(DOWN)).toBeVisible()
  await expect(detail.getByText('docs did not answer tools/list')).toHaveCount(0)
  await detail.getByRole('button', { name: 'Close' }).click()

  now = 'none'
  detail = await open()
  await expect(detail.getByText('No tools listed yet. A server that does not answer shows its tools once it does.')).toBeVisible()
  await expect(detail.getByRole('button', { name: /^Turn all/ })).toHaveCount(0)
  await detail.getByRole('button', { name: 'Close' }).click()

  now = 'one'
  detail = await open()
  // A tool with no description is its name alone.
  await expect(detail.getByText('search', { exact: true })).toBeVisible()
  await detail.getByRole('switch', { name: 'search on' }).click()
  await expect(detail.getByText(DOWN)).toBeVisible()
  await expect(detail.getByRole('switch', { name: 'search on' })).toBeChecked()
})

test('connectors: a removal the platform refuses says why, and the list stays as read when it cannot be read again', async ({ page }) => {
  let down = false
  let deletes = 0
  await catalogue(page)
  const sent = await customize(page, [{ id: 'docs', org: 'acme', name: 'Docs', url: 'https://docs.example.com/mcp' }])
  await over(page, ({ method, path }) => {
    if (path === '/v1/tool/mcp/servers/docs' && method === 'DELETE' && ++deletes === 1) return refused(409, 'Docs is named by 2 agents')
    if (path === '/v1/tool/mcp/servers' && method === 'GET' && down) return refused(503, 'the tool plane is down')
    return undefined
  })
  await page.goto('/-/customize/connectors')
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your connectors' })
  await mine.getByRole('button', { name: 'Docs' }).click()
  await page.getByRole('dialog', { name: 'Docs' }).getByRole('button', { name: 'Remove connector' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete Docs?' })
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(confirm.getByText('Docs is named by 2 agents')).toBeVisible()

  down = true
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Docs is removed')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/tool/mcp/servers/docs')).toHaveLength(1)
  // Removed on the platform; the list could not be read again, so it stays as it was read.
  await expect(mine.getByRole('button', { name: 'Docs' })).toBeVisible()
})

test('connectors: a server that lists no tools, one whose tools cannot be read, one the platform refuses, and an add let go', async ({ page }) => {
  let tools: 'none' | 'refused' = 'none'
  await catalogue(page)
  const sent = await customize(page)
  await over(page, ({ method, path, query, body }) => {
    if (path === '/v1/tool' && query.includes('source=mcp')) return tools === 'none' ? { json: { tools: [] } } : refused(503, 'the tool plane is down')
    if (path === '/v1/tool/mcp/servers' && method === 'POST' && String((body as { url?: string }).url).includes('10.0.0.1')) return refused(422, 'private addresses are refused')
    return undefined
  })
  await page.goto('/-/customize/connectors')
  await yours(page).click()
  await expect(page.getByText('No connectors yet', { exact: true })).toBeVisible()
  await expect(page.getByText('Connect an app from Browse, or add any MCP server by its URL.')).toBeVisible()
  const add = async (name: string, url: string) => {
    await page.getByRole('button', { name: 'Add by URL' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add by URL' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByLabel('URL').fill(url)
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    return dialog
  }

  // The empty state's Add by URL is the bar's, and Cancel lets it go.
  await page.getByRole('button', { name: 'Add by URL' }).last().click()
  await page.getByRole('dialog', { name: 'Add by URL' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await add('Docs', 'https://docs.example.com/mcp')
  await expect(page.getByText('Docs is added. It listed no tools yet.')).toBeVisible()
  expect(sentTo(sent, 'PUT', '/v1/tool/activation')).toHaveLength(0)

  tools = 'refused'
  await add('Wiki', 'https://wiki.example.com/mcp')
  await expect(page.getByText(`Wiki is added, but its tools could not be switched on. ${DOWN}`)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Your connectors' }).getByRole('listitem')).toHaveCount(2)

  const dialog = await add('Lab', 'https://10.0.0.1/mcp')
  await expect(dialog.getByText('private addresses are refused')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Your connectors' }).getByRole('listitem')).toHaveCount(2)
})

test('connectors: yours while they are read and when the read is refused, then a server added after', async ({ page }) => {
  const reading = held()
  let first = true
  await catalogue(page)
  await customize(page)
  await over(page, async ({ method, path }) => {
    if (path === '/v1/tool/mcp/servers' && method === 'GET' && first) {
      await reading.until
      return refused(503, 'the tool plane is down')
    }
    return undefined
  })
  await page.goto('/-/customize/connectors')
  await yours(page).click()
  await expect(page.getByText('Loading your connectors…')).toBeVisible()
  reading.release()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the tool plane is down')).toHaveCount(0)

  first = false
  await page.getByRole('button', { name: 'Add by URL' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add by URL' })
  await dialog.getByLabel('Name').fill('Docs')
  await dialog.getByLabel('URL').fill('https://docs.example.com/mcp')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Docs is added, and its 2 tools are on.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Your connectors' }).getByRole('button', { name: 'Docs' })).toBeVisible()
})

test('connectors: the shelf a page at a time with its featured card, searched, a page that does not load, and the fleet’s servers opened', async ({ page }, info) => {
  const shelf: Record<string, unknown>[] = Array.from({ length: 60 }, (_, i) => ({
    id: `io.server_${i}`,
    name: `io.server/${i}`,
    title: `Server ${i}`,
    description: `Server number ${i}.`,
    vendor: 'io.server',
    remotes: [{ transport: 'streamable-http', url: `https://s${i}.example/mcp` }],
  }))
  shelf[0] = { ...shelf[0], title: 'Stripe', featured: true, logo: 'https://logos.example/stripe.png' }
  shelf[1] = { ...shelf[1], title: 'Broken', logo: 'https://logos.example/broken.png' }
  let pages = 0
  await catalogue(page)
  await page.route('https://logos.example/**', (r) => (r.request().url().endsWith('/stripe.png') ? r.fulfill({ body: PNG, contentType: 'image/png' }) : r.fulfill({ status: 404 })))
  await customize(page)
  const sent = await over(page, ({ path, query }) => {
    if (path === '/v1/mcp') {
      return {
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'git', description: 'git: the forge.', inputSchema: { properties: { op: { enum: ['list_git_repos', 'get_git_repo'] } } } }, { name: 'ping' }] },
        },
      }
    }
    if (path === '/v1/tool/catalog') {
      const p = new URLSearchParams(query)
      const q = (p.get('q') ?? '').toLowerCase()
      const offset = Number(p.get('offset') ?? 0)
      if (offset && ++pages === 1) return refused(503, 'the shelf is reindexing')
      const all = shelf.filter((l) => !q || String(l.title).toLowerCase().includes(q))
      return { json: { catalog: all.slice(offset, offset + 48), total: all.length, limit: 48, offset } }
    }
    return undefined
  })
  await page.goto('/-/customize/connectors')

  await expect(page.getByText('Featured', { exact: true })).toBeVisible()
  await expect(page.locator('img[src="https://logos.example/stripe.png"]')).toBeVisible()
  // A logo that does not load gives way to the initial.
  const list = page.getByRole('list', { name: 'Servers on the shelf' })
  await expect(list.getByRole('listitem').filter({ hasText: 'Broken' })).toHaveText(/^B\s*Broken/)
  await expect(page.locator('img[src="https://logos.example/broken.png"]')).toHaveCount(0)
  await expect(page.getByText('48 of 60 connectors')).toBeVisible()
  await page.screenshot({ path: info.outputPath('connectors-shelf.png') })

  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(page.getByText(DOWN)).toBeVisible()
  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(page.getByText('60 connectors', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0)
  expect(sent.filter((s) => s.path === '/v1/tool/catalog').at(-1)?.query).toBe('?limit=48&offset=48')

  // A search has no featured card: every match is a card like the rest.
  await page.getByLabel('Search connectors').fill('server 5')
  await expect(page.getByText('11 connectors', { exact: true })).toBeVisible()
  await expect(page.getByText('Featured', { exact: true })).toHaveCount(0)
  // The fleet's servers are listed only when asked for.
  expect(sentTo(sent, 'POST', '/v1/mcp')).toHaveLength(0)
  await page.getByRole('button', { name: 'Show built-in servers' }).click()
  await page.getByLabel('Search connectors').fill('zzz')
  await expect(page.getByText('No connector matches “zzz”.')).toBeVisible()
  await expect(page.getByText('No built-in server matches “zzz”.')).toBeVisible()
  await page.getByLabel('Search connectors').fill('')

  await expect(page.getByText('2 servers · 2 operations')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show built-in servers' })).toHaveCount(0)
  await page.getByRole('button', { name: 'ping', exact: true }).click()
  await expect(page.getByText('This server lists no operations.')).toBeVisible()
  const git = page.getByRole('button', { name: 'git', exact: true })
  await git.click()
  await expect(git).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('get_git_repo', { exact: true })).toBeVisible()
  await git.click()
  await expect(git).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('get_git_repo', { exact: true })).toHaveCount(0)
})

test('connectors: the shelf and the fleet’s servers while they are read, when they are refused, and a shelf with nothing on it', async ({ page }) => {
  const shelf = held()
  const natives = held()
  let empty = false
  await catalogue(page)
  await customize(page)
  await over(page, async ({ path }) => {
    if (path === '/v1/mcp') {
      await natives.until
      return refused(503, 'the MCP server is restarting')
    }
    if (path === '/v1/tool/catalog') {
      if (empty) return { json: { catalog: [], total: 0 } }
      await shelf.until
      return refused(503, 'the shelf is reindexing')
    }
    return undefined
  })
  await page.goto('/-/customize/connectors')
  await expect(page.getByText('Loading connectors…')).toBeVisible()
  await page.getByRole('button', { name: 'Show built-in servers' }).click()
  await expect(page.getByText('Loading built-in servers…')).toBeVisible()
  shelf.release()
  natives.release()
  await expect(page.getByText(DOWN)).toHaveCount(2)
  await expect(page.getByText('the shelf is reindexing')).toHaveCount(0)
  await expect(page.getByText('the MCP server is restarting')).toHaveCount(0)

  empty = true
  await page.getByLabel('Search connectors').fill('stripe')
  await expect(page.getByText('No connector matches “stripe”.')).toBeVisible()
  await page.getByLabel('Search connectors').fill('')
  await expect(page.getByText('There are no connectors to add yet.')).toBeVisible()
})

test('connectors: a listing read in full, one that cannot be read, one already added, and one added from its card', async ({ page }) => {
  const listings: Record<string, unknown>[] = [
    // Hosted, and shipped as a package too.
    { ...LISTINGS[0]!, packages: [{ registry: 'npm', identifier: '@stripe/mcp', runtime: 'npx' }] },
    {
      id: 'io.local_files',
      name: 'io.local/files',
      title: 'Local files',
      vendor: 'io.local',
      version: '1.2.0',
      transports: ['stdio'],
      packages: [{ registry: 'npm', identifier: '@local/files-mcp', runtime: 'npx', version: '1.2.0' }],
      site: 'https://local.example',
      repo: 'https://github.com/local/files',
    },
    { id: 'io.wiki_mcp', name: 'io.wiki/mcp', title: 'Wiki', vendor: 'io.wiki', remotes: [{ transport: 'streamable-http', url: 'https://wiki.example/mcp' }] },
  ]
  await catalogue(page)
  await customize(page, [{ id: 'com-stripe', org: 'acme', name: 'Stripe', url: 'https://mcp.stripe.com', listing: 'com.stripe_mcp', createdAt: 1790000200 }])
  await over(page, ({ path }) => {
    if (path === '/v1/tool/catalog') return { json: { catalog: listings, total: 3, limit: 48, offset: 0 } }
    if (path === '/v1/tool/catalog/io.wiki_mcp') return refused(404, 'no such listing')
    if (path.startsWith('/v1/tool/catalog/')) return { json: listings.find((l) => l.id === path.split('/').pop()) }
    return undefined
  })
  await page.goto('/-/customize/connectors')
  await expect(page.getByLabel('Stripe is added')).toBeVisible()

  await page.getByRole('button', { name: 'Stripe', exact: true }).click()
  let about = page.getByRole('dialog', { name: 'Stripe' })
  await expect(about.getByText('npm · @stripe/mcp · npx')).toBeVisible()
  await expect(about.getByText(/ships only as a package/)).toHaveCount(0)
  await expect(about.getByRole('button', { name: 'Added' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Local files', exact: true }).click()
  about = page.getByRole('dialog', { name: 'Local files' })
  await expect(about.getByText('io.local · v1.2.0')).toBeVisible()
  await expect(about.getByText('npm · @local/files-mcp · 1.2.0 · npx')).toBeVisible()
  await expect(about.getByText('It ships only as a package, so it needs a place to run before it can be added here.')).toBeVisible()
  await expect(about.getByRole('link', { name: 'local.example' })).toHaveAttribute('href', 'https://local.example')
  await expect(about.getByRole('link', { name: 'github.com/local/files' })).toHaveAttribute('href', 'https://github.com/local/files')
  await expect(about.getByRole('button', { name: 'Add to your connectors' })).toHaveCount(0)
  await about.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Wiki', exact: true }).click()
  about = page.getByRole('dialog', { name: 'Wiki' })
  await expect(about.getByText('Showing what Browse listed. Not found. It may have been removed.')).toBeVisible()
  await expect(about.getByRole('button', { name: 'Add to your connectors' })).toBeEnabled()
  await page.keyboard.press('Escape')

  // A listing with no description is introduced by its name.
  await page.getByRole('button', { name: 'Add Wiki' }).click()
  const connect = page.getByRole('dialog', { name: 'Add Wiki' })
  await expect(connect.getByText('io.wiki/mcp', { exact: true })).toBeVisible()
  await expect(connect.getByLabel('Name')).toHaveAttribute('placeholder', 'Wiki')
  await connect.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('connectors: a member with none is told an org admin adds them, and reads the shelf without adding', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  await member(page)
  await over(page, ({ path }) => (path === '/v1/mcp' ? { json: { jsonrpc: '2.0', id: 1, result: { tools: [] } } } : undefined))
  await page.goto('/-/customize/connectors')
  await expect(page.getByText('Only an org admin can add or change connectors. You can see what is on.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add by URL' })).toHaveCount(0)
  await yours(page).click()
  await expect(page.getByText('An org admin adds connectors. Browse what there is.')).toBeVisible()
  await page.getByRole('button', { name: 'Browse connectors' }).click()
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Featured', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show built-in servers' }).click()
  await expect(page.getByText('No built-in servers are listed.')).toBeVisible()
  await page.getByRole('button', { name: 'Stripe', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Stripe' }).getByText('https://mcp.stripe.com · streamable-http')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to your connectors' })).toHaveCount(0)
})

test('connectors: a member opens a server and reads its tools’ switches without changing them', async ({ page }) => {
  await catalogue(page)
  await customize(page, [{ id: 'com-stripe', org: 'acme', name: 'Stripe', url: 'https://mcp.stripe.com', authHeader: 'Authorization', hasSecret: true, listing: 'com.stripe_mcp', createdAt: 1790000200 }])
  await member(page)
  await over(page, ({ path, query }) =>
    path === '/v1/tool' && query.includes('source=mcp')
      ? {
          json: {
            tools: [
              { name: 'com-stripe_create_payment_link', source: 'mcp', description: 'Create a payment link', activated: true },
              { name: 'com-stripe_list_customers', source: 'mcp', description: 'List customers', activated: false },
            ],
          },
        }
      : undefined,
  )
  await page.goto('/-/customize/connectors')
  await yours(page).click()
  // Its card says on, and has no switch.
  const card = page.getByRole('list', { name: 'Your connectors' }).getByRole('listitem').filter({ hasText: 'Stripe' })
  await expect(card.getByText('1 of 2 tools on · From Browse · Secret in KMS')).toBeVisible()
  await expect(card.getByRole('switch')).toHaveCount(0)
  await expect(card.getByText('On', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Stripe' }).click()
  const detail = page.getByRole('dialog', { name: 'Stripe' })
  await expect(detail.getByText('On', { exact: true })).toHaveCount(1)
  await expect(detail.getByText('Off', { exact: true })).toHaveCount(1)
  await expect(detail.getByText('Only an org admin can switch or remove connectors.')).toBeVisible()
  await expect(detail.getByRole('switch')).toHaveCount(0)
  await expect(detail.getByRole('button', { name: /^Turn all/ })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Remove connector' })).toHaveCount(0)
})

// Plugins.

test('plugins: yours and what is mounted, each while read, refused, empty, as answered, and searched', async ({ page }, info) => {
  type Mode = 'held' | 'none' | 'rows'
  const first = { yours: held(), mounted: held() }
  const mode: { yours: Mode; mounted: Mode } = { yours: 'held', mounted: 'held' }
  await catalogue(page)
  await customize(page)
  await over(page, async ({ path }) => {
    if (path === '/v1/tool/plugins/authored') {
      if (mode.yours === 'none') return { json: { plugins: [] } }
      if (mode.yours === 'rows') {
        return {
          json: {
            plugins: [
              { id: 'p1', name: 'acme', provider: 'acme', source: 'export const acme = 1', createdAt: 1790000300 },
              { id: 'p2', name: 'tiny', source: 'export const tiny = 2' },
            ],
          },
        }
      }
      await first.yours.until
      return refused(503, 'the runtime is restarting')
    }
    if (path === '/v1/tool/plugins') {
      if (mode.mounted === 'none') return { json: { plugins: [] } }
      if (mode.mounted === 'rows') return { json: { plugins: [{ name: 'git', enabled: true }, { name: 'tools', enabled: true, prefixes: ['/v1/tool'] }] } }
      await first.mounted.until
      return refused(503, 'the deployment did not say')
    }
    return undefined
  })
  await page.goto('/-/customize/plugins')
  const mineView = () => yours(page).click()
  const discover = () => browse(page).click()

  await expect(page.getByText('Loading built-in plugins…')).toBeVisible()
  first.mounted.release()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the deployment did not say')).toHaveCount(0)
  await mineView()
  await expect(page.getByText('Loading your plugins…')).toBeVisible()
  first.yours.release()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the runtime is restarting')).toHaveCount(0)

  mode.yours = 'none'
  mode.mounted = 'none'
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('No plugins yet', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Build a plugin' }).click()
  await page.getByRole('dialog', { name: 'Build a plugin' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await discover()
  await expect(page.getByText('Nothing built in is listed.')).toBeVisible()

  mode.yours = 'rows'
  mode.mounted = 'rows'
  await page.reload()
  await mineView()
  const mine = page.getByRole('list', { name: 'Your plugins' })
  const acme = mine.getByRole('listitem').filter({ hasText: 'acme' })
  await expect(acme.getByText('Reads the acme connector’s credential when it runs.')).toBeVisible()
  await expect(acme.getByText(/^Built /)).toBeVisible()
  await expect(mine.getByRole('listitem').filter({ hasText: 'tiny' })).toHaveText(/^T\s*tiny\s*Needs no credential\.$/)
  await page.screenshot({ path: info.outputPath('plugins-yours.png') })
  await page.getByLabel('Search plugins').fill('zzz')
  await expect(page.getByText('No plugin of yours matches “zzz”.')).toBeVisible()
  await page.getByLabel('Search plugins').fill('')

  await mine.getByRole('button', { name: 'acme', exact: true }).click()
  let source = page.getByRole('dialog', { name: 'acme' })
  await expect(source.getByText(/^Reads the acme connector’s credential when it runs\. Built .+\.$/)).toBeVisible()
  await expect(source.getByText('export const acme = 1')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await mine.getByRole('button', { name: 'tiny', exact: true }).click()
  source = page.getByRole('dialog', { name: 'tiny' })
  await expect(source.getByText('Needs no credential.', { exact: true })).toBeVisible()
  await source.getByRole('button', { name: 'Close' }).click()

  await discover()
  const mounted = page.getByRole('list', { name: 'Mounted subsystems' })
  // A subsystem that names no prefix is its name and whether it is on.
  await expect(mounted.getByRole('listitem').filter({ hasText: 'git' })).toHaveText(/^git\s*On$/)
  await expect(mounted.getByText('/v1/tool')).toBeVisible()
  await expect(page.getByText('2 built in', { exact: true })).toBeVisible()
  await page.getByLabel('Search plugins').fill('zzz')
  await expect(page.getByText('Nothing built in matches “zzz”.')).toBeVisible()
})

test('plugins: a build from TypeScript says its size and opens its source, and a build let go sends nothing', async ({ page }) => {
  await catalogue(page)
  await customize(page)
  const sent = await over(page, ({ path }) =>
    path === '/v1/tool/plugins/build'
      ? { status: 201, json: { bytes: 512, generated: false, plugin: { id: 'p9', name: 'tiny', source: 'export const tiny = 1', createdAt: 1790000400 } } }
      : undefined,
  )
  await page.goto('/-/customize/plugins')
  await page.getByRole('button', { name: 'Build plugin' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Build plugin' }).click()
  const dialog = page.getByRole('dialog', { name: 'Build a plugin' })
  await dialog.getByLabel('Name').fill('tiny')
  await dialog.getByLabel('Source').fill('export const tiny = 1')
  await dialog.getByRole('button', { name: 'Build', exact: true }).click()
  await expect(page.getByText('tiny built: 512 B.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'tiny' }).getByText('export const tiny = 1')).toBeVisible()
  expect(sentTo(sent, 'POST', '/v1/tool/plugins/build')).toHaveLength(1)
  expect(sentTo(sent, 'POST', '/v1/tool/plugins/build')[0]?.body).toEqual({ name: 'tiny', source: 'export const tiny = 1' })
})

// Agents.

test('agents: yours while read, refused, none, then as the platform answers them, and searched', async ({ page }, info) => {
  const first = held()
  let mode: 'held' | 'none' | 'rows' = 'held'
  const rows = [
    { name: 'lookout', runs: 1, tools: [], emoji: '🔭', cap_micro_usd: 2_000_000, max_task_micro_usd: 500_000 },
    { id: 'agent_7', name: 'spender', model: 'zen4', description: 'Spends carefully', runs: 2, tools: ['skill_triage', 'gh_search'], cap_micro_usd: 5_000_000, max_task_micro_usd: 1_000_000, consumed_micro_usd: 12_345, period: 'week' },
  ]
  await catalogue(page)
  await customize(page)
  const sent = await over(page, async ({ method, path }) => {
    if (path !== '/v1/agent' || method !== 'GET') return undefined
    if (mode === 'none') return { json: { agents: [] } }
    if (mode === 'rows') return { json: { agents: rows } }
    await first.until
    return refused(503, 'the agent store is down')
  })
  await page.goto('/-/customize/agents')
  await yours(page).click()
  await expect(page.getByText('Loading your agents…')).toBeVisible()
  first.release()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the agent store is down')).toHaveCount(0)

  const create = async (name: string) => {
    const dialog = page.getByRole('dialog', { name: 'New agent' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByLabel('Budget each period').fill('1')
    await dialog.getByLabel('Budget for one run').fill('0.5')
    await dialog.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText(`${name} is saved`)).toBeVisible()
  }
  mode = 'none'
  await page.getByRole('button', { name: 'New agent' }).click()
  await create('scout')
  await expect(page.getByText('No agents yet', { exact: true })).toBeVisible()
  await expect(page.getByText('Start from a preset, or give a new one a model, instructions and tools.')).toBeVisible()

  mode = 'rows'
  await page.getByRole('button', { name: 'New agent' }).last().click()
  await create('scout-2')
  expect(sentTo(sent, 'POST', '/v1/agent').map((s) => (s.body as { name: string }).name)).toEqual(['scout', 'scout-2'])

  const mine = page.getByRole('list', { name: 'Your agents' })
  const lookout = mine.getByRole('listitem').filter({ hasText: 'lookout' })
  await expect(lookout.getByText('No description.')).toBeVisible()
  await expect(lookout.getByText('1 run · 0 tools · $0 of $2 this period')).toBeVisible()
  await expect(lookout.getByText('🔭')).toBeVisible()
  await expect(mine.getByRole('listitem').filter({ hasText: 'spender' }).getByText('zen4 · 2 runs · 2 tools · $0.0123 of $5 this week')).toBeVisible()
  await page.screenshot({ path: info.outputPath('agents-thin.png') })
  await page.getByLabel('Search agents').fill('zzz')
  await expect(page.getByText('No agent of yours matches “zzz”.')).toBeVisible()
})

test('agents: one opened while read, one that cannot be read, one changed and refused, and one with no id deleted by its name', async ({ page }) => {
  const reading = held()
  const rows = [
    { name: 'lookout', runs: 1, tools: [], cap_micro_usd: 2_000_000, max_task_micro_usd: 500_000 },
    { id: 'agent_7', name: 'spender', model: 'zen4', description: 'Spends carefully', runs: 2, tools: ['skill_triage', 'gh_search'], cap_micro_usd: 5_000_000, max_task_micro_usd: 1_000_000, consumed_micro_usd: 12_345, period: 'week' },
    { id: 'agent_9', name: 'broken', runs: 0, tools: [] },
  ]
  await catalogue(page)
  await customize(page)
  const sent = await over(page, async ({ method, path }) => {
    if (path === '/v1/agent' && method === 'GET') return { json: { agents: rows } }
    if (path === '/v1/agent/lookout' && method === 'GET') {
      await reading.until
      return { json: { ...rows[0], instructions: 'Watch the queue.' } }
    }
    if (path === '/v1/agent/lookout' && method === 'DELETE') {
      rows.splice(0, 1)
      return { status: 204, text: '' }
    }
    if (path === '/v1/agent/agent_7' && method === 'GET') return { json: { ...rows.find((r) => r.name === 'spender'), instructions: 'Spend little.' } }
    if (path === '/v1/agent/agent_7' && method === 'PATCH') return refused(409, 'the budget is below what it has spent')
    if (path === '/v1/agent/agent_9') return refused(503, 'the agent store is down')
    return undefined
  })
  await page.goto('/-/customize/agents')
  await yours(page).click()
  const mine = page.getByRole('list', { name: 'Your agents' })

  await mine.getByRole('button', { name: 'broken' }).click()
  await expect(page.getByRole('dialog', { name: 'broken' }).getByText(DOWN)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await mine.getByRole('button', { name: 'spender' }).click()
  const dialog = page.getByRole('dialog', { name: 'spender' })
  // A model the catalog does not list is still the one shown.
  await expect(dialog.getByRole('button', { name: 'Model: zen4' })).toBeVisible()
  await expect(dialog.getByText('Spent $0.0123 this week. A run stops at either limit.')).toBeVisible()
  // A tool the agent names that is not on is listed, to be let go.
  await expect(dialog.getByText('not on', { exact: true })).toBeVisible()
  await dialog.getByRole('switch', { name: 'Use gh_search' }).click()
  await expect(dialog.getByText('1 chosen. It can call only these.')).toBeVisible()
  await dialog.getByLabel('Find a tool').fill('zzz')
  await expect(dialog.getByText('No tool matches.')).toBeVisible()
  await dialog.getByLabel('Find a tool').fill('')
  await dialog.getByRole('switch', { name: 'Every tool' }).click()
  await expect(dialog.getByText('Every tool the fleet’s MCP server serves when it runs.')).toBeVisible()
  await dialog.getByRole('switch', { name: 'Every tool' }).click()
  await expect(dialog.getByText('None chosen: it can call no tool.')).toBeVisible()
  await dialog.getByRole('switch', { name: 'Use skill_triage' }).click()
  await dialog.getByRole('button', { name: 'Model: zen4' }).click()
  await page.getByRole('option', { name: /^zen5\.8,/ }).click()
  await dialog.getByLabel('Description').fill('Spends less')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText('the budget is below what it has spent')).toBeVisible()
  expect(sentTo(sent, 'PATCH', '/v1/agent/agent_7').at(-1)?.body).toEqual({ model: 'zen5.8', description: 'Spends less', tools: ['skill_triage'] })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await mine.getByRole('button', { name: 'lookout' }).click()
  const lookout = page.getByRole('dialog', { name: 'lookout' })
  await expect(lookout.getByText('Loading the agent…')).toBeVisible()
  reading.release()
  await expect(lookout.getByLabel('Instructions')).toHaveValue('Watch the queue.')
  // It names no model: the deployment's default runs it.
  await expect(lookout.getByRole('button', { name: 'Model: The deployment’s default' })).toBeVisible()
  await lookout.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete lookout?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('lookout is deleted')).toBeVisible()
  expect(sentTo(sent, 'DELETE', '/v1/agent/lookout')).toHaveLength(1)
  await expect(mine.getByRole('button', { name: 'lookout' })).toHaveCount(0)
})

test('agents: the tools that are on while read, refused, and none, and a model chosen then left to the default', async ({ page }) => {
  const first = held()
  let mode: 'held' | 'none' = 'held'
  await catalogue(page)
  await customize(page)
  const sent = await over(page, async ({ path, query }) => {
    if (path !== '/v1/tool' || !query.includes('activated=true')) return undefined
    if (mode === 'none') return { json: { tools: [] } }
    await first.until
    return refused(503, 'the tool plane is down')
  })
  await page.goto('/-/customize/agents')
  await yours(page).click()
  await expect(page.getByRole('list', { name: 'Your agents' })).toBeVisible()

  await page.getByRole('button', { name: 'New agent' }).click()
  let dialog = page.getByRole('dialog', { name: 'New agent' })
  await expect(dialog.getByText('Loading the tools that are on…')).toBeVisible()
  first.release()
  await expect(dialog.getByText(DOWN)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  mode = 'none'
  await page.getByRole('button', { name: 'New agent' }).click()
  dialog = page.getByRole('dialog', { name: 'New agent' })
  await expect(dialog.getByText('No tool is on for your organization yet. Add skills or connectors first.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Model: The deployment’s default' }).click()
  await page.getByRole('option', { name: /^zen5\.8,/ }).click()
  await expect(dialog.getByRole('button', { name: 'Model: zen5.8' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Use the default' }).click()
  await expect(dialog.getByRole('button', { name: 'Model: The deployment’s default' })).toBeVisible()
  await dialog.getByLabel('Name').fill('plain')
  await dialog.getByLabel('Description').fill('Plain and simple')
  await dialog.getByLabel('Budget each period').fill('1')
  await dialog.getByLabel('Budget for one run').fill('1')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('plain is saved')).toBeVisible()
  const body = sentTo(sent, 'POST', '/v1/agent').at(-1)?.body as Record<string, unknown>
  expect(body).toEqual({ name: 'plain', description: 'Plain and simple', instructions: '', tools: [], cap_micro_usd: 1_000_000, max_task_micro_usd: 1_000_000, period: 'month' })
})

test('agents: presets while read, refused, none, one with no title, one already added, and a search that matches none', async ({ page }) => {
  const first = held()
  let mode: 'held' | 'none' | 'rows' = 'held'
  await catalogue(page)
  await customize(page)
  await over(page, async ({ path }) => {
    if (path !== '/v1/agent/chat/presets') return undefined
    if (mode === 'none') return { json: { presets: [] } }
    if (mode === 'rows') {
      return {
        json: {
          presets: [
            { id: 'scout', serverExecuted: true },
            { id: 'helper', title: 'Helper', systemPrompt: 'Answer questions.', serverExecuted: true },
          ],
        },
      }
    }
    await first.until
    return refused(503, 'the presets are unavailable')
  })
  await page.goto('/-/customize/agents')
  const again = async () => {
    await yours(page).click()
    await browse(page).click()
  }
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Loading presets…')).toBeVisible()
  first.release()
  await expect(page.getByText(DOWN)).toBeVisible()
  await expect(page.getByText('the presets are unavailable')).toHaveCount(0)

  mode = 'none'
  await again()
  await expect(page.getByText('There are no presets yet. Start from a blank agent with New agent.')).toBeVisible()

  mode = 'rows'
  await again()
  const presets = page.getByRole('list', { name: 'Presets' })
  // A preset named by its id alone, and one the org already has an agent of.
  await expect(presets.getByRole('listitem').filter({ hasText: 'scout' })).toHaveText(/^scout\s*Preset scout\s*Use$/)
  await expect(page.getByLabel('Helper is added')).toBeVisible()
  await page.getByRole('button', { name: 'Use scout' }).click()
  const dialog = page.getByRole('dialog', { name: 'New agent' })
  await expect(dialog.getByLabel('Name')).toHaveValue('scout')
  await expect(dialog.getByLabel('Description')).toHaveValue('')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Search agents').fill('zzz')
  await expect(page.getByText('No preset matches “zzz”.')).toBeVisible()
})

// Slow, and empty.

test('a read that hangs gives up after fifteen seconds, says so plainly, and asks again', async ({ page }) => {
  let hang = true
  await catalogue(page)
  await customize(page)
  await over(page, async ({ path }) => {
    if (path !== '/v1/agent/chat/presets' || !hang) return undefined
    await new Promise(() => {})
    return undefined
  })
  await page.clock.install()
  await page.goto('/-/customize/agents')
  await expect(page.getByText('Loading presets…')).toBeVisible()
  await page.clock.runFor(14_000)
  await expect(page.getByText('Loading presets…')).toBeVisible()
  await page.clock.runFor(2_000)
  await expect(page.getByText('Hanzo is taking too long to answer. Try again.')).toBeVisible()
  hang = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Product & Fashion Create', { exact: true })).toBeVisible()
})

test('an org with nothing of its own is shown what to add first, and each empty Yours names the next step', async ({ page }, info) => {
  await catalogue(page)
  await customize(page)
  await over(page, ({ method, path, query }) => {
    if (path === '/v1/tool/skills/authored') return { json: { skills: [] } }
    if (path === '/v1/tool/skills' && method === 'GET') return { json: { tools: [] } }
    if (path === '/v1/tool/plugins/authored') return { json: { plugins: [] } }
    if (path === '/v1/agent' && method === 'GET') return { json: { agents: [] } }
    if (path === '/v1/tool' && query.includes('activated=true')) return { json: { tools: [] } }
    return undefined
  })
  await page.goto('/-/customize')
  // Browse first, with nothing counted on Yours.
  await expect(browse(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(yours(page)).toHaveAccessibleName('Yours')
  await expect(page.getByRole('list', { name: 'Skills to add' })).toBeVisible()

  const steps: [string, string, string[]][] = [
    ['Skills', 'No skills yet', ['Browse skills', 'Write a skill']],
    ['Connectors', 'No connectors yet', ['Browse connectors', 'Add by URL']],
    ['Plugins', 'No plugins yet', ['Build a plugin']],
    ['Agents', 'No agents yet', ['Browse presets', 'New agent']],
  ]
  for (const [tab, title, buttons] of steps) {
    await page.getByRole('tab', { name: tab }).click()
    await expect(browse(page), tab).toHaveAttribute('aria-pressed', 'true')
    await yours(page).click()
    await expect(page.getByText(title, { exact: true })).toBeVisible()
    for (const b of buttons) await expect(page.getByRole('button', { name: b }).last(), `${tab}: ${b}`).toBeVisible()
    await page.screenshot({ path: info.outputPath(`empty-${tab.toLowerCase()}.png`) })
  }
  await page.getByRole('button', { name: 'Browse presets' }).click()
  await expect(page.getByRole('heading', { name: 'Start from a preset' })).toBeVisible()
})
