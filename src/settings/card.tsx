/**
 * Adding a card. The card number is typed into the payment processor's own
 * field — its iframe, served from its own host — and never reaches this page or
 * the platform: the field hands back a single-use token, and the platform vaults
 * the card from that. Which processor, and its sandbox or live account, is the
 * platform's answer at /v1/billing/settings, so the card is saved to the account
 * it will be charged on.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { X } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle } from '@hanzo/ui'
import { useEffect, useRef, useState } from 'react'

import { processor, save, type Method, type Processor } from '../api/billing.ts'
import { useRead } from '../data.ts'
import { useTarget } from '../host.tsx'

/** The part of Square's Web Payments SDK this uses. */
interface Field {
  attach(el: HTMLElement): Promise<void>
  tokenize(): Promise<{ status: string; token?: string; errors?: { message?: string }[] }>
  destroy(): Promise<void>
}
interface Sdk {
  payments(application: string, location: string): { card(options?: object): Promise<Field> }
}

declare global {
  interface Window {
    Square?: Sdk
  }
}

/** Anything but production loads the sandbox SDK, so a misread setting never arms real charges. */
export const sdk = (environment: string): string =>
  environment === 'production' ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js'

const loads = new Map<string, Promise<Sdk>>()

function load(environment: string): Promise<Sdk> {
  if (window.Square) return Promise.resolve(window.Square)
  const src = sdk(environment)
  const was = loads.get(src)
  if (was) return was
  const p = new Promise<Sdk>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => (window.Square ? resolve(window.Square) : reject(new Error('The card form did not load')))
    s.onerror = () => {
      loads.delete(src)
      reject(new Error('The card form did not load'))
    }
    document.head.appendChild(s)
  })
  loads.set(src, p)
  return p
}

const ready = (p: Processor | null): p is Processor => Boolean(p && p.provider === 'square' && p.application && p.location)

export function AddCard({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: (m: Method) => void }) {
  const t = useTarget()
  const cfg = useRead(open ? () => processor(t) : null, null as Processor | null, [t, open])
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const field = useRef<Field | null>(null)
  const [mounted, setMounted] = useState(false)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  const p = cfg.value

  useEffect(() => {
    if (!open || !box || !ready(p)) return
    let gone = false
    setMounted(false)
    setNote('')
    load(p.environment)
      .then((square) => square.payments(p.application, p.location).card())
      .then(async (f) => {
        if (gone) {
          void f.destroy().catch(() => {})
          return
        }
        await f.attach(box)
        field.current = f
        setMounted(true)
      })
      .catch((e: unknown) => {
        if (!gone) setNote(e instanceof Error ? e.message : 'The card form did not load')
      })
    return () => {
      gone = true
      const f = field.current
      field.current = null
      setMounted(false)
      if (f) void f.destroy().catch(() => {})
    }
  }, [open, box, p])

  // Save is offered only while the field is drawn.
  const add = async () => {
    const f = field.current!
    setWorking(true)
    setNote('')
    try {
      const r = await f.tokenize()
      if (r.status !== 'OK' || !r.token) throw new Error(r.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'The card details are incomplete')
      const m = await save(t, r.token)
      onSaved(m)
      onOpenChange(false)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The card was not saved')
    } finally {
      setWorking(false)
    }
  }

  const why = cfg.error ? cfg.error.message : !cfg.loading && !ready(p) ? 'This deployment takes no cards yet.' : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={440} showCloseButton={false}>
        <XStack items="center" justify="space-between" gap="$2">
          <DialogTitle>Add a card</DialogTitle>
          <XStack render="button" aria-label="Close" p="$1" onPress={() => onOpenChange(false)}>
            <X size={16} />
          </XStack>
        </XStack>
        <YStack gap="$3">
          {why ? (
            <SizableText size="$2" color="$soft">
              {why}
            </SizableText>
          ) : (
            <>
              <YStack minH={96} aria-label="Card details">
                <div ref={setBox} style={{ minHeight: 96 }} />
                {!mounted && !note ? (
                  <SizableText size="$1" color="$soft">
                    Loading the card form…
                  </SizableText>
                ) : null}
              </YStack>
              <SizableText size="$1" color="$soft">
                {p && p.environment !== 'production'
                  ? 'Sandbox: use a test card. Nothing is charged.'
                  : 'The card number goes to the payment processor, never to Hanzo. Saving it charges nothing.'}
              </SizableText>
            </>
          )}
          {note ? (
            <SizableText size="$2" color="$red10" role="alert">
              {note}
            </SizableText>
          ) : null}
          <XStack gap="$2" justify="flex-end">
            <Button size="sm" variant="ghost" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!mounted || working} onPress={() => void add()}>
              Save card
            </Button>
          </XStack>
        </YStack>
      </DialogContent>
    </Dialog>
  )
}
