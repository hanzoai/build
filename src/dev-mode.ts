import { useCallback, useSyncExternalStore } from 'react'

export const DEV_MODE_KEY = 'hanzo.dev_mode'
export const DEV_MODE_EVENT = 'hanzo:dev-mode'

export function getDevMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEV_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function setDevMode(next: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEV_MODE_KEY, next ? 'true' : 'false')
  } catch {
    /* ignore storage errors */
  }
  window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: { enabled: next } }))
}

function subscribeDevMode(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => onChange()
  const onStorage = (e: StorageEvent) => {
    if (e.key === DEV_MODE_KEY) onChange()
  }
  window.addEventListener(DEV_MODE_EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(DEV_MODE_EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDevMode(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeDevMode, getDevMode, () => false)
  const update = useCallback((next: boolean) => setDevMode(next), [])
  return [enabled, update]
}

export interface DeviceLabelOptions {
  kind?: string | null
  os?: string | null
  hardware?: string | null
  host?: string | null
  cloudTitle?: string
  devMode?: boolean
}

function mergeDetail(...parts: (string | null | undefined)[]): string | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const clean = (p ?? '').trim()
    if (!clean) continue
    for (const seg of clean.split(/\s*·\s*/)) {
      const s = seg.trim()
      if (!s) continue
      const key = s.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(s)
      }
    }
  }
  return out.length ? out.join(' · ') : undefined
}

export function formatDeviceLabel(
  raw: string | null | undefined,
  opts: DeviceLabelOptions = {},
): { title: string; detail?: string } {
  const cleanRaw = (raw ?? '').trim()
  const cloudFallback = opts.cloudTitle ?? 'Cloud workspace'
  if (!cleanRaw) {
    return { title: opts.devMode ? 'Cloud' : cloudFallback }
  }
  if (opts.devMode) {
    return {
      title: cleanRaw,
      detail: mergeDetail(opts.hardware, opts.host && opts.host !== cleanRaw ? opts.host : undefined),
    }
  }

  const lower = cleanRaw.toLowerCase()

  if (
    lower === 'hanzo sandbox' ||
    lower === 'sandbox' ||
    lower === 'cloud' ||
    lower === 'cloud workspace' ||
    /^cloud(-\d+)?(\b|\s|·)/.test(lower)
  ) {
    return {
      title: cloudFallback,
      detail:
        lower === 'cloud' || lower === 'cloud workspace' || lower === 'hanzo sandbox' || lower === 'sandbox'
          ? 'Managed Hanzo cloud workspace'
          : cleanRaw,
    }
  }

  const basePart = cleanRaw
    .split(/\s*·\s*/)[0]!
    .replace(/\s*\((?:shell|desk|tmux|tty)[^)]*\)\s*$/i, '')
    .replace(/\.(local|lan|home|internal)$/i, '')
    .replace(/-\d+$/, '')
    .trim()

  const combinedHint = `${cleanRaw} ${opts.host ?? ''} ${opts.hardware ?? ''}`

  if (
    /macbook|\bmbp\b|\bmba\b|\b(imac|mac-studio|mac-mini|mac|laptop|desktop|workstation|localhost|local)\b/i.test(combinedHint) ||
    opts.os === 'darwin' ||
    opts.kind === 'laptop' ||
    opts.kind === 'desktop' ||
    /^tgt_[a-z0-9]+$/i.test(basePart)
  ) {
    const title = 'Local - Device'
    const detail = mergeDetail(opts.hardware, opts.host, cleanRaw !== title ? cleanRaw : undefined)
    return { title, detail }
  }

  const humanized = basePart
    .replace(/[-_]+/g, ' ')
    .trim()

  const title = humanized ? `Local - ${humanized}` : 'Local - Device'
  const detail = mergeDetail(opts.hardware, opts.host, cleanRaw !== title ? cleanRaw : undefined)
  return { title, detail }
}
