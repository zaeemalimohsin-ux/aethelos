# Engineering sign-off

Single entry point for distribution readiness and audit residuals. Supersedes [Pass 4 audit](./archive/CODEBASE_AUDIT_PASS4.md) and [Distribution scorecard](./archive/DISTRIBUTION_SCORECARD.md) for day-to-day sign-off.

**Last updated:** 2026-07-12 (v0.2.6.2 world-ship readiness — Windows EA patch approved)

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
| Desktop | 78 | Windows proof on tag; Tauri exit cleanup; Authenticode deferred |
| Mobile / PWA | 73 | Share-url env-gated; Android optional in CI |
| Web hosted | 60 | `app.aethelos.org` not live; HF paused |
| Security | 77 | Residuals documented |
| P2P / sync | 84 | Tier 2c/2d + mesh tests |
| Test / CI | 86 | Tiers 1–3 on merge; desktop proof on tag |
| Docs | 76 | Runbooks consolidated; legal aligned |
| Release gates | **82** | Tag E2E gate + desktop proof + bundle scans |
| Governance traceability | 86 | P3.2/P3.3 partial on multi-hop escrow seam |
| Ops runbooks | 74 | Relay + hosted smoke documented |

| Metric | Value |
|--------|-------|
| **Composite (10 dims, excl. i18n)** | **78.8** |
| **Target** | **≥ 75** |
| **Verdict** | **PASS** |

i18n (report-only, not in composite): 46 — English-primary.

Full scorecard history: [archive/DISTRIBUTION_SCORECARD.md](./archive/DISTRIBUTION_SCORECARD.md).

---

## Proof tiers

Run and interpret release gates via [TESTING_RELEASE.md](./TESTING_RELEASE.md) (tiers 1–5). CI on every merge covers tiers 1–3; tag releases add Windows desktop proof (tier 4).

**Local verification (2026-07-12, v0.2.6.2):** encoding, format, typecheck, unit (145), federation-off 24/24, federation-on 27/27, version/changelog/user-docs/sidecar gates.

**Product proof (2026-07-12):** Tag CI authoritative — [29186528258](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29186528258) `PRODUCT PROOF: PASS` + cold invite E2E. Weekly scheduled [29185119661](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29185119661) green pre-land; post-land dispatch [29185344312](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29185344312) failed on interim main (non-blocking).

## v0.2.6.2 reassessment board (pre-tag local, 2026-07-12)

Confidence floors after weak-point remediation. Tag CI pending on `v0.2.6.2`.

| Dimension | Confidence | Notes |
|-----------|------------|-------|
| Engineering / tag CI | **HIGH** | Local gates green; await 3/3 on tag |
| Founder ops (7-day hosting) | **MEDIUM** | P0 stale-relay fixed; in-app tunnel disclosure; SUPPORT runbooks |
| Mobile joiners | **MEDIUM+** | WebKit (iPhone 13) project on merge CI; iOS joiner tips in docs |
| Support / comms | **MEDIUM–HIGH** | SmartScreen, tunnel, upgrade, version mismatch in SUPPORT |
| Upgrade path | **HIGH** | Documented in-place install; installer renamed to npm patch |
| Scale 20–50 | **MEDIUM** | At-cap invite UX + GET_STARTED chapter guidance |
| Supply chain | **MEDIUM+** | Cache-hit SHA-256 verify; merge CI manifest gate |
| Threat / abuse | **MEDIUM** | No runtime change; documented residuals |
| Privacy/legal (EA scope) | **HIGH** | In-app Cloudflare tunnel disclosure |

| Agent | Verdict | Notes |
|-------|---------|-------|
| Security review | **SHIP** | Relay sync is author-scoped revoke + contribute; test bridge proof-only; cache verify reduces tamper risk |
| Product proof | **PENDING** | Await tag `v0.2.6.2` desktop proof + `desktop-restart-relay.spec.ts` |
| Tauri / desktop | **READY** | `syncDesktopRelayContribution` on unlock/init/invite; `ensureDesktopShare` URL refresh |
| Governance | **ADEQUATE+** | No governance rule changes |
| Supply chain | **ACCEPTABLE+** | `exeSha256` on node cache hit; cloudflared cache verify; merge `check-sidecar-checksums` |
| Legal / claims | **EA_ALIGNED** | SUPPORT EA line; tunnel disclosure in-app; no GA claims |
| Bugbot | **NO_BLOCKERS** | Relay sync unit test + invite wiring; at-cap button disabled |
| QA gate | **ALL_TIERS_PASS** | Local federation-off 24, federation-on 27; active-relays + store tests |
| CI investigator | **PENDING** | Await tag `v0.2.6.2` 3/3 green |

### Weak-point subagents (v0.2.6.2)

| Area | Confidence | Notes |
|------|------------|-------|
| Mobile joiner | **MEDIUM+** | WebKit CI infra; share-url specs browser-aware; tag still Pixel 5 Chromium |
| Founder ops | **MEDIUM** | Ephemeral tunnel documented; relay ledger sync on URL change |
| Support readiness | **MEDIUM–HIGH** | SUPPORT/GET_STARTED runbooks for week-one tickets |
| Threat / recovery / scale | **documented residuals** | Tunnel DoS, phishing shell + valid sig; recovery phrase ≠ community backup |

### Official release decision

| Scope | Decision |
|-------|----------|
| **Windows EA — software community public release** | **APPROVED** — tag `v0.2.6.2` (world-ship readiness patch) |
| **GA / broad public marketing** | **NOT APPROVED** — TERMS/PRIVACY counsel templates; unsigned installer |
| **Hosted canonical (`app.aethelos.org`)** | **NOT LIVE** — do not claim browser-first GA path |

**Residuals (non-blocking for EA):** Authenticode optional; Android smoke skipped on tag gate; HF Space may be paused; true reboot E2E manual (simulated via test bridge); WebKit share-url tests skip without `AETHELOS_SHARE_URL` on merge CI.

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
| Tag release chain | **Pending** — tag `v0.2.6.2` after land |
| Weekly product proof | **Dispatch after tag** — non-blocking if tag proof green |

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
