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
import { ChevronDown, Cloud, Mic, MicOff, Monitor, Paperclip, Plus, X } from '@hanzogui/lucide-icons-2'
import { ModeSelect } from '@hanzo/ui/agents'
import { Button } from '@hanzo/ui'
import { Composer, EmptyPrompt } from '@hanzo/ui/chat'
import { BranchSelect, ChipSelect, HanzoMark, RepoSelect, type Repo as RowRepo } from '@hanzo/ui/product'
import { useCallback, useMemo, useRef, useState } from 'react'

import { start, type Mode } from './api/coding.ts'
import { branches, connect, repos } from './api/github.ts'
import { ENSO, models } from './api/models.ts'
import { ready, SANDBOX, type Place } from './api/places.ts'
import { clone } from './api/platform.ts'
import { useKept, usePlaces, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { Publish, type Source } from './publish.tsx'
import { useDictation } from './voice.ts'

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
  repo: RowRepo | null
  branch: string
  place: string
  mode: Mode
  model: string
  effort: string
}

const FIRST: Kept = { repo: null, branch: '', place: '', mode: 'build', model: ENSO, effort: 'medium' }

/** Attached files ride the prompt as text; nothing is uploaded anywhere else. */
interface Attached {
  name: string
  text: string
}

const EACH = 100_000
const ALL = 200_000

function compose(prompt: string, files: Attached[]): string {
  if (!files.length) return prompt
  const blocks = files.map((f) => `\n\n\`${f.name}\`:\n\`\`\`\n${f.text}\n\`\`\``).join('')
  return `${prompt}${blocks}`
}

const COLUMN = 768

export function Landing({ onStarted }: { onStarted: (session: string) => void }) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const [kept, keep] = useKept<Kept>(`hanzo.build.new.${host.org ?? 'none'}`, FIRST)
  const set = (patch: Partial<Kept>) => keep({ ...kept, ...patch })

  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<Attached[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [connected, setConnected] = useState(true)
  const [adding, setAdding] = useState<Source | null>(null)
  const picker = useRef<HTMLInputElement | null>(null)

  const places = usePlaces(t, signed)
  const catalog = useRead(signed ? () => models(t) : null, [], [t, signed])
  const place: Place = places.value.find((p) => p.id === kept.place) ?? SANDBOX

  const voice = useDictation((said) => setDraft((d) => (d ? `${d} ${said}` : said)))

  const loadRepos = useCallback(
    async (q: string, after?: string | null) => {
      const page = await repos(t, { q, after: after ?? undefined })
      setConnected(page.connected)
      return { repos: page.repos, next: page.next || null }
    },
    [t],
  )

  const loadBranches = useCallback(
    async (q: string, after?: string | null) => {
      if (!kept.repo) return { branches: [], next: null }
      const page = await branches(t, kept.repo.owner, kept.repo.name, { q, after: after ?? undefined })
      return { branches: page.branches.map((b) => ({ name: b.name })), next: page.next || null }
    },
    [t, kept.repo],
  )

  const attach = async (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    let total = next.reduce((n, f) => n + f.text.length, 0)
    for (const file of Array.from(list)) {
      if (file.size > EACH) {
        setNote(`${file.name} is over 100 KB; attach a smaller file or point the run at the repository.`)
        continue
      }
      const text = await file.text()
      if (total + text.length > ALL) {
        setNote('Attachments are capped at 200 KB in all.')
        break
      }
      total += text.length
      next.push({ name: file.name, text })
    }
    setFiles(next)
  }

  const send = async () => {
    const prompt = draft.trim()
    if (!prompt || busy) return
    if (!signed) {
      host.signIn?.()
      return
    }
    setBusy(true)
    setNote('')
    try {
      const run = await start(t, {
        prompt: compose(prompt, files),
        repo: kept.repo ? `${kept.repo.owner}/${kept.repo.name}` : undefined,
        base: kept.repo ? kept.branch || kept.repo.default_branch || undefined : undefined,
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
      places.value.map((p) => ({
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
        label="Where the run runs"
        icon={place.id ? <Monitor size={13} /> : <Cloud size={13} />}
        name={place.id ? place.label : 'Default'}
        chosen={placeItems.find((i) => i.place.id === place.id) ?? null}
        items={placeItems.length ? placeItems : [{ id: 'sandbox', label: SANDBOX.label, place: SANDBOX }]}
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
        value={kept.repo}
        onChange={(r) => set({ repo: r, branch: r.default_branch || 'main' })}
        load={loadRepos}
        troubleshoot={{ label: 'Troubleshoot GitHub connection', onPress: () => host.open(host.links.github) }}
        note="Not all repositories are shown. Type to search."
        connect={
          !connected && !host.admin ? (
            <XStack
              render="button"
              onPress={async () => {
                try {
                  const to = await connect(t)
                  // The console completes the connection at /connectors and
                  // brings the person back here; a path, never an origin.
                  try {
                    window.sessionStorage.setItem('hanzo.return', window.location.pathname + window.location.search)
                  } catch {
                    /* they land on the connectors page and come back themselves */
                  }
                  window.location.assign(to)
                } catch (e) {
                  setNote(e instanceof Error ? e.message : 'Could not start the GitHub connection')
                }
              }}
              items="center"
              justify="center"
              gap="$1.5"
              px="$3"
              py="$2"
              rounded="$3"
              bg="$color"
              hoverStyle={{ opacity: 0.9 }}
            >
              <SizableText size="$2" color="$background">
                Connect GitHub
              </SizableText>
            </XStack>
          ) : undefined
        }
        action={{
          label: 'Add to project',
          onPress: (r) =>
            setAdding({
              repo: clone(`${r.owner}/${r.name}`),
              title: `${r.owner}/${r.name}`,
              ref: r.default_branch || 'main',
              name: r.name,
            }),
        }}
        placeholder="Repository"
        disabled={!signed}
      />
      {kept.repo ? (
        <BranchSelect value={branch} onChange={(b) => set({ branch: b })} load={loadBranches} />
      ) : null}
      {files.map((f) => (
        <XStack key={f.name} items="center" gap="$1" px="$2" height={24} rounded="$2" bg="$raised">
          <Paperclip size={12} />
          <SizableText size="$1" color="$ink" numberOfLines={1} maxW={140}>
            {f.name}
          </SizableText>
          <XStack
            render="button"
            aria-label={`Remove ${f.name}`}
            onPress={() => setFiles(files.filter((x) => x !== f))}
            hitSlop={10}
          >
            <X size={12} />
          </XStack>
        </XStack>
      ))}
    </XStack>
  )

  const foot = (
    <XStack items="center" gap="$2" px="$2">
      <XStack
        render="button"
        aria-label="Attach files"
        onPress={() => picker.current?.click()}
        hitSlop={8}
        p="$1"
        rounded="$2"
        hoverStyle={{ bg: '$hover' }}
      >
        <Plus size={14} />
      </XStack>
      <input ref={picker} type="file" multiple hidden onChange={(e) => void attach(e.currentTarget.files).then(() => (e.currentTarget.value = ''))} />
      <XStack items="center">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={voice.on ? 'Stop dictation' : 'Dictate'}
          aria-pressed={voice.on}
          disabled={!voice.able}
          onPress={voice.toggle}
          title={voice.able ? undefined : 'Dictation is not available in this browser'}
        >
          {voice.on ? <MicOff size={14} /> : <Mic size={14} />}
        </Button>
        <ChipSelect
          quiet
          label="Dictation language"
          icon={<ChevronDown size={12} />}
          name=""
          chosen={voice.languages.find((l) => l.id === voice.language) ?? null}
          items={voice.languages}
          onChange={(l) => voice.setLanguage(l.id)}
          placeholder="Search languages…"
        />
      </XStack>
      <ModeSelect modes={MODES} value={kept.mode} onChange={(m) => set({ mode: m as Mode })} />
      <XStack flex={1} />
      <ChipSelect
        quiet
        label="Model"
        name={catalog.value.find((m) => m.id === kept.model)?.label ?? 'Enso'}
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
        label="Effort"
        name={EFFORTS.find((e) => e.id === kept.effort)?.label ?? 'Medium'}
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
          {note ? (
            <SizableText size="$1" color="$soft" role="status">
              {note}
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
