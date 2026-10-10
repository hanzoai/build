/**
 * @hanzo/build — the builder as a component.
 *
 * Mount `<Builder host={…} />` under a gui root in a box with a height. The
 * host says where the platform is, who is signed in, and how to move; the
 * builder does everything else. hanzo.build hosts it whole. A host with a rail
 * of its own mounts it with `rail={false}` and draws the builder's parts in that
 * rail: its places (`nav`), its runs (`useSessions`, or `DevSection` for both),
 * and at the foot the Slack card and the account menu (`Slack`, `Who`), under
 * `HostProvider`. `Grip` sizes that rail: the edge the builder sizes its own
 * chat with.
 *
 * The plan, once for every surface that shows one: `label` names it (`Max` with
 * `20x` beside it), `useStanding` reads where an account stands, `Meter` is the
 * block an account menu leads with, `Plan` the Usage view and `Credits` the
 * Billing one. Each reads as a `Target`, so a host without a builder mounts it.
 * The pure half — naming, shares, the banner's words — is also `@hanzo/build/plan`,
 * which loads in Node without the components.
 */
export { Builder } from './builder.tsx'
export { nav, NEW, type Group } from './nav.tsx'
export { DevSection, DOTS, useSessions } from './section.tsx'
export { HostProvider } from './host.tsx'
export { Slack, useWho, Who } from './foot.tsx'
export { Grip, type GripProps } from './grip.tsx'
export { administers } from './claims.ts'
export { Meter, Title } from './meter.tsx'
export { Plan } from './settings/plan.tsx'
export { Credits, SEPARATE } from './settings/credits.tsx'
export { useStanding, rows, left, type Standing, type Row } from './standing.ts'
export { kind, label, said, share, spent, ways, when, type Label, type Share, type State } from './plan.ts'
export type { Limits } from './api/limits.ts'
export type { Target } from './api/call.ts'
export type { Host, Person } from './host.tsx'
export type { Session, Status } from './api/sessions.ts'
export type { Read } from './data.ts'
export { href, parse, path, PLACES, route, SESSION, SLUG, type Route, type Screen } from './route.ts'

/**
 * What Chat draws the same way (@hanzo/rooms imports these): the model and
 * effort (`useMind`, one choice kept for both, changed by `Tune`), the composer
 * (`prompt`), the row under an answer (`Reply`), and the side panel (`Panel`
 * over a `Deck` of tabs).
 */
export { catalog, EFFORTS, FIRST, keep, kept, nameOf, reasons, useCatalog, useChoice, useMind, type Choice, type Effort, type Mind } from './mind.ts'
export { cut, GAP, MEASURE, measure, Prompt, prompt, ROUND, Tune, useEar, type PromptOptions } from './prompt.tsx'
export { artifacts, blob, lead, renders, Reply, Served, speakable, speaker, type Artifact, type Listen } from './reply.tsx'
export { Page, Panel, PanelToggle, type Kind, type PanelProps } from './panel.tsx'
export { address, name, PAGE, useDeck, useKey, usePanel, useShown, type Deck, type Tab, type Tabs } from './tabs.ts'
