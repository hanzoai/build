/**
 * @hanzo/build — the builder as a component.
 *
 * Mount `<Builder host={…} />` under a gui root in a box with a height. The
 * host says where the platform is, who is signed in, and how to move; the
 * builder does everything else. hanzo.build and platform.hanzo.ai/dev are its
 * two hosts.
 */
export { Builder } from './builder.tsx'
export type { Host, Person } from './host.tsx'
export { path, route, SESSION, SLUG, type Route, type Screen } from './route.ts'
