/**
 * The fleet's native MCP servers.
 *
 * The list is the MCP server's own tools/list. A server starts when a run
 * calls it and stays up afterwards, so this pane lists them rather than
 * starting them.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronDown } from '@hanzogui/lucide-icons-2'
import { Input } from '@hanzo/ui'
import { useState } from 'react'

import { natives, type Native } from './api/mcp.ts'
import { useRead } from './data.ts'
import { useTarget } from './host.tsx'

export function Servers() {
  const t = useTarget()
  const list = useRead(() => natives(t), [] as Native[], [t])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const needle = q.trim().toLowerCase()
  const shown = list.value.filter(
    (s) => !needle || s.name.toLowerCase().includes(needle) || s.ops.some((op) => op.toLowerCase().includes(needle)),
  )
  const ops = shown.reduce((n, s) => n + s.ops.length, 0)

  return (
    <YStack flex={1} minH={0} overflow="scroll" px="$6" py="$6">
      <YStack width="100%" maxW={1040} mx="auto" gap="$4">
        <YStack gap="$1">
          <SizableText render="h1" size="$6" color="$ink">
            MCP
          </SizableText>
          <SizableText size="$2" color="$soft">
            Native servers. A run starts one when it calls it, and the server stays up afterwards.
          </SizableText>
        </YStack>
        <Input value={q} onChangeText={setQ} placeholder="Find a server or an operation…" aria-label="Find a server" />
        {list.loading && list.value.length === 0 ? (
          <SizableText size="$2" color="$soft">
            Reading the servers…
          </SizableText>
        ) : list.error && list.value.length === 0 ? (
          <SizableText size="$2" color="$soft">
            {list.error.message}
          </SizableText>
        ) : shown.length === 0 ? (
          <SizableText size="$2" color="$soft">
            {list.value.length === 0 ? 'The MCP server listed no native servers.' : 'No server matches.'}
          </SizableText>
        ) : (
          <YStack gap="$1">
            <SizableText size="$1" color="$soft">
              {shown.length} servers · {ops} operations
            </SizableText>
            {shown.map((s) => {
              const on = open === s.name
              return (
                <YStack key={s.name} borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
                  <XStack
                    render="button"
                    aria-expanded={on}
                    aria-label={s.name}
                    items="center"
                    gap="$3"
                    px="$3"
                    py="$2.5"
                    hoverStyle={{ bg: '$hover' }}
                    onPress={() => setOpen(on ? null : s.name)}
                  >
                    <YStack flex={1} minW={0} gap="$1">
                      <SizableText size="$3" color="$ink">
                        {s.name}
                      </SizableText>
                      {s.description ? (
                        <SizableText size="$1" color="$soft" numberOfLines={on ? undefined : 2}>
                          {s.description}
                        </SizableText>
                      ) : null}
                    </YStack>
                    <SizableText size="$1" color="$soft">
                      {s.ops.length}
                    </SizableText>
                    <ChevronDown size={14} style={{ transform: on ? 'rotate(180deg)' : undefined }} />
                  </XStack>
                  {on ? (
                    <YStack px="$3" py="$2" gap="$1" borderTopWidth={1} borderColor="$borderColor">
                      {s.ops.length === 0 ? (
                        <SizableText size="$1" color="$soft">
                          This server named no operations.
                        </SizableText>
                      ) : (
                        s.ops.map((op) => (
                          <SizableText key={op} size="$1" color="$ink">
                            {op}
                          </SizableText>
                        ))
                      )}
                    </YStack>
                  ) : null}
                </YStack>
              )
            })}
          </YStack>
        )}
      </YStack>
    </YStack>
  )
}
