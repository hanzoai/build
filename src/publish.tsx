/**
 * Adding a repository to a project — the one publish path, from a repo row
 * ("Add to project") and from a workspace's Publish.
 *
 * `POST /v1/platform/apps` builds the repository and writes its declaration.
 * On a branch (everyone) that is a review: nothing deploys until it merges,
 * and the review link is the thing to open. An org admin can take a green
 * build to main, which CD applies: that is the second call, with the build's
 * tag, because main refuses an image that is not built yet.
 *
 * Every state shown is one the platform reported; a refusal shows the
 * platform's own sentence.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ExternalLink } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@hanzo/ui'
import { useEffect, useState } from 'react'

import { builds, declare, label, type Declared } from './api/platform.ts'
import { useHost, useTarget } from './host.tsx'

export interface Source {
  /** The https clone URL. */
  repo: string
  /** What to call it: `owner/name` or a project's name. */
  title: string
  ref: string
  /** The app name to declare. */
  name: string
  /** The project to add it to, when there already is one. */
  project?: string
}

type Phase = 'ask' | 'sending' | 'declared' | 'shipping' | 'shipped' | 'failed'

export function Publish({ source, onClose }: { source: Source | null; onClose: () => void }) {
  const t = useTarget()
  const host = useHost()
  const [project, setProject] = useState('')
  const [phase, setPhase] = useState<Phase>('ask')
  const [out, setOut] = useState<Declared | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setProject(source?.project ?? source?.name ?? '')
    setPhase('ask')
    setOut(null)
    setStatus('')
    setError('')
  }, [source])

  // The build is asynchronous; its record says when it is green.
  useEffect(() => {
    const id = out?.build?.id
    if (!id || phase !== 'declared') return
    let live = true
    const tick = async () => {
      try {
        const row = (await builds(t)).find((b) => b.id === id)
        if (live && row) setStatus(row.status)
      } catch {
        /* the status stays as last read */
      }
    }
    void tick()
    const every = setInterval(tick, 5000)
    return () => {
      live = false
      clearInterval(every)
    }
  }, [t, out, phase])

  if (!source) return null

  const send = async () => {
    setPhase('sending')
    setError('')
    try {
      const d = await declare(t, { repo: source.repo, ref: source.ref, name: source.name, project: project || source.name, mode: 'branch' })
      setOut(d)
      setStatus(d.build?.status ?? '')
      setPhase('declared')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The platform refused this')
      setPhase('failed')
    }
  }

  const ship = async () => {
    if (!out?.build?.id) return
    setPhase('shipping')
    setError('')
    try {
      await declare(t, { repo: source.repo, ref: source.ref, name: source.name, project: project || source.name, mode: 'commit', tag: out.build.id })
      setPhase('shipped')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The platform refused this')
      setPhase('declared')
    }
  }

  const green = /^(succeeded|success|done|complete|completed|ok)$/i.test(status)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent maxW={480}>
        <DialogTitle>Add to project</DialogTitle>
        <DialogDescription>
          Build {source.title} at {source.ref || 'main'} and declare it in a project. {host.admin ? 'As an admin you can take a green build to main.' : 'It opens a review; merging it is what deploys.'}
        </DialogDescription>

        <YStack gap="$1.5">
          <SizableText render="label" size="$2" color="$soft" htmlFor="publish-project">
            Project
          </SizableText>
          <Input
            id="publish-project"
            value={project}
            onChangeText={(v: string) => setProject(v)}
            disabled={phase !== 'ask' && phase !== 'failed'}
            placeholder={label(source.name)}
            aria-label="Project"
          />
          <SizableText size="$1" color="$soft">
            Saved as {label(project || source.name)}
          </SizableText>
        </YStack>

        {out ? (
          <YStack gap="$2" role="status">
            <SizableText size="$2" color="$ink">
              {phase === 'shipped'
                ? 'Declared on main — CD applies it on its next pass.'
                : `Build ${out.build?.id ?? ''}: ${status || 'building'}`}
            </SizableText>
            {out.review ? (
              <XStack render="a" href={out.review} target="_blank" rel="noopener noreferrer" items="center" gap="$1.5">
                <SizableText size="$2" color="$ink" textDecorationLine="underline">
                  Open the review
                </SizableText>
                <ExternalLink size={12} opacity={0.6} />
              </XStack>
            ) : null}
          </YStack>
        ) : null}

        {error ? (
          <SizableText size="$2" color="$red10" role="alert">
            {error}
          </SizableText>
        ) : null}

        <XStack gap="$2" justify="flex-end">
          <Button variant="outline" size="sm" onPress={onClose}>
            {phase === 'shipped' || phase === 'declared' ? 'Done' : 'Cancel'}
          </Button>
          {phase === 'ask' || phase === 'failed' || phase === 'sending' ? (
            <Button size="sm" disabled={phase === 'sending'} onPress={() => void send()}>
              {phase === 'sending' ? 'Adding…' : 'Add to project'}
            </Button>
          ) : host.admin && (phase === 'declared' || phase === 'shipping') ? (
            <Button size="sm" disabled={!green || phase === 'shipping'} onPress={() => void ship()}>
              {phase === 'shipping' ? 'Shipping…' : green ? 'Ship to main' : 'Waiting for the build'}
            </Button>
          ) : null}
        </XStack>
      </DialogContent>
    </Dialog>
  )
}
