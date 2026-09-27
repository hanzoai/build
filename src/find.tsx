/**
 * Finding a run by name: the rail's search icon.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Dialog, DialogContent, DialogTitle, Input } from '@hanzo/ui'
import type { RailSession } from '@hanzo/ui/chat'
import { useMemo, useState } from 'react'

export function Find({
  open,
  onOpenChange,
  recents,
  onOpen,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  recents: RailSession[]
  onOpen: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (n ? recents.filter((r) => r.title.toLowerCase().includes(n)) : recents).slice(0, 12)
  }, [q, recents])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={480}>
        <DialogTitle>Find a run</DialogTitle>
        <Input
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Search runs…"
          aria-label="Search runs"
          onKeyDown={(e: { key?: string; nativeEvent?: { key?: string } }) => {
            if ((e.key ?? e.nativeEvent?.key) === 'Enter' && hits[0]) onOpen(hits[0].id)
          }}
        />
        <YStack gap="$1" role="list">
          {hits.length === 0 ? (
            <SizableText size="$2" color="$soft">
              No run matches.
            </SizableText>
          ) : (
            hits.map((r) => (
              <XStack
                key={r.id}
                role="listitem"
                render="button"
                onPress={() => onOpen(r.id)}
                px="$2"
                py="$1.5"
                rounded="$3"
                hoverStyle={{ bg: '$hover' }}
              >
                <SizableText size="$2" color="$ink" numberOfLines={1}>
                  {r.title}
                </SizableText>
              </XStack>
            ))
          )}
        </YStack>
      </DialogContent>
    </Dialog>
  )
}
