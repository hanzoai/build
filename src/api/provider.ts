/**
 * The organization's connectors: a Slack workspace, the GitHub accounts the
 * platform's GitHub App is installed on.
 *
 *   GET  /v1/provider/{id}              one connector and this org's connection to it
 *   POST /v1/provider/{id}/connect      {return} → {authorizeUrl}: the provider's own consent page (org admin)
 *   POST /v1/provider/{id}/disconnect   forget the org's connection (org admin)
 *   GET  /v1/provider/slack/channels    the connected workspace's channels, a page at a time
 *
 * Connecting leaves this page once, for the provider's consent screen, and only
 * for that provider's own host.
 */
import { call, query, seg, type Target } from './call.ts'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export interface Connector {
  id: string
  name: string
  /** Whether this deployment can connect it at all. */
  available: boolean
  connected: boolean
  /** The connected account's own name: the Slack workspace, the GitHub login. */
  account: string
  since: string
  /** Why it cannot be connected here, when it cannot. */
  note: string
}

export function connector(raw: unknown, id = ''): Connector {
  const p = obj(raw)
  const c = obj(p.connection)
  return {
    id: str(p.id) || id,
    name: str(p.name) || id,
    available: p.available === true,
    connected: p.connected === true,
    account: str(c.account),
    since: str(c.connectedAt),
    note: str(p.note),
  }
}

export async function read(t: Target, id: string): Promise<Connector> {
  return connector(await call<unknown>(t, 'GET', `/v1/provider/${seg(id)}`), id)
}

/** Where each provider's consent lives. An authorize address anywhere else is refused. */
const CONSENT: Record<string, RegExp> = {
  slack: /^https:\/\/slack\.com\//,
  github: /^https:\/\/github\.com\//,
}

/** The provider's consent page for this org; its return lands on `back` when that is a Hanzo app page. */
export async function authorize(t: Target, id: string, back?: string): Promise<string> {
  const url = str(obj(await call<unknown>(t, 'POST', `/v1/provider/${seg(id)}/connect`, back ? { return: back } : {})).authorizeUrl)
  const host = CONSENT[id]
  if (!host || !host.test(url)) throw new Error(`The platform did not name a ${id} address to connect at`)
  return url
}

export async function disconnect(t: Target, id: string): Promise<void> {
  await call<unknown>(t, 'POST', `/v1/provider/${seg(id)}/disconnect`, {})
}

export interface Channel {
  id: string
  name: string
  private: boolean
  /** Whether Hanzo has joined it. */
  member: boolean
}

export interface Channels {
  channels: Channel[]
  next: string
}

export async function channels(t: Target, cursor = ''): Promise<Channels> {
  const raw = obj(await call<unknown>(t, 'GET', `/v1/provider/slack/channels${query({ cursor })}`))
  return {
    channels: arr(raw.channels)
      .map(obj)
      .map((c) => ({ id: str(c.id), name: str(c.name), private: c.is_private === true, member: c.is_member === true }))
      .filter((c) => c.id),
    next: str(raw.next_cursor),
  }
}
