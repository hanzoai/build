// The pane when a run is open: the transcript, live, and the controls.
//
// Everything here is `@hanzo/ai`. The turns come from `useSession`, the new ones
// from `sessions.stream()`, and every control is `sessions.steer()` — which is
// ONE method taking the command as a value, so these three buttons are a list
// and not three handlers.
//
// STEERING IS A QUEUE, NOT A SIGNAL. `steer` records a command the running
// agent drains between turns; it does not interrupt one mid-flight. So a press
// is confirmed as RECORDED and the status is left to the feed to correct — a
// button that optimistically flipped the run to "paused" would be lying for as
// long as the current turn takes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { useAi, useSession } from '@hanzo/ai/react'
import type { SessionCommand, SessionEvent } from '@hanzo/ai'
import { Composer } from '@hanzo/ui/chat'
import { Button, Text, XStack, YStack } from '@hanzo/ui'
import { Beside } from '~/frame'

/** The controls, as data. `steer` takes the verb, so the row is a map. */
const CONTROLS: { command: SessionCommand; label: string; icon: typeof Pause }[] = [
  { command: 'pause', label: 'Pause', icon: Pause },
  { command: 'resume', label: 'Resume', icon: Play },
  { command: 'stop', label: 'Stop', icon: Square },
]

/** A string field, or empty. Keeps every read below total. */
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * The turn's body, whatever it arrived wrapped in.
 *
 * A live event carries `payload` as a JSON STRING — `"{\"type\":\"tool_call\",…}"`
 * — where a recorded one carries the object. Both shapes are answered here, and
 * a string that is not JSON stays exactly what it was, because that is the case
 * where it really is the message.
 */
function decode(payload: unknown): Record<string, unknown> | string | null {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload !== 'string') return null
  const text = payload.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return payload
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // Not JSON after all — it was prose that happened to open with a brace.
  }
  return payload
}

/** A path's last segment — `control.txt`, never the whole host path. */
function base(path: string): string {
  const cut = path.replace(/\/+$/, '')
  return cut.slice(cut.lastIndexOf('/') + 1)
}

/**
 * What a turn SAID.
 *
 * A CURATED PROJECTION, never a dump. A record carries the machine the run
 * happened on — `cwd`, `repo.remote`, `host`, `machineId`, and a `files[]`
 * holding whole file bodies. None of that is what happened; it is the wiring
 * underneath what happened, it belongs to whoever ran the session, and printing
 * it would put someone's filesystem in front of anyone who can read the run. So
 * each kind gets a sentence built from the few fields that describe the
 * OUTCOME, and everything else is dropped by omission — a projection cannot
 * leak a field it never reads.
 */
function line(payload: unknown): string {
  const body = decode(payload)
  if (typeof body === 'string') return body
  if (!body) return ''

  // The prose fields, in the order a turn is worth reading by. `result` is here
  // because a tool result carries its answer there and it is the sentence a
  // reader wants.
  for (const key of ['text', 'message', 'content', 'result', 'command']) {
    const v = body[key]
    if (typeof v === 'string' && v) return v
  }

  switch (str(body.type)) {
    // The run attached to a working copy. The branch is what a reader is
    // working ON; where it happens to live is not shown.
    case 'context': {
      const repo = body.repo as Record<string, unknown> | undefined
      const branch = str(repo?.branch)
      return branch ? `Started on ${branch}` : 'Started'
    }

    case 'resume':
      return 'Resumed an earlier run'

    // `reason` is already the durability note, written for a person.
    case 'sandbox':
      return (
        str(body.reason) ||
        (body.durable === false
          ? 'Nothing this run writes is saved.'
          : 'What this run writes is saved.')
      )

    case 'turn': {
      const n = num(body.turn)
      const max = num(body.maxTurns)
      if (n === null) return ''
      return max === null ? `Turn ${n}` : `Turn ${n} of ${max}`
    }

    // What CHANGED, by name. `files[].content` carries whole file bodies and is
    // never read here.
    case 'done': {
      const changed = Array.isArray(body.changed)
        ? body.changed.map((f) => base(str(f))).filter(Boolean)
        : []
      const what =
        changed.length === 0
          ? 'no files changed'
          : changed.length <= 3
            ? `changed ${changed.join(', ')}`
            : `changed ${changed.length} files`
      const why = str(body.finishReason)
      return why && why !== 'stop' ? `Ended (${why}) — ${what}` : `Done — ${what}`
    }

    case 'error':
      return str(body.error) || str(body.detail) || 'This run hit an error.'
  }

  // A tool call has no prose — it has a name and an `arguments` blob that is
  // itself encoded JSON. The name IS the sentence; printing the arguments back
  // is how raw JSON ends up on screen.
  return str(body.name)
}

/**
 * The actor, short enough to be a label.
 *
 * An actor reads `hanzo/2d4d67ab-30f1-474e-b81f-f60461852259`, and a
 * 45-character line introducing a six-word sentence is noise wearing a label's
 * clothes. The org and the first block of the id identify a run's author among
 * the handful a reader ever sees on one screen.
 */
function who(actor: string): string {
  const [org = '', rest = ''] = actor.split('/')
  const head = rest.split('-')[0] ?? ''
  return head ? `${org}/${head}` : actor
}

/**
 * What a run has written, beside its transcript.
 *
 * Names only, through `base`, because `changed` carries absolute host paths and
 * a run's column is not where those become a reader's problem. Read from the
 * turns, which are already the record.
 */
function Made({ changed, status }: { changed: string[]; status: string }) {
  return (
    <YStack p="$3" gap="$4">
      <YStack gap="$1">
        <Text fontSize="$1" color="$soft" textTransform="uppercase">
          Run
        </Text>
        <Text fontSize="$2" color="$ink">
          {status}
        </Text>
      </YStack>

      <YStack gap="$2">
        <Text fontSize="$1" color="$soft" textTransform="uppercase">
          Files
        </Text>
        {changed.length === 0 ? (
          <Text fontSize="$2" color="$soft">
            Nothing has been written yet.
          </Text>
        ) : (
          changed.map((name) => (
            <Text key={name} fontSize="$2" color="$ink" numberOfLines={1}>
              {name}
            </Text>
          ))
        )}
      </YStack>
    </YStack>
  )
}

export function Session({ id }: { id: string }) {
  const ai = useAi()
  const { session, loading, reload } = useSession(id)
  const [live, setLive] = useState<SessionEvent[]>([])
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [noted, setNoted] = useState<string | null>(null)
  const foot = useRef<HTMLDivElement | null>(null)
  // status|title as last read, so a heartbeat that changed neither is free.
  const shownRef = useRef('')

  // The live feed, narrowed to this run's tree. `stream()` ends when the server
  // closes it; reopening is deliberately not automatic — a pane that silently
  // reconnects forever hides a feed that is actually failing.
  useEffect(() => {
    const control = new AbortController()
    void (async () => {
      try {
        for await (const frame of ai.sessions.stream({ root: id }, { signal: control.signal })) {
          if (control.signal.aborted) return
          if (frame.kind === 'event') {
            setLive((prev) => [...prev, frame.event])
          } else if (frame.session.id === id) {
            // A row frame lands on every heartbeat of a live run, and re-reading
            // pulls the whole detail each time. Only the two fields this pane
            // SHOWS are worth a read.
            const next = `${frame.session.status ?? ''}|${frame.session.title ?? ''}`
            if (next !== shownRef.current) {
              shownRef.current = next
              reload()
            }
          }
        }
      } catch {
        // A dropped feed is ordinary. The transcript already on screen stands.
      }
    })()
    return () => control.abort()
  }, [ai, id, reload])

  // The turns the detail carries, then everything the feed has added, deduped
  // by seq — the two overlap whenever a turn lands between the read and the
  // subscribe.
  const turns = useMemo(() => {
    const seen = new Map<string, SessionEvent>()
    const all = [...(session?.recentEvents ?? []), ...live]
    all.forEach((e, i) => {
      // Position is the fallback key, never a random one: a turn carrying
      // neither seq nor id would otherwise be keyed differently on every render,
      // so the dedup would stop deduping it and the pane would grow a copy per
      // paint.
      seen.set(e.seq !== undefined ? `s${e.seq}` : (e.id ?? `i${i}`), e)
    })
    return [...seen.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  }, [session?.recentEvents, live])

  /**
   * Turns folded into blocks.
   *
   * A streamed answer arrives one TOKEN per event, so an unfolded transcript
   * prints a sentence as a dozen mid-word cards, each under its own actor line.
   * Consecutive turns of the same kind and actor are therefore one block with
   * one label.
   *
   * Message tokens join with nothing, because each carries its own leading
   * space and re-inserting one would double it. Every other kind joins with a
   * newline: two tool results are two facts, not one run-on.
   */
  const blocks = useMemo(() => {
    const out: { key: string; kind: string; actor?: string; parts: string[] }[] = []
    for (const e of turns) {
      const kind = e.kind ?? 'turn'
      const said = line(e.payload)
      const last = out[out.length - 1]
      if (last && last.kind === kind && last.actor === e.actor) last.parts.push(said)
      else out.push({ key: `${e.seq ?? e.id ?? out.length}`, kind, actor: e.actor, parts: [said] })
    }
    return out.map((b) => ({
      ...b,
      text: b.kind === 'message' ? b.parts.join('') : b.parts.filter(Boolean).join('\n'),
    }))
  }, [turns])

  // What this run has written, by name. `changed` rides a `done` turn; every
  // other kind carries none, so this reads the one that does.
  const changed = useMemo(() => {
    const out = new Set<string>()
    for (const e of turns) {
      const body = decode(e.payload)
      if (!body || typeof body === 'string') continue
      if (str(body.type) !== 'done' || !Array.isArray(body.changed)) continue
      for (const f of body.changed) {
        const name = base(str(f))
        if (name) out.add(name)
      }
    }
    return [...out]
  }, [turns])

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [blocks.length])

  useEffect(() => {
    if (session) shownRef.current = `${session.status ?? ''}|${session.title ?? ''}`
  }, [session])

  /**
   * What the header may honestly claim.
   *
   * `recentEvents` is capped and holds the OPENING of a run rather than its
   * end, so the line names which turns these ARE. Claiming "the latest" would
   * describe turns nobody has read.
   */
  const shown = turns.length
  const total = typeof session?.events === 'number' ? session.events : shown
  const turnCount = total > shown ? ` · turns 1–${shown} of ${total}` : total ? ` · ${total} turns` : ''

  const steer = useCallback(
    async (command: SessionCommand) => {
      setNoted(null)
      try {
        await ai.sessions.steer(id, command)
        setNoted(`${command} queued — it takes effect between turns`)
        reload()
      } catch {
        setNoted(`Could not ${command} this run`)
      }
    },
    [ai, id, reload],
  )

  const send = useCallback(async () => {
    const message = draft.trim()
    if (!message || sending) return
    setSending(true)
    setNoted(null)
    try {
      await ai.sessions.steer(id, 'message', { message })
      setDraft('')
      setNoted('Sent — the agent reads it between turns')
    } catch {
      setNoted('Could not reach this run')
    } finally {
      setSending(false)
    }
  }, [ai, draft, id, sending])

  const done = session?.status === 'done' || session?.status === 'error'

  return (
    <>
      {/* The frame owns the column; this is what a run puts in it. */}
      <Beside>
        <Made changed={changed} status={session?.status ?? (loading ? 'loading' : 'unknown')} />
      </Beside>
      <YStack flex={1} minH={0} minW={0} width="100%">
        <XStack
          px="$4"
          py="$3"
          gap="$3"
          items="center"
          justify="space-between"
          borderBottomWidth={1}
          borderColor="$borderColor"
        >
          {/* flex + minWidth 0 TOGETHER. A flex item's default `min-width: auto`
              refuses to shrink below its content, so a long run title sizes this
              column past the viewport and pushes its own text off a narrow
              window. */}
          <YStack flex={1} minW={0} gap="$1">
            <Text render="h1" fontSize="$5" fontWeight="500" color="$ink" numberOfLines={1}>
              {session?.title || 'Untitled run'}
            </Text>
            <Text fontSize="$2" color="$soft" numberOfLines={1}>
              {session?.status ?? (loading ? 'loading' : 'unknown')}
              {session?.agent ? ` · ${session.agent}` : ''}
              {turnCount}
            </Text>
          </YStack>

          {/* A finished run cannot be steered, so the controls are absent rather
              than present-and-refusing. */}
          {!done ? (
            <XStack gap="$2" shrink={0}>
              {CONTROLS.map(({ command, label, icon: Icon }) => (
                <Button key={command} size="sm" onClick={() => void steer(command)} aria-label={label}>
                  <Icon size={14} aria-hidden />
                  <Text fontSize="$2">{label}</Text>
                </Button>
              ))}
            </XStack>
          ) : null}
        </XStack>

        <YStack flex={1} minH={0} overflow="scroll" px="$4" py="$4" gap="$3">
          {blocks.length === 0 ? (
            <Text fontSize="$3" color="$soft">
              {loading ? 'Reading this run…' : 'No turns recorded yet.'}
            </Text>
          ) : (
            blocks.map((b) => (
              <YStack key={b.key} gap="$1">
                <Text fontSize="$1" color="$soft">
                  {b.kind}
                  {b.actor ? ` · ${who(b.actor)}` : ''}
                </Text>
                {b.text ? (
                  <Text fontSize="$3" color="$ink">
                    {b.text}
                  </Text>
                ) : null}
              </YStack>
            ))
          )}
          <div ref={foot} />
        </YStack>

        <YStack px="$4" pb="$4" gap="$2">
          {noted ? (
            <Text fontSize="$2" color="$soft">
              {noted}
            </Text>
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            disabled={sending || done}
            placeholder={done ? 'This run has finished' : 'Send a message to this run'}
            label="Send a message to this run"
          />
        </YStack>
      </YStack>
    </>
  )
}
