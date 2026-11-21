/**
 * Agents: the org's own — a model, instructions, the tools it may call, and
 * what it may spend.
 *
 * Browse is the platform's presets whose tool calls run on the platform;
 * starting from one opens a new agent written from it. Yours lists the org's
 * agents; opening one edits it in place, and only what changed is sent. An
 * agent calls only the tools it names, and only those that are on for the org,
 * so the choices are the tools that are on; "every tool" is whatever the
 * fleet's MCP server serves when it runs. A budget is required: what it may
 * spend each period, and in one run.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Bot } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch, Textarea } from '@hanzo/ui'
import { ModelPicker } from '@hanzo/ui/models'
import { useEffect, useMemo, useState } from 'react'

import { agents, ALL, create, draft, EMPTY, fromPreset, one, PERIODS, presets, remove, update, type Agent, type Draft, type Period, type Preset } from '../api/agents.ts'
import { models, type Model } from '../api/models.ts'
import { tools, type Tool } from '../api/tools.ts'
import { useHost, useTarget } from '../host.tsx'
import { useLoad } from './load.ts'
import { say } from './say.ts'
import { Add, Choice, Confirm, Empty, Failed, Field, Grid, Line, Mark, matches, mono, Part, Sheet, Soft, Tile, useCount, Visitor, type Pane } from './ui.tsx'

const money = (m: number): string => `$${(m / 1_000_000).toFixed(m % 10_000 ? 4 : 2).replace(/\.?0+$/, '')}`

export function Agents({ view, q, adding, onAdding, onView, onCount }: Pane) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const mine = useLoad(signed ? () => agents(t) : null, [] as Agent[], [t, signed])
  const offered = useLoad(view === 'discover' ? () => presets(t) : null, [] as Preset[], [t, view])
  useCount(mine.value.length, onCount)
  const [opened, setOpened] = useState<Agent | null>(null)
  const [start, setStart] = useState<Draft | null>(null)
  const [note, setNote] = useState('')

  const closeNew = () => {
    setStart(null)
    onAdding(false)
  }
  const editor =
    adding || start ? (
      <Editor
        start={start ?? EMPTY}
        onClose={closeNew}
        onSaved={(a) => {
          closeNew()
          onView('yours')
          mine.reload()
          setNote(`${a.name} is saved`)
        }}
      />
    ) : opened ? (
      <Editor
        agent={opened}
        onClose={() => setOpened(null)}
        onSaved={(a) => {
          setOpened(null)
          mine.reload()
          setNote(`${a.name} is saved`)
        }}
        onDeleted={() => {
          setNote(`${opened.name} is deleted`)
          setOpened(null)
          mine.reload()
        }}
      />
    ) : null

  if (view === 'discover') {
    const names = new Set(mine.value.map((a) => a.name))
    const shown = offered.value.filter((p) => matches(q, p.id, p.title, p.prompt))
    return (
      <YStack gap="$3">
        <Line>{note}</Line>
        <Part title="Start from a preset" detail="A ready agent from Hanzo. You can change it before you save it.">
          {offered.error && !offered.value.length ? (
            <Failed error={offered.error} onRetry={offered.reload} />
          ) : offered.loading && !offered.value.length ? (
            <Soft>Loading presets…</Soft>
          ) : !shown.length ? (
            <Soft>{offered.value.length ? `No preset matches “${q.trim()}”.` : 'There are no presets yet. Start from a blank agent with New agent.'}</Soft>
          ) : (
            <Grid label="Presets">
              {shown.map((p) => (
                <Tile
                  key={p.id}
                  title={p.title || p.id}
                  detail={p.prompt}
                  meta={`Preset ${p.id}`}
                  mark={<Mark name={p.title || p.id} icon={<Bot size={15} />} />}
                  action={signed ? <Add name={p.title || p.id} label="Use" added={names.has(p.id)} onPress={() => setStart(fromPreset(p))} /> : undefined}
                />
              ))}
            </Grid>
          )}
        </Part>
        {editor}
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
        <Empty title="No agents yet" detail="Start from a preset, or give a new one a model, instructions and tools.">
          <Button size="sm" variant="outline" onPress={() => onView('discover')}>
            Browse presets
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
              mark={<Mark name={a.name} icon={a.emoji ? <SizableText size="$4">{a.emoji}</SizableText> : undefined} />}
              onOpen={() => setOpened(a)}
            />
          ))}
        </Grid>
      )}
      {editor}
    </YStack>
  )

  function reach(a: Agent): string {
    if (a.tools.includes(ALL)) return 'every tool'
    return a.tools.length === 1 ? '1 tool' : `${a.tools.length} tools`
  }
}

/** Write a new agent, or change one; an existing agent is read whole first, for its instructions. */
function Editor({
  agent,
  start,
  onClose,
  onSaved,
  onDeleted,
}: {
  agent?: Agent
  start?: Draft
  onClose: () => void
  onSaved: (a: Agent) => void
  onDeleted?: () => void
}) {
  const t = useTarget()
  const full = useLoad(agent ? () => one(t, agent.id || agent.name) : null, null as Agent | null, [t, agent?.id])
  const catalog = useLoad(() => models(t), [] as Model[], [t])
  const on = useLoad(() => tools(t, { activated: true }), [] as Tool[], [t])
  const [d, setD] = useState<Draft>(start ?? EMPTY)
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
