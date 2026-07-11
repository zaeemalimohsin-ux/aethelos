# Engineering sign-off

Single entry point for distribution readiness and audit residuals. Supersedes [Pass 4 audit](./archive/CODEBASE_AUDIT_PASS4.md) and [Distribution scorecard](./archive/DISTRIBUTION_SCORECARD.md) for day-to-day sign-off.

**Last updated:** 2026-07-11 (v0.2.1 ship)

---

## Executive summary (Pass 4)

Pass 4 verified realistic user and operator failure modes. Several **P1 issues were fixed** (misleading vote math, silent reducer rejections, doc/UI lies, SW confirm(), modal focus, nginx headers, Tauri health-probe CSP). **Release pipeline and federation wizard UX** remain documented gaps — not hidden.

**Signs off** v0.1.x+ for honest failure messaging, threat-model alignment on invite shell and relay limits, and non-dev doc accuracy.

**Does not sign off:** signed desktop releases, federation lay UX, full import causal validation, true fracture E2E, CI desktop proofs (see proof tiers below).

Full Pass 4 detail: [archive/CODEBASE_AUDIT_PASS4.md](./archive/CODEBASE_AUDIT_PASS4.md).

---

## Open gaps (from Pass 4)

| Area | Status |
|------|--------|
| Dual-fork causal validation on import | Open — import skips invalid sigs |
| Relay sinceHash filter | Open (M3) |
| Optimistic action toasts without reducer feedback | P2 partial |
| SyncEngine ws errors silent | P2 documented |
| No React error boundary | P3 |
| Tauri updater / release CI | No signing pipeline |
| Federation lay UX | Documented gap |

---

## Distribution composite (Charter A v1)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Desktop | 76 | Windows proof path; Authenticode deferred |
| Mobile / PWA | 73 | Share-url env-gated; Android optional in CI |
| Web hosted | 78 | Nightly hosted-preflight on canonical URL |
| Security | 77 | Residuals documented |
| P2P / sync | 84 | Tier 2c/2d + mesh tests |
| Test / CI | 84 | Tiers 1–3 on merge; product-proof weekly |
| Docs | 74 | Runbooks consolidated |
| Release gates | 69 | verify:release + docker-founder |
| Governance traceability | 86 | 0 Partial in philosophy matrix |
| Ops runbooks | 74 | Relay + hosted smoke documented |

| Metric | Value |
|--------|-------|
| **Composite (10 dims, excl. i18n)** | **77.5** |
| **Target** | **≥ 75** |
| **Verdict** | **PASS** |

i18n (report-only, not in composite): 46 — English-primary.

Full scorecard history: [archive/DISTRIBUTION_SCORECARD.md](./archive/DISTRIBUTION_SCORECARD.md).

---

## Proof tiers

Run and interpret release gates via [TESTING_RELEASE.md](./TESTING_RELEASE.md) (tiers 1–5). CI on every merge covers tiers 1–3; weekly product-proof and optional desktop:proof cover higher tiers on Windows.

**Local verification (2026-07-11):** encoding, typecheck, lint, format, 272 unit + E2E tests (80 chromium, 20 federation-off including onboarding specs).

**Product proof (2026-07-11, Windows, -SkipAndroid):** PASS — dev + release share URL, mobile E2E.

---



## Ship status (v0.2.1)

| Path | Status |
|------|--------|
| Windows installer (GitHub Releases) | **Ready** after 0.2.1 tag build |
| Browser demo (pp.aethelos.org / HF Space) | **Blocked** — HF Space PAUSED (flagged abusive); operator must unpause |
| Self-host / docker compose | Ready — see [PUBLISHER.md](./PUBLISHER.md) |
## Related

- [PHILOSOPHY_TRACEABILITY.md](./PHILOSOPHY_TRACEABILITY.md) — philosophy automation matrix
- [PRODUCT.md](./PRODUCT.md) — known limitations (50 members, federation off)
- [OPERATIONS.md](./OPERATIONS.md) — hosted nightly preflight
