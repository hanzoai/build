/**
 * Usage: the plan's windows and what each class of model has used of it, as
 * shares; the free allowance on Free; the balance with no plan. What happens
 * when a plan's allowance runs out is chosen here. Credits themselves — the
 * balance, top-ups, auto-reload, spend and its limit — are Billing's.
 */
import { YStack } from '@hanzo/gui'

import { useHost, useTarget } from '../host.tsx'
import { path } from '../route.ts'
import { useStanding } from '../standing.ts'
import { Reading } from './plan.tsx'
import { Heading, Soft } from './ui.tsx'

export function Usage() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const read = useStanding(t, signed)

  return (
    <YStack gap="$6">
      <Heading title="Usage" detail={`What ${host.org ?? 'this organization'}’s plan includes, and how much of it is used.`} />
      {!signed ? (
        <Soft>Sign in to see this organization’s usage.</Soft>
      ) : read.value ? (
        <Reading
          s={read.value}
          target={t}
          onPlans={() => host.go(path({ kind: 'screen', screen: 'plans' }))}
          onBilling={() => host.go(path({ kind: 'settings', section: 'billing' }))}
        />
      ) : (
        <Soft>{read.error ? read.error.message : 'Reading the plan…'}</Soft>
      )}
    </YStack>
  )
}
