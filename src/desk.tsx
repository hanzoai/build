/**
 * The pane beside a run's transcript: its codebase's environment, what it
 * pushed, its sandbox's desktop and shell, its files, and what it listens to.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Info, MoreHorizontal, PanelRightClose } from '@hanzogui/lucide-icons-2'
import { Button, DropdownMenu, type DropdownMenuProps } from '@hanzo/ui'
import { useState } from 'react'

import { shell, type ShellLine } from './api/turn.ts'
import type { Event } from './api/sessions.ts'
import { Door } from './door.tsx'
import { Environment } from './environment.tsx'
import { Files } from './files.tsx'
import { Git } from './git.tsx'

type Tab = 'environment' | 'git' | 'desktop' | 'terminal' | 'files' | 'subscriptions'

/** The tabs that are a surface of their own, drawn edge to edge. */
const BLEED: Tab[] = ['desktop', 'terminal']

export function Desk({
  id,
  repo,
  branch,
  base,
  environment,
  mode,
  pr,
  title,
  project,
  sandbox,
  events,
  live,
  menu = [],
  refused,
  retry = 'Retry',
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
  title: string
  project: string
  /** The sandbox the run holds, or '' before it leases one and on a machine. */
  sandbox: string
  events: Event[]
  live: boolean
  /** What can be done to the run — rename, share, copy its id — as its header's menu offers it. */
  menu?: NonNullable<DropdownMenuProps['items']>
  refused: string
  /** The refusal's one action: Retry, or Sign in when nobody is. */
  retry?: string
  onRetry: () => void
  onHide?: () => void
}) {
  // A setup run's work IS the environment, so it opens there.
  const [tab, setTab] = useState<Tab>(mode === 'setup' ? 'environment' : 'terminal')
  const name = repo.split('/').filter(Boolean).pop() || repo
  const lines = shell(events)
  const bleed = BLEED.includes(tab)

  return (
    <YStack
      role="complementary"
      aria-label="Run details"
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
        <TabButton id="desktop" tab={tab} onPick={setTab}>
          Desktop
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
          items={[...menu, { key: 'details', label: 'Details', icon: <Info size={16} />, onSelect: () => setTab('environment') }]}
        />
      </XStack>
      <YStack flex={1} minH={0} overflow={bleed ? 'hidden' : 'scroll'} px={bleed ? 0 : '$3'} py={bleed ? 0 : '$3'}>
        {tab === 'environment' ? (
          <YStack gap="$2">
            <Environment repo={name} busy={live && mode === 'setup'} />
            <SizableText size="$2" color="$ink" pt="$4">
              This run
            </SizableText>
            <Fact label="Run" value={id} />
            <Fact label="Repository" value={name || '—'} />
            <Fact label="Branch" value={branch || '—'} />
            <Fact label="Base" value={base || '—'} />
            <Fact label="Runs on" value={environment || 'sandbox'} />
            <Fact label="Mode" value={mode || 'build'} />
          </YStack>
        ) : null}
        {tab === 'git' ? <Git session={id} title={title} live={live} /> : null}
        {tab === 'desktop' ? <Door which="screen" sandbox={sandbox} live={live} session={id} /> : null}
        {tab === 'terminal' ? (
          <Terminal id={id} sandbox={sandbox} lines={lines} live={live} refused={refused} retry={retry} onRetry={onRetry} />
        ) : null}
        {tab === 'files' ? (
          <Files
            session={id}
            repo={repo}
            branch={branch}
            sandbox={sandbox}
            live={live}
            mode={mode}
            project={project}
            pr={pr}
            onEnvironment={() => setTab('environment')}
          />
        ) : null}
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

/**
 * The Terminal tab: a shell in the run's sandbox, in the same working tree as the
 * agent, while the run holds one; and the commands the agent itself ran, which
 * outlive the sandbox. The shell is a tmux session named for the run, so a
 * reopened tab reattaches to it.
 */
function Terminal({
  id,
  sandbox,
  lines,
  live,
  refused,
  retry,
  onRetry,
}: {
  id: string
  sandbox: string
  lines: ShellLine[]
  live: boolean
  refused: string
  retry: string
  onRetry: () => void
}) {
  const reachable = live && Boolean(sandbox)
  // The shell while there is one, unless the log was asked for.
  const [log, setLog] = useState(false)
  const showShell = reachable && !log
  return (
    <YStack flex={1} minH={0} bg="$background">
      <XStack px="$2" py="$1.5" gap="$1" borderBottomWidth={1} borderColor="$borderColor" items="center">
        {reachable ? (
          <XStack render="button" aria-label="Shell" onPress={() => setLog(false)} px="$2" py="$1" rounded="$2" bg={showShell ? '$hover' : 'transparent'}>
            <SizableText size="$1" color={showShell ? '$ink' : '$soft'}>
              Shell
            </SizableText>
          </XStack>
        ) : null}
        <XStack render="button" aria-label="Agent log" onPress={() => setLog(true)} px="$2" py="$1" rounded="$2" bg={showShell ? 'transparent' : '$hover'}>
          <SizableText size="$1" color={showShell ? '$soft' : '$ink'}>
            Agent log
          </SizableText>
        </XStack>
      </XStack>
      {showShell ? <Door which="terminal" sandbox={sandbox} live={live} session={`run-${id.replace(/^sess_/, '').slice(0, 12)}`} /> : <Log lines={lines} live={live} refused={refused} retry={retry} onRetry={onRetry} />}
    </YStack>
  )
}

function Log({
  lines,
  live,
  refused,
  retry,
  onRetry,
}: {
  lines: ShellLine[]
  live: boolean
  refused: string
  retry: string
  onRetry: () => void
}) {
  const prompt = 'workspace'
  const idle = lines.length === 0 && !live
  return (
    <YStack flex={1} minH={0}>
      <YStack flex={1} minH={0} overflow="scroll" px="$3" py="$3" gap="$1">
        {idle ? (
          <YStack flex={1} items="center" justify="center" gap="$3" py="$8">
            <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
              {refused || 'This run finished without writing a command.'}
            </SizableText>
            {refused ? (
              <Button size="sm" variant="outline" onPress={onRetry}>
                {retry}
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
