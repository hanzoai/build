/**
 * Billing: the plan this organization is on and the way to change it, the cards
 * it pays with, its invoices, and ending the plan. Changing plan is the Plans
 * screen; this page says what is true now.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { CreditCard, Download, Plus, X } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle } from '@hanzo/ui'
import { useState } from 'react'

import {
  cancel,
  current,
  detach,
  invoices,
  label,
  methods,
  money,
  pdf,
  reactivate,
  subscriptions,
  type Invoice,
  type Method,
  type Subscription,
} from '../api/billing.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { path } from '../route.ts'
import { AddCard } from './card.tsx'
import { Card, day, Group, Heading, Note, Row, Soft } from './ui.tsx'

export function Billing() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const subs = useRead(signed ? () => subscriptions(t) : null, [] as Subscription[], [t, signed])
  const cards = useRead(signed ? () => methods(t) : null, [] as Method[], [t, signed])
  const bills = useRead(signed ? () => invoices(t) : null, [] as Invoice[], [t, signed])
  const [adding, setAdding] = useState(false)
  const [ending, setEnding] = useState(false)
  const [open, setOpen] = useState<Invoice | null>(null)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  if (!signed) {
    return (
      <YStack gap="$5">
        <Heading title="Billing" />
        <Soft>Sign in to see this organization’s billing.</Soft>
      </YStack>
    )
  }

  const plan = current(subs.value)
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

  return (
    <YStack gap="$6">
      <Heading title="Billing" detail={`The plan ${host.org ?? 'this organization'} is on, the cards it pays with, and its invoices.`} />

      <XStack items="center" gap="$3" px="$4" py="$4" borderWidth={1} borderColor="$borderColor" rounded="$3" flexWrap="wrap">
        <YStack flex={1} minW={200} gap="$1">
          <SizableText size="$5" color="$ink">
            {subs.loading && !subs.value.length ? 'Reading your plan…' : plan ? `${plan.name} plan` : 'Free plan'}
          </SizableText>
          <SizableText size="$2" color="$soft">
            {subs.error
              ? subs.error.message
              : plan
                ? terms(plan)
                : 'No paid plan. Usage is paid from the balance.'}
          </SizableText>
        </YStack>
        <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: 'plans' }))}>
          Adjust plan
        </Button>
      </XStack>

      <Group
        title="Payment"
        detail="The card a plan renews on and a top-up charges."
        action={
          <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
            <Plus size={14} /> Add card
          </Button>
        }
      >
        {cards.error ? (
          <Soft>{cards.error.message}</Soft>
        ) : cards.loading && !cards.value.length ? (
          <Soft>Reading cards…</Soft>
        ) : cards.value.length === 0 ? (
          <Card>
            <Soft>No card on file.</Soft>
          </Card>
        ) : (
          <Card>
            {cards.value.map((m, i) => (
              <Row
                key={m.id}
                first={i === 0}
                leading={<CreditCard size={16} />}
                title={label(m)}
                detail={[m.expires ? `Expires ${m.expires}` : '', m.default ? 'Default' : ''].filter(Boolean).join(' · ') || undefined}
                trailing={
                  <XStack
                    render="button"
                    aria-label={`Remove ${label(m)}`}
                    p="$1"
                    onPress={() => void act(() => detach(t, m.id), `${label(m)} is removed`, cards.reload)}
                  >
                    <X size={14} />
                  </XStack>
                }
              />
            ))}
          </Card>
        )}
      </Group>

      <Group title="Invoices">
        {bills.error ? (
          <Soft>{bills.error.message}</Soft>
        ) : bills.loading && !bills.value.length ? (
          <Soft>Reading invoices…</Soft>
        ) : bills.value.length === 0 ? (
          <Card>
            <Soft>No invoices yet.</Soft>
          </Card>
        ) : (
          <Card>
            <XStack px="$3" py="$2" gap="$3">
              <SizableText flex={1} size="$1" color="$soft">
                Date
              </SizableText>
              <SizableText width={90} size="$1" color="$soft" style={{ textAlign: 'right' }}>
                Total
              </SizableText>
              <SizableText width={70} size="$1" color="$soft" $max-sm={{ display: 'none' }}>
                Status
              </SizableText>
              <YStack width={64} />
            </XStack>
            {bills.value.map((b) => (
              <XStack key={b.id} items="center" gap="$3" px="$3" py="$2.5" borderTopWidth={1} borderColor="$borderColor">
                <SizableText flex={1} size="$2" color="$ink" numberOfLines={1}>
                  {day(b.date) || b.number || b.id}
                </SizableText>
                <SizableText width={90} size="$2" color="$ink" style={{ textAlign: 'right' }}>
                  {money(b.total, b.currency)}
                </SizableText>
                <SizableText width={70} size="$1" color="$soft" $max-sm={{ display: 'none' }}>
                  {word(b.status)}
                </SizableText>
                <XStack width={64} justify="flex-end">
                  <Button size="sm" variant="ghost" aria-label={`View invoice ${b.number || day(b.date)}`} onPress={() => setOpen(b)}>
                    View
                  </Button>
                </XStack>
              </XStack>
            ))}
          </Card>
        )}
      </Group>

      {plan ? (
        <Group title="Cancellation">
          <Card>
            <Row
              first
              title={plan.ending ? `Your plan ends on ${day(plan.ends)}` : 'Cancel plan'}
              detail={plan.ending ? 'Keep it, and it renews as before.' : 'It runs to the end of the period you paid for, then ends.'}
              trailing={
                plan.ending ? (
                  <Button size="sm" variant="outline" disabled={working} onPress={() => void act(() => reactivate(t, plan.id), 'Your plan renews as before', subs.reload)}>
                    Keep plan
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" disabled={working} onPress={() => setEnding(true)}>
                    Cancel
                  </Button>
                )
              }
            />
          </Card>
        </Group>
      ) : null}

      <Note>{note}</Note>

      <AddCard
        open={adding}
        onOpenChange={setAdding}
        onSaved={(m) => {
          cards.reload()
          setNote(`${label(m)} is saved`)
        }}
      />
      <Ending
        plan={plan}
        open={ending}
        working={working}
        onOpenChange={setEnding}
        onConfirm={() => {
          if (!plan) return
          void act(() => cancel(t, plan.id), `Your plan ends on ${day(plan.ends)}`, () => {
            setEnding(false)
            subs.reload()
          })
        }}
      />
      <Bill invoice={open} onClose={() => setOpen(null)} />
    </YStack>
  )
}

/** What the plan costs, and when it renews or ends. */
function terms(p: Subscription): string {
  const cost = `${money(p.price * p.seats, p.currency)} a ${p.interval}${p.seats > 1 ? ` for ${p.seats} seats` : ''}.`
  return p.ends ? `${cost} ${p.ending ? 'Ends' : 'Renews'} on ${day(p.ends)}.` : cost
}

const word = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '')

function Ending({
  plan,
  open,
  working,
  onOpenChange,
  onConfirm,
}: {
  plan: Subscription | null
  open: boolean
  working: boolean
  onOpenChange: (o: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={420} showCloseButton={false}>
        <DialogTitle>Cancel your plan?</DialogTitle>
        <YStack gap="$3">
          <SizableText size="$2" color="$soft">
            {plan
              ? `${plan.name} stays on until ${day(plan.ends) || 'the end of this period'}, and nothing is charged after that. You can keep it any time before then.`
              : ''}
          </SizableText>
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="ghost" onPress={() => onOpenChange(false)}>
              Keep plan
            </Button>
            <Button size="sm" variant="destructive" disabled={working} onPress={onConfirm}>
              Cancel plan
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
  )
}

/** One invoice, read in the page, with its PDF to keep. */
function Bill({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const t = useTarget()
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const b = invoice

  const keep = async () => {
    if (!b) return
    setWorking(true)
    setNote('')
    try {
      const blob = await pdf(t, b.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${b.number || b.id}.pdf`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The PDF did not download')
    } finally {
      setWorking(false)
    }
  }

  const line = (what: string, cents: number, strong = false) => (
    <XStack key={what} justify="space-between" gap="$3">
      <SizableText size="$2" color={strong ? '$ink' : '$soft'}>
        {what}
      </SizableText>
      <SizableText size="$2" color={strong ? '$ink' : '$soft'}>
        {b ? money(cents, b.currency) : ''}
      </SizableText>
    </XStack>
  )

  return (
    <Dialog open={Boolean(b)} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent maxW={480} showCloseButton={false}>
        <XStack items="center" justify="space-between" gap="$2">
          <DialogTitle>{b?.number ? `Invoice ${b.number}` : 'Invoice'}</DialogTitle>
          <XStack render="button" aria-label="Close" p="$1" onPress={onClose}>
            <X size={16} />
          </XStack>
        </XStack>
        {b ? (
          <YStack gap="$3">
            <SizableText size="$2" color="$soft">
              {[day(b.date), word(b.status), b.start && b.end ? `for ${day(b.start)} – ${day(b.end)}` : ''].filter(Boolean).join(' · ')}
            </SizableText>
            <YStack gap="$1.5" borderTopWidth={1} borderColor="$borderColor" pt="$3">
              {b.lines.length ? b.lines.map((l, i) => line(l.description || `Line ${i + 1}`, l.amount)) : line('Subtotal', b.subtotal)}
            </YStack>
            <YStack gap="$1.5" borderTopWidth={1} borderColor="$borderColor" pt="$3">
              {b.discount ? line('Discount', -b.discount) : null}
              {b.tax ? line('Tax', b.tax) : null}
              {line('Total', b.total, true)}
              {b.credit ? line('Credit applied', -b.credit) : null}
              {line('Paid', b.paid)}
              {b.due ? line('Due', b.due, true) : null}
            </YStack>
            <Note>{note}</Note>
            <XStack justify="flex-end">
              <Button size="sm" variant="outline" disabled={working} onPress={() => void keep()}>
                <Download size={14} /> Download PDF
              </Button>
            </XStack>
          </YStack>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
