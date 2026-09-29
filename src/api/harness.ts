/**
 * The agent's own output, read as cards.
 *
 * A sandbox run's agent is `dev exec`, and everything it prints reaches the
 * run's session as `log` chunks (apps/sandbox work.go). It prints each item of
 * its turn under a header line (hanzo dev, exec/src/event_processor_with_human_output.rs):
 *
 *   user / <task>                        what the agent was asked
 *   exec / <command> in <dir>            a command started
 *    succeeded in 12ms: / <output>       …how it ended, then what it printed
 *   codex / <text>                        the agent said something
 *   apply patch / patch: completed / <paths>, then the turn's diff
 *   mcp: server/tool (completed)          a tool call
 *   web search: <query>
 *     ✓ step / → step / • step            its plan
 *   tokens used / <n>                     the end; the final message follows once more, bare
 *
 * The sandbox's older harness (dev 0.6.94) prints another grammar: it stamps
 * each item `[2026-09-29T16:07:35] ` and spells its headers its own way —
 * `User instructions:`, `dev`, `thinking`, `exec <command> in <dir>`,
 * `<command> succeeded in 1m 05s:`, `tool <call>`, `🌐 Search: <query>`,
 * `apply_patch auto_approved=true:`, `turn diff:`, `tokens used: <n>`. A stamped
 * line starts an item and says where the unstamped lines after it belong
 * (`stamped`). Every stamped line no header owns is the harness's diagnostics.
 *
 * Warnings, errors, retries and diagnostics are the agent's log, one collapsed
 * step, never the conversation; token counts are dropped.
 *
 * The chunks are cut by a clock, not by line, so a line is read only once it
 * is whole. Lines no header owns — reasoning, or the tail of output from before
 * the recorded events begin — are prose. Everything here becomes TEXT on the
 * screen; nothing is markup.
 *
 * The task under `user` is what the person asked, with what the platform told
 * the agent ahead of it and what a follow-up said after it taken off (`asked`),
 * so it opens the transcript as the person's own words.
 */
import type { Card, Ran } from './turn.ts'

type Said = Extract<Card, { kind: 'said' }>
type Shell = Extract<Card, { kind: 'shell' | 'read' }>
type Edit = Extract<Card, { kind: 'edit' }>
type Step = Extract<Card, { kind: 'step' }>

/** Colour codes a terminal would have drawn; a sandbox is not a terminal, but a harness may still print them. */
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

/**
 * A shell command's words, as `sh` splits them: quotes grouped, `'"'"'`
 * joined, a backslash escaping the next character outside single quotes.
 */
export function words(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let open = false
  let q = ''
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (q === "'") {
      if (c === "'") q = ''
      else cur += c
      continue
    }
    if (q === '"') {
      if (c === '"') q = ''
      else if (c === '\\' && i + 1 < line.length) cur += line[++i]
      else cur += c
      continue
    }
    if (c === "'" || c === '"') {
      q = c
      open = true
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[++i]
      open = true
    } else if (/\s/.test(c)) {
      if (open) out.push(cur)
      cur = ''
      open = false
    } else {
      cur += c
      open = true
    }
  }
  if (open) out.push(cur)
  return out
}

/** The command a harness ran, out of the `bash -lc '…'` it wraps each one in. */
export function unwrap(command: string): string {
  const w = words(command)
  if (w.length === 3 && /(^|\/)(ba|z)?sh$/.test(w[0]!) && (w[1] === '-lc' || w[1] === '-c')) return w[2]!
  return command
}

/**
 * The file a command only reads, or ''. `cat f`, `nl -ba f`, `sed -n '1,80p' f`,
 * `head -n 40 f`, `tail f` — one file, and nothing piped, chained or redirected.
 */
export function reads(command: string): string {
  const inner = unwrap(command)
  if (/[|;&<>`$]/.test(inner)) return ''
  const [cmd, ...args] = words(inner)
  const one = (xs: string[]) => {
    const files = xs.filter((a) => !a.startsWith('-'))
    return files.length === 1 ? files[0]! : ''
  }
  switch (cmd) {
    case 'cat':
    case 'nl':
      return one(args)
    case 'sed':
      return args.length === 3 && args[0] === '-n' && /^\d+(,\d+)?p$/.test(args[1]!) ? args[2]! : ''
    case 'head':
    case 'tail':
      return one(args[0] === '-n' ? args.slice(2) : args)
  }
  return ''
}

/** A path to show: a relative one as it is, an absolute one by its name — never the sandbox's layout. */
export const shown = (path: string): string => {
  if (!path.startsWith('/')) return path
  const cut = path.replace(/\/+$/, '')
  return cut.slice(cut.lastIndexOf('/') + 1)
}

/**
 * The paragraphs the platform puts ahead of a task — the ask_user line and the
 * environment brief (apps/coding sandboxrunner.go), a plan's or a setup's
 * instructions and the setup's answer block (mode.go) — and the one a follow-up
 * puts after the person's words (coding.ts `followUp`). None is theirs.
 */
const AHEAD = /^(When a decision needs the person you are working for, call ask_user|These environment variables are named on this codebase|This codebase's (install script|start command)|Plan only\. Read the repository|Set up this repository's development environment\.|```environment\n)/
const AFTER = /^(This follows an earlier run on this codebase|An earlier run already worked on this;|Continue where the earlier run left off\.)/

/** What the person asked, out of the task the agent was given. A follow-up with nothing said keeps its own line. */
export function asked(task: string): string {
  const parts = task.trim().split(/\n\s*\n/)
  while (parts.length && AHEAD.test(parts[0]!)) parts.shift()
  if (parts.length > 1 && AFTER.test(parts[parts.length - 1]!)) parts.pop()
  return parts.join('\n\n')
}

/** A unified diff's sections, by the path each changes, from its first hunk on. */
export function sections(diff: string): Map<string, string> {
  const out = new Map<string, string>()
  let at = ''
  let lines: string[] = []
  const close = () => {
    if (at) out.set(at, lines.join('\n'))
  }
  for (const line of diff.split('\n')) {
    const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (m) {
      close()
      at = m[2]!
      lines = []
    } else if (at && (lines.length || line.startsWith('@@'))) lines.push(line)
  }
  close()
  return out
}

const HEAD = /^(exec|codex|thinking|user|apply patch|tokens used|turn interrupted|context compacted)$/
/** The older harness's stamp on each item it starts. */
const STAMP = /^\[\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z?\] /
/** How long a stamped command or tool took: `14ms`, `2.1s`, `1m 05s`, `1h 02m`. */
const TOOK = '(?: in [\\dhms. ]+)?'
const RAN = new RegExp(`^(.+) (succeeded|exited (-?\\d+))${TOOK}:$`)
const CALLED = new RegExp(`^(.+) (success|failed)${TOOK}:$`)
const PATCHED = new RegExp(`^apply_patch\\(.*\\) exited (-?\\d+)${TOOK}:$`)
const LEAD = /^(patch|mcp|web search|warning|ERROR|deprecated|model rerouted|hook): /
const RESULT = /^\s*(succeeded|exited (-?\d+)|declined|in progress)( in [\d.]+m?s)?:$/

type Mode = 'prose' | 'config' | 'user' | 'command' | 'output' | 'agent' | 'patch' | 'diff' | 'tokens' | 'final'

/** A reader that appends the cards it finds to `out`, keyed by `mint`. */
export function harness(out: Card[], mint: () => string) {
  let rest = ''
  let mode: Mode = 'prose'
  // The banner is a rule, the settings, and a rule.
  let rules = 0
  let card: Card | null = null
  let final: string[] = []
  const open: Shell[] = []
  const edits: { card: Edit; paths: string[] }[] = []
  let edit: { card: Edit; paths: string[] } | null = null
  let diff: string[] | null = null
  // Each task the agent was given, as the person's words once the whole block is read.
  const tasks: { card: Said; lines: string[] }[] = []

  const said = (text: string): Said => {
    const c: Said = { kind: 'said', key: mint(), who: 'agent', text }
    out.push(c)
    return c
  }
  const patch = (): { card: Edit; paths: string[] } => {
    const c: Edit = { kind: 'edit', key: mint(), files: [], patch: '', ran: 'running' }
    out.push(c)
    edit = { card: c, paths: [] }
    edits.push(edit)
    return edit
  }
  // The diff printed after a patch is the turn's so far; the edit keeps the latest.
  const settle = () => {
    if (diff && edit) edit.card.patch = diff.join('\n')
    diff = null
  }
  const step = (name: string, detail: string, ran: Ran): Step => {
    const c: Step = { kind: 'step', key: mint(), name, detail, output: '', ran }
    out.push(c)
    return c
  }

  // The agent's log: its warnings, errors and diagnostics, one step for the run.
  let log: Step | null = null
  const logged = (text: string) => {
    if (!log) log = step('Agent log', '', 'done')
    log.output += log.output ? `\n${text}` : text
  }

  // THE STAMPED GRAMMAR. Where the unstamped lines after the last stamped one go.
  type Sink = 'none' | 'drop' | 'banner' | 'task' | 'said' | 'out' | 'patch' | 'diff' | 'log'
  let stamped = false
  let sink: Sink = 'none'
  let into: Said | Shell | Step | null = null
  // A stamped command or tool is ended by name: its text as the harness printed it.
  const running = new Map<string, Shell | Step>()
  const begin = (item: Shell | Step, name: string) => {
    running.set(name, item)
  }
  const end = (name: string, ok: boolean): Shell | Step | null => {
    const item = running.get(name)
    if (!item) return null
    running.delete(name)
    item.ran = ok ? 'done' : 'error'
    return item
  }
  const stamp = (l: string) => {
    settle()
    into = null
    sink = 'none'
    if (/^Hanzo Dev v\S+$/.test(l)) {
      rules = 0
      sink = 'banner'
      return
    }
    if (l.startsWith('binary: ')) {
      sink = 'banner'
      return
    }
    if (l === 'User instructions:') {
      const c: Said = { kind: 'said', key: mint(), who: 'person', text: '' }
      out.push(c)
      tasks.push({ card: c, lines: [] })
      sink = 'task'
      return
    }
    if (l === 'dev') {
      into = said('')
      sink = 'said'
      return
    }
    if (l === 'thinking') {
      into = step('Thinking', '', 'done')
      sink = 'out'
      return
    }
    const exec = /^exec (.+) in (\S+)$/.exec(l)
    if (exec) {
      const file = reads(exec[1]!)
      const c: Shell = file
        ? { kind: 'read', key: mint(), file: shown(file), ran: 'running' }
        : { kind: 'shell', key: mint(), command: unwrap(exec[1]!), output: '', ran: 'running' }
      out.push(c)
      begin(c, exec[1]!)
      return
    }
    const ran = RAN.exec(l)
    if (ran) {
      const c = end(ran[1]!, ran[2] === 'succeeded')
      if (c) {
        // A read's output is the file it read, which the chip already names.
        into = c
        sink = c.kind === 'shell' ? 'out' : 'drop'
        return
      }
    }
    const custom = /^tool (.+) (success|failed)$/.exec(l)
    if (custom) {
      into = end(custom[1]!, custom[2] === 'success') ?? step(custom[1]!, 'tool', custom[2] === 'success' ? 'done' : 'error')
      sink = 'out'
      return
    }
    const tool = /^tool (.+)$/.exec(l)
    if (tool) {
      into = step(tool[1]!, 'tool', 'running')
      begin(into, tool[1]!)
      sink = 'out'
      return
    }
    const called = CALLED.exec(l)
    if (called && running.has(called[1]!)) {
      into = end(called[1]!, called[2] === 'success')
      sink = 'out'
      return
    }
    const search = /^🌐 Search: (.*)$/.exec(l)
    if (search) {
      step('Web search', search[1]!, 'done')
      return
    }
    if (/^apply_patch auto_approved=\w+:$/.test(l)) {
      patch()
      sink = 'patch'
      return
    }
    const patched = PATCHED.exec(l)
    if (patched) {
      if (edit) edit.card.ran = patched[1] === '0' ? 'done' : 'error'
      sink = 'drop'
      return
    }
    if (l === 'turn diff:') {
      diff = []
      sink = 'diff'
      return
    }
    if (/^tokens used: [\d,]+$/.test(l)) return
    if (/^task (interrupted|aborted)/.test(l)) {
      for (const item of running.values()) item.ran = 'cancelled'
      running.clear()
      out.push({ kind: 'note', key: mint(), text: 'The agent was interrupted' })
      return
    }
    logged(l)
    sink = 'log'
  }
  // An unstamped line of the stamped grammar, where the last stamped line said.
  const under = (l: string) => {
    switch (sink) {
      case 'banner':
        if (l === '--------' && ++rules === 3) sink = 'none'
        return
      case 'task':
        tasks[tasks.length - 1]!.lines.push(l)
        return
      case 'said':
        if (into && into.kind === 'said') into.text += into.text ? `\n${l}` : l
        return
      case 'out':
        if (into && (into.kind === 'shell' || into.kind === 'step')) into.output += into.output ? `\n${l}` : l
        return
      case 'patch': {
        const file = /^[AMD] (.+?)(?: -> (.+))?$/.exec(l)
        if (file && edit) edit.paths.push(file[2] ?? file[1]!)
        return
      }
      case 'diff':
        diff!.push(l)
        return
      case 'log':
        if (l.trim()) logged(l)
        return
      case 'drop':
        return
    }
    if (l.trim()) logged(l)
  }

  const line = (raw: string) => {
    const l = raw.replace(ANSI, '').replace(/\r$/, '')
    const at = STAMP.exec(l)
    if (at) {
      stamped = true
      stamp(l.slice(at[0].length))
      return
    }
    if (stamped) {
      under(l)
      return
    }
    if (mode === 'config') {
      if (l === '--------' && ++rules === 2) mode = 'prose'
      return
    }
    if (mode === 'command') {
      const cut = l.lastIndexOf(' in ')
      const command = cut > 0 ? l.slice(0, cut) : l
      const file = reads(command)
      const c: Shell = file
        ? { kind: 'read', key: mint(), file: shown(file), ran: 'running' }
        : { kind: 'shell', key: mint(), command: unwrap(command), output: '', ran: 'running' }
      out.push(c)
      open.push(c)
      card = null
      mode = 'prose'
      return
    }
    if (mode === 'tokens') {
      mode = 'final'
      return
    }
    if (mode === 'diff' && !HEAD.test(l) && !LEAD.test(l)) {
      diff!.push(l)
      return
    }
    // A task is the person's words to the next header, whatever they look like.
    if (mode === 'user' && !HEAD.test(l)) {
      tasks[tasks.length - 1]!.lines.push(l)
      return
    }
    const result = RESULT.exec(l)
    if (result && open.length) {
      settle()
      const c = open.pop()!
      c.ran = result[1] === 'succeeded' ? 'done' : result[1] === 'declined' ? 'cancelled' : result[1] === 'in progress' ? 'running' : 'error'
      card = c
      mode = 'output'
      return
    }
    if (HEAD.test(l)) {
      settle()
      card = null
      switch (l) {
        case 'exec':
          mode = 'command'
          return
        case 'codex':
        case 'thinking':
          card = said('')
          mode = 'agent'
          return
        case 'user': {
          const c: Said = { kind: 'said', key: mint(), who: 'person', text: '' }
          out.push(c)
          tasks.push({ card: c, lines: [] })
          mode = 'user'
          return
        }
        case 'apply patch':
          patch()
          mode = 'prose'
          return
        case 'tokens used':
          mode = 'tokens'
          return
        default:
          out.push({ kind: 'note', key: mint(), text: l === 'turn interrupted' ? 'The agent was interrupted' : 'The agent compacted its context' })
          mode = 'prose'
          return
      }
    }
    if (/^Hanzo Dev v\S+$/.test(l)) {
      settle()
      mode = 'config'
      rules = 0
      return
    }
    const patched = /^patch: (completed|failed|declined|in_progress)$/.exec(l)
    if (patched) {
      settle()
      const e = edit && edit.card.ran === 'running' ? edit : patch()
      e.card.ran = patched[1] === 'completed' ? 'done' : patched[1] === 'in_progress' ? 'running' : 'error'
      card = null
      mode = 'patch'
      return
    }
    if (mode === 'patch' && l.startsWith('diff --git ')) {
      diff = [l]
      mode = 'diff'
      return
    }
    const mcp = /^mcp: (\S+) (started|\((completed|failed|in_progress)\))$/.exec(l)
    if (mcp) {
      settle()
      const ran: Ran = mcp[3] === 'completed' ? 'done' : mcp[3] === 'failed' ? 'error' : 'running'
      const started = [...out].reverse().find((c) => c.kind === 'step' && c.name === mcp[1] && c.ran === 'running')
      if (started && started.kind === 'step' && mcp[2] !== 'started') started.ran = ran
      else step(mcp[1]!, 'tool', ran)
      card = null
      mode = 'prose'
      return
    }
    const web = /^web search: (.*)$/.exec(l)
    if (web) {
      settle()
      const prior = out[out.length - 1]
      // Printed when the search starts and again when it lands: one card.
      if (!(prior && prior.kind === 'step' && prior.name === 'Web search' && prior.detail === web[1])) step('Web search', web[1]!, 'done')
      card = null
      mode = 'prose'
      return
    }
    const warn = mode === 'output' || mode === 'agent' ? null : /^(warning|ERROR|deprecated|model rerouted): ?(.*)$/.exec(l)
    if (warn) {
      settle()
      logged(l)
      card = null
      mode = 'prose'
      return
    }
    if (l.startsWith('hook: ')) return
    const todo = /^ {2}(✓|→|•) (.*)$/.exec(l)
    if (todo && mode !== 'output' && mode !== 'agent') {
      const row = `${todo[1] === '✓' ? '✓' : todo[1] === '→' ? '●' : '○'} ${todo[2]}`
      if (card && card.kind === 'step' && card.name === 'Plan') card.output += `\n${row}`
      else {
        card = step('Plan', '', 'done')
        card.output = row
      }
      mode = 'prose'
      return
    }
    switch (mode) {
      case 'patch':
        if (l.trim() && edit) edit.paths.push(l.trim())
        return
      case 'final':
        final.push(l)
        return
      case 'output':
        if (card && card.kind === 'shell') card.output += card.output ? `\n${l}` : l
        return
    }
    // Prose: what the agent said under its header, or lines no header owns.
    if (card && card.kind === 'said') {
      card.text += card.text ? `\n${l}` : l
      return
    }
    if (!l.trim()) return
    card = said(l)
    mode = 'agent'
  }

  return {
    feed(chunk: string) {
      const text = rest + chunk
      const lines = text.split('\n')
      rest = lines.pop()!
      for (const l of lines) line(l)
    },
    /** The last line even without its newline, and what only the whole output can decide. */
    end() {
      if (rest) line(rest)
      rest = ''
      settle()
      // The final message is printed twice: under its header, and bare at the end.
      const tail = final.join('\n').trim()
      const spoken = out.filter((c): c is Said => c.kind === 'said' && c.who === 'agent').map((c) => c.text.trim())
      if (tail && !spoken.includes(tail)) said(tail)
      final = []
      // A patch names the sandbox's paths; the diff names them as the repository
      // does, and is the whole turn's, so an edit keeps the sections of its own files.
      for (const e of edits) {
        const parts = sections(e.card.patch)
        const known = [...parts.keys()]
        e.card.files = e.paths.map((p) => known.find((k) => p === k || p.endsWith(`/${k}`)) ?? shown(p))
        if (!e.card.files.length) e.card.files = known
        const mine = e.card.files.filter((f) => parts.has(f))
        e.card.patch = mine.length === 1 ? parts.get(mine[0]!)! : mine.map((f) => `${f}\n${parts.get(f)}`).join('\n')
      }
      edits.length = 0
      for (const k of tasks) k.card.text = asked(k.lines.join('\n'))
      tasks.length = 0
      for (let i = out.length - 1; i >= 0; i--) {
        const c = out[i]!
        if (c.kind === 'said' && !c.text.trim()) out.splice(i, 1)
      }
    },
  }
}
