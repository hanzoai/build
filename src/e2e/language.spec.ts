/**
 * An empty Chat's composer in the reader's language (language.tsx), as a host
 * that mounts @hanzo/i18n draws it: the panel toggle, the composer's
 * placeholder, `+` and its menu, dictation and voice mode, the row under the
 * frame (model, effort, mode) and its menus, and the starters — each word the
 * catalog's, a model's name its own, and a starter's prompt sent in the words
 * pressed. Right to left, the frame mirrors: `+` at the right, the row's
 * choices at the left, nothing past the edge.
 */
import type { Page } from '@playwright/test'

import { expect, test } from './fixture.ts'
import type { Lang } from './language.tsx'

/** The model list the row reads. */
const CATALOG = { data: [{ id: 'enso-auto', name: 'Enso', family: 'enso', class: 'ours', supports_reasoning: true }] }

/** A French catalog this spec writes, so what is drawn is checked against what was written. */
const FR: Record<string, string> = {
  'Show tabs': 'Afficher les onglets',
  'Show tabs ({keys})': 'Afficher les onglets ({keys})',
  'Type / for skills': 'Tapez / pour les compétences',
  'Add files, agents, skills and more': 'Ajouter des fichiers, des agents, des compétences et plus',
  'Upload or add files': 'Importer ou ajouter des fichiers',
  Skills: 'Compétences',
  'No skills yet': 'Aucune compétence pour l’instant',
  Research: 'Recherche',
  Memory: 'Mémoire',
  'Dictation settings': 'Réglages de la dictée',
  'Voice mode': 'Mode vocal',
  Send: 'Envoyer',
  'Model: {name}': 'Modèle : {name}',
  'Effort: {level}': 'Réflexion : {level}',
  Effort: 'Réflexion',
  'Adaptive reasoning based on task complexity': 'Réflexion adaptée à la complexité de la tâche',
  'Mode: {mode}': 'Mode : {mode}',
  Auto: 'Automatique',
  Manual: 'Manuel',
  Suggestions: 'Idées',
  'Ask what Hanzo can do for you': 'Demandez ce que Hanzo peut faire pour vous',
  'What can you do for me? Give me three concrete things to try today.': 'Que peux-tu faire pour moi ? Donne-moi trois choses concrètes à essayer aujourd’hui.',
  'Dismiss {suggestion}': 'Ignorer {suggestion}',
}

const AR: Record<string, string> = {
  'Type / for skills': 'اكتب / للمهارات',
  'Add files, agents, skills and more': 'أضف ملفات ووكلاء ومهارات والمزيد',
  'Voice mode': 'الوضع الصوتي',
  Auto: 'تلقائي',
}

async function open(p: Page, lang: Lang): Promise<void> {
  await p.route(
    (u) => u.pathname.startsWith('/v1/'),
    (r) => {
      const path = new URL(r.request().url()).pathname
      if (path === '/v1/models') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(CATALOG) })
      return r.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not here"}' })
    },
  )
  await p.addInitScript((l) => {
    ;(window as unknown as { lang: Lang }).lang = l
  }, lang)
  await p.route('**/-/language', async (r) => {
    const res = await r.fetch({ url: new URL('/', r.request().url()).href })
    const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/language.tsx')
    await r.fulfill({ response: res, body: html })
  })
  await p.goto('/-/language')
  await expect(p.getByRole('textbox', { name: 'Message' })).toBeVisible({ timeout: 45_000 })
  await expect(p.locator('html')).toHaveAttribute('lang', lang.locale)
}

const went = (p: Page) => p.evaluate(() => window.went.map((w) => JSON.parse(w) as unknown))
const shot = (p: Page, name: string) => p.screenshot({ path: test.info().outputPath(name) })

test('in French, every word of an empty Chat’s composer is the catalog’s', async ({ page }) => {
  await open(page, { locale: 'fr-FR', catalog: FR })

  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', FR['Type / for skills']!)
  const tabs = page.getByRole('button', { name: FR['Show tabs'], exact: true })
  await expect(tabs).toHaveAttribute('title', /^Afficher les onglets \((Ctrl\+Shift\+B|⌘⇧B)\)$/)
  await expect(page.getByRole('button', { name: FR['Voice mode'] })).toBeVisible()
  await expect(page.getByRole('button', { name: FR['Dictation settings'] })).toBeVisible()

  // The row under the frame: the model by its own name, the effort and the mode in French.
  await expect(page.getByLabel('Modèle : Enso', { exact: true })).toHaveText('Enso')
  const effort = page.getByLabel('Réflexion : Automatique', { exact: true })
  await expect(effort).toBeVisible()
  await expect(page.getByLabel('Mode : Automatique', { exact: true })).toHaveText('Automatique')
  await effort.click()
  const efforts = page.getByRole('listbox', { name: 'Réflexion' })
  await expect(efforts.getByRole('option', { name: /Automatique/ })).toContainText('Réflexion adaptée à la complexité de la tâche')
  // A word the catalog lacks is its English, never a key.
  await expect(efforts.getByRole('option', { name: /XHigh/ })).toContainText('Extended multi-step reasoning for hard tasks')
  await page.keyboard.press('Escape')

  // `+`, its rows, and a shelf's empty sentence.
  await page.getByRole('button', { name: FR['Add files, agents, skills and more'] }).click()
  for (const word of [FR['Upload or add files']!, FR.Skills!, FR.Research!, FR.Memory!]) await expect(page.getByRole('menuitem', { name: word }).or(page.getByRole('menuitemcheckbox', { name: word }))).toBeVisible()
  await page.getByRole('menuitem', { name: FR.Skills }).hover()
  await expect(page.getByText(FR['No skills yet']!)).toBeVisible()
  await shot(page, 'language-fr-plus.png')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // The starters: drawn in French, and the one pressed sends its prompt in French.
  await expect(page.getByRole('list', { name: FR.Suggestions })).toBeVisible()
  const ask = FR['Ask what Hanzo can do for you']!
  await expect(page.getByRole('button', { name: `Ignorer ${ask}` })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Build a landing page with Dev', exact: true })).toBeVisible()
  await page.getByRole('button', { name: ask, exact: true }).click()
  expect(await went(page)).toEqual([{ kind: 'send', prompt: FR['What can you do for me? Give me three concrete things to try today.'] }])

  // With words in the draft, the round is Send.
  await page.getByRole('textbox', { name: 'Message' }).fill('Bonjour')
  await expect(page.getByRole('button', { name: FR.Send })).toBeVisible()
  await shot(page, 'language-fr.png')
})

test('in Arabic, the frame reads right to left: `+` at its right, the row’s choices at its left, nothing past the edge', async ({ page }) => {
  await open(page, { locale: 'ar', catalog: AR })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', AR['Type / for skills']!)

  const frame = (await page.locator('[data-slot="composer"]').first().boundingBox())!
  const plus = (await page.getByRole('button', { name: AR['Add files, agents, skills and more'] }).boundingBox())!
  const talk = (await page.getByRole('button', { name: AR['Voice mode'] }).boundingBox())!
  const mind = (await page.locator('[data-slot="mind"]').boundingBox())!
  const middle = frame.x + frame.width / 2
  expect(plus.x).toBeGreaterThan(middle)
  expect(talk.x).toBeLessThan(middle)
  expect(mind.x + mind.width).toBeLessThan(middle)
  await expect(page.getByLabel(/تلقائي/)).toHaveText(['A', 'تلقائي'])

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await shot(page, `language-ar-${width}.png`)
  }
})
