/**
 * What a read or a write that failed tells a person: plain words, never the
 * platform's internals. A refusal is read by its status; only a 400, 409 or
 * 422 carries the platform's own sentence, because those name what was wrong
 * with what was sent (a name taken, a build that failed and why). A sentence
 * this client wrote itself (a name that does not fit) is said as written.
 */
import { Refusal } from '../api/call.ts'

/** A read that did not answer in time. */
export class Slow extends Error {
  constructor() {
    super('Hanzo is taking too long to answer.')
    this.name = 'Slow'
  }
}

/** The line call.ts writes when the platform gave no reason: a method, a path and a status. */
const BARE = /^(GET|POST|PUT|PATCH|DELETE) \S* answered \d+$/

export function say(e: unknown): string {
  if (e instanceof Slow) return 'Hanzo is taking too long to answer. Try again.'
  if (e instanceof Refusal) {
    if (e.status === 401) return 'Your sign-in has expired. Sign in again.'
    if (e.status === 403) return 'Your account can’t do this here. Ask an org admin.'
    if (e.status === 404) return 'Not found. It may have been removed.'
    if (e.status === 429) return 'Too many requests. Wait a moment and try again.'
    if (e.status >= 500) return 'Hanzo could not answer just now. Try again.'
    if ((e.status === 400 || e.status === 409 || e.status === 422) && e.message && !BARE.test(e.message)) return e.message
    return 'Hanzo could not do that. Try again.'
  }
  // fetch rejects with a TypeError when the network does; a body that is not JSON is a SyntaxError.
  if (e instanceof TypeError) return 'Could not reach Hanzo. Check your connection and try again.'
  if (e instanceof SyntaxError) return 'Hanzo answered with something unreadable. Try again.'
  if (e instanceof Error && e.message) return e.message
  return 'Something went wrong. Try again.'
}
