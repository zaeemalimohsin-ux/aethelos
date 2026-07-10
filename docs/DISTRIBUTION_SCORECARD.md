# Distribution scorecard (v1 Charter A)

**Date:** 2026-07-11  
**Scope:** Charter A — new-member journey on supported distribution paths only.

## v1 Charter A scope

| Area | In scope |
|------|----------|
| **Browser PWA** | Canonical hosted entry: `https://app.aethelos.org` (health, app shell, `/ws`) |
| **Windows desktop** | Tauri installer, sidecar relay, tunnel/share URL product proof |
| **Docker publish** | Same-origin nginx `/ws` path (`docker-founder`, combined publish stack) |
| **Philosophy matrix** | [PHILOSOPHY_TRACEABILITY.md](./PHILOSOPHY_TRACEABILITY.md) — **0 Partial** rows (all claims Covered or honestly listed under Known residuals) |
| **CI / proof tiers** | [TESTING_RELEASE.md](./TESTING_RELEASE.md) tiers 1–5: CI core, local/pilot-off E2E, sync mesh, publish path, Windows `proof:product` (+ optional tier 5 desktop deep) |

## Out of scope (v1 scorecard)

- Legal, compliance, and store policy review
- App Store / Play Store distribution
- macOS and Linux desktop installers
- Full i18n / locale coverage (report-only dimension below)
- Authenticode signing until a production cert exists
- Operating a multi-region relay fleet beyond documented operator runbooks

## Dimensions (11)

| # | Dimension | What we measure |
|---|-----------|-----------------|
| 1 | Desktop | Windows installer, update path, desktop proof hooks |
| 2 | Mobile / PWA | Installable PWA, mobile E2E / share-url where env-gated |
| 3 | Web hosted | `app.aethelos.org` admission, shell, nightly hosted-preflight |
| 4 | Security | Crypto identity, relay threat model, honest residuals |
| 5 | P2P / sync | Mesh, outbox, relay switch, partition recovery tests |
| 6 | Test / CI | Tier coverage per TESTING_RELEASE.md on every merge / nightly |
| 7 | Docs | Operator, testing, philosophy traceability freshness |
| 8 | i18n | **Report-only** — coverage noted; not a v1 gate |
| 9 | Release gates | `verify:release`, version sync, changelog discipline |
| 10 | Governance traceability | Philosophy matrix + governance E2E alignment |
| 11 | Ops runbooks | RELAY_OPERATORS, OPERATIONS, incident template |

## Relevance veto

A finding counts toward this scorecard **only** if it cites at least one of:

1. A **CI proof tier** from [TESTING_RELEASE.md](./TESTING_RELEASE.md) (tier number or named job), or  
2. A **philosophy matrix row** (P*.* ID and status), or  
3. A bullet under **Known residuals** in [PHILOSOPHY_TRACEABILITY.md](./PHILOSOPHY_TRACEABILITY.md).

Otherwise label the finding **out-of-context** or **v2** — do not adjust the v1 composite.

## Results (placeholder)

| Dimension | Score (0–10) | Notes |
|-----------|--------------|-------|
| Desktop | 7 | Windows proof path; Authenticode deferred |
| Mobile / PWA | 7 | Share-url env-gated; Android optional in CI |
| Web hosted | 8 | Nightly `hosted-preflight` on canonical URL |
| Security | 7 | Residuals documented; no fleet hardening score |
| P2P / sync | 8 | Tier 2c/2d + nightly mesh jobs |
| Test / CI | 8 | Tiers 1–3 required on merge |
| Docs | 7 | Runbooks consolidated; scorecard new |
| i18n (report-only) | 5 | English-primary; not a release blocker |
| Release gates | 7 | `verify:release` + docker-founder |
| Governance traceability | 8 | 0 Partial in philosophy matrix |
| Ops runbooks | 7 | Relay + hosted smoke documented |

| Metric | Value |
|--------|-------|
| **Composite (weighted placeholder)** | **~73** |
| **Target** | **≥ 75** |
| **Next review** | After hosted deploy or tier-4 proof changes |
