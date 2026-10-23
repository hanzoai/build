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
 *
 * Its words are the reader's language (@hanzo/i18n `t`); a plugin's name, its
 * source and the bundler's reasons are drawn as given.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
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
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const signed = Boolean(host.person)
  const mine = useLoad(signed ? () => authored(target) : null, [] as Plugin[], [target, signed])
  const mounts = useLoad(signed && view === 'discover' ? () => mounted(target) : null, [] as Mount[], [target, signed, view])
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
            setNote(t('{name} is deleted', { name: opened.name }))
            setOpened(null)
            mine.reload()
          }}
        />
      ) : null}
    </>
  )

  if (!signed) {
    return <Visitor>{view === 'discover' ? t('Sign in to browse plugins.') : t('Sign in to see your plugins.')}</Visitor>
  }

  if (view === 'discover') {
    const shown = mounts.value.filter((m) => matches(q, m.name, ...m.prefixes))
    return (
      <YStack gap="$6">
        <Line>{note}</Line>
        <Part title={t('Build your own')} detail={t('Write a connector in TypeScript, or describe an API and Hanzo writes it.')}>
          <XStack>
            <Button size="sm" onPress={() => onAdding(true)}>
              {t('Build a plugin')}
            </Button>
          </XStack>
        </Part>
        <Part title={t('Built in')} detail={t('Part of Hanzo. Always on, nothing to add.')}>
          {mounts.error && !mounts.value.length ? (
            <Failed error={mounts.error} onRetry={mounts.reload} />
          ) : mounts.loading && !mounts.value.length ? (
            <Soft>{t('Loading built-in plugins…')}</Soft>
          ) : !shown.length ? (
            <Soft>{mounts.value.length ? t('Nothing built in matches “{q}”.', { q: q.trim() }) : t('Nothing built in is listed.')}</Soft>
          ) : (
            <>
              <SizableText size="$1" color="$soft">
                {t('{n} built in', { n: shown.length })}
              </SizableText>
              <Grid label={t('Mounted subsystems')}>
                {shown.map((m) => (
                  <Tile key={m.name} title={m.name} detail={m.prefixes.join('  ')} meta={m.enabled ? t('On') : t('Off')} mark={<Mark name={m.name} icon={<Puzzle size={15} />} />} />
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
        <Soft>{t('Loading your plugins…')}</Soft>
      ) : !mine.value.length ? (
        <Empty title={t('No plugins yet')} detail={t('Write a connector in TypeScript, or describe an API and Hanzo writes it.')}>
          <Button size="sm" onPress={() => onAdding(true)}>
            {t('Build a plugin')}
          </Button>
        </Empty>
      ) : !shown.length ? (
        <Soft>{t('No plugin of yours matches “{q}”.', { q: q.trim() })}</Soft>
      ) : (
        <Grid label={t('Your plugins')}>
          {shown.map((p) => (
            <Tile
              key={p.id}
              title={p.name}
              detail={p.provider ? t('Reads the {provider} connector’s credential when it runs.', { provider: p.provider }) : t('Needs no credential.')}
              meta={day(p.built) ? t('Built {date}', { date: day(p.built) }) : undefined}
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

/** Build a plugin from its TypeScript, or from a description of the API it calls. */
function Build({ onClose, onBuilt }: { onClose: () => void; onBuilt: (p: Plugin, said: string) => void }) {
  const { t } = useI18n()
  const target = useTarget()
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
    setNote(way === 'spec' ? t('Writing and building it…') : t('Building it…'))
    try {
      const out = await build(target, { name: name.trim(), provider, source: way === 'source' ? source : '', spec: way === 'spec' ? spec : '' })
      const built = { name: out.plugin.name, size: kb(out.bytes) }
      onBuilt(out.plugin, out.generated ? t('{name} built: {size}, written from your description — read it below.', built) : t('{name} built: {size}.', built))
    } catch (e) {
      setNote(say(e, t))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Sheet title={t('Build a plugin')} open onOpenChange={(o) => !o && onClose()} width={680}>
      <Field label={t('Name')} hint={t('One lowercase word: letters, digits, _ or -.')}>
        <Input value={name} onChangeText={setName} aria-label={t('Name')} autoCapitalize="none" />
      </Field>
      <Field label={t('Connector')} hint={t('Optional. The connector whose key it uses when it runs; a plugin never holds a key itself.')}>
        <Input value={provider} onChangeText={setProvider} aria-label={t('Connector')} autoCapitalize="none" />
      </Field>
      <Choice
        label={t('Build from')}
        value={way}
        options={[
          { id: 'source', label: 'TypeScript' },
          { id: 'spec', label: t('Describe an API') },
        ]}
        onChange={setWay}
      />
      <Field
        label={way === 'source' ? t('Source') : t('The API')}
        hint={
          way === 'source'
            ? t('Kept only if it builds. A failed build says why.')
            : t('An OpenAPI document, or the endpoints in plain words. You read the TypeScript before it runs.')
        }
      >
        <Textarea
          value={way === 'source' ? source : spec}
          onChangeText={way === 'source' ? setSource : setSpec}
          aria-label={way === 'source' ? t('Source') : t('The API')}
          placeholder={way === 'source' ? 'export const acme = createProvider({ … })' : t('POST /v1/things creates a thing…')}
          rows={14}
          style={mono}
        />
      </Field>
      <Line>{note}</Line>
      <XStack gap="$2" justify="flex-end">
        <Button size="sm" variant="ghost" onPress={onClose}>
          {t('Cancel')}
        </Button>
        <Button size="sm" disabled={working} onPress={() => void go()}>
          {t('Build')}
        </Button>
      </XStack>
    </Sheet>
  )
}

/** A built plugin's source, as the runtime will run it, and deleting it. */
function Source({ plugin, onClose, onDeleted }: { plugin: Plugin; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n()
  const target = useTarget()
  const [asking, setAsking] = useState(false)
  return (
    <Sheet title={plugin.name} open onOpenChange={(o) => !o && onClose()} width={760}>
      <SizableText size="$2" color="$soft">
        {[
          plugin.provider ? t('Reads the {provider} connector’s credential when it runs.', { provider: plugin.provider }) : t('Needs no credential.'),
          day(plugin.built) ? t('Built {date}.', { date: day(plugin.built) }) : '',
        ]
          .filter(Boolean)
          .join(' ')}
      </SizableText>
      <Code language="TypeScript" value={plugin.source}>
        <SizableText size="$1" color="$ink" style={{ ...mono, whiteSpace: 'pre' }}>
          {plugin.source}
        </SizableText>
      </Code>
      <YStack items="flex-start">
        <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
          {t('Delete plugin')}
        </Button>
      </YStack>
      <Confirm
        what={plugin.name}
        says={t('The runtime can no longer load it.')}
        open={asking}
        onOpenChange={setAsking}
        onYes={async () => {
          await remove(target, plugin.id)
          onDeleted()
        }}
      />
    </Sheet>
  )
}
