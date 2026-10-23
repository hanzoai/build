/**
 * Agents: the org's own — a model, instructions, the tools it may call, and
 * what it may spend.
 *
 * Browse is every agent there is to start from: the host's default agents
 * (`cast`) and personas (`personas`), and the platform's presets whose tool
 * calls run on the platform, by name and category. Use makes the org's own
 * agent from one and opens it; nothing is added any other way, so an org starts
 * with none. An agent is also made from scratch, from the person signed in
 * (Clone yourself) or from anyone named. Yours lists the org's agents. Opening one is its profile page
 * (`-/customize/agents/<name>`): its face, part, model, instructions, tools,
 * budget and runs, edited in place, and only what changed is sent. An
 * agent calls only the tools it names, and only those that are on for the org,
 * so the choices are the tools that are on; "every tool" is whatever the
 * fleet's MCP server serves when it runs. A budget is required: what it may
 * spend each period, and in one run.
 *
 * Its words are the reader's language (@hanzo/i18n `t`); an agent's name,
 * description, instructions, model and runs, and the categories the host and
 * the platform give their templates, are drawn as given.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { phrase } from '@hanzo/i18n'
import { useI18n, type Say } from '@hanzo/i18n/react'
import { ArrowLeft, Upload } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch, Textarea } from '@hanzo/ui'
import { ModelPicker } from '@hanzo/ui/models'
import { useEffect, useMemo, useRef, useState } from 'react'

import { agents, ALL, create, draft, EMPTY, fromPreset, one, PERIODS, person, presets, profile, remove, update, use, type Agent, type Cast, type Draft, type Period, type Preset, type Run } from '../api/agents.ts'
import { models, type Model } from '../api/models.ts'
import { tools, type Tool } from '../api/tools.ts'
import { useHost, useTarget } from '../host.tsx'
import { path } from '../route.ts'
import { useLoad } from './load.ts'
import { say } from './say.ts'
import { Add, Choice, Confirm, Empty, Failed, Field, Grid, Line, Mark, matches, mono, Part, Sheet, Soft, Tile, useCount, Visitor, type Pane } from './ui.tsx'

/** How many cards Browse draws at a time. */
const PAGE = 60
const ANY = phrase('All')

/** Categories as Browse offers them: the default agents' and presets' first, as listed, then the rest by how many each holds. */
export function kinds(first: readonly Cast[], rest: readonly Cast[]): string[] {
  const lead = [...new Set(first.map((c) => c.category))]
  const count = new Map<string, number>()
  for (const c of rest) if (!lead.includes(c.category)) count.set(c.category, (count.get(c.category) ?? 0) + 1)
  return [ANY, ...lead, ...[...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b))]
}

const money = (m: number): string => `$${(m / 1_000_000).toFixed(m % 10_000 ? 4 : 2).replace(/\.?0+$/, '')}`

/** A category as Browse names it: All, and the platform's presets and people, in the reader's words; the rest are the host's, as given. */
const category = (c: string, t: Say): string => (c === ANY || c === 'Preset' || c === 'Person' ? t(c) : c)

/**
 * A budget's sentences by its period ('' where the agent names none): whole
 * sentences, so a language says the period its own way.
 */
const SPENT: Record<Period | '', string> = {
  day: phrase('{spent} of {cap} this day'),
  week: phrase('{spent} of {cap} this week'),
  month: phrase('{spent} of {cap} this month'),
  '': phrase('{spent} of {cap} this period'),
}
const BUDGET: Record<Period | '', string> = {
  day: phrase('{spent} of {cap} spent this day; at most {task} a run.'),
  week: phrase('{spent} of {cap} spent this week; at most {task} a run.'),
  month: phrase('{spent} of {cap} spent this month; at most {task} a run.'),
  '': phrase('{spent} of {cap} spent this period; at most {task} a run.'),
}
const SO_FAR: Record<Period | '', string> = {
  day: phrase('Spent {spent} this day.'),
  week: phrase('Spent {spent} this week.'),
  month: phrase('Spent {spent} this month.'),
  '': phrase('Spent {spent} this period.'),
}
const EACH: Record<Period, string> = { day: phrase('Each day, USD'), week: phrase('Each week, USD'), month: phrase('Each month, USD') }
const PERIOD: Record<Period, string> = { day: phrase('Day'), week: phrase('Week'), month: phrase('Month') }

export function Agents({ view, q, adding, onAdding, onView, onCount }: Pane) {
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const signed = Boolean(host.person)
  const browsing = view === 'discover'
  const mine = useLoad(signed ? () => agents(target) : null, [] as Agent[], [target, signed])
  const offered = useLoad(browsing ? () => presets(target) : null, [] as Preset[], [target, view])
  const figures = useLoad(browsing && host.personas ? host.personas : null, [] as readonly Cast[], [view])
  useCount(mine.value.length, onCount)
  const [note, setNote] = useState('')
  const [kind, setKind] = useState(ANY)
  const [more, setMore] = useState(PAGE)
  const [using, setUsing] = useState<Cast | null>(null)
  const [making, setMaking] = useState<'self' | 'person' | null>(null)
  useEffect(() => setMore(PAGE), [q, kind])

  const opened = (a: Agent) => host.go(path({ kind: 'agent', name: a.name }))
  const take = async (c: Cast) => {
    setUsing(c)
    setNote('')
    try {
      opened(await use(target, c, window.location.href))
    } catch (e) {
      setNote(say(e, t))
    } finally {
      setUsing(null)
    }
  }

  const editor = adding ? (
    <Editor
      onClose={() => onAdding(false)}
      onSaved={(a) => {
        onAdding(false)
        onView('yours')
        mine.reload()
        setNote(t('{name} is saved', { name: a.name }))
      }}
    />
  ) : null

  if (browsing) {
    const first = [...(host.cast ?? []), ...offered.value.map(fromPreset)]
    const all = [...first, ...figures.value]
    const shown = all.filter((c) => (kind === ANY || c.category === kind) && matches(q, c.title, c.name, c.description, c.category))
    const failed = figures.error ?? offered.error
    return (
      <YStack gap="$3">
        {signed ? (
          <XStack gap="$2" flexWrap="wrap">
            <Button size="sm" variant="outline" onPress={() => onAdding(true)}>
              {t('Start from scratch')}
            </Button>
            <Button size="sm" variant="outline" onPress={() => setMaking('self')}>
              {t('Clone yourself')}
            </Button>
            <Button size="sm" variant="outline" onPress={() => setMaking('person')}>
              {t('Create from a person')}
            </Button>
          </XStack>
        ) : null}
        <XStack overflowX="auto" overflowY="hidden" pb="$1">
          <Choice label={t('Category')} value={kind} options={kinds(first, figures.value).map((id) => ({ id, label: category(id, t) }))} onChange={setKind} />
        </XStack>
        <Line>{note}</Line>
        {shown.length ? (
          <Grid label={t('Agents to start from')}>
            {shown.slice(0, more).map((c) => (
              <Tile
                key={`${c.category}/${c.name}/${c.title}`}
                title={c.title}
                detail={c.description === c.title || c.description === c.category ? undefined : c.description}
                meta={category(c.category, t)}
                mark={<Mark name={c.title} size={40} logo={c.avatar} />}
                action={signed ? <Add name={c.title} use added={false} busy={using !== null} onPress={() => void take(c)} /> : undefined}
              />
            ))}
          </Grid>
        ) : figures.loading || offered.loading ? null : (
          <Soft>{t('No agent matches “{q}”.', { q: q.trim() })}</Soft>
        )}
        {shown.length > more ? (
          <XStack>
            <Button size="sm" variant="ghost" onPress={() => setMore(more + PAGE)}>
              {t('More')}
            </Button>
          </XStack>
        ) : null}
        {failed ? <Failed error={failed} onRetry={figures.error ? figures.reload : offered.reload} /> : figures.loading || offered.loading ? <Soft>{t('Loading…')}</Soft> : null}
        {editor}
        {making ? <Person self={making === 'self'} onClose={() => setMaking(null)} onMade={opened} /> : null}
      </YStack>
    )
  }

  if (!signed) {
    return <Visitor>{t('Sign in to see your agents.')}</Visitor>
  }
  const shown = mine.value.filter((a) => matches(q, a.name, a.description, a.model))
  return (
    <YStack gap="$3">
      <Line>{note}</Line>
      {mine.error && !mine.value.length ? (
        <Failed error={mine.error} onRetry={mine.reload} />
      ) : mine.loading && !mine.value.length ? (
        <Soft>{t('Loading your agents…')}</Soft>
      ) : !mine.value.length ? (
        <Empty title={t('No agents yet')} detail="">
          <Button size="sm" variant="outline" onPress={() => onView('discover')}>
            {t('Browse agents')}
          </Button>
          <Button size="sm" onPress={() => onAdding(true)}>
            {t('New agent')}
          </Button>
        </Empty>
      ) : !shown.length ? (
        <Soft>{t('No agent of yours matches “{q}”.', { q: q.trim() })}</Soft>
      ) : (
        <Grid label={t('Your agents')}>
          {shown.map((a) => (
            <Tile
              key={a.id || a.name}
              title={a.name}
              detail={a.description || t('No description.')}
              meta={[
                a.model,
                a.runs === 1 ? t('1 run') : t('{n} runs', { n: a.runs }),
                reach(a, t),
                a.cap ? t(SPENT[a.period], { spent: money(a.spent), cap: money(a.cap) }) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              mark={<Face agent={a} cast={host.cast ?? []} />}
              onOpen={() => opened(a)}
            />
          ))}
        </Grid>
      )}
      {editor}
    </YStack>
  )
}

/** Clone yourself, or anyone named: a name, who they are, and writing of theirs, pasted or uploaded. */
function Person({ self, onClose, onMade }: { self: boolean; onClose: () => void; onMade: (a: Agent) => void }) {
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const me = self ? host.person : null
  const [name, setName] = useState(me?.name ?? '')
  const [about, setAbout] = useState('')
  const [writing, setWriting] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement | null>(null)
  const read = async (files: FileList | null) => {
    const texts = await Promise.all([...(files ?? [])].map((f) => f.text()))
    setWriting((w) => [w.trim(), ...texts.map((x) => x.trim())].filter(Boolean).join('\n\n'))
  }
  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      onMade(await use(target, person(name, about, writing, me?.avatar), window.location.href))
    } catch (e) {
      setNote(say(e, t))
      setWorking(false)
    }
  }
  return (
    <Sheet title={self ? t('Clone yourself') : t('Create from a person')} open onOpenChange={(o) => !o && onClose()}>
      <Field label={t('Name')}>
        <Input value={name} onChangeText={setName} aria-label={t('Name')} />
      </Field>
      <Field label={t('Description')}>
        <Textarea value={about} onChangeText={setAbout} aria-label={t('Description')} rows={3} />
      </Field>
      <Field label={t('Writing')}>
        <Textarea value={writing} onChangeText={setWriting} aria-label={t('Writing')} rows={6} />
      </Field>
      <XStack>
        <Button size="sm" variant="ghost" onPress={() => file.current?.click()}>
          <Upload size={14} /> {t('Upload')}
        </Button>
        <input
          ref={file}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.json,.html,text/*"
          hidden
          aria-label={t('Upload writing')}
          onChange={(e) => {
            void read(e.currentTarget.files)
            e.currentTarget.value = ''
          }}
        />
      </XStack>
      <Line>{note}</Line>
      <XStack gap="$2" items="center">
        <XStack flex={1} />
        <Button size="sm" variant="ghost" onPress={onClose}>
          {t('Cancel')}
        </Button>
        <Button size="sm" disabled={working || !name.trim()} onPress={() => void save()}>
          {t('Create')}
        </Button>
      </XStack>
    </Sheet>
  )
}

function reach(a: Agent, t: Say): string {
  if (a.tools.includes(ALL)) return t('every tool')
  return a.tools.length === 1 ? t('1 tool') : t('{n} tools', { n: a.tools.length })
}

/** An agent's face: its picture, the default agent's of its name, its emoji, or its initial. */
function Face({ agent: a, cast, size = 32 }: { agent: Agent; cast: readonly Cast[]; size?: number }) {
  const avatar = a.avatar || cast.find((c) => c.name.toLowerCase() === a.name.toLowerCase())?.avatar
  return <Mark name={a.name} size={size} logo={avatar} icon={a.emoji ? <SizableText size={size > 40 ? '$8' : '$4'}>{a.emoji}</SizableText> : undefined} />
}

/** One agent's page: who it is, what it runs on and reads, what it may call and spend, and what it has done. */
export function Profile({ name }: { name: string }) {
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const got = useLoad(host.person ? () => profile(target, name) : null, null as { agent: Agent; runs: Run[] } | null, [target, name])
  const [editing, setEditing] = useState(false)
  const back = () => host.go(path({ kind: 'customize', tab: 'agents' }))
  const a = got.value?.agent
  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4', py: '$4' }}>
      <YStack width="100%" maxW={880} mx="auto" gap="$5">
        <XStack render="button" onPress={back} items="center" gap="$1.5" self="flex-start" cursor="pointer" aria-label={t('Back to agents')}>
          <ArrowLeft size={14} color="$soft" {...{ 'data-i18n-mirror': '' }} />
          <SizableText size="$2" color="$soft">
            {t('Agents')}
          </SizableText>
        </XStack>
        {!host.person ? (
          <Visitor>{t('Sign in to see this agent.')}</Visitor>
        ) : got.error && !a ? (
          <Failed error={got.error} onRetry={got.reload} />
        ) : !a ? (
          <Soft>{t('Loading the agent…')}</Soft>
        ) : (
          <>
            <XStack items="center" gap="$4">
              <Face agent={a} cast={host.cast ?? []} size={64} />
              <YStack flex={1} minW={0} gap="$1">
                <SizableText render="h1" size="$7" color="$ink" numberOfLines={1}>
                  {a.name}
                </SizableText>
                <SizableText size="$3" color="$soft">
                  {a.description || t('No role written yet.')}
                </SizableText>
              </YStack>
              <Button size="sm" variant="outline" onPress={() => setEditing(true)}>
                {t('Edit')}
              </Button>
            </XStack>
            <Part title={t('Model')} detail={a.model || t('The deployment’s default')} />
            <Part title={t('Instructions')} detail={a.instructions ? '' : t('None written: it runs on its model alone.')}>
              {a.instructions ? (
                <YStack p="$3" rounded="$3" borderWidth={1} borderColor="$borderColor" maxH={320} overflow="scroll">
                  <SizableText size="$2" color="$ink" style={{ whiteSpace: 'pre-wrap' }}>
                    {a.instructions}
                  </SizableText>
                </YStack>
              ) : null}
            </Part>
            <Part title={t('Tools')} detail={a.tools.includes(ALL) ? t('Every tool the fleet’s MCP server serves.') : a.tools.length ? a.tools.join(', ') : t('None: it calls no tool.')} />
            <Part title={t('Budget')} detail={a.cap ? t(BUDGET[a.period], { spent: money(a.spent), cap: money(a.cap), task: money(a.task) }) : t('No budget set.')} />
            <Part
              title={t('Runs')}
              detail={a.runs ? t('{runs} in all; the latest {n} below.', { runs: a.runs, n: Math.min(a.runs, got.value!.runs.length) }) : t('It has not run yet.')}
            >
              {got.value!.runs.map((r) => (
                <XStack key={r.id} gap="$3" py="$2" borderTopWidth={1} borderColor="$borderColor" items="flex-start">
                  <SizableText size="$1" color={r.status === 'ok' ? '$soft' : '$bad'} width={44} shrink={0}>
                    {r.status === 'ok' ? t('ok') : t('failed')}
                  </SizableText>
                  <YStack flex={1} minW={0}>
                    <SizableText size="$2" color="$ink" numberOfLines={1}>
                      {r.input || t('(no input)')}
                    </SizableText>
                    <SizableText size="$1" color="$soft" numberOfLines={2}>
                      {r.status === 'ok' ? r.output : r.error}
                    </SizableText>
                  </YStack>
                  <SizableText size="$1" color="$soft" shrink={0}>
                    {[r.model, r.at ? new Date(r.at).toLocaleString() : ''].filter(Boolean).join(' · ')}
                  </SizableText>
                </XStack>
              ))}
            </Part>
          </>
        )}
      </YStack>
      {editing && a ? (
        <Editor
          agent={a}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            got.reload()
          }}
          onDeleted={back}
        />
      ) : null}
    </YStack>
  )
}

/** Write a new agent, or change one; an existing agent is read whole first, for its instructions. */
function Editor({
  agent,
  onClose,
  onSaved,
  onDeleted,
}: {
  agent?: Agent
  onClose: () => void
  onSaved: (a: Agent) => void
  onDeleted?: () => void
}) {
  const { t } = useI18n()
  const target = useTarget()
  const full = useLoad(agent ? () => one(target, agent.id || agent.name) : null, null as Agent | null, [target, agent?.id])
  const catalog = useLoad(() => models(target), [] as Model[], [target])
  const on = useLoad(() => tools(target, { activated: true }), [] as Tool[], [target])
  const [d, setD] = useState<Draft>(EMPTY)
  const [ready, setReady] = useState(!agent)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const [find, setFind] = useState('')

  useEffect(() => {
    if (full.value) {
      setD(draft(full.value))
      setReady(true)
    }
  }, [full.value])

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const every = d.tools.includes(ALL)
  // The tools that are on, and any the agent already names that are not.
  const choices = useMemo(() => {
    const listed = on.value.map((x) => ({ name: x.name, source: x.source, description: x.description }))
    const seen = new Set(listed.map((x) => x.name))
    const kept = d.tools.filter((n) => n !== ALL && !seen.has(n)).map((name) => ({ name, source: t('not on'), description: '' }))
    return [...kept, ...listed]
  }, [on.value, d.tools, t])
  const shownTools = choices.filter((x) => matches(find, x.name, x.source, x.description))
  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const was = full.value
      const saved = agent && was ? await update(target, was, d) : await create(target, d)
      onSaved(saved)
    } catch (e) {
      setNote(say(e, t))
    } finally {
      setWorking(false)
    }
  }

  const pick = (name: string, yes: boolean) => set({ tools: yes ? [...d.tools, name] : d.tools.filter((n) => n !== name) })

  return (
    <Sheet title={agent ? agent.name : t('New agent')} open onOpenChange={(o) => !o && onClose()} width={680}>
      {agent && full.error && !full.value ? (
        <Failed error={full.error} onRetry={full.reload} />
      ) : !ready ? (
        <Soft>{t('Loading the agent…')}</Soft>
      ) : (
        <>
          <Field label={t('Name')} hint={agent ? t('An agent keeps its name.') : t('Letters, digits, . _ or -. Other agents call it as agent_<name>.')}>
            <Input value={d.name} onChangeText={(v: string) => set({ name: v })} aria-label={t('Name')} disabled={Boolean(agent)} autoCapitalize="none" />
          </Field>
          <Field label={t('Description')} hint={t('The line another agent reads to decide whether to call this one.')}>
            <Input value={d.description} onChangeText={(v: string) => set({ description: v })} placeholder={t('Answers questions about our codebase')} aria-label={t('Description')} />
          </Field>
          <Field label={t('Model')}>
            <XStack items="center" gap="$2" flexWrap="wrap">
              <ModelPicker
                size="sm"
                name={t('Model')}
                placeholder={t('The deployment’s default')}
                models={catalog.value}
                scope="chat"
                value={d.model || undefined}
                onChange={(id) => set({ model: id })}
                loading={catalog.loading}
                error={catalog.error ? say(catalog.error, t) : null}
              />
              {d.model && !agent ? (
                <Button size="sm" variant="ghost" onPress={() => set({ model: '' })}>
                  {t('Use the default')}
                </Button>
              ) : null}
            </XStack>
          </Field>
          <Field label={t('Instructions')} hint={t('The system prompt: what the model reads before every run.')}>
            <Textarea value={d.instructions} onChangeText={(v: string) => set({ instructions: v })} placeholder={t('Be terse, and cite the file you read.')} aria-label={t('Instructions')} rows={8} />
          </Field>
          <YStack gap="$2">
            <XStack items="center" gap="$3">
              <YStack flex={1} minW={0}>
                <SizableText size="$2" color="$ink">
                  {t('Tools')}
                </SizableText>
                <SizableText size="$1" color="$soft">
                  {every
                    ? t('Every tool the fleet’s MCP server serves when it runs.')
                    : d.tools.length
                      ? t('{n} chosen. It can call only these.', { n: d.tools.length })
                      : t('None chosen: it can call no tool.')}
                </SizableText>
              </YStack>
              <SizableText size="$1" color="$soft">
                {t('Every tool')}
              </SizableText>
              <Switch checked={every} onCheckedChange={(v: boolean) => set({ tools: v ? [ALL] : [] })} aria-label={t('Every tool')} />
            </XStack>
            {every ? null : (
              <>
                <Input value={find} onChangeText={setFind} placeholder={t('Find a tool…')} aria-label={t('Find a tool')} />
                <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" maxH={240} overflow="scroll">
                  {on.loading && !on.value.length ? (
                    <Soft>{t('Loading the tools that are on…')}</Soft>
                  ) : on.error && !on.value.length ? (
                    <Failed error={on.error} onRetry={on.reload} />
                  ) : !shownTools.length ? (
                    <Soft>{choices.length ? t('No tool matches.') : t('No tool is on for your organization yet. Add skills or connectors first.')}</Soft>
                  ) : (
                    shownTools.map((x, i) => (
                      <XStack key={x.name} items="center" gap="$3" px="$3" py="$2" borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
                        <YStack flex={1} minW={0}>
                          <SizableText size="$2" color="$ink" style={mono} numberOfLines={1}>
                            {x.name}
                          </SizableText>
                          <SizableText size="$1" color="$soft" numberOfLines={1}>
                            {[x.source, x.description].filter(Boolean).join(' · ')}
                          </SizableText>
                        </YStack>
                        <Switch checked={d.tools.includes(x.name)} onCheckedChange={(v: boolean) => pick(x.name, v)} aria-label={t('Use {name}', { name: x.name })} />
                      </XStack>
                    ))
                  )}
                </YStack>
              </>
            )}
          </YStack>
          <YStack gap="$2">
            <SizableText size="$2" color="$ink">
              {t('Budget')}
            </SizableText>
            <XStack gap="$3" flexWrap="wrap" rowGap="$2" items="flex-end">
              <YStack gap="$1" width={140}>
                <SizableText size="$1" color="$soft">
                  {t(EACH[d.period])}
                </SizableText>
                <Input value={d.cap} onChangeText={(v: string) => set({ cap: v })} placeholder="10" aria-label={t('Budget each period')} inputMode="decimal" />
              </YStack>
              <YStack gap="$1" width={140}>
                <SizableText size="$1" color="$soft">
                  {t('One run, USD')}
                </SizableText>
                <Input value={d.task} onChangeText={(v: string) => set({ task: v })} placeholder="1" aria-label={t('Budget for one run')} inputMode="decimal" />
              </YStack>
              <Choice label={t('Period')} value={d.period} options={PERIODS.map((p) => ({ id: p, label: t(PERIOD[p]) }))} onChange={(p: Period) => set({ period: p })} />
            </XStack>
            <SizableText size="$1" color="$soft">
              {[full.value && full.value.cap ? t(SO_FAR[full.value.period], { spent: money(full.value.spent) }) : '', t('A run stops at either limit.')].filter(Boolean).join(' ')}
            </SizableText>
          </YStack>
          <Line>{note}</Line>
          <XStack gap="$2" items="center">
            {agent && onDeleted ? (
              <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
                {t('Delete')}
              </Button>
            ) : null}
            <XStack flex={1} />
            <Button size="sm" variant="ghost" onPress={onClose}>
              {t('Cancel')}
            </Button>
            <Button size="sm" disabled={working} onPress={() => void save()}>
              {agent ? t('Save') : t('Create')}
            </Button>
          </XStack>
          {agent && onDeleted ? (
            <Confirm
              what={agent.name}
              says={t('The agent and every run recorded against it are removed.')}
              open={asking}
              onOpenChange={setAsking}
              onYes={async () => {
                await remove(target, agent.id || agent.name)
                onDeleted()
              }}
            />
          ) : null}
        </>
      )}
    </Sheet>
  )
}
