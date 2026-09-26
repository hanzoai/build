/**
 * A codebase's environment: what a run does to its checkout before the agent
 * starts, and which secrets it exports.
 *
 *   GET    /v1/environment                      {data: [environment]}
 *   GET    /v1/environment/{repo}               one; a codebase with none answers state "none"
 *   PUT    /v1/environment/{repo}               save {install, start} (org admin)
 *   DELETE /v1/environment/{repo}               forget it and its secrets (org admin)
 *   PUT    /v1/environment/{repo}/secrets/{name}  set one value (org admin)
 *   DELETE /v1/environment/{repo}/secrets/{name}  remove one (org admin)
 *
 * A setup run is a coding run in mode `setup` (coding.ts): its agent explores the
 * checkout, installs and checks what it finds, and the platform keeps its answer
 * here as `proposal` until someone saves it. Secrets are names only; their values
 * are sealed in KMS and reach the run's environment, never this record.
 */
import { call, seg, type Target } from './call.ts'

export type State = 'none' | 'proposed' | 'ready'

export interface Proposal {
  install: string
  start: string
  /** Variables the agent found the codebase reads. Some may not be set yet. */
  secrets: string[]
  /** What the setup agent found and checked, in its own words. */
  note: string
}

export interface Environment {
  repo: string
  install: string
  start: string
  /** The names set on this codebase. Values are never answered. */
  secrets: string[]
  state: State
  /** The setup run that produced the proposal, or ''. */
  session: string
  proposal: Proposal | null
  updated: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && n !== '') : [])
const STATES: readonly State[] = ['none', 'proposed', 'ready']

export function environment(raw: unknown, repo = ''): Environment {
  const o = obj(raw)
  const p = o.proposal ? obj(o.proposal) : null
  const state = str(o.state) as State
  return {
    repo: str(o.repo) || repo,
    install: str(o.install),
    start: str(o.start),
    secrets: names(o.secrets),
    state: STATES.includes(state) ? state : 'none',
    session: str(o.session),
    proposal: p ? { install: str(p.install), start: str(p.start), secrets: names(p.secrets), note: str(p.note) } : null,
    updated: str(o.updatedAt),
  }
}

export async function environments(t: Target): Promise<Environment[]> {
  const r = await call<{ data?: unknown[] }>(t, 'GET', '/v1/environment')
  return (Array.isArray(r?.data) ? r.data : []).map((e) => environment(e)).filter((e) => e.repo)
}

export async function read(t: Target, repo: string): Promise<Environment> {
  return environment(await call<unknown>(t, 'GET', `/v1/environment/${seg(repo)}`), repo)
}

export async function save(t: Target, repo: string, scripts: { install: string; start: string }): Promise<Environment> {
  return environment(await call<unknown>(t, 'PUT', `/v1/environment/${seg(repo)}`, scripts), repo)
}

export async function forget(t: Target, repo: string): Promise<void> {
  await call<unknown>(t, 'DELETE', `/v1/environment/${seg(repo)}`)
}

/** An environment variable name the run can export, and not one of its own. */
export const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const RESERVED = ['PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'HOSTNAME', 'IFS', 'ENV', 'BASH_ENV']

/** Why a secret name cannot be set, or '' when it can. */
export function refuse(name: string): string {
  if (!NAME.test(name)) return `${name || 'That'} is not an environment variable name`
  const up = name.toUpperCase()
  if (up.startsWith('HANZO_') || RESERVED.includes(up)) return `${name} is reserved for the run itself`
  return ''
}

export async function setSecret(t: Target, repo: string, name: string, value: string): Promise<Environment> {
  const why = refuse(name)
  if (why) throw new Error(why)
  if (!value) throw new Error('A secret needs a value')
  return environment(await call<unknown>(t, 'PUT', `/v1/environment/${seg(repo)}/secrets/${seg(name)}`, { value }), repo)
}

export async function removeSecret(t: Target, repo: string, name: string): Promise<Environment> {
  return environment(await call<unknown>(t, 'DELETE', `/v1/environment/${seg(repo)}/secrets/${seg(name)}`), repo)
}

/** What a setup run is asked. The platform puts its own instructions ahead of it. */
export const SETUP = 'Set up this codebase’s environment: install it, start it, and check that it works end to end.'
