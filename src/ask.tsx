/**
 * Asking one thing before an act: to confirm one that cannot be undone, or the
 * new name for something. A refusal is said in the dialog, which stays open, so
 * the reason is read where the act was asked for.
 */
import { SizableText, XStack } from '@hanzo/gui'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@hanzo/ui'
import { useEffect, useState } from 'react'

/** One act in flight, and what refused it. */
function useAct(onDone: () => void) {
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  const go = async (run: () => Promise<void>) => {
    setWorking(true)
    setNote('')
    try {
      await run()
      setWorking(false)
      onDone()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not work')
      setWorking(false)
    }
  }
  return { working, note, setNote, go }
}

function Said({ note }: { note: string }) {
  if (!note) return null
  return (
    <SizableText size="$1" color="$soft" role="status">
      {note}
    </SizableText>
  )
}

export function Confirm({
  open,
  onOpenChange,
  title,
  says,
  act,
  run,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  /** The whole consequence, stated plainly. */
  says: string
  /** The button's word: Delete, Remove, Forget. */
  act: string
  run: () => Promise<void>
}) {
  const { working, note, setNote, go } = useAct(() => onOpenChange(false))
  const close = (o: boolean) => {
    if (working) return
    setNote('')
    onOpenChange(o)
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent maxW={420} showCloseButton={false}>
        <DialogTitle>{title}</DialogTitle>
        <SizableText size="$2" color="$soft">
          {says}
        </SizableText>
        <Said note={note} />
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="ghost" disabled={working} onPress={() => close(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" disabled={working} onPress={() => void go(run)}>
            {act}
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}

export function Rename({
  open,
  onOpenChange,
  title,
  name,
  run,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  /** The name it has now. */
  name: string
  run: (next: string) => Promise<void>
}) {
  const [value, setValue] = useState(name)
  const { working, note, setNote, go } = useAct(() => onOpenChange(false))
  useEffect(() => {
    if (open) setValue(name)
  }, [open, name])
  const close = (o: boolean) => {
    if (working) return
    setNote('')
    onOpenChange(o)
  }
  const save = () => {
    const next = value.trim()
    if (!next) return setNote('It needs a name')
    if (next === name) return close(false)
    void go(() => run(next))
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent maxW={420} showCloseButton={false}>
        <DialogTitle>{title}</DialogTitle>
        <Input
          autoFocus
          value={value}
          onChangeText={setValue}
          aria-label="Name"
          onKeyDown={(e: { key?: string; nativeEvent?: { key?: string } }) => {
            if ((e.key ?? e.nativeEvent?.key) === 'Enter') save()
          }}
        />
        <Said note={note} />
        <XStack gap="$2" justify="flex-end">
          <Button size="sm" variant="ghost" disabled={working} onPress={() => close(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={working} onPress={save}>
            Save
          </Button>
        </XStack>
      </DialogContent>
    </Dialog>
  )
}
