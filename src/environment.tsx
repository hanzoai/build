/**
 * A codebase's environment: the install script, the start command and the
 * secrets a run exports, as /v1/environment holds them.
 *
 * A setup run's proposal is drawn in the editors until it is saved — saving is
 * the review. While a setup run on the codebase is still working the scripts are
 * its to find, so they cannot be edited. A member reads; an org admin saves and
 * sets secrets, which is the platform's rule and not a choice made here.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Plus, X } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, Input, Textarea } from '@hanzo/ui'
import { useEffect, useState } from 'react'

import { start } from './api/coding.ts'
import { plain, read, refuse, removeSecret, save, setSecret, SETUP, type Environment as Env } from './api/environment.ts'
import type { Home, Homes } from './api/work.ts'
import { useRead, type Read } from './data.ts'
import { matches } from './merge.ts'
import { useHost, useTarget } from './host.tsx'

const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)' }

export function Environment({ repo, busy }: { repo: string; busy: boolean }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  // Read again when a setup run on it stops, which is when its proposal lands.
  const env = useRead(signed && repo ? () => read(t, repo) : null, null as Env | null, [t, repo, signed, busy])
  const [install, setInstall] = useState('')
  const [startCmd, setStart] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)

  const shown = env.value
  useEffect(() => {
    if (!shown) return
    setInstall(shown.proposal?.install ?? shown.install)
    setStart(shown.proposal?.start ?? shown.start)
  }, [shown])

  if (!signed) {
    return <Soft>Sign in to see this codebase’s environment.</Soft>
  }
  if (!repo) {
    return <Soft>This run has no codebase, so it has no environment.</Soft>
  }
  if (env.error) {
    return <Soft>{`${repo}’s environment could not be read right now.`}</Soft>
  }
  if (!shown) {
    return <Soft>Reading the environment…</Soft>
  }

  const changed = install !== shown.install || startCmd !== shown.start || shown.proposal !== null
  const needed = (shown.proposal?.secrets ?? []).filter((n) => !shown.secrets.includes(n))
  const status = busy ? 'Setting up' : shown.state === 'proposed' ? 'Proposed' : shown.state === 'ready' ? 'Ready' : 'Not set up'

  /** One write, then the record read again. Answers whether it took. */
  const act = async (what: () => Promise<Env>, done = ''): Promise<boolean> => {
    setWorking(true)
    setNote('')
    try {
      await what()
      env.reload()
      setNote(done)
      return true
    } catch (e) {
      setNote(plain(e, repo, 'save'))
      return false
    } finally {
      setWorking(false)
    }
  }

  const setup = async () => {
    setWorking(true)
    setNote('')
    try {
      const run = await start(t, { prompt: SETUP, repo, mode: 'setup' })
      host.go(run.session)
    } catch (e) {
      setNote(plain(e, repo, 'start'))
      setWorking(false)
    }
  }

  const add = () => {
    const n = name.trim()
    const why = refuse(n) || (value ? '' : 'A secret needs a value')
    if (why) {
      setNote(why)
      return
    }
    void act(() => setSecret(t, repo, n, value), `${n} is set`).then((took) => {
      if (!took) return
      setAdding(false)
      setName('')
      setValue('')
    })
  }

  return (
    <YStack gap="$4">
      <XStack items="center" gap="$2">
        <SizableText flex={1} size="$4" color="$ink" numberOfLines={1}>
          {repo}
        </SizableText>
        <XStack items="center" gap="$1.5">
          <YStack width={6} height={6} rounded={999} bg={busy ? '$ink' : shown.state === 'ready' ? '$ink' : '$soft'} opacity={busy ? 1 : 0.7} />
          <SizableText size="$1" color="$soft">
            {status}
          </SizableText>
        </XStack>
        {host.admin ? (
          <Button size="sm" variant="outline" disabled={busy || working || !changed} onPress={() => void act(() => save(t, repo, { install, start: startCmd }), 'Saved')}>
            Save
          </Button>
        ) : null}
      </XStack>

      {shown.proposal?.note ? (
        <YStack gap="$1" px="$3" py="$2" rounded="$3" borderWidth={1} borderColor="$borderColor">
          <SizableText size="$1" color="$soft">
            What the setup agent found
          </SizableText>
          <SizableText size="$2" color="$ink" numberOfLines={8}>
            {shown.proposal.note}
          </SizableText>
        </YStack>
      ) : null}

      <Script
        label="Install Script"
        value={install}
        onChange={setInstall}
        locked={busy || !host.admin}
        hint={busy ? 'Install script editing will be available when the agent stops running' : 'pnpm install --frozen-lockfile'}
      />
      <Script
        label="Start Script"
        value={startCmd}
        onChange={setStart}
        locked={busy || !host.admin}
        hint={busy ? 'Start script editing will be available when the agent stops running' : 'pnpm dev'}
      />

      <YStack gap="$2">
        <XStack items="center" gap="$2">
          <SizableText size="$2" color="$ink" flex={1}>
            Secrets
          </SizableText>
          {host.admin ? (
            <Button size="sm" variant="outline" disabled={working} onPress={() => setAdding(true)}>
              <Plus size={14} />
              New Secret
            </Button>
          ) : null}
        </XStack>
        <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
          {shown.secrets.length === 0 && needed.length === 0 && !adding ? (
            <YStack py="$5" items="center">
              <SizableText size="$2" color="$soft">
                No secrets yet
              </SizableText>
            </YStack>
          ) : null}
          {shown.secrets.map((s, i) => (
            <XStack key={s} items="center" gap="$2" px="$3" py="$2" borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
              <SizableText flex={1} size="$2" color="$ink" style={mono}>
                {s}
              </SizableText>
              <SizableText size="$1" color="$soft">
                set
              </SizableText>
              {host.admin ? (
                <XStack render="button" aria-label={`Remove ${s}`} px="$1" onPress={() => void act(() => removeSecret(t, repo, s), `${s} is removed`)}>
                  <X size={14} />
                </XStack>
              ) : null}
            </XStack>
          ))}
          {needed.map((s) => (
            <XStack key={s} items="center" gap="$2" px="$3" py="$2" borderTopWidth={1} borderColor="$borderColor">
              <SizableText flex={1} size="$2" color="$ink" style={mono}>
                {s}
              </SizableText>
              <SizableText size="$1" color="$soft">
                needed, not set
              </SizableText>
              {host.admin ? (
                <XStack render="button" aria-label={`Set ${s}`} px="$1" onPress={() => { setAdding(true); setName(s) }}>
                  <Plus size={14} />
                </XStack>
              ) : null}
            </XStack>
          ))}
          {adding ? (
            <YStack gap="$2" px="$3" py="$3" borderTopWidth={shown.secrets.length || needed.length ? 1 : 0} borderColor="$borderColor">
              <Input value={name} onChangeText={setName} placeholder="NAME" aria-label="Secret name" autoCapitalize="characters" />
              <Input value={value} onChangeText={setValue} placeholder="Value" aria-label="Secret value" secureTextEntry />
              <XStack gap="$2" justify="flex-end">
                <Button size="sm" variant="ghost" onPress={() => { setAdding(false); setName(''); setValue('') }}>
                  Cancel
                </Button>
                <Button size="sm" disabled={working} onPress={add}>
                  Add secret
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </YStack>
        <SizableText size="$1" color="$soft">
          Values are sealed in KMS and exported to every run on this codebase. They are never shown again.
        </SizableText>
      </YStack>

      {shown.state === 'none' && !busy ? (
        <YStack gap="$2" items="flex-start">
          <Button size="sm" disabled={working} onPress={() => void setup()}>
            Set up with an agent
          </Button>
          <SizableText size="$1" color="$soft">
            An agent explores the codebase, installs and checks it, and proposes the scripts for you to review and save.
          </SizableText>
        </YStack>
      ) : null}
      {!host.admin ? (
        <SizableText size="$1" color="$soft">
          An org admin saves the environment and sets its secrets.
        </SizableText>
      ) : null}
      {note ? (
        <SizableText size="$1" color="$soft" role="status">
          {note}
        </SizableText>
      ) : null}
    </YStack>
  )
}

/**
 * New's offer to set a codebase up. An agent onboards it, or an org admin saves
 * it empty and writes the scripts by hand beside the next run.
 *
 * The repository is chosen from the org's own (the forge's, and every linked
 * repository's copy there), never typed: a name that is not one of them — a
 * board's key handed over as a codebase — is said so and cannot be set up.
 */
export function SetupDialog({
  repo,
  homes,
  open,
  onOpenChange,
  onStart,
  onSaved,
  onRepo,
}: {
  repo: string
  homes: Read<Homes>
  open: boolean
  onOpenChange: (o: boolean) => void
  onStart: (repo: string) => Promise<void>
  onSaved: (repo: string) => void
  onRepo: (home: Home) => void
}) {
  const host = useHost()
  const t = useTarget()
  const [chosen, setChosen] = useState(repo)
  const [q, setQ] = useState('')
  const [working, setWorking] = useState<'' | 'save' | 'start'>('')
  const [note, setNote] = useState('')
  const [last, setLast] = useState<'save' | 'start' | ''>('')
  useEffect(() => {
    if (!open) return
    setChosen(repo)
    setQ('')
    setNote('')
    setLast('')
  }, [open, repo])

  const list = homes.value.homes
  const home = list.find((h) => h.name.toLowerCase() === chosen.toLowerCase()) ?? null
  // A name the whole list does not hold is not the org's; with part of the list unread, the platform decides.
  const stranger = Boolean(chosen) && !home && homes.value.whole && !homes.loading
  const ready = Boolean(chosen) && !stranger && !homes.loading
  const shown = list.filter((h) => matches(q, h.label, h.name)).slice(0, 6)

  const run = async (what: 'save' | 'start') => {
    if (!ready) return
    // The org's own spelling of the name, when the list holds it.
    const repo = home?.name ?? chosen
    setWorking(what)
    setLast(what)
    setNote('')
    try {
      if (what === 'save') {
        await save(t, repo, { install: '', start: '' })
        onSaved(repo)
      } else {
        await onStart(repo)
        onOpenChange(false)
      }
    } catch (e) {
      setNote(plain(e, repo, what))
    } finally {
      setWorking('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={480} showCloseButton={false}>
        <XStack items="center" justify="space-between" gap="$2">
          <DialogTitle>Set up an environment</DialogTitle>
          <XStack render="button" aria-label="Close" p="$1" onPress={() => onOpenChange(false)}>
            <X size={16} />
          </XStack>
        </XStack>
        <YStack gap="$3">
          <YStack gap="$1.5">
            <SizableText size="$2" color="$soft">
              Repository
            </SizableText>
            <XStack px="$3" py="$2" rounded="$3" borderWidth={1} borderColor={stranger ? '$ink' : '$borderColor'} items="center" gap="$2" aria-label="Chosen repository">
              <SizableText size="$2" color={home || (chosen && !stranger) ? '$ink' : '$soft'} numberOfLines={1} flex={1} minW={0}>
                {home ? home.label : chosen || 'Choose a repository'}
              </SizableText>
            </XStack>
            {stranger ? (
              <SizableText size="$1" color="$ink" role="alert">
                {`${chosen} is not one of this organization’s repositories. Choose one below.`}
              </SizableText>
            ) : null}
            <Input value={q} onChangeText={setQ} placeholder="Find a repository…" aria-label="Find a repository" />
            <YStack gap={2} aria-label="Repositories">
              {homes.loading && !list.length ? (
                <SizableText size="$1" color="$soft">
                  Reading the repositories…
                </SizableText>
              ) : homes.error && !list.length ? (
                <XStack items="center" gap="$2" flexWrap="wrap">
                  <SizableText size="$1" color="$soft">
                    The repository list could not be read right now.
                  </SizableText>
                  <Button size="sm" variant="outline" onPress={homes.reload}>
                    Read again
                  </Button>
                </XStack>
              ) : shown.length === 0 ? (
                <SizableText size="$1" color="$soft">
                  {list.length ? 'Nothing matches.' : 'This organization has no repositories on the forge yet.'}
                </SizableText>
              ) : (
                shown.map((h) => {
                  const on = h.name.toLowerCase() === chosen.toLowerCase()
                  return (
                    <XStack
                      key={h.name}
                      render="button"
                      aria-pressed={on}
                      aria-label={`Choose ${h.label}`}
                      onPress={() => {
                        setChosen(h.name)
                        setNote('')
                        onRepo(h)
                      }}
                      px="$2.5"
                      py="$1.5"
                      rounded="$2"
                      bg={on ? '$hover' : 'transparent'}
                      hoverStyle={{ bg: '$hover' }}
                    >
                      <SizableText size="$2" color={on ? '$ink' : '$soft'} numberOfLines={1}>
                        {h.label}
                      </SizableText>
                    </XStack>
                  )
                })
              )}
            </YStack>
          </YStack>
          <SizableText size="$2" color="$soft">
            An agent onboards the codebase: it explores it, writes the install and start scripts, and names the secrets
            it needs. It takes several minutes. Interrupt it anytime, or take over in the terminal.
          </SizableText>
          {note ? (
            <XStack items="center" gap="$2" flexWrap="wrap">
              <SizableText size="$1" color="$ink" role="status" flex={1} minW={200}>
                {note}
              </SizableText>
              {last ? (
                <Button size="sm" variant="outline" disabled={working !== ''} onPress={() => void run(last)}>
                  Try again
                </Button>
              ) : null}
            </XStack>
          ) : null}
          <XStack gap="$2" justify="space-between" items="center">
            {host.admin ? (
              <Button size="sm" variant="secondary" disabled={working !== '' || !ready} onPress={() => void run('save')}>
                {working === 'save' ? 'Saving…' : 'Skip & save'}
              </Button>
            ) : (
              <YStack />
            )}
            <Button size="sm" variant="primary" disabled={working !== '' || !ready} onPress={() => void run('start')}>
              {working === 'start' ? 'Starting the agent…' : 'Start agent'}
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
  )
}

function Script({ label, value, onChange, locked, hint }: { label: string; value: string; onChange: (v: string) => void; locked: boolean; hint: string }) {
  return (
    <YStack gap="$2">
      <SizableText size="$2" color="$ink">
        {label}
      </SizableText>
      <Textarea
        value={value}
        onChangeText={onChange}
        disabled={locked}
        placeholder={hint}
        aria-label={label}
        rows={3}
        style={mono}
      />
    </YStack>
  )
}

function Soft({ children }: { children: string }) {
  return (
    <YStack py="$6" items="center">
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
        {children}
      </SizableText>
    </YStack>
  )
}
