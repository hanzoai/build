/**
 * The agent's own output, read as cards.
 *
 * A sandbox run's agent is `dev exec`, and everything it prints reaches the
 * run's session as `log` chunks (apps/sandbox work.go). It prints each item of
 * its turn under a header line (hanzo dev, exec/src/event_processor_with_human_output.rs):
 *
 *   exec / <command> in <dir>            a command started
 *    succeeded in 12ms: / <output>       …how it ended, then what it printed
 *   codex / <text>                        the agent said something
 *   apply patch / patch: completed / <paths>, then the turn's diff
 *   mcp: server/tool (completed)          a tool call
 *   web search: <query>
 *     ✓ step / → step / • step            its plan
 *   tokens used / <n>                     the end; the final message follows once more, bare
 *
 * The chunks are cut by a clock, not by line, so a line is read only once it
 * is whole. Lines no header owns — reasoning, or the tail of output from before
 * the recorded events begin — are prose. Everything here becomes TEXT on the
 * screen; nothing is markup.
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

  const line = (raw: string) => {
    const l = raw.replace(ANSI, '').replace(/\r$/, '')
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
        case 'user':
          mode = 'user'
          return
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
    const warn = /^(warning|ERROR|deprecated|model rerouted): ?(.*)$/.exec(l)
    if (warn) {
      settle()
      out.push({ kind: 'note', key: mint(), text: warn[1] === 'ERROR' ? warn[2]! : `${warn[1]}: ${warn[2]}` })
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
      case 'user':
        return
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
      for (let i = out.length - 1; i >= 0; i--) {
        const c = out[i]!
        if (c.kind === 'said' && !c.text.trim()) out.splice(i, 1)
      }
    },
  }
}
