/**
 * Dictating into New's composer with a microphone: Chromium's own fake device
 * and a granted permission stand in for one, so the page records with the real
 * MediaRecorder through @hanzo/voice — the microphone Chat's composer has — and
 * the platform's transcription is stubbed (composer.ts). And
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

/** The composer's microphone (@hanzo/voice), by what it says it will do. */
const dictate = (page: Page) => page.locator('[data-slot="composer"] button[aria-pressed]').first()

/** Record a moment, then stop. */
async function speak(page: Page) {
  await expect(dictate(page)).toHaveAccessibleName('Dictate', { timeout: 45_000 })
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Dictating — click to stop')
  await page.waitForTimeout(1500)
  await dictate(page).click()
}

test('press to record, press to stop: the platform hears it and the words land in the draft', async ({ page }, info) => {
  let release = () => {}
  const hold = new Promise<void>((done) => (release = done))
  const { heardBy } = await composer(page, { hold })
  await page.goto('/')
  await expect(dictate(page)).toHaveAccessibleName('Dictate', { timeout: 45_000 })
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Dictating — click to stop')
  await expect(dictate(page)).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: info.outputPath('dictating.png') })
  await page.waitForTimeout(1500)
  await dictate(page).click()
  await expect(dictate(page)).toHaveAttribute('aria-pressed', 'false')
  release()
  await expect(ask(page)).toHaveValue('add a cart')
  await expect(dictate(page)).toHaveAccessibleName('Dictate')
  // Heard by the platform's ear (the same one Chat dictates into), in this browser's language.
  expect(heardBy[0]).toMatch(/name="model"\r\n\r\nzen-scribe\r\n/)
  expect(heardBy[0]).toMatch(/name="language"\r\n\r\nen\r\n/)
})

test('the platform’s refusal is worn by the microphone', async ({ page }) => {
  await composer(page, { heard: { status: 502, text: 'the ear is down' } })
  await page.goto('/')
  await speak(page)
  await expect(dictate(page)).toHaveAccessibleName(/Hanzo speech is unavailable/)
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

test('dictation listens in the language saved in Settings', async ({ page }) => {
  const { heardBy } = await composer(page, { prefs: { language: 'fr' } })
  const read = page.waitForResponse((r) => new URL(r.url()).pathname === '/v1/pref' && r.request().method() === 'GET')
  await page.goto('/')
  await read
  // The saved language is drawn a frame after the read lands.
  await page.waitForTimeout(500)
  await speak(page)
  await expect(ask(page)).toHaveValue('add a cart')
  expect(heardBy[0]).toMatch(/name="language"\r\n\r\nfr\r\n/)
})

test('leaving New while recording stops the microphone and still hears what was said', async ({ page }) => {
  const { heardBy } = await composer(page)
  await page.goto('/')
  await expect(dictate(page)).toHaveAccessibleName('Dictate', { timeout: 45_000 })
  await dictate(page).click()
  await expect(dictate(page)).toHaveAccessibleName('Dictating — click to stop')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(page).toHaveURL(/\/-\/projects$/)
  await expect.poll(() => heardBy.length).toBe(1)
})

test('a page that is not a secure context has no microphone to offer, and says so', async ({ page, baseURL }) => {
  await signIn(page, () => undefined)
  await page.goto(`http://build.test:${new URL(baseURL!).port}/`)
  const mic = page.getByRole('button', { name: 'Voice needs a secure (https) connection. Type your message instead.' })
  await expect(mic).toHaveAttribute('aria-disabled', 'true', { timeout: 45_000 })
})
