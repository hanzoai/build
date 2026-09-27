/**
 * A run's Files tab. Files is its working tree: live from the sandbox while the
 * run holds one — every edit the agent has made, committed or not — and its
 * branch on the forge otherwise. Artifacts is what the run produced: its pull
 * request, its branch, its environment proposal and the project it built.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ExternalLink, File, Folder, GitBranch, GitPullRequest, Layers, Settings2 } from '@hanzogui/lucide-icons-2'
import { useState, type ReactNode } from 'react'

import { blob, tree } from './api/changes.ts'
import type { Blob, Entry } from './api/git.ts'
import { read as look, type Node } from './api/sandbox.ts'
import { useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { Out } from './out.tsx'

type Pane = 'files' | 'artifacts'
type Source = 'live' | 'branch'

const monoWrap = { whiteSpace: 'pre-wrap' as const, fontFamily: 'var(--f-mono, ui-monospace, monospace)' }

export function Files({
  session,
  repo,
  branch,
  sandbox,
  live,
  mode,
  project,
  pr,
  onEnvironment,
}: {
  session: string
  repo: string
  branch: string
  sandbox: string
  live: boolean
  mode: string
  project: string
  pr: { href: string; label: string }
  onEnvironment: () => void
}) {
  const [pane, setPane] = useState<Pane>('files')
  const reachable = live && Boolean(sandbox)
  const [source, setSource] = useState<Source>(reachable ? 'live' : 'branch')
  const from: Source = reachable ? source : 'branch'

  return (
    <YStack gap="$3">
      <XStack gap="$1" items="center">
        <Pick on={pane === 'files'} onPress={() => setPane('files')}>
          Files
        </Pick>
        <Pick on={pane === 'artifacts'} onPress={() => setPane('artifacts')}>
          Artifacts
        </Pick>
        <XStack flex={1} />
        {pane === 'files' && reachable ? (
          <>
            <Pick on={from === 'live'} onPress={() => setSource('live')}>
              Live
            </Pick>
            <Pick on={from === 'branch'} onPress={() => setSource('branch')}>
              Branch
            </Pick>
          </>
        ) : null}
      </XStack>
      {pane === 'artifacts' ? (
        <Artifacts repo={repo} branch={branch} mode={mode} project={project} pr={pr} onEnvironment={onEnvironment} />
      ) : from === 'live' ? (
        <Live sandbox={sandbox} />
      ) : (
        <Branch session={session} label={`${repo}${branch ? `@${branch}` : ''}`} />
      )}
    </YStack>
  )
}

/** The sandbox's working tree, as it is right now. */
function Live({ sandbox }: { sandbox: string }) {
  const t = useTarget()
  const [dir, setDir] = useState('')
  const [file, setFile] = useState('')
  const list = useRead(() => look(t, sandbox, dir), null as Node | null, [t, sandbox, dir])
  const body = useRead(file ? () => look(t, sandbox, file) : null, null as Node | null, [t, sandbox, file])
  const at = (name: string) => (dir ? `${dir}/${name}` : name)

  // A name is only a name until it is read: the answer says whether it was a directory.
  const open = async (name: string) => {
    const path = at(name)
    try {
      const n = await look(t, sandbox, path)
      if (n.dir) {
        setDir(path)
        setFile('')
      } else {
        setFile(path)
      }
    } catch {
      setFile(path)
    }
  }

  return (
    <Listing
      where={`/work${dir ? `/${dir}` : ''}`}
      up={dir ? () => (setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''), setFile('')) : undefined}
      error={list.error?.message ?? ''}
      loading={list.loading && !list.value}
      rows={(list.value?.names ?? []).map((name) => ({ key: name, name, dir: null, onPress: () => void open(name) }))}
      file={file}
      body={
        body.error
          ? body.error.message
          : body.value
            ? body.value.binary
              ? 'Binary file'
              : body.value.truncated
                ? 'Too large to show'
                : body.value.text || 'Empty file'
            : ''
      }
    />
  )
}

/** The run's branch on the forge; its base until it has pushed. */
function Branch({ session, label }: { session: string; label: string }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [dir, setDir] = useState('')
  const [file, setFile] = useState('')
  const list = useRead(signed ? () => tree(t, session, dir) : null, [] as Entry[], [t, session, dir, signed])
  const body = useRead(file ? () => blob(t, session, file) : null, null as Blob | null, [t, session, file])

  if (!signed) return <Soft>Sign in to read this run’s files.</Soft>
  return (
    <Listing
      where={`${label}${dir ? `/${dir}` : ''}`}
      up={dir ? () => (setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''), setFile('')) : undefined}
      error={list.error?.message ?? ''}
      loading={list.loading && list.value.length === 0}
      rows={list.value.map((e) => ({
        key: e.path,
        name: e.name,
        dir: e.dir,
        onPress: () => (e.dir ? (setDir(e.path), setFile('')) : setFile(e.path)),
      }))}
      file={file}
      body={
        body.error
          ? body.error.message
          : body.value
            ? body.value.binary
              ? 'Binary file'
              : body.value.truncated
                ? 'Too large to show'
                : body.value.text || 'Empty file'
            : ''
      }
    />
  )
}

function Listing({
  where,
  up,
  error,
  loading,
  rows,
  file,
  body,
}: {
  where: string
  up?: () => void
  error: string
  loading: boolean
  rows: { key: string; name: string; dir: boolean | null; onPress: () => void }[]
  file: string
  body: string
}) {
  return (
    <YStack gap="$2">
      <XStack gap="$2" items="center">
        {up ? (
          <XStack render="button" aria-label="Up one directory" onPress={up} px="$1" py="$1">
            <SizableText size="$1" color="$soft">
              Up
            </SizableText>
          </XStack>
        ) : null}
        <SizableText size="$1" color="$soft" numberOfLines={1}>
          {where}
        </SizableText>
      </XStack>
      {error ? (
        <SizableText size="$2" color="$soft">
          {error}
        </SizableText>
      ) : loading ? (
        <SizableText size="$2" color="$soft">
          Reading…
        </SizableText>
      ) : rows.length === 0 ? (
        <SizableText size="$2" color="$soft">
          This directory is empty.
        </SizableText>
      ) : (
        rows.map((r) => (
          <XStack
            key={r.key}
            render="button"
            aria-label={r.dir === false ? `Read ${r.name}` : `Open ${r.name}`}
            onPress={r.onPress}
            items="center"
            gap="$2"
            py="$1"
            hoverStyle={{ bg: '$hover' }}
          >
            {r.dir === false ? <File size={14} /> : r.dir ? <Folder size={14} /> : <File size={14} opacity={0.6} />}
            <SizableText size="$2" color="$ink" numberOfLines={1} style={{ textAlign: 'left' }}>
              {r.name}
            </SizableText>
          </XStack>
        ))
      )}
      {file && body ? (
        <YStack gap="$1" pt="$2" borderTopWidth={1} borderColor="$borderColor">
          <SizableText size="$1" color="$soft">
            {file}
          </SizableText>
          <SizableText size="$1" color="$ink" style={monoWrap}>
            {body}
          </SizableText>
        </YStack>
      ) : null}
    </YStack>
  )
}

function Artifacts({
  repo,
  branch,
  mode,
  project,
  pr,
  onEnvironment,
}: {
  repo: string
  branch: string
  mode: string
  project: string
  pr: { href: string; label: string }
  onEnvironment: () => void
}) {
  const host = useHost()
  const items: { key: string; icon: ReactNode; title: string; note: string; href?: string; onPress?: () => void }[] = []
  if (pr.href) items.push({ key: 'pr', icon: <GitPullRequest size={16} />, title: `Pull request ${pr.label}`, note: 'Opened on the forge', href: pr.href })
  if (branch) items.push({ key: 'branch', icon: <GitBranch size={16} />, title: branch, note: repo ? `The branch this run pushes to in ${repo}` : 'The branch this run pushes to' })
  if (mode === 'setup') items.push({ key: 'environment', icon: <Settings2 size={16} />, title: 'Environment proposal', note: 'The install and start scripts this run found', onPress: onEnvironment })
  if (project) items.push({ key: 'project', icon: <Layers size={16} />, title: project, note: 'The project this run builds', onPress: () => host.go(project) })

  if (!items.length) return <Soft>This run has produced no artifacts yet.</Soft>
  return (
    <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
      {items.map((a, i) => {
        const row = (
          <XStack items="center" gap="$3" px="$3" py="$2.5" borderTopWidth={i ? 1 : 0} borderColor="$borderColor" hoverStyle={a.href || a.onPress ? { bg: '$hover' } : undefined}>
            {a.icon}
            <YStack flex={1} minW={0} style={{ textAlign: 'left' }}>
              <SizableText size="$2" color="$ink" numberOfLines={1}>
                {a.title}
              </SizableText>
              <SizableText size="$1" color="$soft" numberOfLines={1}>
                {a.note}
              </SizableText>
            </YStack>
            {a.href ? <ExternalLink size={14} /> : null}
          </XStack>
        )
        return a.href ? (
          <Out key={a.key} href={a.href} label={a.title}>
            <YStack width="100%">{row}</YStack>
          </Out>
        ) : a.onPress ? (
          <YStack key={a.key} render="button" aria-label={a.title} onPress={a.onPress}>
            {row}
          </YStack>
        ) : (
          <YStack key={a.key}>{row}</YStack>
        )
      })}
    </YStack>
  )
}

function Pick({ on, onPress, children }: { on: boolean; onPress: () => void; children: string }) {
  return (
    <XStack render="button" aria-label={children} onPress={onPress} px="$2.5" py="$1" rounded="$2" bg={on ? '$hover' : 'transparent'}>
      <SizableText size="$2" color={on ? '$ink' : '$soft'}>
        {children}
      </SizableText>
    </XStack>
  )
}

function Soft({ children }: { children: string }) {
  return (
    <YStack py="$6" items="center">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {children}
      </SizableText>
    </YStack>
  )
}
