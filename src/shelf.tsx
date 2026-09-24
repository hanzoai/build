/**
 * The two shelves the rail opens: what this org has built (Artifacts), and the
 * public starters (Templates).
 *
 * A project is a real row — `/v1/projects`, the same one a deployed site is
 * served from — so opening one opens its workspace at its own address. A
 * starter is taken as a COPY of its own repository (`POST /v1/projects/fork`),
 * so what opens is that template, not a model's imitation of it.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Boxes, ExternalLink, Globe } from '@hanzogui/lucide-icons-2'
import { useState } from 'react'

import { fork, templates, type Project, type Template } from './api/projects.ts'
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

function Card({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <YStack
      render="button"
      onPress={onPress}
      aria-label={label}
      flexBasis={260}
      grow={1}
      maxW={360}
      minW={0}
      rounded="$4"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$panel"
      overflow="hidden"
      cursor="pointer"
      hoverStyle={{ borderColor: '$edge', bg: '$hover' }}
      focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: '$outlineColor' }}
    >
      {children}
    </YStack>
  )
}

export function Artifacts() {
  const t = useTarget()
  const host = useHost()
  const list = useProjects(t, Boolean(host.person))
  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" items="center">
      <YStack width="100%" maxW={1080}>
        <Head title="Artifacts" says="What this organization has built. Open one to keep building it." />
        {list.error ? (
          <SizableText size="$2" color="$soft">
            {list.error.message}
          </SizableText>
        ) : !host.person ? (
          <SizableText size="$2" color="$soft">
            Sign in to see what your organization has built.
          </SizableText>
        ) : list.loading && list.value.length === 0 ? (
          <SizableText size="$2" color="$soft">
            Reading your projects…
          </SizableText>
        ) : list.value.length === 0 ? (
          <SizableText size="$2" color="$soft">
            Nothing built yet. Describe something on the New page and it lands here.
          </SizableText>
        ) : (
          <XStack flexWrap="wrap" gap="$3">
            {list.value.map((p: Project) => (
              <Card key={p.slug} label={`Open ${p.name}`} onPress={() => host.go(p.slug)}>
                <YStack p="$3" gap="$1.5">
                  <XStack items="center" gap="$2">
                    <Globe size={14} opacity={0.7} />
                    <SizableText size="$3" color="$ink" numberOfLines={1} flex={1}>
                      {p.name}
                    </SizableText>
                    <SizableText size="$1" color="$soft">
                      {p.status || 'draft'}
                    </SizableText>
                  </XStack>
                  <SizableText size="$1" color="$soft" numberOfLines={1}>
                    {p.live ? new URL(p.live).host : 'Not deployed yet'}
                  </SizableText>
                </YStack>
              </Card>
            ))}
          </XStack>
        )}
      </YStack>
    </YStack>
  )
}

function Shot({ slug }: { slug: string }) {
  const [gone, setGone] = useState(false)
  return (
    <YStack height={140} bg="$hover" items="center" justify="center" position="relative" overflow="hidden">
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </YStack>
  )
}

export function Templates() {
  const t = useTarget()
  const host = useHost()
  const list = useRead(() => templates(t), [] as Template[], [t.api])
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
      setFailed(e instanceof Error ? e.message : 'Could not copy this template')
    } finally {
      setBusy('')
    }
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6" items="center">
      <YStack width="100%" maxW={1080}>
        <Head title="Templates" says="Start from a working app. Picking one copies its repository into a project of yours." />
        {failed ? (
          <SizableText size="$2" color="$soft" role="status" pb="$3">
            {failed}
          </SizableText>
        ) : null}
        {list.error ? (
          <SizableText size="$2" color="$soft">
            {list.error.message}
          </SizableText>
        ) : (
          <XStack flexWrap="wrap" gap="$3">
            {list.value.map((x) => (
              <Card key={x.slug} label={`Start from ${x.title}`} onPress={() => void take(x.slug)}>
                <Shot slug={x.slug} />
                <YStack p="$3" gap="$1">
                  <XStack items="center" gap="$2">
                    <SizableText size="$3" color="$ink" numberOfLines={1} flex={1}>
                      {busy === x.slug ? 'Copying…' : x.title}
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
              The whole catalog
            </SizableText>
            <ExternalLink size={12} opacity={0.6} />
          </Out>
        </YStack>
      </YStack>
    </YStack>
  )
}
