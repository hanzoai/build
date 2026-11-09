/**
 * Make with AI: one box at the top of Browse. A name ("Marie Curie") or a
 * description ("a skeptical CFO") and a Hanzo model drafts the agent, which is
 * shown once, editable, with Save; saving makes the org's own agent and opens its
 * profile. A real historical figure gets a public-domain portrait from Wikimedia
 * Commons where one is free to use, any other agent the emoji the model chose.
 * Nothing is made before Save.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
import { Button, Input, Textarea } from '@hanzo/ui'
import { useState } from 'react'

import { agents, CAST_CAP, CAST_TASK, create, EMPTY, free, handle, type Agent } from '../api/agents.ts'
import { portrait, saved, sketch, type Portrait, type Sketch } from '../api/draft.ts'
import { useTarget } from '../host.tsx'
import { say } from './say.ts'
import { Field, Line, Mark, Sheet } from './ui.tsx'

/** How long a portrait is waited for before the draft is shown without one. */
const WAIT = 6000

export function Drafted({ onMade }: { onMade: (a: Agent) => void }) {
  const { t } = useI18n()
  const target = useTarget()
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState<{ s: Sketch; face: Portrait | null } | null>(null)

  const make = async () => {
    if (!line.trim() || busy) return
    setBusy(true)
    setNote('')
    try {
      const s = await sketch(target, line)
      const face = s.figure ? await portrait(s.figure, AbortSignal.timeout(WAIT)) : null
      setDraft({ s, face })
    } catch (e) {
      setNote(say(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack gap="$2">
      <XStack gap="$2" items="center">
        <Input
          flex={1}
          value={line}
          onChangeText={setLine}
          placeholder={t('A name or a description: Marie Curie, a skeptical CFO…')}
          aria-label={t('Make with AI')}
          onSubmitEditing={() => void make()}
        />
        <Button size="sm" disabled={!line.trim() || busy} onPress={() => void make()}>
          {busy ? t('Drafting…') : t('Make with AI')}
        </Button>
      </XStack>
      <Line>{note}</Line>
      {draft ? <Review draft={draft} onClose={() => setDraft(null)} onMade={onMade} /> : null}
    </YStack>
  )
}

function Review({ draft, onClose, onMade }: { draft: { s: Sketch; face: Portrait | null }; onClose: () => void; onMade: (a: Agent) => void }) {
  const { t } = useI18n()
  const target = useTarget()
  const [name, setName] = useState(draft.s.name)
  const [role, setRole] = useState(draft.s.role)
  const [instructions, setInstructions] = useState(draft.s.instructions)
  const [opening, setOpening] = useState(draft.s.opening)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const have = await agents(target)
      const made = await create(target, {
        ...EMPTY,
        name: free(handle(name), have),
        description: role.trim(),
        instructions: saved({ instructions, opening }),
        cap: CAST_CAP,
        task: CAST_TASK,
        avatar: draft.face?.url ?? '',
        emoji: draft.face ? '' : draft.s.emoji,
      })
      onMade(made)
    } catch (e) {
      setNote(say(e, t))
      setWorking(false)
    }
  }

  return (
    <Sheet title={t('New agent')} open onOpenChange={(o) => !o && onClose()}>
      <XStack items="center" gap="$3">
        <Mark name={name || draft.s.name} size={48} logo={draft.face?.url} icon={!draft.face && draft.s.emoji ? <SizableText size="$8">{draft.s.emoji}</SizableText> : undefined} />
        <YStack flex={1} minW={0}>
          <Input value={name} onChangeText={setName} aria-label={t('Name')} />
        </YStack>
      </XStack>
      <Field label={t('Role')}>
        <Input value={role} onChangeText={setRole} aria-label={t('Role')} />
      </Field>
      <Field label={t('Instructions')}>
        <Textarea value={instructions} onChangeText={setInstructions} aria-label={t('Instructions')} rows={8} />
      </Field>
      <Field label={t('Opening line')}>
        <Input value={opening} onChangeText={setOpening} aria-label={t('Opening line')} />
      </Field>
      <Line>{note}</Line>
      <XStack gap="$2" items="center">
        <XStack flex={1} />
        <Button size="sm" variant="ghost" onPress={onClose}>
          {t('Cancel')}
        </Button>
        <Button size="sm" disabled={working || !name.trim() || !instructions.trim()} onPress={() => void save()}>
          {t('Save')}
        </Button>
      </XStack>
    </Sheet>
  )
}
