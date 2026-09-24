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
import { useMemo, useState } from 'react'

import { message, stop } from './api/sessions.ts'
import { outcome, pull, said, who } from './api/turn.ts'
import { useRun } from './data.ts'
import { useTarget } from './host.tsx'
import { Out } from './out.tsx'

const LIVE = new Set(['running', 'paused', ''])

export function Run({ id }: { id: string }) {
  const t = useTarget()
  const { detail, record, events, status, refused } = useRun(t, id)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

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
  const state = status || end.status
  const pr = pull(record?.pr ?? '')
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
              {[state || (detail.loading ? 'reading' : ''), record?.repo, record?.branch].filter(Boolean).join(' · ')}
            </SizableText>
          </YStack>
          {pr.href ? (
            // From the run's record, which the coding service writes; `pull` draws only a pull request address.
            <Out href={pr.href} label={`Open pull request ${pr.label}`}>
              <XStack items="center" gap="$1.5" px="$2.5" py="$1.5" rounded="$3" borderWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                <GitPullRequest size={14} />
                <SizableText size="$2" color="$ink">
                  {pr.label}
                </SizableText>
                <ExternalLink size={12} opacity={0.6} />
              </XStack>
            </Out>
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
          {note || refused ? (
            <SizableText size="$1" color="$soft" role="status">
              {note || refused}
            </SizableText>
          ) : null}
          <Composer
            inline
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
