# Hanzo Build

Say what you want. Hanzo writes it, runs it, and puts it on a live URL — with
the database, the sign-in and the storage already there.

The builder is one component, `<Builder host={…} />` from `@hanzo/build`, with
three hosts: this page (hanzo.build), and the Dev section of the Hanzo app at
hanzo.ai/dev and hanzo.app/dev. None of them forks it. hanzo.build is this
frontend. A click stays on this origin — sign-in returns to `/auth/callback`
here — and github.com is opened only for the repository grant.

```
pnpm install
pnpm dev            # http://localhost:3200
pnpm test           # the transport contract and the address grammar
pnpm build:lib      # lib/ — what npm ships
```

The port is not a preference. `vite.config.ts` pins 3200 for both `dev` and
`preview`, and IAM lists `http://localhost:3200/auth/callback` among this
client's redirects — sign in from any other port and the authorize call is
refused.

`/v1` is proxied to `api.hanzo.ai` from the dev server and from the preview of
a build: the gateway admits an origin by allowlist and a localhost port is not
on it.

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
under the mount (`path`) and how to move (`go`), and where to link out
(`links`, `open`). Peers: `@hanzo/ui`, `@hanzo/gui`, `@hanzogui/lucide-icons-2`,
`react`.

### In a host that has its own rail

The Hanzo app already has a left column, so it mounts `<Builder host={host}
rail={false} />` in its pane and lists the builder in its own rail:

```tsx
import { Builder, DevSection } from '@hanzo/build'

<Sidebar>            {/* the host's rail, @hanzo/ui/chat */}
  <DevSection host={host} />   {/* New run, Artifacts, Templates, the runs */}
</Sidebar>
<Builder host={host} rail={false} />
```

`DevSection` is rows of `@hanzo/ui/chat`'s Sidebar; `useSessions(host)` is its
data — the org's coding runs, kept live by the org's feed — for a host that
draws the rows itself. `administers(token, org)` reads the org-admin bit off a
hanzo.id token for `Host.admin`. One left column, never two.

## Addresses

| path | screen |
|---|---|
| `''` | New — the empty state and the composer |
| `sess_<32 hex>` | one run, live |
| `-/automations` | repeating work, read from `/v1/auto/flows` |
| `-/mcp` | the fleet's native MCP servers, from `POST /v1/mcp` `tools/list` |
| `-/codebases` | the forge's repositories |
| `-/sync` | bring granted repositories onto the forge |
| `-/projects` | the forge's boards |
| `-/issues` | the forge's issues |
| `-/artifacts` | what the org has built |
| `-/templates` | the public starters |
| `<slug>` | a project's workspace |

A project slug holds no `_` and never starts with `-`, so the forms cannot
collide.

## What is on the screen

**The rail** (hanzo.build). New, then Automations, then the forge — Codebase, Projects, Issues —
then MCP, Artifacts, More (Templates, Machines, Docs), then the org's coding
runs newest first with a live status dot, and the account. Collapse is an
explicit toggle kept in this browser. A host with its own rail draws
`DevSection` there instead.

**MCP.** The native servers `POST /v1/mcp` lists, each with the operations it
names. A run starts a server when it calls it, and the server stays up afterwards.

**New.** "What's up next?", and at the foot the composer: where the run runs
(Default is the platform's sandbox; the org's machines follow), the codebase
and the branch — the forge's repositories, filtered as you type — then the
ask. Under it: attach (files ride the prompt as text), dictate, Build or Plan,
and the model and effort. A codebase can be added to a project. Opening a
codebase or an issue from its own screen lands here with that choice already
made.

**A run.** The transcript as it streams, steering while it works, Stop, and
the pull request once it pushes one.

**A project.** The v2 workspace in the same window: its runs as a
conversation with suggestions and a Build/Plan composer on the left; Preview,
Files, Code and Layers on the right with desktop/mobile, reload, the page
picker and open-in-tab; Share and Publish; the console dock under it.

## The contract

| call | what |
|---|---|
| `POST /v1/agent/coding` | start a run → 202 `{sessionId, …}` |
| `GET /v1/agent/sessions?kind=coding` | Recents, and a project's runs |
| `GET /v1/agent/sessions/{id}` · `GET /v1/agent/sessions/stream?root=` | a run, and its live feed (SSE over fetch) |
| `POST /v1/agent/sessions/{id}/message` · `/stop` | steer, stop |
| `GET /v1/agent/targets` | the org's machines |
| `GET /v1/auto/flows` · `POST /v1/auto/flows` · `POST /v1/auto/flows/{id}/enable` | automations |
| `GET /v1/provider/github/repos` · `POST /v1/provider/github/repos/import` | granted repositories, and bringing them onto the forge |
| `GET /v1/git/repos` · `GET /v1/git/repos/{name}` | the codebase chip, and its branches |
| `GET /v1/task/projects` · `GET /v1/task/board` · `GET /v1/task/projects/{key}/issues` | boards and issues, read from the forge |
| `GET /v1/provider/github/repos` · `…/{owner}/{repo}/branches` | kept for a host that still asks GitHub |
| `POST /v1/provider/github/user/connect` | connect a person's GitHub |
| `GET /v1/projects` · `POST /v1/projects/fork` · `GET /v1/templates` | artifacts, templates |
| `GET /v1/git/repos/{name}/tree` · `/blob` | Files and Code |
| `POST /v1/platform/apps` · `GET /v1/platform/builds` | Add to project, Publish |
| `POST /v1/mcp` | the native MCP servers, `tools/list` |
| `GET /v1/models` · `POST /v1/event` | the model list, a verdict |

`mode`, `model` and `effort` are sent with a run as asked; the platform
honours them where it does and nothing here simulates them.

## Layout

```
src/
  index.ts      the library surface
  builder.tsx   the rail and the pane the address names
  landing.tsx   New
  forge.tsx     Codebase, Automations, Projects, Issues
  run.tsx       one run
  project.tsx   a project's workspace
  shelf.tsx     Artifacts and Templates
  publish.tsx   Add to project / Publish
  account.tsx   the account and find-a-run dialogs
  data.ts       reads as hooks
  host.tsx      what a host provides
  route.ts      the address grammar
  api/          one typed client per surface, over one call()
  app/          this page's host: IAM, the router, the mount
```

## Licence

Apache-2.0 OR MIT, at your option. See `NOTICE` — the project workspace is a
port of the v2 editor, derived from OSW Studio and DeepSite (MIT).
