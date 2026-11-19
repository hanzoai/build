/**
 * The run menu's "Keep computer awake" row. The row is the one control: its
 * switch only shows the state, so a press on the switch toggles once, not twice.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
import { DropdownMenuItem, Switch } from '@hanzo/ui'

export function KeepAwake({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  const { t } = useI18n()
  return (
    <DropdownMenuItem preventCloseOnSelect onSelect={() => onToggle(!on)}>
      <YStack flex={1} minW={0}>
        <SizableText size="$2" color="$ink">
          {t('Keep computer awake')}
        </SizableText>
        <SizableText size="$1" color="$soft">
          {t('Only for this session')}
        </SizableText>
      </YStack>
      <XStack pointerEvents="none" shrink={0} aria-hidden>
        <Switch checked={on} size="sm" tabIndex={-1} aria-hidden />
      </XStack>
    </DropdownMenuItem>
  )
}
