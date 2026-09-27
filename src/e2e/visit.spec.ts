/**
 * A visitor: the product's header over New, at each width, and every way out of
 * it. hanzo.ai answers 204, so a click that leaves is caught as the navigation
 * it asks for and the measured page stays; hanzo.id answers a bare page, so each
 * door is the popup it opens.
 */
import type { Page } from '@playwright/test'

import { cramped, expect, test } from './fixture.ts'
import { serve } from './signed.ts'

async function visit(page: Page) {
  await page.context().route('https://hanzo.id/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Hanzo</title>Sign in' }))
  await page.route(/^https:\/\/(hanzo\.ai|docs\.hanzo\.ai)\//, (r) => r.fulfill({ status: 204 }))
  await serve(page, () => undefined)
  await page.goto('/')
  await expect(page.getByText('What’s up next?')).toBeVisible()
}

/** The address a click asks for, where the page is not let go. */
async function leaves(page: Page, click: () => Promise<void>) {
  const [nav] = await Promise.all([page.waitForRequest((r) => r.isNavigationRequest() && r.url().startsWith('https://')), click()])
  return nav.url()
}

async function door(page: Page, click: () => Promise<void>) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), click()])
  const url = new URL(popup.url())
  await popup.close()
  return url
}

test('a visitor sees the header, not the rail, and each resource leaves for its page', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await visit(page)
  const bar = page.getByRole('banner')
  await expect(page.getByRole('navigation', { name: 'Runs' })).toHaveCount(0)
  await expect(bar.getByRole('button', { name: 'Menu' })).toBeHidden()
  expect(await cramped(page)).toEqual([])
  await page.screenshot({ path: info.outputPath('visit-laptop.png') })

  for (const [label, href] of [
    ['Docs', 'https://docs.hanzo.ai/'],
    ['Blog', 'https://hanzo.ai/blog'],
    ['Customers', 'https://hanzo.ai/customers'],
    ['Learn', 'https://hanzo.ai/learn'],
    ['Support', 'https://hanzo.ai/support'],
  ]) {
    await bar.getByRole('button', { name: 'Resources' }).click()
    const menu = page.getByRole('menu', { name: 'Resources' })
    expect(await leaves(page, () => menu.getByText(label, { exact: true }).click())).toBe(href)
    await page.keyboard.press('Escape')
  }
})

test('both doors in open IAM beside the page, and the draft stays', async ({ page }) => {
  await visit(page)
  await page.getByRole('textbox').first().fill('a landing page for a bakery')
  const bar = page.getByRole('banner')
  for (const name of ['Log in', 'Sign up']) {
    const url = await door(page, () => bar.getByRole('button', { name, exact: true }).click())
    expect(url.hostname).toBe('hanzo.id')
    expect(url.searchParams.get('client_id')).toBe('hanzo-build')
  }
  await expect(page.getByRole('textbox').first()).toHaveValue('a landing page for a bakery')
})

test('the name leads back to New from anywhere a visitor opened', async ({ page }) => {
  await visit(page)
  await page.goto('/-/templates')
  await expect(page.getByRole('banner')).toBeVisible()
  await page.getByRole('button', { name: 'Hanzo Build', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('What’s up next?')).toBeVisible()
})

test('on a phone the places fold into one menu, which leaves and signs in', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page)
  const bar = page.getByRole('banner')
  await expect(bar.getByRole('navigation', { name: 'Site' })).toBeHidden()
  await expect(bar.getByRole('button', { name: 'Sign up', exact: true })).toBeHidden()
  expect(await cramped(page)).toEqual([])

  await bar.getByRole('button', { name: 'Menu' }).click()
  const menu = page.getByRole('menu', { name: 'Menu' })
  await page.screenshot({ path: info.outputPath('visit-phone-menu.png') })
  expect(await leaves(page, () => menu.getByText('Features', { exact: true }).click())).toBe('https://hanzo.ai/app')
  await page.keyboard.press('Escape')

  await bar.getByRole('button', { name: 'Menu' }).click()
  expect(await leaves(page, () => page.getByRole('menu', { name: 'Menu' }).getByText('Docs', { exact: true }).click())).toBe('https://docs.hanzo.ai/')
  await page.keyboard.press('Escape')

  await bar.getByRole('button', { name: 'Menu' }).click()
  const url = await door(page, () => page.getByRole('menu', { name: 'Menu' }).getByText('Sign up', { exact: true }).click())
  expect(url.hostname).toBe('hanzo.id')
  await expect(page.getByRole('menu', { name: 'Menu' })).toHaveCount(0)
})

test('sending as a visitor asks them to sign in first', async ({ page }) => {
  await visit(page)
  const box = page.getByRole('textbox').first()
  await box.fill('fix the flaky test')
  const url = await door(page, () => box.press('Enter'))
  expect(url.hostname).toBe('hanzo.id')
})
