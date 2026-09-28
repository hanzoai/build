import { defineConfig } from '@playwright/test'

/**
 * The page, driven in a browser. `pnpm site` checks the dev server on :3200;
 * `SITE=<origin> pnpm site` checks another. Screenshots of every screen land in
 * test-results/.
 */
export default defineConfig({
  testDir: 'src/e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: process.env.SITE || 'http://localhost:3200',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  },
})
