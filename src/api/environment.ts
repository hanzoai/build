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
import { call, Refusal, seg, type Target } from './call.ts'

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

/**
 * Whether a codebase still waits to be set up: nothing proposed and nothing ever
 * saved. Skip & save keeps an empty environment, which the platform answers as
 * state `none` with the time it was saved (apps/environment `view`), so the
 * time is what tells a choice made from one never made.
 */
export const unset = (e: Environment): boolean => e.state === 'none' && !e.updated

/**
 * What a refused save or setup run says to the person who pressed it: what is
 * wrong and what to do, in the reader's words rather than the platform's.
 */
export function plain(e: unknown, repo: string, act: 'save' | 'start' | 'run'): string {
  // This page's own refusals (a secret's name, an empty value) are already a reader's words.
  if (e instanceof Error && !(e instanceof Refusal) && e.name === 'Error' && e.message) return e.message
  if (e instanceof Refusal) {
    const why = e.message
    if (e.status === 401) return 'Your session ended. Sign in again, then try again.'
    if (e.status === 403 && act === 'save') return 'Only an organization admin saves an environment. Start the agent instead; an admin reviews what it proposes.'
    if (e.status === 402) return 'This run needs a plan with runs left. See Plans to change it.'
    if (e.status === 403) return `This account cannot start a run on ${repo}. Ask an organization admin for access.`
    if (e.status === 429) return 'Too many runs are going right now. Try again in a minute.'
    if (e.status >= 500) return act === 'save' ? 'The environment store is not answering right now. Try again shortly.' : 'The code workspace is not answering right now. Try again shortly.'
    if (/no repository named|not one of this organization|is not a repository/.test(why)) return `${repo} is not a repository this organization has on the forge. Choose one of its repositories.`
    if (/no account on the forge|verify .* first|no forge identity/.test(why)) return 'Your forge account is not ready yet: sign in to the forge once, then try again.'
  }
  if (act === 'save') return `The environment for ${repo} could not be saved. Try again.`
  return act === 'start' ? `The setup run on ${repo} could not start. Try again.` : `The run on ${repo} could not start. Try again.`
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

/**
 * What a setup run is asked. The first line is the run's title, the steps are
 * its checklist, and the platform puts its own instructions ahead of both.
 */
export const SETUP = [
  'Set up the environment',
  '',
  '1. Understand the codebase: how it installs, builds, starts and tests.',
  '2. Write the install script and the start command.',
  '3. Run both in this fresh checkout.',
  '4. Check that the build and the tests pass, and that the app answers if it is one.',
  '5. Answer with what you checked and the environment.',
].join('\n')
