/**
 * API keys: your own keys for calling the Hanzo API from code — one secret key
 * for a server, one publishable key for a page's source. Creating one ends the
 * one before it, and a secret key is shown once, when it is made. A limit
 * narrows what a key reaches; it never reaches further than you do.
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
const FOR: Record<Kind, string> = {
  secret: 'For a server. It acts as you, so it never goes in a page.',
  publishable: 'Safe in a page’s source.',
}

/** The line under a key: what it is for, how it starts, what it reaches, when it was made. */
function about(type: Kind, k: Key | undefined): string {
  if (!k) return `${FOR[type]} None yet.`
  const when = k.created ? new Date(k.created) : null
  return [
    type === 'secret' && k.prefix ? `${k.prefix}…` : '',
    k.limit.length ? `Reaches ${k.limit.join(', ')}` : 'Unrestricted',
    when && !Number.isNaN(when.getTime()) ? `Created ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '',
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
  const [revoking, setRevoking] = useState<Kind | null>(null)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="API keys" />
        <Soft>Sign in to see your API keys.</Soft>
      </YStack>
    )
  }

  const held = (type: Kind) => list.value.find((k) => k.type === type)

  return (
    <YStack gap="$5">
      <Heading title="API keys" detail="Your own keys for calling api.hanzo.ai from code. You hold one of each; creating one ends the one before it." />
      {list.error ? (
        <Soft>{list.error.message}</Soft>
      ) : list.loading && list.value.length === 0 ? (
        <Soft>Reading your keys…</Soft>
      ) : (
        <Card>
          {KINDS.map((type, i) => {
            const k = held(type)
            return (
              <YStack key={type} borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
                <Row
                  first
                  title={NAME[type]}
                  detail={about(type, k)}
                  trailing={
                    <XStack gap="$1.5" shrink={0}>
                      {k ? (
                        <Button size="sm" variant="ghost" aria-label={`Revoke the ${type} key`} onPress={() => setRevoking(type)}>
                          Revoke
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" aria-label={`${k ? 'Rotate' : 'Create'} the ${type} key`} onPress={() => setMaking(type)}>
                        {k ? 'Rotate' : 'Create'}
                      </Button>
                    </XStack>
                  }
                />
                {type === 'publishable' && k?.key ? (
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
            )
          })}
        </Card>
      )}
      <Note>{note}</Note>

      <Making
        type={making}
        rotating={making ? Boolean(held(making)) : false}
        onClose={() => setMaking(null)}
        onMade={(m) => {
          setNote(`${NAME[m.type]} created`)
          list.reload()
        }}
      />
      <Confirm
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke your ${revoking ?? 'secret'} key?`}
        says="It stops working within a minute, and anything using it is refused until it has a new one."
        act="Revoke"
        // It acts only while it is open, which is while a type is chosen.
        run={async () => {
          await revoke(t, revoking!)
          setNote(`${NAME[revoking!]} revoked`)
          list.reload()
        }}
      />
    </YStack>
  )
}

/** Creating or rotating one key: an optional limit, then the key itself, once. */
function Making({ type, rotating, onClose, onMade }: { type: Kind | null; rotating: boolean; onClose: () => void; onMade: (m: Minted) => void }) {
  const t = useTarget()
  const [limit, setLimit] = useState('')
  const [made, setMade] = useState<Minted | null>(null)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const close = () => {
    if (working) return
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
      const m = await mint(t, type, list)
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
        <DialogTitle>{made ? `Your new ${made.type} key` : `${rotating ? 'Rotate' : 'Create'} your ${type ?? ''} key`}</DialogTitle>
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
            {rotating ? (
              <SizableText size="$2" color="$soft">
                The {type} key you have now stops working.
              </SizableText>
            ) : null}
            <Field label="Limit" hint="Optional. What it may reach, as kind:name — model:zen5, project:acme, product:commerce. Empty reaches whatever you do.">
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
                {rotating ? 'Rotate' : 'Create'}
              </Button>
            </XStack>
          </YStack>
        )}
      </DialogContent>
    </Dialog>
  )
}
