/**
 * The sections of Settings, in the order the page lists them. A section is one
 * file under settings/ and one entry here; the route grammar names every
 * section there can be (route.ts SECTIONS), and this lists the ones built.
 */
import type { ReactNode } from 'react'

import type { Section } from '../route.ts'
import { Account } from './account.tsx'

export type Group = 'Settings' | 'Code' | 'Organization'
export const GROUPS: readonly Group[] = ['Settings', 'Code', 'Organization']

export interface Entry {
  id: Section
  label: string
  group: Group
  body: () => ReactNode
}

export const ENTRIES: Entry[] = [{ id: 'account', label: 'Account', group: 'Settings', body: () => <Account /> }]
