/**
 * Plans: every plan this brand sells, priced as the checkout will charge, with
 * the one the organization is on marked, and the move to another.
 *
 * Buying charges a saved card for the plan's first period at the catalog's
 * price; the platform sells one paid plan at a time, so a move between paid
 * plans is the current one ending first. Going back to Free is ending the paid
 * plan at the close of the period already paid for.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Check, ChevronLeft } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle } from '@hanzo/ui'
import { useState } from 'react'

import { cancel, chosen, current, label, methods, money, plans, subscribe, subscriptions, type Method, type Plan, type Subscription } from './api/billing.ts'
import { useRead } from './data.ts'
import { useHost, useTarget } from './host.tsx'
import { path } from './route.ts'
import { AddCard } from './settings/card.tsx'
import { day } from './settings/ui.tsx'

type Term = 'month' | 'year'

/** What a plan costs a month on a term, and what the term charges at once. */
function price(p: Plan, term: Term): { month: number; now: number } {
  const month = term === 'year' && p.yearly ? p.yearly : p.monthly
  return { month, now: term === 'year' && p.yearly ? p.yearly * 12 : p.monthly }
}

export function Plans() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const list = useRead(() => plans(t), [] as Plan[], [t])
  const subs = useRead(signed ? () => subscriptions(t) : null, [] as Subscription[], [t, signed])
  const cards = useRead(signed ? () => methods(t) : null, [] as Method[], [t, signed])
  const [term, setTerm] = useState<Term>('month')
  const [buying, setBuying] = useState<Plan | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const on = current(subs.value)
  const card = chosen(cards.value)
  const yearly = list.value.some((p) => p.yearly > 0)
  const free = (p: Plan) => p.monthly === 0 && !p.sales
  const mine = (p: Plan) => signed && (on ? p.id === on.plan : free(p))
  // Until the plan and the cards are read, no move is offered: it would be a guess.
  const settled = signed && !(subs.loading && !subs.value.length) && !(cards.loading && !cards.value.length)

  const act = async (what: () => Promise<string>) => {
    setWorking(true)
    setNote('')
    try {
      setNote(await what())
      subs.reload()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setWorking(false)
      setBuying(null)
      setLeaving(false)
    }
  }

  /** The one thing a card can do, or a line saying why it does nothing. */
  const move = (p: Plan) => {
    if (mine(p)) {
      return (
        <Button size="sm" variant="outline" disabled>
          Current plan
        </Button>
      )
    }
    if (p.sales) return <Line>Priced with our team for your organization.</Line>
    if (!signed) return <Line>Sign in to choose a plan.</Line>
    if (!host.admin) return <Line>An org admin changes the plan.</Line>
    if (!settled) return null
    if (free(p)) {
      if (!on) return null
      if (on.ending) return <Line>{`You move to ${p.name} when ${on.name} ends on ${day(on.ends)}.`}</Line>
      return (
        <Button size="sm" variant="outline" onPress={() => setLeaving(true)}>
          {`Switch to ${p.name}`}
        </Button>
      )
    }
    if (on && on.price > 0) return <Line>{`One paid plan at a time: ${on.name} ends before ${p.name} begins.`}</Line>
    if (!card) {
      return (
        <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
          Add a card to upgrade
        </Button>
      )
    }
    return (
      <Button size="sm" variant={p.popular ? 'primary' : 'outline'} onPress={() => setBuying(p)}>
        {`Upgrade to ${p.name}`}
      </Button>
    )
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll">
      <YStack width="100%" maxW={1100} mx="auto" px="$5" py="$5" gap="$5">
        <XStack
          render="button"
          aria-label="Back to billing"
          items="center"
          gap="$1"
          self="flex-start"
          onPress={() => host.go(path({ kind: 'settings', section: 'billing' }))}
        >
          <ChevronLeft size={16} />
          <SizableText size="$2" color="$soft">
            Billing
          </SizableText>
        </XStack>
        <XStack items="flex-end" gap="$4" flexWrap="wrap">
          <YStack flex={1} minW={240} gap="$1">
            <SizableText render="h1" size="$7" color="$ink">
              Plans that grow with you
            </SizableText>
            <SizableText size="$2" color="$soft">
              {!signed
                ? 'Sign in to see the plan you are on.'
                : on
                  ? `${host.org ?? 'This organization'} is on ${on.name}.`
                  : `${host.org ?? 'This organization'} is on the free plan.`}
            </SizableText>
          </YStack>
          {yearly ? (
            <XStack role="radiogroup" aria-label="Billing period" p="$1" gap="$1" rounded="$10" borderWidth={1} borderColor="$borderColor">
              {(['month', 'year'] as const).map((k) => (
                <XStack
                  key={k}
                  render="button"
                  role="radio"
                  aria-checked={term === k}
                  aria-label={k === 'month' ? 'Monthly' : 'Yearly'}
                  onPress={() => setTerm(k)}
                  px="$3"
                  py="$1.5"
                  rounded="$10"
                  bg={term === k ? '$hover' : 'transparent'}
                >
                  <SizableText size="$2" color={term === k ? '$ink' : '$soft'}>
                    {k === 'month' ? 'Monthly' : 'Yearly'}
                  </SizableText>
                </XStack>
              ))}
            </XStack>
          ) : null}
        </XStack>

        {list.error ? (
          <Line>{list.error.message}</Line>
        ) : list.loading && !list.value.length ? (
          <Line>Reading plans…</Line>
        ) : list.value.length === 0 ? (
          <Line>This brand sells no plans.</Line>
        ) : (
          <XStack flexWrap="wrap" gap="$4">
            {list.value.map((p) => {
              const cost = price(p, term)
              return (
                <YStack
                  key={p.id}
                  aria-label={`${p.name} plan`}
                  flex={1}
                  minW={240}
                  maxW={360}
                  $max-sm={{ maxW: '100%' }}
                  gap="$3"
                  p="$4"
                  rounded="$4"
                  borderWidth={1}
                  borderColor={mine(p) || p.popular ? '$ink' : '$borderColor'}
                  bg="$panel"
                >
                  <XStack items="center" gap="$2">
                    <SizableText flex={1} size="$5" color="$ink">
                      {p.name}
                    </SizableText>
                    {mine(p) ? (
                      <SizableText size="$1" color="$soft">
                        Current
                      </SizableText>
                    ) : p.popular ? (
                      <SizableText size="$1" color="$soft">
                        Popular
                      </SizableText>
                    ) : null}
                  </XStack>
                  {p.description ? (
                    <SizableText size="$2" color="$soft">
                      {p.description}
                    </SizableText>
                  ) : null}
                  <YStack gap="$0.5">
                    <SizableText size="$7" color="$ink">
                      {p.sales ? 'Custom' : cost.month === 0 ? 'Free' : money(cost.month, p.currency)}
                    </SizableText>
                    <SizableText size="$1" color="$soft">
                      {p.sales
                        ? 'Talk to us'
                        : cost.month === 0
                          ? 'Forever'
                          : `${p.perSeat ? 'per seat, ' : ''}a month${term === 'year' && p.yearly ? `, ${money(cost.now, p.currency)} billed yearly` : ''}`}
                    </SizableText>
                  </YStack>
                  <XStack>{move(p)}</XStack>
                  {p.features.length ? (
                    <YStack gap="$2" borderTopWidth={1} borderColor="$borderColor" pt="$3">
                      {p.features.map((f) => (
                        <XStack key={f} gap="$2" items="flex-start">
                          <YStack pt={2}>
                            <Check size={14} />
                          </YStack>
                          <SizableText flex={1} size="$2" color="$soft">
                            {f}
                          </SizableText>
                        </XStack>
                      ))}
                    </YStack>
                  ) : null}
                </YStack>
              )
            })}
          </XStack>
        )}
        {note ? (
          <SizableText size="$2" color="$soft" role="status">
            {note}
          </SizableText>
        ) : null}
      </YStack>

      <Dialog open={Boolean(buying)} onOpenChange={(o) => (o ? undefined : setBuying(null))}>
        <DialogContent maxW={420} showCloseButton={false}>
          <DialogTitle>{buying ? `Upgrade to ${buying.name}` : 'Upgrade'}</DialogTitle>
          {buying && card ? (
            <YStack gap="$3">
              <SizableText size="$2" color="$soft">
                {`${label(card)} is charged ${money(price(buying, term).now, buying.currency)} now, and again every ${term} until you cancel.`}
              </SizableText>
              <XStack gap="$2" justify="flex-end">
                <Button size="sm" variant="ghost" onPress={() => setBuying(null)}>
                  Not now
                </Button>
                <Button
                  size="sm"
                  disabled={working}
                  onPress={() =>
                    void act(async () => {
                      await subscribe(t, { plan: buying.id, interval: yearly && buying.yearly ? term : 'month', method: card.id })
                      return `${host.org ?? 'This organization'} is on ${buying.name}`
                    })
                  }
                >
                  Upgrade
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent maxW={420} showCloseButton={false}>
          <DialogTitle>Switch to the free plan?</DialogTitle>
          {on ? (
            <YStack gap="$3">
              <SizableText size="$2" color="$soft">
                {`${on.name} stays on until ${day(on.ends) || 'the end of this period'}, and nothing is charged after that.`}
              </SizableText>
              <XStack gap="$2" justify="flex-end">
                <Button size="sm" variant="ghost" onPress={() => setLeaving(false)}>
                  {`Keep ${on.name}`}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={working}
                  onPress={() =>
                    void act(async () => {
                      await cancel(t, on.id)
                      return `${on.name} ends on ${day(on.ends)}`
                    })
                  }
                >
                  Switch
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </DialogContent>
      </Dialog>

      <AddCard
        open={adding}
        onOpenChange={setAdding}
        onSaved={(m) => {
          cards.reload()
          setNote(`${label(m)} is saved`)
        }}
      />
    </YStack>
  )
}

function Line({ children }: { children: string }) {
  return (
    <SizableText size="$2" color="$soft">
      {children}
    </SizableText>
  )
}
