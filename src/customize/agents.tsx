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
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
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
const ANY = 'All'

/** Categories as Browse offers them: the default agents' and presets' first, as listed, then the rest by how many each holds. */
export function kinds(first: readonly Cast[], rest: readonly Cast[]): string[] {
  const lead = [...new Set(first.map((c) => c.category))]
  const count = new Map<string, number>()
  for (const c of rest) if (!lead.includes(c.category)) count.set(c.category, (count.get(c.category) ?? 0) + 1)
  return [ANY, ...lead, ...[...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b))]
}

const money = (m: number): string => `$${(m / 1_000_000).toFixed(m % 10_000 ? 4 : 2).replace(/\.?0+$/, '')}`

export function Agents({ view, q, adding, onAdding, onView, onCount }: Pane) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const browsing = view === 'discover'
  const mine = useLoad(signed ? () => agents(t) : null, [] as Agent[], [t, signed])
  const offered = useLoad(browsing ? () => presets(t) : null, [] as Preset[], [t, view])
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
      opened(await use(t, c, window.location.href))
    } catch (e) {
      setNote(say(e))
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
        setNote(`${a.name} is saved`)
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
              Start from scratch
            </Button>
            <Button size="sm" variant="outline" onPress={() => setMaking('self')}>
              Clone yourself
            </Button>
            <Button size="sm" variant="outline" onPress={() => setMaking('person')}>
              Create from a person
            </Button>
          </XStack>
        ) : null}
        <XStack overflowX="auto" overflowY="hidden" pb="$1">
          <Choice label="Category" value={kind} options={kinds(first, figures.value).map((id) => ({ id, label: id }))} onChange={setKind} />
        </XStack>
        <Line>{note}</Line>
        {shown.length ? (
          <Grid label="Agents to start from">
            {shown.slice(0, more).map((c) => (
              <Tile
                key={`${c.category}/${c.name}/${c.title}`}
                title={c.title}
                detail={c.description === c.title || c.description === c.category ? undefined : c.description}
                meta={c.category}
                mark={<Mark name={c.title} size={40} logo={c.avatar} />}
                action={signed ? <Add name={c.title} label="Use" added={false} busy={using !== null} onPress={() => void take(c)} /> : undefined}
              />
            ))}
          </Grid>
        ) : figures.loading || offered.loading ? null : (
          <Soft>{`No agent matches “${q.trim()}”.`}</Soft>
        )}
        {shown.length > more ? (
          <XStack>
            <Button size="sm" variant="ghost" onPress={() => setMore(more + PAGE)}>
              More
            </Button>
          </XStack>
        ) : null}
        {failed ? <Failed error={failed} onRetry={figures.error ? figures.reload : offered.reload} /> : figures.loading || offered.loading ? <Soft>Loading…</Soft> : null}
        {editor}
        {making ? <Person self={making === 'self'} onClose={() => setMaking(null)} onMade={opened} /> : null}
      </YStack>
    )
  }

  if (!signed) {
    return <Visitor>Sign in to see your agents.</Visitor>
  }
  const shown = mine.value.filter((a) => matches(q, a.name, a.description, a.model))
  return (
    <YStack gap="$3">
      <Line>{note}</Line>
      {mine.error && !mine.value.length ? (
        <Failed error={mine.error} onRetry={mine.reload} />
      ) : mine.loading && !mine.value.length ? (
        <Soft>Loading your agents…</Soft>
      ) : !mine.value.length ? (
        <Empty title="No agents yet" detail="">
          <Button size="sm" variant="outline" onPress={() => onView('discover')}>
            Browse agents
          </Button>
          <Button size="sm" onPress={() => onAdding(true)}>
            New agent
          </Button>
        </Empty>
      ) : !shown.length ? (
        <Soft>{`No agent of yours matches “${q.trim()}”.`}</Soft>
      ) : (
        <Grid label="Your agents">
          {shown.map((a) => (
            <Tile
              key={a.id || a.name}
              title={a.name}
              detail={a.description || 'No description.'}
              meta={[a.model, `${a.runs} ${a.runs === 1 ? 'run' : 'runs'}`, reach(a), a.cap ? `${money(a.spent)} of ${money(a.cap)} this ${a.period || 'period'}` : ''].filter(Boolean).join(' · ')}
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
  const host = useHost()
  const t = useTarget()
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
      onMade(await use(t, person(name, about, writing, me?.avatar), window.location.href))
    } catch (e) {
      setNote(say(e))
      setWorking(false)
    }
  }
  return (
    <Sheet title={self ? 'Clone yourself' : 'Create from a person'} open onOpenChange={(o) => !o && onClose()}>
      <Field label="Name">
        <Input value={name} onChangeText={setName} aria-label="Name" />
      </Field>
      <Field label="Description">
        <Textarea value={about} onChangeText={setAbout} aria-label="Description" rows={3} />
      </Field>
      <Field label="Writing">
        <Textarea value={writing} onChangeText={setWriting} aria-label="Writing" rows={6} />
      </Field>
      <XStack>
        <Button size="sm" variant="ghost" onPress={() => file.current?.click()}>
          <Upload size={14} /> Upload
        </Button>
        <input
          ref={file}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.json,.html,text/*"
          hidden
          aria-label="Upload writing"
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
          Cancel
        </Button>
        <Button size="sm" disabled={working || !name.trim()} onPress={() => void save()}>
          Create
        </Button>
      </XStack>
    </Sheet>
  )
}

function reach(a: Agent): string {
  if (a.tools.includes(ALL)) return 'every tool'
  return a.tools.length === 1 ? '1 tool' : `${a.tools.length} tools`
}

/** An agent's face: its picture, the default agent's of its name, its emoji, or its initial. */
function Face({ agent: a, cast, size = 32 }: { agent: Agent; cast: readonly Cast[]; size?: number }) {
  const avatar = a.avatar || cast.find((c) => c.name.toLowerCase() === a.name.toLowerCase())?.avatar
  return <Mark name={a.name} size={size} logo={avatar} icon={a.emoji ? <SizableText size={size > 40 ? '$8' : '$4'}>{a.emoji}</SizableText> : undefined} />
}

/** One agent's page: who it is, what it runs on and reads, what it may call and spend, and what it has done. */
export function Profile({ name }: { name: string }) {
  const host = useHost()
  const t = useTarget()
  const got = useLoad(host.person ? () => profile(t, name) : null, null as { agent: Agent; runs: Run[] } | null, [t, name])
  const [editing, setEditing] = useState(false)
  const back = () => host.go(path({ kind: 'customize', tab: 'agents' }))
  const a = got.value?.agent
  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4', py: '$4' }}>
      <YStack width="100%" maxW={880} mx="auto" gap="$5">
        <XStack render="button" onPress={back} items="center" gap="$1.5" self="flex-start" cursor="pointer" aria-label="Back to agents">
          <ArrowLeft size={14} color="$soft" />
          <SizableText size="$2" color="$soft">
            Agents
          </SizableText>
        </XStack>
        {!host.person ? (
          <Visitor>Sign in to see this agent.</Visitor>
        ) : got.error && !a ? (
          <Failed error={got.error} onRetry={got.reload} />
        ) : !a ? (
          <Soft>Loading the agent…</Soft>
        ) : (
          <>
            <XStack items="center" gap="$4">
              <Face agent={a} cast={host.cast ?? []} size={64} />
              <YStack flex={1} minW={0} gap="$1">
                <SizableText render="h1" size="$7" color="$ink" numberOfLines={1}>
                  {a.name}
                </SizableText>
                <SizableText size="$3" color="$soft">
                  {a.description || 'No role written yet.'}
                </SizableText>
              </YStack>
              <Button size="sm" variant="outline" onPress={() => setEditing(true)}>
                Edit
              </Button>
            </XStack>
            <Part title="Model" detail={a.model || 'The deployment’s default'} />
            <Part title="Instructions" detail={a.instructions ? '' : 'None written: it runs on its model alone.'}>
              {a.instructions ? (
                <YStack p="$3" rounded="$3" borderWidth={1} borderColor="$borderColor" maxH={320} overflow="scroll">
                  <SizableText size="$2" color="$ink" style={{ whiteSpace: 'pre-wrap' }}>
                    {a.instructions}
                  </SizableText>
                </YStack>
              ) : null}
            </Part>
            <Part title="Tools" detail={a.tools.includes(ALL) ? 'Every tool the fleet’s MCP server serves.' : a.tools.length ? a.tools.join(', ') : 'None: it calls no tool.'} />
            <Part
              title="Budget"
              detail={a.cap ? `${money(a.spent)} of ${money(a.cap)} spent this ${a.period || 'period'}; at most ${money(a.task)} a run.` : 'No budget set.'}
            />
            <Part title="Runs" detail={a.runs ? `${a.runs} in all; the latest ${Math.min(a.runs, got.value!.runs.length)} below.` : 'It has not run yet.'}>
              {got.value!.runs.map((r) => (
                <XStack key={r.id} gap="$3" py="$2" borderTopWidth={1} borderColor="$borderColor" items="flex-start">
                  <SizableText size="$1" color={r.status === 'ok' ? '$soft' : '$bad'} width={44} shrink={0}>
                    {r.status === 'ok' ? 'ok' : 'failed'}
                  </SizableText>
                  <YStack flex={1} minW={0}>
                    <SizableText size="$2" color="$ink" numberOfLines={1}>
                      {r.input || '(no input)'}
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
  const t = useTarget()
  const full = useLoad(agent ? () => one(t, agent.id || agent.name) : null, null as Agent | null, [t, agent?.id])
  const catalog = useLoad(() => models(t), [] as Model[], [t])
  const on = useLoad(() => tools(t, { activated: true }), [] as Tool[], [t])
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
    const kept = d.tools.filter((n) => n !== ALL && !seen.has(n)).map((name) => ({ name, source: 'not on', description: '' }))
    return [...kept, ...listed]
  }, [on.value, d.tools])
  const shownTools = choices.filter((x) => matches(find, x.name, x.source, x.description))
  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const was = full.value
      const saved = agent && was ? await update(t, was, d) : await create(t, d)
      onSaved(saved)
    } catch (e) {
      setNote(say(e))
    } finally {
      setWorking(false)
    }
  }

  const pick = (name: string, yes: boolean) => set({ tools: yes ? [...d.tools, name] : d.tools.filter((n) => n !== name) })

  return (
    <Sheet title={agent ? agent.name : 'New agent'} open onOpenChange={(o) => !o && onClose()} width={680}>
      {agent && full.error && !full.value ? (
        <Failed error={full.error} onRetry={full.reload} />
      ) : !ready ? (
        <Soft>Loading the agent…</Soft>
      ) : (
        <>
          <Field label="Name" hint={agent ? 'An agent keeps its name.' : 'Letters, digits, . _ or -. Other agents call it as agent_<name>.'}>
            <Input value={d.name} onChangeText={(v: string) => set({ name: v })} aria-label="Name" disabled={Boolean(agent)} autoCapitalize="none" />
          </Field>
          <Field label="Description" hint="The line another agent reads to decide whether to call this one.">
            <Input value={d.description} onChangeText={(v: string) => set({ description: v })} placeholder="Answers questions about our codebase" aria-label="Description" />
          </Field>
          <Field label="Model">
            <XStack items="center" gap="$2" flexWrap="wrap">
              <ModelPicker
                size="sm"
                name="Model"
                placeholder="The deployment’s default"
                models={catalog.value}
                scope="chat"
                value={d.model || undefined}
                onChange={(id) => set({ model: id })}
                loading={catalog.loading}
                error={catalog.error ? say(catalog.error) : null}
              />
              {d.model && !agent ? (
                <Button size="sm" variant="ghost" onPress={() => set({ model: '' })}>
                  Use the default
                </Button>
              ) : null}
            </XStack>
          </Field>
          <Field label="Instructions" hint="The system prompt: what the model reads before every run.">
            <Textarea value={d.instructions} onChangeText={(v: string) => set({ instructions: v })} placeholder="Be terse, and cite the file you read." aria-label="Instructions" rows={8} />
          </Field>
          <YStack gap="$2">
            <XStack items="center" gap="$3">
              <YStack flex={1} minW={0}>
                <SizableText size="$2" color="$ink">
                  Tools
                </SizableText>
                <SizableText size="$1" color="$soft">
                  {every ? 'Every tool the fleet’s MCP server serves when it runs.' : d.tools.length ? `${d.tools.length} chosen. It can call only these.` : 'None chosen: it can call no tool.'}
                </SizableText>
              </YStack>
              <SizableText size="$1" color="$soft">
                Every tool
              </SizableText>
              <Switch checked={every} onCheckedChange={(v: boolean) => set({ tools: v ? [ALL] : [] })} aria-label="Every tool" />
            </XStack>
            {every ? null : (
              <>
                <Input value={find} onChangeText={setFind} placeholder="Find a tool…" aria-label="Find a tool" />
                <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" maxH={240} overflow="scroll">
                  {on.loading && !on.value.length ? (
                    <Soft>Loading the tools that are on…</Soft>
                  ) : on.error && !on.value.length ? (
                    <Failed error={on.error} onRetry={on.reload} />
                  ) : !shownTools.length ? (
                    <Soft>{choices.length ? 'No tool matches.' : 'No tool is on for your organization yet. Add skills or connectors first.'}</Soft>
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
                        <Switch checked={d.tools.includes(x.name)} onCheckedChange={(v: boolean) => pick(x.name, v)} aria-label={`Use ${x.name}`} />
                      </XStack>
                    ))
                  )}
                </YStack>
              </>
            )}
          </YStack>
          <YStack gap="$2">
            <SizableText size="$2" color="$ink">
              Budget
            </SizableText>
            <XStack gap="$3" flexWrap="wrap" rowGap="$2" items="flex-end">
              <YStack gap="$1" width={140}>
                <SizableText size="$1" color="$soft">
                  Each {d.period}, USD
                </SizableText>
                <Input value={d.cap} onChangeText={(v: string) => set({ cap: v })} placeholder="10" aria-label="Budget each period" inputMode="decimal" />
              </YStack>
              <YStack gap="$1" width={140}>
                <SizableText size="$1" color="$soft">
                  One run, USD
                </SizableText>
                <Input value={d.task} onChangeText={(v: string) => set({ task: v })} placeholder="1" aria-label="Budget for one run" inputMode="decimal" />
              </YStack>
              <Choice label="Period" value={d.period} options={PERIODS.map((p) => ({ id: p, label: p[0]!.toUpperCase() + p.slice(1) }))} onChange={(p: Period) => set({ period: p })} />
            </XStack>
            <SizableText size="$1" color="$soft">
              {full.value && full.value.cap ? `Spent ${money(full.value.spent)} this ${full.value.period}. ` : ''}A run stops at either limit.
            </SizableText>
          </YStack>
          <Line>{note}</Line>
          <XStack gap="$2" items="center">
            {agent && onDeleted ? (
              <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
                Delete
              </Button>
            ) : null}
            <XStack flex={1} />
            <Button size="sm" variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={working} onPress={() => void save()}>
              {agent ? 'Save' : 'Create'}
            </Button>
          </XStack>
          {agent && onDeleted ? (
            <Confirm
              what={agent.name}
              says="The agent and every run recorded against it are removed."
              open={asking}
              onOpenChange={setAsking}
              onYes={async () => {
                await remove(t, agent.id || agent.name)
                onDeleted()
              }}
            />
          ) : null}
        </>
      )}
    </Sheet>
  )
}
