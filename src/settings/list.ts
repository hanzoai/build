/**
 * The sections of Settings, in the order the page lists them, by name and part
 * alone: what a sidebar lists without loading the sections themselves
 * (sections.tsx pairs each with its body).
 */
import type { Section } from '../route.ts'

export type Group = 'Settings' | 'Code' | 'Organization'
export const GROUPS: readonly Group[] = ['Settings', 'Code', 'Organization']

export const LIST: readonly { id: Section; label: string; group: Group }[] = [
  { id: 'general', label: 'General', group: 'Settings' },
  { id: 'account', label: 'Account', group: 'Settings' },
  { id: 'privacy', label: 'Privacy', group: 'Settings' },
  { id: 'billing', label: 'Billing', group: 'Settings' },
  { id: 'usage', label: 'Usage', group: 'Settings' },
  { id: 'capabilities', label: 'Capabilities', group: 'Settings' },
  { id: 'memory', label: 'Memory', group: 'Settings' },
  { id: 'code', label: 'Code', group: 'Code' },
  { id: 'environments', label: 'Environments', group: 'Code' },
  { id: 'machines', label: 'Machines', group: 'Code' },
  { id: 'keys', label: 'API keys', group: 'Code' },
  { id: 'members', label: 'Members', group: 'Organization' },
  { id: 'integrations', label: 'Integrations', group: 'Organization' },
  { id: 'notifications', label: 'Notifications', group: 'Organization' },
]

/** A part's label as a list draws it: none for the first part, or where the part's first row already says it (Code). */
export const heading = (g: Group): string => (g === 'Settings' || LIST.find((e) => e.group === g)?.label === g ? '' : g)
