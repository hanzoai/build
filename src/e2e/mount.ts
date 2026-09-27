/**
 * Opening the builder under a host other than hanzo.build's own (mount.tsx):
 * the dev server's page, with its entry swapped for the mount, so the page
 * is served exactly as the app's is — the same stylesheets and module graph —
 * and only the host differs.
 */
import type { Page } from '@playwright/test'

import type { Theme } from '../api/pref.ts'
import type { Person } from '../host.tsx'

/** What the host offers. Anything left out, it does not. */
export interface Mount {
  path: string
  org: string | null
  admin: boolean
  person: Person | null
  token: string | null
  memberships?: string[]
  theme?: Theme
}

/** Opens `path` in a builder mounted by the host `m` describes. */
export async function mounted(page: Page, m: Omit<Mount, 'token'> & { token?: string | null }): Promise<void> {
  await page.addInitScript((mount) => {
    ;(window as unknown as { mount: Mount }).mount = mount
  }, { token: m.person ? 'x.e30.x' : null, ...m })
  await page.route('**/-/mount', async (r) => {
    const res = await r.fetch({ url: new URL('/', r.request().url()).href })
    const html = (await res.text()).replace('/src/app/main.tsx', '/src/e2e/mount.tsx')
    await r.fulfill({ response: res, body: html })
  })
  await page.goto('/-/mount')
}

/** Where the builder moved or linked out to, in order. */
export function went(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { went: string[] }).went)
}
