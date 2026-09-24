/**
 * Dictation into the draft, through the browser's own speech recognition.
 *
 * Where the browser has none, `able` is false and the control says so rather
 * than recording into nothing. Nothing is sent anywhere by this module; the
 * browser's recognizer is the one that listens.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type Maker = new () => Recognizer

function maker(): Maker | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: Maker; webkitSpeechRecognition?: Maker }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const LANGUAGES = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'es-ES', label: 'Español' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'ja-JP', label: '日本語' },
  { id: 'zh-CN', label: '中文' },
]

export function useDictation(onText: (text: string) => void) {
  const [on, setOn] = useState(false)
  const [able, setAble] = useState(false)
  const [language, setLanguage] = useState(() => (typeof navigator !== 'undefined' && navigator.language) || 'en-US')
  const rec = useRef<Recognizer | null>(null)
  const said = useRef(onText)
  said.current = onText

  useEffect(() => setAble(Boolean(maker())), [])

  const toggle = useCallback(() => {
    if (rec.current) {
      rec.current.stop()
      return
    }
    const Make = maker()
    if (!Make) return
    const r = new Make()
    r.lang = language
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res?.isFinal) {
          const text = res[0].transcript.trim()
          if (text) said.current(text)
        }
      }
    }
    r.onend = () => {
      rec.current = null
      setOn(false)
    }
    r.onerror = () => r.stop()
    rec.current = r
    r.start()
    setOn(true)
  }, [language])

  useEffect(() => () => rec.current?.stop(), [])

  const languages = LANGUAGES.some((l) => l.id === language) ? LANGUAGES : [{ id: language, label: language }, ...LANGUAGES]
  return { on, able, toggle, language, setLanguage, languages }
}
