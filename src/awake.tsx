/**
 * The run menu's "Keep computer awake": a checkbox row (so a screen reader hears
 * on or off) over the browser's screen wake lock. It reads "on" only once the
 * lock is granted, and the lock is let go when the run view closes.
 */
import { SizableText, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
import { DropdownMenuCheckboxItem } from '@hanzo/ui'
import { useEffect, useRef, useState } from 'react'

export interface Lock {
  release: () => Promise<void>
}
type Wake = { wakeLock?: { request: (type: 'screen') => Promise<Lock> } }

/** The lock held after asking for `on`: a new one when it is granted, none when it is refused, unsupported or let go. */
export async function hold(nav: Wake, held: Lock | null, on: boolean): Promise<Lock | null> {
  if (!on) {
    await held?.release().catch(() => undefined)
    return null
  }
  if (held) return held
  try {
    return (await nav.wakeLock?.request('screen')) ?? null
  } catch {
    return null
  }
}

/** [on, set]: `on` follows the lock itself, and the lock goes when the view does. */
export function useKeepAwake(): [boolean, (on: boolean) => Promise<void>] {
  const [on, setOn] = useState(false)
  const lock = useRef<Lock | null>(null)
  useEffect(() => () => void lock.current?.release().catch(() => undefined), [])
  const set = async (want: boolean) => {
    lock.current = await hold(navigator as unknown as Wake, lock.current, want)
    setOn(lock.current !== null)
  }
  return [on, set]
}

export function KeepAwake({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  const { t } = useI18n()
  return (
    <DropdownMenuCheckboxItem checked={on} onCheckedChange={onToggle} preventCloseOnSelect>
      <YStack flex={1} minW={0}>
        <SizableText size="$2" color="$ink">
          {t('Keep computer awake')}
        </SizableText>
        <SizableText size="$1" color="$soft">
          {t('Only for this session')}
        </SizableText>
      </YStack>
    </DropdownMenuCheckboxItem>
  )
}
