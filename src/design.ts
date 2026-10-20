/**
 * A design system as the composer handles it: drafted by a model, kept as a
 * Studio brand (W3C design tokens plus `components` and `voice`), said to the
 * model on every message of a conversation it is attached to, and drawn as a
 * page to look at. Pure, so it is tested without a browser.
 */
import type { Brand } from './api/studio.ts'

/** What a model is asked to answer: the system in plain fields. */
export interface Draft {
  name: string
  colors: Record<string, string>
  fonts: { heading: string; body: string; mono: string }
  /** Type sizes, px, smallest first. */
  scale: number[]
  /** Spacing steps, px. */
  spacing: number[]
  radius: Record<string, number>
  /** One line each: how a button, card, input, nav… looks and behaves. */
  components: Record<string, string>
  voice: { tone: string; do: string[]; dont: string[] }
}

/** The schema the drafting call decodes under. */
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'colors', 'fonts', 'scale', 'spacing', 'radius', 'components', 'voice'],
  properties: {
    name: { type: 'string' },
    colors: {
      type: 'object',
      additionalProperties: false,
      required: ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted', 'border'],
      properties: Object.fromEntries(['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted', 'border'].map((k) => [k, { type: 'string' }])),
    },
    fonts: { type: 'object', additionalProperties: false, required: ['heading', 'body', 'mono'], properties: { heading: { type: 'string' }, body: { type: 'string' }, mono: { type: 'string' } } },
    scale: { type: 'array', items: { type: 'number' } },
    spacing: { type: 'array', items: { type: 'number' } },
    radius: { type: 'object', additionalProperties: false, required: ['sm', 'md', 'lg'], properties: { sm: { type: 'number' }, md: { type: 'number' }, lg: { type: 'number' } } },
    components: {
      type: 'object',
      additionalProperties: false,
      required: ['button', 'card', 'input', 'nav', 'hero'],
      properties: Object.fromEntries(['button', 'card', 'input', 'nav', 'hero'].map((k) => [k, { type: 'string' }])),
    },
    voice: { type: 'object', additionalProperties: false, required: ['tone', 'do', 'dont'], properties: { tone: { type: 'string' }, do: { type: 'array', items: { type: 'string' } }, dont: { type: 'array', items: { type: 'string' } } } },
  },
} as const

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const nums = (v: unknown, lo: number, hi: number): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && n >= lo && n <= hi) : [])
const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 8) : [])

/** A model's answer as a Draft, or why it is not one. */
export function drafted(raw: unknown): Draft | string {
  const o = obj(raw)
  const name = str(o.name).slice(0, 80)
  if (!name) return 'The design system has no name.'
  const colors = Object.fromEntries(Object.entries(obj(o.colors)).filter(([, v]) => HEX.test(str(v))).map(([k, v]) => [k, str(v)]))
  if (!colors.primary || !colors.background || !colors.text) return 'The design system needs at least a primary, a background and a text colour.'
  const f = obj(o.fonts)
  const fonts = { heading: str(f.heading) || 'Inter', body: str(f.body) || 'Inter', mono: str(f.mono) || 'ui-monospace' }
  const r = obj(o.radius)
  const radius = Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number' && v >= 0 && v <= 64)) as Record<string, number>
  const v = obj(o.voice)
  return {
    name,
    colors,
    fonts,
    scale: nums(o.scale, 8, 160).slice(0, 10),
    spacing: nums(o.spacing, 0, 256).slice(0, 12),
    radius,
    components: Object.fromEntries(Object.entries(obj(o.components)).map(([k, d]) => [k, str(d)]).filter(([, d]) => d)),
    voice: { tone: str(v.tone), do: lines(v.do), dont: lines(v.dont) },
  }
}

/** A Draft as W3C design tokens, with our two groups beside them. */
export function tokensOf(d: Draft): Record<string, unknown> {
  const group = <T>(rec: Record<string, T>, type: string, unit = '') =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, { $value: unit ? `${v}${unit}` : v, $type: type }]))
  return {
    color: group(d.colors, 'color'),
    font: group({ heading: d.fonts.heading, body: d.fonts.body, mono: d.fonts.mono }, 'fontFamily'),
    type: group(Object.fromEntries(d.scale.map((n, i) => [`step${i}`, n])), 'dimension', 'px'),
    space: group(Object.fromEntries(d.spacing.map((n, i) => [`s${i}`, n])), 'dimension', 'px'),
    radius: group(d.radius, 'dimension', 'px'),
    components: Object.fromEntries(Object.entries(d.components).map(([k, v]) => [k, { $value: v, $type: 'string' }])),
    voice: { tone: { $value: d.voice.tone, $type: 'string' }, do: { $value: d.voice.do, $type: 'string' }, dont: { $value: d.voice.dont, $type: 'string' } },
  }
}

/** One token group as `name value` pairs. */
function pairs(tokens: Record<string, unknown>, group: string): [string, string][] {
  return Object.entries(obj(tokens[group])).map(([k, v]) => {
    const val = obj(v).$value
    return [k, Array.isArray(val) ? val.join('; ') : String(val ?? '')]
  })
}

/** What a model is told on every message of a conversation the system is attached to. */
export function said(b: Brand): string {
  const t = b.tokens
  const row = (g: string) => pairs(t, g).map(([k, v]) => `${k} ${v}`).join(', ')
  const parts = [
    `Design system "${b.name}" is attached to this conversation. Everything you make — pages, apps, components, slides, images and copy — follows it exactly; never invent other colours, fonts or radii.`,
    row('color') && `Colours: ${row('color')}.`,
    row('font') && `Fonts: ${row('font')}.`,
    row('type') && `Type scale: ${row('type')}.`,
    row('space') && `Spacing: ${row('space')}.`,
    row('radius') && `Radius: ${row('radius')}.`,
    row('components') && `Components: ${pairs(t, 'components').map(([k, v]) => `${k} — ${v}`).join(' ')}`,
    row('voice') && `Voice: ${pairs(t, 'voice').map(([k, v]) => `${k}: ${v}`).join(' | ')}`,
    'In HTML, set these as CSS custom properties on :root and use them; load the fonts from Google Fonts when they are web fonts.',
  ]
  return parts.filter(Boolean).join('\n')
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The system drawn as a page: its palette, type, a button, a card, an input, its voice. */
export function preview(b: Brand): string {
  const t = b.tokens
  const c = Object.fromEntries(pairs(t, 'color'))
  const f = Object.fromEntries(pairs(t, 'font'))
  const r = Object.fromEntries(pairs(t, 'radius'))
  const sizes = pairs(t, 'type').map(([, v]) => v)
  const voice = Object.fromEntries(pairs(t, 'voice'))
  const comps = pairs(t, 'components')
  const fonts = [f.heading, f.body].filter((x) => x && !/^ui-|system|sans-serif|serif$/i.test(x))
  const link = fonts.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts.map((x) => `family=${encodeURIComponent(x)}:wght@400;600;700`).join('&')}&display=swap">` : ''
  const swatches = Object.entries(c).map(([k, v]) => `<div class="sw"><span style="background:${esc(v)}"></span><b>${esc(k)}</b><code>${esc(v)}</code></div>`).join('')
  const scale = sizes.map((s) => `<div style="font-size:${esc(s)}">${esc(b.name)} — ${esc(s)}</div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.name)}</title>${link}
<style>:root{--primary:${c.primary};--secondary:${c.secondary ?? c.primary};--accent:${c.accent ?? c.primary};--bg:${c.background};--surface:${c.surface ?? c.background};--text:${c.text};--muted:${c.muted ?? c.text};--border:${c.border ?? c.muted ?? c.text};--r-sm:${r.sm ?? '4px'};--r-md:${r.md ?? '8px'};--r-lg:${r.lg ?? '16px'}}
body{margin:0;background:var(--bg);color:var(--text);font-family:'${esc(f.body ?? 'Inter')}',system-ui,sans-serif;padding:40px;line-height:1.5}
h1,h2{font-family:'${esc(f.heading ?? 'Inter')}',system-ui,sans-serif;margin:0 0 12px}h2{margin-top:40px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:16px}.sw{display:flex;flex-direction:column;gap:4px;width:120px}.sw span{height:64px;border-radius:var(--r-md);border:1px solid var(--border)}.sw code{color:var(--muted);font-size:12px}
.btn{background:var(--primary);color:var(--bg);border:0;border-radius:var(--r-md);padding:12px 20px;font:inherit;font-weight:600}.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;max-width:320px}input{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font:inherit;width:260px}
li{color:var(--muted)}</style></head><body>
<h1 style="font-size:40px">${esc(b.name)}</h1><p style="color:var(--muted)">${esc(voice.tone ?? '')}</p>
<h2>Colour</h2><div class="row">${swatches}</div>
<h2>Type</h2>${scale}
<h2>Components</h2><div class="row" style="align-items:flex-start"><button class="btn">Primary action</button><button class="btn ghost">Secondary</button><input placeholder="An input"><div class="card"><b>A card</b><p style="color:var(--muted);margin:8px 0 0">${esc(comps.find(([k]) => k === 'card')?.[1] ?? '')}</p></div></div>
<ul>${comps.map(([k, v]) => `<li><b style="color:var(--text)">${esc(k)}</b> — ${esc(v)}</li>`).join('')}</ul>
<h2>Voice</h2><p><b>Do</b>: ${esc(voice.do ?? '')}</p><p><b>Don't</b>: ${esc(voice.dont ?? '')}</p>
</body></html>`
}
