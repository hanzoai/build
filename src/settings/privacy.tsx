/**
 * Privacy: the two data-sharing answers IAM records for the person — whether
 * Hanzo may train on their data, and whether anonymous usage is counted — and
 * who can see the organization's projects: a public one is in the community
 * catalogue with its source readable by anyone, until it is made private.
 */
import { YStack } from '@hanzo/gui'
import { Button, Switch } from '@hanzo/ui'
import { useState } from 'react'

import { consent, setConsent, type Consent } from '../api/consent.ts'
import { projects, setVisibility, type Project } from '../api/projects.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Card, Group, Heading, Note, Row, Soft } from './ui.tsx'

export function Privacy() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const answers = useRead(signed ? () => consent(t) : null, null as Consent | null, [t, signed])
  const published = useRead(signed ? () => projects(t) : null, [] as Project[], [t, signed])
  const [shown, setShown] = useState<Consent | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Privacy" />
        <Soft>Sign in to see your privacy settings.</Soft>
      </YStack>
    )
  }

  const now = shown ?? answers.value
  const answer = async (change: Partial<Consent>) => {
    setBusy('consent')
    setNote('')
    try {
      setShown(await setConsent(t, change))
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That was not saved')
    } finally {
      setBusy('')
    }
  }

  const flip = async (p: Project) => {
    setBusy(p.slug)
    setNote('')
    try {
      const saved = await setVisibility(t, p.slug, p.visibility === 'private' ? 'public' : 'private')
      published.reload()
      setNote(`${saved.name} is ${saved.visibility || 'saved'}`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That was not saved')
    } finally {
      setBusy('')
    }
  }

  const training = now?.training ?? ''
  return (
    <YStack gap="$6">
      <Heading title="Privacy" detail="What Hanzo may do with your data, and what your organization shows the world." />
      <Group title="Your data" detail="Recorded on your Hanzo account and honoured by every Hanzo surface.">
        {answers.error && !now ? (
          <Soft>{answers.error.message}</Soft>
        ) : !now ? (
          <Soft>Reading your answers…</Soft>
        ) : (
          <Card>
            <Row
              first
              title="Help improve Hanzo models"
              detail={
                training === 'granted'
                  ? 'Hanzo may train on your prompts and runs.'
                  : training === 'refused'
                    ? 'Hanzo does not train on your data.'
                    : 'Not answered yet. Until you say yes, Hanzo does not train on your data.'
              }
              trailing={
                <Switch
                  aria-label="Help improve Hanzo models"
                  checked={training === 'granted'}
                  disabled={busy === 'consent'}
                  onCheckedChange={(on: boolean) => void answer({ training: on ? 'granted' : 'refused' })}
                />
              }
            />
            <Row
              title="Usage insights"
              detail="Anonymous counts of how the product is used. No prompts, code or answers."
              trailing={
                <Switch
                  aria-label="Usage insights"
                  checked={now.insights}
                  disabled={busy === 'consent'}
                  onCheckedChange={(on: boolean) => void answer({ insights: on })}
                />
              }
            />
          </Card>
        )}
      </Group>
      <Group
        title="Projects"
        detail="A public project is listed in the community catalogue, and anyone can read its source. Keeping one private needs a paid plan."
      >
        {published.error ? (
          <Soft>{published.error.message}</Soft>
        ) : published.loading && !published.value.length ? (
          <Soft>Reading projects…</Soft>
        ) : !published.value.length ? (
          <Soft>Your organization has no projects yet.</Soft>
        ) : (
          <Card>
            {published.value.map((p, i) => (
              <Row
                key={p.slug}
                first={i === 0}
                title={p.name}
                detail={p.visibility === 'private' ? 'Private' : p.visibility === 'public' ? 'Public' : 'Visibility not reported'}
                trailing={
                  p.visibility ? (
                    <Button size="sm" variant="outline" disabled={busy === p.slug} onPress={() => void flip(p)}>
                      {p.visibility === 'private' ? 'Make public' : 'Make private'}
                    </Button>
                  ) : null
                }
              />
            ))}
          </Card>
        )}
      </Group>
      <Note>{note}</Note>
    </YStack>
  )
}
