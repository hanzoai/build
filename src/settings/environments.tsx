/**
 * Environments: every codebase in the organization that has one — what a sandbox
 * run does to its checkout before the agent starts, and the secrets it exports.
 * One opens in the same editor a run shows beside it. A member reads; an org
 * admin saves, sets secrets and forgets an environment, which is the platform's
 * rule and not a choice made here.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronLeft, ChevronRight } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { useState } from 'react'

import { environments, forget, type Environment as Env } from '../api/environment.ts'
import { Confirm } from '../ask.tsx'
import { useRead } from '../data.ts'
import { Environment } from '../environment.tsx'
import { useHost, useTarget } from '../host.tsx'
import { Card, Heading, Note, Row, Soft } from './ui.tsx'

const STATE: Record<Env['state'], string> = { none: 'Not set up', proposed: 'Proposed, waiting for review', ready: 'Ready' }

/** The line under a codebase: where it stands, its secrets, when it was saved. */
function about(e: Env): string {
  const parts = [STATE[e.state]]
  if (e.secrets.length) parts.push(e.secrets.length === 1 ? '1 secret' : `${e.secrets.length} secrets`)
  const when = e.updated ? new Date(e.updated) : null
  if (when && !Number.isNaN(when.getTime())) parts.push(`Updated ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`)
  return parts.join(' · ')
}

export function Environments() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => environments(t) : null, [] as Env[], [t, signed])
  const [open, setOpen] = useState('')
  const [forgetting, setForgetting] = useState(false)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Environments" />
        <Soft>Sign in to see your organization’s environments.</Soft>
      </YStack>
    )
  }

  if (open) {
    return (
      <YStack gap="$5">
        <XStack items="center" gap="$2">
          <Button size="sm" variant="ghost" onPress={() => setOpen('')}>
            <ChevronLeft size={14} /> All environments
          </Button>
          <XStack flex={1} />
          {host.admin ? (
            <Button size="sm" variant="outline" onPress={() => setForgetting(true)}>
              Forget
            </Button>
          ) : null}
        </XStack>
        <Environment repo={open} busy={false} />
        <Confirm
          open={forgetting}
          onOpenChange={setForgetting}
          title={`Forget ${open}’s environment?`}
          says="Later runs on this codebase start bare: its scripts are dropped and every secret it holds is removed from KMS. This cannot be undone."
          act="Forget"
          run={async () => {
            await forget(t, open)
            setNote(`${open}’s environment is forgotten`)
            setOpen('')
            list.reload()
          }}
        />
      </YStack>
    )
  }

  return (
    <YStack gap="$5">
      <Heading
        title="Environments"
        detail="What a sandbox run does to a codebase before its agent starts: the install script, the start command, and the secrets it exports."
      />
      {list.error ? (
        <Soft>{list.error.message}</Soft>
      ) : list.loading && list.value.length === 0 ? (
        <Soft>Reading environments…</Soft>
      ) : list.value.length === 0 ? (
        <Soft>No codebase has an environment yet. Set one up from New, or from a run’s Environment tab.</Soft>
      ) : (
        <Card>
          {list.value.map((e, i) => (
            <YStack
              key={e.repo}
              render="button"
              aria-label={`Open ${e.repo}`}
              onPress={() => {
                setNote('')
                setOpen(e.repo)
              }}
              cursor="pointer"
              hoverStyle={{ bg: '$hover' }}
              style={{ textAlign: 'left' }}
            >
              <Row first={i === 0} title={e.repo} detail={about(e)} trailing={<ChevronRight size={16} opacity={0.6} />} />
            </YStack>
          ))}
        </Card>
      )}
      {!host.admin ? (
        <SizableText size="$1" color="$soft">
          An org admin saves an environment and sets its secrets.
        </SizableText>
      ) : null}
      <Note>{note}</Note>
    </YStack>
  )
}
