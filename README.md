# Hanzo Build

Say what you want. Hanzo writes it, runs it, and puts it on a live URL — with
the database, the sign-in and the storage already there.

This is the builder as a page: one composer, the public template catalog, the
projects an organization already has, and the live transcript of a run. It talks
to the Hanzo platform over its public API and to Hanzo IAM for identity. There
is nothing private in it — no internal host, no unpublished package.

```
pnpm install
pnpm dev            # http://localhost:3200
```

## What is on the screen

**The ask.** `Build` asks for the thing, `Plan` asks what building it would
involve; the mode rides with the prompt. Sending starts a coding run
(`POST /v1/agents/coding`) and opens its transcript in place.

**The run.** Turns as they arrive, folded into blocks, with Pause, Resume and
Stop. Steering is a queue the agent drains between turns, so a press is
confirmed as recorded and the status is left to the feed to correct.

**The catalog.** `/v1/templates` is public, so the shelf is drawn whether or not
you are signed in. Picking one takes a copy of that template's own repository
rather than asking a model to reinvent a starter the platform already publishes.

**A project.** Its deployed page, framed; the files the site is serving, edited
in place; and every deployment attempt. The column on the right is the running
page beside the thing that builds it.

## Configuration

Everything has a working default. Each is a Vite `VITE_` variable, read at build
time.

| | |
|---|---|
| `VITE_HANZO_API` | The platform. Defaults to `https://api.hanzo.ai` on a `hanzo.ai` host and to this page's own origin anywhere else, which is what makes the dev proxy work. |
| `VITE_HANZO_IAM` | The issuer. `https://hanzo.id`. |
| `VITE_HANZO_CLIENT_ID` | This application's IAM client, `<org>-<app>`. `hanzo-build`. |
| `VITE_PUBLISHABLE_KEY` | Optional. Records anonymous reads against the organization that published the page. It names an org and no person, so it is publishable by construction. |

**Sign-in needs an IAM application.** `hanzo-build` must exist in Hanzo IAM with
this deployment's `/auth/callback` among its redirect URIs. Until it is seeded,
hanzo.id answers "cannot read the sign-in configuration for this application"
and only the public half of the surface — the ask and the catalog — works. Point
`VITE_HANZO_CLIENT_ID` at an application that does exist to run against it.

## The two things worth knowing before editing

**The room is a flex column, and says so.** `@hanzo/ui`'s `Box` renders
`display: block`, and a block parent makes `flex: 1` inert on everything below
it — the frame then sizes to its own bar and the whole builder measures zero
high under a header that looks perfectly fine. `src/app.tsx` uses `YStack`.

**There is no CSS pipeline, and none is needed.** `<Hanzo>` imports the
stylesheet `@hanzo/ui` generates at ITS publish time, and gui inserts the rules
for props a package could not have known about — this app's own `px="$4"`,
`width={720}` — at first render, into `<style id="_hanzogui-styles">`, before
paint. Measured on this app: emptying a pre-generated sheet changes no geometry
and no pixel. So there is no generator to run, nothing to commit, and
`src/build.css` holds the three rules no package ships.

## Layout

```
src/
  main.tsx      the mount: faces, sheets, <Hanzo>
  app.tsx       the room
  routes.tsx    two addresses: the builder, and the return from the issuer
  root.tsx      identity, and the client that speaks for it
  frame.tsx     the bar, the pane, and the column beside it
  Build.tsx     the ask, the catalog, a project
  Session.tsx   an open run
  run.ts        POST /v1/agents/coding
  ai.tsx        the platform client
  api.ts        where the platform is
  token.ts      where the session is kept
  open.ts       what is open, and the address that carries it
```

## Licence

Apache-2.0 OR MIT, at your option. See `NOTICE`.
