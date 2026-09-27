/**
 * General: how the builder looks and listens — the theme, the text size, the
 * motion, and the language dictation hears. Each choice is saved to the
 * person's own settings as it is made, so it follows them to every device.
 */
import { YStack } from '@hanzo/gui'
import { ChipSelect } from '@hanzo/ui/product'
import { useState } from 'react'

import type { Motion, Patch, Text, Theme } from '../api/pref.ts'
import { useHost } from '../host.tsx'
import { usePrefs } from '../prefs.tsx'
import { LANGUAGES, spoken } from '../voice.ts'
import { Card, Group, Heading, Note, Row, Soft } from './ui.tsx'

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const TEXTS: { id: Text; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
]

const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: 'system', label: 'System', hint: 'As this device is set' },
  { id: 'reduced', label: 'Reduced', hint: 'No animation anywhere' },
]

export function General() {
  const host = useHost()
  const { prefs, save } = usePrefs()
  const [note, setNote] = useState('')

  if (!host.person) {
    return (
      <YStack gap="$5">
        <Heading title="General" />
        <Soft>Sign in to see your settings.</Soft>
      </YStack>
    )
  }

  const keep = (patch: Patch) => {
    setNote('')
    save(patch).catch((e: unknown) => setNote((e as Error).message))
  }

  // Each choice is one of its list: a saved one was read against it, and a host's theme is one of THEMES.
  const theme = THEMES.find((x) => x.id === (prefs.theme ?? host.theme ?? 'dark'))!
  const text = TEXTS.find((x) => x.id === (prefs.text ?? 'medium'))!
  const motion = MOTIONS.find((x) => x.id === (prefs.motion ?? 'system'))!
  const language = LANGUAGES.find((l) => l.id === prefs.language) ?? LANGUAGES.find((l) => l.id === spoken())!

  return (
    <YStack gap="$6">
      <Heading title="General" detail="How Hanzo looks and listens. Saved to your account, so it follows you." />
      <Group title="Appearance">
        <Card>
          {host.chooseTheme ? (
            <Row
              first
              title="Theme"
              detail="System follows this device’s light or dark setting."
              trailing={
                <ChipSelect
                  name="Theme"
                  label={theme.label}
                  chosen={theme}
                  items={THEMES}
                  onChange={(x) => keep({ theme: x.id })}
                  placement="bottom-end"
                  width={200}
                />
              }
            />
          ) : null}
          <Row
            first={!host.chooseTheme}
            title="Text size"
            detail="The transcript, the composer and every screen."
            trailing={
              <ChipSelect
                name="Text size"
                label={text.label}
                chosen={text}
                items={TEXTS}
                onChange={(x) => keep({ text: x.id === 'medium' ? null : x.id })}
                placement="bottom-end"
                width={200}
              />
            }
          />
          <Row
            title="Motion"
            detail="Reduced stops animations and transitions on this page."
            trailing={
              <ChipSelect
                name="Motion"
                label={motion.label}
                chosen={motion}
                items={MOTIONS}
                onChange={(x) => keep({ motion: x.id === 'system' ? null : x.id })}
                placement="bottom-end"
                width={220}
              />
            }
          />
        </Card>
      </Group>
      <Group title="Voice">
        <Card>
          <Row
            first
            title="Dictation language"
            detail="What the microphone in the composer listens for."
            trailing={
              <ChipSelect
                name="Dictation language"
                label={language.label}
                chosen={language}
                items={LANGUAGES}
                onChange={(l) => keep({ language: l.id })}
                placeholder="Search languages…"
                placement="bottom-end"
                width={220}
              />
            }
          />
        </Card>
      </Group>
      <Note>{note}</Note>
    </YStack>
  )
}
