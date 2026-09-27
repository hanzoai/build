/**
 * The sections of Settings, in the order the page lists them. A section is one
 * file under settings/ and one entry here; the route grammar names every
 * section there can be (route.ts SECTIONS), and this lists the ones built.
 */
import type { ReactNode } from 'react'

import type { Section } from '../route.ts'
import { Account } from './account.tsx'
import { Billing } from './billing.tsx'
import { Capabilities } from './capabilities.tsx'
import { Code } from './code.tsx'
import { Environments } from './environments.tsx'
import { General } from './general.tsx'
import { Integrations } from './integrations.tsx'
import { Keys } from './keys.tsx'
import { Machines } from './machines.tsx'
import { Members } from './members.tsx'
import { Memory } from './memory.tsx'
import { Notifications } from './notifications.tsx'
import { Privacy } from './privacy.tsx'
import { Usage } from './usage.tsx'

export type Group = 'Settings' | 'Code' | 'Organization'
export const GROUPS: readonly Group[] = ['Settings', 'Code', 'Organization']

export interface Entry {
  id: Section
  label: string
  group: Group
  body: () => ReactNode
}

export const ENTRIES: Entry[] = [
  { id: 'general', label: 'General', group: 'Settings', body: () => <General /> },
  { id: 'account', label: 'Account', group: 'Settings', body: () => <Account /> },
  { id: 'privacy', label: 'Privacy', group: 'Settings', body: () => <Privacy /> },
  { id: 'billing', label: 'Billing', group: 'Settings', body: () => <Billing /> },
  { id: 'usage', label: 'Usage', group: 'Settings', body: () => <Usage /> },
  { id: 'capabilities', label: 'Capabilities', group: 'Settings', body: () => <Capabilities /> },
  { id: 'memory', label: 'Memory', group: 'Settings', body: () => <Memory /> },
  { id: 'code', label: 'Code', group: 'Code', body: () => <Code /> },
  { id: 'environments', label: 'Environments', group: 'Code', body: () => <Environments /> },
  { id: 'machines', label: 'Machines', group: 'Code', body: () => <Machines /> },
  { id: 'keys', label: 'API keys', group: 'Code', body: () => <Keys /> },
  { id: 'members', label: 'Members', group: 'Organization', body: () => <Members /> },
  { id: 'integrations', label: 'Integrations', group: 'Organization', body: () => <Integrations /> },
  { id: 'notifications', label: 'Notifications', group: 'Organization', body: () => <Notifications /> },
]
