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
import { AudioLines, Bell, BookOpen, Bot, Box, Brain, CircleDot, Clock, Code, Container, Cpu, CreditCard, File, FileText, FolderGit2, Gauge, Image, Key, LayoutTemplate, Library, Plug, Plus, Presentation, Puzzle, Settings, Shield, SlidersHorizontal, Sparkles, SquarePen, Upload, User, Users, Video } from '@hanzogui/lucide-icons-2'
import type { RailLink } from '@hanzo/ui/chat'
import { useMemo, type ReactNode } from 'react'

import { automations } from './api/auto.ts'
import { KINDS, upload } from './api/library.ts'
import { pinBoard } from './choice.ts'
import { useRead } from './data.ts'
import { DOCS } from './foot.tsx'
import type { Host } from './host.tsx'
import { path, route, TABS, type Section, type Tab } from './route.ts'
import { GROUPS, heading, LIST } from './settings/list.ts'

/** A run of places under one quiet label; '' draws none. */
export interface Group {
  id: string
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
        { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={16} />, onPress: to(path({ kind: 'screen', screen: 'templates' })), active: screen === 'templates' },
      ],
    },
    {
      id: 'make',
      label: 'Make',
      links: [
        { id: 'artifacts', label: 'Library', icon: <Library size={16} />, onPress: to(path({ kind: 'screen', screen: 'artifacts' })), active: screen === 'artifacts' },
        { id: 'automations', label: 'Scheduled tasks', icon: <Clock size={16} />, onPress: to(path({ kind: 'screen', screen: 'automations' })), active: screen === 'automations' || r.kind === 'automation' },
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
        { id: 'customize', label: 'Customize', icon: <SlidersHorizontal size={16} />, onPress: to(path({ kind: 'customize', tab: 'agents' })), active: r.kind === 'customize' || r.kind === 'agent' || screen === 'mcp' },
        { id: 'docs', label: 'Docs', icon: <BookOpen size={16} />, onPress: () => window.open(DOCS, '_blank', 'noopener,noreferrer') },
      ],
    },
  ]
}

/** Dev's own places: what a host whose rail holds the rest (Library, Scheduled tasks, Customize) lists in Dev's sidebar. */
export const own = (host: Host, go: (path: string) => void): Group[] => nav(host, go).filter((g) => g.id === 'work')

/**
 * Settings' sections as a host's sidebar lists them: one group per part, a
 * part's label drawn only where it is not its first row's name (Code leads
 * Code's part, so the part is not labelled twice).
 */
export function sections(host: Host, go: (path: string) => void): Group[] {
  const r = route(host.path)
  const at = r.kind === 'settings' ? r.section : ''
  return GROUPS.map((g) => {
    const rows = LIST.filter((e) => e.group === g)
    return {
      id: g,
      label: heading(g),
      links: rows.map((e) => ({ id: e.id, label: e.label, icon: SECTION_ICON[e.id], onPress: () => go(path({ kind: 'settings', section: e.id })), active: e.id === at })),
    }
  })
}

/** Customize's tabs as a host's sidebar lists them, Agents first; an agent's profile lights Agents. */
export function tabs(host: Host, go: (path: string) => void): Group[] {
  const r = route(host.path)
  const at = r.kind === 'customize' ? r.tab : r.kind === 'agent' ? 'agents' : ''
  return [{ id: 'customize', label: '', links: TABS.map((t) => ({ id: t, label: TAB_LABEL[t], icon: TAB_ICON[t], onPress: () => go(path({ kind: 'customize', tab: t })), active: t === at })) }]
}

const TAB_LABEL: Record<Tab, string> = { agents: 'Agents', skills: 'Skills', connectors: 'Connectors', plugins: 'Plugins' }
const TAB_ICON: Record<Tab, ReactNode> = { agents: <Bot size={16} />, skills: <BookOpen size={16} />, connectors: <Plug size={16} />, plugins: <Puzzle size={16} /> }
const SECTION_ICON: Record<Section, ReactNode> = {
  general: <Settings size={16} />,
  account: <User size={16} />,
  privacy: <Shield size={16} />,
  billing: <CreditCard size={16} />,
  usage: <Gauge size={16} />,
  capabilities: <Sparkles size={16} />,
  memory: <Brain size={16} />,
  code: <Code size={16} />,
  environments: <Container size={16} />,
  machines: <Cpu size={16} />,
  keys: <Key size={16} />,
  members: <Users size={16} />,
  integrations: <Plug size={16} />,
  notifications: <Bell size={16} />,
}

const KIND_ICON: Record<string, ReactNode> = {
  '': <Library size={16} />,
  image: <Image size={16} />,
  video: <Video size={16} />,
  audio: <AudioLines size={16} />,
  document: <FileText size={16} />,
  slides: <Presentation size={16} />,
  model: <Box size={16} />,
  code: <Code size={16} />,
  file: <File size={16} />,
}

/** Fired on `window` once the sidebar's Upload has kept its files, for the Library to read again. */
export const KEPT = 'hanzo:library:kept'

/** Asks for files and keeps each in the Library; a refusal is said in the page's own words. */
function keep(host: Host): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.onchange = async () => {
    const t = { api: host.api, token: host.token, org: host.org }
    for (const f of Array.from(input.files ?? [])) {
      try {
        await upload(t, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }, { source: 'chat' })
      } catch (e) {
        window.alert(e instanceof Error ? e.message : `${f.name} was not kept`)
      }
    }
    window.dispatchEvent(new Event(KEPT))
  }
  input.click()
}

/** The Library's sidebar: Upload, then every kind it narrows to, the one in the address lit. */
export function library(host: Host, go: (path: string) => void): Group[] {
  const r = route(host.path)
  const at = r.kind === 'screen' && r.screen === 'artifacts' ? (r.of ?? '') : null
  return [
    { id: 'library-do', label: '', links: [{ id: 'upload', label: 'Upload', icon: <Upload size={16} />, onPress: () => keep(host) }] },
    {
      id: 'library-kinds',
      label: '',
      links: KINDS.map((k) => ({
        id: `kind-${k.id || 'all'}`,
        label: k.label,
        icon: KIND_ICON[k.id],
        onPress: () => go(path({ kind: 'screen', screen: 'artifacts', ...(k.id ? { of: k.id } : {}) })),
        active: at === k.id,
      })),
    },
  ]
}

/** Scheduled tasks' sidebar: New task, then each of the person's tasks, the one open lit. Read only while `on`. */
export function useScheduled(host: Host, go: (path: string) => void, on: boolean): Group[] {
  const t = useMemo(() => ({ api: host.api, token: host.token, org: host.org }), [host.api, host.token, host.org])
  const list = useRead(on && host.person ? () => automations(t) : null, [], [t, on, host.path])
  const r = route(host.path)
  const at = r.kind === 'automation' ? r.id : ''
  return [
    {
      id: 'scheduled-do',
      label: '',
      links: [{ id: 'new-task', label: 'New task', icon: <Plus size={16} />, onPress: () => go(path({ kind: 'automation', id: 'new' })), active: at === 'new' }],
    },
    {
      id: 'scheduled-tasks',
      label: list.value.length ? 'Tasks' : '',
      links: list.value.map((a) => ({ id: a.id, label: a.name || 'Untitled task', icon: <Clock size={16} />, onPress: () => go(path({ kind: 'automation', id: a.id })), active: at === a.id })),
    },
  ]
}
