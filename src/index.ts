/**
 * @hanzo/build — the builder as a component.
 *
 * Mount `<Builder host={…} />` under a gui root in a box with a height. The
 * host says where the platform is, who is signed in, and how to move; the
 * builder does everything else. hanzo.build hosts it whole. A host with a rail
 * of its own mounts it with `rail={false}` and draws the builder's parts in that
 * rail: its places (`nav`), its runs (`useSessions`, or `DevSection` for both),
 * and at the foot the Slack card and the account menu (`Slack`, `Who`), under
 * `HostProvider`. `Grip` (the kit's, passed on) sizes that rail.
 *
 * The side panel's column, for a host that draws it beside its own middle
 * column (Chat): `useSplit`, `SideProvider` and `PrefsProvider` above both, so
 * the width the person drags is kept in their preferences (side.tsx).
 *
 * The plan, once for every surface that shows one: `label` names it (`Max` with
 * `20x` beside it), `useStanding` reads where an account stands, `Meter` is the
 * block an account menu leads with, `Plan` the Usage view and `Credits` the
 * Billing one. Each reads as a `Target`, so a host without a builder mounts it.
 * The pure half — naming, shares, the banner's words — is also `@hanzo/build/plan`,
 * which loads in Node without the components.
 */
export { Builder } from './builder.tsx'
export { Library, Outputs, Preview, Thumb, want } from './library.tsx'
export { SOURCE, type Item, type Kind as ItemKind, type Source } from './api/library.ts'
export { Scheduled, schedule } from './scheduled.tsx'
export { Editor } from './automations.tsx'
export { library, nav, NEW, own, sections, tabs, useScheduled, type Group } from './nav.tsx'
export { DevSection, DOTS, useSessions } from './section.tsx'
export { HostProvider } from './host.tsx'
export { Slack, useWho, Who } from './foot.tsx'
export { Grip, type GripProps } from '@hanzo/ui'
export { Gutter, type GutterProps } from './gutter.tsx'
export { administers } from './claims.ts'
export { Meter, Title } from './meter.tsx'
export { Plan } from './settings/plan.tsx'
export { Credits, SEPARATE } from './settings/credits.tsx'
export { useStanding, rows, left, type Standing, type Row } from './standing.ts'
export { kind, label, said, share, spent, ways, when, type Label, type Share, type State } from './plan.ts'
export type { Limits } from './api/limits.ts'
export type { Target } from './api/call.ts'
export type { Browse, Browser, Host, Person, Shown } from './host.tsx'
export type { Session, Status } from './api/sessions.ts'
export type { Read } from './data.ts'
export { href, parse, path, PLACES, route, SESSION, SLUG, type Route, type Screen } from './route.ts'

/**
 * What Chat draws the same way (@hanzo/rooms imports these): the model and
 * effort (`useMind`, one choice kept for both, changed by `Tune`), the composer
 * (`prompt`), the row under an answer (`Reply`), and the side panel (`Panel`
 * over a `Deck` of tabs).
 */
export { catalog, EFFORTS, FIRST, FREE, grants, isFree, keep, kept, nameOf, reasons, useCatalog, useChoice, useMind, type Choice, type Effort, type Mind } from './mind.ts'
export { ASK, cut, GAP, MEASURE, measure, Prompt, prompt, ROUND, trigger, Tune, useEar, useMention, useUpload, type Chip, type PromptOptions } from './prompt.tsx'
export { Plus, type Link, type PlusProps, type Row as ShelfRow, type Shelf, type Switch } from './plus.tsx'
export { BARE, CHAT_MODES, DEV_MODES, gearOf, MODES, useGear, useLanguage, type Gear, type GearState, type Mode as GearMode } from './gear.ts'
export { useCarry, type Carry } from './carry.tsx'
export { Dictation } from './mic.tsx'
export { artifacts, blob, lead, renders, Reply, Served, speakable, speaker, type Artifact, type Listen } from './reply.tsx'
export { frames, Page, Panel, PanelToggle, type Kind, type PageProps, type PanelProps, type Suggestion } from './panel.tsx'
export { SideProvider, useSplit, type Split } from './side.tsx'
export { PrefsProvider } from './prefs.tsx'
export { kinds, Summary, useKinds, type Entry, type Section } from './summary.tsx'

/**
 * The composer's plugins, the same in Chat and Dev: `usePlugins` answers those
 * that run for this person, `shelf` is the `+` menu's Plugins shelf, and `prep`
 * asks the ones that are on what a message carries (Deep research is the
 * Research switch, `research`).
 */
export { active, BUILD, merge, prep, shelf, usePlugins, research, type Plugins } from './plugins/index.ts'
export type { Composer as PluginComposer, Plugin, Prep, Turn } from './plugin.ts'
export { address, destination, located, name, PAGE, SEARCH, useDeck, useKey, usePanel, useShown, type Deck, type Tab, type Tabs } from './tabs.ts'

/**
 * Up to three suggestions under the composer (above it on a phone), each from
 * the person's own activity: `useSuggestions` reads and makes them, `Suggestions`
 * draws them. The row is `Hint` here: `Suggestion` is the side panel's.
 */
export { Suggestions, useSuggestions, type Suggested, type SuggestionsProps } from './suggestions.tsx'
export type { Suggestion as Hint } from './suggest.ts'
