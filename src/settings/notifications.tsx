/**
 * Notifications: the organization's webhooks. Each is an https address that
 * every matching event is POSTed to, signed with a secret shown once, when the
 * webhook is added. A test sends one signed event now; the log says what each
 * delivery got back.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Copy, Plus, Webhook, X } from '@hanzogui/lucide-icons-2'
import { Button, Input } from '@hanzo/ui'
import { useState } from 'react'

import { add, deliveries, endpoints, patterns, refuse, remove, test, type Attempt, type Endpoint } from '../api/webhooks.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, day, Field, Group, Heading, Note, Row, Soft } from './ui.tsx'

const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)' }

export function Notifications() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => endpoints(t) : null, [] as Endpoint[], [t, signed])
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState('')
  const [description, setDescription] = useState('')
  const [secret, setSecret] = useState('')
  const [log, setLog] = useState<{ id: string; rows: Attempt[] } | null>(null)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Notifications" />
        <Soft>Sign in to see this organization’s webhooks.</Soft>
      </YStack>
    )
  }

  const act = async (what: () => Promise<string>) => {
    setWorking(true)
    setNote('')
    try {
      setNote(await what())
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setWorking(false)
    }
  }

  const create = () => {
    const draft = { url, events: patterns(events), description }
    const why = refuse(draft)
    if (why) {
      setNote(why)
      return
    }
    void act(async () => {
      const e = await add(t, draft)
      setSecret(e.secret)
      setAdding(false)
      setUrl('')
      setEvents('')
      setDescription('')
      list.reload()
      return `${e.url} is added`
    })
  }

  const trial = (e: Endpoint) =>
    void act(async () => {
      const r = await test(t, e.id)
      if (log?.id === e.id) setLog({ id: e.id, rows: await deliveries(t, e.id) })
      return r.delivered
        ? `The test reached ${e.url}: ${r.status} in ${r.ms} ms`
        : `The test did not reach ${e.url}: ${r.error || (r.status ? `it answered ${r.status}` : 'no answer')}`
    })

  const drop = (e: Endpoint) =>
    void act(async () => {
      await remove(t, e.id)
      if (log?.id === e.id) setLog(null)
      list.reload()
      return `${e.url} is deleted`
    })

  const show = (e: Endpoint) => {
    if (log?.id === e.id) {
      setLog(null)
      return
    }
    void act(async () => {
      setLog({ id: e.id, rows: await deliveries(t, e.id) })
      return ''
    })
  }

  return (
    <YStack gap="$6">
      <Heading
        title="Notifications"
        detail={`Webhooks: events in ${host.org ?? 'this organization'}, POSTed and signed to an address you run.`}
        action={
          adding ? undefined : (
            <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
              <Plus size={14} /> Add webhook
            </Button>
          )
        }
      />

      {adding ? (
        <YStack gap="$3" p="$4" borderWidth={1} borderColor="$borderColor" rounded="$3">
          <Field label="Endpoint URL" hint="https only.">
            <Input value={url} onChangeText={setUrl} placeholder="https://example.com/hooks/hanzo" aria-label="Endpoint URL" autoCapitalize="none" inputMode="url" />
          </Field>
          <Field label="Events" hint="Subject patterns, comma separated, such as commerce.order.> — leave empty for every event.">
            <Input value={events} onChangeText={setEvents} placeholder="commerce.order.>, event.>" aria-label="Events" autoCapitalize="none" />
          </Field>
          <Field label="Description">
            <Input value={description} onChangeText={setDescription} placeholder="What this endpoint is for" aria-label="Description" />
          </Field>
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="ghost" onPress={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={working || !url.trim()} onPress={create}>
              Add webhook
            </Button>
          </XStack>
        </YStack>
      ) : null}

      {secret ? (
        <YStack gap="$2" p="$4" borderWidth={1} borderColor="$ink" rounded="$3">
          <SizableText size="$2" color="$ink">
            Signing secret
          </SizableText>
          <SizableText size="$1" color="$soft">
            Shown this once. Keep it where your endpoint checks each delivery’s signature.
          </SizableText>
          <XStack items="center" gap="$2">
            <SizableText flex={1} size="$2" color="$ink" style={{ ...mono, wordBreak: 'break-all' }} aria-label="Signing secret">
              {secret}
            </SizableText>
            <Button size="sm" variant="outline" onPress={() => void navigator.clipboard?.writeText(secret).then(() => setNote('The secret is copied'))}>
              <Copy size={14} /> Copy
            </Button>
            <XStack render="button" aria-label="Hide the secret" p="$1" onPress={() => setSecret('')}>
              <X size={14} />
            </XStack>
          </XStack>
        </YStack>
      ) : null}

      <Group title="Webhooks">
        {list.error ? (
          <Soft>{list.error.message}</Soft>
        ) : list.loading && !list.value.length ? (
          <Soft>Reading webhooks…</Soft>
        ) : list.value.length === 0 ? (
          <Card>
            <Soft>No webhooks yet.</Soft>
          </Card>
        ) : (
          <Card>
            {list.value.map((e, i) => (
              <YStack key={e.id} borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
                <Row
                  first
                  mono
                  leading={<Webhook size={16} />}
                  title={e.url}
                  detail={[
                    e.description,
                    e.events.length ? e.events.join(', ') : 'every event',
                    e.status === 'disabled' ? 'disabled' : '',
                    `${e.deliveries} delivered, ${e.failures} failed this week`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={
                    <XStack render="button" aria-label={`Delete ${e.url}`} p="$1" onPress={() => drop(e)}>
                      <X size={14} />
                    </XStack>
                  }
                />
                <XStack gap="$2" px="$3" pb="$2.5" flexWrap="wrap">
                  <Button size="sm" variant="outline" disabled={working} aria-label={`Send a test to ${e.url}`} onPress={() => trial(e)}>
                    Send test
                  </Button>
                  <Button size="sm" variant="ghost" disabled={working} aria-label={`Deliveries to ${e.url}`} onPress={() => show(e)}>
                    {log?.id === e.id ? 'Hide deliveries' : 'Deliveries'}
                  </Button>
                </XStack>
                {log?.id === e.id ? (
                  <YStack px="$3" pb="$3" gap="$1.5">
                    {log.rows.length === 0 ? (
                      <SizableText size="$1" color="$soft">
                        Nothing delivered yet.
                      </SizableText>
                    ) : (
                      log.rows.map((a, n) => (
                        <XStack key={`${a.at}-${n}`} gap="$3" items="baseline">
                          <SizableText size="$1" color={a.status === 'ok' ? '$ink' : '$soft'} width={64}>
                            {a.status === 'ok' ? 'OK' : a.status === 'failed' ? 'Failed' : 'Retrying'}
                          </SizableText>
                          <SizableText flex={1} size="$1" color="$soft" numberOfLines={1} style={mono}>
                            {`${a.subject}${a.code ? ` → ${a.code}` : ''}${a.error ? ` · ${a.error}` : ''}`}
                          </SizableText>
                          <SizableText size="$1" color="$soft" $max-sm={{ display: 'none' }}>
                            {day(a.at)}
                          </SizableText>
                        </XStack>
                      ))
                    )}
                  </YStack>
                ) : null}
              </YStack>
            ))}
          </Card>
        )}
      </Group>

      <Note>{note}</Note>
    </YStack>
  )
}
