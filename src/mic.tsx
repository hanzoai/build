/**
 * Dictation: the mic, and beside it a chevron that opens its menu — the
 * microphones this browser has, the chosen one's live level, and the language
 * dictation listens in (Auto is the browser's own).
 *
 * The chosen microphone is this browser's (a device id means nothing on
 * another), kept in localStorage and handed to @hanzo/voice (`choose`), so
 * every capture opens it; unchosen, the system's own input. The meter listens
 * only while the menu is open, and only where the person has already let the
 * page use a microphone: opening a menu never asks for permission.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Check, ChevronDown, Mic as MicIcon } from '@hanzogui/lucide-icons-2'
import { Control } from '@hanzo/composer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@hanzo/ui'
import { choose, Voice, type Machine } from '@hanzo/voice'
import { useEffect, useRef, useState } from 'react'

import { LANGUAGES } from './voice.ts'

const KEY = 'hanzo.mic'

function kept(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function keep(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch {
    // Kept for the page: `choose` holds it.
  }
  choose(id)
}

// The page's choice reaches every capture from the first one.
if (typeof window !== 'undefined') choose(kept())

/** The mic is a plain mark until it is pointed at. */
const PLAIN = { bg: 'transparent', color: 'var(--foreground)', hoverStyle: { bg: '$hover' } } as const

/** The microphones this browser lists; labels only once the page may use one. */
function useInputs(open: boolean): { inputs: MediaDeviceInfo[]; allowed: boolean; using: string } {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [allowed, setAllowed] = useState(false)
  const [using, setUsing] = useState('')
  useEffect(() => {
    if (!open || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return
    let live = true
    void navigator.mediaDevices.enumerateDevices().then((all) => {
      if (!live) return
      const mics = all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      setInputs(mics)
      // The system's own input: the group the browser's "default" entry belongs to, else the first.
      setUsing(all.find((d) => d.kind === 'audioinput' && d.deviceId === 'default')?.groupId || mics[0]?.groupId || '')
      setAllowed(mics.some((d) => d.label))
    })
    return () => {
      live = false
    }
  }, [open])
  return { inputs, allowed, using }
}

/** The chosen microphone's level while the menu is open, drawn without re-rendering. */
function Meter({ device, on }: { device: string | null; on: boolean }) {
  const bar = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!on) return
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let frame = 0
    let live = true
    void navigator.mediaDevices
      .getUserMedia({ audio: device ? { deviceId: { exact: device } } : true })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop())
        stream = s
        ctx = new AudioContext()
        const tap = ctx.createAnalyser()
        tap.fftSize = 512
        ctx.createMediaStreamSource(s).connect(tap)
        const buf = new Uint8Array(tap.fftSize)
        const draw = () => {
          tap.getByteTimeDomainData(buf)
          let peak = 0
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
          if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, (peak / 128) * 2.5)})`
          frame = requestAnimationFrame(draw)
        }
        draw()
      })
      .catch(() => {})
    return () => {
      live = false
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
    }
  }, [device, on])
  return (
    <XStack items="center" gap={10} px={8} py={8} data-slot="mic-meter" aria-hidden>
      <MicIcon size={14} color="$hint" />
      <YStack flex={1} height={4} rounded={2} bg="$hover" overflow="hidden">
        <YStack
          ref={bar as never}
          height={4}
          width="100%"
          bg="$ink"
          // inline-style: the level is written per frame onto the node; a style prop would mint a class per value.
          style={{ transform: 'scaleX(0)', transformOrigin: 'left' }}
        />
      </YStack>
    </XStack>
  )
}

export interface DictationProps {
  voice: Machine
  disabled?: boolean
  /** A phone: both halves take a finger's width. */
  narrow?: boolean
  /** The language dictation listens in, or null for Auto (the browser's own). */
  language?: string | null
  onLanguage?: (id: string | null) => void
}

/** The mic and its chevron, one control on the composer's row. */
export function Dictation({ voice, disabled = false, narrow = false, language = null, onLanguage }: DictationProps) {
  const [open, setOpen] = useState(false)
  // The Language list, drawn only while open (see plus.tsx).
  const [lang, setLang] = useState(false)
  const { inputs, allowed, using } = useInputs(open)
  const [device, setDevice] = useState<string | null>(() => (typeof window === 'undefined' ? null : kept()))
  const spoken = LANGUAGES.find((l) => l.id === language)
  return (
    <XStack
      data-slot="dictation"
      items="center"
      rounded={8}
      borderWidth={1}
      borderColor={open ? '$borderColor' : 'transparent'}
      hoverStyle={{ borderColor: '$borderColor' }}
      shrink={0}
    >
      <Control asChild size={narrow ? 44 : 30} {...PLAIN}>
        <Voice voice={voice} disabled={disabled} says={{ idle: 'Dictate', listening: 'Dictating — click to stop' }}>
          {(state) => <MicIcon size={16} color="var(--foreground)" fill={state === 'idle' ? 'none' : 'var(--foreground)'} />}
        </Voice>
      </Control>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <XStack
            render="button"
            aria-label="Dictation settings"
            data-slot="dictation-menu"
            width={16}
            height={30}
            items="center"
            justify="center"
            rounded={6}
            cursor="pointer"
            bg={open ? '$hover' : 'transparent'}
            hoverStyle={{ bg: '$hover' }}
            {...(narrow ? { width: 44, height: 44 } : null)}
          >
            <ChevronDown size={14} color="$aside" />
          </XStack>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" minW={200} data-slot="dictation-panel">
          <Meter device={device} on={open && allowed} />
          {inputs.length === 0 ? (
            <DropdownMenuLabel>
              <SizableText fontSize={14} color="$hint">
                No devices found
              </SizableText>
            </DropdownMenuLabel>
          ) : (
            inputs.map((d, i) => {
              const on = device ? d.deviceId === device : d.groupId === using
              return (
                <DropdownMenuItem
                  key={d.deviceId || i}
                  preventCloseOnSelect
                  onSelect={() => {
                    setDevice(d.deviceId)
                    keep(d.deviceId)
                  }}
                >
                  <XStack flex={1} items="center" gap={8}>
                    <SizableText fontSize={14} color="$ink" numberOfLines={1} flex={1}>
                      {d.label || `Microphone ${i + 1}`}
                    </SizableText>
                    {on ? <Check size={14} color="var(--primary)" aria-hidden /> : null}
                  </XStack>
                </DropdownMenuItem>
              )
            })
          )}
          {onLanguage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                <SizableText fontSize={13} color="$hint">
                  Dictation settings
                </SizableText>
              </DropdownMenuLabel>
              <DropdownMenuSub open={lang} onOpenChange={setLang}>
                <DropdownMenuSubTrigger data-slot="dictation-language" onPress={() => setLang(true)}>
                  <XStack flex={1} items="center" gap={8}>
                    <SizableText fontSize={14} color="$ink" flex={1}>
                      Language
                    </SizableText>
                    <SizableText fontSize={14} color="$hint">
                      {spoken?.label ?? 'Auto'}
                    </SizableText>
                  </XStack>
                </DropdownMenuSubTrigger>
                {lang ? (
                <DropdownMenuSubContent minW={160} pointerEvents="auto">
                  {[{ id: '', label: 'Auto' }, ...LANGUAGES].map((l) => (
                    <DropdownMenuItem key={l.id || 'auto'} onSelect={() => onLanguage(l.id || null)}>
                      <XStack flex={1} items="center" gap={8}>
                        <SizableText fontSize={14} color="$ink" flex={1}>
                          {l.label}
                        </SizableText>
                        {(language ?? '') === l.id ? <Check size={14} color="var(--primary)" aria-hidden /> : null}
                      </XStack>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
                ) : null}
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </XStack>
  )
}
