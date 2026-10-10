/**
 * The language dictation listens in. The microphone itself is the composer's
 * (prompt.tsx, @hanzo/voice): heard by the platform, never by a browser's
 * built-in recognizer, which ships the audio to its vendor.
 */
import { usePrefs } from './prefs.tsx'

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
]

/** The language this browser is set to, when it is one dictation offers; English otherwise. */
export function spoken(): string {
  const nav = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'
  return LANGUAGES.some((l) => l.id === nav) ? nav! : 'en'
}

/** The person's saved language (Settings → General), else this browser's, else English. */
export function useSpoken(): string {
  const { prefs } = usePrefs()
  return LANGUAGES.some((l) => l.id === prefs.language) ? prefs.language! : spoken()
}
