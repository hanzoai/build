/**
 * `pnpm cover`: one coverage number for the builder, from its unit tests and
 * its browser specs together.
 *
 *   1. vitest runs with coverage, keeping raw V8 under coverage/unit (unit.ts)
 *   2. a dev server starts on a free port, and the whole Playwright suite runs
 *      against it, each page keeping raw V8 under coverage/browser (fixture.ts)
 *   3. both are merged by original source into one report under coverage/:
 *      html/index.html, lcov.info and coverage-summary.json; the table of every file
 *      short of 100%, with the lines no test reached, is printed and kept in
 *      gaps.txt
 *
 * Every number is read from the one conversion the three reports share, so the
 * page, lcov, the summary and the table agree line for line.
 *
 * Arguments go to Playwright, so `pnpm cover src/e2e/run.spec.ts` measures the
 * unit tests and one spec. A failed test fails the run once the report is out.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import MCR from 'monocart-coverage-reports'

import { OUT, raw, scope } from './index.ts'

const bin = (name: string) => `node_modules/.bin/${name}`

/** Runs a command to its end with this terminal; answers its exit code. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  return new Promise((done) => spawn(cmd, args, { stdio: 'inherit', env }).on('exit', (code) => done(code ?? 1)))
}

/** A port nothing is listening on. */
function free(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer()
    s.on('error', fail)
    s.listen(0, () => {
      const { port } = s.address() as { port: number }
      s.close(() => done(port))
    })
  })
}

/** The dev server on `port`, once it answers. */
async function serve(port: number): Promise<ChildProcess> {
  const vite = spawn(bin('vite'), ['--port', String(port), '--strictPort'], { stdio: 'ignore' })
  for (let i = 0; i < 120; i++) {
    if (vite.exitCode !== null) throw new Error(`vite exited with ${vite.exitCode}`)
    const up = await fetch(`http://localhost:${port}/`).then((r) => r.ok, () => false)
    if (up) return vite
    await new Promise((r) => setTimeout(r, 250))
  }
  vite.kill()
  throw new Error(`the dev server did not answer on ${port}`)
}

const METRICS = ['lines', 'statements', 'functions', 'branches'] as const
type Summary = Record<string, Record<(typeof METRICS)[number], { total: number; covered: number; pct: number }>>

/** Per file, from lcov: the lines no test ran, and the lines with a branch no test took. */
function unreached(lcov: string): Map<string, { missed: number[]; partly: number[] }> {
  const out = new Map<string, { missed: number[]; partly: number[] }>()
  let file = { missed: [] as number[], partly: [] as number[] }
  for (const line of lcov.split('\n')) {
    const [tag, rest = ''] = line.split(':')
    const f = rest.split(',')
    if (tag === 'SF') out.set(rest, (file = { missed: [], partly: [] }))
    else if (tag === 'DA' && f[1] === '0') file.missed.push(Number(f[0]))
    else if (tag === 'BRDA' && (f[3] === '0' || f[3] === '-')) file.partly.push(Number(f[0]))
  }
  for (const f of out.values()) {
    f.missed = [...new Set(f.missed)].sort((a, b) => a - b)
    f.partly = [...new Set(f.partly)].filter((n) => !f.missed.includes(n)).sort((a, b) => a - b)
  }
  return out
}

/** Line numbers as ranges: 3,4,5,9 → 3-5, 9. */
function ranges(lines: number[]): string {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const from = lines[i]!
    while (lines[i + 1] === lines[i]! + 1) i++
    out.push(from === lines[i] ? `${from}` : `${from}-${lines[i]}`)
  }
  return out.join(', ')
}

/** The totals, then every file short of 100% on any of the four, least covered first. */
function gaps(summary: Summary, lcov: string): string {
  const where = unreached(lcov)
  const cols = (m: Summary[string]) => METRICS.map((k) => `${m[k].pct.toFixed(2)}%`.padStart(9)).join('')
  const files = Object.keys(summary).filter((f) => f !== 'total')
  const short = files.filter((f) => METRICS.some((k) => summary[f]![k].pct < 100)).sort((a, b) => summary[a]!.lines.pct - summary[b]!.lines.pct)
  const rows = short.map((f) => {
    const w = where.get(f)
    const says = [w?.missed.length ? `not run ${ranges(w.missed)}` : '', w?.partly.length ? `branch not taken ${ranges(w.partly)}` : ''].filter(Boolean).join('; ')
    return `${f.padEnd(34)}${cols(summary[f]!)}  ${says}`
  })
  const head = `${'file'.padEnd(34)}${['lines', 'stmts', 'funcs', 'branches'].map((k) => k.padStart(9)).join('')}`
  return [head, `${'all files'.padEnd(34)}${cols(summary.total!)}`, '', ...rows, '', `${short.length} of ${files.length} files under 100%.`, ''].join('\n')
}

rmSync(OUT, { recursive: true, force: true })

const unit = await run(bin('vitest'), ['run', '--coverage'])

const port = await free()
const vite = await serve(port)
const browser = await run(bin('playwright'), ['test', ...process.argv.slice(2)], { ...process.env, SITE: `http://localhost:${port}` })
vite.kill()

await MCR(raw('browser')).generate()
await MCR({
  ...scope,
  name: 'hanzo.build',
  outputDir: OUT,
  clean: false,
  inputDir: [`${OUT}/unit/raw`, `${OUT}/browser/raw`],
  // A file no test loaded counts too, at nothing covered.
  all: { dir: ['src'] },
  reports: [['html', { subdir: 'html' }], ['lcovonly', { file: 'lcov.info' }], ['json-summary', { file: 'coverage-summary.json' }]],
}).generate()

const table = gaps(JSON.parse(readFileSync(`${OUT}/coverage-summary.json`, 'utf8')) as Summary, readFileSync(`${OUT}/lcov.info`, 'utf8'))
writeFileSync(`${OUT}/gaps.txt`, table)
console.log(`\n${table}`)

process.exit(unit || browser)
