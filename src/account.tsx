/**
 * The rail's two small dialogs: the account (the caret by the email), and
 * finding a run by name (the search icon).
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { LogOut, Settings } from '@hanzogui/lucide-icons-2'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@hanzo/ui'
import type { RailSession } from '@hanzo/ui/chat'
import { useMemo, useState } from 'react'

import { useHost } from './host.tsx'

let reveal: (() => void) | null = null

/** The builder listens, so a settings control on this page opens the account dialog. */
export function onAccount(fn: () => void): () => void {
  reveal = fn
  return () => {
    if (reveal === fn) reveal = null
  }
}

export function revealAccount(): void {
  reveal?.()
}

/** A settings address on another host. This page's own account is the dialog itself. */
function accountSettings(href: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URL(href, window.location.origin).origin !== window.location.origin
  } catch {
    return false
  }
}

export function Account({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const host = useHost()
  const who = host.person
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={360}>
        <DialogTitle>Account</DialogTitle>
        <YStack gap="$1">
          <SizableText size="$3" color="$ink" numberOfLines={1}>
            {who?.name || who?.email || 'Signed out'}
          </SizableText>
          {who?.email && who.name ? (
            <SizableText size="$2" color="$soft" numberOfLines={1}>
              {who.email}
            </SizableText>
          ) : null}
          {host.org ? (
            <SizableText size="$1" color="$soft">
              Organization: {host.org}
            </SizableText>
          ) : null}
        </YStack>
        <XStack gap="$2" justify="flex-end" flexWrap="wrap">
          {accountSettings(host.links.settings) ? (
            <Button variant="outline" size="sm" onPress={() => host.open(host.links.settings)}>
              <Settings size={14} /> Settings
            </Button>
          ) : null}
          {host.signOut ? (
            <Button variant="outline" size="sm" onPress={() => host.signOut?.()}>
              <LogOut size={14} /> Sign out
            </Button>
          ) : null}
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

export function Find({
  open,
  onOpenChange,
  recents,
  onOpen,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  recents: RailSession[]
  onOpen: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (n ? recents.filter((r) => r.title.toLowerCase().includes(n)) : recents).slice(0, 12)
  }, [q, recents])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW={480}>
        <DialogTitle>Find a run</DialogTitle>
        <Input
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Search runs…"
          aria-label="Search runs"
          onKeyDown={(e: { key?: string; nativeEvent?: { key?: string } }) => {
            if ((e.key ?? e.nativeEvent?.key) === 'Enter' && hits[0]) onOpen(hits[0].id)
          }}
        />
        <YStack gap="$1" role="list">
          {hits.length === 0 ? (
            <SizableText size="$2" color="$soft">
              No run matches.
            </SizableText>
          ) : (
            hits.map((r) => (
              <XStack
                key={r.id}
                role="listitem"
                render="button"
                onPress={() => onOpen(r.id)}
                px="$2"
                py="$1.5"
                rounded="$3"
                hoverStyle={{ bg: '$hover' }}
              >
                <SizableText size="$2" color="$ink" numberOfLines={1}>
                  {r.title}
                </SizableText>
              </XStack>
            ))
          )}
        </YStack>
      </DialogContent>
    </Dialog>
  )
}
