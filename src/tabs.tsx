// The tab strip, once.
//
// The strip is at least 48 tall and every tab at least 44 in both directions,
// which is what a thumb needs, and it refuses to shrink — the strip scrolls
// instead. A tab you can read and miss is worse than one you have to scroll to.
// 48 is a MINIMUM and not a height, because a scrollbar is drawn INSIDE the box
// it scrolls: on a platform with classic scrollbars a fixed 48 leaves the tabs
// under the floor this file exists to hold.
//
// The chosen tab is underlined 2px, which outweighs the 1px divider the strip
// draws under itself, and its weight does not change — a bolded label measures
// wider than the same word unbolded, so every tab to its right would step
// sideways on each switch.

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Box, Text, XStack } from '@hanzo/ui'

/** One tab: what the code calls it, what the reader calls it. */
export interface Tab<Id extends string = string> {
  id: Id
  label: string
  /** Before the label. A strip of plain words leaves it off. */
  icon?: LucideIcon
}

/**
 * A row of tabs and the one you are on.
 *
 * `onPick` is OPTIONAL because a strip can have a single destination, and a tab
 * with nowhere else to go is not a control — drawn as a button it would take a
 * focus stop to say the thing the label already says. So without a handler
 * these are labels, and the moment there is a second place to be they become
 * buttons with no other change.
 *
 * `after` is what sits past the last tab.
 */
export function Tabs<Id extends string>({
  tabs,
  chosen,
  onPick,
  after,
}: {
  // THE LIST DEFINES THE IDS and the other two are checked against it, which is
  // what `NoInfer` buys and why both carry it. Left inferring, `chosen` widens
  // `Id` by whatever it is passed — so a typo'd id becomes a legal extra tab
  // rather than an error — and a `setState` passed straight to `onPick` offers
  // `SetStateAction<Id>`, a union with a function in it, which is not a string
  // and collapses `Id` to its constraint. Either way the generic silently stops
  // checking anything.
  tabs: readonly Tab<Id>[]
  chosen: NoInfer<Id>
  onPick?: (id: NoInfer<Id>) => void
  after?: ReactNode
}) {
  return (
    <XStack
      minH={48}
      shrink={0}
      items="center"
      px="$3"
      gap="$3"
      overflow="scroll"
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      {tabs.map((one) => {
        const on = one.id === chosen
        const Icon = one.icon
        return (
          <Box
            key={one.id}
            {...(onPick ? { render: 'button', onClick: () => onPick(one.id) } : {})}
            aria-current={on}
            // Stretched rather than padded, so the rule lands on the strip's own
            // edge and every tab underlines at the same height whether or not it
            // carries an icon.
            self="stretch"
            items="center"
            justify="center"
            shrink={0}
            minW={44}
            minH={44}
            borderBottomWidth={2}
            borderColor={on ? '$ink' : 'transparent'}
          >
            <XStack items="center" gap="$2">
              {Icon ? <Icon size={14} aria-hidden /> : null}
              <Text fontSize="$2" color={on ? '$ink' : '$soft'} numberOfLines={1}>
                {one.label}
              </Text>
            </XStack>
          </Box>
        )
      })}
      {after}
    </XStack>
  )
}
