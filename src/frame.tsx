// The chrome: a bar, the pane, and one column beside it.
//
// THE COLUMN IS A SLOT, not a prop. What belongs beside the pane is decided by
// whatever the pane is showing — the deployed page while you build it — and
// threading that up through the frame would make the frame know about projects.
// A portal keeps the REACT tree the contents were written in, so a component in
// the column still reads the pane's own hooks while rendering somewhere else.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIam } from '@hanzo/iam/react'
import { Box, Text, XStack, YStack } from '@hanzo/ui'
import { HanzoMark } from '@hanzo/ui/product'
import { enter } from '~/enter'

const Slot = createContext<HTMLElement | null>(null)

/**
 * Put this in the column beside the pane.
 *
 * WHAT IS BESIDE THE PANE CANNOT PUT SOMETHING BESIDE THE PANE. A portal keeps
 * the React tree it was written in, so contents rendered in the column would
 * still see this slot and draw a column into the column they are already in.
 * Handing the contents an empty slot ends that by construction rather than by a
 * rule somebody has to remember.
 */
export function Beside({ children }: { children: ReactNode }) {
  const slot = useContext(Slot)
  if (!slot) return null
  return createPortal(<Slot.Provider value={null}>{children}</Slot.Provider>, slot)
}

/** Who is signed in, and the way in or out. */
function Account() {
  const door = useIam()
  const { user, isAuthenticated, logout } = door
  const name =
    (user as { displayName?: string; name?: string; email?: string } | null)?.displayName ||
    (user as { name?: string } | null)?.name ||
    (user as { email?: string } | null)?.email ||
    ''

  if (!isAuthenticated) {
    return (
      <Box
        render="button"
        onClick={() => void enter(door)}
        px="$3"
        py="$2"
        rounded="$3"
        borderWidth={1}
        borderColor="$borderColor"
        hoverStyle={{ bg: '$hover' }}
      >
        <Text fontSize="$2" color="$ink">
          Sign in
        </Text>
      </Box>
    )
  }

  return (
    <XStack items="center" gap="$2">
      <Text fontSize="$2" color="$soft" numberOfLines={1}>
        {name}
      </Text>
      <Box
        render="button"
        onClick={() => void logout()}
        px="$3"
        py="$2"
        rounded="$3"
        borderWidth={1}
        borderColor="$borderColor"
        hoverStyle={{ bg: '$hover' }}
      >
        <Text fontSize="$2" color="$ink">
          Sign out
        </Text>
      </Box>
    </XStack>
  )
}

/**
 * The frame. A bar across the top, the pane under it, and the column the pane
 * fills through `Beside`.
 *
 * The slot is held in STATE rather than a ref, because a ref does not re-render
 * and the column would stay empty until something else happened to. The ref
 * callback is the setter, so the first paint that has a node is the first paint
 * that fills it.
 */
export function Frame({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <YStack flex={1} minW={0} minH={0}>
      <XStack
        height={48}
        shrink={0}
        items="center"
        px="$4"
        gap="$3"
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        <HanzoMark size={18} />
        <Text fontSize="$3" fontWeight="500" color="$ink">
          Build
        </Text>
        <YStack flex={1} />
        <Account />
      </XStack>
      <XStack flex={1} minH={0}>
        <Slot.Provider value={slot}>
          <YStack flex={1} minW={0} minH={0}>
            {children}
          </YStack>
        </Slot.Provider>
        {/* A plain element, because this is a hole rather than a component: it
            holds whatever the pane portals into it and styles none of it. The
            width and the edge are its own, in build.css, and it is not offered
            at all on a window too narrow to spare the room. */}
        <div className="aside" ref={setSlot} />
      </XStack>
    </YStack>
  )
}
