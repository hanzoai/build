/**
 * Plans: every plan this brand sells, priced as the checkout will charge, with
 * the one the organization is on marked, and the move to another.
 *
 * Buying charges a saved card for the plan's first period at the catalog's
 * price; the platform sells one paid plan at a time, so a move between paid
 * plans is the current one ending first. Going back to Free is ending the paid
 * plan at the close of the period already paid for.
 *
 * Its words are the reader's language (@hanzo/i18n `t`); a plan's name,
 * description, features and price are the catalog's, drawn as given.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
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
  const target = useTarget()
  const { t } = useI18n()
  const signed = Boolean(host.person)
  const list = useRead(() => plans(target), [] as Plan[], [target])
  const subs = useRead(signed ? () => subscriptions(target) : null, [] as Subscription[], [target, signed])
  const cards = useRead(signed ? () => methods(target) : null, [] as Method[], [target, signed])
  const [term, setTerm] = useState<Term>('month')
  const [buying, setBuying] = useState<Plan | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const on = current(subs.value)
  const org = host.org
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
      setNote((e as Error).message)
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
          {t('Current plan')}
        </Button>
      )
    }
    if (p.sales) return <Line>{t('Priced with our team for your organization.')}</Line>
    if (!signed) return <Line>{t('Sign in to choose a plan.')}</Line>
    if (!host.admin) return <Line>{t('An org admin changes the plan.')}</Line>
    if (!settled) return null
    if (free(p)) {
      // A free plan that is not the org's means a paid one is.
      const paid = on!
      if (paid.ending) return <Line>{t('You move to {plan} when {current} ends on {date}.', { plan: p.name, current: paid.name, date: day(paid.ends) })}</Line>
      return (
        <Button size="sm" variant="outline" onPress={() => setLeaving(true)}>
          {t('Switch to {plan}', { plan: p.name })}
        </Button>
      )
    }
    if (on && on.price > 0) return <Line>{t('One paid plan at a time: {current} ends before {plan} begins.', { current: on.name, plan: p.name })}</Line>
    if (!card) {
      return (
        <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
          {t('Add a card to upgrade')}
        </Button>
      )
    }
    return (
      <Button size="sm" variant={p.popular ? 'primary' : 'outline'} onPress={() => setBuying(p)}>
        {t('Upgrade to {plan}', { plan: p.name })}
      </Button>
    )
  }

  return (
    <YStack flex={1} minH={0} overflow="scroll">
      <YStack width="100%" maxW={1100} mx="auto" px="$5" py="$5" gap="$5">
        <XStack
          render="button"
          aria-label={t('Back to billing')}
          items="center"
          gap="$1"
          self="flex-start"
          onPress={() => host.go(path({ kind: 'settings', section: 'billing' }))}
        >
          <ChevronLeft size={16} {...{ 'data-i18n-mirror': '' }} />
          <SizableText size="$2" color="$soft">
            {t('Billing')}
          </SizableText>
        </XStack>
        <XStack items="flex-end" gap="$4" flexWrap="wrap">
          <YStack flex={1} minW={240} gap="$1">
            <SizableText render="h1" size="$7" color="$ink">
              {t('Plans that grow with you')}
            </SizableText>
            <SizableText size="$2" color="$soft">
              {!signed
                ? t('Sign in to see the plan you are on.')
                : on
                  ? org
                    ? t('{org} is on {plan}.', { org, plan: on.name })
                    : t('This organization is on {plan}.', { plan: on.name })
                  : org
                    ? t('{org} is on the free plan.', { org })
                    : t('This organization is on the free plan.')}
            </SizableText>
          </YStack>
          {yearly ? (
            <XStack role="radiogroup" aria-label={t('Billing period')} p="$1" gap="$1" rounded="$10" borderWidth={1} borderColor="$borderColor">
              {(['month', 'year'] as const).map((k) => (
                <XStack
                  key={k}
                  render="button"
                  role="radio"
                  aria-checked={term === k}
                  aria-label={k === 'month' ? t('Monthly') : t('Yearly')}
                  onPress={() => setTerm(k)}
                  px="$3"
                  py="$1.5"
                  rounded="$10"
                  bg={term === k ? '$hover' : 'transparent'}
                >
                  <SizableText size="$2" color={term === k ? '$ink' : '$soft'}>
                    {k === 'month' ? t('Monthly') : t('Yearly')}
                  </SizableText>
                </XStack>
              ))}
            </XStack>
          ) : null}
        </XStack>

        {list.error ? (
          <Line>{list.error.message}</Line>
        ) : list.loading && !list.value.length ? (
          <Line>{t('Reading plans…')}</Line>
        ) : list.value.length === 0 ? (
          <Line>{t('This brand sells no plans.')}</Line>
        ) : (
          <XStack flexWrap="wrap" gap="$4">
            {list.value.map((p) => {
              const cost = price(p, term)
              return (
                <YStack
                  key={p.id}
                  aria-label={t('{plan} plan', { plan: p.name })}
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
                        {t('Current')}
                      </SizableText>
                    ) : p.popular ? (
                      <SizableText size="$1" color="$soft">
                        {t('Popular')}
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
                      {p.sales ? t('Custom') : cost.month === 0 ? t('Free') : money(cost.month, p.currency)}
                    </SizableText>
                    <SizableText size="$1" color="$soft">
                      {p.sales
                        ? t('Talk to us')
                        : cost.month === 0
                          ? t('Forever')
                          : term === 'year' && p.yearly
                            ? p.perSeat
                              ? t('per seat, a month, {price} billed yearly', { price: money(cost.now, p.currency) })
                              : t('a month, {price} billed yearly', { price: money(cost.now, p.currency) })
                            : p.perSeat
                              ? t('per seat, a month')
                              : t('a month')}
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

      <Dialog open={Boolean(buying)} onOpenChange={(o) => !o && setBuying(null)}>
        <DialogContent maxW={420} showCloseButton={false}>
          <DialogTitle>{buying ? t('Upgrade to {plan}', { plan: buying.name }) : t('Upgrade')}</DialogTitle>
          {buying && card ? (
            <YStack gap="$3">
              <SizableText size="$2" color="$soft">
                {term === 'year'
                  ? t('{card} is charged {amount} now, and again every year until you cancel.', { card: label(card), amount: money(price(buying, term).now, buying.currency) })
                  : t('{card} is charged {amount} now, and again every month until you cancel.', { card: label(card), amount: money(price(buying, term).now, buying.currency) })}
              </SizableText>
              <XStack gap="$2" justify="flex-end">
                <Button size="sm" variant="ghost" onPress={() => setBuying(null)}>
                  {t('Not now')}
                </Button>
                <Button
                  size="sm"
                  disabled={working}
                  onPress={() =>
                    void act(async () => {
                      await subscribe(target, { plan: buying.id, interval: yearly && buying.yearly ? term : 'month', method: card.id })
                      return org ? t('{org} is on {plan}', { org, plan: buying.name }) : t('This organization is on {plan}', { plan: buying.name })
                    })
                  }
                >
                  {t('Upgrade')}
                </Button>
              </XStack>
            </YStack>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={leaving} onOpenChange={setLeaving}>
        <DialogContent maxW={420} showCloseButton={false}>
          <DialogTitle>{t('Switch to the free plan?')}</DialogTitle>
          {on ? (
            <YStack gap="$3">
              <SizableText size="$2" color="$soft">
                {day(on.ends)
                  ? t('{plan} stays on until {date}, and nothing is charged after that.', { plan: on.name, date: day(on.ends) })
                  : t('{plan} stays on until the end of this period, and nothing is charged after that.', { plan: on.name })}
              </SizableText>
              <XStack gap="$2" justify="flex-end">
                <Button size="sm" variant="ghost" onPress={() => setLeaving(false)}>
                  {t('Keep {plan}', { plan: on.name })}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={working}
                  onPress={() =>
                    void act(async () => {
                      await cancel(target, on.id)
                      return t('{plan} ends on {date}', { plan: on.name, date: day(on.ends) })
                    })
                  }
                >
                  {t('Switch')}
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
          setNote(t('{card} is saved', { card: label(m) }))
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
