# Changelog

All notable changes to AethelOS are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Verified

- Post-v0.1.0 remote path (automated, 2026-06-10): `check:local-node` (relay + cloudflared OK), `scripts/tunnel-smoke.mjs` (public trycloudflare URL in invite relays; localhost excluded), E2E two-person genesis/join (3/3).
- Desktop remote path (2026-06-10): fixed Tauri `local_node` tunnel URL capture (read cloudflared stdout+stderr; accept `.trycloudflare.com` only). Disabled updater plugin in debug builds and set `plugins.updater.active: false` so `desktop:dev` starts without release keys. Verified via `scripts/desktop-proof.mjs` (tunnel-smoke + `cargo test local_node::tests` + two-person E2E), `desktop:dev` launch, and [QUICKSTART_REMOTE.md](./docs/QUICKSTART_REMOTE.md) criteria (Connection **Ready for friends abroad**, trycloudflare invite links, friend join sync).

## [0.1.0] - 2026-06-10

### Added

- Deterministic core engine (DAG, Reducer, integer economy, governance).
- Stateless relay (powerless, TTL-bounded delivery buffer).
- Local-first PWA client (identity, sync, Cell/governance/proposals UI).
- **Peer relay mesh:** members publish community mailboxes on the ledger (`relay_contribute` / `relay_revoke`); clients merge ledger URLs with session relays; desktop app spawns a local relay and optional Cloudflare quick tunnel.
- **Frictionless onboarding:** no relay settings on the happy path; Connection card shows sharing status and mailbox count.
- **Audit remediation:** invite links exclude localhost-only URLs; bootstrap pool no longer silently falls back to localhost in production; session opt-out for unwanted community mailboxes.
- [QUICKSTART_REMOTE.md](./docs/QUICKSTART_REMOTE.md) — plain-language guide for founder + friend abroad.
- CI: `tauri-check` job (`cargo check` + local-node prerequisite script on Ubuntu).
- Engineering foundation CI pipeline (typecheck, lint, format, test, build, E2E, audit), ESLint + Prettier, dependency pinning, versioning/wire-compat policy.
- React client: full reactive UI, design system (theming, accessible components), responsive layouts.
- Identity: BIP39 recovery phrase, encrypted identity export/import, session lock, key-backup gating, hardened keystore (PBKDF2 210k).
- Onboarding: shareable invite links + QR + deep-link auto-join; guided genesis/join wizards.
- Sync: multi-relay connections with failover/backoff, durable offline outbox, incremental snapshot reduction in a Web Worker.
- Relay productization: health/readiness/metrics endpoints, rate limiting, Dockerfile + compose, operator guide.
- Governance/economy UX: proposals lifecycle, Share-weighted Head election, superstructures.
- Quality: Playwright E2E; multi-node convergence, integer-conservation, snapshot-equivalence, and wire-fuzz tests.
- Security: strict wire validation, CSP + security headers, threat model, SECURITY policy.
- Distribution: Tauri desktop scaffold with auto-update, PWA update prompt, user/operator documentation.
- `pnpm setup:e2e` script to install Playwright Chromium separately from test runs.

### Fixed

- Infinite loop in bootstrap relay selection when the pool is empty (hung `relay-selection` / vitest for 15+ minutes).
- SyncEngine WebSocket `onerror` stack overflow during test teardown (undici close recursion).
- Flaky `community-scale` and `federation` test timeouts under full-suite load (30s limits).
- Flaky `sync-relay.test.ts` genesis echo (poll + 15s test timeout).
- E2E identity creation timeouts: reduced PBKDF2 iterations when `VITE_E2E=1`; skip service worker registration in E2E mode.

### Changed

- Renamed client test `relay-selection.test.ts` → `bootstrap-selection.test.ts` (run `pnpm --filter @aethelos/client test -- bootstrap-selection`, not `relay-selection`).

### Verified

- Local: core **79/79**, client **24/24**, Playwright E2E **19/19**.
