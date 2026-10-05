/**
 * API keys: your keys for calling the Hanzo API from code, as many as you need —
 * a secret key for a server, a publishable key for a page's source. Each is its
 * own credential: creating one never touches another, and revoking one stops only
 * that one. A secret key is shown once, when it is made. A limit narrows what a
 * key reaches; it never reaches further than you do.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@hanzo/ui'
import { CopyButton } from '@hanzo/ui/product'
import { useState } from 'react'

import { keys, KINDS, limits, mint, revoke, type Key, type Kind, type Minted } from '../api/keys.ts'
import { Confirm } from '../ask.tsx'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, Field, Heading, Note, Once, Row, Soft } from './ui.tsx'

const NAME: Record<Kind, string> = { secret: 'Secret key', publishable: 'Publishable key' }

/** The line under a key: its head, what it reaches, when it was made, and where it stands. */
function about(k: Key): string {
  const when = k.created ? new Date(k.created) : null
  return [
    k.type === 'secret' && k.prefix ? `${k.prefix}…` : '',
    k.type === 'publishable' ? 'Publishable' : '',
    k.limit.length ? `Reaches ${k.limit.join(', ')}` : 'Unrestricted',
    when && !Number.isNaN(when.getTime()) ? `Created ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '',
    k.status !== 'active' ? k.status[0].toUpperCase() + k.status.slice(1) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function Keys() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => keys(t) : null, [] as Key[], [t, signed])
  const [making, setMaking] = useState<Kind | null>(null)
  const [revoking, setRevoking] = useState<Key | null>(null)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="API keys" />
        <Soft>Sign in to see your API keys.</Soft>
      </YStack>
    )
  }

  return (
    <YStack gap="$5">
      <Heading title="API keys" detail="Your keys for calling api.hanzo.ai from code. Make one for each app; revoking one stops only that one." />
      <XStack gap="$2">
        {KINDS.map((type) => (
          <Button key={type} size="sm" variant="outline" aria-label={`Create a ${type} key`} onPress={() => setMaking(type)}>
            {`Create ${NAME[type].toLowerCase()}`}
          </Button>
        ))}
      </XStack>
      {list.error ? (
        <Soft>{list.error.message}</Soft>
      ) : list.loading && list.value.length === 0 ? (
        <Soft>Reading your keys…</Soft>
      ) : list.value.length === 0 ? (
        <Soft>No keys yet.</Soft>
      ) : (
        <Card>
          {list.value.map((k, i) => (
            <YStack key={k.id} borderTopWidth={i ? 1 : 0} borderColor="$borderColor" opacity={k.status === 'active' ? 1 : 0.55}>
              <Row
                first
                title={k.name || NAME[k.type]}
                detail={about(k)}
                trailing={
                  k.status === 'revoked' ? null : (
                    <Button size="sm" variant="ghost" aria-label={`Revoke ${k.name || k.id}`} onPress={() => setRevoking(k)}>
                      Revoke
                    </Button>
                  )
                }
              />
              {k.type === 'publishable' && k.key ? (
                <XStack items="center" gap="$2" px="$3" pb="$2.5">
                  <SizableText
                    flex={1}
                    minW={0}
                    size="$1"
                    color="$soft"
                    numberOfLines={1}
                    aria-label="Publishable key"
                    style={{ fontFamily: 'var(--f-mono, ui-monospace, monospace)' }}
                  >
                    {k.key}
                  </SizableText>
                  <CopyButton value={k.key} label="Copy publishable key" />
                </XStack>
              ) : null}
            </YStack>
          ))}
        </Card>
      )}
      <Note>{note}</Note>

      <Making
        type={making}
        onClose={() => setMaking(null)}
        onMade={(m) => {
          setNote(`${m.name || NAME[m.type]} created`)
          list.reload()
        }}
      />
      <Confirm
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke ${revoking?.name || 'this key'}?`}
        says="It stops working within a minute, and anything using it is refused. Your other keys keep working."
        act="Revoke"
        // It acts only while it is open, which is while a key is chosen.
        run={async () => {
          await revoke(t, revoking!.id)
          setNote(`${revoking!.name || NAME[revoking!.type]} revoked`)
          list.reload()
        }}
      />
    </YStack>
  )
}

/** Creating one key: a name and an optional limit, then the key itself, once. */
function Making({ type, onClose, onMade }: { type: Kind | null; onClose: () => void; onMade: (m: Minted) => void }) {
  const t = useTarget()
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [made, setMade] = useState<Minted | null>(null)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const close = () => {
    if (working) return
    setName('')
    setLimit('')
    setMade(null)
    setNote('')
    onClose()
  }

  // Pressed only in the open dialog, which is open only for a type.
  const go = async (type: Kind) => {
    setNote('')
    let list: string[]
    try {
      list = limits(limit)
    } catch (e) {
      setNote((e as Error).message)
      return
    }
    setWorking(true)
    try {
      const m = await mint(t, type, name, list)
      setMade(m)
      onMade(m)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={type !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent maxW={480} showCloseButton={false}>
        <DialogTitle>{made ? `Your new ${made.type} key` : `Create a ${type ?? ''} key`}</DialogTitle>
        {made ? (
          <YStack gap="$3">
            {made.type === 'secret' ? (
              <Once value={made.key} label="Secret key" />
            ) : (
              <XStack items="center" gap="$2" px="$3" py="$3" rounded="$3" borderWidth={1} borderColor="$borderColor" bg="$raised">
                <SizableText flex={1} minW={0} size="$2" color="$ink" style={{ fontFamily: 'var(--f-mono, ui-monospace, monospace)', wordBreak: 'break-all' }}>
                  {made.key}
                </SizableText>
                <CopyButton value={made.key} label="Copy publishable key" />
              </XStack>
            )}
            {made.limit.length ? (
              <SizableText size="$1" color="$soft">
                It reaches {made.limit.join(', ')} and nothing else.
              </SizableText>
            ) : null}
            <XStack justify="flex-end">
              <Button size="sm" onPress={close}>
                Done
              </Button>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$3">
            <Field label="Name" hint="What it is for, so you can tell it from your other keys.">
              <Input value={name} onChangeText={setName} placeholder="production" aria-label="Name" />
            </Field>
            <Field label="Limit" hint="Optional. What it may reach, as kind:name — model:zen5, project:acme, product:train, read:* for read-only. Empty reaches whatever you do.">
              <Input value={limit} onChangeText={setLimit} placeholder="model:zen5, project:acme" aria-label="Limit" autoCapitalize="none" />
            </Field>
            {note ? (
              <SizableText size="$1" color="$soft" role="status">
                {note}
              </SizableText>
            ) : null}
            <XStack gap="$2" justify="flex-end">
              <Button size="sm" variant="ghost" disabled={working} onPress={close}>
                Cancel
              </Button>
              <Button size="sm" disabled={working} onPress={() => void go(type!)}>
                Create
              </Button>
            </XStack>
          </YStack>
        )}
      </DialogContent>
    </Dialog>
  )
}
