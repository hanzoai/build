# syntax=docker/dockerfile:1.7
# Hanzo Build — the Vite SPA built once, served by hanzoai/spa.
FROM node:24-alpine AS build
WORKDIR /build
ENV CI=true PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate

# Manifests first so a source edit re-runs the build and not the resolve.
#
# pnpm-workspace.yaml is REQUIRED even though this repo has no workspace
# members: every dependency is `catalog:`, and the catalog lives in that file.
# It also carries the overrides that keep ONE copy of the gui runtime — two are
# two theme contexts, and every themed component then throws.
#
# FROZEN, and the lockfile ships. A resolver left free to drift builds a tree
# nobody ran; frozen, the image gets the tree the gate passed against.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY src src

# `pnpm build` is `tsc --noEmit` && `vite build`, so the typecheck is part of
# the image.
#
# `&&`, not `;`: with `;` the RUN carries the status of the LAST command and a
# failed build would be masked. A vite build that emits nothing still exits 0,
# which is what the file tests are for.
RUN pnpm build \
 && [ -s dist/index.html ] \
 && [ -d dist/assets ]

# hanzoai/spa, not hanzoai/static, and not a webserver of our own: this is a
# client-routed SPA, so it needs index.html served for every path.
# hanzoai/static defaults to `Content-Security-Policy: default-src 'none'`,
# which blocks the bundle the page loads and leaves a blank screen.
# Defaults: PORT=3000, ROOT=/public.
FROM ghcr.io/hanzoai/spa:1.4.11
COPY --from=build /build/dist /public
EXPOSE 3000
