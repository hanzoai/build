/**
 * The composer's quiet controls, once, for every composer the builder draws:
 * attach files (which ride the prompt as text — nothing is uploaded anywhere
 * else) and dictate (recorded here, transcribed by the platform).
 */
import { SizableText, XStack } from '@hanzo/gui'
import { ChevronDown, Mic, MicOff, Paperclip, Plus, X } from '@hanzogui/lucide-icons-2'
import { ComposerTool } from '@hanzo/ui/chat'
import { ChipSelect } from '@hanzo/ui/product'
import { useRef } from 'react'

import { useTarget } from './host.tsx'
import { useDictation } from './voice.ts'

export interface Attached {
  name: string
  text: string
}

const EACH = 100_000
const ALL = 200_000

/** The ask with its attachments appended as fenced text. */
export function compose(prompt: string, files: Attached[]): string {
  if (!files.length) return prompt
  return prompt + files.map((f) => `\n\n\`${f.name}\`:\n\`\`\`\n${f.text}\n\`\`\``).join('')
}

/** Read `list` into `have`, within the caps; answers the new list and what was refused. */
export async function read(have: Attached[], list: FileList): Promise<{ files: Attached[]; note: string }> {
  const files = [...have]
  let total = files.reduce((n, f) => n + f.text.length, 0)
  let note = ''
  for (const file of Array.from(list)) {
    if (file.size > EACH) {
      note = `${file.name} is over 100 KB; attach a smaller file or point the run at the repository.`
      continue
    }
    const text = await file.text()
    if (total + text.length > ALL) {
      note = 'Attachments are capped at 200 KB in all.'
      break
    }
    total += text.length
    files.push({ name: file.name, text })
  }
  return { files, note }
}

export function Attach({ files, onFiles, onNote }: { files: Attached[]; onFiles: (f: Attached[]) => void; onNote: (n: string) => void }) {
  const picker = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <ComposerTool label="Attach files" icon={<Plus size={14} />} onPress={() => picker.current?.click()} />
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        // `hidden` alone loses to a reset that sets `display` on inputs.
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const input = e.currentTarget
          if (!input.files) return
          void read(files, input.files).then(({ files: next, note }) => {
            onFiles(next)
            onNote(note)
            input.value = ''
          })
        }}
      />
    </>
  )
}

/** The attached files as small removable marks. */
export function Files({ files, onFiles }: { files: Attached[]; onFiles: (f: Attached[]) => void }) {
  return (
    <>
      {files.map((f) => (
        <XStack key={f.name} items="center" gap="$1" px="$2" height={24} rounded="$2" bg="$raised">
          <Paperclip size={12} />
          <SizableText size="$1" color="$ink" numberOfLines={1} maxW={140}>
            {f.name}
          </SizableText>
          <ComposerTool label={`Remove ${f.name}`} icon={<X size={12} />} onPress={() => onFiles(files.filter((x) => x !== f))} />
        </XStack>
      ))}
    </>
  )
}

export function Dictate({ onText, onNote }: { onText: (text: string) => void; onNote: (note: string) => void }) {
  const voice = useDictation(useTarget(), onText, onNote)
  return (
    <XStack items="center">
      <ComposerTool
        label={!voice.able ? 'Dictation needs a microphone this page can record' : voice.on ? 'Stop and transcribe' : voice.busy ? 'Transcribing…' : 'Dictate'}
        icon={voice.on ? <MicOff size={14} /> : <Mic size={14} />}
        onPress={() => void voice.toggle()}
        disabled={!voice.able || voice.busy}
        aria-pressed={voice.on}
      />
      <ChipSelect
        quiet
        name="Dictation language"
        icon={<ChevronDown size={12} />}
        label=""
        chosen={voice.languages.find((l) => l.id === voice.language) ?? null}
        items={voice.languages}
        onChange={(l) => voice.setLanguage(l.id)}
        placeholder="Search languages…"
        disabled={!voice.able}
      />
    </XStack>
  )
}
