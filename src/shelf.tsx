/**
 * Two shelves: the sites this org has deployed (Sites, drawn at the foot of the
 * Library — library.tsx), and the public starters (Templates).
 *
 * A project is a real row — `/v1/projects`, the same one a deployed site is
 * served from — so opening one opens its workspace at its own address. A
 * starter is taken as a COPY of its own repository (`POST /v1/projects/fork`),
 * so what opens is that template, not a model's imitation of it.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { useI18n, type Say } from '@hanzo/i18n/react'
import { Boxes, ExternalLink, Globe, Lock, MoreHorizontal } from '@hanzogui/lucide-icons-2'
import { Button, DropdownMenu } from '@hanzo/ui'
import { useState } from 'react'

import { change, fork, remove, templates, type Project, type Template } from './api/projects.ts'
import { Confirm, Rename } from './ask.tsx'
import { useProjects, useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { Out } from './out.tsx'

const SHOTS = 'https://hanzo.ai/templates'

function Head({ title, says }: { title: string; says: string }) {
  return (
    <YStack gap="$1" pb="$4">
      <SizableText render="h1" size="$6" color="$ink">
        {title}
      </SizableText>
      <SizableText size="$2" color="$soft">
        {says}
      </SizableText>
    </YStack>
  )
}

function Card({ onPress, label, small, children }: { onPress: () => void; label: string; small?: boolean; children: React.ReactNode }) {
  return (
    <YStack
      render="button"
      onPress={onPress}
      aria-label={label}
      flexBasis={small ? 150 : 260}
      grow={1}
      maxW={small ? 260 : 360}
      minW={0}
      rounded="$4"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$panel"
      overflow="hidden"
      cursor="pointer"
      hoverStyle={{ borderColor: '$edge', bg: '$hover' }}
      focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
      style={{ textAlign: 'left' }}
    >
      {children}
    </YStack>
  )
}

/** Copying a starter into a project of this org, then opening it: one copy at a time. */
function useFork() {
  const t = useTarget()
  const host = useHost()
  const [busy, setBusy] = useState('')
  const [failed, setFailed] = useState('')
  const take = async (slug: string) => {
    if (busy) return
    if (!host.person) return host.signIn?.()
    setBusy(slug)
    setFailed('')
    try {
      const made = await fork(t, slug)
      host.go(made.slug || slug)
    } catch (e) {
      setFailed((e as Error).message)
    } finally {
      setBusy('')
    }
  }
  return { busy, failed, take }
}

/** When a project was last edited, or made if it never was; Unix seconds. */
const when = (p: Project): number => p.updated || p.created

/** The org's projects under the month each was last edited, newest first. */
function months(list: Project[], say: Say): { label: string; rows: Project[] }[] {
  const out = new Map<string, Project[]>()
  for (const p of [...list].sort((a, b) => when(b) - when(a))) {
    const s = when(p)
    const label = s ? new Date(s * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : say('Earlier')
    out.set(label, [...(out.get(label) ?? []), p])
  }
  return [...out].map(([label, rows]) => ({ label, rows }))
}

function edited(s: number, say: Say): string {
  if (!s) return ''
  const d = new Date(s * 1000)
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return say('Edited {date}', { date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year }) })
}

/**
 * What this org has deployed: a few starters to make something new from, then
 * every site under the month it was last edited, whether it is public or
 * private, and its rename, visibility and delete. A site belongs to the org and
 * names no author, so the list does not split yours from a colleague's — which
 * is why it is a section of its own under the Library's items, which are yours.
 */
export function Sites() {
  const { t: say } = useI18n()
  const t = useTarget()
  const host = useHost()
  const list = useProjects(t, Boolean(host.person))
  const starters = useRead(() => templates(t), [] as Template[], [t.api])
  const { busy, failed, take } = useFork()
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [note, setNote] = useState('')

  const flip = async (p: Project) => {
    const visibility = p.visibility === 'private' ? 'public' : 'private'
    setNote('')
    try {
      await change(t, p.slug, { visibility })
      setNote(visibility === 'public' ? say('{name} is public now', { name: p.name }) : say('{name} is private now', { name: p.name }))
      list.reload()
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  const said = failed || note
  return (
    <YStack width="100%" role="region" aria-label={say('Sites')}>
      <YStack width="100%">
        <YStack gap="$1" pb="$4">
          <SizableText render="h2" size="$5" color="$ink">
            {say('Sites')}
          </SizableText>
          <SizableText size="$2" color="$soft">
            {`${say('What this organization has built.')} ${say('Open one to keep building it.')}`}
          </SizableText>
        </YStack>
        {said ? (
          <SizableText size="$2" color="$soft" role="status" pb="$3">
            {said}
          </SizableText>
        ) : null}
        {starters.value.length ? (
          <YStack gap="$3" pb="$6">
            <SizableText size="$3" color="$ink">
              {say('Make something new')}
            </SizableText>
            <XStack flexWrap="wrap" gap="$3">
              {starters.value.slice(0, 4).map((x) => (
                <Card key={x.slug} small label={say('Start from {template}', { template: x.title })} onPress={() => void take(x.slug)}>
                  <Shot slug={x.slug} />
                  <YStack px="$3" py="$2.5">
                    <SizableText size="$2" color="$ink" numberOfLines={1}>
                      {busy === x.slug ? say('Copying…') : x.title}
                    </SizableText>
                  </YStack>
                </Card>
              ))}
            </XStack>
          </YStack>
        ) : null}
        {list.error ? (
          <SizableText size="$2" color="$soft">
            {say(list.error.message)}
          </SizableText>
        ) : !host.person ? (
          <SizableText size="$2" color="$soft">
            {say('Sign in to see what your organization has built.')}
          </SizableText>
        ) : list.loading && list.value.length === 0 ? (
          <SizableText size="$2" color="$soft">
            {say('Reading your projects…')}
          </SizableText>
        ) : list.value.length === 0 ? (
          <YStack gap="$3" items="flex-start">
            <SizableText size="$2" color="$soft">
              {`${say('Nothing built yet.')} ${say('Describe something on the New page and it lands here.')}`}
            </SizableText>
            <Button size="sm" onPress={() => host.go('')}>
              {say('New run')}
            </Button>
          </YStack>
        ) : (
          <YStack gap="$5">
            {months(list.value, say).map((g) => (
              <YStack key={g.label} gap="$2">
                <SizableText size="$2" color="$soft">
                  {g.label}
                </SizableText>
                <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
                  {g.rows.map((p, i) => (
                    <XStack key={p.slug} items="center" pr="$2" borderTopWidth={i ? 1 : 0} borderColor="$borderColor" hoverStyle={{ bg: '$hover' }}>
                      <XStack
                        flex={1}
                        minW={0}
                        render="button"
                        aria-label={say('Open {name}', { name: p.name })}
                        onPress={() => host.go(p.slug)}
                        items="center"
                        gap="$3"
                        px="$3"
                        py="$2.5"
                        cursor="pointer"
                        style={{ textAlign: 'left' }}
                      >
                        {p.visibility === 'private' ? <Lock size={16} opacity={0.7} /> : <Globe size={16} opacity={0.7} />}
                        <YStack flex={1} minW={0} gap="$0.5">
                          <SizableText size="$3" color="$ink" numberOfLines={1}>
                            {p.name}
                          </SizableText>
                          <SizableText size="$1" color="$soft" numberOfLines={1}>
                            {[p.visibility === 'private' ? say('Private') : say('Public'), edited(when(p), say), p.live ? new URL(p.live).host : say('Not deployed yet')]
                              .filter(Boolean)
                              .join(' · ')}
                          </SizableText>
                        </YStack>
                      </XStack>
                      <DropdownMenu
                        trigger={
                          <XStack render="button" aria-label={say('Actions for {name}', { name: p.name })} px="$1.5" py="$1" rounded="$2" hoverStyle={{ bg: '$raised' }}>
                            <MoreHorizontal size={16} />
                          </XStack>
                        }
                        items={[
                          { key: 'rename', label: say('Rename'), onSelect: () => setRenaming(p) },
                          { key: 'visibility', label: p.visibility === 'private' ? say('Make public') : say('Make private'), onSelect: () => void flip(p) },
                          { type: 'separator' },
                          { key: 'delete', label: say('Delete'), destructive: true, onSelect: () => setDeleting(p) },
                        ]}
                      />
                    </XStack>
                  ))}
                </YStack>
              </YStack>
            ))}
          </YStack>
        )}
      </YStack>
      {renaming ? (
        <Rename
          open
          onOpenChange={(o) => !o && setRenaming(null)}
          title={say('Rename')}
          name={renaming.name}
          run={async (name) => {
            await change(t, renaming.slug, { name })
            setNote(say('Renamed to {name}', { name }))
            list.reload()
          }}
        />
      ) : null}
      {deleting ? (
        <Confirm
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={say('Delete {name}?', { name: deleting.name })}
          says={`${say('Its site stops answering, its releases are dropped, and its address is released.')} ${say('This cannot be undone.')}`}
          act={say('Delete')}
          run={async () => {
            await remove(t, deleting.slug)
            setNote(say('{name} is deleted', { name: deleting.name }))
            list.reload()
          }}
        />
      ) : null}
    </YStack>
  )
}

/**
 * A starter's picture: a capture of its page from the top, 16:10. The frame has
 * the capture's own shape at every width the grid gives a card, and the image is
 * anchored at its top edge, so nothing of the page's header is cropped away.
 */
function Shot({ slug }: { slug: string }) {
  const [gone, setGone] = useState(false)
  return (
    <YStack width="100%" aspectRatio={16 / 10} bg="$hover" items="center" justify="center" position="relative" overflow="hidden">
      <YStack items="center" gap="$2" opacity={0.6}>
        <Boxes size={24} />
        <SizableText size="$1" color="$soft" textTransform="uppercase" letterSpacing={1}>
          {slug}
        </SizableText>
      </YStack>
      {gone ? null : (
        <img
          src={`${SHOTS}/${encodeURIComponent(slug)}.webp`}
          alt=""
          loading="lazy"
          onError={() => setGone(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        />
      )}
    </YStack>
  )
}

export function Templates() {
  const { t: say } = useI18n()
  const t = useTarget()
  const list = useRead(() => templates(t), [] as Template[], [t.api])
  const { busy, failed, take } = useFork()

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" items="center">
      <YStack width="100%" maxW={1080}>
        <Head title={say('Templates')} says={`${say('Start from a working app.')} ${say('Picking one copies its repository into a project of yours.')}`} />
        {failed ? (
          <SizableText size="$2" color="$soft" role="status" pb="$3">
            {failed}
          </SizableText>
        ) : null}
        {list.error ? (
          <SizableText size="$2" color="$soft">
            {say(list.error.message)}
          </SizableText>
        ) : list.loading && !list.value.length ? (
          <SizableText size="$2" color="$soft">
            {say('Reading templates…')}
          </SizableText>
        ) : !list.value.length ? (
          <SizableText size="$2" color="$soft">
            {`${say('No templates here right now.')} ${say('The whole catalog has more.')}`}
          </SizableText>
        ) : (
          <XStack flexWrap="wrap" gap="$3">
            {list.value.map((x) => (
              <Card key={x.slug} label={say('Start from {template}', { template: x.title })} onPress={() => void take(x.slug)}>
                <Shot slug={x.slug} />
                <YStack p="$3" gap="$1">
                  <XStack items="center" gap="$2">
                    <SizableText size="$3" color="$ink" numberOfLines={1} flex={1}>
                      {busy === x.slug ? say('Copying…') : x.title}
                    </SizableText>
                    {x.framework ? (
                      <SizableText size="$1" color="$soft">
                        {x.framework}
                      </SizableText>
                    ) : null}
                  </XStack>
                  <SizableText size="$1" color="$soft" numberOfLines={2}>
                    {x.description}
                  </SizableText>
                </YStack>
              </Card>
            ))}
          </XStack>
        )}
        <YStack pt="$5">
          <Out href="https://gallery.hanzo.ai">
            <SizableText size="$2" color="$soft">
              {say('The whole catalog')}
            </SizableText>
            <ExternalLink size={12} opacity={0.6} />
          </Out>
        </YStack>
      </YStack>
    </YStack>
  )
}
