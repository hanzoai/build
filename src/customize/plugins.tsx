/**
 * Plugins: TypeScript connectors the org builds for the runtime to run.
 *
 * Browse offers building one, then lists what this deployment mounts, which is
 * built in and read-only. Yours is what the org built, each with the source that
 * runs. Building is the gate — the platform bundles and compiles the source and
 * keeps it only if both succeed, and a failure says why in the bundler's words.
 * Describe an API instead of writing the TypeScript and a model writes it; the
 * result opens to be read. A plugin carries no credential: it names the
 * connector whose credential it reads when it runs.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { Puzzle } from '@hanzogui/lucide-icons-2'
import { Button, Input, Textarea } from '@hanzo/ui'
import { Code } from '@hanzo/ui/chat'
import { useState } from 'react'

import { authored, build, mounted, remove, type Mount, type Plugin } from '../api/plugins.ts'
import { useHost, useTarget } from '../host.tsx'
import { useLoad } from './load.ts'
import { say } from './say.ts'
import { Choice, Confirm, day, Empty, Failed, Field, Grid, Line, Mark, matches, mono, Part, Sheet, Soft, Tile, useCount, Visitor, type Pane } from './ui.tsx'

const kb = (n: number): string => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)

export function Plugins({ view, q, adding, onAdding, onView, onCount }: Pane) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const mine = useLoad(signed ? () => authored(t) : null, [] as Plugin[], [t, signed])
  const mounts = useLoad(signed && view === 'discover' ? () => mounted(t) : null, [] as Mount[], [t, signed, view])
  const [opened, setOpened] = useState<Plugin | null>(null)
  const [note, setNote] = useState('')
  useCount(mine.value.length, onCount)

  const sheets = (
    <>
      {adding ? (
        <Build
          onClose={() => onAdding(false)}
          onBuilt={(p, said) => {
            onAdding(false)
            onView('yours')
            mine.reload()
            setNote(said)
            setOpened(p)
          }}
        />
      ) : null}
      {opened ? (
        <Source
          plugin={opened}
          onClose={() => setOpened(null)}
          onDeleted={() => {
            setNote(`${opened.name} is deleted`)
            setOpened(null)
            mine.reload()
          }}
        />
      ) : null}
    </>
  )

  if (!signed) {
    return <Visitor>{view === 'discover' ? 'Sign in to browse plugins.' : 'Sign in to see your plugins.'}</Visitor>
  }

  if (view === 'discover') {
    const shown = mounts.value.filter((m) => matches(q, m.name, ...m.prefixes))
    return (
      <YStack gap="$6">
        <Line>{note}</Line>
        <Part title="Build your own" detail="Write a connector in TypeScript, or describe an API and Hanzo writes it.">
          <XStack>
            <Button size="sm" onPress={() => onAdding(true)}>
              Build a plugin
            </Button>
          </XStack>
        </Part>
        <Part title="Built in" detail="Part of Hanzo. Always on, nothing to add.">
          {mounts.error && !mounts.value.length ? (
            <Failed error={mounts.error} onRetry={mounts.reload} />
          ) : mounts.loading && !mounts.value.length ? (
            <Soft>Loading built-in plugins…</Soft>
          ) : !shown.length ? (
            <Soft>{mounts.value.length ? `Nothing built in matches “${q.trim()}”.` : 'Nothing built in is listed.'}</Soft>
          ) : (
            <>
              <SizableText size="$1" color="$soft">
                {shown.length} built in
              </SizableText>
              <Grid label="Mounted subsystems">
                {shown.map((m) => (
                  <Tile key={m.name} title={m.name} detail={m.prefixes.join('  ')} meta={m.enabled ? 'On' : 'Off'} mark={<Mark name={m.name} icon={<Puzzle size={15} />} />} />
                ))}
              </Grid>
            </>
          )}
        </Part>
        {sheets}
      </YStack>
    )
  }

  const shown = mine.value.filter((p) => matches(q, p.name, p.provider))
  return (
    <YStack gap="$3">
      <Line>{note}</Line>
      {mine.error && !mine.value.length ? (
        <Failed error={mine.error} onRetry={mine.reload} />
      ) : mine.loading && !mine.value.length ? (
        <Soft>Loading your plugins…</Soft>
      ) : !mine.value.length ? (
        <Empty title="No plugins yet" detail="Write a connector in TypeScript, or describe an API and Hanzo writes it.">
          <Button size="sm" onPress={() => onAdding(true)}>
            Build a plugin
          </Button>
        </Empty>
      ) : !shown.length ? (
        <Soft>{`No plugin of yours matches “${q.trim()}”.`}</Soft>
      ) : (
        <Grid label="Your plugins">
          {shown.map((p) => (
            <Tile
              key={p.id}
              title={p.name}
              detail={p.provider ? `Reads the ${p.provider} connector’s credential when it runs.` : 'Needs no credential.'}
              meta={day(p.built) ? `Built ${day(p.built)}` : undefined}
              mark={<Mark name={p.name} />}
              onOpen={() => setOpened(p)}
            />
          ))}
        </Grid>
      )}
      {sheets}
    </YStack>
  )
}

const WAYS = [
  { id: 'source', label: 'TypeScript' },
  { id: 'spec', label: 'Describe an API' },
] as const

/** Build a plugin from its TypeScript, or from a description of the API it calls. */
function Build({ onClose, onBuilt }: { onClose: () => void; onBuilt: (p: Plugin, said: string) => void }) {
  const t = useTarget()
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('')
  const [way, setWay] = useState<'source' | 'spec'>('source')
  // Each way keeps its own text, so switching between them loses neither.
  const [source, setSource] = useState('')
  const [spec, setSpec] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const go = async () => {
    setWorking(true)
    setNote(way === 'spec' ? 'Writing and building it…' : 'Building it…')
    try {
      const out = await build(t, { name: name.trim(), provider, source: way === 'source' ? source : '', spec: way === 'spec' ? spec : '' })
      onBuilt(out.plugin, `${out.plugin.name} built: ${kb(out.bytes)}${out.generated ? ', written from your description — read it below' : ''}.`)
    } catch (e) {
      setNote(say(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Sheet title="Build a plugin" open onOpenChange={(o) => !o && onClose()} width={680}>
      <Field label="Name" hint="One lowercase word: letters, digits, _ or -.">
        <Input value={name} onChangeText={setName} aria-label="Name" autoCapitalize="none" />
      </Field>
      <Field label="Connector" hint="Optional. The connector whose key it uses when it runs; a plugin never holds a key itself.">
        <Input value={provider} onChangeText={setProvider} aria-label="Connector" autoCapitalize="none" />
      </Field>
      <Choice label="Build from" value={way} options={WAYS} onChange={setWay} />
      <Field
        label={way === 'source' ? 'Source' : 'The API'}
        hint={
          way === 'source'
            ? 'Kept only if it builds. A failed build says why.'
            : 'An OpenAPI document, or the endpoints in plain words. You read the TypeScript before it runs.'
        }
      >
        <Textarea
          value={way === 'source' ? source : spec}
          onChangeText={way === 'source' ? setSource : setSpec}
          aria-label={way === 'source' ? 'Source' : 'The API'}
          placeholder={way === 'source' ? 'export const acme = createProvider({ … })' : 'POST /v1/things creates a thing…'}
          rows={14}
          style={mono}
        />
      </Field>
      <Line>{note}</Line>
      <XStack gap="$2" justify="flex-end">
        <Button size="sm" variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={working} onPress={() => void go()}>
          Build
        </Button>
      </XStack>
    </Sheet>
  )
}

/** A built plugin's source, as the runtime will run it, and deleting it. */
function Source({ plugin, onClose, onDeleted }: { plugin: Plugin; onClose: () => void; onDeleted: () => void }) {
  const t = useTarget()
  const [asking, setAsking] = useState(false)
  return (
    <Sheet title={plugin.name} open onOpenChange={(o) => !o && onClose()} width={760}>
      <SizableText size="$2" color="$soft">
        {plugin.provider ? `Reads the ${plugin.provider} connector’s credential when it runs.` : 'Needs no credential.'}
        {day(plugin.built) ? ` Built ${day(plugin.built)}.` : ''}
      </SizableText>
      <Code language="TypeScript" value={plugin.source}>
        <SizableText size="$1" color="$ink" style={{ ...mono, whiteSpace: 'pre' }}>
          {plugin.source}
        </SizableText>
      </Code>
      <YStack items="flex-start">
        <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
          Delete plugin
        </Button>
      </YStack>
      <Confirm
        what={plugin.name}
        says="The runtime can no longer load it."
        open={asking}
        onOpenChange={setAsking}
        onYes={async () => {
          await remove(t, plugin.id)
          onDeleted()
        }}
      />
    </Sheet>
  )
}
