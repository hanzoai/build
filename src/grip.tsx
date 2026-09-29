/**
 * A column's free edge, which is also how wide the column is: a vertical
 * separator a person drags, or moves with the arrow keys, to size the column
 * beside it. The project workspace sizes its chat with it, and a host sizes its
 * own column with it (the Hanzo app's sidebar).
 *
 *   side      the edge of the window the column is pinned to: `left` grows
 *             rightwards (a sidebar, the chat), `right` grows leftwards (an
 *             aside). One control for both, the arithmetic reflected.
 *   span      the column's width now, px; `floor` and `ceil` bound it.
 *   onSpan    the width while it moves, at most once a frame.
 *   onKeep    the width it settled on: a drag let go, a key, a double-click.
 *   onShut    when given, a drag pulled well past the floor, or a key pressed
 *             at it, puts the column away; absent, the floor holds.
 *   reset     the width a double-click returns to.
 *
 * Keys: the arrows step 8px (32px with Shift), Home and End go to the floor and
 * the ceiling. Pointer events, so a mouse, a trackpad, a touchscreen and a pen
 * are one path, with the pointer captured: a drag that outruns the handle, or
 * crosses a framed page, keeps sizing. The drag is measured from the column as
 * drawn when it begins, so the edge never jumps to the cursor.
 *
 * It sits inside the column, absolutely, on the column's free edge; the rest of
 * its props place it elsewhere (a gutter beside the column) and win.
 */
import { YStack } from '@hanzo/gui'
import { useEffect, useRef, useState, type ComponentProps, type FocusEvent, type PointerEvent } from 'react'

/** A key's step, px; with Shift, the long one. */
const STEP = 8
const LONG = 32

/** How far past the floor a drag is pulled before it shuts the column, px: a deliberate pull, not a twitch. */
const SLACK = 48

export interface GripProps extends Omit<ComponentProps<typeof YStack>, 'children'> {
  side: 'left' | 'right'
  span: number
  floor: number
  ceil: number
  reset: number
  onSpan: (n: number) => void
  onKeep?: (n: number) => void
  onShut?: () => void
  /** The separator's accessible name: "Resize sidebar", "Resize the chat". */
  label: string
}

export function Grip({ side, span, floor, ceil, reset, onSpan, onKeep, onShut, label, ...rest }: GripProps) {
  // The pinned edge in client coordinates, taken as the drag begins.
  const held = useRef(0)
  // Whether a press holds the pointer and whether it has moved since, the width
  // it last asked for, and the frame that will draw it. A press that never moves
  // keeps nothing.
  const drag = useRef<'none' | 'held' | 'moved'>('none')
  const want = useRef(span)
  const frame = useRef(0)
  const [hovered, setHovered] = useState(false)
  const [keyed, setKeyed] = useState(false)
  const [moving, setMoving] = useState(false)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const clamp = (n: number) => Math.round(Math.min(ceil, Math.max(floor, n)))
  const settle = (n: number) => {
    onSpan(n)
    onKeep?.(n)
  }
  const stop = () => {
    drag.current = 'none'
    cancelAnimationFrame(frame.current)
    frame.current = 0
    setMoving(false)
  }
  const wider = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
  const narrower = side === 'left' ? 'ArrowLeft' : 'ArrowRight'

  return (
    <YStack
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(span)}
      aria-valuemin={floor}
      aria-valuemax={ceil}
      tabIndex={0}
      data-slot="grip"
      data-moving={moving ? '' : undefined}
      position="absolute"
      t={0}
      b={0}
      {...(side === 'left' ? { r: 0 } : { l: 0 })}
      width={8}
      z={10}
      items="center"
      cursor="col-resize"
      outlineWidth={0}
      style={{ touchAction: 'none' }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // The line is the focus ring, drawn for a keyboard's focus and not a pointer's.
      onFocus={(e: FocusEvent<HTMLDivElement>) => setKeyed(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setKeyed(false)}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        // No text selection starts under a drag.
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const drawn = e.currentTarget.parentElement?.getBoundingClientRect().width ?? span
        held.current = side === 'left' ? e.clientX - drawn : e.clientX + drawn
        want.current = clamp(drawn)
        drag.current = 'held'
        setMoving(true)
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        if (drag.current === 'none') return
        drag.current = 'moved'
        const pulled = side === 'left' ? e.clientX - held.current : held.current - e.clientX
        if (onShut && pulled < floor - SLACK) {
          stop()
          e.currentTarget.releasePointerCapture(e.pointerId)
          onShut()
          return
        }
        want.current = clamp(pulled)
        if (frame.current) return
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          onSpan(want.current)
        })
      }}
      // A drag ends when the pointer is let go: lifted, or taken by the browser.
      onLostPointerCapture={() => {
        const moved = drag.current === 'moved'
        stop()
        if (moved) settle(want.current)
      }}
      onDoubleClick={() => settle(clamp(reset))}
      onKeyDown={(e: { key?: string; shiftKey?: boolean; preventDefault?: () => void }) => {
        const step = e.shiftKey ? LONG : STEP
        const to =
          e.key === wider ? span + step : e.key === narrower ? span - step : e.key === 'Home' ? floor : e.key === 'End' ? ceil : null
        if (to === null) return
        e.preventDefault?.()
        if (onShut && to < floor) return onShut()
        settle(clamp(to))
      }}
      {...rest}
    >
      {/* The line: the column's own edge until a person reaches for it. */}
      <YStack
        width={2}
        height="100%"
        rounded={1}
        bg={keyed || moving ? '$outlineColor' : hovered ? '$rim' : 'transparent'}
        pointerEvents="none"
      />
    </YStack>
  )
}
