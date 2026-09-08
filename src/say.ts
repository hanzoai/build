// What to tell a reader when the platform does not answer.
//
// Printing the caught error reads "mount /v1/s3: no instance running", which
// says nothing a reader can act on — it names a mount and an instance, neither
// of which is theirs — and puts the shape of the estate on a public page. The
// detail stays in the network tab, where the person who can act on it is
// looking.
//
// ONE FUNCTION, because every pane owes the same three answers and three copies
// would drift into three vocabularies for one event.

/**
 * THE STATUS, WHERE THE FAILURE CARRIES ONE.
 *
 * `@hanzo/ai`'s APIError publishes `status` as a number, and a number is a fact
 * — while the message beside it is prose the SDK is free to reword. Reading the
 * status first is what makes this survive the next rewording.
 */
const status = (e: unknown): number | null => {
  const s = (e as { status?: unknown } | null | undefined)?.status
  return typeof s === 'number' && Number.isFinite(s) ? s : null
}

/** True where a failure is the platform being absent rather than the reader.
 *  The text is still read, because a network failure raises before any status. */
const absent = (text: string): boolean =>
  /no instance running|not running|service unavailable|503|econnrefused|failed to fetch|network/i.test(
    text,
  )

/**
 * True where the answer was no, whoever said it.
 *
 * Three vocabularies for one event: the gateway says 401 "authentication
 * required" on a turn and 403 "a validated principal is required" on a read,
 * and the SDK raises before sending at all when it has no credential to send
 * with. A reader meets the same wall in every case, so all three read as one.
 */
const barred = (text: string): boolean =>
  /401|403|forbidden|unauthori[sz]ed|not authori[sz]ed|authentication required|validated principal|permission|serve anonymous|anonymous completions/i.test(
    text,
  )

/** Whether the platform answered and the answer was no — exported so a surface
 *  can offer the way past a refusal rather than only describing it. */
export const refused = (error: unknown): boolean => {
  const code = status(error)
  if (code === 401 || code === 403) return true
  return barred(error instanceof Error ? error.message : String(error ?? ''))
}

/**
 * A sentence about `subject` — "your projects", "this template" — naming what a
 * reader can do next. Never the caught text: an error written for an operator
 * is not an answer for a reader.
 */
export function say(error: unknown, subject: string, act: 'read' | 'save' = 'read'): string {
  const text = error instanceof Error ? error.message : String(error ?? '')
  const code = status(error)
  // VERB FIRST, so the subject's number never has to agree with anything. Said
  // subject-first, "your projects is not answering" is what a plural name gets,
  // and every caller then has to phrase its subject singular.
  if (code === 502 || code === 503 || code === 504 || absent(text))
    return `Could not reach ${subject}. Nothing has been lost — try again shortly.`
  if (code === 401 || code === 403 || barred(text))
    return act === 'save'
      ? `This account cannot change ${subject}.`
      : `This account cannot open ${subject}.`
  return act === 'save' ? `Could not save ${subject}.` : `Could not read ${subject}.`
}
