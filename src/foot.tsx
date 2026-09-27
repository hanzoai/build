/**
 * The rail's foot: the card that offers Hanzo in Slack, and the menu the account
 * row opens — who is signed in, Settings, Usage, the plans, help and logging out.
 * Everything it opens is an address of this page, but help, which is the
 * documentation.
 */
import { Popover, SizableText, XStack, YStack } from '@hanzo/gui'
import { Gauge, LifeBuoy, LogOut, Settings, Slack as Mark, Sparkles, X } from '@hanzogui/lucide-icons-2'
import { MenuRow, MenuRule } from '@hanzo/ui/product'

import { useHost } from './host.tsx'
import { path } from './route.ts'

export const DOCS = 'https://docs.hanzo.ai/docs/dev'

/** Hanzo in Slack is set up under Settings; the card goes there, and once dismissed stays gone. */
export function Slack({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <XStack items="center" gap="$2.5" px="$3" py="$2.5" rounded="$3" borderWidth={1} borderColor="$borderColor" bg="$panel">
      <Mark size={16} />
      <YStack flex={1} minW={0} gap="$0.5">
        <SizableText size="$2" color="$ink" numberOfLines={1}>
          Try Hanzo in Slack
        </SizableText>
        <XStack render="button" aria-label="Set up Hanzo in Slack" onPress={onOpen} cursor="pointer">
          <SizableText size="$1" color="$soft" textDecorationLine="underline">
            Set up
          </SizableText>
        </XStack>
      </YStack>
      <XStack render="button" aria-label="Dismiss" onPress={onDismiss} p="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
        <X size={14} />
      </XStack>
    </XStack>
  )
}

/**
 * The account menu. The rail draws the account row and says when it was pressed,
 * so the menu hangs off an anchor laid over the rail's foot: above it on the
 * open rail, beside it on the collapsed one.
 */
export function Who({ open, onOpenChange, narrow }: { open: boolean; onOpenChange: (o: boolean) => void; narrow: boolean }) {
  const host = useHost()
  const go = (p: string) => {
    onOpenChange(false)
    host.go(p)
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange} placement={narrow ? 'right-end' : 'top-start'} allowFlip stayInFrame offset={6}>
      <Popover.Anchor position="absolute" l={8} b={8} width={narrow ? 48 : 256} height={36} pointerEvents="none" />
      <Popover.Content
        role="menu"
        aria-label="Account"
        items="stretch"
        borderWidth={1}
        elevation="$2"
        px="$1"
        py="$1"
        width={260}
        bg="$panel"
        borderColor="$borderColor"
      >
        <YStack gap="$1">
          <SizableText size="$2" color="$soft" px="$2" py="$1.5" numberOfLines={1}>
            {host.person?.email || host.person?.name || ''}
          </SizableText>
          <MenuRule />
          <MenuRow label="Settings" icon={<Settings size={16} />} onPress={() => go(path({ kind: 'settings', section: 'general' }))} />
          <MenuRow label="Usage" icon={<Gauge size={16} />} onPress={() => go(path({ kind: 'settings', section: 'usage' }))} />
          <MenuRow label="View all plans" icon={<Sparkles size={16} />} onPress={() => go(path({ kind: 'screen', screen: 'plans' }))} />
          <MenuRow
            label="Get help"
            icon={<LifeBuoy size={16} />}
            onPress={() => {
              onOpenChange(false)
              window.open(DOCS, '_blank', 'noopener,noreferrer')
            }}
          />
          {host.signOut ? (
            <>
              <MenuRule />
              <MenuRow
                label="Log out"
                icon={<LogOut size={16} />}
                onPress={() => {
                  onOpenChange(false)
                  host.signOut?.()
                }}
              />
            </>
          ) : null}
        </YStack>
      </Popover.Content>
    </Popover>
  )
}
