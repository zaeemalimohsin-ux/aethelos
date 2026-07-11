# Engineering sign-off

Single entry point for distribution readiness and audit residuals. Supersedes [Pass 4 audit](./archive/CODEBASE_AUDIT_PASS4.md) and [Distribution scorecard](./archive/DISTRIBUTION_SCORECARD.md) for day-to-day sign-off.

**Last updated:** 2026-07-11 (v0.2.2: federation on in production builds; P0 test coverage closed)

---

## Distribution readiness verdict (2026-07-11)

| Pillar | Ready? | Notes |
|--------|--------|-------|
| Windows installer | **Yes** | v0.2.2 ships federation-on; [v0.2.1](https://github.com/zaeemalimohsin-ux/aethelos/releases/tag/v0.2.1) lacked linked-chapter UI |
| Merge CI (tiers 1–3) | **Green** (after `27d19df`) | Prettier fix on `operator-hosting.mjs` |
| Product proof (local) | **Yes** | `pnpm proof:product -SkipAndroid` passed |
| Canonical browser URL | **No** | `app.aethelos.org` NXDOMAIN; `aethelos.fly.dev` not deployed; HF Space PAUSED |
| Interim public demo | **Yes** | trycloudflare tunnel — preflight PASS (2026-07-11) |
| Hosting automation | **Wired** | `operator-hosting` + Playwright headed browser; Fly OAuth blocked on GitHub login |
| Nightly hosted-preflight | **Expected fail** | Targets `app.aethelos.org` until DNS + host live |

**Overall:** **Desktop distribution-ready. Web canonical distribution not ready** until Fly or Render deploy completes and DNS points `app` subdomain.

## Executive summary (Pass 4)

Pass 4 verified realistic user and operator failure modes. Several **P1 issues were fixed** (misleading vote math, silent reducer rejections, doc/UI lies, SW confirm(), modal focus, nginx headers, Tauri health-probe CSP).

**Signs off** v0.2.2+ for honest failure messaging, federation-on production builds, P0 recovery/import paths (store + lost-device E2E), threat-model alignment on invite shell and relay limits, and non-dev doc accuracy.

**Does not sign off:** signed desktop releases (Authenticode), canonical browser URL (`app.aethelos.org`), dual-fork import validation beyond causal chain, true fracture E2E, CI desktop proofs (see proof tiers below).

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
| Federation lay UX | **Addressed in v0.2.2** — federation on in production; at-cap linked-chapter E2E |
| Expulsion fund-flow (no-parent path) | **Addressed** — `expel-fund-flow.test.ts` |
| Superstructure guard rails | **Addressed** — `superstructure-guards.test.ts`, `legacy-events.test.ts` |
| Lost-device recovery UI | **Addressed** — happy path + invalid/empty/orphan import toasts in `lost-device-recovery.spec.ts`; store wrapper in `recovery-import.test.ts` |

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

**Local verification (2026-07-11):** encoding, typecheck, lint, format, unit + E2E tests (80 chromium federation-on, 20 federation-off onboarding, 20 federation-on onboarding tier 2c-bis).

**Product proof (2026-07-11, Windows, -SkipAndroid):** PASS — dev + release share URL, mobile E2E.

---



## Ship status (v0.2.2)

| Path | Status |
|------|--------|
| Windows installer (GitHub Releases) | **v0.2.2** — federation on (`VITE_ENABLE_FEDERATION=1` in production build) |
| Merge CI (tiers 1–3) | **Green** — [run 29147917038](https://github.com/zaeemalimohsin-ux/aethelos/actions/runs/29147917038) |
| GHCR container publish | **Green** — `ghcr.io/zaeemalimohsin-ux/aethelos:latest` (package visibility API 404; image push succeeds) |
| Fly.io deploy automation | **Wired** — skips until `FLY_API_TOKEN` secret set → `https://aethelos.fly.dev` |
| Browser demo (app.aethelos.org / HF Space) | **Blocked** — HF Space PAUSED (abusive flag); v0.2.2 GHCR image includes federation-on client; unpause or email HF support (docs/operator/hf-abuse-appeal-email.txt). New Docker Spaces require HF PRO. |
| Namecheap DNS (`app` subdomain) | **Not configured** — see [operator/namecheap-dns-app.md](./operator/namecheap-dns-app.md) |
| Self-host / Render / docker compose | Ready — [PUBLISHER.md](./PUBLISHER.md), [render.yaml](../render.yaml) |

## Related

- [PHILOSOPHY_TRACEABILITY.md](./PHILOSOPHY_TRACEABILITY.md) — philosophy automation matrix
- [PRODUCT.md](./PRODUCT.md) — known limitations (50 per chapter, federation on)
- [OPERATIONS.md](./OPERATIONS.md) — hosted nightly preflight
