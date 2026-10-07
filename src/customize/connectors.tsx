/**
 * Connectors: MCP servers whose tools an agent calls.
 *
 * Browse is the shelf (our copy of the public MCP registry), then the fleet's
 * own servers, which every run can call and nothing adds; that list is read
 * only when asked for, since listing it asks every subsystem at once. A listing
 * is added here only when it serves streamable HTTP; one that ships only a
 * package needs somewhere to run it first, so it has no Add. Yours is the
 * servers the org added — by URL, or off the shelf — each with one switch for
 * all its tools on its card and one per tool inside; a tool is called only
 * while it is on. Adding a server switches its tools on. A server's secret is
 * sealed in KMS and never shown again.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronDown, ExternalLink, KeyRound, Server as ServerIcon } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch } from '@hanzo/ui'
import { useEffect, useMemo, useState } from 'react'

import { add, one, owns, ready, remove, servers, shelf, titleOf, type Adding, type Listing, type Page, type Server } from '../api/connectors.ts'
import { natives, type Native } from '../api/mcp.ts'
import { toggle, tools, type Tool } from '../api/tools.ts'
import { useHost, useTarget } from '../host.tsx'
import { Out } from '../out.tsx'
import { route } from '../route.ts'
import { useLoad } from './load.ts'
import { say } from './say.ts'
import { Add, Confirm, Empty, Failed, Featured, Field, Grid, left, Line, Mark, matches, mono, Part, Sheet, Soft, Tile, useCount, Visitor, type Pane } from './ui.tsx'

const PAGE = 48

/** The part of a URL a person reads: its host and path. */
const where = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

export function Connectors({ view, q, adding, onAdding, onView, onCount }: Pane) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  // What every run in the org connects to is an org admin's to change; a member reads it.
  const may = signed && host.admin
  const mine = useLoad(signed ? () => servers(t) : null, [] as Server[], [t, signed])
  // Every server's tools, for the switch on each card; read once for all of them.
  const plane = useLoad(signed && view === 'yours' && mine.value.length ? () => tools(t, { source: 'mcp' }) : null, [] as Tool[], [t, signed, view, mine.value])
  const [opened, setOpened] = useState<Server | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [connecting, setConnecting] = useState<Listing | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  useCount(mine.value.length, onCount)

  /** Switch every tool a server brings on or off at once, then read them again. */
  const flip = async (s: Server, next: boolean) => {
    const its = plane.value.filter((x) => owns(s, x.name)).map((x) => x.name)
    if (!its.length) return
    setBusy(s.id)
    setNote('')
    try {
      await toggle(t, next ? its : [], next ? [] : its)
      plane.reload()
      setNote(next ? `${s.name} is on` : `${s.name} is off`)
    } catch (e) {
      setNote(say(e))
    } finally {
      setBusy('')
    }
  }

  const connect =
    adding || connecting ? (
      <Connect
        listing={connecting}
        onClose={() => {
          setConnecting(null)
          onAdding(false)
        }}
        onAdded={(said) => {
          setConnecting(null)
          onAdding(false)
          mine.reload()
          onView('yours')
          setNote(said)
        }}
      />
    ) : null
  const detail = listing ? (
    <About
      listing={listing}
      added={mine.value.some((s) => s.listing === listing.id)}
      signed={may}
      onAdd={() => {
        setConnecting(listing)
        setListing(null)
      }}
      onClose={() => setListing(null)}
    />
  ) : null

  if (view === 'discover') {
    return (
      <YStack gap="$6">
        <Line>{note}</Line>
        <Shelf
          q={q}
          signed={signed}
          may={may}
          added={new Set(mine.value.map((s) => s.listing).filter(Boolean))}
          onOpen={setListing}
          onAdd={setConnecting}
        />
        <Natives q={q} />
        {detail}
        {connect}
      </YStack>
    )
  }

  if (!signed) {
    return <Visitor>Sign in to see your connectors.</Visitor>
  }
  const shown = mine.value.filter((s) => matches(q, s.name, s.url, s.listing))
  return (
    <YStack gap="$3">
      <Line>{note}</Line>
      {mine.error && !mine.value.length ? (
        <Failed error={mine.error} onRetry={mine.reload} />
      ) : mine.loading && !mine.value.length ? (
        <Soft>Loading your connectors…</Soft>
      ) : !mine.value.length ? (
        <Empty title="No connectors yet" detail={may ? 'Connect an app from Browse, or add any MCP server by its URL.' : 'An org admin adds connectors. Browse what there is.'}>
          <Button size="sm" variant="outline" onPress={() => onView('discover')}>
            Browse connectors
          </Button>
          {may ? (
            <Button size="sm" onPress={() => onAdding(true)}>
              Add by URL
            </Button>
          ) : null}
        </Empty>
      ) : !shown.length ? (
        <Soft>{`No connector of yours matches “${q.trim()}”.`}</Soft>
      ) : (
        <Grid label="Your connectors">
          {shown.map((s) => {
            const its = plane.value.filter((x) => owns(s, x.name))
            const lit = its.filter((x) => x.activated).length
            return (
              <Tile
                key={s.id}
                title={s.name}
                detail={where(s.url)}
                meta={[
                  its.length ? `${lit} of ${its.length} tools on` : plane.loading ? '' : 'No tools listed yet',
                  s.listing ? 'From Browse' : 'Added by URL',
                  s.secret ? 'Secret in KMS' : '',
                  s.admitted ? '' : 'Not in runs until an admin adds it again',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                mark={<Mark name={s.name} />}
                onOpen={() => setOpened(s)}
                action={
                  may && its.length ? (
                    <Switch checked={lit > 0} disabled={busy === s.id} onCheckedChange={(v: boolean) => void flip(s, v)} aria-label={`${s.name} on`} />
                  ) : its.length ? (
                    <SizableText size="$1" color="$soft">
                      {lit ? 'On' : 'Off'}
                    </SizableText>
                  ) : undefined
                }
              />
            )
          })}
        </Grid>
      )}
      {plane.error && mine.value.length ? <Line>{`Tools: ${say(plane.error)}`}</Line> : null}
      {opened ? (
        <Detail
          server={opened}
          may={may}
          onClose={() => {
            setOpened(null)
            plane.reload()
          }}
          onDeleted={() => {
            setNote(`${opened.name} is removed`)
            setOpened(null)
            mine.reload()
          }}
        />
      ) : null}
      {connect}
    </YStack>
  )
}

/** The shelf: featured first, then by name, a page at a time. The platform searches it. */
function Shelf({ q, signed, may, added, onOpen, onAdd }: { q: string; signed: boolean; may: boolean; added: Set<string>; onOpen: (l: Listing) => void; onAdd: (l: Listing) => void }) {
  const t = useTarget()
  const text = useSettled(q.trim(), 300)
  const first = useLoad(signed ? () => shelf(t, { text, limit: PAGE }) : null, null as Page | null, [t, signed, text])
  const [more, setMore] = useState<Listing[]>([])
  const [paging, setPaging] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => setMore([]), [first.value])

  if (!signed) {
    return (
      <Part title="Connect an app" detail="Give runs the tools you already use.">
        <Visitor>Sign in to browse connectors.</Visitor>
      </Part>
    )
  }
  const page = first.value
  const list = [...(page?.listings ?? []), ...more]
  const hero = !text ? list.find((l) => l.featured) : undefined
  const rest = hero ? list.filter((l) => l !== hero) : list
  // A listing that ships only as a package has no Add: its card says it needs a place to run.
  const action = (l: Listing) => (may && ready(l) ? <Add name={titleOf(l)} added={added.has(l.id)} onPress={() => onAdd(l)} /> : undefined)

  const next = async () => {
    setPaging(true)
    setNote('')
    try {
      const got = await shelf(t, { text, limit: PAGE, offset: list.length })
      setMore((m) => [...m, ...got.listings])
    } catch (e) {
      setNote(say(e))
    } finally {
      setPaging(false)
    }
  }

  return (
    <Part title="Connect an app" detail="Give runs the tools you already use. Adding one turns its tools on for your organization.">
      {first.error && !page ? (
        <Failed error={first.error} onRetry={first.reload} />
      ) : !page ? (
        <Soft>Loading connectors…</Soft>
      ) : !list.length ? (
        <Soft>{text ? `No connector matches “${text}”.` : 'There are no connectors to add yet.'}</Soft>
      ) : (
        <YStack gap="$3">
          {hero ? (
            <Featured
              title={titleOf(hero)}
              detail={hero.description}
              meta={facts(hero)}
              mark={<Mark name={titleOf(hero)} logo={hero.logo} size={48} />}
              onOpen={() => onOpen(hero)}
              action={action(hero)}
            />
          ) : null}
          <SizableText size="$1" color="$soft">
            {list.length < page.total ? `${list.length} of ${page.total} connectors` : `${page.total} connectors`}
          </SizableText>
          <Grid label="Servers on the shelf">
            {rest.map((l) => (
              <Tile key={l.id} title={titleOf(l)} detail={l.description} meta={facts(l)} mark={<Mark name={titleOf(l)} logo={l.logo} />} onOpen={() => onOpen(l)} action={action(l)} />
            ))}
          </Grid>
          <Line>{note}</Line>
          {list.length < page.total ? (
            <XStack justify="center">
              <Button size="sm" variant="outline" disabled={paging} onPress={() => void next()}>
                Show more
              </Button>
            </XStack>
          ) : null}
        </YStack>
      )}
    </Part>
  )
}

/** The facts a card carries under its description. */
const facts = (l: Listing): string => [l.vendor, l.official ? 'Official' : '', ready(l) ? 'Hosted' : 'Package only: needs a place to run'].filter(Boolean).join(' · ')

/** `value` once it has held still for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}

/**
 * The fleet's own servers, from the MCP server's tools/list. Every run can call
 * them. Listed when asked for — that list starts every subsystem it names — and
 * at once on the old MCP address, which exists to show them.
 */
function Natives({ q }: { q: string }) {
  const host = useHost()
  const t = useTarget()
  const r = route(host.path)
  const [asked, setAsked] = useState(r.kind === 'screen' && r.screen === 'mcp')
  const list = useLoad(asked ? () => natives(t) : null, [] as Native[], [t, asked])
  const [open, setOpen] = useState<string | null>(null)
  const shown = list.value.filter((s) => matches(q, s.name, s.description, ...s.ops))
  const ops = shown.reduce((n, s) => n + s.ops.length, 0)
  return (
    <Part
      title="Built in"
      detail="Hanzo’s own servers. Always on: every run can call them, and nothing needs adding."
      action={
        asked ? undefined : (
          <Button size="sm" variant="outline" onPress={() => setAsked(true)}>
            Show built-in servers
          </Button>
        )
      }
    >
      {!asked ? null : list.loading && !list.value.length ? (
        <Soft>Loading built-in servers…</Soft>
      ) : list.error && !list.value.length ? (
        <Failed error={list.error} onRetry={list.reload} />
      ) : !shown.length ? (
        <Soft>{list.value.length ? `No built-in server matches “${q.trim()}”.` : 'No built-in servers are listed.'}</Soft>
      ) : (
        <YStack gap="$1">
          <SizableText size="$1" color="$soft">
            {shown.length} servers · {ops} operations
          </SizableText>
          {shown.map((s) => {
            const on = open === s.name
            return (
              <YStack key={s.name} borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
                <XStack render="button" aria-expanded={on} aria-label={s.name} items="center" gap="$3" px="$3" py="$2.5" hoverStyle={{ bg: '$hover' }} style={left} onPress={() => setOpen(on ? null : s.name)}>
                  <YStack flex={1} minW={0} gap="$1">
                    <SizableText size="$3" color="$ink">
                      {s.name}
                    </SizableText>
                    {s.description ? (
                      <SizableText size="$1" color="$soft" numberOfLines={on ? undefined : 2}>
                        {s.description}
                      </SizableText>
                    ) : null}
                  </YStack>
                  <SizableText size="$1" color="$soft">
                    {s.ops.length}
                  </SizableText>
                  <ChevronDown size={14} style={{ transform: on ? 'rotate(180deg)' : undefined }} />
                </XStack>
                {on ? (
                  <YStack px="$3" py="$2" gap="$1" borderTopWidth={1} borderColor="$borderColor">
                    {s.ops.length ? (
                      s.ops.map((op) => (
                        <SizableText key={op} size="$1" color="$ink" style={mono}>
                          {op}
                        </SizableText>
                      ))
                    ) : (
                      <SizableText size="$1" color="$soft">
                        This server lists no operations.
                      </SizableText>
                    )}
                  </YStack>
                ) : null}
              </YStack>
            )
          })}
        </YStack>
      )}
    </Part>
  )
}

/** One listing in full: what it is, where it is served, and adding it. */
function About({ listing, added, signed, onAdd, onClose }: { listing: Listing; added: boolean; signed: boolean; onAdd: () => void; onClose: () => void }) {
  const t = useTarget()
  const full = useLoad(() => one(t, listing.id), listing, [t, listing.id])
  const l = full.value
  const links = [l.site, l.repo].filter((u) => u.startsWith('https://'))
  return (
    <Sheet title={titleOf(l)} open onOpenChange={(o) => !o && onClose()}>
      <XStack gap="$3" items="center">
        <Mark name={titleOf(l)} logo={l.logo} size={40} />
        <YStack flex={1} minW={0}>
          <SizableText size="$2" color="$ink" numberOfLines={1} style={mono}>
            {l.name}
          </SizableText>
          <SizableText size="$1" color="$soft" numberOfLines={1}>
            {[l.vendor, l.version ? `v${l.version}` : '', l.official ? 'Official' : ''].filter(Boolean).join(' · ')}
          </SizableText>
        </YStack>
      </XStack>
      {l.description ? (
        <SizableText size="$2" color="$soft">
          {l.description}
        </SizableText>
      ) : null}
      {l.remotes.length ? (
        <Field label="Served at">
          {l.remotes.map((r) => (
            <SizableText key={r.url} size="$1" color="$ink" style={mono} numberOfLines={1}>
              {r.url} · {r.transport}
            </SizableText>
          ))}
        </Field>
      ) : null}
      {l.packages.length ? (
        <Field label="Packages" hint={ready(l) ? undefined : 'It ships only as a package, so it needs a place to run before it can be added here.'}>
          {l.packages.map((p) => (
            <SizableText key={`${p.registry}:${p.identifier}`} size="$1" color="$ink" style={mono} numberOfLines={1}>
              {[p.registry, p.identifier, p.version, p.runtime].filter(Boolean).join(' · ')}
            </SizableText>
          ))}
        </Field>
      ) : null}
      {links.length ? (
        <XStack gap="$4" flexWrap="wrap">
          {links.map((u) => (
            <Out key={u} href={u}>
              <SizableText size="$2" color="$soft">
                {where(u)}
              </SizableText>
              <ExternalLink size={12} opacity={0.6} />
            </Out>
          ))}
        </XStack>
      ) : null}
      {full.error ? <Line>{`Showing what Browse listed. ${say(full.error)}`}</Line> : null}
      {signed && ready(l) ? (
        <XStack justify="flex-end">
          <Button size="sm" disabled={added} onPress={onAdd}>
            {added ? 'Added' : 'Add to your connectors'}
          </Button>
        </XStack>
      ) : null}
    </Sheet>
  )
}

/**
 * Add a server: a listing off the shelf, or any MCP URL. The secret, when it
 * needs one, is sealed in KMS as it is added; then its tools are switched on.
 */
function Connect({ listing, onClose, onAdded }: { listing: Listing | null; onClose: () => void; onAdded: (said: string) => void }) {
  const t = useTarget()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [header, setHeader] = useState('Authorization')
  const [secret, setSecret] = useState('')
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState('')

  const save = async () => {
    setWorking(true)
    setNote('')
    const a: Adding = listing ? { listing: listing.id, name, header, secret } : { name, url, header, secret }
    try {
      const s = await add(t, a)
      let said = `${s.name} is added.`
      try {
        const its = (await tools(t, { source: 'mcp' })).filter((x) => owns(s, x.name)).map((x) => x.name)
        if (its.length) await toggle(t, its)
        said = its.length ? `${s.name} is added, and its ${its.length} tools are on.` : `${s.name} is added. It listed no tools yet.`
      } catch (e) {
        said = `${s.name} is added, but its tools could not be switched on. ${say(e)}`
      }
      onAdded(said)
    } catch (e) {
      setNote(say(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Sheet title={listing ? `Add ${titleOf(listing)}` : 'Add by URL'} open onOpenChange={(o) => !o && onClose()} width={500}>
      {listing ? (
        <SizableText size="$2" color="$soft">
          {listing.description || listing.name}
        </SizableText>
      ) : (
        <SizableText size="$2" color="$soft">
          Any MCP server that speaks HTTP. Its tools are on once it is added.
        </SizableText>
      )}
      <Field label="Name" hint={listing ? 'Leave it empty to use the listing’s own.' : undefined}>
        <Input value={name} onChangeText={setName} placeholder={listing ? titleOf(listing) : 'Docs'} aria-label="Name" />
      </Field>
      {listing ? null : (
        <Field label="URL" hint="A public http(s) address. Private and loopback addresses are refused.">
          <Input value={url} onChangeText={setUrl} placeholder="https://mcp.example.com/mcp" aria-label="URL" autoCapitalize="none" />
        </Field>
      )}
      <Field label="Secret" hint="Optional. Kept sealed in KMS, sent on every call, and never shown again.">
        <Input value={secret} onChangeText={setSecret} placeholder="Bearer …" aria-label="Secret" secureTextEntry />
      </Field>
      {secret ? (
        <Field label="Header">
          <Input value={header} onChangeText={setHeader} aria-label="Header" autoCapitalize="none" />
        </Field>
      ) : null}
      <Line>{note}</Line>
      <XStack gap="$2" justify="flex-end">
        <Button size="sm" variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={working} onPress={() => void save()}>
          Add
        </Button>
      </XStack>
    </Sheet>
  )
}

/** One of the org's servers: where it is, its secret, its tools and their switches, and removing it. */
function Detail({ server, may, onClose, onDeleted }: { server: Server; may: boolean; onClose: () => void; onDeleted: () => void }) {
  const t = useTarget()
  const list = useLoad(() => tools(t, { source: 'mcp' }), [] as Tool[], [t, server.id])
  const its = useMemo(() => list.value.filter((x) => owns(server, x.name)), [list.value, server])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const off = its.filter((x) => !x.activated).map((x) => x.name)

  const flip = async (on: string[], offNames: string[]) => {
    setBusy(true)
    setNote('')
    try {
      await toggle(t, on, offNames)
      list.reload()
    } catch (e) {
      setNote(say(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={server.name} open onOpenChange={(o) => !o && onClose()}>
      <YStack gap="$1">
        <SizableText size="$1" color="$ink" style={mono} numberOfLines={2}>
          {server.url}
        </SizableText>
        <XStack items="center" gap="$1.5">
          {server.secret ? <KeyRound size={12} opacity={0.7} /> : <ServerIcon size={12} opacity={0.7} />}
          <SizableText size="$1" color="$soft">
            {server.secret ? `A secret is sealed in KMS and sent in ${server.header || 'its header'}.` : 'No secret: it is called as it is.'}
          </SizableText>
        </XStack>
      </YStack>
      <XStack items="center" gap="$2">
        <SizableText size="$3" color="$ink" flex={1}>
          Tools
        </SizableText>
        {its.length && may ? (
          <Button size="sm" variant="outline" disabled={busy} onPress={() => void (off.length ? flip(off, []) : flip([], its.map((x) => x.name)))}>
            {off.length ? 'Turn all on' : 'Turn all off'}
          </Button>
        ) : null}
      </XStack>
      {list.loading && !list.value.length ? (
        <Soft>Loading its tools…</Soft>
      ) : list.error && !list.value.length ? (
        <Failed error={list.error} onRetry={list.reload} />
      ) : !its.length ? (
        <Soft>No tools listed yet. A server that does not answer shows its tools once it does.</Soft>
      ) : (
        <YStack borderWidth={1} borderColor="$borderColor" rounded="$3" overflow="hidden">
          {its.map((x, i) => {
            const short = x.name.slice(server.id.length + 1)
            return (
              <XStack key={x.name} items="center" gap="$3" px="$3" py="$2" borderTopWidth={i ? 1 : 0} borderColor="$borderColor">
                <YStack flex={1} minW={0} gap="$0.5">
                  <SizableText size="$2" color="$ink" style={mono} numberOfLines={1}>
                    {short}
                  </SizableText>
                  {x.description ? (
                    <SizableText size="$1" color="$soft" numberOfLines={2}>
                      {x.description}
                    </SizableText>
                  ) : null}
                </YStack>
                {may ? (
                  <Switch checked={x.activated} disabled={busy} onCheckedChange={(v: boolean) => void flip(v ? [x.name] : [], v ? [] : [x.name])} aria-label={`${short} on`} />
                ) : (
                  <SizableText size="$1" color="$soft">
                    {x.activated ? 'On' : 'Off'}
                  </SizableText>
                )}
              </XStack>
            )
          })}
        </YStack>
      )}
      <Line>{note || (may ? '' : 'Only an org admin can switch or remove connectors.')}</Line>
      {may ? (
        <XStack justify="flex-start">
          <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
            Remove connector
          </Button>
        </XStack>
      ) : null}
      <Confirm
        what={server.name}
        says="Its tools leave your organization and every agent, and its sealed secret is destroyed."
        open={asking}
        onOpenChange={setAsking}
        onYes={async () => {
          await remove(t, server.id)
          onDeleted()
        }}
      />
    </Sheet>
  )
}
