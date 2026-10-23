/**
 * New: the empty state. A heading at the top of the column, and at the foot of
 * the pane the composer — where the run goes (Cloud: the sandbox with the
 * codebase's environment; or one of the org's machines, under remote control),
 * which repository and branch it starts from, and the ask itself — the one
 * composer Chat draws too (prompt.tsx): attach and the mode at its start, the
 * model and effort, dictation and send at its end.
 *
 * Sending starts a coding run on a project and opens it. A project is a
 * repository — the org's on the forge, or one its GitHub grants — so a run
 * names one, and an ask with none chosen opens the picker rather than making a
 * project up from its words. The choices a person made here are kept in this
 * browser, per org, so the next New starts where the last one did.
 *
 * Its words are the reader's language (@hanzo/i18n `t`, the target is
 * `target`); a codebase's, a machine's and a branch's names are drawn as given.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { phrase } from '@hanzo/i18n'
import { useI18n } from '@hanzo/i18n/react'
import { Cloud, Monitor } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { BranchSelect, ChipSelect, FooterLink, RepoSelect, type Repo as RowRepo } from '@hanzo/ui/product'
import { useLimits } from '@hanzo/ui/product/useLimits'
import { useDictation, useTalk, useVoice } from '@hanzo/voice'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { start, unhonoured, type Mode } from './api/coding.ts'
import { asRepo, chosen, codebases, one, type ForgeRepo } from './api/codebases.ts'
import { repos as githubRepos } from './api/github.ts'
import { plain, read, SETUP, unset, type Environment } from './api/environment.ts'
import { homes as readHomes, type Home, type Homes } from './api/work.ts'
import { SetupDialog } from './environment.tsx'
import { limits as readLimits } from './api/models.ts'
import { ready, SANDBOX, type Place } from './api/places.ts'
import { asHub, isForge, isHub, settle, type HubRepo } from './choice.ts'
import { useCached, useKept, usePlaces, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { useMind } from './mind.ts'
import { usePrefs } from './prefs.tsx'
import { Publish, type Source } from './publish.tsx'
import { path } from './route.ts'
import { useCarry } from './carry.tsx'
import { DEV_MODES } from './gear.ts'
import { book, hand, Suggestions, taken, useSuggestions } from './suggestions.tsx'
import type { Act } from './suggest.ts'
import { want } from './library.tsx'
import { MEASURE, Prompt, useEar } from './prompt.tsx'
import { Monitor as Device } from '@hanzogui/lucide-icons-2'
import { compose, Files, pick, read as readFiles, type Attached } from './tools.tsx'
import { useSpoken } from './voice.ts'

/** One vocabulary for the mode, on New and in a workspace: English, marked (`phrase`), drawn through `t`. */
export const MODES = [
  { id: 'build', label: phrase('Build'), hint: phrase('Edits, commits and pushes a branch') },
  { id: 'plan', label: phrase('Plan'), hint: phrase('Plans the change and writes nothing') },
] as const

/** What a person chose last time, per org. */
interface Kept {
  repo: (RowRepo & { forge?: boolean; github?: boolean; clone?: string }) | null
  branch: string
  place: string
  mode: Mode
  ask: string
  /** The issue the handed-over words are, by the number the run's pull request closes; 0 for none. */
  issue: number
}

/** The org's repositories before they have been read: no answer, so nothing is judged from it. */
const NOHOMES: Homes = { homes: [], whole: false }

const FIRST: Kept = { repo: null, branch: '', place: '', mode: 'build', ask: '', issue: 0 }

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
  const target = useTarget()
  const { t } = useI18n()
  const signed = Boolean(host.person)
  const { prefs, save: savePrefs } = usePrefs()
  const [stored, keep] = useKept<Partial<Kept> | null>(`hanzo.build.new.${host.org ?? 'none'}`, null)
  // What was chosen here, over the person's coding defaults (Settings → Code), over
  // the first run's. Field by field: a codebase or an issue handed over from its own
  // screen keeps only the codebase and the words, and the rest still has a value.
  const kept = settle(FIRST, prefs.code, stored)
  const set = (patch: Partial<Kept>) => keep({ ...kept, ...patch })

  const [was] = useState(unsent)
  const [draft, setDraft] = useState(kept.ask || was.draft)
  // The issue handed over with the words, while the run is still on its repository.
  const [issue, setIssue] = useState(kept.ask ? kept.issue : 0)
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
    if (kept.ask || kept.issue) set({ ask: '', issue: 0 })
    // The handover is read on this mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const places = usePlaces(target, signed)
  // The model and effort Chat shares, and dictation into the ask.
  const { limits } = useLimits(signed ? (signal) => readLimits(target, signal) : null, target)
  const mind = useMind(target, (limits as { plan?: string } | null)?.plan)
  const voice = useVoice({ speech: useEar(target), language: useSpoken(), ...useDictation(draft, setDraft) })
  const talk = useTalk({ baseUrl: target.api, token: () => target.token(), ...(target.org ? { org: target.org } : {}) })
  // What the run carries beside the ask: skills, memory and the mode, as Chat's turns do.
  const carry = useCarry(target, '', (tab) => host.go(path({ kind: 'customize', tab })), {
    draft,
    setDraft,
    // A run reads text: a file that is one rides the ask, a picture goes with a chat.
    attach: (list) => {
      const text = list.filter((f) => !f.type.startsWith('image/'))
      if (text.length < list.length) setNote(t('A run reads text files; send a picture in Chat.'))
      if (text.length) {
        const dt = new DataTransfer()
        for (const f of text) dt.items.add(f)
        void readFiles(files, dt.files).then(({ files: next, note: why }) => {
          setFiles(next)
          if (why) setNote(why)
        })
      }
    },
    go: (href) => (href.startsWith('http') ? host.open(href) : host.go(href)),
  }, DEV_MODES)
  const mode: Mode = carry.mode.value === 'plan' ? 'plan' : 'build'
  const hints = useSuggestions(target)
  // The chosen codebase's environment, so New can say when it has none yet.
  const codebase = isForge(kept.repo) ? kept.repo.name : ''
  // The org's repositories on the forge: what a run and an environment can name.
  const homes = useCached<Homes>(signed ? `${host.org}:homes` : null, (signal) => readHomes(target, signal), NOHOMES)
  // A kept codebase the org's whole list does not hold — a board's key once handed over as one — is not offered as one.
  const stranger =
    codebase !== '' && homes.value.whole && !homes.value.homes.some((h) => h.name.toLowerCase() === codebase.toLowerCase())
  // Read once the list has answered (or failed), so a name that is not the org's is never asked for.
  const settled = homes.value !== NOHOMES || homes.error !== null
  const found = useRead(signed && codebase && settled && !stranger ? () => read(target, codebase) : null, null as Environment | null, [target, signed, codebase, settled, stranger])
  // A read kept from the codebase before is not this one's.
  const env = { ...found, value: found.value && found.value.repo === codebase && !stranger ? found.value : null }
  const place: Place = places.value.find((p) => p.id === kept.place) ?? SANDBOX

  const known = useRef(new Map<string, ForgeRepo>())
  const hubs = useRef(new Map<string, HubRepo>())

  // The forge's codebases, then the repositories the org's GitHub installation
  // grants. A GitHub row is chosen as GitHub's address, so a run on it clones,
  // pushes and proposes on GitHub, where its people work. A GitHub read that
  // fails leaves the forge's list standing.
  const loadRepos = useCallback(
    async (q: string) => {
      const [page, hub] = await Promise.all([codebases(target, q), githubRepos(target, { q }).catch(() => null)])
      const repos = page.map(asRepo)
      for (const r of repos) known.current.set(r.name, r)
      const github = (hub?.repos ?? []).map(asHub)
      for (const r of github) hubs.current.set(r.full_name.toLowerCase(), r)
      return { repos: [...repos, ...github], next: null }
    },
    [target],
  )

  // Drawn only once a forge codebase is chosen; one the forge no longer lists offers its default branch.
  const home = kept.repo?.default_branch || 'main'
  const loadBranches = useCallback(
    async (q: string) => {
      const got = await one(target, codebase)
      const needle = q.trim().toLowerCase()
      const names = (got?.branches ?? [home]).filter((b) => !needle || b.toLowerCase().includes(needle))
      return { branches: names.map((name) => ({ name })), next: null }
    },
    [target, codebase, home],
  )

  // The composer sends only a draft with words in it, and not while a send is out.
  const send = async (said: string = draft) => {
    if (!signed) {
      hold({ draft: said, files, sent: true })
      host.signIn?.()
      return
    }
    const repo = isForge(kept.repo) ? kept.repo : null
    const hub = isHub(kept.repo) ? kept.repo : null
    if (!repo && !hub) {
      setNote(t('Choose the project this run works on: a repository of this organization, or one on its GitHub.'))
      setPicking(true)
      return
    }
    // A plan or a setup routed to a machine is refused here, in its own words, before it leaves the page.
    const why = unhonoured(mode, place.id)
    if (why) {
      setNote(why)
      return
    }
    if (stranger) {
      setNote(t('{repo} is not one of this organization’s repositories. Choose one, or leave it empty to start a new project.', { repo: codebase }))
      setPicking(true)
      return
    }
    setBusy(true)
    setNote('')
    try {
      // What the plugins that are on add: words for the run, or an answer of their own.
      const prepped = carry.preparing ? await carry.prep({ text: said.trim(), files: [], thread: '' }, new AbortController().signal) : {}
      // An answer of a plugin's own (a deck) is the answer: no run is started for it.
      if (prepped.reply) {
        // Its words, without the page it drew (Chat shows that in the side panel).
        setNote(prepped.reply.split('```')[0]!.trim())
        return
      }
      // Manual: the run is asked for before it starts; it edits, commits and pushes on its own once it has.
      if (!(await carry.allow({ id: 'run', name: t('Dev to start this run'), note: t('It edits, tests, commits and pushes its own branch') }))) {
        setNote(t('Not started.'))
        return
      }
      const run = await start(target, {
        prompt: compose([said.trim(), carry.text, prepped.system ?? ''].filter(Boolean).join('\n\n---\n'), files),
        // The name alone. The org rides the request, and a slash is not a repo name.
        // An empty base or place is not sent: the default branch, and the sandbox.
        repo: repo?.name ?? hub?.full_name,
        base: repo ? kept.branch : hub ? kept.branch || hub.default_branch : undefined,
        targetId: place.id,
        mode,
        model: mind.model,
        effort: mind.effort,
        issue,
      })
      setDraft('')
      setFiles([])
      setIssue(0)
      onStarted(run.session)
    } catch (e) {
      setNote(plain(e, repo?.name ?? hub?.full_name ?? 'a new project', 'run'))
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

  // A run a suggestion in Chat left for Dev starts on arrival, once its person is known.
  const [handed] = useState(() => ({ prompt: taken('task') }))
  useEffect(() => {
    if (!signed || !handed.prompt) return
    const p = handed.prompt
    handed.prompt = ''
    setDraft(p)
    void send(p)
    // Started once, on the sign-in that it waited for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signed])

  /** What pressing a suggestion does: open what it names, chat its prompt, start its run, or make its scheduled task. */
  const act = (a: Act) => {
    switch (a.kind) {
      case 'open':
        if (a.item) want(a.item)
        if (/^https:\/\//.test(a.to)) window.open(a.to, '_blank', 'noopener,noreferrer')
        else if (a.to.startsWith('/')) host.open(a.to)
        else host.go(a.to)
        return
      case 'send':
        hand('send', a.prompt)
        host.open('/chat')
        return
      case 'task':
        setDraft(a.prompt)
        void send(a.prompt)
        return
      case 'schedule':
        setNote('')
        void book(target, a, 'dev').then(
          (made) => host.go(path({ kind: 'automation', id: made.id })),
          (e: unknown) => setNote(e instanceof Error && e.message ? e.message : t('The scheduled task could not be made.')),
        )
        return
    }
  }

  /** Start the agent that finds a codebase's environment, and open it: its run is the progress. A refusal is the dialog's to say. */
  const setup = async (repo: string) => {
    const run = await start(target, { prompt: SETUP, repo, mode: 'setup', model: mind.model, effort: mind.effort })
    onStarted(run.session)
  }

  /** The codebase a dialog chose, chosen here too. */
  const choose = (h: Home) => {
    const row = chosen({ owner: h.label.split('/')[0] ?? '', name: h.name, full_name: h.label, default_branch: h.branch })
    setIssue(0)
    set({ repo: row, branch: row.default_branch })
  }

  // Cloud is the sandbox, set up by the chosen codebase's environment.
  const setUp =
    codebase && env.value
      ? env.value.state === 'ready'
        ? t('{repo} environment', { repo: codebase })
        : env.value.state === 'proposed'
          ? t('{repo} environment proposed', { repo: codebase })
          : unset(env.value)
            ? t('no {repo} environment yet', { repo: codebase })
            : t('{repo} environment, empty', { repo: codebase })
      : ''
  const placeItems = useMemo(
    () =>
      (places.value.length ? places.value : [SANDBOX]).map((p) => ({
        id: p.id || 'sandbox',
        label: p.id ? p.label : t('Cloud'),
        hint: p.id ? [t('Remote control'), p.status, p.capacity].filter(Boolean).join(' · ') : [t('Hanzo sandbox'), setUp].filter(Boolean).join(' · '),
        disabled: !ready(p),
        place: p,
      })),
    [places.value, setUp, t],
  )

  const branch = kept.branch || kept.repo?.default_branch || 'main'

  const where = (
    <XStack gap={6} items="center" flexWrap="wrap">
      <ChipSelect
        name={t('Where the run runs')}
        icon={place.id ? <Monitor size={13} /> : <Cloud size={13} />}
        label={place.id ? place.label : t('Cloud')}
        chosen={placeItems.find((i) => i.place.id === place.id)}
        items={placeItems}
        onChange={(i) => set({ place: i.place.id })}
        placeholder={t('Search machines…')}
        loading={places.loading}
        error={places.error?.message ?? null}
        footer={
          <YStack gap="$0.5">
            <SizableText size="$1" color="$ink">
              {t('Set up remote control')}
            </SizableText>
            <SizableText size="$1" color="$soft">
              {t('Run {command} on a machine: it joins this list, and a run there uses its checkout and credentials.', {
                command: (
                  <SizableText size="$1" color="$ink" style={{ fontFamily: 'var(--f-mono, ui-monospace, monospace)' }} {...{ 'data-i18n-ltr': '' }}>
                    hanzo link
                  </SizableText>
                ),
              })}
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
          setIssue(0)
          if (hub) {
            set({ repo: hub, branch: hub.default_branch })
            return
          }
          const row = known.current.get(r.name) ?? chosen(r)
          set({ repo: row, branch: row.default_branch })
        }}
        load={loadRepos}
        troubleshoot={{
          label: t('Missing a GitHub repository? Bring it onto the forge'),
          onPress: () => host.go(path({ kind: 'screen', screen: 'sync' })),
        }}
        connect={
          <XStack justify="flex-end">
            <FooterLink label={t('Refresh list')} onPress={() => setRound((n) => n + 1)} />
          </XStack>
        }
        note={t("Repositories on the forge and on your organization's GitHub. Type to search.")}
        action={{
          label: t('Add to project'),
          onPress: (r) => {
            const row = known.current.get(r.name)
            setAdding({
              repo: row?.clone || `${target.api}/v1/git/${r.owner}/${r.name}.git`,
              title: row?.full_name || `${r.owner}/${r.name}`,
              ref: r.default_branch || 'main',
              name: r.name,
            })
          },
        }}
        placeholder={t('Choose a project')}
        disabled={!signed}
      />
      {isForge(kept.repo) ? <BranchSelect value={branch} onChange={(b) => set({ branch: b })} load={loadBranches} /> : null}
    </XStack>
  )
  const head = files.length ? (
    <XStack gap={6} items="center" flexWrap="wrap">
      <Files files={files} onFiles={setFiles} />
    </XStack>
  ) : undefined
  // The machines a run can go to, as the `+` menu's Devices: the same choice as `where`'s.
  const devices = {
    rows: placeItems.map((i) => ({ id: i.place.id || 'sandbox', label: i.label, note: i.hint, icon: <Device size={16} />, on: i.place.id === place.id })),
    pick: (id: string) => set({ place: id === 'sandbox' ? '' : id }),
    loading: places.loading,
    error: places.error?.message ?? null,
  }

  return (
    // The question and the field that answers it sit together in the middle of the
    // page, as they do on claude.ai; a run's own page keeps its composer at the foot.
    // Chat's opening, the same: the heading set as Chat's, the composer as wide as the text.
    <YStack flex={1} minH={0} minW={0} items="center" justify="center" pb="$10" overflowY="auto" overflowX="hidden">
      <YStack width="100%" maxW={MEASURE} gap="$3">
        <SizableText render="h1" fontSize="$7" lineHeight="$7" fontWeight="700" color="$ink" style={{ textAlign: 'center' }}>
          {t('Build what’s next.')}
        </SizableText>
        <YStack gap="$2">
          {stranger ? (
            <XStack items="center" justify="space-between" gap="$3" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor" role="alert">
              <SizableText size="$2" color="$ink" flex={1} minW={0}>
                {t('{repo} is not one of this organization’s repositories.', { repo: codebase })}
              </SizableText>
              <Button size="sm" variant="outline" onPress={() => setPicking(true)}>
                {t('Choose a repository')}
              </Button>
            </XStack>
          ) : env.value && (env.value.state === 'proposed' || unset(env.value)) && !place.id ? (
            <XStack items="center" justify="space-between" gap="$3" px="$3" py="$2" rounded="$10" borderWidth={1} borderColor="$borderColor">
              <SizableText size="$2" color="$ink" flex={1} minW={0}>
                {env.value.state === 'proposed'
                  ? t('A proposed environment for {repo} is waiting for review.', { repo: codebase })
                  : t('{repo} has no environment yet, so every run starts it bare.', { repo: codebase })}
              </SizableText>
              {env.value.state === 'proposed' && env.value.session ? (
                <Button size="sm" variant="outline" onPress={() => host.go(env.value!.session)}>
                  {t('Review')}
                </Button>
              ) : (
                <Button size="sm" onPress={() => setOffering(true)}>
                  {t('Set up environment')}
                </Button>
              )}
            </XStack>
          ) : null}
          {note || unhonoured(mode, place.id) || mind.note ? (
            <SizableText size="$1" color="$soft" role="status">
              {note || unhonoured(mode, place.id) || mind.note}
            </SizableText>
          ) : null}
          <Prompt
            framed
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            busy={busy}
            label={t('Describe a task or ask a question')}
            head={head}
            plus={{
              upload: () => pick(files, setFiles, setNote),
              skills: carry.skills,
              design: carry.design,
              plugins: carry.plugins,
              devices,
              memory: { on: carry.gear.gear.memory, set: (on) => carry.gear.set({ memory: on }) },
            }}
            on={carry.on}
            slash={carry.skills}
            at={carry.plugins}
            mode={carry.mode}
            where={where}
            below={<Suggestions rows={hints.rows} onAct={act} onDismiss={hints.dismiss} />}
            mind={mind}
            limits={limits}
            onUpgrade={() => host.go(path({ kind: 'screen', screen: 'plans' }))}
            voice={voice}
            language={prefs.language ?? null}
            onLanguage={(id) => void savePrefs({ language: id })}
            talk={talk}
          />
        </YStack>
      </YStack>
      <Publish source={adding} onClose={() => setAdding(null)} />
      {carry.dialog}
      {codebase ? (
        <SetupDialog
          repo={codebase}
          homes={homes}
          open={offering}
          onOpenChange={setOffering}
          onStart={setup}
          onRepo={choose}
          onSaved={() => {
            setOffering(false)
            env.reload()
          }}
        />
      ) : null}
    </YStack>
  )
}
