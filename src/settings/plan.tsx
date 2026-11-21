/**
 * The plan's usage, as the one view every Usage page draws: Dev's Settings,
 * the rooms' Settings and hanzo.ai's organization settings.
 *
 * On a PLAN: its name, its period, the request windows (session, day) and each
 * class of model's share of the period with its shorter window — shares only,
 * never money — and the choice of what happens when the allowance runs out:
 * `Use credits when my plan's allowance runs out` (PUT /v1/ai/limits), off
 * until the payer turns it on, and saying what it spends. Once a class is used
 * up it leads with that, its reset, and the two ways on.
 *
 * On FREE: the share of today's free allowance left and the shared pool's
 * state, and Upgrade. With CREDITS and no plan: the balance, because it is
 * what the account spends.
 *
 * It reads as `target`, so it needs no host: a host says where the plans and
 * Billing are (`onPlans`, `onBilling`).
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Button, Switch } from '@hanzo/ui'
import { useState, type ReactNode } from 'react'

import { money } from '../api/billing.ts'
import type { Target } from '../api/call.ts'
import { allow, CLASSES, type Action, type Class, type Limits } from '../api/limits.ts'
import { INK, Title } from '../meter.tsx'
import { spent, ways, when, type Share, type State } from '../plan.ts'
import { left, useStanding, type Standing } from '../standing.ts'
import { Card, day, Group, Note, Row, Soft } from './ui.tsx'

const NAME: Record<Class, string> = { premium: 'Premium models', ours: 'Hanzo models' }
const FILL = { ok: '$ink', near: '$yellow10', limited: '$red10' } as const satisfies Record<State, string>

/** A thin bar of a share used. */
function Bar({ percent, state }: { percent: number; state: State }) {
  return (
    <YStack height={6} rounded={999} bg="$hover" overflow="hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <YStack height={6} width={`${percent}%`} rounded={999} bg={FILL[state]} />
    </YStack>
  )
}

/** One measured row: what, how much of it is used, when it starts over, its bar, and what hangs under it. */
function Gauge({ title, w, first, says, now, children }: { title: string; w: Share; first?: boolean; says?: string; now?: number; children?: ReactNode }) {
  const at = when(w.resets, now)
  return (
    <YStack gap="$2" px="$3" py="$3" borderTopWidth={first ? 0 : 1} borderColor="$borderColor" data-slot="plan-window" data-state={w.state}>
      <XStack items="baseline" justify="space-between" flexWrap="wrap" columnGap="$3" rowGap="$1">
        <SizableText size="$2" color="$ink">
          {title}
        </SizableText>
        <SizableText size="$1" color={INK[w.state]} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {[says ?? `${w.percent}% used`, at ? `Resets ${at}` : ''].filter(Boolean).join(' · ')}
        </SizableText>
      </XStack>
      <Bar percent={w.percent} state={w.state} />
      {children}
    </YStack>
  )
}

/** Opens what an action names: a page, or the host's own place for it. */
type Go = (a: Action) => void

/** The view, once read. */
export function Reading({
  s,
  target,
  onPlans,
  onBilling,
  now,
}: {
  s: Standing
  target: Target
  onPlans?: () => void
  onBilling: () => void
  now?: number
}) {
  const [after, setAfter] = useState<Limits | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const l = after ?? s.limits
  const upgrade = l?.actions.find((a) => a.kind === 'upgrade')

  const choose = async (on: boolean) => {
    setBusy(true)
    setNote('')
    try {
      setAfter(await allow(target, on))
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const go: Go = (a) => {
    if (a.kind === 'credits') return void choose(true)
    if (a.kind === 'upgrade' && onPlans) return onPlans()
    if (a.kind === 'topup') return onBilling()
    if (a.url) window.location.assign(a.url)
  }

  // On a plan: a class used up, or one model paused, leads with its ways on, the upgrade among them.
  const used = s.kind === 'plan' && l ? CLASSES.filter((c) => l.classes[c]?.state === 'limited') : []
  const capped = s.kind === 'plan' ? (l?.paused[0] ?? null) : null
  const resets = used.map((c) => l!.classes[c]!.resets).sort()[0] ?? ''
  const notice = used.length
    ? spent(s.label, used, resets, now)
    : capped
      ? `${capped.model.replace(/\*$/, '')} is paused${when(capped.resets, now) ? ` until ${when(capped.resets, now)}` : ''}${capped.fallback ? `; chat continues on ${capped.fallback}` : ''}.`
      : ''
  const head = (
    <XStack items="center" gap="$3" flexWrap="wrap" data-slot="plan-head">
      <YStack flex={1} minW={200} gap="$1">
        {s.label ? <Title label={s.label} size="$5" /> : null}
        <SizableText size="$2" color="$soft">
          {s.kind === 'plan'
            ? l?.start && l.end
              ? `Current period ${day(l.start)} – ${day(l.end)}`
              : 'Your plan'
            : s.kind === 'free'
              ? 'Limited usage of free models, from a pool every free account shares.'
              : 'No plan. Usage is paid from your credits.'}
        </SizableText>
      </YStack>
      {(upgrade && !notice) || (s.kind !== 'plan' && onPlans) ? (
        <Button size="sm" variant={s.kind === 'plan' ? 'outline' : 'primary'} onPress={() => (upgrade ? go(upgrade) : onPlans?.())}>
          {upgrade?.label || 'Upgrade'}
        </Button>
      ) : null}
    </XStack>
  )

  if (s.kind === 'free') {
    const share = left(s.allowance)
    const a = s.allowance
    return (
      <YStack gap="$5" data-slot="plan-usage" data-kind="free">
        {head}
        {a && share !== null ? (
          <Card>
            <Gauge
              first
              title={a.window === 'hour' ? 'This hour' : 'Today'}
              w={{ percent: 100 - share, state: share === 0 ? 'limited' : share <= 20 ? 'near' : 'ok', resets: a.resets }}
              says={`${share}% left`}
              now={now}
            />
            {a.pool ? (
              <Row
                title="Shared pool"
                detail={a.pool.state === 'exhausted' ? `Used up${when(a.pool.resets, now) ? ` until ${when(a.pool.resets, now)}` : ''}` : a.pool.state === 'busy' ? 'Busy. Try again in a minute.' : 'Every free request is being served.'}
              />
            ) : null}
          </Card>
        ) : (
          <Soft>The free allowance could not be read.</Soft>
        )}
        <XStack items="center" gap="$3" flexWrap="wrap">
          <SizableText size="$2" color="$soft" flex={1} minW={200}>
            Credits pay as you go for any model, with or without a plan.
          </SizableText>
          <Button size="sm" variant="outline" onPress={onBilling}>
            Add credits
          </Button>
        </XStack>
      </YStack>
    )
  }

  if (s.kind === 'credits') {
    return (
      <YStack gap="$5" data-slot="plan-usage" data-kind="credits">
        {head}
        <Card>
          <Row
            first
            title="Credits"
            detail="What your usage is paid from, at each model’s list price."
            trailing={
              <SizableText size="$2" color="$ink" data-slot="plan-balance">
                {s.balance === null ? 'Unavailable' : money(s.balance)}
              </SizableText>
            }
          />
        </Card>
        <XStack>
          <Button size="sm" variant="outline" onPress={onBilling}>
            Add funds
          </Button>
        </XStack>
      </YStack>
    )
  }

  const on = l?.credits ?? false
  return (
    <YStack gap="$5" data-slot="plan-usage" data-kind="plan">
      {head}

      {notice ? (
        <XStack items="center" gap="$2.5" flexWrap="wrap" px="$3" py="$2.5" rounded="$3" borderWidth={1} borderColor="$borderColor" data-slot="plan-spent">
          <YStack width={8} height={8} rounded={4} bg="$red10" shrink={0} aria-hidden />
          <SizableText size="$2" color="$ink" flex={1} minW={200}>
            {notice}
          </SizableText>
          <XStack gap="$2" flexWrap="wrap">
            {ways(l?.actions ?? []).map((a, i) => (
              <Button key={a.kind} size="sm" variant={i === 0 ? 'primary' : 'outline'} disabled={busy} data-kind={a.kind} onPress={() => go(a)}>
                {a.label}
              </Button>
            ))}
          </XStack>
        </XStack>
      ) : null}

      {!l ? (
        <Soft>The plan’s usage could not be read.</Soft>
      ) : !l.session && !l.day && !Object.keys(l.classes).length ? (
        <Soft>This plan sets no usage limits.</Soft>
      ) : (
        <>
          {l.session || l.day ? (
            <Group title="Requests" detail="Every request the plan covers counts in both.">
              <Card>
                {l.session ? <Gauge first title="Session" w={l.session} says={l.session.resets ? undefined : `${l.session.percent}% used · Starts with your next request`} now={now} /> : null}
                {l.day ? <Gauge first={!l.session} title="Today" w={l.day} now={now} /> : null}
              </Card>
            </Group>
          ) : null}
          {Object.keys(l.classes).length ? (
            <Group title="By model class" detail="Each class’s share of the billing period, and of its shorter window where the plan sets one.">
              <Card>
                {CLASSES.filter((c) => l.classes[c]).map((c, i) => {
                  const k = l.classes[c]!
                  return (
                    <YStack key={c} data-class={c}>
                      <Gauge first={i === 0} title={NAME[c]} w={k} says={k.paying === 'credits' ? `${k.percent}% used · Paying from credits` : undefined} now={now}>
                        {k.window ? (
                          <XStack gap="$2" items="center" data-slot="plan-short">
                            <SizableText size="$1" color="$soft" shrink={0}>
                              Shorter window
                            </SizableText>
                            <YStack flex={1}>
                              <Bar percent={k.window.percent} state={k.window.state} />
                            </YStack>
                            <SizableText size="$1" color="$soft" shrink={0}>
                              {[`${k.window.percent}%`, when(k.window.resets, now) ? `Resets ${when(k.window.resets, now)}` : ''].filter(Boolean).join(' · ')}
                            </SizableText>
                          </XStack>
                        ) : null}
                      </Gauge>
                    </YStack>
                  )
                })}
              </Card>
            </Group>
          ) : null}
          <Group title="When the allowance runs out" detail="Credits are separate from your plan’s usage allowance. They live in Billing.">
            <Card>
              <Row
                first
                title="Use credits when my plan’s allowance runs out"
                detail={
                  on
                    ? 'On. A model whose included usage is used keeps working, paid from credits — prepaid first, then granted credit where the model takes it — at its list price.'
                    : 'Off. Chat continues on a free model, and other requests wait for the plan to reset.'
                }
                trailing={
                  <Switch aria-label="Use credits when my plan’s allowance runs out" checked={on} disabled={busy} onCheckedChange={(next: boolean) => void choose(next)} />
                }
              />
              <Row
                title="Credits"
                detail={s.balance === 0 ? 'There are no credits to spend yet.' : 'The balance, top-ups and auto-reload.'}
                trailing={
                  <Button size="sm" variant="ghost" onPress={onBilling}>
                    {s.balance === 0 ? 'Add credits' : 'Billing'}
                  </Button>
                }
              />
            </Card>
          </Group>
        </>
      )}
      <Note>{note}</Note>
    </YStack>
  )
}

/** The plan's usage, read as `target`. */
export function Plan({ target, onPlans, onBilling, now }: { target: Target; onPlans?: () => void; onBilling: () => void; now?: number }) {
  const read = useStanding(target)
  if (read.value) return <Reading s={read.value} target={target} onPlans={onPlans} onBilling={onBilling} now={now} />
  return <Soft>{read.error ? read.error.message : 'Reading the plan…'}</Soft>
}
