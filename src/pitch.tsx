/**
 * What a visitor reads under New on hanzo.build: the same agent on their own
 * computer, one line to install, and what it brings to a run. Each card names
 * something this page or the CLI does today, and nothing it does not.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Check, Copy, GitPullRequest, LayoutTemplate, ListChecks, MonitorPlay, Plug, Server, Sparkles, Workflow } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { useState, type ReactNode } from 'react'

import { DOCS } from './foot.tsx'

export const INSTALL = 'curl -fsSL hanzo.sh | sh'

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <Sparkles size={18} />, title: 'Skills', body: 'Teach it a workflow once. A skill loads when a task matches, or when you call it by name.' },
  { icon: <ListChecks size={18} />, title: 'Plan first', body: 'Start a run in plan mode. Nothing is built until you approve the plan.' },
  { icon: <Plug size={18} />, title: 'Connectors and plugins', body: 'MCP servers, skills and agents behind one install. Your org’s credentials reach a run through a relay, never the sandbox.' },
  { icon: <Server size={18} />, title: 'Environments', body: 'Point it at a repository. An agent works out install and start, and every later run begins from that setup.' },
  { icon: <MonitorPlay size={18} />, title: 'Desktop and terminal', body: 'Watch each run’s browser and shell live, beside the conversation.' },
  { icon: <GitPullRequest size={18} />, title: 'Review', body: 'Every run ends as a diff on its own branch, with commits and a pull request to review.' },
  { icon: <LayoutTemplate size={18} />, title: 'Templates to live', body: 'Start from a working app and publish it to a live address.' },
  { icon: <Workflow size={18} />, title: 'Automations', body: 'Hand it repeating work, and it runs on your schedule.' },
]

/** One line to copy, with a button that copies it. */
function Line({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <XStack items="center" gap="$3" px="$4" height={52} rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel" width="100%" maxW={560}>
      <SizableText size="$3" color="$soft" fontFamily="$mono" aria-hidden>
        $
      </SizableText>
      <SizableText flex={1} size="$3" color="$ink" fontFamily="$mono" numberOfLines={1}>
        {text}
      </SizableText>
      <Button variant="ghost" size="icon-sm" aria-label={copied ? 'Copied' : 'Copy the install command'} onPress={copy}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </Button>
    </XStack>
  )
}

function Card({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <YStack gap="$2" p="$5" rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel" flex={1} minW={240}>
      <XStack items="center" gap="$2.5">
        {icon}
        <SizableText size="$4" fontWeight="600" color="$ink">
          {title}
        </SizableText>
      </XStack>
      <SizableText size="$3" color="$soft">
        {body}
      </SizableText>
    </YStack>
  )
}

export function Pitch({ onStart }: { onStart: () => void }) {
  return (
    <YStack items="center" px="$4" pb="$12" gap="$12">
      <YStack id="features" width="100%" maxW={1080} items="center" gap="$5" pt="$6">
        <SizableText size="$2" color="$soft" fontFamily="$mono">
          Powered by Zen 6 · routed by Enso
        </SizableText>
        <SizableText role="heading" aria-level={2} size="$9" color="$ink" style={{ textAlign: 'center' }}>
          Bring Hanzo to your computer.
        </SizableText>
        <SizableText size="$4" color="$soft" maxW={620} style={{ textAlign: 'center' }}>
          The agent that builds here also runs in your terminal, on any codebase, in any language. Hand it a task, or open it and talk.
        </SizableText>
        <Line text={INSTALL} />
        <SizableText size="$2" color="$soft" fontFamily="$mono">
          then hanzo "fix the failing test", or hanzo code
        </SizableText>
        <a href={DOCS} style={{ color: 'inherit', textDecoration: 'none' }}>
          <XStack items="center" height={34} px="$3" rounded="$3" borderWidth={1} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
            <SizableText size="$3" color="$ink">
              Read the docs
            </SizableText>
          </XStack>
        </a>
      </YStack>

      <YStack width="100%" maxW={1080} gap="$5">
        <SizableText role="heading" aria-level={2} size="$7" color="$ink">
          Everything a run needs
        </SizableText>
        <XStack flexWrap="wrap" gap="$3">
          {FEATURES.map((f) => (
            <Card key={f.title} {...f} />
          ))}
        </XStack>
      </YStack>

      <YStack width="100%" maxW={1080} items="center" gap="$4" py="$8" rounded="$6" borderWidth={1} borderColor="$borderColor" bg="$panel">
        <SizableText role="heading" aria-level={2} size="$7" color="$ink" style={{ textAlign: 'center' }}>
          Say what you want built.
        </SizableText>
        <SizableText size="$3" color="$soft" style={{ textAlign: 'center' }} px="$4">
          In the browser here, or in your terminal.
        </SizableText>
        <Button variant="primary" size="sm" onPress={onStart}>
          Start building
        </Button>
      </YStack>
    </YStack>
  )
}
