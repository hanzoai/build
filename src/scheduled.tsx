/**
 * Scheduled tasks: everything that runs without you watching, in one place —
 * the prompts you scheduled from Chat and Dev, background runs, Studio renders
 * and workflows.
 *
 *   -/automations        your tasks, then Activity: every run, across products
 *   -/automations/<id>   one task's editor and runs (automations.tsx)
 *
 * Tasks are /v1/auto/automations and runs are /v1/auto/jobs (api/auto.ts), both
 * the reader's own; /v1/auto/events keeps them live while the page is open, and
 * a read every half minute keeps them right when the stream is down. A new task
 * is said in plain words — "every Monday at 9am" — and the platform says back
 * what it understood before anything is created.
 *
 * Its words are the reader's language (@hanzo/i18n `t`); a task's name and
 * prompt, a run's title, summary and error, and what the platform says back
 * are drawn as given.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Clock, ExternalLink, MoreHorizontal, Pencil, Play, Plus, ScrollText, Trash2 } from '@hanzogui/lucide-icons-2'
import { useI18n } from '@hanzo/i18n/react'
import { Button, DropdownMenu, Input, Switch, Textarea } from '@hanzo/ui'
import { StatusDot } from '@hanzo/ui/chat'
import { ModelPicker } from '@hanzo/ui/models'
import { useLimits } from '@hanzo/ui/product/useLimits'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { automations, create, cron, events, jobs, remove, save, start, words, type Automation, type Draft, type Job, type Parsed, type Schedule } from './api/auto.ts'
import { Refusal, told } from './api/call.ts'
import { ENSO, limits as readLimits, models } from './api/models.ts'
import { Confirm, Field, Line, Sheet } from './customize/ui.tsx'
import { local, PLAN, shaped, tidy, unplanned, unready, When, zone } from './automations.tsx'
import { useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { about, dollars, DOTS, lasted, merged, SAID, titled } from './activity.ts'
import { SOURCE } from './api/library.ts'
import { Outputs } from './library.tsx'
import { path } from './route.ts'

/** Where a move into Scheduled leaves the prompt a new task should start from. */
const ASK = 'hanzo.build.scheduled.ask'

/** Open Scheduled with a new task started from `prompt`: Dev's "Schedule this". */
export function schedule(prompt: string, go: (path: string) => void): void {
  try {
    sessionStorage.setItem(ASK, prompt)
  } catch {
    // Without storage the sheet opens empty.
  }
  go(path({ kind: 'screen', screen: 'automations' }))
}

function asked(): string {
  try {
    const s = sessionStorage.getItem(ASK) ?? ''
    sessionStorage.removeItem(ASK)
    return s
  } catch {
    return ''
  }
}

/** /v1/auto/events, followed while signed in: each job and task as it changes, again after a drop. */
function useLive(on: (h: { job?: Job; automation?: Automation }) => void) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const heard = useRef(on)
  heard.current = on
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!signed) return
    const ctl = new AbortController()
    let wait = 1000
    void (async () => {
      while (!ctl.signal.aborted) {
        const began = Date.now()
        try {
          await events(
            t,
            (h) => heard.current(h.kind === 'job' ? { job: h.job } : { automation: h.automation }),
            ctl.signal,
            () => setLive(true),
          )
          // A stream that stayed open a while is the platform's; one that closed at once is waited on longer each time.
          if (Date.now() - began > 5000) wait = 1000
        } catch (e) {
          // A stream the platform does not serve here is not asked for again; the half-minute read stands in.
          if (e instanceof Refusal && (e.status === 404 || e.status === 401 || e.status === 403)) return setLive(false)
        }
        setLive(false)
        if (ctl.signal.aborted) return
        await new Promise((r) => setTimeout(r, wait))
        wait = Math.min(wait * 2, 30_000)
      }
    })()
    return () => ctl.abort()
  }, [t, signed])
  return live
}

export function Scheduled() {
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const signed = Boolean(host.person)
  const [tick, setTick] = useState(0)
  const tasks = useRead(signed ? () => automations(target) : null, [] as Automation[], [target, signed, tick])
  const runs = useRead(signed ? () => jobs(target, { limit: 50 }) : null, [] as Job[], [target, signed, tick])
  const [shownTasks, setTasks] = useState<Automation[]>([])
  const [shownRuns, setRuns] = useState<Job[]>([])
  useEffect(() => setTasks(tasks.value), [tasks.value])
  useEffect(() => setRuns(runs.value), [runs.value])
  const [problem, setProblem] = useState('')
  const [making, setMaking] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Automation | null>(null)
  const [looking, setLooking] = useState<Job | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Dev's "Schedule this" arrives with the prompt the sheet starts from.
  useEffect(() => {
    const prompt = asked()
    if (prompt) setMaking(prompt)
  }, [])

  const live = useLive(({ job, automation }) => {
    if (job) {
      setRuns((was) => merged(was, job))
      setLooking((was) => (was && was.id === job.id ? job : was))
    }
    if (automation) setTasks((was) => (was.some((a) => a.id === automation.id) ? was.map((a) => (a.id === automation.id ? automation : a)) : [automation, ...was]))
  })
  // Without the stream, a read every half minute; with it, a clock for the running durations.
  useEffect(() => {
    if (!signed) return
    const id = setInterval(() => (live ? setNow(Date.now()) : setTick((n) => n + 1)), live ? 1000 : 30_000)
    return () => clearInterval(id)
  }, [signed, live])

  const act = async (what: string, work: () => Promise<void>) => {
    setProblem('')
    try {
      await work()
    } catch (e) {
      setProblem(unplanned(e) ? t(PLAN) : t('{name}: {error}', { name: what, error: told(e, t) }))
    }
  }
  const flip = (a: Automation, on: boolean) =>
    act(a.name, async () => {
      const next = await save(target, a.id, { enabled: on })
      setTasks((was) => was.map((x) => (x.id === next.id ? next : x)))
    })
  const run = (a: Automation) =>
    act(a.name, async () => {
      const r = await start(target, a.id)
      if (r.status === 'skipped') setProblem(t('{name}: not started, the previous run is still going.', { name: a.name }))
      setTick((n) => n + 1)
    })
  const edit = (id: string) => host.go(path({ kind: 'automation', id }))

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4', py: '$4' }}>
      <YStack width="100%" maxW={880} mx="auto" gap="$5">
        <XStack justify="space-between" items="flex-start" gap="$4">
          <YStack gap="$1" flex={1} minW={0}>
            <SizableText render="h1" size="$7" fontWeight="600" color="$ink">
              {t('Scheduled tasks')}
            </SizableText>
            <SizableText size="$2" color="$soft">
              {t('What runs without you watching: prompts on a schedule, background runs, Studio renders and workflows.')}
            </SizableText>
          </YStack>
          <Button size="sm" shrink={0} disabled={!signed} onPress={() => setMaking('')}>
            <Plus size={14} />
            {t('New task')}
          </Button>
        </XStack>
        <Line>{problem}</Line>

        <YStack gap="$2">
          <SizableText render="h2" size="$3" color="$ink" fontWeight="500">
            {t('Tasks')}
          </SizableText>
          {!signed ? (
            <Said says={t('Sign in to see your scheduled tasks.')}>
              <Button size="sm" onPress={() => host.signIn?.()}>
                {t('Sign in')}
              </Button>
            </Said>
          ) : tasks.error && !shownTasks.length ? (
            <Said says={told(tasks.error, t)} />
          ) : tasks.loading && !shownTasks.length ? (
            <Said says={t('Reading your tasks…')} />
          ) : !shownTasks.length ? (
            <Said says={t('No scheduled tasks yet. Ask Chat or Dev to do something on a schedule, or start one here.')}>
              <Button size="sm" onPress={() => setMaking('')}>
                {t('New task')}
              </Button>
            </Said>
          ) : (
            <YStack role="list" aria-label={t('Your tasks')} borderWidth={1} borderColor="$borderColor" rounded="$4" overflow="hidden">
              {shownTasks.map((a, i) => (
                <Task key={a.id} a={a} first={i === 0} onOpen={() => edit(a.id)} onSwitch={(on) => void flip(a, on)} onRun={() => void run(a)} onDelete={() => setDeleting(a)} />
              ))}
            </YStack>
          )}
        </YStack>

        {signed ? (
          <YStack gap="$2">
            <XStack items="center" gap="$2">
              <SizableText render="h2" size="$3" color="$ink" fontWeight="500" flex={1}>
                {t('Activity')}
              </SizableText>
              <SizableText size="$1" color="$soft">
                {live ? t('Live') : ''}
              </SizableText>
            </XStack>
            {runs.error && !shownRuns.length ? (
              <Said says={told(runs.error, t)} />
            ) : runs.loading && !shownRuns.length ? (
              <Said says={t('Reading what ran…')} />
            ) : !shownRuns.length ? (
              <Said says={t("Nothing has run yet. A task's runs, Dev's background runs and Studio's renders show here as they go.")} />
            ) : (
              <YStack role="list" aria-label={t('Activity')} borderWidth={1} borderColor="$borderColor" rounded="$4" overflow="hidden">
                {shownRuns.map((j, i) => (
                  <Ran key={j.id} j={j} first={i === 0} now={now} onOpen={() => setLooking(j)} />
                ))}
              </YStack>
            )}
          </YStack>
        ) : null}
      </YStack>

      <Make
        prompt={making}
        onClose={() => setMaking(null)}
        onMade={(a) => {
          setTasks((was) => [a, ...was.filter((x) => x.id !== a.id)])
          setProblem(t('Scheduled: {name}.', { name: a.name }))
        }}
      />
      <Detail j={looking} onClose={() => setLooking(null)} now={now} />
      {deleting ? (
        <Confirm
          what={deleting.name}
          says={t('It stops running, and its schedule and its runs go with it. A run going now is stopped.')}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          onYes={async () => {
            await remove(target, deleting.id)
            setTasks((was) => was.filter((x) => x.id !== deleting.id))
            setDeleting(null)
          }}
        />
      ) : null}
    </YStack>
  )
}

/** One task: what it is and when it runs next, its switch, and its menu. */
function Task({ a, first, onOpen, onSwitch, onRun, onDelete }: { a: Automation; first: boolean; onOpen: () => void; onSwitch: (on: boolean) => void; onRun: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  const when = a.draft
    ? t('Needs instructions')
    : [words(a.schedule, t), a.enabled && a.next ? t('next {when}', { when: local(a.next) }) : a.schedule.kind !== 'manual' && !a.enabled ? t('paused') : ''].filter(Boolean).join(' · ')
  return (
    <XStack role="listitem" items="center" gap="$3" px="$3" py="$3" borderTopWidth={first ? 0 : 1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
      <XStack render="button" aria-label={t('Open {name}', { name: a.name })} onPress={onOpen} flex={1} minW={0} items="center" gap="$3" cursor="pointer" $platform-web={{ textAlign: 'start' }}>
        <YStack width={32} height={32} rounded="$3" bg="$raised" items="center" justify="center" shrink={0} aria-hidden>
          <Clock size={16} />
        </YStack>
        <YStack flex={1} minW={0} gap="$0.5">
          <XStack items="center" gap="$2" minW={0}>
            <SizableText size="$2" color="$ink" numberOfLines={1} shrink={1}>
              {a.name}
            </SizableText>
            <Badge>{t(SOURCE[a.source])}</Badge>
            {a.draft ? <Badge>{t('Draft')}</Badge> : null}
          </XStack>
          <SizableText size="$1" color="$soft" numberOfLines={1}>
            {when}
          </SizableText>
        </YStack>
      </XStack>
      <Switch checked={a.enabled} disabled={a.draft} onCheckedChange={onSwitch} aria-label={t('{name} on', { name: a.name })} />
      <DropdownMenu
        trigger={
          <XStack render="button" aria-label={t('Actions for {name}', { name: a.name })} width={30} height={30} items="center" justify="center" rounded="$2" hoverStyle={{ bg: '$hover' }} cursor="pointer">
            <MoreHorizontal size={16} />
          </XStack>
        }
        items={[
          ...(a.draft ? [] : [{ key: 'run', label: t('Run now'), icon: <Play size={16} />, onSelect: onRun }]),
          { key: 'edit', label: t('Edit'), icon: <Pencil size={16} />, onSelect: onOpen },
          { key: 'delete', label: t('Delete'), icon: <Trash2 size={16} />, onSelect: onDelete },
        ]}
      />
    </XStack>
  )
}

/** One run in Activity. */
function Ran({ j, first, now, onOpen }: { j: Job; first: boolean; now: number; onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <XStack role="listitem" borderTopWidth={first ? 0 : 1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
      <XStack render="button" aria-label={t('{title}: {state}', { title: j.title, state: t(SAID[j.state]) })} onPress={onOpen} flex={1} minW={0} items="center" gap="$3" px="$3" py="$2.5" cursor="pointer" $platform-web={{ textAlign: 'start' }}>
        <StatusDot status={DOTS[j.state]} />
        <YStack flex={1} minW={0} gap="$0.5">
          <SizableText size="$2" color="$ink" numberOfLines={1}>
            {j.title}
          </SizableText>
          <SizableText size="$1" color="$soft" numberOfLines={1}>
            {about(j, now, t)}
          </SizableText>
        </YStack>
        <SizableText size="$1" color="$soft" shrink={0}>
          {j.state === 'running' && j.progress !== null ? `${Math.round(j.progress * 100)}%` : t(SAID[j.state])}
        </SizableText>
      </XStack>
    </XStack>
  )
}

/** One run, opened: how it went, its log, what it made and what it cost. */
function Detail({ j, onClose, now }: { j: Job | null; onClose: () => void; now: number }) {
  const { t } = useI18n()
  const host = useHost()
  return (
    <Sheet title={j?.title ?? t('Run')} open={Boolean(j)} onOpenChange={(o) => !o && onClose()} width={520}>
      {j ? (
        <YStack gap="$3">
          <XStack items="center" gap="$2">
            <StatusDot status={DOTS[j.state]} />
            <SizableText size="$2" color="$ink">
              {j.status && j.status !== j.state ? t('{state} ({status})', { state: t(SAID[j.state]), status: j.status }) : t(SAID[j.state])}
            </SizableText>
          </XStack>
          <Facts
            rows={[
              [t('From'), t(SOURCE[j.product])],
              [t('Started'), j.started ? local(j.started) : '—'],
              [t('Took'), lasted(j.started, j.finished, now) || '—'],
              [t('Cost'), j.cost !== null ? dollars(j.cost) : t('Not known yet')],
            ]}
          />
          {j.error ? (
            <SizableText size="$2" color="$soft" style={{ whiteSpace: 'pre-wrap' }}>
              {j.error}
            </SizableText>
          ) : null}
          {j.summary ? (
            <SizableText size="$2" color="$ink" style={{ whiteSpace: 'pre-wrap' }}>
              {j.summary}
            </SizableText>
          ) : null}
          {j.outputs.length ? (
            <YStack gap="$1">
              <SizableText size="$2" color="$soft">
                {t('What it made')}
              </SizableText>
              <Outputs ids={j.outputs} />
            </YStack>
          ) : null}
          <XStack gap="$2" flexWrap="wrap" rowGap="$2">
            {j.session ? (
              <Button size="sm" variant="outline" onPress={() => host.go(j.session!)}>
                <ScrollText size={14} />
                {t('Open its log')}
              </Button>
            ) : null}
            {j.origin ? (
              <Button size="sm" variant="outline" onPress={() => host.open(j.origin)}>
                <ExternalLink size={14} />
                {t('Open where it runs')}
              </Button>
            ) : null}
            {j.automation ? (
              <Button size="sm" variant="ghost" onPress={() => host.go(path({ kind: 'automation', id: j.automation! }))}>
                <Pencil size={14} />
                {t('Edit the task')}
              </Button>
            ) : null}
          </XStack>
        </YStack>
      ) : null}
    </Sheet>
  )
}

/** A new task: what it does, when in plain words, and the model it thinks with. */
function Make({ prompt, onClose, onMade }: { prompt: string | null; onClose: () => void; onMade: (a: Automation) => void }) {
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const signed = Boolean(host.person)
  const open = prompt !== null
  const [name, setName] = useState('')
  const [asks, setAsks] = useState('')
  const [said, setSaid] = useState('')
  const [read, setRead] = useState<Parsed | null>(null)
  const [reading, setReading] = useState(false)
  // Why the platform could not read the words: its refusal, said when drawn.
  const [unread, setUnread] = useState<unknown>(null)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Schedule>(() => shaped('daily', { kind: 'manual' }))
  const [model, setModel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const catalog = useRead(signed && open ? () => models(target) : null, [], [target, signed, open])
  const { limits } = useLimits(signed && open ? (signal) => readLimits(target, signal) : null, target)

  // Each opening starts from what it was handed.
  useEffect(() => {
    if (prompt === null) return
    setAsks(prompt)
    setName(titled(prompt))
    setSaid('')
    setRead(null)
    setUnread(null)
    setPicking(false)
    setNote('')
  }, [prompt])

  // The words are read once the typing settles; the answer is said back before anything is made.
  useEffect(() => {
    const text = said.trim()
    if (!open || !text || picking) {
      setRead(null)
      setUnread(null)
      return
    }
    const ctl = new AbortController()
    const id = setTimeout(() => {
      setReading(true)
      cron(target, text, zone(), { signal: ctl.signal })
        .then((p) => {
          setRead(p)
          setUnread(null)
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return
          setRead(null)
          setUnread(e)
        })
        .finally(() => !ctl.signal.aborted && setReading(false))
    }, 450)
    return () => {
      clearTimeout(id)
      ctl.abort()
    }
  }, [said, open, picking, target])

  const when: Schedule | null = picking ? picked : (read?.schedule ?? null)
  const wrong = when ? t(unready(when)) : ''

  const make = async () => {
    if (!name.trim()) return setNote(t('Name it first.'))
    if (!asks.trim()) return setNote(t('Say what it should do.'))
    if (!when) return setNote(said.trim() ? t('Say when in other words, or choose instead.') : t('Say when it runs.'))
    if (wrong) return setNote(wrong)
    setBusy(true)
    setNote('')
    try {
      const d: Draft = { name: name.trim(), instructions: asks.trim(), model, schedule: when, permissions: 'ask', notify: true, postTo: [], enabled: true, source: 'dev' }
      onMade(await create(target, tidy(d)))
      onClose()
    } catch (e) {
      setNote(unplanned(e) ? t(PLAN) : told(e, t))
    } finally {
      setBusy(false)
    }
  }

  const heard = useMemo(() => (read ? [read.says || words(read.schedule, t), read.next ? t('next {when}', { when: local(read.next) }) : ''].filter(Boolean).join(' · ') : ''), [read, t])

  return (
    <Sheet title={t('New task')} open={open} onOpenChange={(o) => !o && !busy && onClose()} width={560}>
      <YStack gap="$4">
        <Field label={t('Name')}>
          <Input value={name} onChangeText={setName} placeholder={t('Monday summary')} aria-label={t('Task name')} />
        </Field>
        <Field label={t('What it does')} hint={t('Each run is one Dev run in this organization, as you. It reads and proposes; it changes nothing on its own.')}>
          <Textarea value={asks} onChangeText={setAsks} placeholder={t('Summarize what changed in my repositories this week, and what needs me.')} aria-label={t('What it does')} rows={5} />
        </Field>
        <Field label={t('When')} hint={picking ? undefined : t('In your own words: every weekday at 8am, every 5 minutes, first of the month.')}>
          {picking ? (
            <YStack gap="$2">
              <When s={picked} onChange={setPicked} />
              <XStack>
                <Button size="sm" variant="ghost" onPress={() => setPicking(false)}>
                  {t('Say it instead')}
                </Button>
              </XStack>
            </YStack>
          ) : (
            <YStack gap="$2">
              <Input value={said} onChangeText={setSaid} placeholder={t('Every Monday at 9am')} aria-label={t('When it runs')} />
              <SizableText size="$1" color={unread ? '$soft' : '$ink'} role="status" minH={18}>
                {reading ? t('Reading…') : unread ? `${told(unread, t)} ${t('Choose instead, or say it another way.')}` : heard}
              </SizableText>
              <XStack>
                <Button size="sm" variant="ghost" onPress={() => setPicking(true)}>
                  {t('Choose instead')}
                </Button>
              </XStack>
            </YStack>
          )}
        </Field>
        <Field label={t('Model')}>
          <XStack>
            <ModelPicker
              size="sm"
              name={t('Model')}
              models={catalog.value}
              scope="chat"
              limits={limits}
              value={model ?? ENSO}
              onChange={(id) => setModel(id === ENSO ? null : id)}
              loading={catalog.loading}
              error={catalog.error ? told(catalog.error, t) : null}
            />
          </XStack>
        </Field>
        <Line>{note}</Line>
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="ghost" disabled={busy} onPress={onClose}>
            {t('Cancel')}
          </Button>
          <Button size="sm" disabled={busy || !signed} onPress={() => void make()}>
            {busy ? t('Creating…') : t('Create')}
          </Button>
        </XStack>
      </YStack>
    </Sheet>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <SizableText size="$1" color="$soft" px="$1.5" rounded="$2" borderWidth={1} borderColor="$borderColor" shrink={0}>
      {children}
    </SizableText>
  )
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <YStack gap="$1">
      {rows.map(([k, v]) => (
        <XStack key={k} gap="$3">
          <SizableText size="$1" color="$soft" width={72}>
            {k}
          </SizableText>
          <SizableText size="$1" color="$ink" flex={1}>
            {v}
          </SizableText>
        </XStack>
      ))}
    </YStack>
  )
}

function Said({ says, children }: { says: string; children?: ReactNode }) {
  return (
    <YStack borderWidth={1} borderColor="$borderColor" rounded="$4" px="$4" py="$8" gap="$3" items="center">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {says}
      </SizableText>
      {children}
    </YStack>
  )
}
