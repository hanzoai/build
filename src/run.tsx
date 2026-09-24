/**
 * One run, live: its transcript as it streams, the way to steer or stop it,
 * and the pull request once it pushes one.
 *
 * The detail read is the record and the stream adds to it; the two overlap
 * whenever a turn lands between the read and the subscribe, so turns are merged
 * by sequence. A reconnect after a drop re-reads the detail — the platform drops
 * a subscriber that falls behind, and frames missed then are only in the read.
 *
 * Steering is a queue the run drains between steps: a press is confirmed as
 * RECORDED, and the status is left to the feed to correct.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ExternalLink, GitPullRequest } from '@hanzogui/lucide-icons-2'
import { Transcript, fold, type Turn } from '@hanzo/ui/agents'
import { Composer } from '@hanzo/ui/chat'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Refusal } from './api/call.ts'
import { get, message, stop, watch, type Detail, type Event } from './api/sessions.ts'
import { merge, outcome, said } from './api/turn.ts'
import { useRead } from './data.ts'
import { useTarget } from './host.tsx'

const LIVE = new Set(['running', 'paused', ''])

/** The actor, short enough to label a block: `hanzo/2d4d67ab`. */
const who = (actor: string): string => {
  const [org = '', rest = ''] = actor.split('/')
  const head = rest.split('-')[0] ?? ''
  return head ? `${org}/${head}` : actor
}

export function Run({ id }: { id: string }) {
  const t = useTarget()
  const detail = useRead<Detail | null>(() => get(t, id), null, [t, id])
  const [live, setLive] = useState<Event[]>([])
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = useRef(detail.reload)
  reload.current = detail.reload

  useEffect(() => {
    setLive([])
    const ctl = new AbortController()
    void watch(
      t,
      id,
      {
        event: (e) => {
          if (e.sessionId === id) setLive((prev) => [...prev, e])
        },
        session: (s) => {
          if (s.id === id) setStatus(s.status)
        },
        open: (n) => {
          if (n > 0) reload.current()
        },
      },
      ctl.signal,
    ).catch((e: unknown) => {
      if (e instanceof Refusal) setNote(e.message)
    })
    return () => ctl.abort()
  }, [t, id])

  const events = useMemo(() => merge(detail.value?.recent ?? [], live), [detail.value, live])
  const blocks = useMemo(
    () =>
      fold(
        events
          .map((e): Turn => ({ kind: e.kind, actor: who(e.actor), seq: e.seq, id: e.id, text: said(e) }))
          .filter((b) => b.text),
      ),
    [events],
  )
  const end = outcome(events)
  const state = status || end.status || detail.value?.status || ''
  const running = LIVE.has(state) && !detail.error

  const send = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    setNote('')
    try {
      await message(t, id, draft)
      setDraft('')
      setNote('Sent — the run reads it before its next step')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not reach this run')
    } finally {
      setBusy(false)
    }
  }

  const halt = async () => {
    setNote('')
    try {
      await stop(t, id)
      setNote('Stop requested — the run keeps its work on its branch')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not stop this run')
    }
  }

  const title = detail.value?.title || (detail.loading ? '' : 'Untitled run')

  return (
    <YStack flex={1} minH={0} minW={0} width="100%" items="center">
      <YStack flex={1} minH={0} width="100%" maxW={816} px="$6">
        <XStack pt="$3" pb="$2" gap="$3" items="center" minH={44}>
          <YStack flex={1} minW={0}>
            <SizableText render="h1" size="$5" color="$ink" numberOfLines={1}>
              {title}
            </SizableText>
            <SizableText size="$1" color="$soft" numberOfLines={1}>
              {[state || (detail.loading ? 'reading' : ''), detail.value?.repo, end.branch].filter(Boolean).join(' · ')}
            </SizableText>
          </YStack>
          {end.pr ? (
            <XStack
              render="a"
              // A platform-issued https address (turn.ts refuses anything else),
              // opened away from this page and with no handle back to it.
              href={end.pr}
              target="_blank"
              rel="noopener noreferrer"
              items="center"
              gap="$1.5"
              px="$2.5"
              py="$1.5"
              rounded="$3"
              borderWidth={1}
              borderColor="$borderColor"
              hoverStyle={{ bg: '$hover' }}
              aria-label={`Open pull request ${end.label}`.trim()}
            >
              <GitPullRequest size={14} />
              <SizableText size="$2" color="$ink">
                {end.label || 'Pull request'}
              </SizableText>
              <ExternalLink size={12} opacity={0.6} />
            </XStack>
          ) : null}
        </XStack>

        <Transcript
          blocks={blocks}
          empty={
            <SizableText size="$2" color="$soft">
              {detail.error ? detail.error.message : detail.loading ? 'Reading this run…' : 'Waiting for the run’s first step…'}
            </SizableText>
          }
        />

        <YStack pb="$4" pt="$2" gap="$2">
          {end.problem ? (
            <SizableText size="$1" color="$soft">
              The branch is pushed; the pull request could not be opened: {end.problem}
            </SizableText>
          ) : null}
          {note ? (
            <SizableText size="$1" color="$soft" role="status">
              {note}
            </SizableText>
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            onStop={() => void halt()}
            busy={running && !draft.trim()}
            disabled={!running || busy}
            placeholder={running ? 'Steer this run' : 'This run has finished'}
            label="Steer this run"
          />
        </YStack>
      </YStack>
    </YStack>
  )
}
