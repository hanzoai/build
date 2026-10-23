/**
 * Projects in the reader's language (language-projects.tsx), as a host that
 * mounts @hanzo/i18n draws it: the heading and its line, the two ways in, the
 * GitHub line, the list's columns, rows and pages, and the empty page's two
 * cards — each word the catalog's, a repository's name, org and branch its
 * own. Right to left, the page mirrors: a row's name at its right, when it
 * moved at its left, a card's arrow turned, nothing past the edge.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import type { Lang } from './language.tsx'

const AGO = new Date(Date.now() - 10 * 60_000).toISOString()

/** Two repositories, the newest first, as the forge lists them. */
const REPOS = [
  { name: 'universe', org: 'acme', description: 'The cluster, declared', defaultBranch: 'main', updatedAt: AGO },
  { name: 'site', org: 'acme', description: '', defaultBranch: 'next', updatedAt: AGO },
]

/** A French catalog this spec writes, so what is drawn is checked against what was written. */
const FR: Record<string, string> = {
  Projects: 'Projets',
  '{org}’s repositories on the forge. Open one to work on it.': 'Les dépôts de {org} sur la forge. Ouvrez-en un pour y travailler.',
  'Create from template': 'Créer depuis un modèle',
  'Link a GitHub repo': 'Lier un dépôt GitHub',
  'Connect GitHub to bring your repositories here': 'Connectez GitHub pour amener vos dépôts ici',
  'One step on GitHub, then pick the repositories to sync.': 'Une étape sur GitHub, puis choisissez les dépôts à synchroniser.',
  'Connect GitHub': 'Connecter GitHub',
  'Find a project…': 'Trouver un projet…',
  'Find a project': 'Trouver un projet',
  Name: 'Nom',
  Branch: 'Branche',
  Updated: 'Mis à jour',
  'Sort by name': 'Trier par nom',
  'Open {repo}': 'Ouvrir {repo}',
  'Showing {from}–{to} of {total}': '{from}–{to} sur {total}',
  'Previous page': 'Page précédente',
  Prev: 'Préc.',
  'Next page': 'Page suivante',
  'No projects yet. A project is a repository: link one from GitHub, or start one from a template.':
    'Aucun projet pour l’instant. Un projet est un dépôt : liez-en un depuis GitHub, ou partez d’un modèle.',
  'Start from a finished product — a site, an app, a store — and make it yours.': 'Partez d’un produit fini — un site, une app, une boutique — et faites-le vôtre.',
}

const AR: Record<string, string> = {
  Projects: 'المشاريع',
  Name: 'الاسم',
  Updated: 'آخر تحديث',
  'Open {repo}': 'افتح {repo}',
  'Link a GitHub repo': 'اربط مستودع GitHub',
  'Create from template': 'أنشئ من قالب',
}

async function open(p: Page, lang: Lang, repos: object[]): Promise<void> {
  await p.route(
    (u) => u.pathname.startsWith('/v1/'),
    (r) => {
      const path = new URL(r.request().url()).pathname
      if (path === '/v1/git/repos') return r.fulfill({ json: { data: repos } })
      if (path === '/v1/provider/github/user') return r.fulfill({ json: { configured: true, connected: false } })
      return r.fulfill({ status: 404, json: { detail: 'not here' } })
    },
  )
  await p.addInitScript((l) => {
    ;(window as unknown as { lang: Lang }).lang = l
  }, lang)
  await p.route('**/-/language-projects', async (r) => {
    const res = await r.fetch({ url: new URL('/', r.request().url()).href })
    const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/language-projects.tsx')
    await r.fulfill({ response: res, body: html })
  })
  await p.goto('/-/language-projects')
  await expect(p.locator('html')).toHaveAttribute('lang', lang.locale, { timeout: 45_000 })
}

const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

test('in French, Projects is the catalog’s words around the forge’s own names', async ({ page }) => {
  await open(page, { locale: 'fr-FR', catalog: FR }, REPOS)

  await expect(page.getByRole('heading', { name: FR.Projects })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText('Les dépôts de acme sur la forge. Ouvrez-en un pour y travailler.')).toBeVisible()
  await expect(page.getByRole('button', { name: FR['Create from template'] })).toBeVisible()
  await expect(page.getByRole('button', { name: FR['Link a GitHub repo'] })).toBeVisible()
  await expect(page.getByText(FR['Connect GitHub to bring your repositories here']!)).toBeVisible()
  await expect(page.getByText(FR['One step on GitHub, then pick the repositories to sync.']!)).toBeVisible()
  await expect(page.getByRole('button', { name: FR['Connect GitHub'] })).toBeVisible()

  // The list: the columns in French, each row by its own name, org and branch.
  await expect(page.getByLabel(FR['Find a project']!)).toHaveAttribute('placeholder', FR['Find a project…']!)
  await expect(page.getByRole('button', { name: FR['Sort by name'] })).toHaveText(FR.Name!)
  await expect(page.getByText(FR.Branch!, { exact: true })).toBeVisible()
  // A word the catalog lacks is its English, never a key.
  await expect(page.getByRole('button', { name: 'Sort by last updated' })).toHaveText(FR.Updated!)
  const universe = page.getByRole('button', { name: 'Ouvrir acme/universe' })
  await expect(universe).toContainText('acme/universe')
  await expect(universe).toContainText('The cluster, declared')
  await expect(universe).toContainText('main')
  await expect(page.getByRole('button', { name: 'Ouvrir acme/site' })).toContainText('next')
  await expect(page.getByText('1–2 sur 2')).toBeVisible()
  await expect(page.getByRole('button', { name: FR['Previous page'] })).toHaveText(FR.Prev!)
  await expect(page.getByRole('button', { name: FR['Next page'] })).toHaveText('Next')
  await shot(page, 'language-projects-fr.png')
})

test('in French, the empty page offers its two ways in, in the catalog’s words', async ({ page }) => {
  await open(page, { locale: 'fr-FR', catalog: FR }, [])
  await expect(page.getByText(FR['No projects yet. A project is a repository: link one from GitHub, or start one from a template.']!)).toBeVisible({ timeout: 45_000 })
  const card = page.getByRole('button', { name: FR['Create from template'] }).last()
  await expect(card).toContainText(FR['Start from a finished product — a site, an app, a store — and make it yours.']!)
  // The other card's line the catalog lacks: English.
  await expect(page.getByRole('button', { name: FR['Link a GitHub repo'] }).last()).toContainText('Mirror repositories you already have.')
  await shot(page, 'language-projects-fr-empty.png')
})

test('in Arabic, Projects reads right to left: a row’s name at its right, when it moved at its left, nothing past the edge', async ({ page }) => {
  await open(page, { locale: 'ar', catalog: AR }, REPOS)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: AR.Projects })).toBeVisible({ timeout: 45_000 })

  // A value in right-to-left words is isolated, so the name is matched around it.
  const row = page.getByRole('button', { name: /^افتح .*acme\/universe/ })
  const box = (await row.boundingBox())!
  const middle = box.x + box.width / 2
  const org = (await row.getByText('acme/', { exact: true }).boundingBox())!
  const name = (await row.getByText('universe', { exact: true }).boundingBox())!
  const when = (await row.getByText(/ago$/).boundingBox())!
  expect(name.x).toBeGreaterThan(middle)
  expect(when.x + when.width).toBeLessThan(middle)
  // The address keeps its own order: acme/ before universe, read left to right.
  expect(org.x + org.width).toBeLessThanOrEqual(name.x + 1)
  // The header's columns stand the same way: Name at the right, Updated at the left.
  const head = (await page.getByText(AR.Name!, { exact: true }).boundingBox())!
  const updated = (await page.getByText(AR.Updated!, { exact: true }).boundingBox())!
  expect(head.x).toBeGreaterThan(updated.x)

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await shot(page, `language-projects-ar-${width}.png`)
  }
})

test('in Arabic, the empty page’s cards point along the line: their arrows turn', async ({ page }) => {
  await open(page, { locale: 'ar', catalog: AR }, [])
  const card = page.getByRole('button', { name: AR['Link a GitHub repo'] }).last()
  await expect(card).toBeVisible({ timeout: 45_000 })
  const arrow = card.locator('[data-i18n-mirror]')
  await expect(arrow).toHaveCount(1)
  expect(await arrow.evaluate((e) => getComputedStyle(e).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)')
  await shot(page, 'language-projects-ar-empty.png')
})
