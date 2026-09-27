/**
 * Unit coverage, as vitest's coverage module (`vitest run --coverage`): each
 * worker takes V8's precise coverage of what it ran, and the provider pairs
 * every script with the code vite ran for it and that code's source map, and
 * keeps it raw for run.ts to merge with the browser's.
 *
 * vitest runs a module inside a wrapper function; the worker records how long
 * the wrapper is (`startOffset`), and monocart pads the source by as much so
 * V8's offsets land on the right characters.
 */
import inspector from 'node:inspector/promises'
import { fileURLToPath } from 'node:url'
import type { CoverageProvider, CoverageProviderModule, ResolvedCoverageOptions, Vitest } from 'vitest/node'

import { raw } from './index.ts'

interface Script {
  url: string
  startOffset?: number
  functions: unknown[]
}

// One profiler per worker process. The runner evaluates this module afresh for
// each test file it isolates, so the session lives on the process, not the module.
const worker = globalThis as { coverage?: { session: inspector.Session; on: boolean } }
const profiler = (worker.coverage ??= { session: new inspector.Session(), on: false })

const unit: CoverageProviderModule = {
  async startCoverage() {
    if (profiler.on) return
    profiler.on = true
    profiler.session.connect()
    await profiler.session.post('Profiler.enable')
    await profiler.session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true })
  },

  async takeCoverage(options) {
    const { result } = await profiler.session.post('Profiler.takePreciseCoverage')
    const ours = result.filter((s) => s.url.startsWith('file://') && !s.url.includes('/node_modules/'))
    return { result: ours.map((s) => ({ ...s, startOffset: options?.moduleExecutionInfo?.get(fileURLToPath(s.url))?.startOffset ?? 0 })) }
  },

  async stopCoverage({ isolate }) {
    if (!isolate || !profiler.on) return
    profiler.on = false
    await profiler.session.post('Profiler.stopPreciseCoverage')
    await profiler.session.post('Profiler.disable')
    profiler.session.disconnect()
  },

  async getProvider(): Promise<CoverageProvider> {
    const { default: MCR } = await import('monocart-coverage-reports')
    const report = MCR(raw('unit'))
    let ctx: Vitest
    // vitest hands each file's coverage over without waiting for it to be kept.
    const pending: Promise<unknown>[] = []

    const keep = async (scripts: Script[], environment: string, name: string | undefined) => {
      const project = ctx.projects.find((p) => p.name === name) ?? ctx.getRootProject()
      const env = project.vite.environments[environment] ?? project.vite.environments.ssr!
      const list = []
      for (const s of scripts) {
        const ran = await env.transformRequest(fileURLToPath(s.url)).catch(() => null)
        if (ran) list.push({ ...s, scriptOffset: s.startOffset, source: ran.code, sourceMap: ran.map ?? undefined })
      }
      if (list.length) await report.add(list)
    }

    return {
      name: 'monocart',
      initialize(v) {
        ctx = v
        report.cleanCache()
      },
      resolveOptions: () => ctx.config.coverage as ResolvedCoverageOptions,
      clean() {},
      onAfterSuiteRun({ coverage, environment, projectName }) {
        const scripts = (coverage as { result?: Script[] } | undefined)?.result
        if (scripts?.length) pending.push(keep(scripts, environment, projectName))
      },
      async generateCoverage() {
        await Promise.all(pending)
        return {}
      },
      async reportCoverage() {
        await report.generate()
      },
    }
  },
}

export default unit
