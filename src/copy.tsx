// Copying something out of the app, in one control.
//
// The glyph, the tick and how long the tick stays are decided here rather than
// at each call site — a control that confirms for 1400ms in one pane and 800ms
// in another reads as two different controls doing two different things.

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Box, Text, XStack } from '@hanzo/ui'

/**
 * Take something away with you.
 *
 * It copies the TEXT IT IS GIVEN, which is the source rather than what is on
 * screen: rendered text has thrown away whatever shape the bytes carried.
 *
 * ALWAYS PRESENT, not hover-only. A control that exists only under a pointer is
 * one a keyboard and a thumb cannot reach; this one rests dim and comes up on
 * hover or focus. Given a `label` it stops resting — a word in a row of named
 * controls is read at full weight.
 */
export function Take({
  text,
  says = 'this',
  label,
}: {
  /** What lands on the clipboard. */
  text: string
  /** What it is, for the reader who hears the control rather than sees it. */
  says?: string
  /** A word beside the glyph, where the control sits among named ones. */
  label?: string
}) {
  const [took, setTook] = useState(false)

  useEffect(() => {
    if (!took) return
    const t = setTimeout(() => setTook(false), 1400)
    return () => clearTimeout(t)
  }, [took])

  return (
    <Box
      render="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => setTook(true))
          .catch(() => {})
      }}
      aria-label={took ? 'Copied' : `Copy ${says}`}
      borderWidth={0}
      bg="transparent"
      p="$1"
      rounded="$2"
      opacity={label || took ? 1 : 0.35}
      hoverStyle={{ opacity: 1, bg: '$hover' }}
      focusStyle={{ opacity: 1 }}
    >
      <XStack items="center" gap="$1">
        {took ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {label ? (
          <Text fontSize="$2" color="$ink">
            {took ? 'Copied' : label}
          </Text>
        ) : null}
      </XStack>
    </Box>
  )
}
