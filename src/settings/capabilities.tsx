/**
 * Capabilities: what the agent may use, by where it comes from — connector
 * actions, functions, services, agents, skills and the organization's own MCP
 * servers. A tool that is off is still listed to the agent's discovery but is
 * refused when called. Switching a kind on turns on every tool of that kind;
 * off turns them all off. It is the organization's setting, not only yours.
 */
import { SizableText, YStack } from '@hanzo/gui'
import { Switch } from '@hanzo/ui'
import { useState } from 'react'

import { activate, SOURCES, tools, type Source, type Tool } from '../api/capabilities.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, Group, Heading, Note, Row, Soft } from './ui.tsx'

const KINDS: Record<Source, { label: string; about: string }> = {
  connector: { label: 'Connector actions', about: 'Actions in the apps your organization connected' },
  function: { label: 'Functions', about: 'Functions your organization wrote' },
  'zap-service': { label: 'Services', about: 'Routes of the services your organization runs' },
  agent: { label: 'Agents', about: 'Your organization’s agents, called as tools' },
  skill: { label: 'Skills', about: 'Skills attached to agents' },
  mcp: { label: 'MCP servers', about: 'Tools on the MCP servers your organization added' },
}

export function Capabilities() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => tools(t) : null, [] as Tool[], [t, signed])
  const [busy, setBusy] = useState<Source | ''>('')
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Capabilities" />
        <Soft>Sign in to see what the agent may use.</Soft>
      </YStack>
    )
  }

  const kinds = SOURCES.map((s) => ({ source: s, all: list.value.filter((x) => x.source === s) })).filter((k) => k.all.length)

  const flip = async (source: Source, all: Tool[], on: boolean) => {
    setBusy(source)
    setNote('')
    try {
      await activate(t, all.map((x) => x.name), on)
      list.reload()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That was not saved')
    } finally {
      setBusy('')
    }
  }

  return (
    <YStack gap="$6">
      <Heading
        title="Capabilities"
        detail={`What the agent may use in ${host.org ?? 'this organization'}. A tool that is off is refused when the agent calls it.`}
      />
      <Group
        title="Tools"
        detail={
          host.admin
            ? 'Switching a kind on or off applies to every tool of that kind, for everyone in the organization.'
            : 'An org admin switches these, for everyone in the organization.'
        }
      >
        {list.error ? (
          <Soft>{list.error.message}</Soft>
        ) : list.loading && !list.value.length ? (
          <Soft>Reading tools…</Soft>
        ) : !kinds.length ? (
          <Soft>No tools are available to this organization yet.</Soft>
        ) : (
          <Card>
            {kinds.map(({ source, all }, i) => {
              const on = all.filter((x) => x.activated).length
              return (
                <Row
                  key={source}
                  first={i === 0}
                  title={KINDS[source].label}
                  detail={`${KINDS[source].about}. ${on === all.length ? `All ${all.length} on` : on ? `${on} of ${all.length} on` : `${all.length} available, all off`}.`}
                  trailing={
                    host.admin ? (
                      <Switch
                        aria-label={KINDS[source].label}
                        checked={on === all.length}
                        disabled={busy !== ''}
                        onCheckedChange={(v: boolean) => void flip(source, all, v)}
                      />
                    ) : (
                      <SizableText size="$1" color="$soft">
                        {on === all.length ? 'On' : on ? 'Partly on' : 'Off'}
                      </SizableText>
                    )
                  }
                />
              )
            })}
          </Card>
        )}
      </Group>
      <Note>{note}</Note>
    </YStack>
  )
}
