/**
 * Connectors: MCP servers whose tools an agent calls.
 *
 * Yours is the servers the org added — by URL, or off the shelf — each with the
 * tools it brings and a switch for each; a tool is called only while it is on.
 * Adding a server switches its tools on. Discover is the shelf (our copy of the
 * public MCP registry) and the fleet's own servers, which every run can call and
 * nothing adds. A listing is added here only when it serves streamable HTTP; one
 * that ships only a package needs somewhere to run it first, so it has no plus.
 * A server's secret is sealed in KMS and never shown again.
 */
import { SizableText, XStack, YStack } from '@hanzo/gui'
import { ChevronDown, ExternalLink, KeyRound, Server as ServerIcon } from '@hanzogui/lucide-icons-2'
import { Button, Input, Switch } from '@hanzo/ui'
import { useEffect, useMemo, useState } from 'react'

import { add, one, owns, ready, remove, servers, shelf, titleOf, type Adding, type Listing, type Page, type Server } from '../api/connectors.ts'
import { natives, type Native } from '../api/mcp.ts'
import { toggle, tools, type Tool } from '../api/tools.ts'
import { useRead } from '../data.ts'
import { useHost, useTarget } from '../host.tsx'
import { Out } from '../out.tsx'
import { Add, Confirm, day, Featured, Field, Grid, left, Line, Mark, matches, mono, Part, Sheet, Soft, Tile, type Pane } from './ui.tsx'

const PAGE = 48

/** The part of a URL a person reads: its host and path. */
const where = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

export function Connectors({ view, q, adding, onAdding, onView }: Pane) {
  const host = useHost()
  const t = useTarget()
  const signed = Boolean(host.person)
  const mine = useRead(signed ? () => servers(t) : null, [] as Server[], [t, signed])
  const [opened, setOpened] = useState<Server | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [connecting, setConnecting] = useState<Listing | null>(null)
  const [note, setNote] = useState('')

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
      signed={signed}
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
    return <Soft action={host.signIn ? <Button size="sm" onPress={() => host.signIn?.()}>Sign in</Button> : undefined}>Sign in to see your connectors.</Soft>
  }
  const shown = mine.value.filter((s) => matches(q, s.name, s.url, s.listing))
  return (
    <YStack gap="$3">
      <Line>{note}</Line>
      {mine.error && !mine.value.length ? (
        <Soft>{mine.error.message}</Soft>
      ) : mine.loading && !mine.value.length ? (
        <Soft>Reading your connectors…</Soft>
      ) : !mine.value.length ? (
        <Soft action={<Button size="sm" variant="outline" onPress={() => onView('discover')}>Discover connectors</Button>}>
          No connectors yet. Add an MCP server by its URL, or pick one off the shelf.
        </Soft>
      ) : !shown.length ? (
        <Soft>No connector matches.</Soft>
      ) : (
        <Grid label="Your connectors">
          {shown.map((s) => (
            <Tile
              key={s.id}
              title={s.name}
              detail={where(s.url)}
              meta={[s.listing ? 'From the shelf' : 'Added by URL', s.secret ? 'secret sealed in KMS' : '', day(s.created)].filter(Boolean).join(' · ')}
              mark={<Mark name={s.name} />}
              onOpen={() => setOpened(s)}
            />
          ))}
        </Grid>
      )}
      {opened ? (
        <Detail
          server={opened}
          onClose={() => setOpened(null)}
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
function Shelf({ q, signed, added, onOpen, onAdd }: { q: string; signed: boolean; added: Set<string>; onOpen: (l: Listing) => void; onAdd: (l: Listing) => void }) {
  const t = useTarget()
  const host = useHost()
  const text = useSettled(q.trim(), 300)
  const first = useRead(signed ? () => shelf(t, { text, limit: PAGE }) : null, null as Page | null, [t, signed, text])
  const [more, setMore] = useState<Listing[]>([])
  const [paging, setPaging] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => setMore([]), [first.value])

  if (!signed) {
    return (
      <Part title="The shelf" detail="MCP servers the public registries publish.">
        <Soft action={host.signIn ? <Button size="sm" onPress={() => host.signIn?.()}>Sign in</Button> : undefined}>Sign in to browse the shelf.</Soft>
      </Part>
    )
  }
  const page = first.value
  const list = [...(page?.listings ?? []), ...more]
  const hero = !text ? list.find((l) => l.featured) : undefined
  const rest = hero ? list.filter((l) => l !== hero) : list
  const action = (l: Listing) =>
    ready(l) ? (
      <Add name={titleOf(l)} added={added.has(l.id)} onPress={() => onAdd(l)} />
    ) : (
      <SizableText size="$1" color="$soft" shrink={0} pt="$1.5">
        Package
      </SizableText>
    )

  const next = async () => {
    setPaging(true)
    setNote('')
    try {
      const got = await shelf(t, { text, limit: PAGE, offset: list.length })
      setMore((m) => [...m, ...got.listings])
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The next page did not load')
    } finally {
      setPaging(false)
    }
  }

  return (
    <Part title="The shelf" detail="MCP servers the public registries publish. A plus adds one to your organization.">
      {first.error && !page ? (
        <Soft>{first.error.message}</Soft>
      ) : !page ? (
        <Soft>Reading the shelf…</Soft>
      ) : !list.length ? (
        <Soft>{text ? 'Nothing on the shelf matches.' : 'The shelf is empty.'}</Soft>
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
            {list.length < page.total ? `${list.length} of ${page.total} servers` : `${page.total} servers`}
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
const facts = (l: Listing): string => [l.vendor, l.official ? 'Official' : '', ready(l) ? 'Hosted' : 'Package only'].filter(Boolean).join(' · ')

/** `value` once it has held still for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}

/** The fleet's own servers, from the MCP server's tools/list. Every run can call them. */
function Natives({ q }: { q: string }) {
  const t = useTarget()
  const list = useRead(() => natives(t), [] as Native[], [t])
  const [open, setOpen] = useState<string | null>(null)
  const shown = list.value.filter((s) => matches(q, s.name, s.description, ...s.ops))
  const ops = shown.reduce((n, s) => n + s.ops.length, 0)
  return (
    <Part title="Built in" detail="The fleet’s own servers. A run starts one when it calls it, and nothing needs adding.">
      {list.loading && !list.value.length ? (
        <Soft>Reading the servers…</Soft>
      ) : list.error && !list.value.length ? (
        <Soft>{list.error.message}</Soft>
      ) : !shown.length ? (
        <Soft>{list.value.length ? 'No built-in server matches.' : 'The MCP server listed no native servers.'}</Soft>
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
                        This server named no operations.
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
  const full = useRead(() => one(t, listing.id), listing, [t, listing.id])
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
        <Field label="Packages" hint={ready(l) ? undefined : 'It ships only as a package, so it needs somewhere to run before it can be added here.'}>
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
      {full.error ? <Line>{full.error.message}</Line> : null}
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
        said = `${s.name} is added, but its tools could not be switched on: ${e instanceof Error ? e.message : 'no answer'}`
      }
      onAdded(said)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The connector was not added')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Sheet title={listing ? `Add ${titleOf(listing)}` : 'Add connector'} open onOpenChange={(o) => !o && onClose()} width={500}>
      {listing ? (
        <SizableText size="$2" color="$soft">
          {listing.description || listing.name}
        </SizableText>
      ) : (
        <SizableText size="$2" color="$soft">
          Any MCP server that speaks HTTP. Its tools join your organization’s and are on once it is added.
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
      <Field label="Secret" hint="Optional. Sealed in KMS and sent in the header below on every call; never shown again.">
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
function Detail({ server, onClose, onDeleted }: { server: Server; onClose: () => void; onDeleted: () => void }) {
  const t = useTarget()
  const list = useRead(() => tools(t, { source: 'mcp' }), [] as Tool[], [t, server.id])
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
      setNote(e instanceof Error ? e.message : 'That did not work')
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
        {its.length ? (
          <Button size="sm" variant="outline" disabled={busy} onPress={() => void (off.length ? flip(off, []) : flip([], its.map((x) => x.name)))}>
            {off.length ? 'Turn all on' : 'Turn all off'}
          </Button>
        ) : null}
      </XStack>
      {list.loading && !list.value.length ? (
        <Soft>Asking the server for its tools…</Soft>
      ) : list.error && !list.value.length ? (
        <Soft>{list.error.message}</Soft>
      ) : !its.length ? (
        <Soft>The server listed no tools. One that does not answer is left out until it does.</Soft>
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
                <Switch checked={x.activated} disabled={busy} onCheckedChange={(v: boolean) => void flip(v ? [x.name] : [], v ? [] : [x.name])} aria-label={`${short} on`} />
              </XStack>
            )
          })}
        </YStack>
      )}
      <Line>{note}</Line>
      <XStack justify="flex-start">
        <Button size="sm" variant="ghost" onPress={() => setAsking(true)}>
          Remove connector
        </Button>
      </XStack>
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
