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
import { ExternalLink, GitPullRequest, PanelRight } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { Transcript, fold, type Turn } from '@hanzo/ui/agents'
import { Composer } from '@hanzo/ui/chat'
import { useEffect, useMemo, useState } from 'react'

import { message, stop } from './api/sessions.ts'
import { outcome, pull, said, steps, who } from './api/turn.ts'
import { useKept, useRun } from './data.ts'
import { Desk } from './desk.tsx'
import { useTarget } from './host.tsx'
import { Out } from './out.tsx'

const LIVE = new Set(['running', 'paused', ''])

export function Run({ id }: { id: string }) {
  const t = useTarget()
  const { detail, record, events, status, refused } = useRun(t, id)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [notify, setNotify] = useState(false)
  const [desk, setDesk] = useKept('hanzo.build.desk', true)

  const blocks = useMemo(
    () =>
      fold(
        events
          .map((e): Turn => ({ kind: e.kind, actor: who(e.actor), seq: e.seq, id: e.id, text: said(e, record?.mode) }))
          .filter((b) => b.text),
      ),
    [events, record?.mode],
  )
  const end = outcome(events)
  const plan = useMemo(() => steps(events), [events])
  const state = status || end.status
  const pr = pull(record?.pr ?? '', record?.repo ?? '')
  const running = LIVE.has(state) && !detail.error
  const title = detail.value?.title || (detail.loading ? '' : 'Untitled run')

  useEffect(() => {
    if (!notify || running) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const n = new Notification(title || 'Run finished', { body: 'This run has finished.' })
    setNotify(false)
    return () => n.close()
  }, [notify, running, title])

  const ask = async () => {
    if (typeof Notification === 'undefined') {
      setNote('This browser cannot send a notification.')
      return
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm !== 'granted') {
      setNote('Notifications stay off until this browser allows them.')
      return
    }
    setNotify(true)
    setNote('')
  }

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

  return (
    <XStack flex={1} minH={0} minW={0} width="100%">
      <YStack flex={1} minH={0} minW={0} width="100%" px="$6">
        <XStack pt="$3" pb="$2" gap="$3" items="center" minH={44}>
          <YStack flex={1} minW={0}>
            <SizableText render="h1" size="$5" color="$ink" numberOfLines={1}>
              {title}
            </SizableText>
            <SizableText size="$1" color="$soft" numberOfLines={1}>
              {[state || (detail.loading ? 'reading' : ''), record?.repo, record?.branch].filter(Boolean).join(' · ')}
            </SizableText>
          </YStack>
          {desk ? null : (
            <XStack render="button" aria-label="Show the side pane" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }} onPress={() => setDesk(true)}>
              <PanelRight size={16} />
            </XStack>
          )}
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
              {detail.error ? detail.error.message : detail.loading ? 'Reading this run…' : running ? 'Setting up environment' : 'Waiting for the run’s first step…'}
            </SizableText>
          }
        />

        <YStack pb="$4" pt="$2" gap="$2">
          {end.problem ? (
            <SizableText size="$1" color="$soft">
              The branch is pushed, and the pull request could not be opened.
            </SizableText>
          ) : null}
          {note || refused ? (
            <SizableText size="$1" color="$soft" role="status">
              {note || refused}
            </SizableText>
          ) : null}
          {plan.length ? (
            <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
              <XStack px="$3" py="$2" justify="space-between" items="center">
                <SizableText size="$2" color="$ink">
                  Steps
                </SizableText>
                <SizableText size="$1" color="$soft">
                  {String(plan.length)}
                </SizableText>
              </XStack>
              {plan.map((s, i) => {
                const current = !s.done && plan.findIndex((x) => !x.done) === i
                return (
                  <XStack key={s.name} items="center" gap="$2" px="$3" py="$1.5" borderTopWidth={1} borderColor="$borderColor">
                    <SizableText size="$2" color={s.done || current ? '$ink' : '$soft'}>
                      {s.done ? '✓' : current ? '●' : '○'}
                    </SizableText>
                    <SizableText size="$2" color={s.done ? '$soft' : '$ink'} numberOfLines={1}>
                      {s.name}
                    </SizableText>
                  </XStack>
                )
              })}
            </YStack>
          ) : null}
          {running ? (
            <XStack items="center" justify="space-between" gap="$3" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor">
              <SizableText size="$2" color="$ink">
                Environment setup takes several minutes.
              </SizableText>
              <Button size="sm" disabled={notify} onPress={() => void ask()}>
                {notify ? 'You will be notified' : 'Notify me'}
              </Button>
            </XStack>
          ) : null}
          <Composer
            inline
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            onStop={() => void halt()}
            busy={running && !draft.trim()}
            disabled={!running || busy}
            placeholder={running ? 'Add a follow up' : 'This run has finished'}
            label="Steer this run"
          />
        </YStack>
      </YStack>
      {desk ? <Desk
        id={id}
        repo={record?.repo ?? ''}
        branch={record?.branch ?? ''}
        base={record?.base ?? ''}
        environment={record?.environment ?? ''}
        mode={record?.mode ?? ''}
        pr={pr}
        events={events}
        live={running}
        refused={refused || (detail.error ? detail.error.message : '')}
        onRetry={detail.reload}
        onHide={() => setDesk(false)}
      /> : null}
    </XStack>
  )
}
