/**
 * Dictating into New's composer with a microphone: Chromium's own fake device
 * and a granted permission stand in for one, so the page records with the real
 * MediaRecorder and the platform's transcription is stubbed (composer.ts). And
 * a page served somewhere that is not a secure context, where a browser offers
 * no microphone at all — `build.test` is this dev server by another name.
 */
import type { Page } from '@playwright/test'

import { ask, composer, status } from './composer.ts'
import { expect, test } from './fixture.ts'
import { signIn } from './signed.ts'

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--host-resolver-rules=MAP build.test [::1]'] },
  permissions: ['microphone'],
})

/** The composer's language chip, which names no language of its own. */
const language = (page: Page) => page.getByRole('button', { name: 'Dictation language:', exact: true })
const dictate = (page: Page) => page.getByRole('button', { name: /^(Dictate|Stop and transcribe|Transcribing…)$/ })

/** Record a moment, then stop. */
async function speak(page: Page) {
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Stop and transcribe')
  await page.waitForTimeout(400)
  await dictate(page).click()
}

test('press to record, press to stop: the platform hears it and the words land in the draft', async ({ page }, info) => {
  let release = () => {}
  const hold = new Promise<void>((done) => (release = done))
  const { heardBy } = await composer(page, { hold })
  await page.goto('/')
  await expect(dictate(page)).toHaveAccessibleName('Dictate')
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Stop and transcribe')
  await expect(dictate(page)).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: info.outputPath('dictating.png') })
  await page.waitForTimeout(600)
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Transcribing…')
  await expect(dictate(page)).toHaveAttribute('aria-disabled', 'true')
  release()
  await expect(ask(page)).toHaveValue('add a cart')
  await expect(dictate(page)).toHaveAccessibleName('Dictate')
  // Heard by the platform, in this browser's language.
  expect(heardBy[0]).toMatch(/name="model"\r\n\r\nwhisper\r\n/)
  expect(heardBy[0]).toMatch(/name="language"\r\n\r\nen\r\n/)
})

test('the platform’s refusal is said', async ({ page }) => {
  await composer(page, { heard: { status: 502, text: 'the ear is down' } })
  await page.goto('/')
  await speak(page)
  await expect(status(page)).toHaveText('Transcription failed (502): the ear is down')
})

test('silence adds nothing to the draft', async ({ page }) => {
  const { heardBy } = await composer(page, { heard: { json: { text: '   ' } } })
  await page.goto('/')
  await ask(page).fill('Keep this')
  await speak(page)
  await expect.poll(() => heardBy.length).toBe(1)
  await expect(dictate(page)).toHaveAccessibleName('Dictate')
  await expect(ask(page)).toHaveValue('Keep this')
})

test('dictation listens in the saved language, and a new one is saved', async ({ page }) => {
  const { sent, heardBy } = await composer(page, { prefs: { language: 'fr' } })
  await page.goto('/')
  await language(page).click()
  await expect(page.getByRole('option', { name: 'Français' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('option', { name: 'Deutsch' }).click()
  await expect.poll(() => sent.filter((s) => s.method === 'PATCH' && s.path === '/v1/pref').map((s) => s.body)).toEqual([{ language: 'de' }])
  await speak(page)
  await expect(ask(page)).toHaveValue('add a cart')
  expect(heardBy[0]).toMatch(/name="language"\r\n\r\nde\r\n/)
})

test('a language the platform will not save is said, and not kept', async ({ page }) => {
  await composer(page)
  await page.route('**/v1/pref', (r) => (r.request().method() === 'PATCH' ? r.fulfill({ status: 503, json: { detail: 'Settings are read-only right now.' } }) : r.fallback()))
  await page.goto('/')
  await language(page).click()
  await page.getByRole('option', { name: '日本語' }).click()
  await expect(status(page)).toHaveText('Settings are read-only right now.')
  await language(page).click()
  await expect(page.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true')
})

test('leaving New while recording stops the microphone and still hears what was said', async ({ page }) => {
  const { heardBy } = await composer(page)
  await page.goto('/')
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Stop and transcribe')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page).toHaveURL(/\/-\/projects$/)
  await expect.poll(() => heardBy.length).toBe(1)
})

test('a page that is not a secure context has no microphone to offer, and says so', async ({ page, baseURL }) => {
  await signIn(page, () => undefined)
  await page.goto(`http://build.test:${new URL(baseURL!).port}/`)
  const mic = page.getByRole('button', { name: 'Dictation needs a microphone this page can record' })
  await expect(mic).toHaveAttribute('aria-disabled', 'true')
  await expect(language(page)).toHaveAttribute('aria-disabled', 'true')
})
