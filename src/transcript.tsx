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
 *
 * It reads as Chat reads: the same measure (`MEASURE`), the same turns and
 * prose sizes, the same row under an answer (`Reply`: copy, listen, and open
 * what it wrote in the side panel), the same caret while an answer streams and
 * the same `Failure` when a run stops on an error. What only a run has — its
 * commands, edits and steps — are cards of their own between the turns.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { Feedback, type Verdict } from '@hanzo/ui/agents'
import { Code, Message, Step, Thread } from '@hanzo/ui/chat'
import { useState, type ReactNode } from 'react'

import type { Card, Ran } from './api/turn.ts'
import { GAP, MEASURE } from './prompt.tsx'
import { Prose } from './prose.tsx'
import { artifacts, lead, Reply, type Artifact, type Listen } from './reply.tsx'

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
  onOpen,
  onDiff,
  listen,
  end,
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
  /** Open what an answer wrote in the side panel. */
  onOpen?: (a: Artifact) => void
  /** Open the run's diff in the side panel. */
  onDiff?: () => void
  /** Read an answer aloud. */
  listen?: Listen
  /** After the last card: how the run ended, when it ended on an error. */
  end?: ReactNode
}) {
  // A card the run never finished is cut off once the run has ended, not still going.
  const state = (ran: Ran): Ran => (ran === 'running' && !live ? 'cancelled' : ran)
  // The answer still arriving: the last thing the agent said while the run works.
  const last = live ? [...cards].reverse().find((c) => c.kind === 'said' && c.who === 'agent')?.key : undefined
  return (
    <Thread gap={GAP} column={{ maxW: MEASURE }} aria-label="Transcript">
      {header}
      {cards.length === 0 ? <YStack py="$2">{empty}</YStack> : null}
      {cards.map((c) => {
        switch (c.kind) {
          case 'said': {
            if (c.who === 'person')
              return (
                <Message key={c.key} role="user">
                  <Prose text={c.text} />
                </Message>
              )
            const made = artifacts(c.text)
            const first = lead(made)
            return (
              <Message key={c.key} role="assistant" busy={c.key === last}>
                <YStack gap="$1">
                  <Prose text={c.text} />
                  {c.key === last ? null : (
                    <Reply text={c.text} listen={listen} onOpen={first && onOpen ? () => onOpen(first) : undefined}>
                      <Judge onVerdict={onVerdict} />
                    </Reply>
                  )}
                </YStack>
              </Message>
            )
          }
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
                <YStack gap="$2" items="flex-start">
                  <SizableText size="$1" color="$soft" style={{ whiteSpace: 'pre-wrap' }}>
                    {c.files.length ? c.files.join('\n') : 'The agent named no files.'}
                  </SizableText>
                  {onDiff ? (
                    <Button size="sm" variant="outline" onPress={onDiff}>
                      Open the diff
                    </Button>
                  ) : null}
                </YStack>
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
                  <Reply text={c.text} listen={listen} />
                  {onApprove ? (
                    <Button size="sm" disabled={approving} onPress={() => onApprove(c.text)}>
                      {approving ? 'Starting the build…' : 'Approve and build'}
                    </Button>
                  ) : null}
                  <Judge onVerdict={onVerdict} />
                </XStack>
              </YStack>
            )
        }
      })}
      {end}
    </Thread>
  )
}

/** Say whether what the agent said was good. A verdict that did not land is taken back and says why. */
function Judge({ onVerdict }: { onVerdict: (v: Verdict) => Promise<void> }) {
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
      <Feedback text="" verdict={verdict} onVerdict={judge} />
      {note ? (
        <SizableText size="$1" color="$soft" role="status">
          {note}
        </SizableText>
      ) : null}
    </XStack>
  )
}
