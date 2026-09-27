/**
 * Members: who is in the organization and in what role, and — for an org admin —
 * who has been invited, inviting someone by email, and withdrawing an invitation.
 * IAM holds both lists and decides who may read and write them.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { UserPlus } from '@hanzogui/lucide-icons-2'
import { Button, Input } from '@hanzo/ui'
import { useState } from 'react'

import { EMAIL, invitations, invite, revoke, roster, type Invitation, type Member } from '../api/members.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, day, Group, Heading, Note, Row, Soft } from './ui.tsx'

const ROLE = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const

function Initial({ name }: { name: string }) {
  return (
    <YStack width={28} height={28} rounded={999} bg="$raised" items="center" justify="center" shrink={0}>
      <SizableText size="$2" color="$ink">
        {(name || '?').charAt(0).toUpperCase()}
      </SizableText>
    </YStack>
  )
}

export function Members() {
  const host = useHost()
  const t = useTarget()
  const org = host.org ?? ''
  const signed = Boolean(host.person && org)
  const people = useRead(signed ? () => roster(t, org) : null, [] as Member[], [t, org, signed])
  const asked = useRead(signed && host.admin ? () => invitations(t, org) : null, [] as Invitation[], [t, org, signed, host.admin])
  const [email, setEmail] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Members" />
        <Soft>{host.person ? 'Choose an organization to see its members.' : 'Sign in to see this organization’s members.'}</Soft>
      </YStack>
    )
  }

  const act = async (what: () => Promise<unknown>, done: string, after: () => void) => {
    setWorking(true)
    setNote('')
    try {
      await what()
      after()
      setNote(done)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const send = () => {
    const address = email.trim()
    // Invite is offered only once something is typed.
    if (!EMAIL.test(address)) {
      setNote(`${address} is not an email address`)
      return
    }
    void act(() => invite(t, org, address), `${address} is invited. IAM sends no email: share the code with them.`, () => {
      setEmail('')
      asked.reload()
    })
  }

  const open = asked.value.filter((i) => i.state === 'Active' && i.used < i.seats)

  return (
    <YStack gap="$6">
      <Heading title="Members" detail={`The people who can act in ${org}, and the role each one holds.`} />

      <Group title="Members" detail={people.value.length ? `${people.value.length} in ${org}` : undefined}>
        {people.error ? (
          <Soft>{people.error.message}</Soft>
        ) : people.loading && !people.value.length ? (
          <Soft>Reading members…</Soft>
        ) : people.value.length === 0 ? (
          <Card>
            <Soft>No one is on this organization’s roster yet.</Soft>
          </Card>
        ) : (
          <Card>
            {people.value.map((m, i) => (
              <Row
                key={m.user}
                first={i === 0}
                leading={<Initial name={m.name} />}
                title={m.name}
                detail={[m.user, m.since ? `since ${day(m.since)}` : ''].filter(Boolean).join(' · ')}
                trailing={
                  <SizableText size="$1" color={m.role === 'member' ? '$soft' : '$ink'}>
                    {ROLE[m.role]}
                  </SizableText>
                }
              />
            ))}
          </Card>
        )}
      </Group>

      {host.admin ? (
        <Group title="Invitations" detail="An invitation is a one-seat code for one address, redeemed when that person signs up.">
          <Card>
            <XStack gap="$2" items="center" px="$3" py="$3" flexWrap="wrap">
              <YStack flex={1} minW={200}>
                <Input value={email} onChangeText={setEmail} placeholder="name@company.com" aria-label="Email to invite" inputMode="email" autoCapitalize="none" />
              </YStack>
              <Button size="sm" disabled={working || !email.trim()} onPress={send}>
                <UserPlus size={14} /> Invite
              </Button>
            </XStack>
            {asked.error ? (
              <YStack borderTopWidth={1} borderColor="$borderColor">
                <Soft>{asked.error.message}</Soft>
              </YStack>
            ) : null}
            {asked.value.map((i) => (
              <Row
                key={i.name}
                title={i.email || i.name}
                mono={!i.email}
                detail={[
                  i.code ? `Code ${i.code}` : '',
                  `${i.used} of ${i.seats} joined`,
                  i.state !== 'Active' ? i.state.toLowerCase() || 'not redeemable' : '',
                  day(i.created) ? `invited ${day(i.created)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <Button size="sm" variant="ghost" disabled={working} aria-label={`Revoke the invitation for ${i.email || i.name}`} onPress={() => void act(() => revoke(t, i), 'The invitation is withdrawn', asked.reload)}>
                    Revoke
                  </Button>
                }
              />
            ))}
          </Card>
          {!asked.loading && !asked.error && asked.value.length > 0 && open.length === 0 ? (
            <SizableText size="$1" color="$soft">
              Every invitation has been used or stopped.
            </SizableText>
          ) : null}
        </Group>
      ) : (
        <SizableText size="$1" color="$soft">
          An org admin invites people and sees the open invitations.
        </SizableText>
      )}

      <Note>{note}</Note>
    </YStack>
  )
}
