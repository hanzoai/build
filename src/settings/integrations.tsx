/**
 * Integrations: your own GitHub connection, the GitHub accounts the
 * organization has installed the platform's App on, its Slack workspace, and
 * the social accounts its automations post to.
 *
 * Connecting leaves this page once, for GitHub's or Slack's own consent screen,
 * and the platform's callback brings the person back here with the answer
 * (../back.ts), which this page finishes and reports. Anyone connects their own
 * GitHub; installing the App and connecting Slack are an org admin's, which is
 * the platform's rule.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Github, Hash, Lock, Megaphone, Slack } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { useState } from 'react'

import { connect, connection, disconnect as unlinkGithub, installations, type Connection, type Installation } from '../api/github.ts'
import { authorize, channels, disconnect, read, SOCIAL, type Channels, type Connector } from '../api/provider.ts'
import { here, useBack } from '../back.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, day, Group, Heading, Note, Row, Soft } from './ui.tsx'

export function Integrations() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const mine = useRead(signed ? () => connection(t) : null, null as Connection | null, [t, signed])
  const installed = useRead(signed ? () => installations(t) : null, [] as Installation[], [t, signed])
  const slack = useRead(signed ? () => read(t, 'slack') : null, null as Connector | null, [t, signed])
  const joined = slack.value?.connected ?? false
  const rooms = useRead(signed && joined ? () => channels(t) : null, { channels: [], next: '' } as Channels, [t, signed, joined])
  const social = useSocial(signed, SOCIAL.map((p) => p.id))
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  useBack(t, signed, setNote, () => {
    mine.reload()
    installed.reload()
    slack.reload()
    social.reload()
  })

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Integrations" />
        <Soft>Sign in to see this organization’s integrations.</Soft>
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

  /** Off to the provider's consent page; it is the one hop away from this page. */
  const away = async (where: () => Promise<string>) => {
    setWorking(true)
    setNote('')
    try {
      host.open(await where())
    } catch (e) {
      setNote((e as Error).message)
      setWorking(false)
    }
  }

  const me = mine.value
  const s = slack.value

  return (
    <YStack gap="$6">
      <Heading title="Integrations" detail={`What ${host.org ?? 'this organization'} and you have connected.`} />

      <Group title="GitHub" detail="Your connection brings your repositories; the App brings an account’s to the organization.">
        <Card>
          <Row
            first
            leading={<Github size={16} />}
            title="Your GitHub"
            detail={
              mine.error
                ? mine.error.message
                : !me
                  ? 'Reading…'
                  : !me.configured
                    ? 'This deployment cannot connect GitHub yet.'
                    : me.connected
                      ? `Connected as @${me.login}`
                      : 'Not connected'
            }
            trailing={
              me?.configured ? (
                me.connected ? (
                  <Button size="sm" variant="outline" disabled={working} onPress={() => void act(() => unlinkGithub(t), 'Your GitHub is disconnected', mine.reload)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={working} onPress={() => void away(() => connect(t, here()))}>
                    Connect
                  </Button>
                )
              ) : null
            }
          />
          {installed.error ? (
            <Row title="App installations" detail={installed.error.message} />
          ) : (
            installed.value.map((i) => (
              <Row
                key={i.login}
                leading={<Github size={16} />}
                title={i.login}
                detail={[i.type, i.grant === 'all' ? 'every repository' : i.grant === 'selected' ? 'selected repositories' : ''].filter(Boolean).join(' · ')}
                trailing={
                  <SizableText size="$1" color={i.connected ? '$ink' : '$soft'}>
                    {i.connected ? 'Installed' : 'Removed on GitHub'}
                  </SizableText>
                }
              />
            ))
          )}
          {!installed.error && !installed.loading && installed.value.length === 0 ? (
            <Row title="No GitHub accounts installed" detail="Install the App on a GitHub account to bring its repositories here." />
          ) : null}
        </Card>
        {host.admin ? (
          <XStack>
            <Button size="sm" variant="outline" disabled={working} onPress={() => void away(() => authorize(t, 'github', here()))}>
              Install on a GitHub account
            </Button>
          </XStack>
        ) : (
          <SizableText size="$1" color="$soft">
            An org admin installs the App on a GitHub account.
          </SizableText>
        )}
      </Group>

      <Group title="Slack" detail="Talk to Hanzo from your workspace’s channels.">
        <Card>
          <Row
            first
            leading={<Slack size={16} />}
            title={s?.connected && s.account ? s.account : 'Slack'}
            detail={
              slack.error
                ? slack.error.message
                : !s
                  ? 'Reading…'
                  : s.connected
                    ? `Connected${s.since ? ` since ${day(s.since)}` : ''}`
                    : s.available
                      ? 'Not connected'
                      : s.note || 'This deployment cannot connect Slack yet.'
            }
            trailing={
              host.admin && s && (s.connected || s.available) ? (
                s.connected ? (
                  <Button size="sm" variant="outline" disabled={working} onPress={() => void act(() => disconnect(t, 'slack'), 'Slack is disconnected', slack.reload)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={working} onPress={() => void away(() => authorize(t, 'slack', here()))}>
                    Connect
                  </Button>
                )
              ) : null
            }
          />
          {joined && rooms.error ? <Row title="Channels" detail={rooms.error.message} /> : null}
          {joined
            ? rooms.value.channels.map((c) => (
                <Row
                  key={c.id}
                  leading={c.private ? <Lock size={14} /> : <Hash size={14} />}
                  title={c.name || c.id}
                  trailing={
                    <SizableText size="$1" color={c.member ? '$ink' : '$soft'}>
                      {c.member ? 'Joined' : 'Not joined'}
                    </SizableText>
                  }
                />
              ))
            : null}
        </Card>
        {!host.admin ? (
          <SizableText size="$1" color="$soft">
            An org admin connects the Slack workspace.
          </SizableText>
        ) : null}
      </Group>

      <Group title="Social accounts" detail="Where automations post what their agent writes.">
        <Card>
          {SOCIAL.map((p, i) => {
            const c = social.value[p.id]
            return (
              <Row
                key={p.id}
                first={i === 0}
                leading={<Megaphone size={16} />}
                title={c?.connected && c.account ? `${p.name} · ${c.account}` : p.name}
                detail={
                  social.error
                    ? social.error.message
                    : !c
                      ? 'Reading…'
                      : c.connected
                        ? `Connected${c.since ? ` since ${day(c.since)}` : ''}${p.takes ? `. ${p.takes}` : ''}`
                        : c.available
                          ? p.takes || 'Not connected'
                          : p.takes ? `${p.takes} ${p.needs}` : p.needs
                }
                trailing={
                  host.admin && c && (c.connected || c.available) ? (
                    c.connected ? (
                      <Button size="sm" variant="outline" disabled={working} onPress={() => void act(() => disconnect(t, p.id), `${p.name} is disconnected`, social.reload)}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={working} onPress={() => void away(() => authorize(t, p.id, here()))} aria-label={`Connect ${p.name}`}>
                        Connect
                      </Button>
                    )
                  ) : null
                }
              />
            )
          })}
        </Card>
        {!host.admin ? (
          <SizableText size="$1" color="$soft">
            An org admin connects the organization’s social accounts.
          </SizableText>
        ) : null}
      </Group>

      <Note>{note}</Note>
    </YStack>
  )
}

/**
 * The named social connectors, by id: whether each can be connected here and
 * whether it is. One that could not be read is left out, and its row reads on
 * as "Reading…" rather than taking the others with it.
 */
export function useSocial(signed: boolean, ids: readonly string[]) {
  const t = useTarget()
  const key = ids.join(',')
  return useRead(
    signed
      ? async () => {
          const got = await Promise.allSettled(ids.map((id) => read(t, id)))
          return Object.fromEntries(got.flatMap((r, i) => (r.status === 'fulfilled' ? [[ids[i]!, r.value] as const] : [])))
        }
      : null,
    {} as Record<string, Connector>,
    [t, signed, key],
  )
}
