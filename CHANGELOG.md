# Changelog

All notable changes to AethelOS are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-07-09

### Added

- **Connection tab:** Network and share-link panels moved out of Identity; sync indicator opens Connection.
- **Recovery E2E:** Mnemonic round-trip UI test (create → scrape phrase → restore → same public key).
- **Analytics (tier 1):** Local-only funnel events buffered in diagnostics export; onboarding step tracking.
- **Android emulator proof docs:** Maintainer sections for `AethelosProof` AVD, ADB keys, and wipe-data bootstrap.
- **Version sync gate:** `scripts/check-version-sync.mjs` in `verify:release`.

### Changed

- **Pilot terminology:** Points (not Value), connection point (not mailbox) on error paths; stake in vouch toasts.
- **Admission E2E:** Proposals UI Approve (no test bridge); desktop GUI walkthrough migrated to UI approve.
- **Product proof:** Headless Play Store AVD, ADB auth skip, first-boot wipe marker, proof retry and process cleanup.
- **Release metadata:** All workspace packages aligned to 0.2.0; Identity tab shows build-injected version.
- **Docs honesty:** RELEASE-NOTES toned to match Pass 4 / BETA_README known limitations.

### Fixed

- **CI:** Prettier drift in `playwright.config.ts`.
- **Playwright:** Skip bundled webServer when `AETHELOS_SHARE_URL` is set (share-url proof path).
- **Rejection toasts:** Production-safe messages for invite, vouch, and relay errors.
- **Guided vouch → vote:** Admission requires Proposals Approve after vouch.

## [0.1.4] - 2026-06-15

### Added
- **Distribution polish:** Created `website` with a premium dark mode landing page, generated PWA icons from `favicon.svg`, and deployed to GitHub Pages.
- Updated `release.yml` to generate SHA-256 checksums automatically.

### Changed
- **UX Polish:** Changed `Namespace ID` to `Community ID` and removed technical URL hints from onboarding.
- Replaced system fonts with `Outfit` for a more modern typography look.
- Rewrote the `README.md` to prioritize end-user presentation over developer documentation.

## [0.1.3] - 2026-06-11

### Changed

- **Zero-jargon user path:** Start-AethelOS opens the desktop app first (not Docker). Share link in Connection tab (copy + QR).
- User docs stripped of infrastructure terms; publisher deploy moved to [PUBLISHER.md](./docs/PUBLISHER.md).
- Release bundles cloudflared + static app-server for phone founding via share link (`/ws` same-origin).
- Docker only via `-Mode Docker` / `publisher-deploy.ps1` / CI — not the regular user path.

### Added

- `pnpm verify:release`, `pnpm check:user-docs`, `scripts/publisher-deploy.ps1`, `.cursor/rules/user-simplicity.mdc`.

## [0.1.2] - 2026-06-11

### Added

- **Phone-first founding:** same-origin relay at `wss://{host}/ws` via nginx proxy; no `REPLACE` bootstrap placeholders.
- **Auto public share link:** `Start-AethelOS.bat` bundles cloudflared fetch + tunnel to port 8080; `-Share` re-prints URL via `scripts/share-public.ps1`.
- **Tests:** `bootstrap-relays.test.ts`, `founder-mobile.spec.ts`, CI `docker-founder` job, `pnpm android:smoke` / `scripts/android-pwa-smoke.ps1`.
- **Deploy:** permanent URL section in [PUBLISHER.md](./docs/PUBLISHER.md); `scripts/deploy-compose.sh` for VPS bootstrap.

### Changed

- Phone-first copy across onboarding, Connection, and docs; desktop peer mailbox is optional appendix in [GET_STARTED.md](./docs/GET_STARTED.md).
- Leaner E2E matrix: `community-scale` runs on chromium only (not duplicated on mobile-chrome).
- Removed inactive Tauri auto-updater plugin from desktop shell.

## [0.1.1] - 2026-06-11

### Added

- **Ergonomic distribution:** `Start-AethelOS.bat` one-click launcher; Docker compose client stack (port 8080); `Build-Release.bat` / `pnpm release:desktop`; GitHub Release workflow for Windows installer; [GET_STARTED.md](./docs/GET_STARTED.md).
- Self-contained desktop release bundles relay + portable Node (no separate Node install for recipients).
- `VITE_DOWNLOAD_URL` onboarding button; welcome-screen **I have an invite link**.

### Changed

- Friendlier error messages when mailbox startup fails; README leads with non-dev paths.

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
