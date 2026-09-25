/**
 * New: the empty state. A heading at the top of the column, and at the foot of
 * the pane the composer — where the run goes (the sandbox or one of the org's
 * machines), which repository and branch it starts from, and the ask itself.
 * Under it: attach, dictate, the mode, and the model and effort on the right.
 *
 * Sending starts a coding run and opens it. The choices a person made here are
 * kept in this browser, per org, so the next New starts where the last one did.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Cloud, Monitor } from '@hanzogui/lucide-icons-2'
import { ModeSelect } from '@hanzo/ui/agents'
import { Composer, EmptyPrompt } from '@hanzo/ui/chat'
import { BranchSelect, ChipSelect, HanzoMark, RepoSelect, type Repo as RowRepo } from '@hanzo/ui/product'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { start, unhonoured, type Mode } from './api/coding.ts'
import { asRepo, chosen, codebases, one, type ForgeRepo } from './api/codebases.ts'
import { ENSO, models } from './api/models.ts'
import { ready, SANDBOX, type Place } from './api/places.ts'
import { isForge } from './choice.ts'
import { useKept, usePlaces, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { Publish, type Source } from './publish.tsx'
import { path } from './route.ts'
import { Attach, compose, Dictate, Files, type Attached } from './tools.tsx'

/** One vocabulary for the mode, on New and in a workspace. */
export const MODES = [
  { id: 'build', label: 'Build', hint: 'Edits, commits and pushes a branch' },
  { id: 'plan', label: 'Plan', hint: 'Plans the change and writes nothing' },
] as const

const EFFORTS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

/** What a person chose last time, per org. */
interface Kept {
  repo: (RowRepo & { forge?: boolean; clone?: string }) | null
  branch: string
  place: string
  mode: Mode
  model: string
  effort: string
  ask: string
}

const FIRST: Kept = { repo: null, branch: '', place: '', mode: 'build', model: ENSO, effort: 'medium', ask: '' }

const COLUMN = 768

export function Landing({ onStarted }: { onStarted: (session: string) => void }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [kept, keep] = useKept<Kept>(`hanzo.build.new.${host.org ?? 'none'}`, FIRST)
  const set = (patch: Partial<Kept>) => keep({ ...kept, ...patch })

  const [draft, setDraft] = useState(kept.ask || '')
  const [files, setFiles] = useState<Attached[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState<Source | null>(null)

  // A codebase or an issue hands its words over once. Left in the kept choice,
  // every later visit to New would put them back.
  useEffect(() => {
    if (kept.ask) set({ ask: '' })
    // The handover is read on this mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const places = usePlaces(t, signed)
  const catalog = useRead(signed ? () => models(t) : null, [], [t, signed])
  const place: Place = places.value.find((p) => p.id === kept.place) ?? SANDBOX

  const known = useRef(new Map<string, ForgeRepo>())

  const loadRepos = useCallback(
    async (q: string) => {
      const page = await codebases(t, q)
      const repos = page.map(asRepo)
      for (const r of repos) known.current.set(r.name, r)
      return { repos, next: null }
    },
    [t],
  )

  const loadBranches = useCallback(
    async (q: string) => {
      if (!kept.repo) return { branches: [], next: null }
      const found = await one(t, kept.repo.name)
      const needle = q.trim().toLowerCase()
      const names = (found?.branches ?? [kept.repo.default_branch || 'main']).filter(
        (b) => !needle || b.toLowerCase().includes(needle),
      )
      return { branches: names.map((name) => ({ name })), next: null }
    },
    [t, kept.repo],
  )

  const send = async () => {
    const prompt = draft.trim()
    if (!prompt || busy) return
    if (!signed) {
      host.signIn?.()
      return
    }
    if (!isForge(kept.repo)) {
      setNote('Choose a codebase on the forge.')
      return
    }
    setBusy(true)
    setNote('')
    try {
      const run = await start(t, {
        prompt: compose(prompt, files),
        // The name alone. The org rides the request, and a slash is not a repo name.
        repo: isForge(kept.repo) ? kept.repo.name : undefined,
        base: isForge(kept.repo) ? kept.branch || kept.repo.default_branch || undefined : undefined,
        targetId: place.id || undefined,
        mode: kept.mode,
        model: kept.model === ENSO ? undefined : kept.model,
        effort: kept.effort,
      })
      setDraft('')
      setFiles([])
      onStarted(run.session)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The run could not start')
    } finally {
      setBusy(false)
    }
  }

  const placeItems = useMemo(
    () =>
      (places.value.length ? places.value : [SANDBOX]).map((p) => ({
        id: p.id || 'sandbox',
        label: p.label,
        hint: p.id ? [p.status, p.capacity].filter(Boolean).join(' · ') : 'The platform’s own sandbox',
        disabled: !ready(p),
        place: p,
      })),
    [places.value],
  )

  const branch = kept.branch || kept.repo?.default_branch || 'main'

  const head = (
    <XStack gap={6} items="center" flexWrap="wrap">
      <ChipSelect
        name="Where the run runs"
        icon={place.id ? <Monitor size={13} /> : <Cloud size={13} />}
        label={place.id ? place.label : 'Default'}
        chosen={placeItems.find((i) => i.place.id === place.id) ?? null}
        items={placeItems}
        onChange={(i) => set({ place: i.place.id })}
        placeholder="Search machines…"
        loading={places.loading}
        error={places.error?.message ?? null}
        footer={
          <SizableText size="$1" color="$soft">
            A run on a machine uses that machine’s checkout and credentials.
          </SizableText>
        }
      />
      <RepoSelect
        value={isForge(kept.repo) ? kept.repo : null}
        onChange={(r) => {
          const row = known.current.get(r.name) ?? chosen(r)
          set({ repo: row, branch: row.default_branch })
        }}
        load={loadRepos}
        troubleshoot={{
          label: 'Browse codebases',
          onPress: () => host.go(path({ kind: 'screen', screen: 'codebases' })),
        }}
        note="Repositories on the forge. Type to search."
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
        placeholder="Codebase"
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
      <ChipSelect
        quiet
        name="Model"
        label={catalog.value.find((m) => m.id === kept.model)?.label ?? 'Enso'}
        chosen={catalog.value.find((m) => m.id === kept.model) ?? null}
        items={catalog.value}
        onChange={(m) => set({ model: m.id })}
        placeholder="Search models…"
        placement="top-end"
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
    <YStack flex={1} minH={0} minW={0} items="center" px="$4">
      <YStack width="100%" maxW={COLUMN} flex={1} minH={0}>
        <EmptyPrompt title="What’s up next?" mark={<HanzoMark size={18} />} column={COLUMN} />
        <YStack flex={1} />
        <YStack pb="$2" gap="$2">
          {note || unhonoured(kept.mode, place.id) ? (
            <SizableText size="$1" color="$soft" role="status">
              {note || unhonoured(kept.mode, place.id)}
            </SizableText>
          ) : null}
          <Composer
            inline
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
    </YStack>
  )
}
