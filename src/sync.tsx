/**
 * Bring repositories the GitHub connection already grants onto the forge.
 *
 * The list is GET /v1/provider/github/repos. The queue is POST
 * /v1/provider/github/repos/import, which mirrors `owner/name` into this
 * organization's forge in the background. An account named unread and holding
 * no repositories is shown as needing an organization admin.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Check, ChevronLeft, ChevronRight, Plus, X } from '@hanzogui/lucide-icons-2'
import { Button, Input } from '@hanzo/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { accounts, bring, connect, grants, type Grant, type Grants } from './api/github.ts'
import { readPending, writePending, type Pending } from './choice.ts'
import { useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { path } from './route.ts'

const EMPTY: Grants = { repos: [], unread: [] }

function noteOf(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

export function Sync() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('')
  const [step, setStep] = useState<'pick' | 'access'>('pick')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const list = useRead(signed ? () => grants(t) : null, EMPTY, [t, signed])
  const rows = list.value.repos
  const orgs = useMemo(() => accounts(list.value), [list.value])
  const needle = q.trim().toLowerCase()
  const shownOrgs = orgs.filter((a) => !needle || a.name.toLowerCase().includes(needle))
  const ofOwner = rows.filter((r) => r.owner === owner)
  const shownRepos = ofOwner.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.fullName.toLowerCase().includes(needle))
  const chosen = rows.filter((r) => picked.includes(r.fullName))
  const lead = chosen[0]?.name ?? ''
  const more = Math.max(0, chosen.length - 1)
  const dest = host.org || 'Forge'

  const toggle = (fullName: string) => {
    setPicked((cur) => (cur.includes(fullName) ? cur.filter((n) => n !== fullName) : [...cur, fullName]))
  }

  const selectShown = () => {
    const names = shownRepos.map((r) => r.fullName)
    const all = names.every((n) => picked.includes(n))
    setPicked((cur) => (all ? cur.filter((n) => !names.includes(n)) : [...new Set([...cur, ...names])]))
  }

  const addOrg = async () => {
    setError('')
    try {
      const url = await connect(t)
      host.open(url)
    } catch (e) {
      setError(noteOf(e, 'Could not open the GitHub connection'))
    }
  }

  const send = async () => {
    setBusy(true)
    setError('')
    try {
      await bring(t, picked)
      const next: Pending[] = [
        ...readPending(host.org).filter((p) => !picked.includes(p.fullName)),
        ...chosen.map((r) => ({ fullName: r.fullName, name: r.name })),
      ]
      writePending(host.org, next)
      setSyncing(true)
    } catch (e) {
      setError(noteOf(e, 'Could not queue those repositories'))
    } finally {
      setBusy(false)
    }
  }

  const back = () => {
    host.go(path({ kind: 'screen', screen: 'codebases' }))
  }

  useEffect(() => {
    if (!syncing) return
    let stop = false
    const tick = async () => {
      try {
        const g = await grants(t)
        const landed = new Set(g.repos.filter((r) => r.imported).map((r) => r.fullName))
        const left = readPending(host.org).filter((p) => !landed.has(p.fullName))
        writePending(host.org, left)
        if (!stop && picked.every((n) => landed.has(n))) back()
      } catch {
        /* the button stays on Syncing until the next look */
      }
    }
    const id = window.setInterval(() => void tick(), 4000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [syncing, t, host.org, host.go, picked])

  return (
    <YStack flex={1} minH={0} overflow="scroll">
      <XStack px="$6" pt="$5" pb="$2" gap="$2" items="center">
        <XStack render="button" aria-label="Back to codebases" onPress={back}>
          <SizableText size="$2" color="$soft">
            Codebase
          </SizableText>
        </XStack>
        <SizableText size="$2" color="$soft">
          /
        </SizableText>
        <SizableText size="$2" color="$ink">
          Sync
        </SizableText>
      </XStack>
      <YStack flex={1} items="center" justify="center" px="$6" pb="$10" gap="$5">
        <XStack justify="center" gap="$6">
          <Step label="Select repositories" done={step === 'access'} current={step === 'pick'} />
          <Step label="Repository access" done={false} current={step === 'access'} />
        </XStack>
        <YStack borderWidth={1} borderColor="$borderColor" rounded="$5" bg="$panel" px="$6" py="$6" gap="$4" width="100%" maxW={460}>
          {step === 'pick' && !owner ? (
            <>
              <YStack gap="$1" items="center">
                <SizableText size="$5" color="$ink">
                  Select repositories
                </SizableText>
                <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
                  Choose repositories to bring into {dest}
                </SizableText>
              </YStack>
              <Panel>
                <Input value={q} onChangeText={setQ} placeholder="Search organizations" aria-label="Search organizations" disabled={!signed} />
                {signed ? (
                  <SizableText size="$1" color="$soft">
                    {`${orgs.length} ${orgs.length === 1 ? 'organization' : 'organizations'}`}
                  </SizableText>
                ) : null}
                {list.error ? <Soft>{list.error.message}</Soft> : null}
                {!signed ? (
                  <Soft>Sign in to choose repositories the GitHub connection can read.</Soft>
                ) : list.loading && rows.length === 0 && orgs.length === 0 ? (
                  <Soft>Reading the connection…</Soft>
                ) : shownOrgs.length === 0 ? (
                  <Soft>{orgs.length === 0 ? 'No organizations on this connection yet.' : 'Nothing matches.'}</Soft>
                ) : (
                  shownOrgs.map((a) => (
                    <XStack
                      key={a.name}
                      render="button"
                      aria-label={a.blocked ? `${a.name} needs an organization admin` : `Open ${a.name}`}
                      disabled={a.blocked}
                      items="center"
                      gap="$2"
                      py="$2"
                      borderTopWidth={1}
                      borderColor="$borderColor"
                      onPress={() => {
                        setOwner(a.name)
                        setQ('')
                      }}
                    >
                      <SizableText flex={1} size="$2" color={a.blocked ? '$soft' : '$ink'} numberOfLines={1}>
                        {a.name}
                      </SizableText>
                      {a.blocked ? (
                        <SizableText size="$1" color="$soft">
                          Needs organization admin
                        </SizableText>
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </XStack>
                  ))
                )}
                <XStack render="button" aria-label="Add organization" items="center" gap="$2" py="$2" onPress={() => void addOrg()} disabled={!signed}>
                  <Plus size={14} />
                  <SizableText size="$2" color="$ink">
                    Add organization
                  </SizableText>
                </XStack>
              </Panel>
            </>
          ) : null}
          {step === 'pick' && owner ? (
            <>
              <YStack gap="$1" items="center">
                <SizableText size="$5" color="$ink">
                  Select repositories
                </SizableText>
                <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
                  Choose repositories to bring into {dest}
                </SizableText>
              </YStack>
              <Panel>
                <XStack items="center" gap="$2">
                  <XStack render="button" aria-label="All organizations" onPress={() => setOwner('')}>
                    <ChevronLeft size={16} />
                  </XStack>
                  <SizableText flex={1} size="$2" color="$ink" numberOfLines={1}>
                    {owner}
                  </SizableText>
                </XStack>
                <Input value={q} onChangeText={setQ} placeholder="Search repositories" aria-label="Search repositories" />
                <XStack justify="space-between" items="center">
                  <SizableText size="$1" color="$soft">
                    {ofOwner.length} {ofOwner.length === 1 ? 'repository' : 'repositories'}
                  </SizableText>
                  <XStack render="button" aria-label="Select all" onPress={selectShown} disabled={shownRepos.length === 0}>
                    <SizableText size="$1" color="$ink">
                      Select all
                    </SizableText>
                  </XStack>
                </XStack>
                {shownRepos.length === 0 ? (
                  <Soft>Nothing matches.</Soft>
                ) : (
                  shownRepos.map((r) => (
                    <RepoRow key={r.fullName} repo={r} on={picked.includes(r.fullName)} onPress={() => toggle(r.fullName)} />
                  ))
                )}
                <XStack render="button" aria-label="Grant more repositories" items="center" gap="$2" py="$2" onPress={() => void addOrg()}>
                  <Plus size={14} />
                  <SizableText size="$2" color="$ink">
                    Add repositories
                  </SizableText>
                </XStack>
              </Panel>
            </>
          ) : null}
          {step === 'access' ? (
            <>
              <YStack gap="$1" items="center">
                <SizableText size="$5" color="$ink">
                  Repository access
                </SizableText>
                <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
                  Review who can read these repositories
                </SizableText>
              </YStack>
              <XStack gap="$2" items="center">
                <XStack flex={1} items="center" gap="$2" px="$3" py="$2" rounded="$3" borderWidth={1} borderColor="$borderColor">
                  <XStack render="button" aria-label="Clear the selection" onPress={() => { setPicked([]); setStep('pick') }}>
                    <X size={12} />
                  </XStack>
                  <SizableText flex={1} size="$2" color="$ink" numberOfLines={1}>
                    {more ? `${lead}, +${more} more` : lead}
                  </SizableText>
                </XStack>
                <Button size="sm" variant="outline" onPress={() => setStep('pick')}>
                  Edit
                </Button>
              </XStack>
              <XStack justify="space-between" gap="$4">
                <YStack gap="$1">
                  <SizableText size="$1" color="$soft">
                    Who gets access
                  </SizableText>
                  <SizableText size="$2" color="$ink">
                    {host.person?.name || host.person?.email || 'You'} · You
                  </SizableText>
                </YStack>
                <YStack gap="$1" items="flex-end">
                  <SizableText size="$1" color="$soft">
                    Role
                  </SizableText>
                  <SizableText size="$2" color="$ink">
                    {host.admin ? 'Repository admin' : 'Member'}
                  </SizableText>
                </YStack>
              </XStack>
              <SizableText size="$2" color="$soft" style={{ textAlign: 'center' }}>
                Anyone with access to {dest}
              </SizableText>
            </>
          ) : null}
          {error ? <Soft>{error}</Soft> : null}
          {step === 'pick' ? (
            <Button width="100%" disabled={!owner || picked.length === 0} onPress={() => setStep('access')}>
              Continue
            </Button>
          ) : (
            <YStack gap="$3" items="center" width="100%">
              <Button width="100%" disabled={busy || syncing || picked.length === 0} onPress={() => void send()}>
                {syncing || busy ? 'Syncing…' : `Sync ${picked.length} ${picked.length === 1 ? 'repository' : 'repositories'} to ${dest}`}
              </Button>
              {syncing ? null : (
                <XStack render="button" aria-label="Sync later" onPress={back}>
                  <SizableText size="$2" color="$soft">
                    Sync later
                  </SizableText>
                </XStack>
              )}
            </YStack>
          )}
          {!signed ? (
            <Button width="100%" onPress={() => host.signIn?.()}>
              Sign in
            </Button>
          ) : null}
        </YStack>
      </YStack>
    </YStack>
  )
}

function Step({ label, done, current }: { label: string; done: boolean; current: boolean }) {
  return (
    <XStack items="center" gap="$2">
      <YStack
        width={14}
        height={14}
        rounded={999}
        bg={done ? '$green10' : 'transparent'}
        borderWidth={1}
        borderColor={done || current ? '$ink' : '$borderColor'}
        items="center"
        justify="center"
      >
        {done ? <Check size={10} color="white" /> : null}
      </YStack>
      <SizableText size="$1" color={current || done ? '$ink' : '$soft'}>
        {label}
      </SizableText>
    </XStack>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" px="$3" py="$2" gap="$2" maxH={360} overflow="scroll">
      {children}
    </YStack>
  )
}

function Soft({ children }: { children: string }) {
  return (
    <SizableText size="$2" color="$soft">
      {children}
    </SizableText>
  )
}

function RepoRow({ repo, on, onPress }: { repo: Grant; on: boolean; onPress: () => void }) {
  return (
    <XStack
      render="button"
      aria-label={on ? `Selected ${repo.name}` : `Select ${repo.name}`}
      aria-pressed={on}
      items="center"
      gap="$2"
      py="$2"
      borderTopWidth={1}
      borderColor="$borderColor"
      onPress={onPress}
    >
      <YStack width={14} height={14} rounded="$1" borderWidth={1} borderColor={on ? '$ink' : '$borderColor'} bg={on ? '$ink' : 'transparent'} />
      <SizableText flex={1} size="$2" color="$ink" numberOfLines={1}>
        {repo.name}
      </SizableText>
      {repo.imported ? (
        <SizableText size="$1" color="$soft">
          On Forge
        </SizableText>
      ) : null}
    </XStack>
  )
}
