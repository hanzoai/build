/**
 * The builder's own screens in the reader's language (translated.tsx), as a
 * host that mounts @hanzo/i18n draws them: Customize's Skills in French — the
 * tabs, the choice of half, the search, a shelf's heading, count and Add, and a
 * skill added, each word the catalog's, a skill's name its own and what is
 * sent unchanged — and the Library right to left in Arabic: its heading at the
 * line's start on the right, the kinds and the day in Arabic, an item's name
 * its own, nothing past the edge.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import type { Lang } from './language.tsx'
import { catalogue, customize, library } from './stubs.ts'

/** A French catalog this spec writes, so what is drawn is checked against what was written. */
const FR: Record<string, string> = {
  Customize: 'Personnaliser',
  Skills: 'Compétences',
  Connectors: 'Connecteurs',
  'Know-how an agent reads before it works.': 'Le savoir-faire qu’un agent lit avant de travailler.',
  Show: 'Afficher',
  Browse: 'Parcourir',
  Yours: 'Les vôtres',
  'Search skills': 'Rechercher des compétences',
  'Search skills…': 'Rechercher des compétences…',
  'New skill': 'Nouvelle compétence',
  'From Hanzo': 'De Hanzo',
  'Add one and every run in your organization can use it.': 'Ajoutez-en une et chaque exécution de votre organisation peut l’utiliser.',
  '{n} skills': '{n} compétences',
  'Add {name}': 'Ajouter {name}',
  Add: 'Ajouter',
  '{name} is added': '{name} est ajoutée',
  Added: 'Ajoutée',
}

const AR: Record<string, string> = {
  Library: 'المكتبة',
  'Search your library': 'ابحث في مكتبتك',
  Kind: 'النوع',
  All: 'الكل',
  Images: 'صور',
  Videos: 'فيديوهات',
  Documents: 'مستندات',
  Today: 'اليوم',
  Yesterday: 'أمس',
  'Open {name}': 'افتح {name}',
}

/** Opens `path` in the builder's app inside the provider, in `lang`. */
async function open(p: Page, path: string, lang: Lang): Promise<void> {
  await p.addInitScript((l) => {
    ;(window as unknown as { lang: Lang }).lang = l
  }, lang)
  await p.route(`**${path}`, async (r) => {
    if (r.request().resourceType() !== 'document') return r.fallback()
    const res = await r.fetch({ url: new URL('/', r.request().url()).href })
    const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/translated.tsx')
    await r.fulfill({ response: res, body: html })
  })
  await p.goto(path)
  await expect(p.locator('html')).toHaveAttribute('lang', lang.locale, { timeout: 45_000 })
}

const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

test('in French, Customize’s Skills is the catalog’s words, a skill’s name its own, and Add sends what it always sent', async ({ page }) => {
  await catalogue(page)
  const sent = await customize(page)
  await open(page, '/-/customize/skills', { locale: 'fr-FR', catalog: FR })

  await expect(page.getByRole('tablist', { name: FR.Customize })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('tab', { name: FR.Skills })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: FR.Connectors })).toBeVisible()
  // The choice of half: its words, and the count beside Yours as a figure.
  const half = page.getByRole('group', { name: FR.Show })
  await expect.poll(() => half.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([FR.Browse, `${FR.Yours}, 2`])
  await expect(page.getByRole('textbox', { name: FR['Search skills'] })).toHaveAttribute('placeholder', FR['Search skills…']!)

  // The shelf: its heading and line, its count, and a word the catalog lacks in English, never a key.
  await expect(page.getByRole('heading', { name: FR['From Hanzo'] })).toBeVisible()
  await expect(page.getByText(FR['Add one and every run in your organization can use it.']!)).toBeVisible()
  await expect(page.getByText('3 compétences', { exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Skills to add' })).toBeVisible()
  await expect(page.getByLabel('git_branches est ajoutée')).toBeVisible()
  await shot(page, 'translated-fr-skills.png')

  // Add, named in French around the skill's own name; the request is the one it always was.
  await page.getByRole('button', { name: 'Ajouter git_repos' }).click()
  await expect(page.getByLabel('git_repos est ajoutée')).toBeVisible()
  expect(sent.filter((s) => s.method === 'PUT' && s.path === '/v1/tool/activation').at(-1)?.body).toEqual({ activate: ['skill_git_repos'], deactivate: [] })
  await expect(half.getByRole('button', { name: `${FR.Yours}, 3` })).toBeVisible()
})

test('in Arabic, the Library reads right to left: its heading on the right, the kinds and the day in Arabic, nothing past the edge', async ({ page }) => {
  await library(page)
  await open(page, '/-/artifacts', { locale: 'ar', catalog: AR })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

  const heading = page.getByRole('heading', { name: AR.Library, exact: true })
  await expect(heading).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('textbox', { name: AR['Search your library'] })).toHaveAttribute('placeholder', AR['Search your library']!)
  const kinds = page.getByRole('radiogroup', { name: AR.Kind })
  for (const word of [AR.All!, AR.Images!, AR.Videos!, AR.Documents!]) await expect(kinds.getByRole('radio', { name: word })).toBeVisible()
  await expect(page.getByRole('group', { name: AR.Today })).toBeVisible()
  await expect(page.getByRole('group', { name: AR.Yesterday })).toContainText('Monday summary.md')
  // An item's name is its own, set apart inside the Arabic around it.
  await expect(page.getByRole('button', { name: /^افتح .*Lighthouse at dawn\.png/ })).toBeVisible()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(heading).toBeVisible()
    const box = (await heading.boundingBox())!
    const bar = (await kinds.boundingBox())!
    // The heading and the kinds start at the right of the column they share.
    expect(box.x + box.width).toBeGreaterThan(width / 2)
    expect(Math.abs(box.x + box.width - (bar.x + bar.width))).toBeLessThanOrEqual(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await shot(page, `translated-ar-library-${width}.png`)
  }
})
