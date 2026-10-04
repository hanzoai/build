/**
 * Code: where and how a new run starts — the model, the effort, the mode and
 * the place — for anyone whose New has no choice of its own kept yet. Saved to
 * the person's own settings. Beside them, the codebases' environments and the
 * organization's machines, each on its own page.
 */
import { YStack } from '@hanzo/gui'
import { ChevronRight } from '@hanzogui/lucide-icons-2'
import { ChipSelect } from '@hanzo/ui/product'
import { ModelPicker } from '@hanzo/ui/models'
import { useState } from 'react'

import { unhonoured } from '../api/coding.ts'
import { ENSO, models } from '../api/models.ts'
import { SANDBOX } from '../api/places.ts'
import type { Code as Defaults } from '../api/pref.ts'
import { usePlaces, useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { EFFORTS, MODES } from '../landing.tsx'
import { usePrefs } from '../prefs.tsx'
import { path } from '../route.ts'
import { Card, Group, Heading, Note, Row, Soft } from './ui.tsx'

export function Code() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const { prefs, save } = usePrefs()
  const catalog = useRead(signed ? () => models(t) : null, [], [t, signed])
  const places = usePlaces(t, signed)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Code" />
        <Soft>Sign in to set how your runs start.</Soft>
      </YStack>
    )
  }

  const now: Required<Defaults> = { model: ENSO, effort: 'medium', mode: 'build', place: '', ...prefs.code }
  const keep = (change: Defaults) => {
    setNote('')
    save({ code: { ...prefs.code, ...change } }).catch((e: unknown) => setNote((e as Error).message))
  }

  const where = (places.value.length ? places.value : [SANDBOX]).map((p) => ({
    id: p.id || 'sandbox',
    label: p.id ? p.label : 'Default',
    // A machine offline now can still be the default; its status shows beside it.
    hint: p.id ? [p.status, p.capacity].filter(Boolean).join(' · ') : 'The platform’s own sandbox',
    place: p.id,
  }))
  // The sandbox is always listed, so a place not found is a machine that is not: it reads as its id.
  const place = where.find((w) => w.place === now.place) ?? { id: now.place, label: now.place, place: now.place }
  // A default is never premium: a premium model is picked for one run, in New.
  const offered = catalog.value.filter((m) => m.class !== 'premium')
  const go = (section: 'environments' | 'machines') => host.go(path({ kind: 'settings', section }))
  const effort = EFFORTS.find((e) => e.id === now.effort)!
  const mode = MODES.find((m) => m.id === now.mode)!

  return (
    <YStack gap="$6">
      <Heading title="Code" detail="How a new run starts. New begins from these until you choose otherwise there." />
      <Group title="Defaults">
        <Card>
          <Row
            first
            title="Model"
            detail="Enso picks one for each step; any other model runs them all."
            trailing={
              <ModelPicker
                size="sm"
                name="Default model"
                models={offered}
                scope="chat"
                value={now.model || ENSO}
                onChange={(id) => keep({ model: id })}
                loading={catalog.loading}
                error={catalog.error?.message ?? null}
              />
            }
          />
          <Row
            title="Effort"
            detail="How long the agent thinks before it acts."
            trailing={
              <ChipSelect
                name="Default effort"
                label={effort.label}
                chosen={effort}
                items={EFFORTS}
                onChange={(e) => keep({ effort: e.id })}
                placement="bottom-end"
                width={180}
              />
            }
          />
          <Row
            title="Mode"
            detail={mode.hint}
            trailing={
              <ChipSelect
                name="Default mode"
                label={mode.label}
                chosen={mode}
                items={MODES}
                onChange={(m) => keep({ mode: m.id })}
                placement="bottom-end"
                width={260}
              />
            }
          />
          <Row
            title="Where it runs"
            detail="The Hanzo sandbox, or one of your organization’s machines."
            trailing={
              <ChipSelect
                name="Default place"
                label={place.label}
                chosen={place}
                items={where}
                onChange={(w) => keep({ place: w.place })}
                placeholder="Search machines…"
                placement="bottom-end"
                loading={places.loading}
                error={places.error?.message ?? null}
              />
            }
          />
        </Card>
        <Note>{unhonoured(now.mode, now.place)}</Note>
      </Group>
      <Group title="Workspace">
        <Card>
          <Row
            first
            title="Environments"
            detail="What a run installs and starts in each codebase, and the secrets it exports."
            trailing={<Link label="Environments" onPress={() => go('environments')} />}
          />
          <Row
            title="Machines"
            detail="Your organization’s own computers that take runs."
            trailing={<Link label="Machines" onPress={() => go('machines')} />}
          />
        </Card>
      </Group>
      <Note>{note}</Note>
    </YStack>
  )
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <YStack render="button" aria-label={`Open ${label}`} p="$1" rounded="$2" hoverStyle={{ bg: '$hover' }} onPress={onPress}>
      <ChevronRight size={16} />
    </YStack>
  )
}
