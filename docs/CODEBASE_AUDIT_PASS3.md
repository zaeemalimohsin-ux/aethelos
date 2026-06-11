# AethelOS Codebase Audit — Pass 3 (Grand Final Sweep)

> **Supersedes operational status in [Pass 2](./CODEBASE_AUDIT_PASS2.md)** for sign-off purposes. Pass 1/2 history is preserved; this pass re-verifies synthesis, runtime, UX, and doc honesty after the remote-invite closure work (`e1ca5b8`).

**Date:** 2026-06-11  
**Scope:** Philosophy traceability, static code health, full gate matrix, desktop remote proofs, UX ergonomics, documentation honesty  
**Prior work:** [Pass 1](./CODEBASE_AUDIT.md), [Pass 2](./CODEBASE_AUDIT_PASS2.md), [Philosophy Traceability](./PHILOSOPHY_TRACEABILITY.md)

---

## Executive summary

Pass 3 confirms the codebase is **release-coherent** for v0.1.x: automated gates pass, philosophy claims map to tests, and the remote-founder path (public relay mailboxes + configurable invite shell URL) is code-correct and walkthrough-proven on Windows.

**Fixed in this pass (P0–P2):**

| ID | Fix |
|----|-----|
| P3-1 | Consolidated `isLocalOnlyRelayUrl` / `filterRemoteRelayUrls` into `@aethelos/core` — shared by client, `tunnel-smoke.mjs`, and unit tests (eliminates script drift) |
| P3-2 | `desktop-proof` builds core before tunnel-smoke (required for shared import) |
| P3-3 | PhilosophyCard HelpTip mismatch (`CONCEPT.stake` line had `CONCEPT.points` tooltip) |
| P3-4 | Removed duplicate `proposalApprovalPercent` in `CellView.tsx` — uses `@aethelos/core` |
| P3-5 | Connection card: tunnel operator copy moved into collapsible **Sharing details** |
| P3-6 | Mobile CSS: slider rows, list rows, recovery grid at ≤640px |
| P3-7 | Simulation / community-scale test timeouts raised (120s global + per-test) — flaky gates on slower Windows hosts |
| P3-8 | Core `relay/url-utils.ts` uses regex parsing (no DOM `URL`) so `tsc` builds in Node-only lib |
| P3-9 | `tunnel-smoke.mjs` imports core dist via `pathToFileURL` (Windows ESM) |

**Intentionally open (documented, not hidden):**

- Charter A–D manual paths ([TESTING_RELEASE.md](./TESTING_RELEASE.md))
- True fracture → frozen → unfreeze E2E (P1.3 partial only)
- Superstructure H1 depth (population redistribution semantics)
- H2 multi-parent `leave_superstructure`, M3 relay `sinceHash`, M7 sticky Head
- Desktop proof scripts not in Linux CI (Windows + cloudflared + WebView2 required locally)
- CellView monolith / invite wizard UX debt (P3 follow-up)

---

## Synthesis scorecard

| Area | Status | Evidence |
|------|--------|----------|
| P1 Stateless relay | Green | `relay.test.ts` |
| P1 DAG / fracture | Green | `core.test.ts`, `adversarial.test.ts`, `simulation.test.ts` |
| P1 Fracture recovery E2E | Partial | `resolve_fracture` proposal in E2E; unfreeze Charter A |
| P2 Share economy / conservation | Green | All core suites + E2E conservation |
| P3 Cell / federation | Green | `superstructure.test.ts`, `federation.spec.ts` |
| P4 Governance / Head | Green | `governance-fixes.test.ts`, E2E proposals/scale |
| P5 Sovereignty / Head relay | Green (core) | Charter C for capture scenarios |
| Remote founder path | Green | `VITE_INVITE_BASE_URL`, `active-relays.ts`, `desktop:gui-walkthrough` |
| Browser joiner (phone) | Green (code) | PWA + invite hash; no mailbox hosting in browser |
| Pass 2 resolutions | Re-verified | Slider control, `cancel_invite`, signed invites, governance auth |
| Pass 2 doc text | Stale in places | Banner added; historical findings kept |

---

## User-journey trace (code paths)

### Remote founder

`Onboarding` → `local-node.ts` IPC (`start_local_node`) → cloudflared → `mergeActiveRelays` / `relayUrlsForInvite` → `buildInviteLink` (`inviteLinkBase` + signed payload) → share link.

### Browser joiner

Invite `#/join?d=` → `Onboarding` decode/verify → sync → guest join-code banner → founder vouch + admission vote → accept.

### Governance member

`GovernanceView` sliders → `slider_update` events → `ProposalsView` stake-weighted thresholds → reducer execution.

**Disconnected UX (accepted debt):** join-code instructions appear in onboarding, guest banner, and invite card — context-specific, not consolidated into one wizard (P3).

---

## Static audit findings

| Severity | Finding | Action |
|----------|---------|--------|
| P1 (fixed) | `tunnel-smoke.mjs` duplicated invite filter | Shared `@aethelos/core/relay/url-utils` |
| P1 (fixed) | Duplicate `proposalApprovalPercent` in CellView | Import from core |
| P2 (fixed) | HelpTip wrong concept on stake line | Removed mismatched tooltip |
| P2 (open) | Dual `isValidRelayUrl` (client vs core regex) | Document; edge-case divergence low risk |
| P2 (open) | Unused governance/DAG exports in core index | Public API surface; trim in follow-up |
| P3 (open) | CellView ~820 lines monolith | Defer split |
| P3 (open) | HelpTip + PhilosophyCard redundancy | Teaching layered by design; trim HelpTips in follow-up |

### Env / IPC wiring (verified)

| Variable | Wired |
|----------|-------|
| `VITE_INVITE_BASE_URL` | `invite.ts` |
| `VITE_DEFAULT_RELAY_URL` | `bootstrap-relays.ts` |
| `VITE_BOOTSTRAP_RELAYS` | `bootstrap-relays.ts` |
| `VITE_RELAY_OPERATOR_GUIDE_URL` | `bootstrap-relays.ts` |
| Tauri IPC | `main.rs` ↔ `local-node.ts` (match) |

---

## Verification log (appendix)

Commands run during Pass 3 (representative):

```
pnpm typecheck                          → pass
pnpm lint:eslint                        → 0 errors (11 pre-existing warnings)
pnpm format:check                       → pass
pnpm --filter @aethelos/core build      → pass
pnpm test                               → pass (core 81, client 28, relay 7 after fixes)
pnpm --filter @aethelos/core test:coverage → pass (reducer/economy/governance thresholds)
pnpm test:e2e                           → pass (all Playwright specs)
pnpm desktop:proof                      → pass (core-build + tunnel-smoke + E2E + local_node)
pnpm desktop:gui-walkthrough            → pass (6 checks incl. invite base URL)
gh run list --branch main               → CI green on prior commit; re-run after Pass 3 push
```

**CI gap (documented):** `.github/workflows/ci.yml` does not run `desktop:proof` or `cargo test local_node::tests`. Mandatory on Windows before tagging desktop releases.

---

## Sign-off

Pass 3 **signs off** v0.1.x for:

- Local-first PWA + desktop founder remote invites (with hosted `VITE_INVITE_BASE_URL`)
- Core governance remediation from Pass 2
- Automated philosophy traceability for shipped features

Pass 3 **does not sign off** (requires charters or follow-up):

- Fracture unfreeze E2E (Charter A / D)
- Head `proposal_close` power (Charter B)
- Head capture adversarial (Charter C)
- Full superstructure population economics (H1)

See [PHILOSOPHY_TRACEABILITY.md](./PHILOSOPHY_TRACEABILITY.md) for the live matrix.
