# Hanzo Build

Say what you want. Hanzo writes it, runs it, and puts it on a live URL — with
the database, the sign-in and the storage already there.

The builder is one component, `<Builder host={…} />` from `@hanzo/build`. The
Hanzo app at hanzo.ai mounts it as its Dev mode, and that is where people use
it: hanzo.build and build.hanzo.ai redirect there, to the same place. This
repository's own page is the development host — the same component, signed in
through hanzo.id — and a click stays on its origin, with github.com opened only
for the repository grant.

The page is signed-in only. A visitor is drawn nothing: the tab goes to
hanzo.id (no popup) and comes back to the address it asked for; hanzo.id
answers at once, with no screen, for a person already signed in there. Words
carried on arrival as `?q=` wait in New's composer, and a draft sent while
signed out is sent once its person is in (`landing.tsx` `hold`). It signs in as
`hanzo-app`, the Hanzo App's client.

```
pnpm install
pnpm dev            # http://localhost:3200
pnpm test           # the transport contract and the address grammar
pnpm site           # every browser spec against the dev server (SITE= for another origin)
pnpm e2e            # one live agent turn, projected the way a run draws it
pnpm cover          # unit tests and every browser spec against a dev server, one coverage report in coverage/
pnpm build:lib      # lib/ — what npm ships
```

The port is not a preference. `vite.config.ts` pins 3200 for both `dev` and
`preview`, and IAM lists `http://localhost:3200/auth/callback` among this
client's redirects — sign in from any other port and the authorize call is
refused.

`/v1` is proxied to `api.hanzo.ai` from the dev server and from the preview of
a build: the gateway admits an origin by allowlist and a localhost port is not
on it.

`pnpm cover` is one number for the unit tests and the browser specs together:
both keep raw V8 coverage with source maps (`cover/unit.ts`, `src/e2e/fixture.ts`)
and `cover/run.ts` merges them by original source into `coverage/html/index.html`,
`lcov.info` and `coverage-summary.json`, and lists every file short of 100% with
the lines no test reached in `coverage/gaps.txt`. Arguments go to Playwright
(`pnpm cover src/e2e/run.spec.ts`). `src/e2e/screens.spec.ts` draws every screen
and state at a phone, a tablet, a laptop and a desktop — checked to fit, and
saved to `screens/<size>/<name>.png`.

## Mounting it

```tsx
import { Builder, type Host } from '@hanzo/build'

<Hanzo theme="dark">
  <div style={{ height: '100dvh', display: 'flex' }}>
    <Builder host={host} />
  </div>
</Hanzo>
```

`Host` is everything that differs between hosts: where the platform is
(`api`), the bearer (`token()`, read at call time), the org (`org`), who is
signed in (`person`), whether they administer the org (`admin`), the address
under the mount (`path`) and how to move (`go`), where to link out
(`links`, `open`), and — for a host that can repaint itself — the theme
(`theme`, `chooseTheme`), which follows the person's saved choice. Peers:
`@hanzo/ui`, `@hanzo/gui`, `@hanzogui/lucide-icons-2`, `react`.

`path` is the builder's own grammar (`route`, `path`). A host that shows real
paths writes it with `href` and reads it back with `parse`: '' New,
`/run/<id>`, `/projects/<org>/<repo>` a repository, `/projects/<slug>` a site,
`/machines` and `/environments` in the rail's own words, and every other place
at its name (`/projects`, `/issues`, `/customize/connectors`, `/settings/usage`).
`PLACES` lists every address that names no record, for a host that writes a page
per address ahead of time. `@hanzo/build/route` is that module alone, with no
React, for server code and for pages that must not carry the builder.

### In a host that has its own rail

The Hanzo app already has a left column, so it mounts `<Builder host={host}
rail={false} />` in its pane and lists the builder in its own rail:

```tsx
import { Builder, DevSection } from '@hanzo/build'

<Sidebar>            {/* the host's rail, @hanzo/ui/chat */}
  <DevSection host={host} />   {/* every place, grouped (nav), then the runs */}
</Sidebar>
<Builder host={host} rail={false} />
```

A run draws its own panes — the transcript, the side pane a gutter beside it
with the resize edge in that gutter, and each composer — from @hanzo/design's
pane tokens: `--pane-fill`, `--pane-round`, `--pane-edge`, `--pane-blur`,
`--pane-gap`, and `--shadow-sheet-2` for the drop. A host retunes the tokens;
it writes no rule against the builder's slots.

`DevSection` is rows of `@hanzo/ui/chat`'s Sidebar; `nav(host, go)` is the one
list of places every rail draws, in groups (Work, Make, Run, Setup) and with
nothing behind a More; `useSessions(host)` is the runs — the org's coding runs,
kept live by the org's feed — for a host that draws the rows itself. `administers(token, org)` reads the org-admin bit off a
hanzo.id token for `Host.admin`. One left column, never two.

## Words

Every word the builder authors is said through @hanzo/i18n, a required peer
(`>=0.4.0`): the host's `I18nProvider` is the one asked, and without one the
builder reads in English, unchanged. A component asks `useI18n()`; copy held as
data is `phrase()` where it is written and drawn through `t`; a helper outside a
render (`nav()`, `own()`, `tabs()`, `library()`, turn.ts, the plan sentences)
takes the caller's `t` last and falls back to `say.ts`'s `english`. Names, model
ids, what a person typed, what the platform said and figures are drawn as given;
prompts sent to a model stay in English. `src/e2e/language*.spec.ts` and
`translated.spec.ts` hold the composer, Projects, Skills and the Library in
French and right to left in Arabic.

## The model, the composer, the panel

One of each, shared with Chat (@hanzo/rooms imports them):

- `useMind` — the model and effort: `GET /v1/models` read once per platform,
  and the choice kept in this browser (`hanzo.mind`, Enso and Auto until
  changed). The composer's row changes it: the effort (Auto, High, XHigh,
  Max) always, the model chip only where the person turned the model selector
  on (Settings → Appearance, `@hanzo/appearance` `composing`). Settings → Code
  writes the same choice. `@hanzo/build/mind` serves the store alone, without
  the builder. `pacing(mind)` is the effort as the composer reads it.
- The composer is `@hanzo/ui/chat`'s `Composer`, once for Chat, Dev and Studio;
  `useEar` is the platform's ear it dictates through.
- `Reply` — copy, Listen and Open under an answer.
- `Panel` over `useDeck` — the side panel and its kept tabs.
- `useSplit` / `SideProvider` — the column the panel stands in: its edge (the
  kit's `Grip`), the width the person drags kept in their preferences
  (`side.width`, `PATCH /v1/pref`), the middle column hidden when the panel is
  pulled over it (Show chat brings it back), and full screen from the strip
  (Escape returns). `PrefsProvider` above it keeps the width; without one it
  lasts the page.

## Addresses

| path | screen |
|---|---|
| `''` | New — the empty state and the composer |
| `sess_<32 hex>` | one run, live |
| `-/automations` | Scheduled tasks: your tasks, then Activity, every run across products |
| `-/automations/<id>` | one task's editor and runs; `new` writes one |
| `-/customize` · `-/customize/connectors` · `/plugins` · `/agents` | Customize: skills, connectors, plugins, agents |
| `-/mcp` | Connectors → Browse with the fleet's native MCP servers listed |
| `-/projects` | the org's projects: its repositories on the forge |
| `-/sync` | link repositories from GitHub onto the forge |
| `-/issues` | every project's issues, merged: the forge's and the task index's |
| `-/artifacts` | the Library: everything you made in Chat, Dev and Studio; `?item=<id>` opens one; the org's sites at its foot |
| `-/templates` | the public starters |
| `-/plans` | the plans this brand sells, and the move to another |
| `-/settings/<section>` | Billing, Usage, Members, Integrations, Notifications, … |
| `<org>/<repo>` | a project's workspace: the repository, and its site when it has one |
| `<slug>` | a deployed site's workspace |

A project slug holds no `_` and never starts with `-`, and a repository is the
one address of two segments, so the forms cannot collide.

## What is on the screen

**Issues.** Every project's issues and pull requests, the forge's and the task
index's merged (merge.ts): the same issue on two boards is one row, with every
label and assignee either carried. A column of projects — every board, and every
repository an issue is filed under — each with what is open on it; Open and
Closed with their counts; a search; Label, Assignee, Kind, Source and Sort.
Pressing an issue opens New on the issue's own repository, where the issue
lives (a GitHub issue on GitHub, a forge issue on the forge), filled with its
title, number, link and body, and the run's pull request closes it; an issue no
project answers to (a Linear team's key, a board with no repository) asks which
project it is for. A board's key is never taken for a repository.

**The rail** (this page, or `rail` left on). At the top, the mark. Signed in to an organization,
that spot is the organization switcher: the org, and the projects under it.
New, then every place in view (nav.tsx) — Work: Projects, Issues; Make:
Library, Templates, Scheduled tasks; Run: Machines, Environments; Setup:
Customize, Docs — then the org's coding runs newest first with a live status
dot. Nothing waits behind a More. At the foot, a card offering Hanzo in Slack
(dismissed once, gone in this browser) and the account, whose menu holds the
email, the plan under it
(`Meter`: Max with 20x beside it and the session, day and month as shares;
Free's allowance left today; the balance only with no plan), Settings, Usage,
Billing, View all plans, Get help (the docs, in a new tab) and Log out. No money
sits beside a plan: credits live in Billing. Collapse is an explicit
toggle kept in this browser. A host with its own rail draws `DevSection` there
instead.

**Library.** Everything you made — Chat's pictures and files, Dev's patches and
reports, Studio's posters and videos, a workflow's outputs — newest first under
Today, Yesterday and the month, as a grid or a list, narrowed by kind, by the
product that made it and by whose (yours, or what a colleague shared). A tile
opens its item in the side panel (`Panel`, one tab per item; a sheet on a
phone), read fresh so its signed URLs are live. Each item opens where it was
made, downloads, is shared with the org or not, copies its link, is renamed,
moved to a project, used in Studio or Chat, or deleted; what a colleague shared
offers only what a reader may do. An item is its person's, so this list splits
yours from shared, where the sites beneath it do not.

**Sites**, at the Library's foot. A few starters to make something new from,
each copied into a project as Templates does, then every deployed site under the
month it was last edited, public or private, with rename, visibility and
delete. A site belongs to the org and names no author.

**Scheduled tasks.** Your tasks — prompts on a schedule from Chat and Dev, and
workflows — each with when it runs next, where it came from, a switch that
pauses and resumes it, and Run now, Edit and Delete; then Activity, every run
across products (a task's, Dev's background runs, Studio's renders) with its
state, how long it took, its cost and what it made, kept live by
`/v1/auto/events`. A run opens with its summary or error, its log (the Dev
run), its outputs as Library tiles and its cost. New task takes the schedule in
plain words, which `/v1/auto/cron` reads back before anything is made. A Dev
run's menu offers Schedule this, which opens New task with the run's ask.

**Settings, Code.** Environments: every codebase that has one, opened in the
same editor a run shows, forgotten by an org admin. Machines: `hanzo login` and
`hanzo link` to link one, registering one by hand, and each machine's rename,
drain, claim key (shown once) and removal. API keys: your secret and publishable
key, a new one shown once, rotated or revoked.

**Customize.** What the agent brings to a run, a tab each — Skills, Connectors,
Plugins, Agents — and in each, Browse (what there is to add, then what Hanzo
builds in) first and always where the tab opens, then Yours (what the org has,
counted on its button); one search and one Add. An empty Yours names the next
step as buttons. A read that fails is said in plain words with Try again, and one
that takes over fifteen seconds gives up and says so; only a 400, 409 or 422
carries the platform's own sentence (a failed build, a name taken). Skills and
connectors ride into every run in the org, so they are an org admin's to add,
switch and remove, and a member reads them and is told so; plugins and agents
are any member's.

- Skills: Browse is the brand's catalogue (`/.well-known/agent-skills/`) to read
  and add; Yours is the org's own SKILL.md skills, written, revised and deleted
  here, and the catalogue's it added. Adding is switching `skill_<name>` on, and
  a switch per skill turns it off again.
- Connectors: Browse is the shelf (featured first; a listing that ships only a
  package says so and has no Add), then the fleet's native servers, which every
  run can call and nothing adds — listed by `POST /v1/mcp` only when asked for,
  since that list starts every subsystem it names. Yours is the MCP servers the
  org added — by URL or off the shelf, a secret sealed in KMS — each with one
  switch on its card for all its tools and one per tool inside. Adding one
  switches its tools on.
- Plugins: TypeScript connectors built on the platform, from source or from a
  description of an API; a failed build says why. Browse offers building one and
  lists what the deployment mounts.
- Agents: Browse is every agent to start from — the host's default agents
  (`cast`) and personas (`personas`), and the platform's presets whose tool
  calls run on the platform — searched by name and filtered by category. Use
  makes one agent of the org's own from one template (a name taken becomes
  `-2`, `-3`), with its face, model and instructions, and opens its profile;
  nothing is added in bulk. Start from scratch, Clone yourself (the person
  signed in, with writing pasted or uploaded) and Create from a person make one
  too. Yours is the org's own — model, instructions, tools, budget — created,
  edited (only what changed is sent) and deleted.

**New.** "What's up next?", and at the foot the composer: where the run runs
(Cloud is the platform's sandbox with the codebase's environment; the org's
machines follow under remote control, each linked with `hanzo link`), the
codebase and the branch — the forge's repositories, filtered as you type, read
again each time the list opens, and a way to bring a GitHub repository that is
not there yet — then the ask, in the composer Chat draws too (`@hanzo/ui/chat`): the
paperclip and Build or Plan at its start; the effort, the model where the person
turned the selector on, dictation and send at its end. The three pills sit above
the field (environment, repository with its All / Organization / GitHub tabs, branch),
and Repos, Branches, Issues and Templates under it, each a press to its list. A codebase can be added to a project. Opening a codebase or an
issue from its own screen lands here with that choice already made.

**A run.** The transcript as it streams, drawn by what each part is: what the
agent says as markdown, each command it runs as a card that opens onto its
output, the files it edits with their diff, the files it reads as chips, and the
run's own steps. Steering while it works; Pause, Resume and Stop; the pull
request once it pushes one. Once it has finished, a follow-up starts a new run
from the branch it pushed — the same codebase, place and mode — and opens it; a
paused sandbox run goes on the same way. A plan run ends with its plan and
Approve and build. Rename it, share a project run's story publicly, and find any
run by status in Find. Beside it, the side panel (`Panel`, the one Chat opens):
Preview (what the sandbox serves, or where the run is published), Artifacts,
Files, Diff (Diff, Review, Commits) and Terminal (a shell in the working tree,
reattached by the run's name, and the agent's log); `+` opens Desktop (the
sandbox's screen), Environment and any page. Tabs are dragged to reorder (or
moved with Ctrl/⌘+Shift+←/→), shut with their cross, and kept as left; the
header's Panel button and ⌘. / Ctrl+. open and shut it, and a phone opens it
over the whole window. Its edge sizes it, the width kept in the person's
preferences; pulled over the run it takes the run's room until Show run or a
pull back out, and its strip's button puts it full screen until Escape. An
answer's Open shows what it wrote there, and a publish opens Preview.

The desktop and the shell are the sandbox's, so they close when the run stops.
The setup bar says how long setup runs here have taken, once there are three.

**An environment.** What a sandbox run does to its codebase's checkout before
the agent starts: the install script, the start command, and the secrets it
exports. New offers to set one up when the chosen codebase has none. Start the
agent, and a run in mode `setup`, titled by the prompt's first line and working
through its steps, explores, installs and checks the codebase. Its answer is kept
as a proposal the Environment tab shows in its editors until an org admin saves
it. Or an org admin skips and saves it empty, and writes the scripts beside the
next run. Secret values are sealed in KMS and never shown again.

**A project.** The v2 workspace in the same window: its runs as a
conversation with suggestions and a Build/Plan composer on the left; Preview,
Files, Code and Layers on the right with desktop/mobile, reload, the page
picker and open-in-tab; Share and Publish; the console dock under it.

## The contract

| call | what |
|---|---|
| `POST /v1/agent/coding` | start a run → 202 `{sessionId, …}`; with no `repo` the platform starts a new project named from the ask |
| `GET /v1/agent/sessions?kind=coding` | Recents, and a project's runs |
| `GET /v1/agent/sessions/{id}` · `GET /v1/agent/sessions/stream?root=` | a run, and its live feed (SSE over fetch) |
| `POST /v1/agent/sessions/{id}/message` · `/pause` · `/resume` · `/stop` | steer, pause, resume a machine's run, stop |
| `PATCH /v1/agent/sessions/{id}` `{title}` · `{published}` | rename a run, share its story at `GET /v1/agent/builds/{org}/{project}` |
| `GET /v1/agent/sessions?kind=coding&status=&after=` | Find, by status, paged |
| `GET`/`POST /v1/agent/targets` · `PATCH`/`DELETE …/{id}` · `POST …/{id}/key` | the org's machines, and a machine's claim key |
| `GET`/`POST /v1/account/keys` · `DELETE …/{id}` | your API keys, as many as you need; one revoked at a time |
| `GET`/`POST /v1/auto/automations` · `GET`/`PATCH`/`DELETE …/{id}` · `POST …/{id}/run` · `GET …/{id}/runs` | Scheduled tasks, and one task's editor |
| `GET /v1/auto/jobs` · `…/{id}` · `GET /v1/auto/events` (SSE over fetch) · `POST /v1/auto/cron` | Activity, live, and a schedule from plain words |
| `GET /v1/library` · `GET`/`PATCH`/`DELETE /v1/library/{id}` · `POST /v1/library` | the Library |
| `GET /v1/environment` · `GET`/`PUT`/`DELETE /v1/environment/{repo}` · `PUT`/`DELETE …/secrets/{name}` | a codebase's environment |
| `GET /v1/agent/coding/{session}/changes` · `/tree` · `/blob` | what a run pushed, and its branch's files, from the forge |
| `POST /v1/sandbox/{id}/screen/ticket` · `…/terminal/ticket` | the run's desktop and shell, framed with a single-use ticket |
| `POST /v1/sandbox/read` | the run's working tree, live |
| `GET /v1/provider/github/repos` · `POST /v1/provider/github/repos/import` | granted repositories, and bringing them onto the forge |
| `GET /v1/git/repos` · `GET /v1/git/repos/{name}` | the codebase chip, and its branches |
| `GET /v1/sync` | the repositories linked from GitHub, each with its forge copy and when it last synced |
| `GET /v1/task/projects` · `GET /v1/task/board` · `GET /v1/task/projects/{key}/issues` | boards, and every issue and pull request: the forge's and the task index's |
| `GET /v1/provider/github/repos` · `…/{owner}/{repo}/branches` | kept for a host that still asks GitHub |
| `POST /v1/provider/github/user/connect` | connect a person's GitHub |
| `GET /v1/projects` · `PATCH`/`DELETE /v1/projects/{slug}` · `POST /v1/projects/fork` · `GET /v1/templates` | sites, templates |
| `GET /v1/git/repos/{name}/tree` · `/blob` | Files and Code |
| `POST /v1/platform/apps` · `GET /v1/platform/builds` | Add to project, Publish |
| `POST /v1/mcp` | the native MCP servers, `tools/list` |
| `GET /v1/tool?source=` · `GET`/`PUT /v1/tool/activation` | the org's tools, and which are on |
| `GET /v1/tool/skills?activated=true` · `GET /v1/tool/skills/authored` · `POST /v1/tool/skills` · `DELETE /v1/tool/skills/{id}` | skills |
| `GET /.well-known/agent-skills/index.json` · `…/{skill}/SKILL.md` | the brand's skills catalogue, public |
| `GET`/`POST /v1/tool/mcp/servers` · `DELETE …/{id}` · `GET /v1/tool/catalog` · `…/{id}` | connectors, and the shelf |
| `GET /v1/tool/plugins/authored` · `POST /v1/tool/plugins/build` · `DELETE …/authored/{id}` · `GET /v1/tool/plugins` | plugins, and what is mounted |
| `GET`/`POST /v1/agent` · `GET`/`PATCH`/`DELETE /v1/agent/{ref}` · `GET /v1/agent/chat/presets` | agents, and presets |
| `GET /v1/models` · `POST /v1/event` | the model list, a verdict |
| `GET`/`PATCH /v1/pref` | the person's own settings: theme, text size, motion, dictation language, what to call them, their instructions, the coding defaults, the side panel's width (`side`) |
| `PUT /v1/iam/account` · `POST /v1/account/avatar` | the person's name and photo |
| `GET`/`PUT /v1/iam/consent` | whether Hanzo may train on their data, and usage insights |
| `GET /v1/tool` · `PUT /v1/tool/activation` | what the agent may use, per kind of tool |
| `GET /v1/ai/memory/list` · `POST /v1/ai/memory/remember` · `…/delete` | what Hanzo remembers |
| `PATCH /v1/projects/{slug}` | a project public or private |
| `GET /v1/billing/plans` · `…/subscriptions` · `POST …/subscribe/card` · `…/subscriptions/{id}/cancel`·`/reactivate` | Plans, and the plan in Billing |
| `GET`/`POST`/`DELETE /v1/billing/methods` · `GET /v1/billing/settings` | saved cards; a card is added from the processor's own field |
| `GET /v1/billing/invoices` · `…/invoices/{id}/pdf` | invoices |
| `GET`/`PUT /v1/ai/limits` · `GET /v1/billing/tier` · `GET /v1/allowance` | the plan's windows as shares, and credits past the allowance (Usage, the menu's `Meter`) |
| `GET /v1/billing/balance` · `…/credit-balance` · `…/credits` · `…/usage/rollup` · `GET`/`PUT …/recharge` · `POST …/topup` · `GET /v1/usage/summary` | Credits, in Billing: prepaid, granted, top-up, auto-reload, spend |
| `GET`/`POST`/`PATCH`/`DELETE /v1/billing/alerts` | the monthly limit (org admin) |
| `GET /v1/iam/memberships?org=` · `GET`/`POST`/`DELETE /v1/iam/invitations` | Members |
| `GET /v1/provider/{slack,github}` · `POST …/connect`·`/disconnect` · `GET /v1/provider/slack/channels` · `GET /v1/provider/github/installations` | Integrations |
| `GET`/`POST /v1/webhook` · `DELETE /v1/webhook/{id}` · `POST …/test` · `GET …/deliveries` | Notifications |

`mode`, `model` and `effort` are sent with a run as asked — Enso as
`enso-auto`, never left out — and `issue`, the number a run started from an
issue closes; the platform honours them where it does and nothing here
simulates them. A run takes `low`, `medium` or `high`, so Auto names `medium`
and High, XHigh and Max name `high` (`level`).

## Layout

```
src/
  index.ts      the library surface
  builder.tsx   the rail and the pane the address names
  landing.tsx   New
  forge.tsx     Projects, Issues, and the screens it hands on
  library.tsx   the Library; api/library.ts its wire
  scheduled.tsx Scheduled tasks; activity.ts its words; automations.tsx one task's editor
  merge.ts      what is the same project and the same issue, which repository an issue is for
  run.tsx       one run
  transcript.tsx  a run's transcript, as cards
  prose.tsx     markdown, drawn as text (markdown.ts reads it)
  desk.tsx      the pane beside a run
  mind.ts       the model and effort, one choice with Chat
  voice.ts      the language dictation listens in, and the platform's ear
  reply.tsx     the row under an answer
  panel.tsx     the side panel; tabs.ts its kept tabs
  side.tsx      the column it stands in: width, the middle column, full screen
  pane.ts       how a pane is cut, from the --pane-* tokens
  door.tsx      a run's desktop or shell, framed
  git.tsx       what a run pushed
  files.tsx     a run's files and artifacts
  environment.tsx a codebase's environment
  project.tsx   a project's workspace
  shelf.tsx     Sites and Templates
  nav.tsx       the places, once, for every rail
  customize/    Customize: the shell, then one file per tab
  publish.tsx   Add to project / Publish
  find.tsx      finding a run, by status, paged
  foot.tsx      the rail's foot: the Slack card and the account menu
  ask.tsx       confirming an act, or naming something, in a dialog
  settings/     Settings, one file per section
  data.ts       reads as hooks
  host.tsx      what a host provides
  route.ts      the address grammar
  api/          one typed client per surface, over one call()
  app/          this page's host: IAM, the router, the mount
```

## Licence

Apache-2.0 OR MIT, at your option. See `NOTICE` — the project workspace is a
port of the v2 editor, derived from OSW Studio and DeepSite (MIT).
