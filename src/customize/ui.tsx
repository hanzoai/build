/**
 * What every Customize tab is drawn from, so the four read as one page: a grid
 * of cards that stacks on a phone, the card itself with its one action, the
 * featured card, a dialog with a title and a scrolling body, a delete that asks
 * first, and the quiet line for empty, loading, signed-out and refused.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Check, Plus, X } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle } from '@hanzo/ui'
import { useState, type ReactNode } from 'react'

import { useHost } from '../host.tsx'

export const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)' }
/** A button that holds a card's text reads from the left, not from the middle a button centres it in. */
export const left = { textAlign: 'left' } as const

/** Which half of a tab: what the org has, or what it can add. */
export type View = 'yours' | 'discover'

/** What the shell hands a tab: which half, the search, and the Add dialog's state. */
export interface Pane {
  view: View
  q: string
  adding: boolean
  onAdding: (open: boolean) => void
  onView: (v: View) => void
}

/** Whether a row answers a search: every word of it somewhere in the row's text. */
export function matches(q: string, ...text: string[]): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = text.join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** Cards in as many columns as fit, one column on a phone. */
export function Grid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="list"
      aria-label={label}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 }}
    >
      {children}
    </div>
  )
}

/** A square with the thing's picture, or its initial. */
export function Mark({ name, logo, icon, size = 32 }: { name: string; logo?: string; icon?: ReactNode; size?: number }) {
  const [gone, setGone] = useState(false)
  return (
    <YStack width={size} height={size} rounded="$3" bg="$raised" items="center" justify="center" shrink={0} overflow="hidden" aria-hidden>
      {logo && !gone ? (
        <img src={logo} alt="" width={size} height={size} onError={() => setGone(true)} style={{ objectFit: 'contain' }} />
      ) : (
        (icon ?? (
          <SizableText size="$3" color="$ink">
            {(name.trim().charAt(0) || '?').toUpperCase()}
          </SizableText>
        ))
      )}
    </YStack>
  )
}

/**
 * One card: what it is, a few lines about it, a quiet fact under them, and its
 * action at the top right. Pressing the card opens it; the action is its own
 * control beside that, never inside it.
 */
export function Tile({
  title,
  detail,
  meta,
  mark,
  action,
  onOpen,
}: {
  title: string
  detail?: string
  meta?: string
  mark?: ReactNode
  action?: ReactNode
  onOpen?: () => void
}) {
  const body = (
    <>
      {mark}
      <YStack flex={1} minW={0} gap="$1">
        <SizableText size="$3" color="$ink" numberOfLines={1}>
          {title}
        </SizableText>
        {detail ? (
          <SizableText size="$1" color="$soft" numberOfLines={3}>
            {detail}
          </SizableText>
        ) : null}
        {meta ? (
          <SizableText size="$1" color="$soft" numberOfLines={1} opacity={0.8}>
            {meta}
          </SizableText>
        ) : null}
      </YStack>
    </>
  )
  return (
    <XStack role="listitem" items="flex-start" gap="$2" p="$3" minW={0} rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel" hoverStyle={onOpen ? { borderColor: '$edge' } : undefined}>
      {onOpen ? (
        <XStack
          render="button"
          aria-label={title}
          onPress={onOpen}
          flex={1}
          minW={0}
          gap="$3"
          items="flex-start"
          cursor="pointer"
          style={left}
          focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
        >
          {body}
        </XStack>
      ) : (
        <XStack flex={1} minW={0} gap="$3" items="flex-start">
          {body}
        </XStack>
      )}
      {action}
    </XStack>
  )
}

/** The one card the shelf puts first, drawn larger. */
export function Featured({ title, detail, meta, mark, action, onOpen }: { title: string; detail: string; meta: string; mark: ReactNode; action?: ReactNode; onOpen: () => void }) {
  return (
    <XStack items="flex-start" gap="$4" p="$4" rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel" flexWrap="wrap" rowGap="$3">
      <XStack render="button" aria-label={title} onPress={onOpen} flex={1} minW={220} gap="$4" items="flex-start" cursor="pointer" style={left}>
        {mark}
        <YStack flex={1} minW={0} gap="$1.5">
          <SizableText size="$1" color="$soft" textTransform="uppercase" letterSpacing={1}>
            Featured
          </SizableText>
          <SizableText size="$6" color="$ink" numberOfLines={1}>
            {title}
          </SizableText>
          <SizableText size="$2" color="$soft" numberOfLines={3}>
            {detail}
          </SizableText>
          <SizableText size="$1" color="$soft" numberOfLines={1}>
            {meta}
          </SizableText>
        </YStack>
      </XStack>
      {action}
    </XStack>
  )
}

/** A card's add control: a plus while it is not yours, a check once it is. */
export function Add({ name, added, busy, onPress }: { name: string; added: boolean; busy?: boolean; onPress: () => void }) {
  if (added) {
    return (
      <XStack aria-label={`${name} is added`} width={32} height={32} items="center" justify="center" shrink={0}>
        <Check size={16} />
      </XStack>
    )
  }
  return (
    <Button size="icon-sm" variant="outline" aria-label={`Add ${name}`} disabled={busy} onPress={onPress}>
      <Plus size={14} />
    </Button>
  )
}

/** A dialog with a title, a close control and a body that scrolls inside the window. */
export function Sheet({ title, open, onOpenChange, width = 560, children }: { title: string; open: boolean; onOpenChange: (o: boolean) => void; width?: number; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={width} showCloseButton={false} maxH="88vh" gap="$3">
        <XStack items="center" justify="space-between" gap="$2">
          <DialogTitle numberOfLines={1} flex={1}>
            {title}
          </DialogTitle>
          <XStack render="button" aria-label="Close" p="$1" onPress={() => onOpenChange(false)}>
            <X size={16} />
          </XStack>
        </XStack>
        <YStack gap="$3" overflow="scroll" minH={0} shrink={1}>
          {children}
        </YStack>
      </DialogContent>
    </Dialog>
  )
}

/** Asks before a delete; says what goes with it. */
export function Confirm({ what, says, open, onOpenChange, onYes }: { what: string; says: string; open: boolean; onOpenChange: (o: boolean) => void; onYes: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const yes = async () => {
    setBusy(true)
    setNote('')
    try {
      await onYes()
      onOpenChange(false)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={`Delete ${what}?`} open={open} onOpenChange={onOpenChange} width={420}>
      <SizableText size="$2" color="$soft">
        {says}
      </SizableText>
      <Line>{note}</Line>
      <XStack gap="$2" justify="flex-end">
        <Button size="sm" variant="ghost" onPress={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onPress={() => void yes()}>
          Delete
        </Button>
      </XStack>
    </Sheet>
  )
}

/** The quiet line for empty, loading, signed-out and refused. */
export function Soft({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <YStack py="$6" items="center" gap="$3">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {children}
      </SizableText>
      {action}
    </YStack>
  )
}

/** What a signed-out visitor is told, with the one control that signs them in. */
export function Visitor({ children }: { children: string }) {
  const host = useHost()
  return (
    <Soft
      action={
        <Button size="sm" onPress={() => host.signIn?.()}>
          Sign in
        </Button>
      }
    >
      {children}
    </Soft>
  )
}

/** What the last action did, said once, where it was done. */
export function Line({ children }: { children: string }) {
  if (!children) return null
  return (
    <SizableText size="$1" color="$soft" role="status">
      {children}
    </SizableText>
  )
}

/** A small heading over a run of cards. */
export function Part({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <YStack gap="$2.5">
      <YStack gap="$0.5">
        <SizableText size="$3" color="$ink">
          {title}
        </SizableText>
        <SizableText size="$1" color="$soft">
          {detail}
        </SizableText>
      </YStack>
      {children}
    </YStack>
  )
}

/** A labelled control, with a line under it when there is more to say. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <YStack gap="$1.5">
      <SizableText size="$2" color="$ink">
        {label}
      </SizableText>
      {children}
      {hint ? (
        <SizableText size="$1" color="$soft">
          {hint}
        </SizableText>
      ) : null}
    </YStack>
  )
}

/** Two or three choices side by side; the chosen one is filled. */
export function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <XStack role="group" aria-label={label} p={2} gap={2} rounded="$3" borderWidth={1} borderColor="$borderColor" self="flex-start">
      {options.map((o) => (
        <XStack
          key={o.id}
          render="button"
          aria-pressed={o.id === value}
          onPress={() => onChange(o.id)}
          px="$3"
          py="$1"
          rounded="$2"
          bg={o.id === value ? '$hover' : 'transparent'}
          hoverStyle={{ bg: '$hover' }}
        >
          <SizableText size="$2" color={o.id === value ? '$ink' : '$soft'}>
            {o.label}
          </SizableText>
        </XStack>
      ))}
    </XStack>
  )
}

/** A date from Unix seconds, or ''. */
export const day = (s: number): string => (s ? new Date(s * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '')
