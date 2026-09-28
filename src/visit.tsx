/**
 * The page to a visitor: the product's header over New.
 *
 * Signed out there are no runs to list, so the rail gives way to a header —
 * Download (Hanzo Dev, under New, pitch.tsx), Resources, Enterprise, Pricing — and the two
 * doors in, which are one door: IAM's page offers both. New stays the page, and
 * sending from it asks the visitor to sign in with the sentence kept
 * (landing.tsx). Below md the four places fold into one menu beside Log in.
 */
import { Popover, SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronDown, Menu } from '@hanzogui/lucide-icons-2'
import { Button } from '@hanzo/ui'
import { MenuLabel, MenuRow, MenuRule } from '@hanzo/ui/product'
import { useState, type ReactNode } from 'react'

import { useHost } from './host.tsx'

const SITE = 'https://hanzo.ai'

export const PLACES = [
  { label: 'Download', href: '/#features' },
  { label: 'Enterprise', href: `${SITE}/enterprise` },
  { label: 'Pricing', href: `${SITE}/pricing` },
] as const

export const RESOURCES = [
  { label: 'Docs', href: 'https://docs.hanzo.ai' },
  { label: 'Blog', href: `${SITE}/blog` },
  { label: 'Customers', href: `${SITE}/customers` },
  { label: 'Learn', href: `${SITE}/learn` },
  { label: 'Support', href: `${SITE}/support` },
] as const

const leave = (href: string) => window.location.assign(href)

/** One place in the header: an address, drawn as text. */
function Place({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={{ color: 'inherit', textDecoration: 'none' }}>
      <XStack items="center" height={34} px="$2.5" rounded="$3" hoverStyle={{ bg: '$hover' }}>
        <SizableText size="$3" color="$ink">
          {children}
        </SizableText>
      </XStack>
    </a>
  )
}

function Resources() {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} placement="bottom-start" offset={6}>
      <Popover.Trigger asChild>
        <XStack render="button" aria-label="Resources" aria-expanded={open} items="center" gap="$1" height={34} px="$2.5" rounded="$3" hoverStyle={{ bg: '$hover' }}>
          <SizableText size="$3" color="$ink">
            Resources
          </SizableText>
          <ChevronDown size={14} color="$soft" />
        </XStack>
      </Popover.Trigger>
      <Popover.Content role="menu" aria-label="Resources" items="stretch" borderWidth={1} elevation="$2" p="$1" width={220} bg="$panel" borderColor="$borderColor">
        <YStack gap="$1">
          {RESOURCES.map((r) => (
            <MenuRow key={r.label} label={r.label} onPress={() => leave(r.href)} />
          ))}
        </YStack>
      </Popover.Content>
    </Popover>
  )
}

/** Below md: every place, the resources and the door, in one menu. */
function Fold({ onEnter }: { onEnter: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} placement="bottom-end" offset={6} stayInFrame>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Menu">
          <Menu size={18} />
        </Button>
      </Popover.Trigger>
      <Popover.Content role="menu" aria-label="Menu" items="stretch" borderWidth={1} elevation="$2" p="$1" width={260} bg="$panel" borderColor="$borderColor">
        <YStack gap="$1">
          {PLACES.map((p) => (
            <MenuRow key={p.label} label={p.label} onPress={() => leave(p.href)} />
          ))}
          <MenuRule />
          <MenuLabel>Resources</MenuLabel>
          {RESOURCES.map((r) => (
            <MenuRow key={r.label} label={r.label} onPress={() => leave(r.href)} />
          ))}
          <MenuRule />
          <MenuRow
            label="Sign up"
            onPress={() => {
              setOpen(false)
              onEnter()
            }}
          />
        </YStack>
      </Popover.Content>
    </Popover>
  )
}

/** The header a visitor sees. `name` is the wordmark the rail shows once signed in. */
export function Bar({ name }: { name: ReactNode }) {
  const host = useHost()
  const enter = () => host.signIn?.()
  const [features, enterprise, pricing] = PLACES
  return (
    <XStack role="banner" height={60} px="$4" gap="$2" items="center" shrink={0} $md={{ px: '$6' }}>
      {name}
      <XStack role="navigation" aria-label="Site" items="center" gap="$1" ml="$4" $max-md={{ display: 'none' }}>
        <Place href={features.href}>{features.label}</Place>
        <Resources />
        <Place href={enterprise.href}>{enterprise.label}</Place>
        <Place href={pricing.href}>{pricing.label}</Place>
      </XStack>
      <XStack flex={1} />
      <Button variant="ghost" size="sm" onPress={enter}>
        Log in
      </Button>
      <XStack $max-md={{ display: 'none' }}>
        <Button size="sm" variant="primary" onPress={enter}>
          Sign up
        </Button>
      </XStack>
      <XStack $md={{ display: 'none' }}>
        <Fold onEnter={enter} />
      </XStack>
    </XStack>
  )
}
