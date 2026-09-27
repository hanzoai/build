/**
 * Where a click on this page may go.
 *
 * hanzo.build is this frontend. An address on this origin moves in the router.
 * github.com is the grant. platform.hanzo.ai is another product, and a click
 * that names it stays on this page.
 */
export type Step = { kind: 'stay' } | { kind: 'here'; path: string } | { kind: 'away'; href: string }

export function step(href: string, page: string): Step {
  let url: URL
  let here: URL
  try {
    here = new URL(page)
    url = new URL(href, here.origin)
  } catch {
    return { kind: 'stay' }
  }
  if (url.hostname === 'platform.hanzo.ai') return { kind: 'stay' }
  if (url.origin === here.origin) {
    const path = `${url.pathname}${url.search}${url.hash}`
    if (path === '/platform' || path.startsWith('/platform/')) return { kind: 'here', path: '/' }
    return { kind: 'here', path }
  }
  return { kind: 'away', href: url.href }
}

/** Take the step a click names: move in the router, leave for the grant, or stay. */
export function follow(href: string, page: string, to: { here: (path: string) => void; away: (href: string) => void }): void {
  const next = step(href, page)
  if (next.kind === 'here') to.here(next.path)
  else if (next.kind === 'away') to.away(next.href)
}
