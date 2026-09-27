/**
 * Agents: the org's own — a model, instructions, the tools it may call and a
 * budget — and the presets one can start from.
 *
 *   GET    /v1/agent                 {agents: [agent]}, without instructions
 *   POST   /v1/agent                 create → 201 agent
 *   GET    /v1/agent/{ref}           one, with its instructions
 *   PATCH  /v1/agent/{ref}           the fields sent change, the rest stay → agent
 *   DELETE /v1/agent/{ref}           removes it and every run recorded against it → 204
 *   GET    /v1/agent/chat/presets    {presets: [{id, title, systemPrompt, serverExecuted}]}
 *
 * A ref is the agent's id or its name. A budget is required: the most it may
 * spend in a period and in one run, in micro-USD, and the period — day, week or
 * month. Tools are names from the tool plane; none grants none, and `*` is
 * whatever the fleet's MCP server serves when it runs. An omitted model is the
 * deployment's default. A preset whose tool calls run on the platform
 * (`serverExecuted`) makes a working agent; the others hand their calls back to
 * the client that asked, so they are not offered here.
 */
import { call, seg, type Target } from './call.ts'

export type Period = 'day' | 'week' | 'month'
export const PERIODS: readonly Period[] = ['day', 'week', 'month']

export interface Agent {
  id: string
  name: string
  model: string
  description: string
  /** Only a single agent's read carries it; the list withholds it. */
  instructions: string
  tools: string[]
  status: string
  runs: number
  /** Micro-USD per period, per run, and spent this period. */
  cap: number
  task: number
  spent: number
  period: Period | ''
  emoji: string
}

export interface Preset {
  id: string
  title: string
  prompt: string
}

/** The fields a person edits. Money is in dollars here and micro-USD on the wire. */
export interface Draft {
  name: string
  description: string
  model: string
  instructions: string
  tools: string[]
  cap: string
  task: string
  period: Period
}

/** An agent's name, as the handler takes it. */
export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
/** The most instructions the handler keeps. */
export const MAX = 32 << 10
/** Every tool the fleet's MCP server serves. */
export const ALL = '*'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const rows = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export const micros = (dollars: string): number => Math.round(Number(dollars) * 1_000_000)
export const dollars = (m: number): string => (m ? String(m / 1_000_000) : '')

export function agent(raw: unknown): Agent {
  const o = obj(raw)
  const period = str(o.period) as Period
  return {
    id: str(o.id),
    name: str(o.name),
    model: str(o.model),
    description: str(o.description),
    instructions: str(o.instructions),
    tools: rows(o.tools).map(str).filter(Boolean),
    status: str(o.status),
    runs: num(o.runs),
    cap: num(o.cap_micro_usd),
    task: num(o.max_task_micro_usd),
    spent: num(o.consumed_micro_usd),
    period: PERIODS.includes(period) ? period : '',
    emoji: str(o.emoji),
  }
}

/** A draft of an agent as it stands, to edit. */
export function draft(a: Agent): Draft {
  return {
    name: a.name,
    description: a.description,
    model: a.model,
    instructions: a.instructions,
    tools: a.tools,
    cap: dollars(a.cap),
    task: dollars(a.task),
    period: a.period || 'month',
  }
}

export const EMPTY: Draft = { name: '', description: '', model: '', instructions: '', tools: [], cap: '', task: '', period: 'month' }

/** Why a draft cannot be saved as it stands, or '' when it can. */
export function refuse(d: Draft): string {
  if (!NAME.test(d.name)) return 'A name is letters, digits, . _ or -, starting with a letter or digit'
  if (new TextEncoder().encode(d.instructions).length > MAX) return 'Instructions are at most 32 KB'
  const cap = micros(d.cap)
  const task = micros(d.task)
  if (!(cap > 0)) return 'Set what it may spend each ' + d.period
  if (!(task > 0)) return 'Set what one run may spend'
  if (task > cap) return 'One run cannot spend more than the whole ' + d.period
  return ''
}

export async function agents(t: Target): Promise<Agent[]> {
  return rows(obj(await call<unknown>(t, 'GET', '/v1/agent')).agents).map(agent).filter((a) => a.name)
}

export async function one(t: Target, ref: string): Promise<Agent> {
  return agent(await call<unknown>(t, 'GET', `/v1/agent/${seg(ref)}`))
}

export async function create(t: Target, d: Draft): Promise<Agent> {
  const why = refuse(d)
  if (why) throw new Error(why)
  const body: Record<string, unknown> = {
    name: d.name.trim(),
    description: d.description.trim(),
    instructions: d.instructions,
    tools: d.tools,
    cap_micro_usd: micros(d.cap),
    max_task_micro_usd: micros(d.task),
    period: d.period,
  }
  if (d.model) body.model = d.model
  return agent(await call<unknown>(t, 'POST', '/v1/agent', body))
}

/** The fields that differ from `was`, and nothing else: an omitted field keeps its value. */
export function changes(was: Agent, d: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (d.model && d.model !== was.model) out.model = d.model
  if (d.description.trim() !== was.description) out.description = d.description.trim()
  if (d.instructions !== was.instructions) out.instructions = d.instructions
  if (d.tools.join('\n') !== was.tools.join('\n')) out.tools = d.tools
  if (micros(d.cap) !== was.cap) out.cap_micro_usd = micros(d.cap)
  if (micros(d.task) !== was.task) out.max_task_micro_usd = micros(d.task)
  if (d.period !== was.period) out.period = d.period
  return out
}

export async function update(t: Target, was: Agent, d: Draft): Promise<Agent> {
  const why = refuse({ ...d, name: was.name })
  if (why) throw new Error(why)
  const body = changes(was, d)
  if (!Object.keys(body).length) return was
  return agent(await call<unknown>(t, 'PATCH', `/v1/agent/${seg(was.id || was.name)}`, body))
}

export async function remove(t: Target, ref: string): Promise<void> {
  await call<unknown>(t, 'DELETE', `/v1/agent/${seg(ref)}`)
}

/** The presets that make a working agent. */
export async function presets(t: Target): Promise<Preset[]> {
  return rows(obj(await call<unknown>(t, 'GET', '/v1/agent/chat/presets')).presets)
    .map(obj)
    .filter((p) => p.serverExecuted === true)
    .map((p) => ({ id: str(p.id), title: str(p.title), prompt: str(p.systemPrompt) }))
    .filter((p) => p.id)
}

/** A new agent's draft from a preset. */
export function fromPreset(p: Preset): Draft {
  return { ...EMPTY, name: p.id, description: p.title, instructions: p.prompt }
}
