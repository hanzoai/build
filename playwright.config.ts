import { defineConfig } from '@playwright/test'

/**
 * The site, driven in a browser. `pnpm site` checks what hanzo.build serves;
 * `SITE=http://localhost:3200 pnpm site` checks the dev server before a push.
 * Screenshots of every screen land in test-results/.
 */
export default defineConfig({
  testDir: 'src/e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: process.env.SITE || 'https://hanzo.build',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  },
})
