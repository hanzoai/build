/**
 * What a message carries beside its words, assembled once for Chat and Dev:
 * the conversation's gear (gear.ts) drawn as the `+` menu's shelves and the
 * chips after `+`, and `brief` — the words the gear adds to the message, read
 * just before it goes.
 *
 *   skills    each picked skill's SKILL.md (the org's own, or the brand's
 *             catalogue document): the platform's completion takes no skills
 *             field, so the text rides the message
 *   memory    what Hanzo remembers about the person that bears on the ask
 *             (GET /v1/ai/memory/recall): the platform injects none itself
 *   mode      Plan: lay the plan out and wait; Auto says nothing
 *
 * A shelf is offered only where its service answers; a surface adds its own
 * (Chat its agents, Dev its devices) beside these.
 */
import { BookOpen, ListChecks, ScrollText } from '@hanzogui/lucide-icons-2'
import { useCallback, useMemo } from 'react'

import { call, query, unwrap, type Target } from './api/call.ts'
import { active, authored, document, nameOf as skillOf } from './api/skills.ts'
import { useRead } from './data.ts'
import { useGear, type GearState } from './gear.ts'
import type { Shelf } from './plus.tsx'
import type { Chip } from './prompt.tsx'

/** The most of each skill a message carries. */
const SKILL_MAX = 16_000

/** The memories one message carries at most. */
const RECALL = 8

export interface Carry {
  gear: GearState
  skills: Shelf
  /** The chips after `+`: the skills on, Research, and Plan. */
  on: Chip[]
  /** The words the gear adds to a message about `text`, '' when none. */
  brief: (text: string) => Promise<string>
}

/** `<owner>/<name>` memories that bear on `q`, as lines. */
async function recall(t: Target, q: string): Promise<string[]> {
  const rows = unwrap(await call<unknown>(t, 'GET', `/v1/ai/memory/recall${query({ q: q.slice(0, 500), limit: RECALL })}`))
  return (Array.isArray(rows) ? rows : [])
    .map((r) => (r && typeof r === 'object' ? String((r as { content?: unknown }).content ?? '') : ''))
    .filter(Boolean)
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

  const brief = useCallback(
    async (text: string): Promise<string> => {
      const parts: string[] = []
      if (skills.length) {
        const own = await authored(t).catch(() => [])
        for (const n of skills) {
          const body = own.find((s) => s.name === n)?.content || (await document(t, n).catch(() => ''))
          if (body) parts.push(`Use the skill "${n}" where it applies:\n\n${body.slice(0, SKILL_MAX)}`)
        }
      }
      if (memory && text.trim()) {
        const lines = await recall(t, text).catch(() => [])
        if (lines.length) parts.push(`What you remember about the person, where it bears on this:\n${lines.map((l) => `- ${l}`).join('\n')}`)
      }
      if (mode === 'plan') parts.push('Plan mode: lay out the plan — the steps, what each changes and why — and stop. Change nothing and produce no final work until the person says go.')
      return parts.join('\n\n')
    },
    [t, skills, memory, mode],
  )

  return { gear, skills: shelf, on, brief }
}
