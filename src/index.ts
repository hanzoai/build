/**
 * @hanzo/build — the builder as a component.
 *
 * Mount `<Builder host={…} />` under a gui root in a box with a height. The
 * host says where the platform is, who is signed in, and how to move; the
 * builder does everything else. hanzo.build hosts it whole; hanzo.ai and the
 * Hanzo App mount it at /dev with `rail={false}` and list its places and runs in
 * their own rail with `DevSection`.
 */
export { Builder } from './builder.tsx'
export { DevSection, DOTS, useSessions } from './section.tsx'
export { administers } from './claims.ts'
export type { Host, Person } from './host.tsx'
export type { Session, Status } from './api/sessions.ts'
export type { Read } from './data.ts'
export { path, route, SESSION, SLUG, type Route, type Screen } from './route.ts'
