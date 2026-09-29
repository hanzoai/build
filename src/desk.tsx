/**
 * The pane beside a run's transcript, as tabs: the Browser showing where the run
 * is published, its sandbox's Desktop and Terminal, what it produced, its files,
 * what it pushed, and its codebase's environment.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ExternalLink, Info, MoreHorizontal, PanelRightClose, RefreshCcw } from '@hanzogui/lucide-icons-2'
import { Button, DropdownMenu, type DropdownMenuProps } from '@hanzo/ui'
import { PreviewFrame, type PreviewHandle } from '@hanzo/ui/agents'
import { useRef, useState } from 'react'

import { shell, type ShellLine } from './api/turn.ts'
import type { Event } from './api/sessions.ts'
import { Door } from './door.tsx'
import { Environment } from './environment.tsx'
import { Artifacts, Files } from './files.tsx'
import { Git } from './git.tsx'
import { Out } from './out.tsx'

type Tab = 'browser' | 'desktop' | 'terminal' | 'artifacts' | 'files' | 'git' | 'environment'

/** The tabs that are a surface of their own, drawn edge to edge. */
const BLEED: Tab[] = ['browser', 'desktop', 'terminal']

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
  site,
  published,
  events,
  live,
  menu,
  refused,
  retry,
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
  /** Where the run's work is published, or '' before it is. */
  site: string
  /** The run's latest publish, which loads the page again. */
  published: number
  events: Event[]
  live: boolean
  /** What can be done to the run — rename, share, copy its id — as its header offers it. */
  menu: NonNullable<DropdownMenuProps['items']>
  refused: string
  /** The refusal's one action: Retry, or Sign in when nobody is. */
  retry: string
  onRetry: () => void
  onHide: () => void
}) {
  // Until a tab is picked it follows the run: a setup run's work IS the
  // environment, a published run opens on its site, any other on its terminal.
  const [picked, setTab] = useState<Tab | null>(null)
  const tab = picked ?? (mode === 'setup' ? 'environment' : site ? 'browser' : 'terminal')
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
        {/* The tabs scroll sideways in a narrow pane; hiding the pane and its menu stay put. */}
        <XStack flex={1} minW={0} gap="$1" overflow="scroll">
          <TabButton id="browser" tab={tab} onPick={setTab}>
            Browser
          </TabButton>
          <TabButton id="desktop" tab={tab} onPick={setTab}>
            Desktop
          </TabButton>
          <TabButton id="terminal" tab={tab} onPick={setTab}>
            Terminal
          </TabButton>
          <TabButton id="artifacts" tab={tab} onPick={setTab}>
            Artifacts
          </TabButton>
          <TabButton id="files" tab={tab} onPick={setTab}>
            Files
          </TabButton>
          <TabButton id="git" tab={tab} onPick={setTab}>
            Git
          </TabButton>
          <TabButton id="environment" tab={tab} onPick={setTab}>
            Environment
          </TabButton>
        </XStack>
        <XStack render="button" aria-label="Hide the side pane" px="$2" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }} onPress={onHide}>
          <PanelRightClose size={16} />
        </XStack>
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
        {tab === 'browser' ? <Browser key={published} site={site} live={live} /> : null}
        {tab === 'git' ? <Git session={id} title={title} live={live} /> : null}
        {tab === 'desktop' ? <Door which="screen" sandbox={sandbox} live={live} session={id} /> : null}
        {tab === 'terminal' ? (
          <Terminal id={id} sandbox={sandbox} lines={lines} live={live} refused={refused} retry={retry} onRetry={onRetry} />
        ) : null}
        {tab === 'artifacts' ? (
          <Artifacts repo={repo} branch={branch} mode={mode} project={project} site={site} pr={pr} onEnvironment={() => setTab('environment')} />
        ) : null}
        {tab === 'files' ? <Files session={id} repo={repo} branch={branch} sandbox={sandbox} live={live} /> : null}
      </YStack>
    </YStack>
  )
}

/**
 * The Browser tab: the page where the run published its work, framed, with its
 * address, a reload and the page in a tab of its own.
 */
function Browser({ site, live }: { site: string; live: boolean }) {
  const frame = useRef<PreviewHandle | null>(null)
  return (
    <YStack flex={1} minH={0}>
      <XStack px="$2" py="$1.5" gap="$1.5" items="center" borderBottomWidth={1} borderColor="$borderColor">
        <XStack render="button" aria-label="Reload the page" onPress={() => frame.current?.reload()} p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
          <RefreshCcw size={14} />
        </XStack>
        <SizableText flex={1} minW={0} size="$1" color="$soft" numberOfLines={1} style={mono}>
          {site || 'Not published yet'}
        </SizableText>
        {site ? (
          <Out href={site} label="Open in a new tab">
            <XStack p="$1.5" rounded="$2" hoverStyle={{ bg: '$hover' }}>
              <ExternalLink size={14} />
            </XStack>
          </Out>
        ) : null}
      </XStack>
      <PreviewFrame
        ref={frame}
        src={site}
        title="Where this run is published"
        device="desktop"
        empty={
          <YStack items="center" gap="$2" p="$6">
            <SizableText size="$3" color="$ink">
              {live ? 'Not published yet' : 'Nothing was published'}
            </SizableText>
            <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
              {live ? 'The page appears here once the run publishes its site.' : 'This run published no site. Its work is on its branch.'}
            </SizableText>
          </YStack>
        }
      />
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
