/**
 * Machines: the organization's own computers a run can be sent to, beside the
 * Hanzo sandbox. `hanzo link` run on a machine registers it under its hostname
 * and keeps it online while it runs; one can also be registered here by hand.
 * The member who linked a machine, or an org admin, renames it, drains it,
 * mints its claim key or removes it.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cloud,
  Cpu,
  HardDrive,
  Laptop,
  MoreHorizontal,
  Plus,
  Server,
  Terminal,
  Zap,
} from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, DropdownMenu, Input } from '@hanzo/ui'
import { CopyButton } from '@hanzo/ui/product'
import { useEffect, useState } from 'react'

import {
  add,
  change,
  formatBytes,
  formatPercent,
  formatRelative,
  key,
  KINDS,
  machines,
  remove,
  state,
  type Kind,
  type Machine,
} from '../api/machines.ts'
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
  return [state(m) || 'unknown', m.kind, m.host && m.host !== m.label ? m.host : '', m.capacity, load].filter(Boolean).join(' · ')
}

function Dot({ m }: { m: Machine }) {
  const on = state(m) === 'online'
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

function KindIcon({ kind, size = 16 }: { kind: string; size?: number }) {
  switch (kind) {
    case 'laptop':
      return <Laptop size={size} />
    case 'gpu':
      return <Cpu size={size} />
    case 'cloud':
      return <Cloud size={size} />
    case 'cluster':
      return <Server size={size} />
    default:
      return <Terminal size={size} />
  }
}

function StatusBadge({ m }: { m: Machine }) {
  const s = state(m)
  if (!s) return null
  let color: '$green10' | '$yellow10' | '$blue10' | '$soft' = '$soft'
  let text = s
  if (s === 'online') {
    color = '$green10'
    text = 'Online'
  } else if (s === 'draining') {
    color = '$yellow10'
    text = 'Draining'
  } else if (s === 'not seen yet') {
    color = '$blue10'
    text = 'Not seen yet'
  } else if (s === 'offline') {
    color = '$soft'
    text = 'Offline'
  }
  return (
    <XStack px="$2" py="$0.5" rounded="$10" borderWidth={1} borderColor={color} items="center" gap="$1.5">
      <Dot m={m} />
      <SizableText size="$1" color={color} style={{ fontWeight: 500 }}>
        {text}
      </SizableText>
    </XStack>
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAdvancedLink, setShowAdvancedLink] = useState(false)
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

        <XStack items="center" justify="space-between" flexWrap="wrap" gap="$2">
          <XStack items="center" gap="$2">
            <Button size="sm" variant="ghost" onPress={() => setAdding(true)}>
              <Plus size={14} /> Register one by hand
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setShowAdvancedLink(!showAdvancedLink)}>
              {showAdvancedLink ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAdvancedLink ? 'Hide options' : 'More connection options'}
            </Button>
          </XStack>
          <SizableText size="$1" color="$soft">
            Supported: macOS, Linux, Windows, NVIDIA CUDA GPUs, Cloud VMs
          </SizableText>
        </XStack>

        {showAdvancedLink ? (
          <YStack gap="$2.5" p="$3" rounded="$3" borderWidth={1} borderColor="$borderColor" bg="$raised">
            <YStack gap="$1">
              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                1. Background daemon (system service)
              </SizableText>
              <SizableText size="$1" color="$soft">
                Run worker continuously in the background without keeping a terminal open:
              </SizableText>
              <XStack items="center" justify="space-between" px="$2.5" py="$1.5" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor">
                <SizableText size="$1" color="$ink" style={mono}>
                  hanzo code --serve
                </SizableText>
                <CopyButton value="hanzo code --serve" label="Copy daemon command" />
              </XStack>
            </YStack>

            <YStack gap="$1" pt="$1">
              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                2. Install CLI from shell
              </SizableText>
              <XStack items="center" justify="space-between" px="$2.5" py="$1.5" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor">
                <SizableText size="$1" color="$ink" style={mono}>
                  curl -fsSL https://hanzo.sh | sh
                </SizableText>
                <CopyButton value="curl -fsSL https://hanzo.sh | sh" label="Copy install command" />
              </XStack>
            </YStack>
          </YStack>
        ) : null}
      </Group>

      <Group title="Linked">
        {list.value === UNREAD ? (
          <Soft>{list.error ? list.error.message : 'Reading machines…'}</Soft>
        ) : list.value.length === 0 ? (
          <YStack gap="$3">
            <Soft>No machine is linked yet.</Soft>
            <Card>
              <YStack p="$4" gap="$3">
                <XStack items="center" gap="$2.5">
                  <Server size={20} />
                  <YStack gap="$0.5">
                    <SizableText size="$3" color="$ink" style={{ fontWeight: 600 }}>
                      Connect your first computer or GPU server
                    </SizableText>
                    <SizableText size="$2" color="$soft">
                      Execute code, runs, and local models directly on your hardware with full privacy and zero cloud fees.
                    </SizableText>
                  </YStack>
                </XStack>
                <YStack gap="$2" pt="$1">
                  <XStack items="center" gap="$2">
                    <SizableText size="$1" color="$soft" style={{ ...mono, width: 20 }}>
                      1.
                    </SizableText>
                    <SizableText size="$2" color="$ink">
                      Install Hanzo CLI: <span style={mono}>curl -fsSL https://hanzo.sh | sh</span>
                    </SizableText>
                  </XStack>
                  <XStack items="center" gap="$2">
                    <SizableText size="$1" color="$soft" style={{ ...mono, width: 20 }}>
                      2.
                    </SizableText>
                    <SizableText size="$2" color="$ink">
                      Sign in with your account: <span style={mono}>hanzo login</span>
                    </SizableText>
                  </XStack>
                  <XStack items="center" gap="$2">
                    <SizableText size="$1" color="$soft" style={{ ...mono, width: 20 }}>
                      3.
                    </SizableText>
                    <SizableText size="$2" color="$ink">
                      Link the machine: <span style={mono}>hanzo link</span>
                    </SizableText>
                  </XStack>
                </YStack>
                <XStack pt="$1">
                  <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
                    <Plus size={14} /> Register one by hand
                  </Button>
                </XStack>
              </YStack>
            </Card>
          </YStack>
        ) : (
          <Card>
            {list.value.map((m, i) => {
              const isExpanded = expandedId === m.id
              const hasTelemetry = Boolean(m.metrics || m.spec)
              return (
                <YStack key={m.id} borderTopWidth={i > 0 ? 1 : 0} borderColor="$borderColor">
                  <Row
                    first={i === 0}
                    leading={
                      <XStack items="center" gap="$2">
                        <Dot m={m} />
                        <KindIcon kind={m.kind} size={16} />
                      </XStack>
                    }
                    title={m.label}
                    detail={about(m)}
                    trailing={
                      <XStack items="center" gap="$2">
                        <StatusBadge m={m} />
                        {m.serving ? (
                          <XStack px="$1.5" py="$0.5" rounded="$10" borderWidth={1} borderColor="$green10">
                            <SizableText size="$1" color="$green10">
                              Serving
                            </SizableText>
                          </XStack>
                        ) : null}
                        {m.running > 0 ? (
                          <XStack px="$1.5" py="$0.5" rounded="$10" bg="$raised" items="center" gap="$1">
                            <Activity size={12} color="$green10" />
                            <SizableText size="$1" color="$ink">
                              {m.running} active
                            </SizableText>
                          </XStack>
                        ) : null}
                        <CopyButton value={`hanzo link --target ${m.id}`} label={`Copy link command for ${m.label}`} />
                        <DropdownMenu
                          trigger={
                            <XStack render="button" aria-label={`Actions for ${m.label}`} px="$1.5" py="$1" rounded="$2" hoverStyle={{ bg: '$hover' }}>
                              <MoreHorizontal size={16} />
                            </XStack>
                          }
                          items={[
                            { key: 'details', label: isExpanded ? 'Hide details' : 'Show details', onSelect: () => setExpandedId(isExpanded ? null : m.id) },
                            { key: 'rename', label: 'Rename', onSelect: () => setRenaming(m) },
                            m.status === 'draining'
                              ? { key: 'online', label: 'Take runs again', onSelect: () => void drain(m, 'online') }
                              : { key: 'drain', label: 'Drain', description: 'Finish what it has, take nothing new', onSelect: () => void drain(m, 'draining') },
                            { key: 'key', label: 'Claim key', onSelect: () => setKeying(m) },
                            { type: 'separator' },
                            { key: 'remove', label: 'Remove', destructive: true, onSelect: () => setRemoving(m) },
                          ]}
                        />
                      </XStack>
                    }
                  />

                  {/* Telemetry and specs panel */}
                  {isExpanded || hasTelemetry ? (
                    <YStack px="$4" pb="$3" pt="$1" gap="$2.5">
                      {/* Specs bar */}
                      {m.spec ? (
                        <XStack flexWrap="wrap" gap="$2" items="center">
                          {m.spec.os ? (
                            <XStack px="$2" py="$1" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor" items="center" gap="$1.5">
                              <Terminal size={12} />
                              <SizableText size="$1" color="$ink">
                                {m.spec.os}{m.spec.arch ? ` · ${m.spec.arch}` : ''}
                              </SizableText>
                            </XStack>
                          ) : null}
                          {m.spec.cpus ? (
                            <XStack px="$2" py="$1" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor" items="center" gap="$1.5">
                              <Cpu size={12} />
                              <SizableText size="$1" color="$ink">
                                {m.spec.cpus} cores
                              </SizableText>
                            </XStack>
                          ) : null}
                          {m.spec.memory ? (
                            <XStack px="$2" py="$1" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor" items="center" gap="$1.5">
                              <HardDrive size={12} />
                              <SizableText size="$1" color="$ink">
                                {formatBytes(m.spec.memory)} RAM
                              </SizableText>
                            </XStack>
                          ) : null}
                          {m.spec.gpus && m.spec.gpus.length > 0 ? (
                            <XStack px="$2" py="$1" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor" items="center" gap="$1.5">
                              <Zap size={12} color="$yellow10" />
                              <SizableText size="$1" color="$ink">
                                {m.spec.gpus.map((g) => `${g.model || g.vendor || 'GPU'}${g.memory ? ` (${formatBytes(g.memory)})` : ''}`).join(', ')}
                              </SizableText>
                            </XStack>
                          ) : null}
                        </XStack>
                      ) : null}

                      {/* Live Metrics */}
                      {m.metrics && (m.metrics.cpuUtil || m.metrics.load1 || m.metrics.memUsed || m.metrics.gpuUtil) ? (
                        <XStack flexWrap="wrap" gap="$3" p="$2.5" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor" items="center">
                          {m.metrics.cpuUtil ? (
                            <YStack gap="$0.5">
                              <SizableText size="$1" color="$soft">
                                CPU Utilization
                              </SizableText>
                              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                                {formatPercent(m.metrics.cpuUtil)} {m.metrics.cpuTemp ? `· ${m.metrics.cpuTemp}°C` : ''}
                              </SizableText>
                            </YStack>
                          ) : m.metrics.load1 ? (
                            <YStack gap="$0.5">
                              <SizableText size="$1" color="$soft">
                                Load (1m, 5m, 15m)
                              </SizableText>
                              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                                {m.metrics.load1}, {m.metrics.load5 ?? 0}, {m.metrics.load15 ?? 0}
                              </SizableText>
                            </YStack>
                          ) : null}

                          {m.metrics.memUsed ? (
                            <YStack gap="$0.5">
                              <SizableText size="$1" color="$soft">
                                Memory
                              </SizableText>
                              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                                {formatBytes(m.metrics.memUsed)} {m.spec?.memory ? `/ ${formatBytes(m.spec.memory)}` : 'used'}
                              </SizableText>
                            </YStack>
                          ) : null}

                          {m.metrics.gpuUtil !== undefined && m.metrics.gpuUtil > 0 ? (
                            <YStack gap="$0.5">
                              <SizableText size="$1" color="$soft">
                                GPU
                              </SizableText>
                              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                                {formatPercent(m.metrics.gpuUtil)} {m.metrics.gpuTemp ? `· ${m.metrics.gpuTemp}°C` : ''} {m.metrics.gpuPower ? `· ${m.metrics.gpuPower}W` : ''}
                              </SizableText>
                            </YStack>
                          ) : null}

                          {m.metrics.model ? (
                            <YStack gap="$0.5">
                              <SizableText size="$1" color="$soft">
                                Serving Model
                              </SizableText>
                              <SizableText size="$2" color="$ink" style={{ fontWeight: 600 }}>
                                {m.metrics.model} {m.metrics.decode ? `(${m.metrics.decode} tok/s)` : ''}
                              </SizableText>
                            </YStack>
                          ) : null}
                        </XStack>
                      ) : null}

                      {/* Quick Commands & Details */}
                      <XStack justify="space-between" items="center" flexWrap="wrap" gap="$2" pt="$0.5">
                        <XStack items="center" gap="$3">
                          <SizableText size="$1" color="$soft" style={mono}>
                            ID: {m.id}
                          </SizableText>
                          {m.seen ? (
                            <SizableText size="$1" color="$soft">
                              Last heartbeat: {formatRelative(m.seen)}
                            </SizableText>
                          ) : null}
                        </XStack>
                        <XStack items="center" gap="$2">
                          <SizableText size="$1" color="$soft">
                            Run directly on this machine:
                          </SizableText>
                          <XStack items="center" gap="$1" px="$2" py="$0.5" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor">
                            <SizableText size="$1" color="$ink" style={mono}>
                              hanzo run --target {m.id}
                            </SizableText>
                            <CopyButton value={`hanzo run --target ${m.id}`} label={`Copy run command for ${m.label}`} />
                          </XStack>
                        </XStack>
                      </XStack>
                    </YStack>
                  ) : null}
                </YStack>
              )
            })}
          </Card>
        )}
        {list.error && list.value !== UNREAD ? <Soft>{list.error.message}</Soft> : null}
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
            <YStack gap="$3">
              <Once value={minted.key} label="Claim key">
                <SizableText size="$1" color="$soft">
                  A runner on this machine sends it as X-Target-Key when it claims the runs sent here, at POST
                  /v1/agent/targets/{minted.machine.id}/claim.
                </SizableText>
              </Once>

              <YStack gap="$1" p="$2.5" rounded="$2" bg="$raised" borderWidth={1} borderColor="$borderColor">
                <SizableText size="$1" color="$ink" style={{ fontWeight: 600 }}>
                  Start background worker with this key:
                </SizableText>
                <XStack items="center" justify="space-between" px="$2" py="$1" rounded="$2" bg="$raised">
                  <SizableText size="$1" color="$ink" style={mono}>
                    export HANZO_TARGET_KEY="{minted.key}"
                  </SizableText>
                  <CopyButton value={`export HANZO_TARGET_KEY="${minted.key}"\nhanzo code --serve --target ${minted.machine.id}`} label="Copy key command" />
                </XStack>
              </YStack>
            </YStack>
          ) : null}
          <XStack justify="flex-end" pt="$2">
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
  const [capacity, setCapacity] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const close = () => {
    if (working) return
    setLabel('')
    setKind('machine')
    setHostname('')
    setCapacity('')
    setNote('')
    onOpenChange(false)
  }

  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const targetLabel = label.trim() || hostname.trim()
      if (!targetLabel) throw new Error('A machine needs a name or a hostname')
      const m = await add(t, { label: targetLabel, kind, host: hostname, capacity: capacity.trim() || undefined })
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
      <DialogContent maxW={460} showCloseButton={false}>
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
                  items="center"
                  gap="$1.5"
                >
                  <KindIcon kind={k} size={14} />
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
          <Field label="Capacity / Hardware" hint="Optional human summary (e.g. 16 vCPU / 64G / 1× RTX 4090).">
            <Input value={capacity} onChangeText={setCapacity} aria-label="Capacity" placeholder="e.g. 16 vCPU / 64G / 1× RTX 4090" />
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
