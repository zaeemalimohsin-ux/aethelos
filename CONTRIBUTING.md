# Contributing to AethelOS

Thank you for helping improve AethelOS. This guide is the front door for code contributors.

## Prerequisites

- **Node.js 20+**
- **pnpm 9.15.0** — enable with `corepack enable` (pinned in root `package.json`)

## Setup

```bash
git clone https://github.com/zaeemalimohsin-ux/aethelos.git
cd aethelos
pnpm install
pnpm build
```

**Windows one-click dev:** `Start-AethelOS.bat` (installs deps, builds relay if needed).

**Daily development** (two terminals):

```bash
pnpm dev:relay    # ws://localhost:8787
pnpm dev:client   # http://localhost:5173
```

Rust/Tauri (`packages/client-tauri`) is optional for most client work.

## Before opening a PR

Run the same checks as merge CI:

```bash
pnpm typecheck
pnpm lint:eslint
pnpm format:check
pnpm test
node scripts/check-user-docs.mjs
```

**E2E (Chromium only — recommended for PRs):**

```bash
pnpm setup:e2e
pnpm --filter @aethelos/client exec playwright test --project=chromium
```

> Bare `pnpm test:e2e` also attempts Docker and share-url projects. Use `--project=chromium` locally unless you have Docker / `AETHELOS_SHARE_URL` set.

On Windows, run `setup:e2e` and E2E **separately** to avoid hanging.

## Package map

| Package | Purpose |
|---------|---------|
| `packages/core` | Deterministic engine (DAG, reducer, economy) |
| `packages/relay` | WebSocket relay server |
| `packages/client` | React PWA |
| `packages/client-tauri` | Desktop shell (optional) |

## Philosophy & governance changes

If you change economy, governance, or admission behavior, update [`docs/PHILOSOPHY_TRACEABILITY.md`](docs/PHILOSOPHY_TRACEABILITY.md) and add or extend tests cited in the matrix.

## User-facing docs

Follow plain language — no infra jargon in `GET_STARTED.md`, `USER_GUIDE.md`, or `PRODUCT.md`. CI enforces this via `scripts/check-user-docs.mjs`.

## Getting help

- [SUPPORT.md](docs/SUPPORT.md) — bugs and features
- [TESTING_RELEASE.md](docs/TESTING_RELEASE.md) — proof tiers and release checklist