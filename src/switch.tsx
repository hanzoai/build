/**
 * The rail's top left: the organization, and the projects under it.
 *
 * The account stays at the foot of the rail. Settings opens that account on
 * this page. Choosing an organization reloads this origin so every read is
 * scoped to it.
 */
import { YStack } from '@hanzo/gui'
import { MenuLabel, MenuRow, MenuRule, OrgSwitcher, type Org, type OrgScope } from '@hanzo/ui/product'

import { revealAccount } from './account.tsx'
import { projects, type Project } from './api/projects.ts'
import { useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { route } from './route.ts'

export function Where() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => projects(t) : null, [] as Project[], [t, signed])
  const here = route(host.path)
  const current = host.org || ''
  const scope: OrgScope = {
    currentOrg: () => current,
    setCurrentOrg: (next) => host.chooseOrg?.(next),
    isScopedAway: () => false,
    hasSelectedOrg: () => Boolean(current),
    enterOrg: (next) => host.chooseOrg?.(next),
    leaveOrg: () => undefined,
    switchOrg: (next) => host.chooseOrg?.(next),
  }
  const rows = (): Promise<Org[]> =>
    Promise.resolve((host.memberships ?? (current ? [current] : [])).map((name) => ({ name, displayName: name })))

  return (
    <OrgSwitcher
      scope={scope}
      orgs={(page) => (page === 0 ? rows() : Promise.resolve([]))}
      pageSize={50}
      search={false}
      heading="Organization"
      lead
      sub={here.kind === 'project' ? here.slug : undefined}
      current={current ? { name: current, displayName: current } : undefined}
      aria={current ? `Organization ${current}` : 'Organization'}
      footer={(close) => (
        <YStack gap="$1">
          {list.value.length > 0 ? (
            <>
              <MenuRule />
              <MenuLabel>Project</MenuLabel>
              <YStack role="radiogroup" aria-label="Projects" gap="$1">
                {list.value.slice(0, 12).map((p) => (
                  <MenuRow
                    key={p.slug}
                    label={p.name || p.slug}
                    active={here.kind === 'project' && here.slug === p.slug}
                    onPress={() => {
                      close()
                      host.go(p.slug)
                    }}
                  />
                ))}
              </YStack>
            </>
          ) : null}
          <MenuRule />
          <MenuRow
            label="Settings"
            onPress={() => {
              close()
              revealAccount()
            }}
          />
        </YStack>
      )}
    />
  )
}
