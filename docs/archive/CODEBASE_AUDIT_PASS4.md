> **Superseded.** Current sign-off: [ENGINEERING_SIGNOFF.md](../ENGINEERING_SIGNOFF.md).

# AethelOS Codebase Audit — Pass 4 (Fresh-Lens Verification)

> **Supersedes operational sign-off in [Pass 3 (archive)](./CODEBASE_AUDIT_PASS3.md).** Pass 4 uses orthogonal lenses: threat crosswalk, error contracts, storage drills, persona docs, a11y, release honesty.

**Date:** 2026-06-11  
**Baseline commit:** Pass 3 at `31e0b05`  
**Scope:** Threat model, silent failures, IndexedDB import, offline/PWA, non-dev docs, reducer–UI truth, a11y, deploy/release reality

---

## Executive summary

Pass 4 verified **realistic user and operator failure modes** Pass 3 did not cover. Several **P1 issues were fixed** (misleading vote math, silent reducer rejections, doc/UI lies, SW `confirm()`, modal focus, nginx headers, Tauri health-probe CSP). **Release pipeline and federation wizard UX** remain documented gaps — not hidden.

---

## Threat model delta

| Trust boundary | Status | Action |
|----------------|--------|--------|
| Signed invite payload | Covered (core + client tests) | — |
| Invite shell URL (`VITE_INVITE_BASE_URL`) | Documented | Updated [`THREAT_MODEL.md`](../THREAT_MODEL.md) |
| Ephemeral trycloudflare mailboxes | Documented | THREAT_MODEL |
| Bridge/federation secondary sync | Documented | THREAT_MODEL |
| Relay-only rate limits vs client outbox | Documented | THREAT_MODEL |
| CSP `style-src unsafe-inline` | Clarified in THREAT_MODEL | Matches `_headers` |
| E2E test bridge in prod | Verified gated by `VITE_E2E` | Document only |

---

## Error contract findings

| Issue | Severity | Resolution |
|-------|----------|------------|
| Reducer rejections logged DEV-only | P1 | Production toasts via `rejection-messages.ts` + `NodeController.onRejected` |
| Pending invite vote % used vote-count ratio | P0 | Fixed — stake-weighted like `ProposalsView` |
| Optimistic action toasts without reducer feedback | P2 | Partially improved via rejection toasts; full contract still open |
| `SyncEngine` ws errors silent | P2 | Documented; Connection card remains primary surface |
| No React error boundary | P3 | Documented |

---

## Storage disaster drills

| Drill | Result |
|-------|--------|
| Invalid JSON import | Throws `invalid_json` — unit test added |
| Non-array JSON import | Throws `invalid_log_format` — unit test added |
| Dual-fork causal validation on import | **Open** — import skips invalid sigs but does not run `validateCausalChain` |
| Relay `sinceHash` filter | **Open (M3)** — server excludes one id, not true “since” cursor; document only |

---

## Offline / PWA chaos matrix

| Scenario | Behavior |
|----------|----------|
| Relay down, shell cached | Outbox queues; SyncIndicator shows offline + badge |
| SW update available | **Fixed** — in-app banner replaces blocking `confirm()` |
| WS NetworkOnly in Workbox | Correct — relay requires network |

---

## Persona doc fixes (P1)

Updated [`USER_GUIDE.md`](../USER_GUIDE.md):

- Join path with join code + vouch (not “tap Accept” immediately)
- **Connection** tab naming (was “Relays”)
- Desktop founder pointer to [GET_STARTED.md](../GET_STARTED.md)
- SW reload banner documented

[`TESTING_RELEASE.md`](../TESTING_RELEASE.md): added Windows desktop proof checklist items.

---

## Reducer vs UI truth table

| Topic | Fix |
|-------|-----|
| Soft cap at 50 | Unified “at capacity → sub-communities” copy in banner + invite card |
| Frozen account | Danger alert with path to **Proposals** |
| Head election | `CONCEPT.head` softened — challenger must reach vouch threshold |
| Pending invite vote display | Stake-weighted % aligned with threshold |

---

## A11y scorecard

| Item | Status |
|------|--------|
| Modal focus trap | **Fixed** |
| Sync status live region | **Fixed** (`role="status"`, `aria-live="polite"`) |
| Proposal progress bar | **Fixed** (`role="progressbar"`) |
| HelpTip / PhilosophyCard overlap | Open P3 — 56% concept overlap |
| Mobile Playwright | **Added** `mobile-layout.spec.ts` + Pixel 5 project |

---

## Release / deploy honesty

| Asset | Reality |
|-------|---------|
| Tauri updater | Inactive; `releases.example.org` placeholder — README corrected |
| Release CI | No `tauri build` / signing pipeline |
| Client Docker | Orphan of compose — **nginx CSP headers aligned** with `_headers` |
| Tauri CSP | **Fixed** — `http:`/`https:` for relay `/healthz` probes |
| `.env.production` | **Warning** comment for empty bootstrap pool |

---

## Observability and performance (baseline)

- Client: rejection toasts added; no structured diagnostics export (P3)
- Relay: `/metrics` only
- Production build (2026-06-11): main bundle **328 kB** (110 kB gzip), CSS **10 kB**, reducer worker **41 kB**, PWA precache **381 kB**; `sourcemap: true` in vite — deploy choice, no CI size gate yet

---

## Verification log

```
pnpm typecheck                          → pass
pnpm lint:eslint                        → 0 errors (11 pre-existing warnings)
pnpm format:check                       → pass
pnpm test                               → pass (core 81 / client 30 / relay 7)
pnpm test:e2e                           → pass (40/40 incl. mobile-layout + Pixel 5)
pnpm --filter @aethelos/client build    → pass (328 kB JS, 110 kB gzip)
pnpm desktop:proof                      → pass (tunnel-smoke + two-person E2E + Tauri local_node)
pnpm desktop:gui-walkthrough            → pass (Windows, remote friend sync over tunnel)
```

**Charter A/D:** Manual prerequisite (hosted PWA + desktop founder) — not automated in CI.

---

## Sign-off

Pass 4 **signs off** v0.1.x for honest failure messaging, threat-model alignment on invite shell and relay limits, and non-dev doc accuracy.

Pass 4 **does not sign off:** signed desktop releases, federation lay UX, full import causal validation, true fracture E2E, CI desktop proofs.

See [PHILOSOPHY_TRACEABILITY.md](../PHILOSOPHY_TRACEABILITY.md) for philosophy automation matrix.
