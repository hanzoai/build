/**
 * The pane beside a run's transcript: the machine it runs on, the branch it
 * writes, the commands it ran, and the files on that branch.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Copy, File, Folder, MoreHorizontal, PanelRightClose } from '@hanzogui/lucide-icons-2'
import { Button, DropdownMenu } from '@hanzo/ui'
import { useState } from 'react'

import { blob, tree, type Entry } from './api/git.ts'
import { shell, type ShellLine } from './api/turn.ts'
import type { Event } from './api/sessions.ts'
import { useRead } from './data.ts'
import { useTarget } from './host.tsx'
import { Out } from './out.tsx'

type Tab = 'environment' | 'git' | 'terminal' | 'files' | 'subscriptions'

export function Desk({
  id,
  repo,
  branch,
  base,
  environment,
  mode,
  pr,
  events,
  live,
  refused,
  onRetry,
  onHide,
}: {
  id: string
  repo: string
  branch: string
  base: string
  environment: string
  mode: string
  pr: { href: string; label: string }
  events: Event[]
  live: boolean
  refused: string
  onRetry: () => void
  onHide?: () => void
}) {
  const [tab, setTab] = useState<Tab>('terminal')
  const [copied, setCopied] = useState(false)
  const name = repo.split('/').filter(Boolean).pop() || repo
  const ref = branch || base || 'main'
  const lines = shell(events)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <YStack
      flex={1}
      minW={0}
      minH={0}
      borderLeftWidth={1}
      borderColor="$borderColor"
      display="none"
      $md={{ display: 'flex' }}
    >
      <XStack px="$2" pt="$2" gap="$1" borderBottomWidth={1} borderColor="$borderColor" items="center">
        <TabButton id="environment" tab={tab} onPick={setTab}>
          Environment
        </TabButton>
        <TabButton id="git" tab={tab} onPick={setTab}>
          Git
        </TabButton>
        <TabButton id="terminal" tab={tab} onPick={setTab}>
          Terminal
        </TabButton>
        <TabButton id="files" tab={tab} onPick={setTab}>
          Files
        </TabButton>
        <TabButton id="subscriptions" tab={tab} onPick={setTab}>
          Subscriptions
        </TabButton>
        <XStack flex={1} />
        {onHide ? (
          <XStack render="button" aria-label="Hide the side pane" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }} onPress={onHide}>
            <PanelRightClose size={16} />
          </XStack>
        ) : null}
        <DropdownMenu
          trigger={
            <XStack render="button" aria-label="Run actions" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
              <MoreHorizontal size={16} />
            </XStack>
          }
          items={[
            { key: 'copy', label: copied ? 'Copied' : 'Copy run id', icon: <Copy size={16} />, description: id, onSelect: () => void copy() },
            { key: 'details', label: 'Details', onSelect: () => setTab('environment') },
          ]}
        />
      </XStack>
      <YStack flex={1} minH={0} overflow={tab === 'terminal' ? 'hidden' : 'scroll'} p={tab === 'terminal' ? 0 : undefined} px={tab === 'terminal' ? 0 : '$3'} py={tab === 'terminal' ? 0 : '$3'}>
        {tab === 'environment' ? (
          <YStack gap="$2">
            <Fact label="Run" value={id} />
            <Fact label="Repository" value={name || '—'} />
            <Fact label="Branch" value={branch || '—'} />
            <Fact label="Base" value={base || '—'} />
            <Fact label="Runs on" value={environment || 'sandbox'} />
            <Fact label="Mode" value={mode || 'build'} />
          </YStack>
        ) : null}
        {tab === 'git' ? (
          <YStack gap="$2">
            <Fact label="Writing" value={branch || '—'} />
            <Fact label="From" value={base || '—'} />
            {pr.href ? (
              <Out href={pr.href} label={`Open pull request ${pr.label}`}>
                <SizableText size="$2" color="$ink">
                  Pull request {pr.label}
                </SizableText>
              </Out>
            ) : (
              <Fact label="Pull request" value="None yet" />
            )}
          </YStack>
        ) : null}
        {tab === 'terminal' ? (
          <Terminal lines={lines} live={live} refused={refused} onRetry={onRetry} />
        ) : null}
        {tab === 'files' ? <Files repo={name} refName={ref} /> : null}
        {tab === 'subscriptions' ? (
          <YStack flex={1} items="center" justify="center" px="$6">
            <SizableText size="$2" color="$soft" style={{ textAlign: 'center', maxWidth: 320 }}>
              Ask an agent to subscribe to a Slack channel or thread, a pull request, or a timer.
            </SizableText>
          </YStack>
        ) : null}
      </YStack>
    </YStack>
  )
}

function TabButton({ id, tab, onPick, children }: { id: Tab; tab: Tab; onPick: (t: Tab) => void; children: string }) {
  const on = tab === id
  return (
    <XStack
      render="button"
      aria-label={children}
      onPress={() => onPick(id)}
      px="$2"
      py="$2"
      borderBottomWidth={2}
      borderColor={on ? '$ink' : 'transparent'}
    >
      <SizableText size="$2" color={on ? '$ink' : '$soft'}>
        {children}
      </SizableText>
    </XStack>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <XStack gap="$3" items="baseline">
      <SizableText size="$1" color="$soft" width={96}>
        {label}
      </SizableText>
      <SizableText flex={1} size="$2" color="$ink" numberOfLines={2}>
        {value}
      </SizableText>
    </XStack>
  )
}

const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)', whiteSpace: 'pre' as const }

function Terminal({
  lines,
  live,
  refused,
  onRetry,
}: {
  lines: ShellLine[]
  live: boolean
  refused: string
  onRetry: () => void
}) {
  const prompt = 'workspace'
  const idle = lines.length === 0 && !live
  return (
    <YStack flex={1} minH={0} bg="$background">
      <XStack px="$3" py="$2" borderBottomWidth={1} borderColor="$borderColor">
        <SizableText size="$1" color="$soft">
          Terminal 1
        </SizableText>
      </XStack>
      <YStack flex={1} minH={0} overflow="scroll" px="$3" py="$3" gap="$1">
        {idle ? (
          <YStack flex={1} items="center" justify="center" gap="$3" py="$8">
            <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
              {refused || 'This run finished without writing a command.'}
            </SizableText>
            {refused ? (
              <Button size="sm" variant="outline" onPress={onRetry}>
                Retry
              </Button>
            ) : null}
          </YStack>
        ) : (
          lines.map((line, i) =>
            line.role === 'cmd' ? (
              <XStack key={i} gap="$2">
                <SizableText size="$1" color="$soft" style={mono}>
                  {`${prompt} $`}
                </SizableText>
                <SizableText flex={1} size="$1" color="$ink" style={mono}>
                  {line.text}
                </SizableText>
              </XStack>
            ) : (
              <SizableText key={i} size="$1" color="$ink" style={mono}>
                {line.text}
              </SizableText>
            ),
          )
        )}
        {live ? (
          <XStack gap="$2" items="center">
            <SizableText size="$1" color="$soft" style={mono}>
              {`${prompt} $`}
            </SizableText>
            <YStack width={7} height={14} bg="$ink" />
          </XStack>
        ) : null}
      </YStack>
      <XStack px="$3" py="$2" borderTopWidth={1} borderColor="$borderColor">
        <SizableText size="$1" color="$soft">
          Commands appear here as the run writes them.
        </SizableText>
      </XStack>
    </YStack>
  )
}

function Files({ repo, refName }: { repo: string; refName: string }) {
  const t = useTarget()
  const [dir, setDir] = useState('')
  const [file, setFile] = useState('')
  const list = useRead(repo ? () => tree(t, repo, refName, dir) : null, [] as Entry[], [t, repo, refName, dir])
  const body = useRead(file ? () => blob(t, repo, refName, file) : null, null, [t, repo, refName, file])
  const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''

  return (
    <YStack gap="$2">
      <XStack gap="$2" items="center">
        {dir ? (
          <XStack render="button" aria-label="Up one directory" onPress={() => { setDir(parent); setFile('') }} px="$1" py="$1">
            <SizableText size="$1" color="$soft">
              Up
            </SizableText>
          </XStack>
        ) : null}
        <SizableText size="$1" color="$soft" numberOfLines={1}>
          {repo}{refName ? `@${refName}` : ''}{dir ? `/${dir}` : ''}
        </SizableText>
      </XStack>
      {list.error ? (
        <SizableText size="$2" color="$soft">
          {list.error.message}
        </SizableText>
      ) : list.loading && list.value.length === 0 ? (
        <SizableText size="$2" color="$soft">
          Reading the branch…
        </SizableText>
      ) : !repo ? (
        <SizableText size="$2" color="$soft">
          This run has no repository yet.
        </SizableText>
      ) : list.value.length === 0 ? (
        <SizableText size="$2" color="$soft">
          This directory is empty.
        </SizableText>
      ) : (
        list.value.map((e) => (
          <XStack
            key={e.path}
            render="button"
            aria-label={e.dir ? `Open ${e.name}` : `Read ${e.name}`}
            onPress={() => (e.dir ? (setDir(e.path), setFile('')) : setFile(e.path))}
            items="center"
            gap="$2"
            py="$1"
            hoverStyle={{ bg: '$hover' }}
          >
            {e.dir ? <Folder size={14} /> : <File size={14} />}
            <SizableText size="$2" color="$ink" numberOfLines={1}>
              {e.name}
            </SizableText>
          </XStack>
        ))
      )}
      {file && body.value ? (
        <YStack gap="$1" pt="$2" borderTopWidth={1} borderColor="$borderColor">
          <SizableText size="$1" color="$soft">
            {file}
          </SizableText>
          <SizableText size="$1" color="$ink" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--f-mono, ui-monospace, monospace)' }}>
            {body.value.binary ? 'Binary file' : body.value.truncated ? 'Too large to show' : body.value.text || 'Empty file'}
          </SizableText>
        </YStack>
      ) : null}
      {file && body.error ? (
        <SizableText size="$1" color="$soft">
          {body.error.message}
        </SizableText>
      ) : null}
    </YStack>
  )
}
