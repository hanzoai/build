/**
 * Usage: what the plan includes and how much of it is used, what the
 * organization has left to spend and has spent this month, and the monthly
 * limit that stops spend past it. Buying more charges the saved card into the
 * balance; the limit is an org admin's to set.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Button, Input } from '@hanzo/ui'
import { useState } from 'react'

import {
  balance,
  caps,
  cents,
  chosen,
  credit,
  label,
  lift,
  limit,
  methods,
  money,
  month,
  monthly,
  spend,
  topup,
  type Cap,
  type Method,
  type Month,
  type Spend,
} from '../api/billing.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { path } from '../route.ts'
import { Card, day, Group, Heading, Note, Row, Soft } from './ui.tsx'

const SPAN: Record<string, string> = { hour: 'This hour', day: 'Today', week: 'This week', month: 'This month' }

/** A thin bar: how much of a whole is used. */
function Bar({ part, whole, limit }: { part: number; whole: number; limit: boolean }) {
  const pct = whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0
  return (
    <YStack height={6} rounded={999} bg="$hover" overflow="hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <YStack height={6} width={`${pct}%`} rounded={999} bg={limit && pct >= 100 ? '$red10' : '$ink'} />
    </YStack>
  )
}

/**
 * One measured row: what, how much, when it starts over, and its bar. A limit's
 * bar turns red when it is used up; a share of a total never does.
 */
function Meter({ title, used, of, says, first, limit = true }: { title: string; used: number; of: number; says: string; first?: boolean; limit?: boolean }) {
  return (
    <YStack gap="$2" px="$3" py="$3" borderTopWidth={first ? 0 : 1} borderColor="$borderColor">
      <XStack items="baseline" justify="space-between" flexWrap="wrap" columnGap="$3" rowGap="$1">
        <SizableText size="$2" color="$ink">
          {title}
        </SizableText>
        <SizableText size="$1" color="$soft">
          {says}
        </SizableText>
      </XStack>
      <Bar part={used} whole={of} limit={limit} />
    </YStack>
  )
}

/** `in 3 hr 12 min` or `Oct 1, 2026`, for when a window starts over. */
function resets(iso: string): string {
  const at = iso ? new Date(iso).getTime() : NaN
  if (Number.isNaN(at)) return ''
  const mins = Math.round((at - Date.now()) / 60000)
  if (mins <= 0) return 'Resets now'
  if (mins < 60) return `Resets in ${mins} min`
  if (mins < 24 * 60) return `Resets in ${Math.floor(mins / 60)} hr ${mins % 60} min`
  return `Resets ${day(iso)}`
}

export function Usage() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const plan = useRead(signed ? () => month(t) : null, null as Month | null, [t, signed])
  const left = useRead(signed ? () => balance(t) : null, 0, [t, signed])
  const granted = useRead(signed ? () => credit(t) : null, 0, [t, signed])
  const spent = useRead(signed ? () => spend(t) : null, null as Spend | null, [t, signed])
  const ceilings = useRead(signed ? () => caps(t) : null, [] as Cap[], [t, signed])
  const cards = useRead(signed ? () => methods(t) : null, [] as Method[], [t, signed])
  const [buying, setBuying] = useState(false)
  const [amount, setAmount] = useState('25')
  const [ceiling, setCeiling] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Usage" />
        <Soft>Sign in to see this organization’s usage.</Soft>
      </YStack>
    )
  }

  const act = async (what: () => Promise<unknown>, done: string, after: () => void) => {
    setWorking(true)
    setNote('')
    try {
      await what()
      after()
      setNote(done)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setWorking(false)
    }
  }

  const m = plan.value
  const windows = (m?.windows ?? []).filter((w) => w.limit > 0)
  const card = chosen(cards.value)
  const cap = monthly(ceilings.value)
  const others = ceilings.value.filter((c) => c !== cap)
  const s = spent.value
  const top = Math.max(0, ...(s?.categories ?? []).map((c) => c.cents))

  const buy = () => {
    const c = cents(amount)
    if (!c) {
      setNote('Enter an amount in dollars')
      return
    }
    if (!card) return
    void act(() => topup(t, c, card.id), `${money(c)} is added to the balance`, () => {
      setBuying(false)
      left.reload()
    })
  }

  const setLimit = () => {
    const c = cents(ceiling)
    if (!c) {
      setNote('Enter a monthly limit in dollars')
      return
    }
    void act(() => limit(t, ceilings.value, c), `Spend stops at ${money(c)} a month`, () => {
      setCeiling('')
      ceilings.reload()
    })
  }

  return (
    <YStack gap="$6">
      <Heading title="Usage" detail={`What ${host.org ?? 'this organization'} has used, has left, and may spend.`} />

      <Group title="Plan usage limits" detail={m?.plan ? `Included with ${m.plan}.` : 'What the plan includes.'}>
        {plan.error ? (
          <Soft>{plan.error.message}</Soft>
        ) : plan.loading && !m ? (
          <Soft>Reading the plan’s limits…</Soft>
        ) : !m || (windows.length === 0 && m.included === 0) ? (
          <Card>
            <Soft>This plan sets no usage limits. Usage is paid from the balance.</Soft>
          </Card>
        ) : (
          <Card>
            {m.included > 0 ? (
              <Meter
                first
                title="Included spend"
                used={m.used}
                of={m.included}
                says={`${money(m.used)} of ${money(m.included)}${m.overage ? ` · ${money(m.overage)} over` : ''}`}
              />
            ) : null}
            {windows.map((w, i) => (
              <Meter
                key={w.span}
                first={i === 0 && m.included === 0}
                title={`${SPAN[w.span] ?? w.span} · ${w.used.toLocaleString()} of ${w.limit.toLocaleString()} requests`}
                used={w.used}
                of={w.limit}
                says={`${Math.round((Math.min(w.used, w.limit) / w.limit) * 100)}% used${resets(w.resets) ? ` · ${resets(w.resets)}` : ''}`}
              />
            ))}
          </Card>
        )}
      </Group>

      <Group
        title="Balance"
        detail="Prepaid money pays for usage past the plan. Credits are spent first."
        action={
          buying || !host.admin ? undefined : (
            <Button size="sm" variant="outline" onPress={() => setBuying(true)}>
              Buy more
            </Button>
          )
        }
      >
        <Card>
          <Row first title="Balance" detail="What is left to spend" trailing={<Figure read={left} />} />
          <Row title="Credits" detail="Granted, and spent before the balance" trailing={<Figure read={granted} />} />
          <Row
            title="Spent this month"
            detail={s && !s.known ? 'The ledger did not answer, so this is not a measurement' : undefined}
            trailing={<Figure read={{ ...spent, value: s?.total ?? 0 }} />}
          />
          {buying ? (
            <YStack gap="$2" px="$3" py="$3" borderTopWidth={1} borderColor="$borderColor">
              {card ? (
                <>
                  <XStack gap="$2" items="center" flexWrap="wrap">
                    <YStack width={140}>
                      <Input value={amount} onChangeText={setAmount} aria-label="Amount in dollars" placeholder="25" inputMode="decimal" />
                    </YStack>
                    <SizableText flex={1} minW={160} size="$1" color="$soft">
                      Charged to {label(card)}
                    </SizableText>
                  </XStack>
                  <XStack gap="$2" justify="flex-end">
                    <Button size="sm" variant="ghost" onPress={() => setBuying(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" disabled={working} onPress={buy}>
                      {cents(amount) ? `Add ${money(cents(amount) ?? 0)}` : 'Add funds'}
                    </Button>
                  </XStack>
                </>
              ) : (
                <XStack gap="$2" items="center" flexWrap="wrap">
                  <SizableText flex={1} minW={160} size="$2" color="$soft">
                    {cards.loading ? 'Reading cards…' : 'Add a card in Billing to buy more.'}
                  </SizableText>
                  <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'settings', section: 'billing' }))}>
                    Billing
                  </Button>
                </XStack>
              )}
            </YStack>
          ) : null}
        </Card>
      </Group>

      <Group title="Spend this month" detail="By what it paid for.">
        {spent.error ? (
          <Soft>{spent.error.message}</Soft>
        ) : !s ? (
          <Soft>Reading spend…</Soft>
        ) : s.categories.length === 0 ? (
          <Card>
            <Soft>Nothing spent this month.</Soft>
          </Card>
        ) : (
          <Card>
            {s.categories.map((c, i) => (
              <Meter key={c.name} first={i === 0} title={c.name} used={c.cents} of={top} says={money(c.cents)} limit={false} />
            ))}
          </Card>
        )}
      </Group>

      <Group title="Monthly limit" detail="Spend past it is refused until the month starts over.">
        {ceilings.error ? (
          <Soft>{ceilings.error.message}</Soft>
        ) : (
          <Card>
            {cap ? (
              <Meter
                first
                title={`${money(cap.threshold)} a month`}
                used={cap.spent ?? 0}
                of={cap.threshold}
                says={[cap.spent === null ? 'Spend unknown' : `${money(cap.spent)} spent`, resets(cap.resets)].filter(Boolean).join(' · ')}
              />
            ) : (
              <Row first title="No monthly limit" detail="Spend is bounded by the balance alone." />
            )}
            {others.map((c) => (
              <Row
                key={c.id}
                title={c.title || 'Limit'}
                detail={[c.project && `project ${c.project}`, c.service && `service ${c.service}`, c.enforce ? 'refuses spend past it' : 'warns only']
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <SizableText size="$2" color="$ink">
                    {c.threshold ? money(c.threshold) : '—'}
                  </SizableText>
                }
              />
            ))}
            {host.admin ? (
              <XStack gap="$2" items="center" px="$3" py="$3" borderTopWidth={1} borderColor="$borderColor" flexWrap="wrap">
                <YStack width={160}>
                  <Input value={ceiling} onChangeText={setCeiling} aria-label="Monthly limit in dollars" placeholder={cap ? String(cap.threshold / 100) : '500'} inputMode="decimal" />
                </YStack>
                <XStack flex={1} gap="$2" justify="flex-end">
                  {cap ? (
                    <Button size="sm" variant="ghost" disabled={working} onPress={() => void act(() => lift(t, cap.id), 'The monthly limit is lifted', ceilings.reload)}>
                      Remove
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={working || !ceiling.trim()} onPress={setLimit}>
                    {cap ? 'Change limit' : 'Set limit'}
                  </Button>
                </XStack>
              </XStack>
            ) : null}
          </Card>
        )}
        {!host.admin ? (
          <SizableText size="$1" color="$soft">
            An org admin sets the monthly limit.
          </SizableText>
        ) : null}
      </Group>

      <Note>{note}</Note>
    </YStack>
  )
}

/** A money figure as read: the amount, or why there is none. */
function Figure({ read }: { read: { value: number; error: Error | null; loading: boolean } }) {
  return (
    <SizableText size="$2" color={read.error ? '$soft' : '$ink'} numberOfLines={1} maxW={200}>
      {read.error ? 'Unavailable' : read.loading ? '…' : money(read.value)}
    </SizableText>
  )
}
