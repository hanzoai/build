/**
 * Account: who is signed in, the organizations they belong to — the one this
 * page acts in, and a way to act in another — and signing out.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Check, LogOut } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'

import { useHost } from '../host.tsx'
import { Card, Group, Heading, Row, Soft } from './ui.tsx'

export function Account() {
  const host = useHost()
  const who = host.person
  if (!who) {
    return (
      <YStack gap="$5">
        <Heading title="Account" />
        <Soft>Sign in to see your account.</Soft>
        {host.signIn ? (
          <XStack justify="center">
            <Button size="sm" onPress={() => host.signIn?.()}>
              Sign in
            </Button>
          </XStack>
        ) : null}
      </YStack>
    )
  }
  const orgs = host.memberships ?? (host.org ? [host.org] : [])
  return (
    <YStack gap="$6">
      <Heading
        title="Account"
        detail="Your Hanzo identity. Every setting here acts in the organization you choose."
        action={
          host.signOut ? (
            <Button size="sm" variant="outline" onPress={() => host.signOut?.()}>
              <LogOut size={14} /> Sign out
            </Button>
          ) : undefined
        }
      />
      <XStack items="center" gap="$3">
        {who.avatar ? (
          <img src={who.avatar} alt="" width={40} height={40} style={{ borderRadius: 999 }} />
        ) : (
          <YStack width={40} height={40} rounded={999} bg="$raised" items="center" justify="center">
            <SizableText size="$4" color="$ink">
              {(who.name || who.email || '?').charAt(0).toUpperCase()}
            </SizableText>
          </YStack>
        )}
        <YStack flex={1} minW={0}>
          <SizableText size="$4" color="$ink" numberOfLines={1}>
            {who.name || who.email}
          </SizableText>
          {who.name && who.email ? (
            <SizableText size="$2" color="$soft" numberOfLines={1}>
              {who.email}
            </SizableText>
          ) : null}
        </YStack>
      </XStack>
      <Group title="Organizations" detail="Runs, codebases and settings belong to the organization this page acts in.">
        {orgs.length ? (
          <Card>
            {orgs.map((o, i) => (
              <Row
                key={o}
                first={i === 0}
                title={o}
                detail={o === host.org ? `Acting in ${o}${host.admin ? ' as an admin' : ''}` : undefined}
                trailing={
                  o === host.org ? (
                    <Check size={16} />
                  ) : host.chooseOrg ? (
                    <Button size="sm" variant="ghost" onPress={() => host.chooseOrg?.(o)}>
                      Switch
                    </Button>
                  ) : null
                }
              />
            ))}
          </Card>
        ) : (
          <Soft>You belong to no organization yet.</Soft>
        )}
      </Group>
    </YStack>
  )
}
