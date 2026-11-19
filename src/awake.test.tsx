import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Each piece keeps the props it was drawn with, so the test sees which handlers the row carries.
const { seen, box } = vi.hoisted(() => {
  const seen: Record<string, Record<string, unknown>> = {}
  const box = (name: string) => (p: Record<string, unknown>) => {
    seen[name] = p
    return { $$typeof: Symbol.for('react.transitional.element'), type: 'div', key: null, ref: null, props: { children: p.children }, _owner: null, _store: {} }
  }
  return { seen, box }
})
vi.mock('@hanzo/gui', () => ({ SizableText: box('text'), XStack: box('xstack'), YStack: box('ystack') }))
vi.mock('@hanzo/ui', () => ({ DropdownMenuItem: box('item'), Switch: box('switch') }))

const { KeepAwake } = await import('./awake.tsx')

describe('Keep computer awake', () => {
  it('is toggled by its row alone: the switch shows the state and takes no press of its own', () => {
    const calls: boolean[] = []
    renderToStaticMarkup(h(KeepAwake, { on: false, onToggle: (on: boolean) => calls.push(on) }))
    expect(seen.switch).toMatchObject({ checked: false })
    expect(seen.switch).not.toHaveProperty('onCheckedChange')
    ;(seen.item!.onSelect as () => void)()
    expect(calls).toEqual([true])
  })
})
