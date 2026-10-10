/**
 * What sits under an answer, the same in Chat and Dev: copy what was written,
 * listen to it, and open what it made in the side panel. A surface adds its own
 * after these (Dev's verdict).
 *
 * An answer's artifacts are its fenced blocks (`artifacts`): a page, a picture,
 * a file it wrote out whole. One opens as a page tab in the side panel, rendered
 * from its own bytes (`blob`).
 */
import { SizableText, XStack } from '@hanzo/gui'
import { Check, Copy, PanelRight, Square, Volume2 } from '@hanzogui/lucide-icons-2'
import { mouth, speech } from '@hanzo/voice'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { Target } from './api/call.ts'

/** A fenced block an answer wrote out. */
export interface Artifact {
  /** The name it was given, or what it is: `index.html`, `html block`. */
  name: string
  body: string
  /** What a browser should take it as. */
  mime: string
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g

const MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  css: 'text/css',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
}

const suffix = (s: string): string => {
  const dot = s.lastIndexOf('.')
  return dot > 0 ? s.slice(dot + 1).toLowerCase() : ''
}

/** An info string is a file name (a dot, no spaces) or a language. */
const called = (info: string, n: number): string => {
  const word = info.trim().split(/\s+/)[0] ?? ''
  if (!word) return `Block ${n}`
  if (word.includes('.') && suffix(word)) return word
  return `${word} block`
}

/** Every fenced block in `text`, in order. */
export function artifacts(text: string): Artifact[] {
  const out: Artifact[] = []
  let n = 0
  for (const [, info = '', body = ''] of text.matchAll(FENCE)) {
    n += 1
    const name = called(info, n)
    out.push({ name, body, mime: MIME[suffix(name) || info.trim().toLowerCase().split(/\s+/)[0] || ''] ?? 'text/plain' })
  }
  return out
}

/** Whether a browser draws it as a page or a picture rather than as source. */
export const renders = (a: Artifact): boolean => a.mime === 'text/html' || a.mime === 'image/svg+xml'

/** The artifact worth opening first: the last page or picture, else the last block. */
export function lead(list: readonly Artifact[]): Artifact | null {
  return [...list].reverse().find(renders) ?? list[list.length - 1] ?? null
}

/** An address for an artifact's own bytes, typed so a browser renders it. */
export const blob = (a: Artifact): string => URL.createObjectURL(new Blob([a.body], { type: a.mime }))

/** Markdown as a sentence a voice can read: code said as code, marks dropped. */
export function speakable(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' [code snippet] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^[\s]*[-+*]\s+/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Reads `text` aloud, calls `done` when it stops for any reason, and answers the way to stop it. */
export type Listen = (text: string, done: () => void) => () => void

let hush: (() => void) | null = null

/** A reader on the platform's voice (`/v1/audio/speech`), one reply at a time on the page. */
export function speaker(t: Target): Listen {
  return (text, done) => {
    hush?.()
    const said = speakable(text)
    if (!said) {
      done()
      return () => {}
    }
    const lips = mouth({ speech: speech({ baseUrl: t.api, token: t.token }) })
    const stop = () => {
      lips.hush()
      if (hush === stop) hush = null
    }
    hush = stop
    lips.say(said).then(done, done)
    return stop
  }
}

/** One quiet control in the row. It rests dim and comes up under a pointer or focus. */
function Act({ label, onPress, children, lit = false }: { label: string; onPress: () => void; children: ReactNode; lit?: boolean }) {
  return (
    <XStack
      render="button"
      role="button"
      aria-label={label}
      onPress={onPress}
      items="center"
      gap="$1"
      px="$1"
      height={24}
      rounded="$2"
      cursor="pointer"
      opacity={lit ? 1 : 0.55}
      hoverStyle={{ opacity: 1, bg: '$hover' }}
      focusStyle={{ opacity: 1 }}
    >
      {children}
    </XStack>
  )
}

/** Copy, Listen and Open under an answer; `children` follow them. */
export function Reply({ text, listen, onOpen, children }: { text: string; listen?: Listen; onOpen?: () => void; children?: ReactNode }) {
  const [took, setTook] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!took) return
    const t = setTimeout(() => setTook(false), 1400)
    return () => clearTimeout(t)
  }, [took])
  useEffect(() => () => stop.current?.(), [])
  return (
    <XStack data-slot="reply" ml="$-1" items="center" gap="$1.5" flexWrap="wrap">
      <Act label={took ? 'Copied' : 'Copy this answer'} lit={took} onPress={() => void navigator.clipboard?.writeText(text).then(() => setTook(true), () => {})}>
        {took ? <Check size={13} /> : <Copy size={13} />}
      </Act>
      {listen ? (
        <Act
          label={speaking ? 'Stop reading' : 'Listen to this answer'}
          lit={speaking}
          onPress={() => {
            if (speaking) {
              stop.current?.()
              setSpeaking(false)
              return
            }
            setSpeaking(true)
            stop.current = listen(text, () => setSpeaking(false))
          }}
        >
          {speaking ? <Square size={12} /> : <Volume2 size={13} />}
          <SizableText size="$1" color="$ink">
            {speaking ? 'Stop' : 'Listen'}
          </SizableText>
        </Act>
      ) : null}
      {onOpen ? (
        <Act label="Open in the side panel" onPress={onOpen}>
          <PanelRight size={13} />
          <SizableText size="$1" color="$ink">
            Open
          </SizableText>
        </Act>
      ) : null}
      {children}
    </XStack>
  )
}

/** Which model answered, where the gateway says it was not the one asked for or a router. */
export function Served({ served, asked }: { served: string; asked?: string }) {
  return (
    <SizableText size="$1" color="$soft" data-slot="served">
      {`answered by ${served}${asked && asked !== served ? ` · ${asked} was unavailable` : ''}`}
    </SizableText>
  )
}
