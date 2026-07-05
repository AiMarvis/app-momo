# syntax=docker/dockerfile:1.7

# Build context is the repo root — pnpm workspace resolution needs
# workspace-wide package.json + lockfile, and @kuku/web depends on the
# @kuku/contract workspace package (generated TS under gen/es/).

FROM node:24-alpine AS deps

RUN corepack enable

WORKDIR /build

# Copy workspace manifests first so dependency install caches
# independently of source changes. `patches/` has to be present at
# resolve time because pnpm-workspace.yaml references the tinykeys
# patch — install fails with ENOENT otherwise.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/
COPY packages/contract/package.json ./packages/contract/

# --ignore-scripts skips packages/contract's postinstall (installs Go +
# Rust proto plugins into .bin/.cargo-tools, which this Node-only image
# can't run and the web build doesn't need — generated TS is already
# committed under packages/contract/gen/es/).
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@kuku/web..." --ignore-scripts

FROM deps AS builder

# Single build-time knob: bakes the API base URL into the JS bundle.
# Default empty so same-origin setups (nginx reverse proxy) work out
# of the box — compose callers set this per tier.
ARG PUBLIC_KUKU_API_BASE_URL=""
ENV PUBLIC_KUKU_API_BASE_URL=$PUBLIC_KUKU_API_BASE_URL

# Web imports generated TS (gen/es/) from @kuku/contract, so the
# contract package source has to be available alongside web's.
COPY apps/web ./apps/web
COPY packages/contract ./packages/contract

# Call astro directly — the `build` script was moved off
# apps/web/package.json during the moon migration, so `pnpm build`
# would fail with ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT.
RUN cd apps/web && pnpm exec astro check && pnpm exec astro build

FROM nginx:alpine AS runtime

COPY --from=builder /build/apps/web/dist /usr/share/nginx/html
COPY infra/docker/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
