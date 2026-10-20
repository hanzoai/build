/**
 * The suggestions alone, over a stand-in for the composer, for suggest.spec.ts:
 * `useSuggestions` against the platform the spec routes, `Suggestions` under the
 * field (above it at a phone's width). A pick writes the prompt into the field
 * and into `window.went`.
 *
 * `window.suggest` before the page loads: `theme`, and whether anyone is signed in.
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import { useMedia } from '@hanzo/gui'
import { Hanzo, YStack } from '@hanzo/ui'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { Target } from '../api/call.ts'
import { Suggestions, useSuggestions } from '../suggestions.tsx'

export interface Rig {
  theme?: 'light' | 'dark'
  /** Signed in as `acme/u1`, or nobody. */
  signed?: boolean
}

declare global {
  interface Window {
    suggest: Rig
    went: string[]
  }
}

window.went = []

/** A token whose claims say acme/u1; the routed platform reads nothing else of it. */
const TOKEN = `x.${btoa(JSON.stringify({ owner: 'acme', sub: 'u1' })).replace(/=+$/, '')}.x`

function Page() {
  const r = window.suggest
  const t: Target = useMemo(() => ({ api: window.location.origin, token: () => (r.signed === false ? null : TOKEN), org: 'acme' }), [r.signed])
  const s = useSuggestions(t)
  const [draft, setDraft] = useState('')
  const phone = !useMedia().sm
  const list = (
    <Suggestions
      rows={s.rows}
      onPick={(p) => {
        setDraft(p)
        window.went.push(`pick ${p}`)
      }}
      onDismiss={s.dismiss}
    />
  )
  return (
    <YStack flex={1} style={{ height: '100dvh' }} bg="$background" justify="flex-end" p="$4" gap="$2">
      <YStack width="100%" maxW={720} mx="auto" gap="$2">
        {phone ? list : null}
        <textarea aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} style={{ width: '100%', borderRadius: 22, padding: 12 }} />
        {phone ? null : list}
      </YStack>
    </YStack>
  )
}

document.documentElement.classList.remove('light', 'dark')
document.documentElement.classList.add(window.suggest.theme ?? 'dark')
document.documentElement.dataset.theme = window.suggest.theme ?? 'dark'

createRoot(document.getElementById('root')!).render(
  <Hanzo theme={window.suggest.theme ?? 'dark'}>
    <Page />
  </Hanzo>,
)
