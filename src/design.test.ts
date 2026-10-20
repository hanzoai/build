import { describe, expect, test } from 'vitest'
import { drafted, preview, said, tokensOf, type Draft } from './design.ts'

const raw = {
  name: 'Tidepool',
  colors: { primary: '#0E7C86', secondary: '#1B3A4B', accent: '#F2A541', background: '#FFFFFF', surface: '#F4F7F8', text: '#0B1F2A', muted: '#5B7280', border: '#D5E0E4' },
  fonts: { heading: 'Fraunces', body: 'Inter', mono: 'JetBrains Mono' },
  scale: [12, 14, 16, 20, 28, 40],
  spacing: [4, 8, 12, 16, 24, 32],
  radius: { sm: 4, md: 8, lg: 16 },
  components: { button: 'Solid teal, 8px corners', card: 'White on surface, hairline border', input: 'Surface fill', nav: 'Left aligned', hero: 'Big serif headline' },
  voice: { tone: 'Calm and exact', do: ['Say what it does'], dont: ['Hype'] },
}

describe('design system', () => {
  test('a model answer becomes a draft, and a broken one says why', () => {
    expect(typeof drafted(raw)).toBe('object')
    expect(drafted({ ...raw, colors: { primary: 'teal' } })).toMatch(/primary, a background and a text/)
    expect(drafted({ ...raw, name: '' })).toMatch(/no name/)
  })
  test('tokens are W3C groups with our components and voice beside them', () => {
    const t = tokensOf(drafted(raw) as Draft)
    expect((t.color as Record<string, { $value: string }>).primary.$value).toBe('#0E7C86')
    expect((t.radius as Record<string, { $value: string }>).md.$value).toBe('8px')
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['color', 'font', 'type', 'space', 'radius', 'components', 'voice']))
  })
  test('what the model is told names every colour and the voice; the page draws them', () => {
    const b = { id: 'brd_1', name: 'Tidepool', tokens: tokensOf(drafted(raw) as Draft) }
    const told = said(b)
    expect(told).toContain('#F2A541')
    expect(told).toContain('Calm and exact')
    expect(preview(b)).toContain('--primary:#0E7C86')
    expect(preview(b)).not.toContain('<script')
  })
})
