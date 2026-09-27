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

import { list, message, stop, took } from './api/sessions.ts'
import { outcome, pull, said, steps, who } from './api/turn.ts'
import { useKept, useRead, useRun } from './data.ts'
import { Desk } from './desk.tsx'
import { useHost, useTarget } from './host.tsx'
import { Out } from './out.tsx'

const LIVE = new Set(['running', 'paused', ''])

export function Run({ id }: { id: string }) {
  const host = useHost()
  const t = useTarget()
  // Signed out, there is nothing to read: the gateway answers a bare run with a refusal.
  const signed = Boolean(host.person)
  const { detail, record, events, status, refused } = useRun(t, signed ? id : null)
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
  const running = signed && LIVE.has(state) && !detail.error
  const title = detail.value?.title || (detail.loading ? '' : 'Untitled run')
  // A setup run explores and installs before it answers, which takes minutes.
  const setup = record?.mode === 'setup'
  const [seen, setSeen] = useKept('hanzo.build.setup.seen', false)
  // How long setup runs have taken here: the ones this person can see, finished.
  const past = useRead(setup && running ? () => list(t, { kind: 'coding', status: 'done', limit: 500 }) : null, [], [t, setup, running])
  const span = took(past.value, 'setup')

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
            signed ? (
              <SizableText size="$2" color="$soft">
                {detail.error
                  ? detail.error.message
                  : detail.loading
                    ? 'Reading this run…'
                    : running
                      ? setup
                        ? 'Setting up environment'
                        : 'Starting…'
                      : 'Waiting for the run’s first step…'}
              </SizableText>
            ) : (
              <YStack gap="$3" items="flex-start">
                <SizableText size="$2" color="$soft">
                  Sign in to follow this run.
                </SizableText>
                <Button size="sm" onPress={() => host.signIn?.()}>
                  Sign in
                </Button>
              </YStack>
            )
          }
        />

        <YStack pb="$4" pt="$2" gap="$2">
          {end.problem ? (
            <SizableText size="$1" color="$soft">
              The branch is pushed, and the pull request could not be opened.
            </SizableText>
          ) : null}
          {note || (signed && refused) ? (
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
          {setup && running && !seen ? <Onboarding onDone={() => setSeen(true)} /> : null}
          {running ? (
            <XStack items="center" justify="space-between" gap="$3" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor">
              <SizableText size="$2" color="$ink">
                {setup
                  ? span
                    ? `Environment setup takes ~${span[0] === span[1] ? span[0] : `${span[0]}–${span[1]}`} minutes.`
                    : 'Environment setup takes several minutes.'
                  : 'This run is still working.'}
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
            placeholder={!signed ? 'Sign in to follow up' : running ? (setup ? 'Add a follow up for the setup agent' : 'Add a follow up') : 'This run has finished'}
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
        title={title}
        project={record?.project ?? ''}
        sandbox={record?.sandbox ?? ''}
        events={events}
        live={running}
        refused={signed ? refused || (detail.error ? detail.error.message : '') : 'Sign in to follow this run.'}
        retry={signed ? 'Retry' : 'Sign in'}
        onRetry={signed ? detail.reload : () => host.signIn?.()}
        onHide={() => setDesk(false)}
      /> : null}
    </XStack>
  )
}

/** What a setup run does, said once per browser the first time one is watched. */
function Onboarding({ onDone }: { onDone: () => void }) {
  const steps = [
    'Explore, install and check the codebase',
    'Name the secrets it needs — you set their values',
    'Propose the environment for you to review and save',
  ]
  return (
    <YStack gap="$3" p="$4" rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel">
      <SizableText size="$4" color="$ink">
        Set up a cloud environment
      </SizableText>
      <SizableText size="$2" color="$soft">
        An environment lets every later run install, start, test and check its changes the way an engineer does. Setup
        is agent-led and takes several minutes. The agent will:
      </SizableText>
      <YStack gap="$1.5">
        {steps.map((s, i) => (
          <XStack key={s} gap="$3">
            <SizableText size="$2" color="$soft" width={12}>
              {String(i + 1)}
            </SizableText>
            <SizableText size="$2" color="$ink">
              {s}
            </SizableText>
          </XStack>
        ))}
      </YStack>
      <SizableText size="$2" color="$soft">
        Interrupt anytime to steer the agent or ask it questions.
      </SizableText>
      <Button size="sm" onPress={onDone}>
        Got it
      </Button>
    </YStack>
  )
}
