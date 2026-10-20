/**
 * What a message carries beside its words, assembled once for Chat and Dev:
 * the conversation's gear (gear.ts) drawn as the `+` menu's shelves and the
 * chips after `+`, and `text` — the words the gear adds to every message, read
 * again whenever the gear changes.
 *
 *   skills    each picked skill's SKILL.md (the org's own, or the brand's
 *             catalogue document): the platform's completion takes no skills
 *             field, so the text rides the message
 *   memory    what Hanzo remembers about the person (GET /v1/ai/memory/list):
 *             the platform injects none itself
 *   mode      Plan: lay the plan out and wait; Auto says nothing; Manual
 *             asks the person before each plugin runs for a message (`Allow`)
 *
 * A shelf is offered only where its service answers; a surface adds its own
 * (Chat its agents, Dev its devices) beside these.
 */
import { SizableText, XStack } from '@hanzo/gui'
import { BookOpen, ListChecks, Palette, ScrollText } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@hanzo/ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { call, query, unwrap, type Target } from './api/call.ts'
import { active, authored, document, nameOf as skillOf } from './api/skills.ts'
import { brand, brands } from './api/studio.ts'
import { useRead } from './data.ts'
import { said as designSaid } from './design.ts'
import { useGear, type GearState, type Mode } from './gear.ts'
import type { Composer, Prep, Turn } from './plugin.ts'
import { active as lighted, prep, shelf as pluginShelf, usePlugins } from './plugins/index.ts'
import type { Shelf } from './plus.tsx'
import type { Chip, PromptOptions } from './prompt.tsx'

/** The most of each skill a message carries. */
const SKILL_MAX = 16_000

/** The memories every message carries at most, newest first. */
const RECALL = 20

/** What the surface lends the plugins: its draft, its files, its way about. */
export type Lent = Omit<Composer, 'target' | 'show'>

export interface Carry {
  gear: GearState
  skills: Shelf
  /** The design systems (Studio brands): attach one, or make one by chat. */
  design: Shelf
  /** The plugins that run for this person (`@` lists the same). */
  plugins: Shelf
  /** A dialog a plugin opened, for the surface to draw; null when none is. */
  dialog: ReactNode
  /** Whether a plugin that prepares a message is on. */
  preparing: boolean
  /** What the plugins that are on add to the message about to go. */
  prep: (turn: Omit<Turn, 'design'>, signal: AbortSignal) => Promise<Prep>
  /** The chips after `+`: the skills on, Research, and Plan. */
  on: Chip[]
  /** The mode pill: this surface's modes, the conversation's choice among them. */
  mode: NonNullable<PromptOptions['mode']>
  /** Whether `what` may run: in Manual the person is asked (once, always in this conversation, or not); else yes. */
  allow: (what: Asked) => Promise<boolean>
  /** The words the gear adds to every message, '' when none. */
  text: string
}

/** What Hanzo remembers about the person, newest first, as lines. */
async function remembered(t: Target): Promise<string[]> {
  const rows = unwrap(await call<unknown>(t, 'GET', `/v1/ai/memory/list${query({ limit: RECALL })}`))
  return (Array.isArray(rows) ? rows : [])
    .map((r) => (r && typeof r === 'object' ? String((r as { content?: unknown }).content ?? '') : ''))
    .filter(Boolean)
}

/** The words `skills`, `memory` and `mode` add to a message. */
async function said(t: Target, skills: readonly string[], memory: boolean, mode: string, design: string): Promise<string> {
  const parts: string[] = []
  if (design) {
    const b = await brand(t, design).catch(() => null)
    if (b?.name) parts.push(designSaid(b))
  }
  if (skills.length) {
    const own = await authored(t).catch(() => [])
    for (const n of skills) {
      const body = own.find((s) => s.name === n)?.content || (await document(t, n).catch(() => ''))
      if (body) parts.push(`Use the skill "${n}" where it applies:\n\n${body.slice(0, SKILL_MAX)}`)
    }
  }
  if (memory) {
    const lines = await remembered(t).catch(() => [])
    if (lines.length) parts.push(`What you remember about the person:\n${lines.map((l) => `- ${l}`).join('\n')}`)
  }
  if (mode === 'plan') parts.push('Plan mode: lay out the plan — the steps, what each changes and why — and stop. Change nothing and produce no final work until the person says go.')
  return parts.join('\n\n')
}

/** What the person answers a plugin about to run in Manual. */
type Leave = 'once' | 'always' | 'deny'

/** What Manual asks about: a plugin, or a Dev run. `id` is what "always" remembers. */
export interface Asked {
  id: string
  name: string
  note: string
}

/** Manual's pause: what is about to run, what it does, and the three answers. Closing it is a no. */
function Allow({ what, onAnswer }: { what: Asked; onAnswer: (v: Leave) => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onAnswer('deny')}>
      <DialogContent maxW={440} width="100%" data-slot="allow">
        <DialogTitle>{`Allow ${what.name}?`}</DialogTitle>
        <DialogDescription>{what.note ? `${what.note}. Manual asks before each one runs.` : 'Manual asks before each one runs.'}</DialogDescription>
        <XStack justify="flex-end" gap="$2" pt="$3" flexWrap="wrap">
          <Button size="sm" variant="ghost" onPress={() => onAnswer('deny')}>
            Deny
          </Button>
          <Button size="sm" variant="outline" onPress={() => onAnswer('always')}>
            <SizableText fontSize={14}>Always in this chat</SizableText>
          </Button>
          <Button size="sm" onPress={() => onAnswer('once')}>
            Allow once
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The conversation `key` names (`''` for one not begun), for target `t`.
 * `customize(tab)` opens Dev's Customize on that tab; `modes` are the ones this
 * surface offers (a choice it does not offer reads as Auto).
 */
export function useCarry(t: Target, key: string, customize: (tab: 'skills') => void, lent: Lent, modes: readonly Mode[]): Carry {
  const gear = useGear(t, key)
  const [dialog, show] = useState<ReactNode>(null)
  // The composer a plugin acts on, read when it acts: the draft moves under it.
  const lentNow = useRef(lent)
  lentNow.current = lent
  const composer = useMemo<Composer>(
    () => ({
      target: t,
      get draft() {
        return lentNow.current.draft
      },
      setDraft: (x) => lentNow.current.setDraft(x),
      attach: (f) => lentNow.current.attach(f),
      go: (h) => lentNow.current.go(h),
      show,
    }),
    [t],
  )
  const found = usePlugins(t)
  const signed = Boolean(t.token())
  const list = useRead(signed ? () => active(t) : null, [], [t, signed])
  const names = useMemo(() => list.value.map((s) => skillOf(s.name)).filter(Boolean), [list.value])
  const { skills, research, memory, design } = gear.gear
  const mode: Mode = modes.includes(gear.gear.mode) ? gear.gear.mode : 'auto'

  const shelf: Shelf = {
    rows: names.map((n) => ({ id: n, label: n, icon: <ScrollText size={16} />, on: skills.includes(n) })),
    pick: (id) => gear.toggle('skills', id),
    loading: list.loading,
    error: list.error ? 'The skills could not be read.' : null,
    search: names.length > 8 ? 'Search skills' : undefined,
    empty: 'No skills are on for this organization',
    manage: { label: 'Manage skills', onPress: () => customize('skills') },
    browse: { label: 'Browse skills', onPress: () => customize('skills') },
  }

  const plugins = pluginShelf(found, gear, composer)

  // The design systems: Studio's brands, the one store for them.
  const kits = useRead(signed ? () => brands(t) : null, [], [t, signed, design])
  const named = kits.value.find((b) => b.id === design)
  const designs: Shelf = {
    rows: kits.value.map((b) => {
      const c = (b.tokens.color ?? {}) as Record<string, { $value?: unknown }>
      return { id: b.id, label: b.name, note: [c.primary?.$value, c.accent?.$value].filter(Boolean).join(' '), icon: <Palette size={16} />, on: b.id === design }
    }),
    pick: (id) => gear.set({ design: design === id ? '' : id }),
    loading: kits.loading,
    error: kits.error ? 'The design systems could not be read.' : null,
    empty: 'No design systems yet',
    create: {
      label: 'Create design system',
      onPress: () => {
        if (!gear.gear.plugins.includes('design')) gear.toggle('plugins', 'design')
        lentNow.current.setDraft('Make me a design system for ')
      },
    },
  }
  const lit = lighted(found.plugins, gear.gear)

  const on: Chip[] = [
    ...skills.map((n) => ({ id: `skill:${n}`, label: n, icon: <ScrollText size={14} />, onRemove: () => gear.toggle('skills', n) })),
    ...(research ? [{ id: 'research', label: 'Research', icon: <BookOpen size={14} />, onRemove: () => gear.set({ research: false }) }] : []),
    ...(mode === 'plan' ? [{ id: 'plan', label: 'Plan', icon: <ListChecks size={14} />, onRemove: () => gear.set({ mode: 'auto' }) }] : []),
    ...(design ? [{ id: 'design', label: named?.name ?? 'Design system', icon: <Palette size={14} />, onRemove: () => gear.set({ design: '' }) }] : []),
    ...lit
      .filter((p) => p.id !== 'research')
      .map((p) => ({ id: `plugin:${p.id}`, label: p.name, icon: p.icon, onRemove: () => gear.toggle('plugins', p.id) })),
  ]

  const signedIn = Boolean(t.token())
  const [text, setText] = useState('')
  const asked = skills.join('\n')
  useEffect(() => {
    if (!signedIn) return setText(mode === 'plan' ? 'Plan mode: lay out the plan and stop until the person says go.' : '')
    let live = true
    void said(t, skills, memory, mode, design).then((x) => live && setText(x))
    return () => {
      live = false
    }
    // `skills` is read through `asked`, its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, signedIn, asked, memory, mode, design])

  // Manual: what is about to run is asked of the person, unless allowed for the rest of the conversation.
  const kept = useRef<string[]>([])
  kept.current = gear.gear.allowed
  const allow = async (what: Asked): Promise<boolean> => {
    if (mode !== 'manual' || kept.current.includes(what.id)) return true
    const v = await new Promise<Leave>((done) =>
      show(
        <Allow
          what={what}
          onAnswer={(x) => {
            show(null)
            done(x)
          }}
        />,
      ),
    )
    if (v === 'always') {
      kept.current = [...kept.current, what.id]
      gear.set({ allowed: kept.current })
    }
    return v !== 'deny'
  }

  return {
    gear,
    mode: { value: mode, set: (m) => gear.set({ mode: m }), items: modes },
    allow,
    skills: shelf,
    plugins,
    dialog,
    on,
    text,
    preparing: lit.length > 0,
    design: designs,
    // A design system a plugin made is attached at once, and the maker turns off: it made one.
    prep: async (turn, signal) => {
      // One plugin at a time, so each pause is its own question.
      const denied: string[] = []
      for (const x of lit) if (!signal.aborted && !(await allow({ id: x.id, name: x.name, note: x.note }))) denied.push(x.id)
      const p = await prep(found.plugins, gear.gear, { ...turn, design }, composer, signal, denied)
      if (p.design) gear.set({ design: p.design, plugins: gear.gear.plugins.filter((x) => x !== 'design') })
      return p
    },
  }
}
