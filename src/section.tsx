/**
 * The builder's places and runs, for a host that draws its own rail.
 *
 * A host that mounts `<Builder rail={false}>` keeps ONE left column — its own —
 * and lists the builder in it with these. `useSessions` is the same read and
 * the same org-wide feed the built-in rail uses, so a run started in the pane
 * appears here with its live status. `DevSection` draws the builder's places
 * and runs as rows of the host's sidebar (the `@hanzo/ui/chat` Sidebar the
 * built-in rail is made of), and every row moves the builder through the
 * host's own `go`.
 */
import { SizableText } from '@hanzo/gui'
import { Blocks, LayoutTemplate, SquarePen } from '@hanzogui/lucide-icons-2'
import { SidebarItem, SidebarSection, StatusDot, type SessionStatus } from '@hanzo/ui/chat'
import { useMemo, type ReactNode } from 'react'

import type { Session } from './api/sessions.ts'
import { useRecents, type Read } from './data.ts'
import type { Host } from './host.tsx'
import { path, route } from './route.ts'

/** A run's status, as the rail's dot draws it. Anything else is idle. */
export const DOTS: Record<string, SessionStatus> = {
  running: 'running',
  paused: 'paused',
  done: 'done',
  stopped: 'stopped',
  error: 'error',
}

/** The org's coding runs, newest first, kept live by the org's feed. */
export function useSessions(host: Host): Read<Session[]> {
  const t = useMemo(() => ({ api: host.api, token: host.token, org: host.org }), [host.api, host.token, host.org])
  return useRecents(t, Boolean(host.person))
}

const Note = ({ children }: { children: string }) => (
  <SizableText size="$1" color="$soft" px="$2" py="$1">
    {children}
  </SizableText>
)

/**
 * New, Artifacts, Templates, then the runs. `children` sit between the places
 * and the runs — where a host lists its projects. `onPick` fires after a move,
 * so a host that draws its rail as a drawer on a phone can close it.
 */
export function DevSection({
  host,
  onPick,
  label = 'Runs',
  children,
}: {
  host: Host
  onPick?: () => void
  label?: string
  children?: ReactNode
}) {
  const sessions = useSessions(host)
  const r = route(host.path)
  const go = (p: string) => {
    host.go(p)
    onPick?.()
  }
  const screen = r.kind === 'screen' ? r.screen : ''
  return (
    <>
      <SidebarItem icon={<SquarePen size={16} aria-hidden />} active={r.kind === 'new'} onPress={() => go('')}>
        New run
      </SidebarItem>
      <SidebarItem icon={<Blocks size={16} aria-hidden />} active={screen === 'artifacts'} onPress={() => go(path({ kind: 'screen', screen: 'artifacts' }))}>
        Artifacts
      </SidebarItem>
      <SidebarItem icon={<LayoutTemplate size={16} aria-hidden />} active={screen === 'templates'} onPress={() => go(path({ kind: 'screen', screen: 'templates' }))}>
        Templates
      </SidebarItem>
      {children}
      <SidebarSection label={label}>
        {!host.person ? (
          <Note>Sign in to see your runs.</Note>
        ) : sessions.value.length ? (
          sessions.value.map((s) => (
            <SidebarItem
              key={s.id}
              icon={<StatusDot status={DOTS[s.status] ?? 'idle'} />}
              active={r.kind === 'run' && r.id === s.id}
              onPress={() => go(s.id)}
            >
              {s.title || 'Untitled run'}
            </SidebarItem>
          ))
        ) : (
          <Note>{sessions.error ? sessions.error.message : sessions.loading ? 'Reading…' : 'No runs yet. Say what to build and it lands here.'}</Note>
        )}
      </SidebarSection>
    </>
  )
}
