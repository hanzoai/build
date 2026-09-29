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
 */
export { Builder, nav } from './builder.tsx'
export { DevSection, DOTS, useSessions } from './section.tsx'
export { HostProvider } from './host.tsx'
export { Slack, useWho, Who } from './foot.tsx'
export { Grip, type GripProps } from './grip.tsx'
export { administers } from './claims.ts'
export type { Host, Person } from './host.tsx'
export type { Session, Status } from './api/sessions.ts'
export type { Read } from './data.ts'
export { path, route, SESSION, SLUG, type Route, type Screen } from './route.ts'
