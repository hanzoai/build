/**
 * An empty Chat's composer in a language, for language.spec.ts: the panel
 * toggle, the composer with its `+`, dictation, voice mode and the row under
 * it (model, effort, mode), and the starters under that, inside @hanzo/i18n's
 * provider as a host mounts it. A press on a starter records its act in
 * `window.went`, as JSON.
 *
 * `window.lang` before the page loads: the locale, and the catalog the
 * provider loads for it (the spec writes its own, so it reads what it wrote).
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import '@hanzo/i18n/rtl.css'
import { I18nProvider, useI18n } from '@hanzo/i18n/react'
import { Hanzo, XStack, YStack } from '@hanzo/ui'
import { useDictation, useTalk, useVoice } from '@hanzo/voice'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { Target } from '../api/call.ts'
import { Composer } from '@hanzo/ui/chat'

import { CHAT_MODES, MODES, type Mode } from '../gear.ts'
import { pacing, useMind } from '../mind.ts'
import { PanelToggle } from '../panel.tsx'
import { useEar } from '../voice.ts'
import { STARTERS } from '../suggest.ts'
import { Suggestions } from '../suggestions.tsx'

export interface Lang {
  locale: string
  catalog: Record<string, string>
}

declare global {
  interface Window {
    lang: Lang
    went: string[]
  }
}

window.went = []

/** A token whose claims say acme/u1; the routed platform reads nothing else of it. */
const TOKEN = `x.${btoa(JSON.stringify({ owner: 'acme', sub: 'u1' })).replace(/=+$/, '')}.x`

function Page() {
  const { t: say } = useI18n()
  const t: Target = useMemo(() => ({ api: window.location.origin, token: () => TOKEN, org: 'acme' }), [])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Mode>('auto')
  const [memory, setMemory] = useState(true)
  const [research, setResearch] = useState(false)
  const mind = useMind(t, 'pro')
  const voice = useVoice({ speech: useEar(t), language: 'en', ...useDictation(draft, setDraft) })
  const talk = useTalk({ baseUrl: t.api, token: () => TOKEN, org: 'acme' })
  return (
    <YStack flex={1} height="100dvh" bg="$background" p="$4" gap="$2">
      <XStack justify="flex-end">
        <PanelToggle open={false} onToggle={() => window.went.push('"tabs"')} />
      </XStack>
      <YStack flex={1} />
      <Composer
        column
        value={draft}
        onChange={setDraft}
        onSend={() => window.went.push(JSON.stringify({ sent: draft }))}
        label="Message"
        placeholder={say('Type / for skills')}
        plus={{
          upload: () => window.went.push('"upload"'),
          skills: { rows: [], pick: () => {} },
          research: { on: research, set: setResearch },
          memory: { on: memory, set: setMemory },
        }}
        mind={mind}
        effort={pacing(mind)}
        defaults={{ model: true }}
        mode={{ value: mode, set: (m) => setMode(m as Mode), items: MODES.filter((m) => CHAT_MODES.includes(m.id)) }}
        voice={voice}
        talk={talk}
        starters={<Suggestions rows={STARTERS} onAct={(act) => window.went.push(JSON.stringify(act))} onDismiss={() => {}} />}
      />
    </YStack>
  )
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider userId="u1" initialLocale={window.lang.locale} loadCatalog={async () => window.lang.catalog}>
    <Hanzo theme="dark">
      <Page />
    </Hanzo>
  </I18nProvider>,
)
