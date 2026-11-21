/**
 * Billing: the plan this organization is on and the way to change it, its
 * credits (`Credits`: the balance, grants, top-ups, auto-reload, this month's
 * spend and its limit), the cards it pays with, its invoices, and ending the
 * plan. Changing plan is the Plans screen; this page says what is true now.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { CreditCard, Download, Plus, X } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, Input, toast } from '@hanzo/ui'
import { useEffect, useState } from 'react'

import {
  cancel,
  chosen,
  current,
  detach,
  formatAddress,
  invoices,
  label,
  makeDefault,
  methods,
  money,
  pdf,
  reactivate,
  subscriptions,
  tier,
  updateMethod,
  type Address,
  type Invoice,
  type Method,
  type Subscription,
} from '../api/billing.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Title } from '../meter.tsx'
import { label as named } from '../plan.ts'
import { path } from '../route.ts'
import { AddCard } from './card.tsx'
import { Credits } from './credits.tsx'
import { Card, day, Field, Group, Heading, Note, Row, Soft } from './ui.tsx'

export function Billing() {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const subs = useRead(signed ? () => subscriptions(t) : null, [] as Subscription[], [t, signed])
  const cards = useRead(signed ? () => methods(t) : null, [] as Method[], [t, signed])
  const bills = useRead(signed ? () => invoices(t) : null, [] as Invoice[], [t, signed])
  const billed = useRead(signed ? () => tier(t) : null, null, [t, signed])
  const [adding, setAdding] = useState(false)
  const [ending, setEnding] = useState(false)
  const [editingBilling, setEditingBilling] = useState<Method | null>(null)
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
  // The plan by its family, `Max` with `20x` beside it; the subscription names
  // it, else the rung billing serves.
  const title = named(plan?.plan || billed.value?.plan, billed.value?.tier) ?? (plan ? { name: plan.name, tag: '' } : null)
  // Nothing is said about the plan until both reads have answered: a page that
  // has not asked yet is not a page on Free.
  const reading = (subs.loading && !subs.value.length) || (billed.value === null && !billed.error && !subs.error)
  const empty = !cards.error && !cards.loading && cards.value.length === 0
  const defaultCard = chosen(cards.value)

  // A done act is a toast; a refused one stays on the page, beside what was tried.
  const act = async (what: () => Promise<unknown>, done: string, after: () => void) => {
    setWorking(true)
    setNote('')
    try {
      await what()
      after()
      toast.success(done)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <YStack gap="$6">
      <Heading title="Billing" detail={`The plan ${host.org ?? 'this organization'} is on, the cards it pays with, and its invoices.`} />

      <XStack items="center" gap="$3" px="$4" py="$4" borderWidth={1} borderColor="$borderColor" rounded="$3" flexWrap="wrap">
        <YStack flex={1} minW={200} gap="$1" data-slot="billing-plan">
          {reading ? (
            <SizableText size="$5" color="$ink">
              Reading your plan…
            </SizableText>
          ) : (
            <Title label={title ?? { name: 'Free', tag: '' }} size="$5" />
          )}
          <SizableText size="$2" color="$soft">
            {subs.error ? subs.error.message : plan ? terms(plan) : title ? 'Your plan.' : 'No paid plan. Usage is paid from credits.'}
          </SizableText>
        </YStack>
        <Button size="sm" variant="outline" onPress={() => host.go(path({ kind: 'screen', screen: 'plans' }))}>
          Adjust plan
        </Button>
      </XStack>

      <Credits target={t} admin={host.admin} onCard={() => setAdding(true)} />

      <Group
        title="Payment"
        detail="The card a plan renews on and a top-up charges."
        action={
          host.admin && (cards.error || cards.value.length > 0) ? (
            <Button size="sm" variant="outline" onPress={() => setAdding(true)}>
              <Plus size={14} /> Add card
            </Button>
          ) : undefined
        }
      >
        {cards.error ? (
          <Soft>{cards.error.message}</Soft>
        ) : cards.loading && !cards.value.length ? (
          <Soft>Reading cards…</Soft>
        ) : empty ? (
          <XStack items="center" gap="$3" px="$4" py="$4" borderWidth={1} borderColor="$borderColor" rounded="$3" flexWrap="wrap">
            <CreditCard size={20} />
            <YStack flex={1} minW={180} gap="$1">
              <SizableText size="$3" color="$ink">
                No card on file.
              </SizableText>
              <SizableText size="$2" color="$soft">
                {host.admin ? 'Add one to pay for a plan or a top-up. Adding it charges nothing.' : 'An org admin adds cards.'}
              </SizableText>
            </YStack>
            {host.admin ? (
              <Button variant="primary" onPress={() => setAdding(true)}>
                <Plus size={16} /> Add card
              </Button>
            ) : null}
          </XStack>
        ) : (
          <Card>
            {cards.value.map((m, i) => (
              <Row
                key={m.id}
                first={i === 0}
                leading={<CreditCard size={16} />}
                title={label(m)}
                detail={
                  [
                    m.expires ? `Expires ${m.expires}` : '',
                    m.default ? 'Default' : '',
                    m.billingAddress ? formatAddress(m.billingAddress) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                trailing={
                  host.admin ? (
                    <XStack gap="$2" items="center">
                      {!m.default ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Make ${label(m)} default`}
                          disabled={working}
                          onPress={() => void act(() => makeDefault(t, m.id), `${label(m)} is now the default`, cards.reload)}
                        >
                          Make default
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit billing info for ${label(m)}`}
                        disabled={working}
                        onPress={() => setEditingBilling(m)}
                      >
                        Edit info
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${label(m)}`}
                        disabled={working}
                        onPress={() => void act(() => detach(t, m.id), `${label(m)} is removed`, cards.reload)}
                      >
                        Remove
                      </Button>
                    </XStack>
                  ) : undefined
                }
              />
            ))}
          </Card>
        )}
        {!host.admin && cards.value.length ? (
          <SizableText size="$1" color="$soft">
            An org admin adds and removes cards.
          </SizableText>
        ) : null}
      </Group>

      <Group
        title="Billing details"
        detail="Information printed on invoices and payment receipts."
        action={
          host.admin && defaultCard ? (
            <Button size="sm" variant="outline" onPress={() => setEditingBilling(defaultCard)}>
              {defaultCard.billingAddress ? 'Edit details' : 'Add billing info'}
            </Button>
          ) : undefined
        }
      >
        {defaultCard?.billingAddress ? (
          <Card>
            <YStack p="$3" gap="$1.5">
              {defaultCard.billingAddress.name ? (
                <SizableText size="$3" color="$ink" style={{ fontWeight: 600 }}>
                  {defaultCard.billingAddress.name}
                </SizableText>
              ) : null}
              {defaultCard.billingAddress.line1 ? (
                <SizableText size="$2" color="$soft">
                  {defaultCard.billingAddress.line1}
                  {defaultCard.billingAddress.line2 ? `, ${defaultCard.billingAddress.line2}` : ''}
                </SizableText>
              ) : null}
              {defaultCard.billingAddress.city || defaultCard.billingAddress.state || defaultCard.billingAddress.postalCode ? (
                <SizableText size="$2" color="$soft">
                  {[defaultCard.billingAddress.city, defaultCard.billingAddress.state, defaultCard.billingAddress.postalCode]
                    .filter(Boolean)
                    .join(' ')}
                </SizableText>
              ) : null}
              {defaultCard.billingAddress.country ? (
                <SizableText size="$2" color="$soft">
                  {defaultCard.billingAddress.country}
                </SizableText>
              ) : null}
            </YStack>
          </Card>
        ) : (
          <XStack items="center" justify="space-between" gap="$3" px="$4" py="$3" borderWidth={1} borderColor="$borderColor" rounded="$3" flexWrap="wrap">
            <YStack flex={1} minW={180} gap="$1">
              <SizableText size="$2" color="$ink">
                No billing address on file.
              </SizableText>
              <SizableText size="$1" color="$soft">
                Add your company name and address so they appear on monthly invoices and receipts.
              </SizableText>
            </YStack>
            {host.admin ? (
              <Button
                size="sm"
                variant="outline"
                onPress={() => (defaultCard ? setEditingBilling(defaultCard) : setAdding(true))}
              >
                <Plus size={14} /> {defaultCard ? 'Add billing info' : 'Set billing info'}
              </Button>
            ) : null}
          </XStack>
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
                !host.admin ? undefined : plan.ending ? (
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
          toast.success(`${label(m)} is saved`)
        }}
      />
      <EditBilling
        open={editingBilling !== null}
        onOpenChange={(o) => !o && setEditingBilling(null)}
        card={editingBilling}
        onSaved={() => {
          cards.reload()
        }}
      />
      {plan ? (
        <Ending
          plan={plan}
          open={ending}
          working={working}
          onOpenChange={setEnding}
          onConfirm={() =>
            void act(() => cancel(t, plan.id), `Your plan ends on ${day(plan.ends)}`, () => {
              setEnding(false)
              subs.reload()
            })
          }
        />
      ) : null}
      {open ? <Bill invoice={open} onClose={() => setOpen(null)} /> : null}
    </YStack>
  )
}

function EditBilling({
  open,
  onOpenChange,
  card,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  card: Method | null
  onSaved: () => void
}) {
  const t = useTarget()
  const [name, setName] = useState('')
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [city, setCity] = useState('')
  const [stateVal, setStateVal] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('US')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (card?.billingAddress) {
      setName(card.billingAddress.name ?? '')
      setLine1(card.billingAddress.line1 ?? '')
      setLine2(card.billingAddress.line2 ?? '')
      setCity(card.billingAddress.city ?? '')
      setStateVal(card.billingAddress.state ?? '')
      setPostalCode(card.billingAddress.postalCode ?? '')
      setCountry(card.billingAddress.country ?? 'US')
    } else {
      setName('')
      setLine1('')
      setLine2('')
      setCity('')
      setStateVal('')
      setPostalCode('')
      setCountry('US')
    }
    setNote('')
  }, [card])

  const save = async () => {
    if (!card) return
    setWorking(true)
    setNote('')
    try {
      const address: Address = {
        name: name.trim() || undefined,
        line1: line1.trim() || undefined,
        line2: line2.trim() || undefined,
        city: city.trim() || undefined,
        state: stateVal.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        country: country.trim() || undefined,
      }
      await updateMethod(t, card.id, { billingAddress: address })
      onSaved()
      onOpenChange(false)
      toast.success('Billing details updated')
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={460} showCloseButton={false}>
        <XStack items="center" justify="space-between" gap="$2">
          <DialogTitle>Billing details</DialogTitle>
          <XStack render="button" aria-label="Close" p="$1" onPress={() => onOpenChange(false)}>
            <X size={16} />
          </XStack>
        </XStack>
        <YStack gap="$3">
          <SizableText size="$2" color="$soft">
            These details appear on your invoices and receipts.
          </SizableText>
          <Field label="Business or personal name">
            <Input value={name} onChangeText={setName} placeholder="e.g. Webby AI, Inc. or Joshua Lynch" />
          </Field>
          <Field label="Address line 1">
            <Input value={line1} onChangeText={setLine1} placeholder="Street address or P.O. Box" />
          </Field>
          <Field label="Address line 2" hint="Optional">
            <Input value={line2} onChangeText={setLine2} placeholder="Suite, unit, building, floor" />
          </Field>
          <XStack gap="$2">
            <YStack flex={1}>
              <Field label="City">
                <Input value={city} onChangeText={setCity} placeholder="City" />
              </Field>
            </YStack>
            <YStack width={100}>
              <Field label="State">
                <Input value={stateVal} onChangeText={setStateVal} placeholder="State / Prov" />
              </Field>
            </YStack>
          </XStack>
          <XStack gap="$2">
            <YStack flex={1}>
              <Field label="Postal / ZIP code">
                <Input value={postalCode} onChangeText={setPostalCode} placeholder="ZIP or Postal Code" />
              </Field>
            </YStack>
            <YStack width={110}>
              <Field label="Country">
                <Input value={country} onChangeText={setCountry} placeholder="Country (US)" />
              </Field>
            </YStack>
          </XStack>
          {note ? (
            <SizableText size="$2" color="$red10" role="alert">
              {note}
            </SizableText>
          ) : null}
          <XStack gap="$2" justify="flex-end" pt="$2">
            <Button size="sm" variant="ghost" disabled={working} onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={working} onPress={() => void save()}>
              Save details
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
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
  plan: Subscription
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
            {`${plan.name} stays on until ${day(plan.ends) || 'the end of this period'}, and nothing is charged after that. You can keep it any time before then.`}
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

/** One invoice, read in the page, with its PDF to keep. Drawn while it is open, so each opens anew. */
function Bill({ invoice: b, onClose }: { invoice: Invoice; onClose: () => void }) {
  const t = useTarget()
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)

  const keep = async () => {
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
      setNote((e as Error).message)
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
        {money(cents, b.currency)}
      </SizableText>
    </XStack>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent maxW={480} showCloseButton={false}>
        <XStack items="center" justify="space-between" gap="$2">
          <DialogTitle>{b.number ? `Invoice ${b.number}` : 'Invoice'}</DialogTitle>
          <XStack render="button" aria-label="Close" p="$1" onPress={onClose}>
            <X size={16} />
          </XStack>
        </XStack>
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
      </DialogContent>
    </Dialog>
  )
}
