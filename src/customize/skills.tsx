/**
 * Skills: what the agent knows how to do, each a SKILL.md it reads when an agent
 * names it.
 *
 * Browse is Hanzo's catalogue; adding one switches it on for the org, which is
 * all adding is: the platform keeps no copy. Yours is the org's own skills —
 * written here, each with its switch — and the catalogue's skills it has added.
 * A skill written here is switched on when it is saved.
 *
 * Its words are the reader's language (@hanzo/i18n `t`); a skill's name,
 * description and SKILL.md are the platform's or the org's, drawn as given.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { useI18n } from '@hanzo/i18n/react'
import { BookOpen } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch, Textarea } from '@hanzo/ui'
import { Code } from '@hanzo/ui/chat'
import { useMemo, useState } from 'react'

import { active, authored, brand, document, nameOf, remove, tool, write, type Catalogue, type Entry, type Skill } from '../api/skills.ts'
import { toggle, type Tool } from '../api/tools.ts'
import { useHost, useTarget } from '../host.tsx'
import { useLoad } from './load.ts'
import { say } from './say.ts'
import { Add, Confirm, day, Empty, Failed, Field, Grid, Line, Mark, matches, mono, Part, Sheet, Soft, Tile, useCount, Visitor, type Pane } from './ui.tsx'

const PAGE = 60

/** A skill to read: one of the catalogue's, or one the org added from it. */
interface Reading {
  name: string
  description: string
  product: string
}

export function Skills({ view, q, adding, onAdding, onView, onCount }: Pane) {
  const { t } = useI18n()
  const host = useHost()
  const target = useTarget()
  const signed = Boolean(host.person)
  // What every run in the org loads is an org admin's to change; a member reads it.
  const may = signed && host.admin
  const own = useLoad(signed ? () => authored(target) : null, [] as Skill[], [target, signed])
  const on = useLoad(signed ? () => active(target) : null, [] as Tool[], [target, signed])
  const shelf = useLoad(view === 'discover' ? () => brand(target) : null, null as Catalogue | null, [target.api, view])
  const [editing, setEditing] = useState<Skill | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [shown, setShown] = useState(PAGE)

  const lit = useMemo(() => new Set(on.value.map((x) => x.name)), [on.value])
  const mine = useMemo(() => new Set(own.value.map((s) => s.name)), [own.value])
  const added = on.value.filter((x) => nameOf(x.name) && !mine.has(nameOf(x.name)))
  useCount(own.value.length + added.length, onCount)

  /** Switch one skill on or off, then read what is on again. */
  const flip = async (name: string, next: boolean) => {
    setBusy(name)
    setNote('')
    try {
      await toggle(target, next ? [tool(name)] : [], next ? [] : [tool(name)])
      on.reload()
      setNote(next ? t('{name} is on', { name }) : t('{name} is off', { name }))
    } catch (e) {
      setNote(say(e, t))
    } finally {
      setBusy('')
    }
  }

  const reader = reading ? (
    <Reader
      skill={reading}
      added={lit.has(tool(reading.name))}
      signed={may}
      busy={busy === reading.name}
      onFlip={(next) => void flip(reading.name, next)}
      onClose={() => setReading(null)}
    />
  ) : null
  const editor =
    adding || editing ? (
      <Editor
        skill={editing}
        may={may}
        onClose={() => {
          setEditing(null)
          onAdding(false)
        }}
        onSaved={(s, fresh) => {
          setEditing(null)
          onAdding(false)
          own.reload()
          on.reload()
          onView('yours')
          setNote(fresh ? t('{name} is saved and on', { name: s.name }) : t('{name} is saved', { name: s.name }))
        }}
        onDeleted={(name) => {
          setEditing(null)
          own.reload()
          on.reload()
          setNote(t('{name} is deleted', { name }))
        }}
      />
    ) : null

  if (view === 'discover') {
    const all = shelf.value?.skills ?? []
    const found = all.filter((e) => matches(q, e.name, e.description, e.product))
    return (
      <YStack gap="$3">
        <Line>{note}</Line>
        <Part title={t('From Hanzo')} detail={t('Add one and every run in your organization can use it.')}>
          {shelf.error && !shelf.value ? (
            <Failed error={shelf.error} onRetry={shelf.reload} />
          ) : !shelf.value ? (
            <Soft>{t('Loading skills…')}</Soft>
          ) : !found.length ? (
            <Soft>{all.length ? t('No skill matches “{q}”.', { q: q.trim() }) : t('There are no skills to add yet.')}</Soft>
          ) : (
            <>
              <SizableText size="$1" color="$soft">
                {found.length === all.length ? t('{n} skills', { n: all.length }) : t('{found} of {n} skills', { found: found.length, n: all.length })}
              </SizableText>
              <Grid label={t('Skills to add')}>
                {found.slice(0, shown).map((e: Entry) => (
                  <Tile
                    key={e.name}
                    title={e.name}
                    detail={e.description}
                    meta={e.product}
                    mark={<Mark name={e.name} icon={<BookOpen size={15} />} />}
                    onOpen={() => setReading(e)}
                    action={may ? <Add name={e.name} added={lit.has(tool(e.name))} busy={busy === e.name} onPress={() => void flip(e.name, true)} /> : undefined}
                  />
                ))}
              </Grid>
              {found.length > shown ? (
                <XStack justify="center">
                  <Button size="sm" variant="outline" onPress={() => setShown(shown + PAGE)}>
                    {t('Show more')}
                  </Button>
                </XStack>
              ) : null}
            </>
          )}
        </Part>
        {reader}
        {editor}
      </YStack>
    )
  }

  if (!signed) {
    return <Visitor>{t('Sign in to see your skills.')}</Visitor>
  }
  const ownShown = own.value.filter((s) => matches(q, s.name, s.description))
  const addedShown = added.filter((x) => matches(q, nameOf(x.name), x.description))
  const error = own.error ?? on.error
  return (
    <YStack gap="$5">
      <Line>{note}</Line>
      {error && !own.value.length && !on.value.length ? (
        <Failed
          error={error}
          onRetry={() => {
            own.reload()
            on.reload()
          }}
        />
      ) : (own.loading || on.loading) && !own.value.length && !on.value.length ? (
        <Soft>{t('Loading your skills…')}</Soft>
      ) : !own.value.length && !added.length ? (
        <Empty title={t('No skills yet')} detail={may ? t('Add one from Hanzo, or write your own.') : t('An org admin adds skills. Browse what there is.')}>
          <Button size="sm" variant="outline" onPress={() => onView('discover')}>
            {t('Browse skills')}
          </Button>
          {may ? (
            <Button size="sm" onPress={() => onAdding(true)}>
              {t('Write a skill')}
            </Button>
          ) : null}
        </Empty>
      ) : !ownShown.length && !addedShown.length ? (
        <Soft>{t('No skill of yours matches “{q}”.', { q: q.trim() })}</Soft>
      ) : (
        <>
          {ownShown.length ? (
            <Part title={t('Made by your team')} detail={t('Off keeps a skill but leaves it out of every run.')}>
              <Grid label={t('Your skills')}>
                {ownShown.map((s) => (
                  <Tile
                    key={s.id}
                    title={s.name}
                    detail={s.description || firstLine(s.content)}
                    meta={
                      [s.source ? t('From {source}', { source: s.source }) : day(s.created) ? t('Saved {date}', { date: day(s.created) }) : '', s.admitted ? '' : t('Not in runs until an admin saves it')]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                    mark={<Mark name={s.name} />}
                    onOpen={() => setEditing(s)}
                    action={
                      may ? (
                        <Switch checked={lit.has(tool(s.name))} disabled={busy === s.name} onCheckedChange={(v: boolean) => void flip(s.name, v)} aria-label={t('{name} on', { name: s.name })} />
                      ) : (
                        <SizableText size="$1" color="$soft">
                          {lit.has(tool(s.name)) ? t('On') : t('Off')}
                        </SizableText>
                      )
                    }
                  />
                ))}
              </Grid>
            </Part>
          ) : null}
          {addedShown.length ? (
            <Part title={t('Added from Hanzo')} detail={t('On for every run in your organization.')}>
              <Grid label={t('Added skills')}>
                {addedShown.map((x) => {
                  const name = nameOf(x.name)
                  return (
                    <Tile
                      key={x.name}
                      title={name}
                      detail={x.description}
                      mark={<Mark name={name} icon={<BookOpen size={15} />} />}
                      onOpen={() => setReading({ name, description: x.description, product: '' })}
                      action={
                        may ? (
                          <Button size="sm" variant="ghost" disabled={busy === name} onPress={() => void flip(name, false)} aria-label={t('Remove {name}', { name })}>
                            {t('Remove')}
                          </Button>
                        ) : undefined
                      }
                    />
                  )
                })}
              </Grid>
            </Part>
          ) : null}
        </>
      )}
      {reader}
      {editor}
    </YStack>
  )
}

const firstLine = (md: string): string =>
  md
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find(Boolean) ?? ''

/** One catalogue skill: what it is, its SKILL.md, and adding or removing it. */
function Reader({
  skill,
  added,
  signed,
  busy,
  onFlip,
  onClose,
}: {
  skill: Reading
  added: boolean
  signed: boolean
  busy: boolean
  onFlip: (next: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const target = useTarget()
  const doc = useLoad(() => document(target, skill.name), '', [target.api, skill.name])
  return (
    <Sheet title={skill.name} open onOpenChange={(o) => !o && onClose()} width={720}>
      {skill.description ? (
        <SizableText size="$2" color="$soft">
          {skill.description}
        </SizableText>
      ) : null}
      {signed ? (
        <XStack gap="$2" items="center">
          <Button size="sm" variant={added ? 'outline' : 'default'} disabled={busy} onPress={() => onFlip(!added)}>
            {added ? t('Remove') : t('Add to your skills')}
          </Button>
          <SizableText size="$1" color="$soft" flex={1}>
            {added ? t('On for your organization.') : t('Every run in your organization can use it once added.')}
          </SizableText>
        </XStack>
      ) : null}
      {doc.error ? (
        <Failed error={doc.error} onRetry={doc.reload} />
      ) : doc.loading && !doc.value ? (
        <Soft>{t('Loading SKILL.md…')}</Soft>
      ) : (
        <Code language="SKILL.md" value={doc.value}>
          <SizableText size="$1" color="$ink" style={{ ...mono, whiteSpace: 'pre-wrap' }}>
            {doc.value}
          </SizableText>
        </Code>
      )}
    </Sheet>
  )
}

/** Write a skill, or revise one of the org's own. Its name is its id, so a saved skill keeps its name. */
function Editor({
  skill,
  may,
  onClose,
  onSaved,
  onDeleted,
}: {
  skill: Skill | null
  /** Whether this person may write and delete the org's skills: an org admin. */
  may: boolean
  onClose: () => void
  onSaved: (s: Skill, fresh: boolean) => void
  onDeleted: (name: string) => void
}) {
  const { t } = useI18n()
  const target = useTarget()
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [content, setContent] = useState(skill?.content ?? '')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)

  const save = async () => {
    setWorking(true)
    setNote('')
    try {
      const saved = await write(target, { name: name.trim(), description: description.trim(), content })
      // A new skill is switched on as it is saved; a revised one keeps its switch.
      if (!skill) await toggle(target, [tool(saved.name)])
      onSaved(saved, !skill)
    } catch (e) {
      setNote(say(e, t))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Sheet title={skill ? skill.name : t('New skill')} open onOpenChange={(o) => !o && onClose()} width={680}>
      {skill?.source ? (
        <SizableText size="$2" color="$soft">
          {t('Read from {source}. The next push of that repository replaces what is saved here.', { source: skill.source })}
        </SizableText>
      ) : null}
      <Field label={t('Name')} hint={skill ? t('A skill keeps its name. Save under another name to make a new one.') : t('One lowercase word: letters, digits, _ or -.')}>
        <Input value={name} onChangeText={setName} aria-label={t('Name')} disabled={Boolean(skill)} autoCapitalize="none" />
      </Field>
      <Field label={t('Description')} hint={t('One line. An agent reads it to decide whether it needs the skill.')}>
        <Input value={description} onChangeText={setDescription} placeholder={t('How we triage an incoming issue')} aria-label={t('Description')} />
      </Field>
      <Field label="SKILL.md" hint={t('Markdown: what it is for, when to use it, and the steps.')}>
        <Textarea value={content} onChangeText={setContent} placeholder={t('# Triage\n\n1. Read the issue…')} aria-label="SKILL.md" rows={14} fontFamily="$mono" />
      </Field>
      <Line>{note || (may ? '' : t('Only an org admin can write or delete skills.'))}</Line>
      <XStack gap="$2" items="center">
        {skill && may ? (
          <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
            {t('Delete')}
          </Button>
        ) : null}
        <XStack flex={1} />
        <Button size="sm" variant="ghost" onPress={onClose}>
          {may ? t('Cancel') : t('Close')}
        </Button>
        {may ? (
          <Button size="sm" disabled={working} onPress={() => void save()}>
            {t('Save')}
          </Button>
        ) : null}
      </XStack>
      {skill ? (
        <Confirm
          what={skill.name}
          says={t('The skill leaves your organization and every agent that names it.')}
          open={asking}
          onOpenChange={setAsking}
          onYes={async () => {
            await remove(target, skill.id)
            onDeleted(skill.name)
          }}
        />
      ) : null}
    </Sheet>
  )
}
