/**
 * The test every browser spec runs, and the layout check they share.
 *
 * `test` is Playwright's own, with the page's JavaScript coverage taken for the
 * builder's own modules — what the dev server serves under /src/ — and kept for
 * `pnpm cover` to merge with the unit tests' (cover/). Against a built site
 * there is no /src/, and nothing is kept.
 */
import { test as base, expect, type Page } from '@playwright/test'
import MCR from 'monocart-coverage-reports'

import { raw } from '../../cover/index.ts'

const report = MCR(raw('browser'))
const OURS = /^https?:\/\/[^/]+\/src\//

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.coverage.startJSCoverage({ resetOnNavigation: false })
    await use(page)
    // A page the test closed or crashed has nothing left to give.
    const scripts = await page.coverage.stopJSCoverage().catch(() => [])
    const ours = scripts.filter((s) => OURS.test(s.url))
    if (ours.length) await report.add(ours)
  },
})

export { expect }

/**
 * What a screen gets wrong at this size: the page scrolling sideways, text or a
 * control cut off at the window's edge, and a control another one sits on, so
 * a press lands on the wrong thing.
 *
 * Two things are made to scroll sideways in a box of their own that fits the
 * window, and are not cut off: text meant not to wrap (code, a diff, a log),
 * and a row of controls that scrolls (a strip of tabs). A column that scrolls
 * sideways is a pane too wide for its window, and counts. A dialog, menu or
 * drawer covers the page on purpose, so only controls in the same layer are
 * checked against each other.
 */
export async function cramped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    const out: string[] = []
    const name = (el: Element) => `${el.tagName} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}`
    // Drawn, and not see-through: an ancestor at opacity 0 hides a control until it is hovered.
    const shown = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })

    const wide = document.documentElement.scrollWidth
    if (wide > w + 1) out.push(`the page is ${wide}px wide`)

    const within = (r: DOMRect) => r.left >= -1 && r.right <= w + 1
    const scrolls = (el: Element) => {
      const pre = /^(pre|nowrap)/.test(getComputedStyle(el).whiteSpace)
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.overflowX === 'visible') continue
        return (s.overflowX === 'auto' || s.overflowX === 'scroll') && (pre || s.flexDirection === 'row') && within(a.getBoundingClientRect())
      }
      return false
    }

    // What is drawn last: text, a control, or an icon taken whole (its paths are clipped to it).
    const leaves = [...document.querySelectorAll('body *')].filter(
      (el) =>
        !(el instanceof SVGElement && el.ownerSVGElement) &&
        (!el.children.length || ['BUTTON', 'INPUT', 'svg'].includes(el.tagName) || el.getAttribute('role') === 'button'),
    )
    for (const el of leaves) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || !shown(el)) continue
      if (!within(r) && !scrolls(el)) out.push(`${name(el)} is cut off`)
    }

    // The part of an element that shows: its box cut by every ancestor that clips, and by the window.
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect()
      let [l, t, rt, b] = [Math.max(r.left, 0), Math.max(r.top, 0), Math.min(r.right, w), Math.min(r.bottom, h)]
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a)
        const c = a.getBoundingClientRect()
        if (s.overflowX !== 'visible') [l, rt] = [Math.max(l, c.left), Math.min(rt, c.right)]
        if (s.overflowY !== 'visible') [t, b] = [Math.max(t, c.top), Math.min(b, c.bottom)]
      }
      return rt - l > 1 && b - t > 1 ? { x: (l + rt) / 2, y: (t + b) / 2 } : null
    }
    // The layer an element is drawn in: the fixed box it sits in (a dialog, menu or drawer), or the page.
    const layer = (el: Element | null) => {
      for (let a = el; a; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return a
      return null
    }
    const control =
      'button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=switch], [role=tab], [role=menuitem], [role=option], [role=radio], [role=checkbox]'
    for (const el of document.querySelectorAll(control)) {
      if (!shown(el) || getComputedStyle(el).pointerEvents === 'none') continue
      const at = seen(el)
      if (!at) continue
      const top = document.elementFromPoint(at.x, at.y)
      if (!top || el.contains(top) || top.contains(el) || layer(top) !== layer(el)) continue
      out.push(`${name(top.closest(control) ?? top)} sits on ${name(el)}`)
    }
    return out
  })
}
