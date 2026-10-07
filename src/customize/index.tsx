/**
 * Customize: what the agent brings to a run — the skills it knows, the
 * connectors it calls, the plugins it runs, and agents of the org's own. Each
 * tab is its own address. In each, Browse comes first and is where the page
 * opens: what there is to add, then what Hanzo builds in. Yours is what the org
 * already has, counted on its button. One search and one Add serve both.
 *
 * Skills and connectors ride into every run in the org, so adding, switching
 * and removing them is an org admin's and a member reads them; plugins and
 * agents are any member's.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { BookOpen, Bot, Plug, Plus, Puzzle } from '@hanzogui/lucide-icons-2'
import { Button, Input } from '@hanzo/ui'
import { useCallback, useState, type ReactNode } from 'react'

import { useHost } from '../host.tsx'
import { path, TABS, type Tab } from '../route.ts'
import { Agents } from './agents.tsx'
import { Connectors } from './connectors.tsx'
import { Plugins } from './plugins.tsx'
import { Skills } from './skills.tsx'
import { Choice, type Pane, type View } from './ui.tsx'

/** What every run in the org loads: an org admin's to add to, a member's to read. */
export const ORG_KIT: Tab[] = ['skills', 'connectors']

const LABEL: Record<Tab, { title: string; says: string; add: string; find: string; icon: ReactNode }> = {
  skills: { title: 'Skills', says: 'Know-how an agent reads before it works.', add: 'New skill', find: 'Search skills', icon: <BookOpen size={15} /> },
  connectors: { title: 'Connectors', says: 'Apps and tools an agent can call.', add: 'Add by URL', find: 'Search connectors', icon: <Plug size={15} /> },
  plugins: { title: 'Plugins', says: 'Connectors you build in TypeScript.', add: 'Build plugin', find: 'Search plugins', icon: <Puzzle size={15} /> },
  agents: { title: 'Agents', says: 'Agents with their own model, instructions and budget.', add: 'New agent', find: 'Search agents', icon: <Bot size={15} /> },
}

export function Customize({ tab, view: first }: { tab: Tab; view?: View }) {
  const host = useHost()
  // Browse first, always: a first visit has nothing of its own to show, and what there is to add is the page.
  const [view, setView] = useState<View>(first ?? 'discover')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [count, setCount] = useState(0)
  const onCount = useCallback((n: number) => setCount(n), [])
  const pick = (next: Tab) => {
    setQ('')
    setAdding(false)
    setView('discover')
    setCount(0)
    host.go(path({ kind: 'customize', tab: next }))
  }
  const pane: Pane = { view, q, adding, onAdding: setAdding, onView: setView, onCount }
  const kit = ORG_KIT.includes(tab)
  const may = Boolean(host.person) && (host.admin || !kit)

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" $max-md={{ px: '$4', py: '$4' }}>
      <YStack width="100%" maxW={1080} mx="auto" gap="$4">
        <YStack gap="$1">
          <SizableText render="h1" size="$6" color="$ink">
            Customize
          </SizableText>
          <SizableText size="$2" color="$soft">
            What your agent can use in every run.
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

        <SizableText size="$2" color="$soft">
          {LABEL[tab].says}
        </SizableText>

        <XStack items="center" gap="$2">
          <Choice
            label="Show"
            value={view}
            options={[
              { id: 'discover', label: 'Browse' },
              { id: 'yours', label: 'Yours', count },
            ]}
            onChange={setView}
          />
          <XStack flex={1} />
          {may ? (
            <Button size="sm" onPress={() => setAdding(true)}>
              <Plus size={14} /> {LABEL[tab].add}
            </Button>
          ) : null}
        </XStack>
        <Input value={q} onChangeText={setQ} placeholder={`${LABEL[tab].find}…`} aria-label={LABEL[tab].find} />
        {host.person && kit && !host.admin ? (
          <SizableText size="$1" color="$soft">
            Only an org admin can add or change {LABEL[tab].title.toLowerCase()}. You can see what is on.
          </SizableText>
        ) : null}

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
