/**
 * Files with an ask, for every composer the builder draws: they ride the
 * prompt as text — nothing is uploaded anywhere else. The paperclip is the
 * composer's (prompt.tsx); this reads what it picks and draws the chips.
 */
import { SizableText, XStack } from '@hanzo/gui'
import { Paperclip, X } from '@hanzogui/lucide-icons-2'
import { ComposerTool } from '@hanzo/ui/chat'

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

/** Ask the browser for files and read them in, within the caps; the picker is minted per press. */
export function pick(have: Attached[], onFiles: (f: Attached[]) => void, onNote: (n: string) => void): void {
  if (typeof document === 'undefined') return
  const ask = document.createElement('input')
  ask.type = 'file'
  ask.multiple = true
  ask.onchange = () => {
    if (!ask.files?.length) return
    void read(have, ask.files).then(({ files, note }) => {
      onFiles(files)
      onNote(note)
    })
  }
  ask.click()
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
