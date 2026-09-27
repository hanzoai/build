/**
 * Agents: the org's own — a model, instructions, the tools it may call, and
 * what it may spend.
 *
 * Yours lists them; opening one edits it in place, and only what changed is
 * sent. An agent calls only the tools it names, and only those that are on for
 * the org, so the choices are the tools that are on; "every tool" is whatever
 * the fleet's MCP server serves when it runs. A budget is required: what it may
 * spend each period, and in one run. Discover is the platform's presets whose
 * tool calls run on the platform; adding one opens a new agent written from it.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Bot } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch, Textarea } from '@hanzo/ui'
import { ChipSelect } from '@hanzo/ui/product'
import { useEffect, useMemo, useState } from 'react'

import { agents, ALL, create, draft, EMPTY, fromPreset, one, PERIODS, presets, remove, update, type Agent, type Draft, type Period, type Preset } from '../api/agents.ts'
import { label as named, models, type Model } from '../api/models.ts'
import { tools, type Tool } from '../api/tools.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Add, Choice, Confirm, Field, Grid, Line, Mark, matches, mono, Sheet, Soft, Tile, Visitor, type Pane } from './ui.tsx'

/** The model a new agent runs on when none is chosen: the deployment's own default. */
const DEFAULT = 'default'

const money = (m: number): string => `$${(m / 1_000_000).toFixed(m % 10_000 ? 4 : 2).replace(/\.?0+$/, '')}`

export function Agents({ view, q, adding, onAdding, onView }: Pane) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const mine = useRead(signed ? () => agents(t) : null, [] as Agent[], [t, signed])
  const offered = useRead(view === 'discover' ? () => presets(t) : null, [] as Preset[], [t, view])
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
        {offered.error && !offered.value.length ? (
          <Soft>{offered.error.message}</Soft>
        ) : offered.loading && !offered.value.length ? (
          <Soft>Reading the presets…</Soft>
        ) : !shown.length ? (
          <Soft>{offered.value.length ? 'No preset matches.' : 'The platform offers no presets.'}</Soft>
        ) : (
          <>
            <SizableText size="$1" color="$soft">
              Presets from the platform. Adding one opens a new agent written from it, to change before it is saved.
            </SizableText>
            <Grid label="Presets">
              {shown.map((p) => (
                <Tile
                  key={p.id}
                  title={p.title || p.id}
                  detail={p.prompt}
                  meta={`Preset ${p.id}`}
                  mark={<Mark name={p.title || p.id} icon={<Bot size={15} />} />}
                  action={signed ? <Add name={p.title || p.id} added={names.has(p.id)} onPress={() => setStart(fromPreset(p))} /> : undefined}
                />
              ))}
            </Grid>
          </>
        )}
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
        <Soft>{mine.error.message}</Soft>
      ) : mine.loading && !mine.value.length ? (
        <Soft>Reading your agents…</Soft>
      ) : !mine.value.length ? (
        <Soft action={<Button size="sm" variant="outline" onPress={() => onAdding(true)}>New agent</Button>}>
          No agents yet. Give one a model, instructions and the tools it may call.
        </Soft>
      ) : !shown.length ? (
        <Soft>No agent matches.</Soft>
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
  const full = useRead(agent ? () => one(t, agent.id || agent.name) : null, null as Agent | null, [t, agent?.id])
  const catalog = useRead(() => models(t), [] as Model[], [t])
  const on = useRead(() => tools(t, { activated: true }), [] as Tool[], [t])
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
  const items = useMemo(() => {
    const list = [{ id: DEFAULT, label: 'Default', hint: 'the deployment’s' }, ...catalog.value.map((m) => ({ id: m.id, label: m.label }))]
    if (d.model && !list.some((m) => m.id === d.model)) list.splice(1, 0, { id: d.model, label: named(d.model) })
    return agent ? list.filter((m) => m.id !== DEFAULT) : list
  }, [catalog.value, d.model, agent])
  const chosen = items.find((m) => m.id === (d.model || DEFAULT)) ?? null

  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const was = full.value
      const saved = agent && was ? await update(t, was, d) : await create(t, d)
      onSaved(saved)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const pick = (name: string, yes: boolean) => set({ tools: yes ? [...d.tools, name] : d.tools.filter((n) => n !== name) })

  return (
    <Sheet title={agent ? agent.name : 'New agent'} open onOpenChange={(o) => !o && onClose()} width={680}>
      {agent && full.error && !full.value ? (
        <Soft>{full.error.message}</Soft>
      ) : !ready ? (
        <Soft>Reading the agent…</Soft>
      ) : (
        <>
          <Field label="Name" hint={agent ? 'An agent keeps its name.' : 'Letters, digits, . _ or -. Other agents call it as agent_<name>.'}>
            <Input value={d.name} onChangeText={(v: string) => set({ name: v })} placeholder="helper" aria-label="Name" disabled={Boolean(agent)} autoCapitalize="none" />
          </Field>
          <Field label="Description" hint="The line another agent reads to decide whether to call this one.">
            <Input value={d.description} onChangeText={(v: string) => set({ description: v })} placeholder="Answers questions about our codebase" aria-label="Description" />
          </Field>
          <Field label="Model">
            <XStack>
              <ChipSelect
                name="Model"
                label={chosen?.label ?? 'Default'}
                chosen={chosen}
                items={items}
                onChange={(m) => set({ model: m.id === DEFAULT ? '' : m.id })}
                placeholder="Search models…"
                placement="bottom-start"
                loading={catalog.loading}
                error={catalog.error?.message ?? null}
              />
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
                    <Soft>Reading the tools that are on…</Soft>
                  ) : on.error && !on.value.length ? (
                    <Soft>{on.error.message}</Soft>
                  ) : !shownTools.length ? (
                    <Soft>{choices.length ? 'No tool matches.' : 'No tool is on for your organization. Switch skills and connectors on first.'}</Soft>
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
