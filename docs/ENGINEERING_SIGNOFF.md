# Engineering sign-off

Single entry point for distribution readiness and audit residuals. Supersedes [Pass 4 audit](./archive/CODEBASE_AUDIT_PASS4.md) and [Distribution scorecard](./archive/DISTRIBUTION_SCORECARD.md) for day-to-day sign-off.

**Last updated:** 2026-07-12 (v0.2.6: Windows EA — green desktop CI, invite fail-closed, doc alignment)

---

## Distribution readiness verdict (2026-07-12)

| Pillar | Ready? | Notes |
|--------|--------|-------|
| **Windows EA (software community)** | **Yes** | v0.2.6 — installer, public share URL, signed invites, federation, full tag CI chain |
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
| Dual-fork causal validation on import | **Accepted residual** — import keeps both causal branches; documented in GET_STARTED recovery section |
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

**Local verification (2026-07-12):** encoding, typecheck, lint, format, unit + E2E tests.

**Product proof (2026-07-12, Windows, -SkipAndroid):** PASS — release exe → trycloudflare → share-url E2E.

## v0.2.6 reassessment board (2026-07-12)

| Agent | Verdict |
|-------|---------|
| Security review | **SHIP** |
| Product proof | **PASS** — tag CI run 29182842076 (release exe + cold invite E2E) |
| Tauri / desktop | **READY** — fail-closed invites, harness PLATFORM fix |
| Governance | **ADEQUATE** — dual-fork test tightened; expel-escrow unchanged |
| Supply chain | **ACCEPTABLE** — esbuild lockfile ≤2 entries |
| Legal / claims | **EA-aligned** — TERMS, GET_STARTED, PRODUCT caveats |
| Bugbot | Skipped (subagent unavailable) |
| QA gate | **PASS** — unit + federation tiers green on tag CI |
| CI investigator | **3/3 green** — run 29182842076 published `AethelOS_0.2.6_x64-setup.exe` |

---

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
