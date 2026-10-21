import { describe, expect, it, vi } from 'vitest'

vi.mock('@hanzo/gui', () => ({ SizableText: () => null, XStack: () => null }))
vi.mock('@hanzogui/lucide-icons-2', () => ({ Check: () => null, Copy: () => null, PanelRight: () => null, Square: () => null, Volume2: () => null }))
vi.mock('@hanzo/voice', () => ({ mouth: () => null, speech: () => null }))

const { artifacts, renders } = await import('./reply.tsx')

describe('an answer’s fenced blocks', () => {
  it('are named by a file name wherever the info string puts it, else by the language', () => {
    const text = '```html otter.html\n<h1>Otter</h1>\n```\n```index.html\n<p>a</p>\n```\n```ts\nconst n = 1\n```\n```\nplain\n```'
    const out = artifacts(text)
    expect(out.map((a) => a.name)).toEqual(['otter.html', 'index.html', 'ts block', 'Block 4'])
    expect(out[0]).toMatchObject({ mime: 'text/html', body: '<h1>Otter</h1>\n' })
    expect(out.filter(renders).map((a) => a.name)).toEqual(['otter.html', 'index.html'])
  })
})
