/**
 * One run, live: its transcript as it streams, the controls that reach it —
 * steer, pause, resume, stop — the pull request once it pushes one, and the
 * follow-up that continues it once it has finished.
 *
 * The detail read is the record and the stream adds to it; the two overlap
 * whenever a turn lands between the read and the subscribe, so turns are merged
 * by sequence. A reconnect after a drop re-reads the detail — the platform drops
 * a subscriber that falls behind, and frames missed then are only in the read.
 *
 * Steering is a queue the run drains between steps: a press is confirmed as
 * RECORDED, and the status is left to the feed to correct.
 *
 * A sandbox run is one agent invocation that takes its task on its command line
 * (apps/coding steer.go), so what continues it is a new run: a paused run is
 * carried on, and a finished one followed up, by `POST /v1/agent/coding` from
 * the branch its work was kept on — the platform's own continue, done here —
 * with the model and effort the composer's foot shows, which New shares.
 *
 * It reads as a chat: the person's ask opens it, each thing the agent said can
 * be copied and judged (a verdict is `build.verdict` on the event bus, as a
 * project's turns send it), and the title is the menu of what can be done to
 * the run. Share opens its story to the public build route.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronDown, ChevronRight, Copy, ExternalLink, GitPullRequest, Globe, PanelRight, Pencil, Share } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, DropdownMenu, Input, type DropdownMenuProps } from '@hanzo/ui'
import { Steer, type Command } from '@hanzo/ui/agents'
import { Composer } from '@hanzo/ui/chat'
import { ChipSelect } from '@hanzo/ui/product'
import { useEffect, useMemo, useState } from 'react'

import { approve, followUp, headline, retry, start, type Ask, type Earlier } from './api/coding.ts'
import { ENSO, label as named, models } from './api/models.ts'
import { list, message, pause, publish, rename, resume, stop, story, took } from './api/sessions.ts'
import { answer, cards, outcome, pull, settled, steps } from './api/turn.ts'
import { verdict } from './api/verdict.ts'
import { useKept, useProjects, useRead, useRun } from './data.ts'
import { Desk } from './desk.tsx'
import { useHost, useTarget } from './host.tsx'
import { EFFORTS } from './landing.tsx'
import { Out } from './out.tsx'
import { usePrefs } from './prefs.tsx'
import { Transcript } from './transcript.tsx'

const LIVE = new Set(['running', 'paused', ''])

// What this browser kept is read as it is found: a stored value that is not a string is none.
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

type MenuItems = NonNullable<DropdownMenuProps['items']>

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
  // Stop was pressed here: the run keeps its work after it answers, and says so with its status.
  const [stopping, setStopping] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState('')
  const [unfolded, setUnfolded] = useState(false)
  // The model and effort a run started here uses: New's choice, which a change here changes too.
  const { prefs } = usePrefs()
  const [chose, choose] = useKept<Record<string, unknown> | null>(`hanzo.build.new.${host.org ?? 'none'}`, null)
  const model = text(chose?.model) || prefs.code?.model || ENSO
  const pace = EFFORTS.find((e) => e.id === chose?.effort) ?? EFFORTS.find((e) => e.id === prefs.code?.effort) ?? EFFORTS[1]
  const catalog = useRead(signed ? () => models(t) : null, [], [t, signed])

  const mode = record?.mode ?? ''
  // A run that narrated no ask of its own opens with the one its title records, once it has said anything.
  const shown = useMemo(() => {
    const drawn = cards(events, mode)
    const ask = record ? headline(record.title, record.repo) : ''
    const opens = drawn[0]?.kind === 'said' && drawn[0].who === 'person'
    return ask && drawn.length && !opens ? [{ kind: 'said' as const, key: 'ask', who: 'person' as const, text: ask }, ...drawn] : drawn
  }, [events, mode, record])
  const end = outcome(events)
  const plan = useMemo(() => steps(events), [events])
  const kept = useMemo(() => settled(events), [events])
  const state = status || end.status
  // Where the run's work is published: its project's own address, read again when
  // the run says it went live, never an address an event names.
  const built = useProjects(t, signed && Boolean(record?.project))
  const rebuilt = built.reload
  useEffect(() => {
    if (end.published) rebuilt()
  }, [end.published, rebuilt])
  const site = built.value.find((p) => p.slug === record?.project)?.live ?? ''
  const pr = pull(record?.pr ?? '', record?.repo ?? '')
  const live = LIVE.has(state)
  const running = signed && live && !detail.error
  const paused = running && state === 'paused'
  const finished = signed && !live && !detail.error && Boolean(record)
  // A sandbox run is held by the coding service, which pauses it with its work
  // kept and has no resume of its own; a machine drains its commands itself.
  const held = (record?.environment || 'sandbox') === 'sandbox'
  // Words go to the run while it works, unless it is a paused sandbox run, which a new run carries on.
  const steering = running && !(paused && held)
  // A follow-up clones what the run kept, so it waits until the run has said where that is.
  const waiting = (paused && held && !kept.settled) || (finished && stopping && !kept.settled)
  const title = record?.title || (detail.loading ? '' : 'Untitled run')
  // A setup run explores and installs before it answers, which takes minutes.
  const setup = mode === 'setup'
  const [seen, setSeen] = useKept('hanzo.build.setup.seen', false)
  // How long setup runs have taken here: the ones this person can see, finished.
  const past = useRead(setup && running ? () => list(t, { kind: 'coding', status: 'done', limit: 500 }) : null, [], [t, setup, running])
  const span = took(past.value, 'setup')
  const earlier: Earlier | null = record
    ? {
        id,
        title,
        repo: record.repo,
        base: record.base,
        environment: record.environment,
        project: record.project,
        mode,
        pushed: kept.pushed,
      }
    : null
  const planned = mode === 'plan' && finished && state === 'done' ? answer(events) : ''
  // A failed run is tried again with the person's words as it recorded them.
  const failed = finished && state === 'error'
  const asked = shown.find((c) => c.kind === 'said' && c.who === 'person')
  const again = asked && asked.kind === 'said' ? asked.text : ''
  // What the recorded read left out: it carries the latest fifty turns.
  const hidden = Math.max(0, (detail.value?.events ?? 0) - (detail.value?.recent.length ?? 0))
  // Only a run still working is on a step.
  const current = running ? plan.find((x) => !x.done) : undefined

  // Asked for while it ran, said once when it stops. `notify` is only ever set
  // where Notification exists; the permission can be taken back since.
  useEffect(() => {
    if (!notify || running) return
    if (Notification.permission === 'granted') new Notification(record?.title || 'Run finished', { body: 'This run has finished.' })
    setNotify(false)
  }, [notify, running, record?.title])

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

  /** Something that answers a sentence for the note, or throws the reason. One at a time. */
  const act = async (work: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      setNote(await work())
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** A new run's ask with the model and effort the foot shows. The router is the platform's default, so it is not named. */
  const tuned = (a: Ask): Ask => ({ ...a, model: model === ENSO ? undefined : model, effort: pace.id })

  /**
   * A new run from this one's work, opened. A paused run it carries on is let go
   * first: the new run works in the same sandbox, where nothing else may be at work.
   */
  const carry = async (said: string, how: 'follow' | 'approve' | 'retry' = 'follow'): Promise<string> => {
    if (!earlier) throw new Error('This run is still being read')
    if (paused) await stop(t, id, 'Continued in a follow-up run').catch(() => undefined)
    const ask = how === 'approve' ? approve(earlier, said) : how === 'retry' ? retry(earlier, said) : followUp(earlier, said)
    const run = await start(t, tuned(ask))
    setDraft('')
    host.go(run.session)
    return ''
  }

  // The composer sends only words, and only while it is enabled.
  const send = () => {
    const words = draft.trim()
    if (steering) {
      void act(async () => {
        await message(t, id, words)
        setDraft('')
        return 'Sent — recorded on this run'
      })
      return
    }
    void act(() => carry(words))
  }

  const command = (c: Command) => {
    switch (c) {
      case 'stop':
        void act(async () => {
          await stop(t, id)
          setStopping(true)
          return 'Stop requested — the run keeps its work on its branch'
        })
        return
      case 'pause':
        void act(async () => {
          await pause(t, id)
          return held ? 'Pause requested — the run keeps its work on its branch and waits' : 'Pause asked — the machine pauses when it reads it'
        })
        return
      case 'resume':
        if (held) void act(() => carry(''))
        else
          void act(async () => {
            await resume(t, id)
            return 'Resume asked — the machine goes on when it reads it'
          })
        return
    }
  }

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
    } catch {
      setNote('This browser would not copy.')
    }
  }

  const share = (on: boolean) =>
    act(async () => {
      await publish(t, id, on)
      detail.reload()
      return on ? 'Shared — anyone with the link can read this run’s story' : 'No longer shared'
    })

  // What the title's menu does to the run.
  const manage: MenuItems = [
    ...(signed && record
      ? [
          {
            key: 'rename',
            label: 'Rename',
            icon: <Pencil size={16} />,
            onSelect: () => {
              setName(title)
              setNaming(true)
            },
          },
        ]
      : []),
    { key: 'copy', label: copied === 'id' ? 'Copied' : 'Copy run id', icon: <Copy size={16} />, description: id, onSelect: () => void copy('id', id) },
  ]
  // Sharing opens the public build route, which is addressed by the org and the project a run built.
  const link = record?.published ? story(t, record.org || host.org, record.project) : ''
  const sharing: MenuItems =
    signed && record?.project
      ? [
          record.published
            ? { key: 'unshare', label: 'Stop sharing', icon: <Globe size={16} />, onSelect: () => void share(false) }
            : { key: 'share', label: 'Share publicly', icon: <Globe size={16} />, description: 'Anyone with the link can read it', onSelect: () => void share(true) },
          ...(link ? [{ key: 'link', label: copied === 'link' ? 'Copied' : 'Copy public link', icon: <Copy size={16} />, description: link, onSelect: () => void copy('link', link) }] : []),
        ]
      : []

  const save = () =>
    void act(async () => {
      await rename(t, id, name)
      setNaming(false)
      detail.reload()
      return 'Renamed'
    })

  const placeholder = !signed
    ? 'Sign in to follow up'
    : waiting
      ? paused
        ? 'Pausing — the run is keeping its work…'
        : 'Stopping — the run is keeping its work…'
      : paused && held
        ? 'Continue this run with a follow up'
        : running
          ? setup
            ? 'Add a follow up for the setup agent'
            : 'Add a follow up'
          : finished
            ? 'Follow up — continues in a new run'
            : 'Reading this run…'

  // What a new run from here is made with; words that steer this run use neither.
  const tuning = signed && !steering ? (
    <XStack flex={1} items="center" gap="$2" justify="flex-end" flexWrap="wrap" rowGap="$1">
      <ChipSelect
        quiet
        name="Model"
        label={catalog.value.find((m) => m.id === model)?.label ?? named(model)}
        chosen={catalog.value.find((m) => m.id === model) ?? null}
        items={catalog.value}
        onChange={(m) => choose({ ...chose, model: m.id })}
        placeholder="Search models…"
        placement="top-end"
        loading={catalog.loading}
        error={catalog.error?.message ?? null}
      />
      <ChipSelect
        quiet
        name="Effort"
        label={pace.label}
        chosen={pace}
        items={EFFORTS}
        onChange={(e) => choose({ ...chose, effort: e.id })}
        placement="top-end"
        width={180}
      />
    </XStack>
  ) : undefined

  return (
    <XStack flex={1} minH={0} minW={0} width="100%">
      <YStack flex={1} minH={0} minW={0} width="100%" px="$6" $max-md={{ px: '$4' }}>
        <XStack pt="$3" pb="$2" gap="$3" items="center" minH={44}>
          <YStack flex={1} minW={0} items="flex-start">
            <DropdownMenu
              trigger={
                <XStack render="button" aria-label="Manage this run" items="center" gap="$1.5" maxW="100%" px="$1.5" mx="$-1.5" py="$0.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
                  <SizableText render="h1" size="$5" color="$ink" numberOfLines={1} minW={0}>
                    {title}
                  </SizableText>
                  <ChevronDown size={14} />
                </XStack>
              }
              items={manage}
            />
            <SizableText size="$1" color="$soft" numberOfLines={1} maxW="100%">
              {[state || (detail.loading ? 'reading' : ''), record?.repo, record?.branch, record?.published ? 'shared' : ''].filter(Boolean).join(' · ')}
            </SizableText>
          </YStack>
          {desk ? null : (
            // The side pane is drawn from md up (desk.tsx), so below it there is nothing to show.
            <XStack render="button" aria-label="Show the side pane" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }} onPress={() => setDesk(true)} $max-md={{ display: 'none' }}>
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
          {sharing.length ? (
            <DropdownMenu
              trigger={
                <XStack render="button" aria-label="Share" items="center" gap="$1.5" px="$2.5" py="$1.5" rounded="$3" borderWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                  <Share size={14} />
                  <SizableText size="$2" color="$ink">
                    Share
                  </SizableText>
                </XStack>
              }
              items={sharing}
            />
          ) : null}
        </XStack>

        <Transcript
          cards={shown}
          // A paused run's agent was stopped where it stood; what it was running is cut off.
          live={running && !paused}
          header={
            hidden ? (
              <SizableText size="$1" color="$soft">
                {`${hidden} earlier ${hidden === 1 ? 'turn is' : 'turns are'} not shown. The run’s Git tab has everything it pushed.`}
              </SizableText>
            ) : null
          }
          onApprove={planned && earlier ? (p) => void act(() => carry(p, 'approve')) : undefined}
          approving={busy}
          onVerdict={(v) => verdict(t, id, record?.project ?? '', v)}
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

        <YStack pb="$3" pt="$2" gap="$2">
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
          {failed ? (
            <XStack items="center" gap="$2">
              <Button size="sm" disabled={busy} onPress={() => void act(() => carry(again, 'retry'))}>
                {busy ? 'Starting…' : 'Try again'}
              </Button>
            </XStack>
          ) : null}
          {plan.length ? (
            // One line until it is opened, so the steps never crowd the transcript.
            <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
              <XStack
                render="button"
                aria-label={`Steps · ${plan.length}`}
                aria-expanded={unfolded}
                onPress={() => setUnfolded(!unfolded)}
                px="$3"
                py="$1.5"
                gap="$2"
                items="center"
                hoverStyle={{ bg: '$hover' }}
              >
                {unfolded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <SizableText size="$2" color="$ink">
                  {`Steps · ${plan.length}`}
                </SizableText>
                {current && !unfolded ? (
                  <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1} style={{ textAlign: 'right' }}>
                    {current.name}
                  </SizableText>
                ) : null}
              </XStack>
              {unfolded
                ? plan.map((s) => {
                    const on = s === current
                    return (
                      <XStack key={s.name} items="center" gap="$2" px="$3" py="$1.5" borderTopWidth={1} borderColor="$borderColor">
                        <SizableText size="$2" color={s.done || on ? '$ink' : '$soft'}>
                          {s.done ? '✓' : on ? '●' : '○'}
                        </SizableText>
                        <SizableText size="$2" color={s.done ? '$soft' : '$ink'} numberOfLines={1}>
                          {s.name}
                        </SizableText>
                      </XStack>
                    )
                  })
                : null}
            </YStack>
          ) : null}
          {setup && running && !seen ? <Onboarding onDone={() => setSeen(true)} /> : null}
          {running ? (
            <XStack items="center" gap="$2" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor" flexWrap="wrap" rowGap="$1">
              <SizableText size="$2" color="$ink" flex={1} minW={160}>
                {paused
                  ? kept.pushed
                    ? 'Paused — its work so far is on its branch.'
                    : 'Paused.'
                  : setup
                    ? span
                      ? `Environment setup takes ~${span[0] === span[1] ? span[0] : `${span[0]}–${span[1]}`} minutes.`
                      : 'Environment setup takes several minutes.'
                    : 'This run is still working.'}
              </SizableText>
              <Steer
                onCommand={command}
                withhold={[
                  ...(paused ? (['pause'] as const) : (['resume'] as const)),
                  ...(busy || waiting ? (['pause', 'resume', 'stop'] as const) : []),
                ]}
              />
              <Button size="sm" disabled={notify} onPress={() => void ask()}>
                {notify ? 'You will be notified' : 'Notify me'}
              </Button>
            </XStack>
          ) : null}
          <Composer
            inline
            value={draft}
            onChange={setDraft}
            onSend={send}
            disabled={!signed || busy || waiting || !(running || finished)}
            placeholder={placeholder}
            label={steering ? 'Steer this run' : 'Follow up on this run'}
            foot={tuning}
          />
          <SizableText size="$1" color="$soft" style={{ textAlign: 'center' }}>
            Hanzo is AI and can make mistakes.
          </SizableText>
        </YStack>
      </YStack>
      {desk ? (
        <Desk
          id={id}
          repo={record?.repo ?? ''}
          branch={record?.branch ?? ''}
          base={record?.base ?? ''}
          environment={record?.environment ?? ''}
          mode={mode}
          pr={pr}
          title={title}
          project={record?.project ?? ''}
          sandbox={record?.sandbox ?? ''}
          site={site}
          published={end.published}
          events={events}
          live={running}
          menu={[...manage, ...sharing]}
          refused={signed ? refused || (detail.error ? detail.error.message : '') : 'Sign in to follow this run.'}
          retry={signed ? 'Retry' : 'Sign in'}
          onRetry={signed ? detail.reload : () => host.signIn?.()}
          onHide={() => setDesk(false)}
        />
      ) : null}
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent maxW={480}>
          <DialogTitle>Rename this run</DialogTitle>
          <Input
            autoFocus
            value={name}
            onChangeText={setName}
            aria-label="The run’s name"
            maxLength={512}
            onKeyDown={(e: { key?: string }) => {
              if (e.key === 'Enter') save()
            }}
          />
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="outline" onPress={() => setNaming(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !name.trim()} onPress={save}>
              Save
            </Button>
          </XStack>
        </DialogContent>
      </Dialog>
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
