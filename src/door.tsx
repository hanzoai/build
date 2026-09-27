/**
 * One door into a run's sandbox — its screen or its shell — framed from cloud's
 * own page with a fresh ticket in its address.
 *
 * The page says when its socket is up. A page that says it failed, or silence
 * past the deadline, is a failed connection, and Retry mints a new ticket: a
 * ticket is spent the moment its socket opens, so reloading the old address can
 * only fail again.
 */
import { SizableText, YStack } from '@hanzo/gui'
import { Button } from '@hanzo/ui'
import { useEffect, useRef, useState } from 'react'

import { door, type Door as Which } from './api/sandbox.ts'
import { useTarget } from './host.tsx'

/** What each page signs its messages to the window that frames it with. */
const SOURCE = { screen: 'hanzo-screen', terminal: 'hanzo-term' } as const
const WHAT = { screen: 'desktop', terminal: 'terminal' } as const
const DEADLINE = 20_000

type State = 'opening' | 'open' | 'failed'

export function Door({ which, sandbox, live, session }: { which: Which; sandbox: string; live: boolean; session: string }) {
  const t = useTarget()
  const frame = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState('')
  const [state, setState] = useState<State>('opening')
  const [why, setWhy] = useState('')
  const [attempt, setAttempt] = useState(0)
  const up = live && Boolean(sandbox)

  useEffect(() => {
    if (!up) return
    let gone = false
    setSrc('')
    setState('opening')
    setWhy('')
    door(t, sandbox, which, session).then(
      (u) => {
        if (!gone) setSrc(u)
      },
      (e: unknown) => {
        if (gone) return
        setState('failed')
        setWhy(e instanceof Error ? e.message : '')
      },
    )
    return () => {
      gone = true
    }
  }, [t, sandbox, which, session, up, attempt])

  useEffect(() => {
    if (!src) return
    const origin = new URL(src, window.location.href).origin
    const hear = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return
      const m = e.data as { source?: unknown; ready?: unknown; why?: unknown; retry?: unknown } | null
      if (!m || m.source !== SOURCE[which]) return
      if (m.retry === true) {
        setAttempt((a) => a + 1)
      } else if (m.ready === true) {
        setState('open')
      } else if (m.ready === false) {
        setState('failed')
        setWhy(typeof m.why === 'string' ? m.why : '')
      }
    }
    window.addEventListener('message', hear)
    const late = setTimeout(() => setState((s) => (s === 'opening' ? 'failed' : s)), DEADLINE)
    return () => {
      window.removeEventListener('message', hear)
      clearTimeout(late)
    }
  }, [src, which])

  if (!live) {
    return <Shut title="Not running" body={`This run’s ${WHAT[which]} closed when the run stopped.`} />
  }
  if (!sandbox) {
    return <Shut title="Starting" body={`The ${WHAT[which]} opens once the run’s sandbox is up.`} />
  }
  if (state === 'failed') {
    return (
      <Shut title="Failed to connect" body={why || `Unable to reach the ${WHAT[which]}. The run may have stopped.`}>
        <Button size="sm" variant="outline" onPress={() => setAttempt((a) => a + 1)}>
          Retry
        </Button>
      </Shut>
    )
  }
  return (
    <YStack flex={1} minH={0} position="relative" bg="#000">
      {src ? (
        <iframe
          ref={frame}
          src={src}
          title={which === 'screen' ? 'The run’s desktop' : 'The run’s terminal'}
          allow="clipboard-read; clipboard-write"
          style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#000' }}
        />
      ) : null}
      {state === 'opening' ? (
        <YStack position="absolute" t={0} l={0} r={0} b={0} items="center" justify="center" pointerEvents="none">
          <SizableText size="$2" color="$soft">
            {`Connecting to the ${WHAT[which]}…`}
          </SizableText>
        </YStack>
      ) : null}
    </YStack>
  )
}

function Shut({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <YStack flex={1} items="center" justify="center" gap="$2" px="$6" py="$8">
      <SizableText size="$3" color="$ink">
        {title}
      </SizableText>
      <SizableText size="$2" color="$soft" style={{ textAlign: 'center', maxWidth: 360 }}>
        {body}
      </SizableText>
      {children}
    </YStack>
  )
}
