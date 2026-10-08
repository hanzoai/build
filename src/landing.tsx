/**
 * New: the empty state. A heading at the top of the column, and at the foot of
 * the pane the composer — where the run goes (Cloud: the sandbox with the
 * codebase's environment; or one of the org's machines, under remote control),
 * which repository and branch it starts from, and the ask itself.
 * Under it: attach, dictate, the mode, and the model and effort on the right.
 *
 * Sending starts a coding run on a project and opens it. A project is a
 * repository — the org's on the forge, or one its GitHub grants — so a run
 * names one, and an ask with none chosen opens the picker rather than making a
 * project up from its words. The choices a person made here are kept in this
 * browser, per org, so the next New starts where the last one did.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Cloud, Monitor } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { ModeSelect } from '@hanzo/ui/agents'
import { Composer } from '@hanzo/ui/chat'
import { BranchSelect, ChipSelect, FooterLink, HanzoMark, RepoSelect, type Repo as RowRepo } from '@hanzo/ui/product'
import { ModelPicker } from '@hanzo/ui/models'
import { useLimits } from '@hanzo/ui/product/useLimits'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { start, unhonoured, type Mode } from './api/coding.ts'
import { asRepo, chosen, codebases, one, type ForgeRepo } from './api/codebases.ts'
import { repos as githubRepos } from './api/github.ts'
import { read, SETUP, type Environment } from './api/environment.ts'
import { SetupDialog } from './environment.tsx'
import { ENSO, limits as readLimits, models } from './api/models.ts'
import { usePick } from './pick.ts'
import { ready, SANDBOX, type Place } from './api/places.ts'
import { asHub, isForge, isHub, type HubRepo } from './choice.ts'
import { useKept, usePlaces, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { pane } from './pane.ts'
import { usePrefs } from './prefs.tsx'
import { Publish, type Source } from './publish.tsx'
import { path } from './route.ts'
import { Attach, compose, Dictate, Files, type Attached } from './tools.tsx'

/** One vocabulary for the mode, on New and in a workspace. */
export const MODES = [
  { id: 'build', label: 'Build', hint: 'Edits, commits and pushes a branch' },
  { id: 'plan', label: 'Plan', hint: 'Plans the change and writes nothing' },
] as const

export const EFFORTS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
] as const

/** What a person chose last time, per org. */
interface Kept {
  repo: (RowRepo & { forge?: boolean; github?: boolean; clone?: string }) | null
  branch: string
  place: string
  mode: Mode
  model: string
  effort: string
  ask: string
}

const FIRST: Kept = { repo: null, branch: '', place: '', mode: 'build', model: ENSO, effort: 'medium', ask: '' }

const COLUMN = 768

/**
 * What was typed here and not sent, kept in this tab.
 *
 * Signing in leaves the page for hanzo.id and comes back (app/enter.ts), and the
 * sentence is still in the composer after. A draft its person SENT while signed
 * out is sent on the return: pressing Send was the ask, and the sign-in stood
 * between it and the run. Only this page writes `sent`, so no link can start a
 * run on somebody's behalf — an address carrying words only fills the composer.
 *
 * sessionStorage, because a draft belongs to the tab it was typed in and not to
 * the next person at this browser; a browser that refuses storage keeps it for
 * the life of the page, as before.
 */
export interface Unsent {
  draft: string
  files: Attached[]
  sent?: boolean
}

const UNSENT = 'hanzo.build.unsent'

let held: Unsent = { draft: '', files: [] }

function unsent(): Unsent {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(UNSENT) ?? 'null') as Unsent | null
    if (v && typeof v.draft === 'string' && Array.isArray(v.files)) return v
  } catch {
    /* a browser that refuses storage, or a value that is not ours */
  }
  return held
}

/** Hold what New has unsent, or forget it once there is nothing. */
export function hold(u: Unsent): void {
  held = u
  try {
    if (!u.draft && !u.files.length) window.sessionStorage.removeItem(UNSENT)
    else window.sessionStorage.setItem(UNSENT, JSON.stringify(u))
  } catch {
    /* kept for the life of the page */
  }
}

export function Landing({ onStarted }: { onStarted: (session: string) => void }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const { prefs } = usePrefs()
  const [stored, keep] = useKept<Kept | null>(`hanzo.build.new.${host.org ?? 'none'}`, null)
  // Nothing chosen here yet: start from the person's coding defaults (Settings → Code).
  const kept: Kept = stored ?? { ...FIRST, ...prefs.code }
  const set = (patch: Partial<Kept>) => keep({ ...kept, ...patch })

  const [was] = useState(unsent)
  const [draft, setDraft] = useState(kept.ask || was.draft)
  const [files, setFiles] = useState<Attached[]>(was.files)
  useEffect(() => hold({ draft, files }), [draft, files])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState<Source | null>(null)
  const [offering, setOffering] = useState(false)
  // The repository list is read again each time it opens; Refresh reads it again while open.
  const [picking, setPicking] = useState(false)
  const [round, setRound] = useState(0)

  // A codebase or an issue hands its words over once. Left in the kept choice,
  // every later visit to New would put them back.
  useEffect(() => {
    if (kept.ask) set({ ask: '' })
    // The handover is read on this mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const places = usePlaces(t, signed)
  const catalog = useRead(signed ? () => models(t) : null, [], [t, signed])
  const { limits } = useLimits(signed ? (signal) => readLimits(t, signal) : null, t)
  const [model, pickModel] = usePick(kept.model, (id) => set({ model: id }), catalog.value)
  // The chosen codebase's environment, so New can say when it has none yet.
  const codebase = isForge(kept.repo) ? kept.repo.name : ''
  const env = useRead(signed && codebase ? () => read(t, codebase) : null, null as Environment | null, [t, signed, codebase])
  const place: Place = places.value.find((p) => p.id === kept.place) ?? SANDBOX

  const known = useRef(new Map<string, ForgeRepo>())
  const hubs = useRef(new Map<string, HubRepo>())

  // The forge's codebases, then the repositories the org's GitHub installation
  // grants. A GitHub row is chosen as GitHub's address, so a run on it clones,
  // pushes and proposes on GitHub, where its people work. A GitHub read that
  // fails leaves the forge's list standing.
  const loadRepos = useCallback(
    async (q: string) => {
      const [page, hub] = await Promise.all([codebases(t, q), githubRepos(t, { q }).catch(() => null)])
      const repos = page.map(asRepo)
      for (const r of repos) known.current.set(r.name, r)
      const github = (hub?.repos ?? []).map(asHub)
      for (const r of github) hubs.current.set(r.full_name.toLowerCase(), r)
      return { repos: [...repos, ...github], next: null }
    },
    [t],
  )

  // Drawn only once a forge codebase is chosen; one the forge no longer lists offers its default branch.
  const home = kept.repo?.default_branch || 'main'
  const loadBranches = useCallback(
    async (q: string) => {
      const found = await one(t, codebase)
      const needle = q.trim().toLowerCase()
      const names = (found?.branches ?? [home]).filter((b) => !needle || b.toLowerCase().includes(needle))
      return { branches: names.map((name) => ({ name })), next: null }
    },
    [t, codebase, home],
  )

  // The composer sends only a draft with words in it, and not while a send is out.
  const send = async () => {
    if (!signed) {
      hold({ draft, files, sent: true })
      host.signIn?.()
      return
    }
    const repo = isForge(kept.repo) ? kept.repo : null
    const hub = isHub(kept.repo) ? kept.repo : null
    if (!repo && !hub) {
      setNote('Choose the project this run works on: a repository of this organization, or one on its GitHub.')
      setPicking(true)
      return
    }
    setBusy(true)
    setNote('')
    try {
      const run = await start(t, {
        prompt: compose(draft.trim(), files),
        // The name alone. The org rides the request, and a slash is not a repo name.
        // An empty base or place is not sent: the default branch, and the sandbox.
        repo: repo?.name ?? hub?.full_name,
        base: repo ? kept.branch : hub ? kept.branch || hub.default_branch : undefined,
        targetId: place.id,
        mode: kept.mode,
        model: model === ENSO ? undefined : model,
        effort: kept.effort,
      })
      setDraft('')
      setFiles([])
      onStarted(run.session)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // A draft sent while signed out goes once its person is in, and only once.
  const owed = useRef(was.sent === true)
  useEffect(() => {
    if (!signed || !owed.current || !draft.trim()) return
    owed.current = false
    void send()
    // Sent once, on the sign-in that it waited for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signed])

  /** Start the agent that finds this codebase's environment, and open it. A refusal is the dialog's to say. */
  const setup = async () => {
    const run = await start(t, { prompt: SETUP, repo: codebase, mode: 'setup' })
    onStarted(run.session)
  }

  // Cloud is the sandbox, set up by the chosen codebase's environment.
  const setUp =
    codebase && env.value
      ? env.value.state === 'ready'
        ? `${codebase} environment`
        : env.value.state === 'proposed'
          ? `${codebase} environment proposed`
          : `no ${codebase} environment yet`
      : ''
  const placeItems = useMemo(
    () =>
      (places.value.length ? places.value : [SANDBOX]).map((p) => ({
        id: p.id || 'sandbox',
        label: p.id ? p.label : 'Cloud',
        hint: p.id ? ['Remote control', p.status, p.capacity].filter(Boolean).join(' · ') : ['Hanzo sandbox', setUp].filter(Boolean).join(' · '),
        disabled: !ready(p),
        place: p,
      })),
    [places.value, setUp],
  )

  const branch = kept.branch || kept.repo?.default_branch || 'main'

  const head = (
    <XStack gap={6} items="center" flexWrap="wrap">
      <ChipSelect
        name="Where the run runs"
        icon={place.id ? <Monitor size={13} /> : <Cloud size={13} />}
        label={place.id ? place.label : 'Cloud'}
        chosen={placeItems.find((i) => i.place.id === place.id)}
        items={placeItems}
        onChange={(i) => set({ place: i.place.id })}
        placeholder="Search machines…"
        loading={places.loading}
        error={places.error?.message ?? null}
        footer={
          <YStack gap="$0.5">
            <SizableText size="$1" color="$ink">
              Set up remote control
            </SizableText>
            <SizableText size="$1" color="$soft">
              Run{' '}
              <SizableText size="$1" color="$ink" style={{ fontFamily: 'var(--f-mono, ui-monospace, monospace)' }}>
                hanzo link
              </SizableText>{' '}
              on a machine: it joins this list, and a run there uses its checkout and credentials.
            </SizableText>
          </YStack>
        }
      />
      <RepoSelect
        key={round}
        open={picking}
        onOpenChange={setPicking}
        value={isForge(kept.repo) || isHub(kept.repo) ? kept.repo : null}
        onChange={(r) => {
          const hub = (r as { github?: boolean }).github ? hubs.current.get((r.full_name ?? "").toLowerCase()) : undefined
          if (hub) {
            set({ repo: hub, branch: hub.default_branch })
            return
          }
          const row = known.current.get(r.name) ?? chosen(r)
          set({ repo: row, branch: row.default_branch })
        }}
        load={loadRepos}
        troubleshoot={{
          label: 'Missing a GitHub repository? Bring it onto the forge',
          onPress: () => host.go(path({ kind: 'screen', screen: 'sync' })),
        }}
        connect={
          <XStack justify="flex-end">
            <FooterLink label="Refresh list" onPress={() => setRound((n) => n + 1)} />
          </XStack>
        }
        note="Repositories on the forge and on your organization's GitHub. Type to search."
        action={{
          label: 'Add to project',
          onPress: (r) => {
            const row = known.current.get(r.name)
            setAdding({
              repo: row?.clone || `${t.api}/v1/git/${r.owner}/${r.name}.git`,
              title: row?.full_name || `${r.owner}/${r.name}`,
              ref: r.default_branch || 'main',
              name: r.name,
            })
          },
        }}
        placeholder="Choose a project"
        disabled={!signed}
      />
      {isForge(kept.repo) ? <BranchSelect value={branch} onChange={(b) => set({ branch: b })} load={loadBranches} /> : null}
      <Files files={files} onFiles={setFiles} />
    </XStack>
  )

  const foot = (
    // Wraps at phone width rather than clipping: every control stays reachable.
    <XStack flex={1} items="center" gap="$2" flexWrap="wrap" rowGap="$1">
      <Attach files={files} onFiles={setFiles} onNote={setNote} />
      <Dictate onText={(said) => setDraft((d) => (d ? `${d} ${said}` : said))} onNote={setNote} />
      <ModeSelect
        modes={MODES}
        value={kept.mode}
        onChange={(m) => set({ mode: m as Mode })}
        bg="transparent"
        minH={24}
        px="$1.5"
        self="center"
      />
      <XStack flex={1} />
      <ModelPicker
        quiet
        size="sm"
        name="Model"
        models={catalog.value}
        scope="chat"
        limits={limits}
        value={model}
        onChange={pickModel}
        loading={catalog.loading}
        error={catalog.error?.message ?? null}
      />
      <ChipSelect
        quiet
        name="Effort"
        label={EFFORTS.find((e) => e.id === kept.effort)?.label ?? 'Medium'}
        chosen={EFFORTS.find((e) => e.id === kept.effort) ?? null}
        items={EFFORTS}
        onChange={(e) => set({ effort: e.id })}
        placement="top-end"
        width={180}
      />
    </XStack>
  )

  return (
    // The question and the field that answers it sit together in the middle of the
    // page, as they do on claude.ai; a run's own page keeps its composer at the foot.
    <YStack flex={1} minH={0} minW={0} items="center" justify="center" px="$4" pb="$10" overflow="scroll">
      <YStack width="100%" maxW={COLUMN} gap="$5">
        <XStack role="heading" aria-level={1} justify="center" items="center" gap="$3" flexWrap="wrap">
          <HanzoMark size={26} />
          <SizableText size="$8" color="$ink" style={{ textAlign: 'center' }}>
            {prefs.callName ? `What’s up next, ${prefs.callName}?` : 'What’s up next?'}
          </SizableText>
        </XStack>
        <YStack gap="$2">
          {env.value && env.value.state !== 'ready' && !place.id ? (
            <XStack items="center" justify="space-between" gap="$3" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor">
              <SizableText size="$2" color="$ink" flex={1} minW={0}>
                {env.value.state === 'proposed'
                  ? `A proposed environment for ${codebase} is waiting for review.`
                  : `${codebase} has no environment yet, so every run starts it bare.`}
              </SizableText>
              {env.value.state === 'proposed' && env.value.session ? (
                <Button size="sm" variant="outline" onPress={() => host.go(env.value!.session)}>
                  Review
                </Button>
              ) : (
                <Button size="sm" onPress={() => setOffering(true)}>
                  Set up environment
                </Button>
              )}
            </XStack>
          ) : null}
          {note || unhonoured(kept.mode, place.id) ? (
            <SizableText size="$1" color="$soft" role="status">
              {note || unhonoured(kept.mode, place.id)}
            </SizableText>
          ) : null}
          <Composer
            inline
            {...pane}
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            busy={busy}
            placeholder="Describe a task or ask a question"
            label="Describe a task or ask a question"
            head={head}
            foot={foot}
          />
        </YStack>
      </YStack>
      <Publish source={adding} onClose={() => setAdding(null)} />
      {codebase ? (
        <SetupDialog
          repo={codebase}
          open={offering}
          onOpenChange={setOffering}
          onStart={setup}
          onSaved={() => {
            setOffering(false)
            env.reload()
          }}
        />
      ) : null}
    </YStack>
  )
}
