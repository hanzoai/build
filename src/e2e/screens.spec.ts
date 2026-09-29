/**
 * Every screen and state of the builder at four sizes — a phone, a tablet, a
 * laptop and a desktop — signed in as an org admin against the stubs the other
 * specs drive (stubs.ts). There is no signed-out page to draw: a visitor is
 * sent to sign in (app/root.tsx).
 *
 * Each one draws its heading, fits its window (fixture.ts `cramped`: nothing
 * cut off or sideways, no control on another), throws nothing, and is saved at
 * screens/<size>/<name>.png with the whole of its content, however far it
 * scrolls. Below md a run's side pane is not drawn (desk.tsx), so on a phone a
 * run is checked whole without it.
 */
import type { Page } from '@playwright/test'

import { SECTIONS, TABS, type Screen, type Section } from '../route.ts'
import { cramped, expect, test } from './fixture.ts'
import { SESSION } from './signed.ts'
import * as stub from './stubs.ts'

const SIZES = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
}
type Size = keyof typeof SIZES

interface State {
  /** The file name under screens/<size>/. */
  name: string
  path: string
  /** The platform the page talks to, signed in. */
  platform: (page: Page) => Promise<unknown>
  /** What the screen's heading says. */
  says: RegExp
  /** What brings the screen to this state, on this size. */
  act?: (page: Page, size: Size) => Promise<void>
  /** A dialog, menu or drawer over the page: saved as the window shows it. */
  over?: boolean
  /** Needs the run's side pane, which is drawn from md up. */
  wide?: boolean
  /** Only a phone has it: below md the chat and a project's work take turns. */
  narrow?: boolean
}

const RUN = `/${SESSION}`
const desk = (p: Page) => p.getByRole('complementary', { name: 'Run details' })
const press = (label: string) => (p: Page) => desk(p).getByRole('button', { name: label, exact: true }).first().click()
const both = (...steps: ((p: Page) => Promise<void>)[]) => async (p: Page) => {
  for (const s of steps) await s(p)
}
/** On a phone the rail is a drawer: open it first to reach what it holds. */
const inRail = (label: string) => async (p: Page, size: Size) => {
  if (size !== 'phone') return p.getByRole('button', { name: label }).first().click()
  await p.getByLabel('Open runs').click()
  await p.getByRole('button', { name: label }).last().click()
}
const view = (label: string) => (p: Page) => p.getByRole('button', { name: label, exact: true }).click()

type Platform = (page: Page) => Promise<unknown>

const forge: Platform = (page) => stub.forge(page)
const org: Platform = (page) => stub.org(page)
const you: Platform = (page) => stub.you(page)
const rail: Platform = (page) => stub.rail(page)
const customize: Platform = async (page) => {
  await stub.catalogue(page)
  return stub.customize(page)
}

/**
 * Every address route.ts names, with the platform that fills it and what its
 * heading says. Keyed by the grammar's own types, so a screen, section or tab
 * added there and not here does not compile.
 */
const SCREENS: Record<Screen, [Platform, RegExp]> = {
  automations: [forge, /Repeating work for this organization/],
  codebases: [forge, /Create and browse this organization.s repositories/],
  sync: [forge, /Select repositories/],
  projects: [forge, /Boards on the forge/],
  issues: [forge, /Open work across every board/],
  artifacts: [rail, /What this organization has built/],
  templates: [rail, /Start from a working app/],
  mcp: [customize, /The fleet.s own servers/],
  plans: [org, /Plans that grow with you/],
}
const HEADINGS: Record<Section, [Platform, RegExp]> = {
  general: [you, /How Hanzo looks and listens/],
  account: [you, /Your Hanzo identity/],
  privacy: [you, /What Hanzo may do with your data/],
  billing: [org, /The plan acme is on/],
  usage: [org, /What acme has used/],
  capabilities: [you, /What the agent may use in acme/],
  memory: [you, /What Hanzo remembers about you here/],
  code: [you, /How a new run starts/],
  environments: [rail, /What a sandbox run does to a codebase/],
  machines: [rail, /Your organization.s own computers/],
  keys: [rail, /Your own keys for calling api\.hanzo\.ai/],
  members: [org, /The people who can act in acme/],
  integrations: [org, /What acme and you have connected/],
  notifications: [org, /Webhooks: events in acme/],
}
const CUSTOMIZE = /What the agent brings to a run/
const screens = Object.entries(SCREENS) as [Screen, [Platform, RegExp]][]

const signedIn: State[] = [
  { name: 'new', path: '/', platform: stub.landing, says: /What.s up next\?/ },
  { name: 'new-place', path: '/', platform: stub.landing, says: /What.s up next\?/, act: (p) => p.getByRole('button', { name: 'Where the run runs: Cloud' }).click(), over: true },
  { name: 'new-setup', path: '/', platform: stub.setup, says: /What.s up next\?/, act: (p) => p.getByRole('button', { name: 'Set up environment' }).click(), over: true },
  { name: 'find', path: '/', platform: (p) => stub.session(p), says: /What.s up next\?/, act: (p) => p.getByRole('button', { name: 'Search runs' }).locator('visible=true').first().click(), over: true },
  { name: 'account-menu', path: '/', platform: rail, says: /What.s up next\?/, act: inRail('Account: Dave · acme'), over: true },
  { name: 'rail', path: '/', platform: rail, says: /What.s up next\?/, act: async (p, size) => (size === 'phone' ? p.getByLabel('Open runs').click() : p.getByText('More', { exact: true }).click()), over: true },
  ...screens.map(([screen, [platform, says]]) => ({ name: screen, path: `/-/${screen}`, platform, says })),
  ...SECTIONS.map((section) => ({ name: `settings-${section}`, path: `/-/settings/${section}`, platform: HEADINGS[section][0], says: HEADINGS[section][1] })),
  ...TABS.flatMap((tab) =>
    (['Yours', 'Discover'] as const).map((v) => ({ name: `customize-${tab}-${v.toLowerCase()}`, path: `/-/customize/${tab}`, platform: customize, says: CUSTOMIZE, act: view(v) })),
  ),
]

/** A run, live or finished: the page, then each tab of its side pane. */
function run(status: 'running' | 'done'): State[] {
  const name = status === 'running' ? 'run-live' : 'run-done'
  const platform = (p: Page) => stub.run(p, status)
  const says = /universe: Add the widget/
  const tabs: [string, (p: Page) => Promise<void>][] = [
    ['environment', press('Environment')],
    ['git-diff', both(press('Git'), (p) => p.getByRole('button', { name: 'Show widget.go' }).click())],
    ['git-review', both(press('Git'), press('Review'))],
    ['git-commits', both(press('Git'), press('Commits'))],
    ['browser', press('Browser')],
    ['desktop', press('Desktop')],
    ['artifacts', press('Artifacts')],
  ]
  // A live run holds its sandbox: a shell beside the agent's log, and its files as they are beside its branch.
  if (status === 'running') {
    tabs.push(
      ['terminal-shell', both(press('Terminal'), press('Shell'))],
      ['terminal-log', both(press('Terminal'), press('Agent log'))],
      ['files-live', both(press('Files'), press('Live'))],
      ['files-branch', both(press('Files'), press('Branch'))],
    )
  } else tabs.push(['terminal-log', press('Terminal')], ['files-branch', press('Files')])
  return [{ name, path: RUN, platform, says }, ...tabs.map(([tab, act]) => ({ name: `${name}-${tab}`, path: RUN, platform, says, act, wide: true }))]
}

const project: State[] = [
  { name: 'project', path: '/shop', platform: stub.workspace, says: /Add a cart/ },
  { name: 'project-files', path: '/shop', platform: stub.workspace, says: /Add a cart/, act: (p) => p.getByRole('tab', { name: 'Files' }).click() },
  {
    name: 'project-code',
    path: '/shop',
    platform: stub.workspace,
    says: /Add a cart/,
    act: async (p) => {
      await p.getByRole('tab', { name: 'Files' }).click()
      await p.getByText('index.html', { exact: true }).click()
    },
  },
  { name: 'project-layers', path: '/shop', platform: stub.workspace, says: /Add a cart/, act: (p) => p.getByRole('tab', { name: 'Layers' }).click() },
  { name: 'project-history', path: '/shop', platform: stub.workspace, says: /Add a cart/, act: (p) => p.getByRole('button', { name: 'History' }).click(), over: true },
  {
    name: 'project-chat',
    path: '/shop',
    platform: stub.workspace,
    says: /Add a cart/,
    act: async (p) => {
      await p.getByRole('tab', { name: 'Files' }).click()
      await expect(p.getByLabel('Ask Hanzo for edits')).toBeHidden()
      await p.getByRole('tab', { name: 'Chat' }).click()
      await expect(p.getByLabel('Ask Hanzo for edits')).toBeVisible()
    },
    narrow: true,
  },
]

const STATES: State[] = [
  ...signedIn,
  ...run('running'),
  ...run('done'),
  { name: 'run-transcript', path: RUN, platform: (p) => stub.session(p), says: /universe: Add the widget/ },
  { name: 'run-plan', path: RUN, platform: (p) => stub.session(p, { mode: 'plan' }), says: /universe: Add the widget/ },
  ...project,
]

/** How tall the screen's content runs: the window, and the most any of its boxes scrolls further. */
function tall(page: Page, height: number): Promise<number> {
  return page.evaluate((h) => {
    let more = 0
    for (const el of document.querySelectorAll('*')) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) more = Math.max(more, el.scrollHeight - el.clientHeight)
    }
    return Math.min(h + more, 8000)
  }, height)
}

/** The states a phone draws over the open rail drawer. */
const DRAWN_OVER = ['rail']

test.describe.configure({ mode: 'parallel' })

for (const [size, box] of Object.entries(SIZES) as [Size, { width: number; height: number }][]) {
  test.describe(size, () => {
    test.use({ viewport: box })
    for (const s of STATES) {
      if ((s.wide && size === 'phone') || (s.narrow && size !== 'phone')) continue
      test(s.name, async ({ page }) => {
        // @hanzo/ui 8.27.16 lets touch()'s `position: relative` override the dialog close
        // button's `absolute`, so a sheet draws its close button in its flow: the rail's
        // drawer puts it at its foot, half off the window's left edge.
        test.fail(size === 'phone' && DRAWN_OVER.includes(s.name), 'the drawer’s close button is off the window (@hanzo/ui)')
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        await s.platform(page)
        await page.goto(s.path)
        await expect(page.getByText(s.says).filter({ visible: true }).first()).toBeVisible()
        await s.act?.(page, size)
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
        if (s.path === RUN && size === 'phone') await expect(desk(page)).toBeHidden()
        // Soft, so a screen that fails still leaves its picture to look at.
        expect.soft(await cramped(page), `${size} ${s.name}`).toEqual([])
        expect.soft(errors).toEqual([])
        const at = `screens/${size}/${s.name}.png`
        if (s.over) return void (await page.screenshot({ path: at }))
        await page.setViewportSize({ width: box.width, height: await tall(page, box.height) })
        await page.waitForTimeout(200)
        await page.screenshot({ path: at })
      })
    }
  })
}
