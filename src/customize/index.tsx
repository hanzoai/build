/**
 * Customize: what the agent brings to a run — the skills it knows, the
 * connectors it calls, the plugins it runs, and agents of the org's own. Each
 * tab is its own address; in each, Yours is what the org has and Discover is
 * what it can add, with one search box and one Add over both.
 *
 * Nothing here is gated to org admins, because the platform gates none of it:
 * every write on these tabs is open to any member of the org.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { BookOpen, Bot, Plug, Plus, Puzzle } from '@hanzogui/lucide-icons-2'
import { Button, Input } from '@hanzo/ui'
import { useState, type ReactNode } from 'react'

import { useHost } from '../host.tsx'
import { path, TABS, type Tab } from '../route.ts'
import { Agents } from './agents.tsx'
import { Connectors } from './connectors.tsx'
import { Plugins } from './plugins.tsx'
import { Skills } from './skills.tsx'
import { Choice, type Pane, type View } from './ui.tsx'

const LABEL: Record<Tab, { title: string; add: string; find: string; icon: ReactNode }> = {
  skills: { title: 'Skills', add: 'New skill', find: 'Search skills', icon: <BookOpen size={15} /> },
  connectors: { title: 'Connectors', add: 'Add connector', find: 'Search connectors', icon: <Plug size={15} /> },
  plugins: { title: 'Plugins', add: 'Build plugin', find: 'Search plugins', icon: <Puzzle size={15} /> },
  agents: { title: 'Agents', add: 'New agent', find: 'Search agents', icon: <Bot size={15} /> },
}

const VIEWS = [
  { id: 'yours', label: 'Yours' },
  { id: 'discover', label: 'Discover' },
] as const

export function Customize({ tab, view: first }: { tab: Tab; view?: View }) {
  const host = useHost()
  // Until a person picks, a visitor sees what there is to add and a member what is theirs:
  // sign-in lands after the first draw, so the default follows it rather than being fixed then.
  const [picked, setView] = useState<View | null>(first ?? null)
  const view: View = picked ?? (host.person ? 'yours' : 'discover')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const pick = (next: Tab) => {
    setQ('')
    setAdding(false)
    host.go(path({ kind: 'customize', tab: next }))
  }
  const pane: Pane = { view, q, adding, onAdding: setAdding, onView: setView }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4', py: '$4' }}>
      <YStack width="100%" maxW={1080} mx="auto" gap="$4">
        <YStack gap="$1">
          <SizableText render="h1" size="$6" color="$ink">
            Customize
          </SizableText>
          <SizableText size="$2" color="$soft">
            What the agent brings to a run: the skills it knows, the connectors it calls, the plugins it runs, and agents of your own.
          </SizableText>
        </YStack>

        <XStack role="tablist" aria-label="Customize" gap="$4" borderBottomWidth={1} borderColor="$borderColor" $max-md={{ gap: '$3' }}>
          {TABS.map((id) => {
            const on = id === tab
            return (
              <XStack
                key={id}
                role="tab"
                render="button"
                aria-selected={on}
                onPress={() => pick(id)}
                items="center"
                gap="$1.5"
                pb="$2"
                mb={-1}
                borderBottomWidth={2}
                borderColor={on ? '$ink' : 'transparent'}
                hoverStyle={{ borderColor: on ? '$ink' : '$edge' }}
              >
                <XStack opacity={on ? 1 : 0.6} $max-md={{ display: 'none' }}>
                  {LABEL[id].icon}
                </XStack>
                <SizableText size="$3" color={on ? '$ink' : '$soft'}>
                  {LABEL[id].title}
                </SizableText>
              </XStack>
            )
          })}
        </XStack>

        <XStack items="center" gap="$2">
          <Choice label="Show" value={view} options={VIEWS} onChange={setView} />
          <XStack flex={1} />
          {host.person ? (
            <Button size="sm" onPress={() => setAdding(true)}>
              <Plus size={14} /> {LABEL[tab].add}
            </Button>
          ) : null}
        </XStack>
        <Input value={q} onChangeText={setQ} placeholder={`${LABEL[tab].find}…`} aria-label={LABEL[tab].find} />

        {tab === 'skills' ? (
          <Skills {...pane} />
        ) : tab === 'connectors' ? (
          <Connectors {...pane} />
        ) : tab === 'plugins' ? (
          <Plugins {...pane} />
        ) : (
          <Agents {...pane} />
        )}
      </YStack>
    </YStack>
  )
}

