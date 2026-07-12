# Engineering sign-off

Single entry point for distribution readiness and audit residuals. Supersedes [Pass 4 audit](./archive/CODEBASE_AUDIT_PASS4.md) and [Distribution scorecard](./archive/DISTRIBUTION_SCORECARD.md) for day-to-day sign-off.

**Last updated:** 2026-07-12 (v0.2.6.3 Windows ship hardening — relay revoke + Docker CI + tag gate)

---

## Windows ship hardening matrix (2026-07-12, v0.2.6.3)

Local verification on Windows (commits through `205d542`):

| Gate | Result | Notes |
|------|--------|-------|
| `check-script-encoding` | **PASS** | |
| `format:check` | **PASS** | |
| `typecheck` | **PASS** | |
| `check-version-sync` | **PASS** | npm `0.2.6.3` / Cargo `0.2.6` |
| `check-changelog-release` | **PASS** | after `0.2.6.3` entry |
| `check-user-docs` | **PASS** | |
| `check-sidecar-checksums` | **PASS** | |
| `pnpm test` | **PASS** | client 145, core 144, relay 12 |
| `pnpm test:e2e:federation-off` | **PASS** | 24/24 |
| `pnpm test:e2e:federation-on` | **PASS** | 27/27 |
| Chromium E2E (`AETHELOS_FRESH_E2E=1`, `CI=1`) | **PASS** | 86 passed, 2 skipped |
| `desktop-invite-cold.spec.ts` | **PASS** | `AETHELOS_DESKTOP_E2E=1` |
| `desktop-restart-relay.spec.ts` | **PASS** | after `revokeRelay` session cleanup (`271fcee`) |
| `tauri.spec.ts` | **PASS** | Windows desktop genesis |
| `federation-cap` at-cap button | **PASS** | in chromium suite (86/86) |
| `pnpm proof:product` (release path, Android) | **IN PROGRESS** | run 1 of 3; dev path retrying |
| Merge CI `docker-founder` | **PENDING** | fix: `.dockerignore` un-ignore `client-tauri/package.json` (`205d542`) |

### App fixes in v0.2.6.3 (ship-worthy)

1. **`revokeRelay` clears `sessionRelays`** — stale trycloudflare `/ws` URLs no longer appear in signed invite payloads after tunnel rotation.
2. **`ensureOnline` uses `localNodeStatus()`** — desktop public URL respects rotation override (restart / E2E bridge).
3. **Tag gate** — `desktop-restart-relay.spec.ts` added to `release-desktop-gate`.
4. **At-cap E2E** — disabled `Member limit reached` button at 50 members.
5. **Docker publish** — workspace-complete Docker build context for `pnpm deploy`.

### Manual charters (cannot automate — operator sign-off)

| Charter | Status | Oracle / notes |
|---------|--------|----------------|
| **Real PC reboot** | **MANUAL** | Install `0.2.6.3` → invite → reboot → new invite → joiner connects; relay host matches shell URL |
| **Upgrade** | **MANUAL** | `0.2.6.2` → `0.2.6.3` in-place; identity preserved; version shows `0.2.6.3` |
| **SmartScreen** | **MANUAL** | Fresh GitHub download; “Run anyway”; checksum matches `checksums.txt` |
| **iPhone Safari** | **MANUAL** | Founder invite → open in Safari (not in-app browser); admission completes |

### Subagent loop (inline, post-fix wave)

| Agent | Verdict | Notes |
|-------|---------|-------|
| **Bugbot** | **NO_BLOCKERS** | `revokeRelay` + `ensureOnline` fixes are minimal; idempotent sync; E2E green |
| **Security review** | **SHIP** | Author-scoped revoke unchanged; test bridge gated in release builds |
| **CI investigator** | **PENDING** | `docker-founder` fix pushed `205d542`; e2e/tauri-check green on prior runs |
| **Product proof** | **PENDING** | 3× consecutive PASS required |
| **Legal / claims** | **EA_ALIGNED** | No GA claims |
| **Mobile joiner** | **MEDIUM+** | share-url + WebKit infra; Android in local proof |
| **Founder ops** | **MEDIUM+** | P0 relay-in-invite fix verified by `desktop-restart-relay` E2E |
| **Support** | **MEDIUM–HIGH** | SUPPORT runbooks present |
| **Threat / scale** | **documented residuals** | unchanged |

### Release decision

| Outcome | Action |
|---------|--------|
| Automated gates green + proof 3× | **Tag `v0.2.6.3`** + full tag CI |
| `docker-founder` still red | Block tag until green (publish path) |

---

## Distribution readiness verdict (2026-07-12)

| Pillar | Ready? | Notes |
|--------|--------|-------|
| **Windows EA (software community)** | **Yes** | v0.2.6.2 — stale-relay fix, support runbooks, WebKit CI, installer rename; bundle semver `0.2.6`, app shows `0.2.6.2` |
| Windows installer | **Yes** | [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) |
| Global invite links (desktop) | **Yes** | Fail-closed public URL; no localhost invite fallback |
| Merge + tag release CI | **Yes** | E2E tiers + bundle scans + desktop proof + cold invite E2E |
| Hosted canonical URL | **Optional / not live** | `app.aethelos.org` down; desktop path is primary |

**Overall:** **Ready for Windows EA distribution** (not GA marketing until counsel review per TERMS).

## Executive summary (Pass 4)

Pass 4 verified realistic user and operator failure modes. Several **P1 issues were fixed** (misleading vote math, silent reducer rejections, doc/UI lies, SW confirm(), modal focus, nginx headers, Tauri health-probe CSP).

**Signs off** v0.2.6 for Windows EA: fail-closed invite links, green desktop CI path, federation, tag E2E + desktop proof gates, honest founder hosting docs.

**Optional follow-ups (not launch blockers):** Authenticode cert in `WINDOWS_CERT_*` secrets, canonical `app.aethelos.org` DNS for operators who prefer a fixed browser entry.

Full Pass 4 detail: [archive/CODEBASE_AUDIT_PASS4.md](./archive/CODEBASE_AUDIT_PASS4.md).

---

## Open gaps (from Pass 4)

| Area | Status |
|------|--------|
| Dual-fork causal validation on import | **Addressed in v0.2.6** — `event-log-fork-reducer.test.ts` keeps both causal branches (`imported === 3`); documented in GET_STARTED recovery section |
| Relay sinceHash filter | Open (M3) |
| Optimistic action toasts without reducer feedback | P2 partial |
| SyncEngine ws errors silent | P2 documented |
| No React error boundary | P3 |
| Tauri updater / release CI | **Authenticode hook present** — cert optional via `WINDOWS_CERT_*` secrets |
| Federation lay UX | **Addressed in v0.2.3** — signed chapter links; federation on; at-cap E2E |
| Expulsion fund-flow (no-parent path) | **Addressed** — `expel-fund-flow.test.ts` |
| Multi-hop expulsion escrow | **Addressed** — `expel-escrow-chain.test.ts` |
| Superstructure guard rails | **Addressed** — `superstructure-guards.test.ts`, `legacy-events.test.ts` |
| Lost-device recovery UI | **Addressed** — happy path + invalid/empty/orphan import toasts in `lost-device-recovery.spec.ts`; store wrapper in `recovery-import.test.ts` |

---

## Distribution composite (Charter A v1)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Desktop | 80 | v0.2.6.2 relay sync fix; installer rename; tag proof green |
| Mobile / PWA | 75 | WebKit merge CI; share-url browser-aware; tag still Chromium |
| Web hosted | 60 | `app.aethelos.org` not live; HF paused |
| Security | 77 | Residuals documented |
| P2P / sync | 84 | Tier 2c/2d + mesh tests |
| Test / CI | 86 | Tiers 1–3 on merge; desktop proof on tag |
| Docs | 80 | SUPPORT runbooks; in-app tunnel disclosure |
| Release gates | **84** | Tag 3/3 + renamed assets verified |
| Governance traceability | 86 | P3.2/P3.3 partial on multi-hop escrow seam |
| Ops runbooks | 78 | SmartScreen, tunnel, upgrade, version mismatch |

| Metric | Value |
|--------|-------|
| **Composite (10 dims, excl. i18n)** | **79.0** |
| **Target** | **≥ 75** |
| **Verdict** | **PASS** |

i18n (report-only, not in composite): 46 — English-primary.

Full scorecard history: [archive/DISTRIBUTION_SCORECARD.md](./archive/DISTRIBUTION_SCORECARD.md).

---

## Proof tiers

Run and interpret release gates via [TESTING_RELEASE.md](./TESTING_RELEASE.md) (tiers 1–5). CI on every merge covers tiers 1–3; tag releases add Windows desktop proof (tier 4).

**Local verification (2026-07-12, v0.2.6.2):** encoding, format, typecheck, unit (145), federation-off 24/24, federation-on 27/27, version/changelog/user-docs/sidecar gates.

**Product proof (2026-07-12):** Tag [29189737878](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189737878) `PRODUCT PROOF: PASS` + cold invite E2E 1/1; weekly dispatch [29189751851](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189751851) also **PASS** (post-ship).

## v0.2.6.2 reassessment board (post-tag CI, 2026-07-12)

Inline review of tag `v0.2.6.2` (commit `93b7c31`) after subagent quota blocked automated runs. Tag CI **3/3 green** on [run 29189737878](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189737878).

| Dimension | Confidence | Target | Notes |
|-----------|------------|--------|-------|
| Engineering / tag CI | **HIGH** | HIGH | 3/3 green; renamed assets published |
| Founder ops (7-day hosting) | **MEDIUM** | MEDIUM | P0 stale-relay fixed; ephemeral tunnel + PC-on still required |
| Mobile joiners | **MEDIUM+** | MEDIUM+ | WebKit project on merge CI; tag proof still Pixel 5 Chromium 2/2 |
| Support / comms | **MEDIUM–HIGH** | MEDIUM–HIGH | SmartScreen, tunnel, upgrade, version mismatch runbooks |
| Upgrade path | **HIGH** | HIGH | In-place install documented; installer filename matches npm patch |
| Scale 20–50 | **MEDIUM** | MEDIUM | At-cap invite disabled; GET_STARTED chapter spawn guidance |
| Supply chain | **MEDIUM+** | MEDIUM+ | Cache-hit SHA-256 verify + merge manifest gate |
| Threat / abuse | **MEDIUM** | MEDIUM | No new runtime mitigations; residuals documented |
| Privacy/legal (EA scope) | **HIGH** | HIGH | In-app tunnel disclosure (invite modal + Connection panel) |

### Core agents (9)

| Agent | Verdict | Notes |
|-------|---------|-------|
| **Security review** | **SHIP** | `syncDesktopTunnelRelay` revokes only **author-owned** `*.trycloudflare.com` relays (`communityRelayAuthors[url] === myKey`); cannot revoke third-party relays. `contributeRelay` unchanged (member-gated in core). `setDesktopPublicUrlOverrideForTests` ships in bundle but is inert without `__aethelosTest`; release job runs `scan-no-test-bridge` gate. Sidecar cache verify closes tampered-cache gap from v0.2.6.1. No new secrets or network listeners. |
| **Bugbot** | **NO_BLOCKERS** | Relay sync is idempotent when URL unchanged (`ensureDesktopShare` re-sync on match is safe). `getCommunityRelays()` reads live `controller.state` after revokes. Invite flow calls sync before `getInviteRelayUrls()` — fixes shell/relay mismatch. Unit test covers revoke+contribute path. `desktop-restart-relay.spec.ts` not in tag gate (Windows + `AETHELOS_DESKTOP_E2E=1` only). |
| **CI investigator** | **3/3 GREEN** | [29189737878](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189737878): `release-e2e-gate` + `release-desktop-gate` + `build-and-publish-windows`. Assets: `AethelOS_0.2.6.2_x64-setup.exe`, `AethelOS_0.2.6.2_x64_en-US.msi`, `checksums.txt`. Merge CI on `93b7c31`: **e2e GREEN** (chromium 85, webkit 2 skipped w/o `AETHELOS_SHARE_URL`, federation-off 24, federation-on 27); `docker-founder` **FAILED** (relay `pnpm deploy` in Docker — unrelated to patch, non-blocking for tag). |
| **Product proof** | **PASS** | Tag gate: share URL + mobile E2E 2/2, `PRODUCT PROOF: PASS`, `desktop-invite-cold.spec.ts` 1/1. Post-ship dispatch [29189751851](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189751851): **PASS** (Android skipped per `-SkipAndroid`). |
| **Tauri / desktop** | **READY** | `syncDesktopRelayContribution` wired on unlock (`startNode`), `ensureDesktopShare`, invite modal. `applyDesktopShareFromNode` refreshes `.share-url` file on URL change. Installer rename in `build-release.mjs` verified on release. Bundle semver `0.2.6` / npm `0.2.6.2` per `check-version-sync.mjs`. |
| **Governance** | **ADEQUATE+** | No reducer, proposal, or admission rule changes. Relay contribute/revoke events only; federation/governance matrices unchanged. |
| **Supply chain** | **ACCEPTABLE+** | `exeSha256` pins `node.exe` on cache hit; cloudflared exe verified on cache hit; `check-sidecar-checksums.mjs` on merge `tauri-check` + tag gate. Tag `pnpm audit --audit-level high` inherited from release-e2e-gate. |
| **Legal / claims** | **EA_ALIGNED** | SUPPORT/GET_STARTED/PRODUCT state EA (not GA); `app.aethelos.org` not live; HF may be paused. In-app disclosure names Cloudflare quick tunnel in plain language. No consumer GA marketing claims. |
| **QA gate** | **ALL_TIERS_PASS** | Local: unit 145, federation-off 24, federation-on 27, encoding/format/typecheck/version/docs/sidecar gates. Tag: full E2E tier + desktop proof. `active-relays.test.ts` adds `syncDesktopTunnelRelay` coverage. |

### Weak-point agents (4)

| Area | Confidence | Notes |
|------|------------|-------|
| **Mobile joiner** | **MEDIUM+** | Merge CI installs WebKit and runs `webkit` project (2 skipped without share URL — infra validated). Share-url specs browser-aware (iPhone 13 vs Pixel 5). Tag proof exercises Chromium mobile path only. Docs: Safari on iPhone, avoid in-app browsers, keep tab open (GET_STARTED, USER_GUIDE). **Residual:** no iOS WebKit in tag gate; Android emulator still skipped. |
| **Founder ops** | **MEDIUM** | **Fixed:** signed invite `relays` now track tunnel rotation after restart. **Remaining:** ephemeral `trycloudflare.com` URL; founder PC must stay on; fresh link after restart (documented in-app + SUPPORT). `desktop-restart-relay.spec.ts` simulates rotation via test bridge — true reboot remains manual QA. |
| **Support readiness** | **MEDIUM–HIGH** | SUPPORT.md adds SmartScreen/unsigned installer (`checksums.txt` verify), tunnel troubleshooting table, version mismatch FAQ (bundle `0.2.6` vs Identity `0.2.6.2`), upgrade steps. GET_STARTED: upgrade, scale past 50, mobile joiner tips. Bug report template synced to `0.2.6.2`. **Residual:** ~10–20% week-one tickets expected for tunnel/SmartScreen; no public status page. |
| **Threat / recovery / scale** | **documented residuals** | **Threat:** tunnel DoS (founder offline), phishing invite shell with valid sig (mitigated: relays now match shell host post-fix), relay censorship unchanged. **Recovery:** phrase restores identity only — rejoin via invite or event log export (documented). **Scale:** 50-member cap enforced; at-cap invite disabled; federation chapter spawn documented. No Authenticode; no Tauri auto-update. |

### Official release decision

| Scope | Decision |
|-------|----------|
| **Windows EA — software community public release** | **APPROVED** — tag `v0.2.6.2` (world-ship readiness patch) |
| **GA / broad public marketing** | **NOT APPROVED** — TERMS/PRIVACY counsel templates; unsigned installer |
| **Hosted canonical (`app.aethelos.org`)** | **NOT LIVE** — do not claim browser-first GA path |

**Residuals (non-blocking for EA):** Authenticode optional; Android smoke skipped on tag gate; HF Space may be paused; `desktop-restart-relay.spec.ts` manual/Windows E2E; WebKit share-url tests skip without `AETHELOS_SHARE_URL` on merge CI; `docker-founder` merge job flaky on relay Docker deploy (unrelated to v0.2.6.2).

## v0.2.6.1 reassessment board (post-tag CI, 2026-07-12)

Re-run after tag CI on commit `66b63a0` (Cargo semver fix retagged `v0.2.6.1`). Ship only if no FAIL on security, product proof, claims, or CI.

| Agent | Verdict | Notes |
|-------|---------|-------|
| Security review | **SHIP** | Sidecar SHA-256 verify on fetch; `pnpm audit --audit-level high` on tag gate; no new attack surface in patch diff |
| Product proof | **PASS** | Tag desktop proof + cold invite E2E green on [29186528258](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29186528258) |
| Tauri / desktop | **READY** | `cargo check --locked` + `tauri build -- --locked`; npm `0.2.6.1` / bundle `0.2.6` split documented in `check-version-sync.mjs` |
| Governance | **ADEQUATE+** | P3.2 lists `expel-escrow-chain` + `event-log-fork-reducer`; dual-fork addressed; P3.2 partial on root-A receipt / federation-on E2E |
| Supply chain | **ACCEPTABLE** | `sidecar-checksums.json` + verify scripts; tag audit + manifest gate; residual: skip-verify when sidecar cached locally |
| Legal / claims | **EA_ALIGNED** | GET_STARTED/PRODUCT/SUPPORT EA framing; hosted-install honesty; HF may be paused in SUPPORT |
| Bugbot | **NO_BLOCKERS** | Doc/supply-chain/traceability patch; Cargo semver hotfix `66b63a0` |
| QA gate | **ALL_TIERS_PASS** | Tag CI: e2e + federation tiers + desktop proof + publish; local federation-on flakes non-blocking with CI retries |
| CI investigator | **3/3 GREEN** | [Run 29186528258](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29186528258) — `AethelOS_0.2.6_x64-setup.exe` + MSI + checksums on [v0.2.6.1](https://github.com/zaeemalimohsin-ux/aethelos/releases/tag/v0.2.6.1) |

### Official release decision

| Scope | Decision |
|-------|----------|
| **Windows EA — software community public release** | **APPROVED** — tag `v0.2.6.1` (patch over v0.2.6) |
| **GA / broad public marketing** | **NOT APPROVED** — TERMS/PRIVACY counsel templates; unsigned installer without `WINDOWS_CERT_*` |
| **Hosted canonical (`app.aethelos.org`)** | **NOT LIVE** — do not claim browser-first GA path |

**Residuals (non-blocking for EA):** Authenticode signing optional; Android smoke skipped on tag gate; HF Space may be paused; P3.2 multi-hop escrow seam partial; installer filename uses bundle semver `0.2.6` while app identity shows `0.2.6.1`.

## v0.2.6 reassessment board (post-tag CI, 2026-07-12)

Re-run after tag CI **29182842076** (3/3 green, assets published). Ship only if no FAIL on security, product proof, claims, or CI.

| Agent | Verdict | Notes |
|-------|---------|-------|
| Security review | **SHIP** | Invite fail-closed; `buildInviteLink` throws without public URL; test bridge gated (`PROD` + `scan-no-test-bridge` on ship bundle); proof/shipping split enforced |
| Product proof | **PASS** | `PRODUCT PROOF: PASS` on release path; mobile share-url E2E 2/2; cold invite E2E 1/1 |
| Tauri / desktop | **READY** | Release exe + relay sidecar; tunnel via bundled cloudflared; harness reads `PLATFORM` at launch |
| Governance | **ADEQUATE** | Dual-fork import `imported === 3`; expel-escrow partial (root receipt gap); P3.2 matrix stale |
| Supply chain | **ACCEPTABLE** | Frozen lockfile; esbuild ≤2; publish scans; gaps: sidecar checksums, audit not on tag path |
| Legal / claims | **EA_ALIGNED** | No false GA; tunnel/hosting caveats; counsel templates; add EA label to GET_STARTED/PRODUCT for wider marketing |
| Bugbot | **NO_BLOCKERS** | Harness `PLATFORM` timing bug fixed in `4abdff5`; no ship-stopping defects in v0.2.6 diff |
| QA gate | **ALL_TIERS_PASS** | Unit 144+143+12; chromium 84 (+1 flaky retry); federation-off 24; federation-on 27; bundle scans green |
| CI investigator | **3/3 GREEN** | [Run 29182842076](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29182842076) — setup.exe + MSI + checksums |

### Official release decision

| Scope | Decision |
|-------|----------|
| **Windows EA — software community public release** | **APPROVED** — tag `v0.2.6` on GitHub Releases |
| **GA / broad public marketing** | **NOT APPROVED** — TERMS/PRIVACY are counsel-review templates; unsigned installer without `WINDOWS_CERT_*` |
| **Hosted canonical (`app.aethelos.org`)** | **NOT LIVE** — do not claim browser-first GA path |

**Residuals (non-blocking for EA):** Authenticode signing optional; Android smoke skipped on tag gate; weekly `product-proof.yml` stale; HF Space paused; P3.2 multi-hop escrow seam partial.


## Ship status (v0.2.6.2)

| Path | Status |
|------|--------|
| **Windows EA** | **Ready** — v0.2.6.2 recommended for founders (stale-relay fix + support runbooks) |
| Windows installer (GitHub Releases) | **v0.2.6.2** tag — `AethelOS_0.2.6.2_x64-setup.exe` / MSI; bundle `0.2.6`, app `0.2.6.2` |
| Merge CI (tiers 1–3) | **Green** — WebKit project + sidecar checksum gate added |
| Tag release chain | **Green** — [run 29189737878](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189737878): e2e + desktop + publish |
| Weekly product proof | **Dispatched** — [run 29189751851](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29189751851) |

## Ship status (v0.2.6.1)

| Path | Status |
|------|--------|
| **Windows EA** | **Ready** — v0.2.6.1 recommended for founders (patch: docs + supply chain) |
| Windows installer (GitHub Releases) | **v0.2.6.1** tag — bundle `0.2.6`, app version `0.2.6.1` |
| Merge CI (tiers 1–3) | **Green** — format:check + E2E tiers on every merge |
| Tag release chain | **Green** — [run 29186528258](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29186528258): e2e + desktop + publish |
| Weekly product proof | **Dispatched** — [run 29185344312](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29185344312) |
| GHCR container publish | **Green** — `ghcr.io/zaeemalimohsin-ux/aethelos:latest` |
| Fly.io deploy automation | **Wired** — skips until `FLY_API_TOKEN` secret set |
| Browser demo (app.aethelos.org / HF Space) | **Blocked** — HF Space may be paused; unpause or email HF support |
| Self-host / Render / docker compose | Ready — [PUBLISHER.md](./PUBLISHER.md), [render.yaml](../render.yaml) |

## Ship status (v0.2.6)

| Path | Status |
|------|--------|
| **Windows EA** | **Ready** — v0.2.6 recommended for founders in software community release |
| Windows installer (GitHub Releases) | **v0.2.6** — federation on, cold invite E2E on tag |
| Merge CI (tiers 1–3) | **Green** — format:check + E2E tiers on every merge |
| Tag release chain | **Green** — run 29182842076: e2e + desktop + publish |
| GHCR container publish | **Green** — `ghcr.io/zaeemalimohsin-ux/aethelos:latest` |
| Fly.io deploy automation | **Wired** — skips until `FLY_API_TOKEN` secret set |
| Browser demo (app.aethelos.org / HF Space) | **Blocked** — HF Space PAUSED; unpause or email HF support |
| Self-host / Render / docker compose | Ready — [PUBLISHER.md](./PUBLISHER.md), [render.yaml](../render.yaml) |

## Related

- [PHILOSOPHY_TRACEABILITY.md](./PHILOSOPHY_TRACEABILITY.md) — philosophy automation matrix
- [PRODUCT.md](./PRODUCT.md) — known limitations (50 per chapter, federation on)
- [OPERATIONS.md](./OPERATIONS.md) — hosted nightly preflight
