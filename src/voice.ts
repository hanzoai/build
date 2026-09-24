/**
 * Dictation into the draft, heard by the platform.
 *
 * The microphone is recorded in this browser and the recording is transcribed
 * by `POST /v1/audio/transcriptions` on the platform, through `@hanzo/voice` —
 * never by a browser's built-in recognizer, which ships the audio to its
 * vendor. Press to record, press again to stop; the words land in the draft.
 * Where there is no microphone or no recorder, `able` is false and the control
 * says so rather than recording into nothing.
 */
import { speech } from '@hanzo/voice'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Target } from './api/call.ts'

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
]

/** Whether this browser can record the microphone at all. */
function recordable(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return typeof window.MediaRecorder === 'function' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function useDictation(t: Target, onText: (text: string) => void, onNote: (note: string) => void) {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [able, setAble] = useState(false)
  const [language, setLanguage] = useState(() => {
    const nav = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'
    return LANGUAGES.some((l) => l.id === nav) ? nav! : 'en'
  })
  const rec = useRef<MediaRecorder | null>(null)
  const said = useRef(onText)
  said.current = onText
  const note = useRef(onNote)
  note.current = onNote
  const ear = useMemo(() => speech({ baseUrl: t.api, token: t.token, ear: 'whisper' }), [t])

  useEffect(() => setAble(recordable()), [])

  const toggle = useCallback(async () => {
    if (rec.current) {
      rec.current.stop()
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      note.current('The microphone is not available to this page.')
      return
    }
    const chunks: Blob[] = []
    const r = new MediaRecorder(stream)
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    r.onstop = () => {
      rec.current = null
      setOn(false)
      for (const track of stream.getTracks()) track.stop()
      const audio = new Blob(chunks, { type: r.mimeType || 'audio/webm' })
      if (!audio.size) return
      setBusy(true)
      ear
        .transcribe(audio, { language })
        .then((text) => {
          const words = text.trim()
          if (words) said.current(words)
        })
        .catch((e: unknown) => note.current(e instanceof Error ? e.message : 'The platform could not transcribe that.'))
        .finally(() => setBusy(false))
    }
    rec.current = r
    r.start()
    setOn(true)
  }, [ear, language])

  useEffect(() => () => rec.current?.stop(), [])

  return { on, busy, able, toggle, language, setLanguage, languages: LANGUAGES }
}
