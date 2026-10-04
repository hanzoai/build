/**
 * Machines: the organization's own computers a run can be sent to, beside the
 * Hanzo sandbox. `hanzo link` run on a machine registers it under its hostname
 * and keeps it online while it runs; one can also be registered here by hand.
 * The member who linked a machine, or an org admin, renames it, drains it,
 * mints its claim key or removes it.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { MoreHorizontal, Plus } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, DropdownMenu, Input } from '@hanzo/ui'
import { CopyButton } from '@hanzo/ui/product'
import { useEffect, useState } from 'react'

import { add, change, KINDS, key, live, machines, remove, type Kind, type Machine } from '../api/machines.ts'
import { Confirm, Rename } from '../ask.tsx'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, Field, Group, Heading, Note, Once, Row, Soft } from './ui.tsx'

const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)' }

/** What `hanzo link` needs, in the order it is typed on the machine. */
const LINK = ['hanzo login', 'hanzo link'].join('\n')

/** How often the list is read again, so a machine that comes up or goes quiet shows it: the agent's beat. */
const BEAT = 30_000

/** The list before its first answer; every answer is a new array, even an empty one. */
const UNREAD: Machine[] = []

/** The line under a machine: what it is, where, how big, and what it is doing. */
function about(m: Machine): string {
  const load = m.running ? `${m.running} running` : m.sessions ? `${m.sessions} runs` : ''
  const state = m.status === 'online' && !live(m) ? 'not seen yet' : m.status || 'unknown'
  return [state, m.kind, m.host && m.host !== m.label ? m.host : '', m.capacity, load].filter(Boolean).join(' · ')
}

function Dot({ m }: { m: Machine }) {
  const on = live(m)
  return (
    <YStack
      width={8}
      height={8}
      rounded={999}
      shrink={0}
      bg={on ? '$green10' : 'transparent'}
      borderWidth={on ? 0 : 1}
      borderColor={m.status === 'draining' ? '$yellow10' : '$soft'}
      aria-hidden
    />
  )
}

export function Machines() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(signed ? () => machines(t) : null, UNREAD, [t, signed])
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Machine | null>(null)
  const [removing, setRemoving] = useState<Machine | null>(null)
  const [keying, setKeying] = useState<Machine | null>(null)
  const [minted, setMinted] = useState<{ machine: Machine; key: string } | null>(null)
  const [note, setNote] = useState('')
  // Read again on the agent's beat; "Reading machines…" stays for the first read only.
  const again = list.reload
  useEffect(() => {
    if (!signed) return
    const id = setInterval(again, BEAT)
    return () => clearInterval(id)
  }, [again, signed])

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Machines" />
        <Soft>Sign in to see your organization’s machines.</Soft>
      </YStack>
    )
  }

  const drain = async (m: Machine, status: 'online' | 'draining') => {
    setNote('')
    try {
      await change(t, m.id, { status })
      setNote(status === 'draining' ? `${m.label} takes no new runs` : `${m.label} takes runs again`)
      list.reload()
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  return (
    <YStack gap="$6">
      <Heading title="Machines" detail="Your organization’s own computers. A run sent to one runs there instead of in the Hanzo sandbox." />

      <Group title="Link a machine" detail="Run these on it. It registers under its hostname, and stays online while hanzo link runs.">
        <XStack items="flex-start" gap="$2" px="$3" py="$2.5" rounded="$3" borderWidth={1} borderColor="$borderColor" bg="$raised">
          <SizableText flex={1} minW={0} size="$2" color="$ink" aria-label="Link commands" style={{ ...mono, whiteSpace: 'pre-wrap' }}>
            {LINK}
          </SizableText>
          <CopyButton value={LINK} label="Copy the commands" />
        </XStack>
        <XStack>
          <Button size="sm" variant="ghost" onPress={() => setAdding(true)}>
            <Plus size={14} /> Register one by hand
          </Button>
        </XStack>
      </Group>

      <Group title="Linked">
        {list.error ? (
          <Soft>{list.error.message}</Soft>
        ) : list.value === UNREAD ? (
          <Soft>Reading machines…</Soft>
        ) : list.value.length === 0 ? (
          <Soft>No machine is linked yet.</Soft>
        ) : (
          <Card>
            {list.value.map((m, i) => (
              <Row
                key={m.id}
                first={i === 0}
                leading={<Dot m={m} />}
                title={m.label}
                detail={about(m)}
                trailing={
                  <DropdownMenu
                    trigger={
                      <XStack render="button" aria-label={`Actions for ${m.label}`} px="$1.5" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
                        <MoreHorizontal size={16} />
                      </XStack>
                    }
                    items={[
                      { key: 'rename', label: 'Rename', onSelect: () => setRenaming(m) },
                      m.status === 'draining'
                        ? { key: 'online', label: 'Take runs again', onSelect: () => void drain(m, 'online') }
                        : { key: 'drain', label: 'Drain', description: 'Finish what it has, take nothing new', onSelect: () => void drain(m, 'draining') },
                      { key: 'key', label: 'Claim key', onSelect: () => setKeying(m) },
                      { type: 'separator' },
                      { key: 'remove', label: 'Remove', destructive: true, onSelect: () => setRemoving(m) },
                    ]}
                  />
                }
              />
            ))}
          </Card>
        )}
      </Group>
      <Note>{note}</Note>

      <Adding
        open={adding}
        onOpenChange={setAdding}
        onAdded={(m) => {
          setNote(`${m.label} is registered`)
          list.reload()
        }}
      />
      <Rename
        open={renaming !== null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename machine"
        name={renaming?.label ?? ''}
        // Each dialog acts only while it is open, which is while its machine is chosen.
        run={async (label) => {
          await change(t, renaming!.id, { label })
          setNote(`Renamed to ${label}`)
          list.reload()
        }}
      />
      <Confirm
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.label ?? 'this machine'}?`}
        says="Runs can no longer be sent to it, and its claim key stops working. Linking it again registers it anew."
        act="Remove"
        run={async () => {
          await remove(t, removing!.id)
          setNote(`${removing!.label} is removed`)
          list.reload()
        }}
      />
      <Confirm
        open={keying !== null}
        onOpenChange={(o) => !o && setKeying(null)}
        title={`Mint a claim key for ${keying?.label ?? 'this machine'}?`}
        says="A key it had before stops working, so a runner using it stops getting runs until it has the new one. The new key is shown once."
        act="Mint key"
        run={async () => {
          const k = await key(t, keying!.id)
          setMinted({ machine: keying!, key: k })
        }}
      />
      <Dialog open={minted !== null} onOpenChange={(o) => !o && setMinted(null)}>
        <DialogContent maxW={480} showCloseButton={false}>
          <DialogTitle>Claim key for {minted?.machine.label ?? ''}</DialogTitle>
          {minted ? (
            <Once value={minted.key} label="Claim key">
              <SizableText size="$1" color="$soft">
                A runner on this machine sends it as X-Target-Key when it claims the runs sent here, at POST
                /v1/agent/targets/{minted.machine.id}/claim.
              </SizableText>
            </Once>
          ) : null}
          <XStack justify="flex-end">
            <Button size="sm" onPress={() => setMinted(null)}>
              Done
            </Button>
          </XStack>
        </DialogContent>
      </Dialog>
    </YStack>
  )
}

/** Registering a machine by hand: its name, what it is, and the hostname its runs report. */
function Adding({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: (m: Machine) => void }) {
  const t = useTarget()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<Kind>('machine')
  const [hostname, setHostname] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const close = () => {
    if (working) return
    setLabel('')
    setKind('machine')
    setHostname('')
    setNote('')
    onOpenChange(false)
  }

  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const m = await add(t, { label, kind, host: hostname })
      setWorking(false)
      onAdded(m)
      close()
    } catch (e) {
      setNote((e as Error).message)
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent maxW={440} showCloseButton={false}>
        <DialogTitle>Register a machine</DialogTitle>
        <YStack gap="$3">
          <Field label="Name" hint="Left empty, it takes the hostname.">
            <Input value={label} onChangeText={setLabel} aria-label="Machine name" autoFocus />
          </Field>
          <Field label="Kind">
            <XStack flexWrap="wrap" gap="$1.5" role="radiogroup" aria-label="Kind">
              {KINDS.map((k) => (
                <XStack
                  key={k}
                  render="button"
                  role="radio"
                  aria-checked={k === kind}
                  aria-label={k}
                  onPress={() => setKind(k)}
                  px="$2.5"
                  py="$1"
                  rounded="$10"
                  borderWidth={1}
                  borderColor={k === kind ? '$ink' : '$borderColor'}
                >
                  <SizableText size="$1" color={k === kind ? '$ink' : '$soft'}>
                    {k}
                  </SizableText>
                </XStack>
              ))}
            </XStack>
          </Field>
          <Field label="Hostname" hint="Optional. What its runs report. hanzo link, signed in as you on a machine with this hostname, takes this row over.">
            <Input value={hostname} onChangeText={setHostname} aria-label="Hostname" autoCapitalize="none" />
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
            <Button size="sm" disabled={working} onPress={() => void save()}>
              Register
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
  )
}
