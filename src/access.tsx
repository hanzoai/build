/**
 * Under a model list: the models it lists and cannot choose, and where to ask
 * for them. Nothing while every model listed answers.
 *
 * A link cannot sit inside a listbox option, so it sits here, under the list,
 * where the keyboard reaches it from the search field.
 */
import { SizableText, XStack } from '@hanzo/gui'

import type { Model } from './api/models.ts'
import { Out } from './out.tsx'

export function Access({ items }: { items: readonly Model[] }) {
  const locked = items.filter((m) => m.disabled && m.request)
  if (!locked.length) return null
  return (
    <XStack items="center" gap="$2" flexWrap="wrap">
      <SizableText size="$1" color="$soft">
        {locked.map((m) => m.label).join(', ')} {locked.length > 1 ? 'are' : 'is'} in research preview.
      </SizableText>
      <Out href={locked[0]!.request!}>
        <SizableText size="$1" color="$ink" textDecorationLine="underline">
          Request access
        </SizableText>
      </Out>
    </XStack>
  )
}
