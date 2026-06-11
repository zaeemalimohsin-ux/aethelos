# Changelog

All notable changes to AethelOS are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `VITE_INVITE_BASE_URL` — configurable client shell URL for invite links (desktop founders point remote friends at a hosted PWA; signed payload and peer mailboxes unchanged).
- Community **How your community works** card now surfaces all seven philosophy concepts (stake, vouch, proposals, Head, circulation, mailboxes, scaling).
- Production reducer-rejection toasts for common governance/economy blocks; in-app PWA update banner (replaces blocking `confirm()`).
- Playwright mobile layout smoke (`mobile-layout.spec.ts`, Pixel 5 project).

### Fixed

- Tauri IPC command names: the frontend invokes `start_local_node` / `stop_local_node` / `local_node_status`, but the Rust commands were registered as `cmd_*` — every desktop invoke failed silently, so GUI sharing/tunnel never started. Commands renamed to match (2026-06-11).
- ESLint ignore for Rust `target/` build artifacts (local Windows dev parity with CI).
- Grand audit Pass 3: shared relay invite-filter helpers in `@aethelos/core` (removes `tunnel-smoke.mjs` drift); PhilosophyCard HelpTip mismatch; duplicate `proposalApprovalPercent` in UI; mobile layout for sliders/lists; simulation test timeout on slow hosts.
- Grand audit Pass 4: pending-invite admission vote uses stake-weighted % (matches Proposals tab); frozen-account and soft-cap copy aligned with reducer; modal focus trap; sync live region; nginx security headers; Tauri CSP allows relay health probes.

### Changed

- Invite modal on desktop warns when tunnel is ready but the link still uses a localhost client shell — directs founders to set `VITE_INVITE_BASE_URL`.
- Connection card: tunnel operator notes collapsed under **Sharing details**.
- [`USER_GUIDE.md`](./docs/USER_GUIDE.md), [`THREAT_MODEL.md`](./docs/THREAT_MODEL.md), and desktop README updated for honest non-dev and release paths.

### Verified

- Grand audit Pass 4 (2026-06-11): [CODEBASE_AUDIT_PASS4.md](./docs/CODEBASE_AUDIT_PASS4.md).
- Grand audit Pass 3 (2026-06-11): [CODEBASE_AUDIT_PASS3.md](./docs/CODEBASE_AUDIT_PASS3.md).

- Post-v0.1.0 remote path (automated, 2026-06-10): `check:local-node` (relay + cloudflared OK), `scripts/tunnel-smoke.mjs` (public trycloudflare URL in invite relays; localhost excluded), E2E two-person genesis/join (3/3).
- Desktop remote path (2026-06-10): fixed Tauri `local_node` tunnel URL capture (read cloudflared stdout+stderr; accept `.trycloudflare.com` only; `--no-autoupdate`). Disabled updater plugin in debug builds and set `plugins.updater.active: false` so `desktop:dev` starts without release keys. Tunnel wait aligned to 120s (Rust + client). Verified via `pnpm desktop:proof` (tunnel-smoke + two-person E2E + `cargo test local_node::tests`) and `desktop:dev` launch. (The QUICKSTART GUI criteria were **not** actually provable on this date — blocked by the IPC name bug above.)
- Full [QUICKSTART_REMOTE.md](./docs/QUICKSTART_REMOTE.md) GUI walkthrough (automated, 2026-06-11): `pnpm desktop:gui-walkthrough` drives the real Tauri webview over CDP — Connection shows **Ready for friends abroad**, invite carries public trycloudflare mailboxes only, a friend browser joins through the tunnel, founder vouches/approves, and both sides converge on 2 members.

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
