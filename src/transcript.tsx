/**
 * A run's transcript, drawn by what each part is (turn.ts `cards`): what the
 * agent said as markdown, its reasoning folded, each command it ran as a card
 * that opens onto its output, the files it changed, its plan as a checklist, the
 * run's own steps, and a plan run's plan with the button that builds it.
 * What the agent said, and its plan, can be copied and judged, as a reply on
 * claude.ai can: a thumb pressed again takes the verdict back.
 *
 * It follows the run to the bottom as it streams and stops when the reader
 * scrolls up (Thread). Everything drawn is text.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { Feedback, type Verdict } from '@hanzo/ui/agents'
import { Code, Message, Step, Thread } from '@hanzo/ui/chat'
import { useState, type ReactNode } from 'react'

import type { Card, Ran } from './api/turn.ts'
import { Prose } from './prose.tsx'

/** A card's output, its tail: what a command said last is why it stopped. */
const TAIL = 6000
const tail = (s: string): string => (s.length > TAIL ? `…${s.slice(-TAIL)}` : s)

const mono = { fontFamily: 'var(--f-mono, ui-monospace, monospace)' }

/** What a thought is about: its first line, without the markdown that bolds it. */
const firstLine = (text: string): string => text.trim().split('\n')[0]!.replace(/[*_#`]/g, '').slice(0, 120)

export function Transcript({
  cards,
  live,
  empty,
  header,
  onApprove,
  approving = false,
  onVerdict,
}: {
  cards: Card[]
  /** The run is still working: a card still running shows it; otherwise it was cut off. */
  live: boolean
  empty: ReactNode
  header?: ReactNode
  /** Build what a plan says. Absent, a plan has no button. */
  onApprove?: (plan: string) => void
  approving?: boolean
  /** Record a verdict on what the agent said; throws when it did not land. */
  onVerdict: (v: Verdict) => Promise<void>
}) {
  // A card the run never finished is cut off once the run has ended, not still going.
  const state = (ran: Ran): Ran => (ran === 'running' && !live ? 'cancelled' : ran)
  return (
    <Thread maxWidth={0} gap={14} column={{ px: 0 }} aria-label="Transcript">
      {header}
      {cards.length === 0 ? <YStack py="$2">{empty}</YStack> : null}
      {cards.map((c) => {
        switch (c.kind) {
          case 'said':
            return c.who === 'person' ? (
              <Message key={c.key} role="user">
                <SizableText size="$3" color="$ink" style={{ whiteSpace: 'pre-wrap' }}>
                  {c.text}
                </SizableText>
              </Message>
            ) : (
              <Message key={c.key} role="assistant" actions={<Judge text={c.text} onVerdict={onVerdict} />}>
                <Prose text={c.text} />
              </Message>
            )
          case 'think':
            return (
              <Step key={c.key} name="Thought" detail={firstLine(c.text)} status="done" aria-label="Thought">
                <Prose text={c.text} />
              </Step>
            )
          case 'todo':
            return (
              <YStack key={c.key} gap="$1" px="$3" py="$2" rounded="$3" borderWidth={1} borderColor="$borderColor" aria-label="Plan checklist">
                {c.items.map((x, i) => (
                  <XStack key={i} gap="$2" items="flex-start">
                    <SizableText size="$2" color={x.done ? '$ink' : '$soft'}>
                      {x.done ? '✓' : '○'}
                    </SizableText>
                    <SizableText flex={1} size="$2" color={x.done ? '$soft' : '$ink'}>
                      {x.text}
                    </SizableText>
                  </XStack>
                ))}
              </YStack>
            )
          case 'shell':
            return (
              <Step key={c.key} name="Shell" detail={c.command} status={state(c.ran)} aria-label={`Command ${c.command}`}>
                <Code language="shell" value={c.output ? `$ ${c.command}\n${c.output}` : `$ ${c.command}`}>
                  {c.output ? `$ ${c.command}\n${tail(c.output)}` : `$ ${c.command}`}
                </Code>
              </Step>
            )
          case 'edit':
            return (
              <Step
                key={c.key}
                name={c.files.length === 1 ? 'Edited' : c.files.length ? `Edited ${c.files.length} files` : 'Edited files'}
                detail={c.files.join(', ')}
                status={state(c.ran)}
                aria-label={`Edited ${c.files.join(', ') || 'files'}`}
              >
                <SizableText size="$1" color="$soft">
                  {c.files.length ? `${c.files.join('\n')}\n\nThe diff is in the run’s Git tab.` : 'The agent named no files.'}
                </SizableText>
              </Step>
            )
          case 'step':
            return (
              // The run's own error opens by default: it is the reason, and the line above it only says what to do.
              <Step key={c.key} name={c.name} detail={c.detail} status={state(c.ran)} defaultOpen={c.name === 'Error'} aria-label={`${c.name} ${c.detail}`.trim()}>
                {c.name === 'Error' ? (
                  // The reason is read whole, wrapped, never scrolled sideways.
                  <SizableText size="$2" color="$ink" style={{ ...mono, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {c.output}
                  </SizableText>
                ) : c.output.trim() ? (
                  <Code language="output" value={c.output}>
                    {tail(c.output.replace(/\n+$/, ''))}
                  </Code>
                ) : undefined}
              </Step>
            )
          case 'note':
            return (
              <SizableText key={c.key} size="$1" color="$soft" role="note">
                {c.text}
              </SizableText>
            )
          case 'plan':
            return (
              <YStack key={c.key} gap="$3" p="$4" rounded="$4" borderWidth={1} borderColor="$borderColor" bg="$panel" aria-label="Plan">
                <SizableText size="$2" color="$soft">
                  Plan
                </SizableText>
                <Prose text={c.text} />
                <XStack items="center" gap="$2" flexWrap="wrap">
                  {onApprove ? (
                    <Button size="sm" disabled={approving} onPress={() => onApprove(c.text)}>
                      {approving ? 'Starting the build…' : 'Approve and build'}
                    </Button>
                  ) : null}
                  <Judge text={c.text} onVerdict={onVerdict} />
                </XStack>
              </YStack>
            )
        }
      })}
    </Thread>
  )
}

/** Copy what the agent said, and say whether it was good. A verdict that did not land is taken back and says why. */
function Judge({ text, onVerdict }: { text: string; onVerdict: (v: Verdict) => Promise<void> }) {
  const [verdict, setVerdict] = useState<Verdict>(null)
  const [note, setNote] = useState('')
  const judge = (next: Verdict) => {
    setVerdict(next)
    setNote('')
    onVerdict(next).catch((e: Error) => {
      setVerdict(null)
      setNote(e.message)
    })
  }
  return (
    <XStack items="center" gap="$2" flexWrap="wrap">
      <Feedback text={text} verdict={verdict} onVerdict={judge} />
      {note ? (
        <SizableText size="$1" color="$soft" role="status">
          {note}
        </SizableText>
      ) : null}
    </XStack>
  )
}
