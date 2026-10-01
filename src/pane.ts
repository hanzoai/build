/**
 * How a pane is cut: a card floating on the host's ground, read from
 * @hanzo/design's `--pane-*` tokens. Each falls back to the design value the
 * token names, so a host that sets none still draws a pane.
 *
 *   pane   fill, corner, edge, lens and drop, as gui props
 *   gap    the gutter between two panes, and the width of the edge in it
 */
export const pane = {
  bg: 'var(--pane-fill, var(--sheet-1))',
  rounded: 'var(--pane-round, var(--radius-xl))',
  borderWidth: 1,
  borderColor: 'var(--pane-edge, var(--white-08))',
  backdropFilter: 'var(--pane-blur, blur(20px) saturate(1.8))',
  boxShadow: 'var(--shadow-sheet-2)',
} as const

export const gap = 'var(--pane-gap, var(--space-2))'
