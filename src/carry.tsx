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
 *   mode      Plan: lay the plan out and wait; Auto says nothing
 *
 * A shelf is offered only where its service answers; a surface adds its own
 * (Chat its agents, Dev its devices) beside these.
 */
import { BookOpen, ListChecks, ScrollText } from '@hanzogui/lucide-icons-2'
import { useEffect, useMemo, useState } from 'react'

import { call, query, unwrap, type Target } from './api/call.ts'
import { active, authored, document, nameOf as skillOf } from './api/skills.ts'
import { useRead } from './data.ts'
import { useGear, type GearState } from './gear.ts'
import type { Shelf } from './plus.tsx'
import type { Chip } from './prompt.tsx'

/** The most of each skill a message carries. */
const SKILL_MAX = 16_000

/** The memories every message carries at most, newest first. */
const RECALL = 20

export interface Carry {
  gear: GearState
  skills: Shelf
  /** The chips after `+`: the skills on, Research, and Plan. */
  on: Chip[]
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
async function said(t: Target, skills: readonly string[], memory: boolean, mode: string): Promise<string> {
  const parts: string[] = []
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

/**
 * The conversation `key` names (`''` for one not begun), for target `t`.
 * `customize(tab)` opens Dev's Customize on that tab.
 */
export function useCarry(t: Target, key: string, customize: (tab: 'skills') => void): Carry {
  const gear = useGear(t, key)
  const signed = Boolean(t.token())
  const list = useRead(signed ? () => active(t) : null, [], [t, signed])
  const names = useMemo(() => list.value.map((s) => skillOf(s.name)).filter(Boolean), [list.value])
  const { skills, research, memory, mode } = gear.gear

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

  const on: Chip[] = [
    ...skills.map((n) => ({ id: `skill:${n}`, label: n, icon: <ScrollText size={14} />, onRemove: () => gear.toggle('skills', n) })),
    ...(research ? [{ id: 'research', label: 'Research', icon: <BookOpen size={14} />, onRemove: () => gear.set({ research: false }) }] : []),
    ...(mode === 'plan' ? [{ id: 'plan', label: 'Plan', icon: <ListChecks size={14} />, onRemove: () => gear.set({ mode: 'auto' }) }] : []),
  ]

  const signedIn = Boolean(t.token())
  const [text, setText] = useState('')
  const asked = skills.join('\n')
  useEffect(() => {
    if (!signedIn) return setText(mode === 'plan' ? 'Plan mode: lay out the plan and stop until the person says go.' : '')
    let live = true
    void said(t, skills, memory, mode).then((x) => live && setText(x))
    return () => {
      live = false
    }
    // `skills` is read through `asked`, its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, signedIn, asked, memory, mode])

  return { gear, skills: shelf, on, text }
}
