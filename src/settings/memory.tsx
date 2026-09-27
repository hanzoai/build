/**
 * Memory: what Hanzo remembers about the person in this organization, newest
 * first. Each can be forgotten, and anything said in the box is remembered as
 * written. The memories are the person's own; nobody else in the organization
 * reads them.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Trash2 } from '@hanzogui/lucide-icons-2'
import { Button, Input } from '@hanzo/ui'
import { useState } from 'react'

import { forget, memories, remember, type Memory as Remembered } from '../api/memory.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, Group, Heading, Note, Soft } from './ui.tsx'

/** A platform time as a date, or '' when it is not one. */
const day = (at: string): string => {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function Memory() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => memories(t) : null, [] as Remembered[], [t, signed])
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Memory" />
        <Soft>Sign in to see what Hanzo remembers.</Soft>
      </YStack>
    )
  }

  const act = async (what: string, run: () => Promise<unknown>, done: string) => {
    setBusy(what)
    setNote('')
    try {
      await run()
      list.reload()
      setNote(done)
      return true
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work')
      return false
    } finally {
      setBusy('')
    }
  }

  const keep = () => {
    const words = said.trim()
    if (!words) return
    void act('remember', () => remember(t, words), 'Remembered').then((took) => took && setSaid(''))
  }

  return (
    <YStack gap="$6">
      <Heading title="Memory" detail="What Hanzo remembers about you here, to carry from one run to the next. Only you see it." />
      <Group title="Tell Hanzo what to remember or change">
        <XStack gap="$2" items="center">
          <YStack flex={1} minW={0}>
            <Input
              value={said}
              onChangeText={setSaid}
              onSubmitEditing={keep}
              aria-label="Tell Hanzo what to remember or change"
              placeholder="I prefer small pull requests, one change each."
            />
          </YStack>
          <Button size="sm" disabled={!said.trim() || busy !== ''} onPress={keep}>
            Remember
          </Button>
        </XStack>
      </Group>
      <Group title="What Hanzo remembers" detail={list.value.length ? `${list.value.length} ${list.value.length === 1 ? 'memory' : 'memories'}, newest first.` : undefined}>
        {list.error ? (
          <Soft>{list.error.message}</Soft>
        ) : list.loading && !list.value.length ? (
          <Soft>Reading memories…</Soft>
        ) : !list.value.length ? (
          <Soft>Nothing yet. What you tell Hanzo to remember shows here.</Soft>
        ) : (
          <Card>
            {list.value.map((m, i) => (
              <XStack key={m.id} items="flex-start" gap="$3" px="$3" py="$2.5" borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
                <YStack flex={1} minW={0} gap="$0.5">
                  <SizableText size="$2" color="$ink">
                    {m.content}
                  </SizableText>
                  <SizableText size="$1" color="$soft">
                    {[m.kind, day(m.updated)].filter(Boolean).join(' · ')}
                  </SizableText>
                </YStack>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Forget ${m.content.slice(0, 60)}`}
                  disabled={busy !== ''}
                  onPress={() => void act(m.id, () => forget(t, m.id), 'Forgotten')}
                >
                  <Trash2 size={14} />
                </Button>
              </XStack>
            ))}
          </Card>
        )}
      </Group>
      <Note>{note}</Note>
    </YStack>
  )
}
