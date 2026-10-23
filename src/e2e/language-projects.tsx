/**
 * The builder's Projects in a language, for language-projects.spec.ts: the
 * builder as a host mounts it (no rail of its own), inside @hanzo/i18n's
 * provider, signed in as acme's admin and opened at `-/projects`.
 *
 * `window.lang` before the page loads (language.tsx `Lang`): the locale, and
 * the catalog the provider loads for it (the spec writes its own, so it reads
 * what it wrote).
 */
import '@hanzo/font/css'
import '@hanzo/ui/theme.css'
import '@hanzo/ui/styles/motion.css'
import '@hanzo/i18n/rtl.css'
import { I18nProvider } from '@hanzo/i18n/react'
import { Hanzo, YStack } from '@hanzo/ui'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Builder } from '../builder.tsx'
import type { Host } from '../host.tsx'

/** A token whose claims say acme's admin; the routed platform reads nothing else of it. */
const TOKEN = `x.${btoa(JSON.stringify({ sub: 'acme/dave', orgs: [{ org: 'acme', role: 'admin' }] })).replace(/=+$/, '')}.x`

function Mount() {
  const [path, setPath] = useState('-/projects')
  const host: Host = {
    name: 'Hanzo',
    api: window.location.origin,
    token: () => TOKEN,
    org: 'acme',
    person: { name: 'Dave', email: 'dave@acme.test', avatar: '' },
    admin: true,
    path,
    go: setPath,
    links: { github: '', customize: '', settings: '', home: '' },
    open: () => {},
  }
  return <Builder host={host} rail={false} />
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider userId="acme/dave" initialLocale={window.lang.locale} loadCatalog={async () => window.lang.catalog}>
    <Hanzo theme="dark">
      <YStack flex={1} minW={0} bg="$background" style={{ height: '100dvh', overflow: 'hidden' }}>
        <Mount />
      </YStack>
    </Hanzo>
  </I18nProvider>,
)
