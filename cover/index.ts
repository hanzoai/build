/**
 * What coverage counts, stated once for every side that measures it: the
 * builder's own source under src/, named by its path from the repository root —
 * not its unit tests, the browser specs, or type declarations.
 *
 * Both sides hand monocart raw V8 coverage with the code that actually ran and
 * its source map, and keep it raw under coverage/<side>/raw, so `pnpm cover`
 * merges them by original source into one report (run.ts).
 */
import type { CoverageReportOptions } from 'monocart-coverage-reports'

export const OUT = 'coverage'

/**
 * A source's name in the report: from `src/` on, without a query. The unit side
 * names a module by its path or file URL, the browser side by the address the
 * dev server served it at (`localhost-<port>/src/…`), and a module's source map
 * names its source bare, beside the module (`distFile`).
 */
export function named(path: string, info?: { distFile?: string }): string {
  const p = path.split('?')[0]!
  if (p.startsWith('src/')) return p
  const at = p.indexOf('/src/')
  if (at >= 0) return p.slice(at + 1)
  const beside = info?.distFile ? named(info.distFile) : ''
  return beside.startsWith('src/') && !p.includes('/') ? beside.slice(0, beside.lastIndexOf('/') + 1) + p : p
}

/** Whether a source counts toward coverage. */
export function counted(path: string): boolean {
  const p = named(path)
  return p.startsWith('src/') && !p.startsWith('src/e2e/') && !/\.test\.tsx?$/.test(p) && !p.endsWith('.d.ts')
}

/** The filters every report of this repository's coverage applies. */
export const scope: CoverageReportOptions = {
  logging: 'error',
  entryFilter: (entry) => counted(entry.url),
  sourcePath: named,
  sourceFilter: counted,
}

/** Raw V8 coverage from one side, kept to be merged. */
export function raw(side: 'unit' | 'browser'): CoverageReportOptions {
  return { ...scope, name: side, outputDir: `${OUT}/${side}`, reports: 'raw' }
}
