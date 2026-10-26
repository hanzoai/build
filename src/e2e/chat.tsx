/**
 * An empty Chat's composer as Chat hands it its slots (the app's Chat.tsx), for
 * look.spec.ts: the effort and the approval mode, the model and its families, the
 * `+`, dictation and voice mode, and the starters under it. Chat's defaults keep
 * the chips and the mode off until the person turns them on, as Settings →
 * Appearance does; the spec writes that setting (`hanzo.composer`) and the
 * composer follows it.
 *
 * `window.look`: the theme the page wears, and how many turns the conversation holds.
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { I18nProvider } from '@hanzo/i18n/react'
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Hanzo } from '@hanzo/ui'
import { Chat, EFFORTS, MEASURE, useFamilies, type ComposerProps, type Turn } from '@hanzo/ui/chat'
import { useDictation, useTalk, useVoice } from '@hanzo/voice'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { Target } from '../api/call.ts'
import { CHAT_MODES, MODES, type Mode } from '../gear.ts'
import { useMind } from '../mind.ts'
import { PanelToggle } from '../panel.tsx'
import { STARTERS } from '../suggest.ts'
import { Suggestions } from '../suggestions.tsx'
import { useEar } from '../voice.ts'

declare global {
  interface Window {
    look: { theme: 'light' | 'dark'; turns?: number }
  }
}

/** A token whose claims say acme/u1; the routed platform reads nothing else of it. */
const TOKEN = `x.${btoa(JSON.stringify({ owner: 'acme', sub: 'u1' })).replace(/=+$/, '')}.x`

function Page() {
  const t: Target = useMemo(() => ({ api: window.location.origin, token: () => TOKEN, org: 'acme' }), [])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Mode>('auto')
  const [effort, setEffort] = useState('high')
  const mind = useMind(t, 'pro')
  const families = useFamilies(mind)
  const voice = useVoice({ speech: useEar(t), language: 'en', ...useDictation(draft, setDraft) })
  const talk = useTalk({ baseUrl: t.api, token: () => TOKEN, org: 'acme' })
  // A conversation of `turns` messages, long enough to scroll under the composer.
  const messages: Turn[] = Array.from({ length: window.look?.turns ?? 0 }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 ? 'assistant' : 'user',
    content: `${i % 2 ? 'Answer' : 'Question'} ${i + 1}: ${'words that fill a line of the thread, '.repeat(6)}`,
  }))
  const composer: Partial<ComposerProps> = {
    column: true,
    value: draft,
    onChange: setDraft,
    onSend: () => setDraft(''),
    label: 'Message',
    placeholder: 'Type / for skills',
    plus: { upload: () => {}, skills: { rows: [], pick: () => {} }, research: { on: false, set: () => {} }, memory: { on: true, set: () => {} } },
    mind,
    effort: { value: effort, set: setEffort, items: EFFORTS },
    chips: families,
    defaults: { chips: false, mode: false },
    mode: { value: mode, set: (m) => setMode(m as Mode), items: MODES.filter((m) => CHAT_MODES.includes(m.id)) },
    voice,
    talk,
    starters: messages.length ? undefined : <Suggestions rows={STARTERS} onAct={() => {}} onDismiss={() => {}} />,
  }
  return (
    <YStack flex={1} height="100dvh" bg="$background" pb={12} gap="$2">
      <XStack justify="flex-end" px="$4" pt="$4">
        <PanelToggle open={false} onToggle={() => {}} />
      </XStack>
      <Chat
        messages={messages}
        send={() => {}}
        composer={composer}
        column={{ maxW: MEASURE }}
        empty={
          <YStack flex={1} justify="flex-end" items="center" pb="$2">
            <SizableText render="h1" fontSize="$7" fontWeight="700" color="$ink">
              What’s up?
            </SizableText>
          </YStack>
        }
      />
    </YStack>
  )
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider userId="u1" initialLocale="en" loadCatalog={async () => ({})}>
    <Hanzo theme={window.look?.theme ?? 'dark'}>
      <Page />
    </Hanzo>
  </I18nProvider>,
)
