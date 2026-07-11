> **Superseded.** Current sign-off: [ENGINEERING_SIGNOFF.md](../ENGINEERING_SIGNOFF.md).

# Distribution scorecard (v1 Charter A)

**Date:** 2026-07-11  
**Scope:** Charter A - new-member journey on supported distribution paths only.

## v1 Charter A scope

| Area | In scope |
|------|----------|
| **Browser PWA** | Canonical hosted entry: `https://app.aethelos.org` (health, app shell, `/ws`) |
| **Windows desktop** | Tauri installer, sidecar relay, tunnel/share URL product proof |
| **Docker publish** | Same-origin nginx `/ws` path (`docker-founder`, combined publish stack) |
| **Philosophy matrix** | [PHILOSOPHY_TRACEABILITY.md](../PHILOSOPHY_TRACEABILITY.md) - **0 Partial** rows (all claims Covered or honestly listed under Known residuals) |
| **CI / proof tiers** | [TESTING_RELEASE.md](../TESTING_RELEASE.md) tiers 1-5: CI core, local/federation-off E2E, sync mesh, publish path, Windows `proof:product` (+ optional tier 5 desktop deep) |

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
| 8 | i18n | **Report-only** - coverage noted; not a v1 gate |
| 9 | Release gates | `verify:release`, version sync, changelog discipline |
| 10 | Governance traceability | Philosophy matrix + governance E2E alignment |
| 11 | Ops runbooks | RELAY_OPERATORS, OPERATIONS, incident template |

## Relevance veto

A finding counts toward this scorecard **only** if it cites at least one of:

1. A **CI proof tier** from [TESTING_RELEASE.md](../TESTING_RELEASE.md) (tier number or named job), or  
2. A **philosophy matrix row** (P*.* ID and status), or  
3. A bullet under **Known residuals** in [PHILOSOPHY_TRACEABILITY.md](../PHILOSOPHY_TRACEABILITY.md).

Otherwise label the finding **out-of-context** or **v2** - do not adjust the v1 composite.
## Results (2026-07-11 evaluation)

| Dimension | Score (0-100) | Notes |
|-----------|---------------|-------|
| Desktop | 76 | Windows proof path; Authenticode deferred |
| Mobile / PWA | 73 | Share-url env-gated; Android optional in CI |
| Web hosted | 78 | Nightly `hosted-preflight` on canonical URL |
| Security | 77 | Residuals documented; no fleet hardening score |
| P2P / sync | 84 | Tier 2c/2d on merge CI; offline/outbox E2E stabilized (`48e9b7f`) |
| Test / CI | 84 | Tiers 1-3 on merge; product-proof workflow stabilized (`48e9b7f`) |
| Docs | 74 | Runbooks consolidated; scorecard evaluated |
| i18n (report-only) | 46 | English-primary; **not in composite** |
| Release gates | 69 | `verify:release` + docker-founder |
| Governance traceability | 86 | 0 Partial in philosophy matrix |
| Ops runbooks | 74 | Relay + hosted smoke documented |

| Metric | Value |
|--------|-------|
| **Composite (10 dims, excl. i18n)** | **77.5** |
| **Target** | **≥ 75** |
| **Verdict** | **PASS** |
| **Prior baseline** | ~73 (placeholder); uplift partly from `48e9b7f` test/CI and P2P fixes |
| **Next review** | After GA content phase + hosted deploy gate |

## GA content phase (2026-07-11)

Pilot/beta framing retired in user docs and app copy. Added PRODUCT, PRIVACY, TERMS, SUPPORT; CONTRIBUTING; deploy gate on HF after CI. Federation remains off in standard production builds; 50-member limit copy is honest. Re-score external GA readiness after counsel review of legal skeleton.

## v2 roadmap (out-of-context for v1 composite)

- Legal, compliance, and store policy review ahead of App Store / Play distribution
- macOS and Linux desktop installers
- Full i18n / locale coverage beyond English-primary (v1 reports **46** report-only)
- Authenticode signing once a production code-signing cert exists
- Multi-region relay fleet operations beyond current operator runbooks
