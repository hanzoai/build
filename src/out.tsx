/**
 * A link out of the builder: a new tab, no handle back to this page, no
 * referrer. Only ever handed an https address the caller has already checked.
 */
import type { ReactNode } from 'react'

export function Out({ href, label, children }: { href: string; label?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      {children}
    </a>
  )
}
