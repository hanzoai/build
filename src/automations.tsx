/**
 * Automations: work that runs itself in this organization, on a schedule or
 * when someone presses Run. Each run is one Dev run.
 *
 *   -/automations        the org's automations; a row opens its editor
 *   -/automations/new    a new one: its name, what it does, when it runs
 *   -/automations/<id>   its editor, its switch, Run now and its runs
 *
 * Every read and write is /v1/auto/automations (api/auto.ts), scoped to the
 * org the builder is in. A save sends only what changed; the switch sends
 * `enabled` alone, so turning one on or off never changes who it runs as.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronLeft, Plus, Workflow } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch, Textarea } from '@hanzo/ui'
import { StatusDot, type SessionStatus } from '@hanzo/ui/chat'
import { ModelPicker } from '@hanzo/ui/models'
import { ChipSelect } from '@hanzo/ui/product'
import { useLimits } from '@hanzo/ui/product/useLimits'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import { ago } from './ago.ts'
import { automation, automations, changes, create, remove, runs, save, start, starters, words, type Automation, type Draft, type Kind, type Run, type Schedule, type Starter } from './api/auto.ts'
import { Refusal } from './api/call.ts'
import { ENSO, limits as readLimits, models } from './api/models.ts'
import { Choice, Confirm, Field, Line, Sheet } from './customize/ui.tsx'
import { useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { path } from './route.ts'

const zone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const KINDS: readonly { id: Kind; label: string }[] = [
  { id: 'manual', label: 'When I run it' },
  { id: 'hourly', label: 'Every hour' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Every week' },
  { id: 'cron', label: 'Cron' },
]

const DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
]

const PERMISSIONS = [
  { id: 'ask', label: 'Ask first' },
  { id: 'auto', label: 'Act on its own' },
] as const

/** A run's status as the rail's dot draws it. */
const DOT: Record<string, SessionStatus> = { succeeded: 'done', failed: 'error', running: 'running', queued: 'running', skipped: 'stopped', refused: 'stopped' }
const WORD: Record<string, string> = { succeeded: 'Succeeded', failed: 'Failed', running: 'Running', queued: 'Queued', skipped: 'Skipped', refused: 'Refused' }
const live = (s: string): boolean => s === 'running' || s === 'queued'

/** The schedule a kind starts from, keeping whatever of `was` still applies. */
function shaped(kind: Kind, was: Schedule): Schedule {
  // A schedule that runs only when asked keeps no zone worth keeping: leaving it takes the person's own.
  const tz = was.kind === 'manual' || !was.tz ? zone() : was.tz
  switch (kind) {
    case 'manual':
      return { kind }
    case 'hourly':
      return { kind, at: `00:${(was.at ?? '00:00').slice(3) || '00'}`, tz }
    case 'daily':
    case 'weekdays':
      return { kind, at: was.kind === 'hourly' || !was.at ? '09:00' : was.at, tz }
    case 'weekly':
      return { kind, at: was.kind === 'hourly' || !was.at ? '09:00' : was.at, day: was.day || 'mon', tz }
    case 'cron':
      return { kind, cron: was.cron || '0 9 * * 1-5', tz }
  }
}

/** What is wrong with a schedule before it is sent, or ''. */
function unready(s: Schedule): string {
  if ((s.kind === 'daily' || s.kind === 'weekdays' || s.kind === 'weekly') && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(s.at ?? '')) return 'Time of day is HH:MM on a 24-hour clock.'
  if (s.kind === 'cron' && (s.cron ?? '').trim().split(/\s+/).length !== 5) return 'Cron is five fields: minute, hour, day of month, month, day of week.'
  return ''
}

/** A schedule as the platform reads it: an hourly minute in two digits. */
function tidy(d: Draft): Draft {
  const s = d.schedule
  if (s.kind !== 'hourly') return d
  const m = Math.min(59, Number((s.at ?? '').slice(3)) || 0)
  return { ...d, schedule: { ...s, at: `00:${String(m).padStart(2, '0')}` } }
}

/** A local time and date for an RFC 3339 instant. */
const local = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** The editor's copy of an automation: what a save compares against. */
const drafted = (a: Automation): Draft => ({
  name: a.name,
  instructions: a.instructions,
  model: a.model,
  schedule: a.schedule,
  permissions: a.permissions,
  notify: a.notify,
  enabled: a.draft ? true : a.enabled,
})

/** `next`, keeping each field of `cur` the person changed from `was` since. */
function rebase(cur: Draft, was: Draft, next: Draft): Draft {
  const out = { ...next }
  for (const k of Object.keys(next) as (keyof Draft)[]) {
    if (JSON.stringify(cur[k]) !== JSON.stringify(was[k])) (out as Record<string, unknown>)[k] = cur[k]
  }
  return out
}

/** A run refused for want of credit. */
const broke = (e: unknown): boolean => e instanceof Refusal && e.status === 402
const BROKE = 'This organization has no credit for a run. Add credit, then Run now again.'


export function Automations() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [q, setQ] = useState('')
  const [problem, setProblem] = useState('')
  const list = useRead(signed ? () => automations(t) : null, [] as Automation[], [t, signed])
  const needle = q.trim().toLowerCase()
  const shown = list.value.filter((a) => !needle || a.name.toLowerCase().includes(needle) || a.instructions.toLowerCase().includes(needle))
  const open = (id: string) => host.go(path({ kind: 'automation', id }))

  const flip = async (a: Automation, on: boolean) => {
    setProblem('')
    try {
      await save(t, a.id, { enabled: on })
      list.reload()
    } catch (e) {
      setProblem(`${a.name}: ${(e as Error).message}`)
    }
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6">
      <YStack width="100%" maxW={1040} mx="auto" gap="$4">
        <XStack justify="space-between" items="flex-start" gap="$4">
          <YStack gap="$1" flex={1} minW={0}>
            <SizableText size="$6" fontWeight="500" color="$ink">
              Automations
            </SizableText>
            <SizableText size="$2" color="$soft">
              Work that runs itself in this organization, on a schedule or when you run it. Each run is a Dev run.
            </SizableText>
          </YStack>
          <Button size="sm" shrink={0} disabled={!signed} onPress={() => open('new')}>
            <Plus size={14} />
            New automation
          </Button>
        </XStack>
        <XStack justify="flex-end">
          <YStack width={240} maxW="100%">
            <Input value={q} onChangeText={setQ} placeholder="Search…" aria-label="Search automations" disabled={!signed} />
          </YStack>
        </XStack>
        <Line>{problem}</Line>
        {list.error ? (
          <Empty says={list.error.message} />
        ) : !signed ? (
          <Empty says="Sign in to see this organization's automations." />
        ) : list.loading && list.value.length === 0 ? (
          <Empty says="Reading automations…" />
        ) : shown.length === 0 ? (
          <Empty says={list.value.length === 0 ? 'No automations yet.' : 'Nothing matches.'}>
            {list.value.length === 0 ? (
              <Button size="sm" onPress={() => open('new')}>
                New automation
              </Button>
            ) : null}
          </Empty>
        ) : (
          <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
            <XStack px="$3" py="$2" gap="$3">
              <SizableText flex={1} size="$1" color="$soft">
                Name
              </SizableText>
              <SizableText size="$1" color="$soft" width={220}>
                When
              </SizableText>
              <SizableText size="$1" color="$soft" width={150}>
                Last run
              </SizableText>
              <SizableText size="$1" color="$soft" width={56} style={{ textAlign: 'right' }}>
                On
              </SizableText>
            </XStack>
            {shown.map((a) => (
              <Item key={a.id} a={a} onOpen={() => open(a.id)} onSwitch={(on) => void flip(a, on)} />
            ))}
          </YStack>
        )}
      </YStack>
    </YStack>
  )
}

/** One automation in the list: its name opens it, and its switch arms it. */
function Item({ a, onOpen, onSwitch }: { a: Automation; onOpen: () => void; onSwitch: (on: boolean) => void }) {
  const about = useId()
  return (
    <XStack items="center" gap="$3" px="$3" py="$2.5" borderTopWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
      <XStack render="button" aria-label={`Open ${a.name}`} aria-describedby={about} onPress={onOpen} flex={1} minW={0} items="center" gap="$3">
        <Workflow size={14} />
        <SizableText size="$2" color="$ink" numberOfLines={1} flex={1} minW={0} style={{ textAlign: 'left' }}>
          {a.name}
        </SizableText>
        <XStack id={about} items="center" gap="$3">
          {a.draft ? (
            <SizableText size="$1" color="$soft" px="$2" rounded="$2" borderWidth={1} borderColor="$borderColor">
              Draft
            </SizableText>
          ) : null}
          <SizableText size="$1" color="$soft" width={220} numberOfLines={1} style={{ textAlign: 'left' }}>
            {a.draft ? 'Needs instructions' : words(a.schedule)}
          </SizableText>
          <XStack width={150} items="center" gap="$2">
            {a.last ? <StatusDot status={DOT[a.last.status] ?? 'idle'} /> : null}
            <SizableText size="$1" color="$soft" numberOfLines={1}>
              {a.last ? `${WORD[a.last.status] ?? a.last.status} · ${ago(a.last.at)}` : 'Never run'}
            </SizableText>
          </XStack>
        </XStack>
      </XStack>
      <XStack width={56} justify="flex-end">
        <Switch checked={a.enabled} disabled={a.draft} onCheckedChange={onSwitch} aria-label={`${a.name} on`} />
      </XStack>
    </XStack>
  )
}

function Empty({ says, children }: { says: string; children?: ReactNode }) {
  return (
    <YStack borderWidth={1} borderColor="$borderColor" rounded="$4" px="$4" py="$8" gap="$3" items="center">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {says}
      </SizableText>
      {children}
    </YStack>
  )
}

const BLANK = (): Draft => ({ name: '', instructions: '', model: null, schedule: { kind: 'manual' }, permissions: 'ask', notify: false, enabled: true })

/** One automation: what it does and when, its switch, Run now, and its runs. `new` writes one. */
export function Editor({ id }: { id: string }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const fresh = id === 'new'
  // `tick` reads the automation again; `beat` reads its runs again.
  const [tick, setTick] = useState(0)
  const [beat, setBeat] = useState(0)
  const saved = useRead(signed && !fresh ? () => automation(t, id) : null, null as Automation | null, [t, signed, id, tick])
  const history = useRead(signed && !fresh ? () => runs(t, id) : null, [] as Run[], [t, signed, id, beat])
  const catalog = useRead(signed ? () => models(t) : null, [], [t, signed])
  const { limits } = useLimits(signed ? (signal) => readLimits(t, signal) : null, t)
  // `base` is what the form started from; a save sends what changed since, and only that.
  const [base, setBase] = useState<Draft>(BLANK)
  const [d, setD] = useState<Draft>(BLANK)
  const [ready, setReady] = useState(fresh)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [credit, setCredit] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const asksRef = useRef<HTMLTextAreaElement>(null)
  const offered = useRead(signed && fresh ? () => starters(t) : null, [] as Starter[], [t, signed, fresh])
  const here = useRef(true)
  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
    }
  }, [])
  const a = saved.value

  // The switch of a saved automation is saved as it moves; of a new one or a draft, with the rest.
  const switchesAlone = Boolean(a && !a.draft)
  const change = changes(base, d)
  if (switchesAlone) delete change.enabled
  const dirty = Object.keys(change).length > 0

  // What is saved now becomes the form's start, unless the person is mid-edit: then
  // their edit stands, and what they did not touch is not sent back over it.
  const clean = useRef(true)
  clean.current = !dirty
  useEffect(() => {
    if (!a) return
    if (clean.current) {
      setBase(drafted(a))
      setD(drafted(a))
    }
    setReady(true)
  }, [a])

  // A run going is read every 4s; a scheduled automation's runs every 30s, so a tick's run appears.
  const going = history.value.some((r) => live(r.status))
  const every = going ? 4000 : a && a.enabled && a.schedule.kind !== 'manual' ? 30_000 : 0
  useEffect(() => {
    if (!every) return
    const timer = setInterval(() => setBeat((n) => n + 1), every)
    return () => clearInterval(timer)
  }, [every])

  // An edit answers what the last line asked for, so the line goes with it.
  const set = (p: Partial<Draft>) => {
    setNote('')
    setCredit(false)
    setD((x) => ({ ...x, ...p }))
  }
  const setWhen = (p: Partial<Schedule>) => set({ schedule: { ...d.schedule, ...p } })
  const wrong = unready(d.schedule)

  const zones = useMemo(() => {
    try {
      return ['UTC', ...Intl.supportedValuesOf('timeZone').filter((z) => z !== 'UTC')].map((z) => ({ id: z, label: z }))
    } catch {
      return [{ id: 'UTC', label: 'UTC' }]
    }
  }, [])

  // A draft waits on its instructions: they have the focus when it opens.
  const drafty = Boolean(a?.draft)
  useEffect(() => {
    if (ready && drafty) asksRef.current?.focus()
  }, [ready, drafty])

  const act = async (what: string, work: () => Promise<void>) => {
    setBusy(what)
    setNote('')
    setCredit(false)
    try {
      await work()
    } catch (e) {
      // Wanting credit is said in these words only where a run was asked for.
      const run = what === 'run' && broke(e)
      setNote(run ? BROKE : (e as Error).message)
      setCredit(run)
    } finally {
      setBusy('')
    }
  }

  /** What a save still needs, said, with the focus on where to give it; true when nothing. */
  const complete = (): boolean => {
    const ask = !d.name.trim() ? (['Name it first.', nameRef] as const) : !d.instructions.trim() ? (['Add instructions first.', asksRef] as const) : null
    if (ask) {
      setNote(ask[0])
      ask[1].current?.focus()
      return false
    }
    if (wrong) {
      setNote(wrong)
      return false
    }
    return true
  }

  const keep = () =>
    act('save', async () => {
      if (fresh) {
        const made = await create(t, tidy(d))
        // Only while still here: a person who left during the create stays where they went.
        if (here.current) host.go(path({ kind: 'automation', id: made.id }), { replace: true })
        return
      }
      const snap = d
      const send = changes(base, tidy(snap))
      if (switchesAlone) delete send.enabled
      const now = Object.keys(send).length ? await save(t, id, send) : a!
      // What was typed while the save was in flight stands.
      setBase(drafted(now))
      setD((cur) => rebase(cur, snap, drafted(now)))
      setTick((n) => n + 1)
      setNote('Saved.')
    })

  const flip = (on: boolean) => {
    if (!switchesAlone) return set({ enabled: on })
    void act('switch', async () => {
      await save(t, id, { enabled: on })
      setTick((n) => n + 1)
    })
  }

  const go = () =>
    act('run', async () => {
      const run = await start(t, id)
      setBeat((n) => n + 1)
      if (run.status === 'skipped') setNote('Not started: the previous run is still going.')
    })

  const leave = (how?: { replace?: boolean }) => host.go(path({ kind: 'screen', screen: 'automations' }), how)
  // Unsaved work is not left without a word.
  const back = () => (dirty ? setLeaving(true) : leave())
  const begin = (x: Starter) => {
    const tz = x.schedule.kind === 'manual' ? undefined : zone()
    set({ name: x.name, instructions: x.instructions, schedule: tz ? { ...x.schedule, tz } : { kind: 'manual' } })
    asksRef.current?.focus()
  }

  if (!signed) return <Page title="Automation" onBack={() => leave()} says="Sign in to see this organization's automations." />
  if (!fresh && saved.error && !a) return <Page title="Automation" onBack={() => leave()} says={saved.error.message} />
  if (!ready) return <Page title="Automation" onBack={() => leave()} says="Reading the automation…" />

  const s = d.schedule
  // A new automation or a draft has nothing to switch on until it says what to do.
  const can = switchesAlone || Boolean(d.instructions.trim())
  const on = switchesAlone ? Boolean(a?.enabled) : can && d.enabled
  const says = switchesAlone ? (on ? 'On' : 'Off') : !can ? 'Add instructions first' : on ? 'On when saved' : 'Off when saved'
  const state = fresh ? 'Not created yet' : dirty ? 'Unsaved changes' : ''
  const sayId = `${id}-switch`
  return (
    <YStack flex={1} minH={0}>
      <YStack shrink={0} px="$6" pt="$4" pb="$3" borderBottomWidth={1} borderColor="$borderColor">
        <XStack width="100%" maxW={760} mx="auto" items="center" gap="$3" flexWrap="wrap" rowGap="$2">
          <Button size="sm" variant="ghost" onPress={back} aria-label="All automations">
            <ChevronLeft size={14} />
            Automations
          </Button>
          <SizableText size="$1" color="$soft" role="status">
            {state}
          </SizableText>
          <XStack flex={1} />
          <XStack items="center" gap="$2">
            <SizableText id={sayId} size="$2" color="$soft">
              {says}
            </SizableText>
            <Switch
              checked={on}
              disabled={busy === 'switch' || !can}
              onCheckedChange={flip}
              aria-label={switchesAlone ? `${a!.name} on` : 'On when saved'}
              aria-describedby={sayId}
            />
          </XStack>
          {a && !a.draft ? (
            <Button size="sm" variant="outline" disabled={Boolean(busy) || dirty} onPress={() => void go()}>
              {busy === 'run' ? 'Starting…' : 'Run now'}
            </Button>
          ) : null}
          {a && dirty ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(busy)}
              onPress={() => {
                setBase(drafted(a))
                setD(drafted(a))
                setNote('')
              }}
            >
              Discard changes
            </Button>
          ) : null}
          <Button size="sm" disabled={Boolean(busy) || !(fresh || drafty || dirty)} onPress={() => complete() && void keep()}>
            {busy === 'save' ? 'Saving…' : fresh ? 'Create' : 'Save'}
          </Button>
        </XStack>
        {note ? (
          <XStack width="100%" maxW={760} mx="auto" items="center" gap="$3" pt="$2">
            <Line>{note}</Line>
            {credit ? (
              <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'settings', section: 'billing' }))}>
                Add credit
              </Button>
            ) : null}
          </XStack>
        ) : null}
      </YStack>
      <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$5">
        <YStack width="100%" maxW={760} mx="auto" gap="$5">
          <YStack gap="$1">
            <SizableText render="h1" size="$6" color="$ink" numberOfLines={1}>
              {fresh ? 'New automation' : a?.name}
            </SizableText>
            <SizableText size="$2" color="$soft">
              {fresh
                ? 'Name it, say what it should do, and when. It runs as you, in this organization.'
                : a?.draft
                  ? 'A draft: say what it should do and save it, and it runs.'
                  : [words(a!.schedule), a!.next && a!.enabled ? `next ${local(a!.next)}` : a!.schedule.kind === 'manual' ? '' : 'off'].filter(Boolean).join(' · ')}
            </SizableText>
          </YStack>

          {fresh && offered.value.length && !d.instructions.trim() ? (
            <XStack gap="$2" flexWrap="wrap" rowGap="$2" items="center">
              <SizableText size="$2" color="$soft">
                Start from
              </SizableText>
              {offered.value.map((x) => (
                <Button key={x.key} size="sm" variant="outline" onPress={() => begin(x)} aria-label={`Start from ${x.name}`}>
                  {x.name}
                </Button>
              ))}
            </XStack>
          ) : null}
          <Field label="Name">
            <Input
              ref={nameRef}
              value={d.name}
              onChangeText={(v: string) => set({ name: v })}
              onSubmitEditing={() => asksRef.current?.focus()}
              placeholder="Morning briefing"
              aria-label="Automation name"
              autoFocus={fresh}
            />
          </Field>
          <Field label="Instructions (required)" hint="What the agent does each run. It works in a Dev sandbox with this organization's connectors, MCP servers and skills.">
            <Textarea
              ref={asksRef}
              value={d.instructions}
              onChangeText={(v: string) => set({ instructions: v })}
              placeholder="What should it do each run? For example: summarize what needs my attention today across calendar, email and messages."
              aria-label="Instructions"
              rows={7}
            />
          </Field>
          <Field label="When it runs" hint={s.kind === 'cron' ? 'Five fields: minute, hour, day of month, month, day of week.' : undefined}>
            <XStack gap="$2" flexWrap="wrap" rowGap="$2" items="center">
              <ChipSelect name="When it runs" label={KINDS.find((k) => k.id === s.kind)!.label} chosen={KINDS.find((k) => k.id === s.kind)} items={KINDS} onChange={(k) => set({ schedule: shaped(k.id, s) })} placement="bottom-start" width={200} />
              {s.kind === 'weekly' ? <ChipSelect name="Day" label={DAYS.find((x) => x.id === s.day)?.label ?? 'Monday'} chosen={DAYS.find((x) => x.id === s.day)} items={DAYS} onChange={(x) => setWhen({ day: x.id })} placement="bottom-start" width={180} /> : null}
              {s.kind === 'daily' || s.kind === 'weekdays' || s.kind === 'weekly' ? (
                <YStack width={110}>
                  <Input value={s.at ?? ''} onChangeText={(v: string) => setWhen({ at: v.trim() })} placeholder="09:00" aria-label="Time of day" inputMode="text" />
                </YStack>
              ) : null}
              {s.kind === 'hourly' ? (
                <XStack items="center" gap="$2">
                  <SizableText size="$2" color="$soft">
                    at minute
                  </SizableText>
                  <YStack width={70}>
                    <Input value={(s.at ?? '00:00').slice(3)} onChangeText={(v: string) => setWhen({ at: `00:${v.replace(/\D/g, '').slice(0, 2)}` })} placeholder="00" aria-label="Minute" inputMode="numeric" />
                  </YStack>
                </XStack>
              ) : null}
              {s.kind === 'cron' ? (
                <YStack width={200}>
                  <Input value={s.cron ?? ''} onChangeText={(v: string) => setWhen({ cron: v })} placeholder="0 9 * * 1-5" aria-label="Cron" autoCapitalize="none" />
                </YStack>
              ) : null}
              {s.kind !== 'manual' ? <ChipSelect name="Time zone" label={s.tz || 'UTC'} chosen={{ id: s.tz || 'UTC', label: s.tz || 'UTC' }} items={zones} onChange={(z) => setWhen({ tz: z.id })} placeholder="Search zones…" placement="bottom-start" width={260} /> : null}
            </XStack>
          </Field>
          <Field label="Model">
            <XStack>
              <ModelPicker
                size="sm"
                name="Model"
                models={catalog.value}
                scope="chat"
                limits={limits}
                value={d.model ?? ENSO}
                onChange={(id) => set({ model: id === ENSO ? null : id })}
                loading={catalog.loading}
                error={catalog.error?.message ?? null}
              />
            </XStack>
          </Field>
          <Field
            label="Permissions"
            hint={d.permissions === 'auto' ? 'Works and uses connectors without stopping.' : 'Reads and researches, changes nothing, and ends with the actions it would take for you to approve.'}
          >
            <Choice label="Permissions" value={d.permissions} options={PERMISSIONS} onChange={(p) => set({ permissions: p })} />
          </Field>
          <XStack items="center" gap="$3">
            <YStack flex={1} minW={0}>
              <SizableText size="$2" color="$ink">
                Email me when a run ends
              </SizableText>
              <SizableText size="$1" color="$soft">
                One line on how it went, with a link to the run.
              </SizableText>
            </YStack>
            <Switch checked={d.notify} onCheckedChange={(v: boolean) => set({ notify: v })} aria-label="Email me when a run ends" />
          </XStack>

          {dirty && wrong && note !== wrong ? <Line>{wrong}</Line> : null}
          {a ? (
            <XStack>
              <Button size="sm" variant="ghost" disabled={Boolean(busy)} onPress={() => setAsking(true)}>
                Delete
              </Button>
            </XStack>
          ) : null}

          {a ? (
            <YStack gap="$2">
              <SizableText size="$3" color="$ink">
                Runs
              </SizableText>
              {history.error && !history.value.length ? (
                <Line>{history.error.message}</Line>
              ) : !history.value.length ? (
                <SizableText size="$2" color="$soft">
                  {history.loading ? 'Reading its runs…' : a.draft ? 'It runs once its instructions are saved.' : 'No runs yet. Run now starts one.'}
                </SizableText>
              ) : (
                <YStack role="list" borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden" aria-label="Run history">
                  {history.value.map((r, i) => (
                    <XStack role="listitem" key={r.id} items="flex-start" gap="$3" px="$3" py="$2.5" borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
                      <YStack pt="$1">
                        <StatusDot status={DOT[r.status] ?? 'idle'} />
                      </YStack>
                      <YStack flex={1} minW={0} gap="$0.5">
                        <SizableText size="$2" color="$ink">
                          {`${WORD[r.status] ?? r.status} · ${local(r.at)}`}
                        </SizableText>
                        <SizableText size="$1" color="$soft" style={{ whiteSpace: 'pre-wrap' }}>
                          {r.summary || (live(r.status) ? 'Working…' : '')}
                        </SizableText>
                      </YStack>
                      {r.session ? (
                        <Button size="sm" variant="ghost" onPress={() => host.go(r.session!)} aria-label={`Open the Dev run of ${local(r.at)}`}>
                          Open run
                        </Button>
                      ) : null}
                    </XStack>
                  ))}
                </YStack>
              )}
            </YStack>
          ) : null}
        </YStack>
        {a ? (
          <Confirm
            what={a.name}
            says="It stops running, and its schedule and its runs go with it. A run going now is stopped."
            open={asking}
            onOpenChange={setAsking}
            onYes={async () => {
              await remove(t, a.id)
              leave({ replace: true })
            }}
          />
        ) : null}
        <Sheet title="Leave without saving?" open={leaving} onOpenChange={setLeaving} width={420}>
          <SizableText size="$2" color="$soft">
            {fresh ? 'This automation is not created yet.' : 'Your changes to this automation are not saved.'}
          </SizableText>
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="ghost" onPress={() => setLeaving(false)}>
              Keep editing
            </Button>
            <Button size="sm" variant="destructive" onPress={() => leave()}>
              Leave
            </Button>
          </XStack>
        </Sheet>
      </YStack>
    </YStack>
  )
}

function Page({ title, says, onBack }: { title: string; says: string; onBack: () => void }) {
  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6">
      <YStack width="100%" maxW={760} mx="auto" gap="$4">
        <XStack>
          <Button size="sm" variant="ghost" onPress={onBack} aria-label="All automations">
            <ChevronLeft size={14} />
            Automations
          </Button>
        </XStack>
        <SizableText render="h1" size="$6" color="$ink">
          {title}
        </SizableText>
        <SizableText size="$2" color="$soft">
          {says}
        </SizableText>
      </YStack>
    </YStack>
  )
}
