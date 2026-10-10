/**
 * The builder's places, once, for every rail that lists them: the builder's own
 * rail (builder.tsx), `DevSection` (section.tsx) and a host's column (the Hanzo
 * app's, @hanzo/rooms Column). Each place is a first-class row — nothing hides
 * behind a disclosure — grouped in the order a first-time customer asks:
 * what do I do, what did it make, where does it run, how do I set it up.
 *
 * Every row moves the builder through `go` with the address `path` writes, so
 * where a place lives is said here and in route.ts and nowhere else.
 */
import { Blocks, BookOpen, CircleDot, Container, Cpu, FolderGit2, LayoutTemplate, SlidersHorizontal, SquarePen, Workflow } from '@hanzogui/lucide-icons-2'
import type { RailLink } from '@hanzo/ui/chat'

import { pinBoard } from './choice.ts'
import { DOCS } from './foot.tsx'
import type { Host } from './host.tsx'
import { path, route } from './route.ts'

/** A run of places under one quiet label. */
export interface Group {
  id: 'work' | 'make' | 'run' | 'setup'
  label: string
  links: RailLink[]
}

/** The id of the row that starts a new run: a rail with a New control of its own draws that instead. */
export const NEW = 'new'

export function nav(host: Host, go: (path: string) => void): Group[] {
  const r = route(host.path)
  const screen = r.kind === 'screen' ? r.screen : ''
  const section = r.kind === 'settings' ? r.section : ''
  const to = (p: string) => () => go(p)
  return [
    {
      id: 'work',
      label: 'Work',
      links: [
        { id: NEW, label: 'New run', icon: <SquarePen size={16} />, onPress: to(''), active: r.kind === 'new' },
        // A project is a repository: its list, linking one from GitHub, and one's workspace.
        {
          id: 'projects',
          label: 'Projects',
          icon: <FolderGit2 size={16} />,
          onPress: to(path({ kind: 'screen', screen: 'projects' })),
          active: screen === 'projects' || screen === 'sync' || r.kind === 'repo',
        },
        {
          id: 'issues',
          label: 'Issues',
          icon: <CircleDot size={16} />,
          onPress: () => {
            pinBoard(host.org, '')
            go(path({ kind: 'screen', screen: 'issues' }))
          },
          active: screen === 'issues',
        },
      ],
    },
    {
      id: 'make',
      label: 'Make',
      links: [
        { id: 'artifacts', label: 'Artifacts', icon: <Blocks size={16} />, onPress: to(path({ kind: 'screen', screen: 'artifacts' })), active: screen === 'artifacts' },
        { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={16} />, onPress: to(path({ kind: 'screen', screen: 'templates' })), active: screen === 'templates' },
        { id: 'automations', label: 'Automations', icon: <Workflow size={16} />, onPress: to(path({ kind: 'screen', screen: 'automations' })), active: screen === 'automations' || r.kind === 'automation' },
      ],
    },
    {
      id: 'run',
      label: 'Run',
      links: [
        { id: 'machines', label: 'Machines', icon: <Cpu size={16} />, onPress: to(path({ kind: 'settings', section: 'machines' })), active: section === 'machines' },
        { id: 'environments', label: 'Environments', icon: <Container size={16} />, onPress: to(path({ kind: 'settings', section: 'environments' })), active: section === 'environments' },
      ],
    },
    {
      id: 'setup',
      label: 'Setup',
      links: [
        { id: 'customize', label: 'Customize', icon: <SlidersHorizontal size={16} />, onPress: to(path({ kind: 'customize', tab: 'skills' })), active: r.kind === 'customize' || screen === 'mcp' },
        { id: 'docs', label: 'Docs', icon: <BookOpen size={16} />, onPress: () => window.open(DOCS, '_blank', 'noopener,noreferrer') },
      ],
    },
  ]
}
