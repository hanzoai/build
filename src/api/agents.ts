/**
 * Agents: the org's own — a model, instructions, the tools it may call, a
 * budget and a face — and the templates one is made from.
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
import { phrase } from '@hanzo/i18n'

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
  /** Its picture: an https link or a data URL; '' draws its emoji or initial. */
  avatar: string
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
  /** Sent on create only: an https link or a data URL. */
  avatar: string
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
    avatar: str(o.avatar),
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
    avatar: a.avatar,
  }
}

export const EMPTY: Draft = { name: '', description: '', model: '', instructions: '', tools: [], cap: '', task: '', period: 'month', avatar: '' }

/** What a budget left unset says, and one run that outspends its period, by the period: whole sentences, so a language says the period its own way. */
const UNSET: Record<Period, string> = { day: phrase('Set what it may spend each day'), week: phrase('Set what it may spend each week'), month: phrase('Set what it may spend each month') }
const OVER: Record<Period, string> = {
  day: phrase('One run cannot spend more than the whole day'),
  week: phrase('One run cannot spend more than the whole week'),
  month: phrase('One run cannot spend more than the whole month'),
}

/** Why a draft cannot be saved as it stands, or '' when it can: English, marked (`phrase`), so a screen says it through `t`. */
export function refuse(d: Draft): string {
  if (!NAME.test(d.name)) return phrase('A name is letters, digits, . _ or -, starting with a letter or digit')
  if (new TextEncoder().encode(d.instructions).length > MAX) return phrase('Instructions are at most 32 KB')
  const cap = micros(d.cap)
  const task = micros(d.task)
  if (!(cap > 0)) return UNSET[d.period]
  if (!(task > 0)) return phrase('Set what one run may spend')
  if (task > cap) return OVER[d.period]
  return ''
}

export async function agents(t: Target): Promise<Agent[]> {
  return rows(obj(await call<unknown>(t, 'GET', '/v1/agent')).agents).map(agent).filter((a) => a.name)
}

export async function one(t: Target, ref: string): Promise<Agent> {
  return agent(await call<unknown>(t, 'GET', `/v1/agent/${seg(ref)}`))
}

/** One run of an agent, as its profile lists it: ok or error, what it was given and what it said. */
export interface Run {
  id: string
  status: string
  model: string
  input: string
  output: string
  error: string
  ms: number
  at: string
}

export function run(raw: unknown): Run {
  const o = obj(raw)
  return { id: str(o.id), status: str(o.status), model: str(o.model), input: str(o.input), output: str(o.output), error: str(o.error), ms: num(o.durationMs), at: str(o.createdAt) }
}

/** An agent with its instructions and its 20 latest runs, newest first (`recentRuns`). */
export async function profile(t: Target, ref: string): Promise<{ agent: Agent; runs: Run[] }> {
  const raw = await call<unknown>(t, 'GET', `/v1/agent/${seg(ref)}`)
  return { agent: agent(raw), runs: rows(obj(raw).recentRuns).map(run).filter((r) => r.id) }
}

/** An agent to start from: a default agent, a persona or a preset. */
export interface Cast {
  /** The name it is made under. */
  name: string
  /** What Browse calls it. */
  title: string
  description: string
  /** What Browse lists it under. */
  category: string
  model: string
  instructions: string
  /** Reads the instructions, where they are a file the host serves. */
  read?: () => Promise<string>
  /** Its face, an address of the host. */
  avatar?: string
  tools?: string[]
}

/** What an agent made from a template may spend until its owner says otherwise, in dollars: each month, and one run. */
export const CAST_CAP = '10'
export const CAST_TASK = '1'

/**
 * A name the API takes: accents dropped, any other run of characters a dash,
 * from a letter or digit, up to 64. "Spärck Jones" is Sparck-Jones.
 */
export const handle = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 64)
    .replace(/-+$/, '')

/** `name`, or `name-2`, `name-3`… : the first the org has no agent called, in any case. */
export function free(name: string, have: readonly { name: string }[]): string {
  const taken = new Set(have.map((a) => a.name.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  for (let i = 2; ; i++) {
    const next = `${name.slice(0, 63 - String(i).length)}-${i}`
    if (!taken.has(next.toLowerCase())) return next
  }
}

/** An address of the page as an https link the API keeps, or '' (a page served over http has none). */
export const link = (at: string | undefined, base: string): string => {
  if (!at) return ''
  const url = new URL(at, base).href
  return url.startsWith('https://') || url.startsWith('data:') ? url : ''
}

/**
 * Make the org's own agent from a template: under the first name the org has
 * free (read now, so it is never one that exists), with its instructions read
 * and its face linked. The template is not touched.
 */
export async function use(t: Target, c: Cast, base: string): Promise<Agent> {
  const [have, instructions] = await Promise.all([agents(t), c.read ? c.read() : c.instructions])
  return create(t, { ...EMPTY, name: free(handle(c.name), have), description: c.description, model: c.model, instructions, tools: c.tools ?? [], cap: CAST_CAP, task: CAST_TASK, avatar: link(c.avatar, base) })
}

/** Anyone as a template: their name, who they are, and writing of theirs to take the voice from. */
export function person(name: string, about: string, writing: string, avatar = ''): Cast {
  const who = name.trim()
  const lines = [`You are ${who}.`, about.trim(), writing.trim() && `Writing by ${who}:\n\n${writing.trim()}`]
  return { name: who, title: who, description: about.trim(), category: phrase('Person'), model: '', instructions: lines.filter(Boolean).join('\n\n'), avatar }
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
  if (d.avatar) body.avatar = d.avatar
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

/** A preset as a template. */
export function fromPreset(p: Preset): Cast {
  return { name: p.id, title: p.title || p.id, description: p.title, category: phrase('Preset'), model: '', instructions: p.prompt }
}
