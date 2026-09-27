import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `--coverage` keeps raw V8 for `pnpm cover` to merge with the browser's (cover/).
    coverage: { provider: 'custom', customProviderModule: './cover/unit.ts' },
  },
})
