/**
 * What sits under an answer, the same in Chat and Dev: copy what was written,
 * rate/vote, listen to it, share it, regenerate/redo it, branch in a new chat,
 * and open what it made in the side panel. A surface adds its own after these.
 *
 * An answer's artifacts are its fenced blocks (`artifacts`): a page, a picture,
 * a file it wrote out whole. One opens as a page tab in the side panel, rendered
 * from its own bytes (`blob`).
 */
import { SizableText, XStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
import { Check, Copy, PanelRight, Square, Volume2 } from '@hanzogui/lucide-icons-2'
import { mouth, speech } from '@hanzo/voice'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import type { Target } from './api/call.ts'

/** A fenced block an answer wrote out. */
export interface Artifact {
  /** The name it was given, or what it is: `index.html`, `html block`. */
  name: string
  body: string
  /** What a browser should take it as. */
  mime: string
}

export interface RedoAction {
  mode: 'retry' | 'think' | 'web' | 'prompt'
  prompt?: string
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

/** An info string is a language, a file name (a dot, no spaces), or both (`html index.html`): the file name wins. */
const called = (info: string, n: number): string => {
  const words = info.trim().split(/\s+/).filter(Boolean)
  const file = words.find((w) => w.includes('.') && suffix(w))
  if (file) return file
  return words[0] ? `${words[0]} block` : `Block ${n}`
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
function Act({
  label,
  onPress,
  children,
  lit = false,
  slot,
}: {
  label: string
  onPress: () => void
  children: ReactNode
  lit?: boolean
  slot?: string
}) {
  return (
    <XStack
      render="button"
      role="button"
      aria-label={label}
      data-slot={slot}
      onPress={onPress}
      items="center"
      justify="center"
      gap="$1"
      px="$1.5"
      height={28}
      minW={28}
      rounded="$2"
      cursor="pointer"
      bg={lit ? '$hover' : 'transparent'}
      opacity={lit ? 1 : 0.65}
      hoverStyle={{ opacity: 1, bg: '$hover' }}
      focusStyle={{ opacity: 1 }}
    >
      {children}
    </XStack>
  )
}

function IconThumbUp({ size = 15, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v12m8-16.12L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  )
}

function IconThumbDown({ size = 15, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  )
}

function IconDualThumbs({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 15H3.5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 3.5 7h3l2.6-4.3A1.8 1.8 0 0 1 12 4.1V7h2.8a1.8 1.8 0 0 1 1.75 2.25l-1.1 4.5A1.8 1.8 0 0 1 13.7 15H6.5Z" />
      <path d="M17.5 9h3a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-3l-2.6 4.3A1.8 1.8 0 0 1 12 19.9V17" />
    </svg>
  )
}

function IconShareTray({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  )
}

function IconRedoCycle({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function IconDots({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}

function IconBranch({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function IconBulb({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  )
}

function IconGlobe({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

function IconLink({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function IconXLogo({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function IconLinkedIn({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  )
}

function IconReddit({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm6.17-11.23c.06.29.09.59.09.9 0 2.72-3.04 4.92-6.79 4.92-3.75 0-6.79-2.2-6.79-4.92 0-.31.03-.61.09-.9a1.46 1.46 0 0 1-.51-1.11c0-.81.65-1.46 1.46-1.46.39 0 .74.15 1.01.4 1.2-.82 2.83-1.34 4.65-1.39l.88-4.13c.06-.28.33-.46.61-.4l2.89.62c.25-.44.72-.74 1.26-.74.81 0 1.46.65 1.46 1.46s-.65 1.46-1.46 1.46-1.46-.65-1.46-1.46l-2.43-.52-.73 3.44c1.77.07 3.36.58 4.54 1.39.27-.25.62-.4 1.01-.4.81 0 1.46.65 1.46 1.46 0 .45-.2.85-.51 1.11zM9.25 11.25c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm5.5 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm-5.12 3.62c-.18-.18-.47-.18-.65 0-.18.18-.18.47 0 .65.74.74 1.82 1.11 3.02 1.11s2.28-.37 3.02-1.11c.18-.18.18-.47 0-.65-.18-.18-.47-.18-.65 0-.56.56-1.41.84-2.37.84s-1.81-.28-2.37-.84z" />
    </svg>
  )
}

const POPOVER_STYLE: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: 0,
  zIndex: 1200,
  background: '#262628',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '14px',
  padding: '6px',
  boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55)',
  color: '#f4f4f5',
  minWidth: '180px',
}

const MENU_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '8px 11px',
  borderRadius: '9px',
  border: 'none',
  background: 'transparent',
  color: '#f4f4f5',
  fontSize: '13.5px',
  lineHeight: '18px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

/** Copy, Rate/Vote, Listen, Share, Redo, Branch and Open under an answer; `children` follow them. */
export function Reply({
  text,
  title,
  listen,
  onOpen,
  onRedo,
  onBranch,
  onRate,
  timestamp,
  children,
}: {
  text: string
  title?: string
  listen?: Listen
  onOpen?: () => void
  onRedo?: (action: RedoAction) => void
  onBranch?: () => void
  onRate?: (vote: 'up' | 'down') => void
  timestamp?: string
  children?: ReactNode
}) {
  const { t: say } = useI18n()
  const [took, setTook] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const [openMenu, setOpenMenu] = useState<'rate' | 'redo' | 'more' | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [redoPrompt, setRedoPrompt] = useState('')
  const stop = useRef<(() => void) | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)

  const stamp = useMemo(() => {
    if (timestamp) return timestamp
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date())
    } catch {
      return 'Just now'
    }
  }, [timestamp])

  useEffect(() => {
    if (!took) return
    const t = setTimeout(() => setTook(false), 1400)
    return () => clearTimeout(t)
  }, [took])

  useEffect(() => {
    if (!shareCopied) return
    const t = setTimeout(() => setShareCopied(false), 1600)
    return () => clearTimeout(t)
  }, [shareCopied])

  useEffect(() => () => stop.current?.(), [])

  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://hanzo.ai/chat'
    return window.location.href
  }, [shareOpen])

  const triggerRedo = (payload: RedoAction) => {
    setOpenMenu(null)
    setRedoPrompt('')
    if (onRedo) {
      onRedo(payload)
      return
    }
    const field = document.querySelector('[data-slot="composer-field"], textarea')
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      field.focus()
    }
  }

  const triggerBranch = () => {
    setOpenMenu(null)
    onBranch?.()
  }

  return (
    <XStack ref={rowRef as never} data-slot="reply" ml="$-1" items="center" gap="$1" flexWrap="wrap" position="relative">
      <Act
        slot="reply-copy"
        label={took ? say('Copied') : say('Copy this answer')}
        lit={took}
        onPress={() => void navigator.clipboard?.writeText(text).then(() => setTook(true), () => {})}
      >
        {took ? <Check size={15} /> : <Copy size={15} />}
      </Act>

      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <Act
          slot="reply-rate"
          label={say('Rate this response')}
          lit={vote !== null || openMenu === 'rate'}
          onPress={() => setOpenMenu(openMenu === 'rate' ? null : 'rate')}
        >
          {vote === 'up' ? (
            <IconThumbUp size={15} filled />
          ) : vote === 'down' ? (
            <IconThumbDown size={15} filled />
          ) : (
            <IconDualThumbs size={16} />
          )}
        </Act>
        {openMenu === 'rate' ? (
          <div data-slot="reply-rate-menu" role="menu" style={{ ...POPOVER_STYLE, minWidth: '168px' }}>
            <button
              type="button"
              role="menuitem"
              data-slot="reply-rate-up"
              style={MENU_ROW_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={() => {
                setVote('up')
                onRate?.('up')
                setOpenMenu(null)
              }}
            >
              <IconThumbUp size={15} filled={vote === 'up'} />
              <span>{say('Good response')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-slot="reply-rate-down"
              style={MENU_ROW_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={() => {
                setVote('down')
                onRate?.('down')
                setOpenMenu(null)
              }}
            >
              <IconThumbDown size={15} filled={vote === 'down'} />
              <span>{say('Bad response')}</span>
            </button>
          </div>
        ) : null}
      </div>

      {listen ? (
        <Act
          slot="reply-listen"
          label={speaking ? say('Stop reading') : say('Listen to this answer')}
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
          {speaking ? <Square size={14} /> : <Volume2 size={15} />}
        </Act>
      ) : null}

      <Act
        slot="reply-share"
        label={say('Share message')}
        lit={shareOpen}
        onPress={() => {
          setOpenMenu(null)
          setShareOpen(true)
        }}
      >
        <IconShareTray size={15} />
      </Act>

      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <Act
          slot="reply-redo"
          label={say('Regenerate response')}
          lit={openMenu === 'redo'}
          onPress={() => setOpenMenu(openMenu === 'redo' ? null : 'redo')}
        >
          <IconRedoCycle size={15} />
        </Act>
        {openMenu === 'redo' ? (
          <div data-slot="reply-redo-menu" role="menu" style={{ ...POPOVER_STYLE, minWidth: '232px', padding: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '4px' }}>
              <input
                type="text"
                data-slot="reply-redo-input"
                placeholder={say('Ask to change response')}
                value={redoPrompt}
                onChange={(e) => setRedoPrompt(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && redoPrompt.trim()) {
                    e.preventDefault()
                    triggerRedo({ mode: 'prompt', prompt: redoPrompt.trim() })
                  } else if (e.key === 'Escape') {
                    setOpenMenu(null)
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f4f4f5',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                aria-label={say('Submit change')}
                disabled={!redoPrompt.trim()}
                onClick={() => {
                  if (redoPrompt.trim()) {
                    triggerRedo({ mode: 'prompt', prompt: redoPrompt.trim() })
                  }
                }}
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '999px',
                  border: 'none',
                  background: redoPrompt.trim() ? '#f4f4f5' : 'rgba(255,255,255,0.12)',
                  color: redoPrompt.trim() ? '#18181b' : 'rgba(255,255,255,0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: redoPrompt.trim() ? 'pointer' : 'default',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                ↑
              </button>
            </div>
            <button
              type="button"
              role="menuitem"
              data-slot="redo-retry"
              style={MENU_ROW_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={() => triggerRedo({ mode: 'retry' })}
            >
              <IconRedoCycle size={15} />
              <span>
                {say('Try again')} <span style={{ color: '#9ca3af' }}>· Auto</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-slot="redo-think"
              style={MENU_ROW_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={() => triggerRedo({ mode: 'think' })}
            >
              <IconBulb size={15} />
              <span>{say('Think longer')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-slot="redo-web"
              style={MENU_ROW_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={() => triggerRedo({ mode: 'web' })}
            >
              <IconGlobe size={15} />
              <span>{say('Search the web')}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <Act
          slot="reply-more"
          label={say('More options')}
          lit={openMenu === 'more'}
          onPress={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
        >
          <IconDots size={15} />
        </Act>
        {openMenu === 'more' ? (
          <div data-slot="reply-more-menu" role="menu" style={{ ...POPOVER_STYLE, minWidth: '192px' }}>
            <div style={{ padding: '6px 11px 5px', fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{stamp}</div>
            <button
              type="button"
              role="menuitem"
              data-slot="reply-branch"
              style={MENU_ROW_STYLE}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={triggerBranch}
            >
              <IconBranch size={15} />
              <span>{say('Branch in new chat')}</span>
            </button>
          </div>
        ) : null}
      </div>

      {onOpen ? (
        <Act slot="reply-open" label={say('Open in the side panel')} onPress={onOpen}>
          <PanelRight size={14} />
          <SizableText size="$1" color="$ink">
            {say('Open')}
          </SizableText>
        </Act>
      ) : null}

      {children}

      {shareOpen ? (
        <div
          data-slot="reply-share-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title || say('Share message')}
          onClick={() => setShareOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 94vw)',
              background: '#212121',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              padding: '22px 24px 24px',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.65)',
              color: '#f4f4f5',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title || say('Conversation')}
              </div>
              <button
                type="button"
                aria-label={say('Close')}
                onClick={() => setShareOpen(false)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '999px',
                  border: 'none',
                  background: 'transparent',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                position: 'relative',
                background: '#171717',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '16px 18px',
                maxHeight: '220px',
                overflowY: 'auto',
                fontSize: '14px',
                lineHeight: '22px',
                color: '#e4e4e7',
                whiteSpace: 'pre-wrap',
              }}
            >
              {text}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '16px' }}>
              <div style={{ marginTop: '2px', color: '#d4d4d8' }}>
                <IconGlobe size={16} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>{say('Share a public link to this message')}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{say('Anyone with this link can access this message.')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '28px', marginTop: '22px' }}>
              <button
                type="button"
                data-slot="share-copy-link"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareUrl).then(() => setShareCopied(true), () => {})
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#e4e4e7', cursor: 'pointer' }}
              >
                <span style={{ width: '48px', height: '48px', borderRadius: '999px', background: '#2f2f2f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {shareCopied ? <Check size={18} /> : <IconLink size={18} />}
                </span>
                <span style={{ fontSize: '12px', color: '#d4d4d8' }}>{shareCopied ? say('Copied!') : say('Copy link')}</span>
              </button>
              <button
                type="button"
                data-slot="share-x"
                onClick={() => {
                  const snippet = text.length > 200 ? `${text.slice(0, 197)}...` : text
                  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(snippet)}&url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer')
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#e4e4e7', cursor: 'pointer' }}
              >
                <span style={{ width: '48px', height: '48px', borderRadius: '999px', background: '#2f2f2f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconXLogo size={17} />
                </span>
                <span style={{ fontSize: '12px', color: '#d4d4d8' }}>X</span>
              </button>
              <button
                type="button"
                data-slot="share-linkedin"
                onClick={() => {
                  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer')
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#e4e4e7', cursor: 'pointer' }}
              >
                <span style={{ width: '48px', height: '48px', borderRadius: '999px', background: '#2f2f2f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconLinkedIn size={18} />
                </span>
                <span style={{ fontSize: '12px', color: '#d4d4d8' }}>LinkedIn</span>
              </button>
              <button
                type="button"
                data-slot="share-reddit"
                onClick={() => {
                  window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title || 'Hanzo Chat')}`, '_blank', 'noopener,noreferrer')
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#e4e4e7', cursor: 'pointer' }}
              >
                <span style={{ width: '48px', height: '48px', borderRadius: '999px', background: '#2f2f2f', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IconReddit size={19} />
                </span>
                <span style={{ fontSize: '12px', color: '#d4d4d8' }}>Reddit</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </XStack>
  )
}

/** Which model answered, where the gateway says it was not the one asked for or a router. */
export function Served(_props: { served: string; asked?: string }) {
  return null
}
