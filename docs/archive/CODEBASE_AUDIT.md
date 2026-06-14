# AethelOS Codebase Audit — Pass 1

> **Status (2026-06-11):** Critical items **C1–C4** from this pass were resolved in [Pass 2 resolutions](./CODEBASE_AUDIT_PASS2.md#resolutions-implemented-2026-06-09). **Sign-off:** see [Pass 3](./CODEBASE_AUDIT_PASS3.md). Read findings below as historical context.

> **Note (2026-06-09):** This pass predates Peer Relay Mesh and expanded E2E coverage. Current suite: 10 core test files, 9+ client unit files, 5 Playwright E2E specs. See audit remediation in repo history.

**Date:** 2026-06-09  
**Scope:** Full monorepo review (`packages/core`, `packages/client`, `packages/relay`, `packages/client-tauri`, docs)  
**Tests at review time:** 23/23 passing in `packages/core` (vitest)  
**Follow-up:** [Pass 2 audit](./CODEBASE_AUDIT_PASS2.md) — client/sync/economy edge cases + runtime-verified bugs  
**Fixes:** See [Resolutions implemented](./CODEBASE_AUDIT_PASS2.md#resolutions-implemented-2026-06-09) in Pass 2 (27 core tests passing)

This is a static + test-baseline audit. Items marked **Verified by tests** have automated coverage; others are from code review only.

---

## Executive summary

The **deterministic core** (DAG ordering, fracture detection, integer conservation, vouch-bond economics) is the strongest part of the codebase and is well tested. The **client PWA** is a coherent product shell for single-Cell use.

The largest gaps are **governance authorization in the reducer** (events that bypass the proposal system), **incomplete superstructure implementation** (philosophy vs code), **proposal voting integrity**, and **import/sync edge cases** in the client. Several **dead or divergent code paths** remain from earlier iterations.

---

## Critical — logical / security bugs

### C1. Proposal votes can be stacked (no one-vote-per-member enforcement)

**Location:** `packages/core/src/reducer/index.ts` — `proposal_vote` handler  
**Issue:** Each `proposal_vote` adds the voter's full balance to `votesFor` or `votesAgainst` with no record of prior votes. A member can approve the same proposal repeatedly and unilaterally reach threshold.  
**Impact:** Governance is not trustworthy; expulsion, unfreeze, and superstructure proposals can be passed by a single actor spamming votes.  
**Tests:** None covering this path.

### C2. Direct `expel` event bypasses governance

**Location:** `packages/core/src/reducer/index.ts` — `case "expel"`  
**Issue:** Any unfrozen member can emit `expel` and immediately run `expelMemberReducer` — no proposal, no vote threshold, no Head involvement.  
**Impact:** A malicious or compromised member key can expel anyone instantly. UI only exposes expulsion via proposals, but the wire protocol allows the direct event.  
**Philosophy mismatch:** Docs say expulsion is Share-weighted vote via proposals.

### C3. `freeze_resolve` is unauthenticated

**Location:** `packages/core/src/reducer/index.ts` — `case "freeze_resolve"`  
**Issue:** Any unfrozen member can `unfreeze` a fractured account or `confirm_expel` (runs full expulsion) with no Head check, proposal, or vote.  
**Impact:** Fracture social resolution can be overridden or weaponized by any member.

### C4. `join_superstructure` / `leave_superstructure` bypass proposal + Head rules

**Location:** Reducer + `packages/client/src/features/ProposalsView.tsx`  
**Issue:**  
- Reducer accepts direct `join_superstructure` from any member (`canInitiateSuperstructureProposal` in governance is never enforced in reducer).  
- UI exposes a one-click **Join** button that calls `joinSuperstructure` directly, not via proposal.  
- `tryExecuteProposal` has empty `break` for `join_superstructure` / `leave_superstructure` — approved proposals **do nothing**.  
**Impact:** Superstructure membership changes are neither gated nor executed through the documented governance flow.

---

## High — broken or incomplete features

### H1. Superstructure layer is mostly scaffolding

**Locations:** `packages/core/src/reducer/index.ts`, `packages/core/src/governance/index.ts`, client  
**Issues:**  
| Claim (philosophy/docs) | Reality in code |
|-------------------------|-----------------|
| Superstructure has its own Pool | `superstructureId` on `PoolState` is never set; no separate namespace reducer loop in client |
| Inter-structure bridging | `bridge_transaction` runs `transferPoints` **inside the same Cell namespace**; `superstructureId` in payload is ignored |
| Population-weighted superstructure redistribution | `computeSuperstructureRedistribution()` exists but is **never called** from reducer or client |
| Head relays slider averages upward | Not implemented |
| Escrow flows to parent Pool | `superstructureEscrow` accumulates locally but nothing consumes/distributes it upward |

**Impact:** Multi-layer federation described in `Higher-Level-Philosophy.md` and `docs/GENESIS.md` cannot be operated end-to-end.

### H2. `leave_superstructure` revokes all bridge roles

**Location:** `packages/core/src/reducer/index.ts` — `case "leave_superstructure"`  
**Issue:** Leaving one parent removes the author from `bridges` entirely, even if they remain in other `parentSuperstructures`.  
**Impact:** Incorrect state for Cells joined to multiple superstructures.

### H3. Head "close proposal" UI is non-functional

**Location:** `packages/client/src/features/ProposalsView.tsx`  
**Issue:** Badge says "Head can close" but there is no button calling `proposal_close`; `NodeController` has no `closeProposal` method.  
**Impact:** Documented Head power is unavailable in the product.

### H4. Event log import has no validation (client)

**Location:** `packages/client/src/storage/event-log.ts` — `importEventLog`  
**Issue:** Parses JSON and writes to IndexedDB without signature verification, namespace filtering, or schema validation. Exported from `packages/client/src/index.ts` but no UI — still a footgun for integrators.  
**Impact:** Poisoned logs could be persisted; reduction may silently skip invalid events or produce unexpected state.

---

## Medium — sloppy / inconsistent code

### M1. Duplicate expulsion logic with different semantics

**Locations:**  
- `packages/core/src/reducer/index.ts` — `expelMemberReducer` (used)  
- `packages/core/src/economy/index.ts` — `expelMember` (dead export, never called)

**Issue:** `economy.expelMember` redistributes locally; `expelMemberReducer` routes severed value to `superstructureEscrow`. Two divergent implementations — only one is wired.  
**Recommendation:** Remove or unify.

### M2. `SOFT_CELL_CAP` is documented but never enforced

**Location:** `packages/core/src/reducer/state.ts` — exported constant, no reducer check  
**Issue:** Philosophy says Cells should split past ~50 members; code allows unbounded growth with O(n²) slider state.  
**Impact:** Performance and UX degradation at scale; philosophy anti-pattern not prevented.

### M3. Relay `sinceHash` sync filter is misnamed / naive

**Location:** `packages/relay/src/index.ts` — `request_sync` handler  
**Issue:** Filters `e.id !== msg.sinceHash` (excludes one event), not "events after this point in the log".  
**Impact:** Correctness preserved via client-side merge/dedup, but sync is inefficient and the API is misleading.

### M4. `isBridge` always treats Head as bridge

**Location:** `packages/core/src/reducer/state.ts` — `isBridge`  
**Issue:** `state.head === member` grants bridge role even without joining a superstructure.  
**Philosophy tension:** Docs say bridge is for dual-registered members; Head gets bridge powers by default.

### M5. Wire validation allows negative integer strings

**Location:** `packages/core/src/schema/validate.ts` — `isIntString` uses `/^-?\d+$/`  
**Issue:** Negative `amount`, `initialPoints`, or `vouchBondAmount` pass structural validation. Reducer mostly no-ops on `amount <= 0`, but negative genesis mint could be worth auditing.  
**Recommendation:** Restrict to non-negative: `/^\d+$/`.

### M6. Client `publish` placeholders (`prevHash: null`, `lamport: 0`)

**Location:** `packages/client/src/node/controller.ts`  
**Issue:** Every publish passes dummy lamport/prevHash; `SyncEngine.publish` overwrites them correctly. Confusing for readers; harmless at runtime.

### M7. `resolveVouchHead` retains previous Head when below threshold

**Location:** `packages/core/src/reducer/state.ts`  
**Issue:** When no candidate meets vouch threshold, returns `state.head` (incumbent stays). Philosophy says Head is removed when average shifts against them — ambiguous whether incumbent should become `null`.  
**Impact:** Sticky Head may be intentional; worth explicit spec + test.

---

## Low — old code, polish, docs drift

### L1. Retired `epoch_close` event still on wire

**Location:** Reducer treats as no-op for back-compat; still in schema and validation.  
**Status:** Acceptable for migration; document as deprecated.

### L2. `packages/client/src/index.ts` — minimal public API

Only exports controller, sync, keystore, invite, event-log. Fine for app; not a full SDK.

### L3. Help link points to generic GitHub path

**Location:** `packages/client/src/features/IdentityView.tsx`  
**Issue:** `https://github.com/aethelos/aethelos/...` — may 404 if repo isn't published there.

### L4. Tauri desktop is scaffold-only

**Location:** `packages/client-tauri/`  
**Issue:** Default Tauri shell + updater plugin; no custom native integration beyond wrapping the web client. README describes intent more than delivery.

### L5. No `importEventLog` UI

Export exists in Identity view; import path exists in code but isn't exposed — asymmetric portability story.

### L6. E2E coverage is minimal

**Location:** `packages/client/e2e/onboarding.spec.ts` — single happy-path founder flow  
**Missing:** Two-person invite/join, voting, sync, governance, adversarial client behavior.

---

## Security notes (non-exhaustive)

| Area | Assessment |
|------|------------|
| **Crypto** | Ed25519 + noble libraries; signatures verified before persist (sync) and reduction. Good. |
| **Keystore** | PBKDF2 210k iterations + AES-GCM. Reasonable for browser. Mnemonic → `sha256(entropy)` seed is non-standard vs SLIP-0010/ed25519 HD paths — document clearly for users. |
| **Identity import** | Accepts arbitrary JSON into IndexedDB without schema checks — supply-chain / social engineering risk. |
| **Relay** | By design unauthenticated; rate limits + size caps present. No signature check on relay (correct per philosophy). |
| **CSP** | Strong `_headers` on static host; `style-src 'unsafe-inline'` is typical for Vite/CSS. |
| **Session** | `localStorage` holds namespace + relay URLs (not keys). Low sensitivity. |
| **Governance** | **Weakest link** — see C1–C4. |

---

## What is solid

- **Topological sort + merge determinism** — tested for replay equivalence and multi-node convergence.
- **Fracture / double-spend detection** — adversarial test coverage.
- **Integer conservation** — decay, redistribution, scale simulations.
- **Vouch bond super-linear pricing** — tested.
- **Multi-relay sync engine** — failover, outbox, signature filter on ingest.
- **Incremental reducer snapshots** — correct fallback on reorder.
- **Relay hardening** — health, metrics, rate limit, graceful shutdown, Docker.

---

## Suggested fix priority

See **combined priority table** in [Pass 2](./CODEBASE_AUDIT_PASS2.md#combined-priority-pass-1--pass-2) (merges both passes). Pass 1-only summary:

1. **C1–C3** — Vote tracking; gate `expel`, `freeze_resolve` behind proposals/threshold.
2. **C4 / H1** — Finish superstructure or strip UI/docs until ready.
3. **H2–H3** — Bridge leave bug; wire Head `proposal_close`.
4. **H4 / M5** — Harden imports and wire validation.

---

## Audit methodology

- Read all source under `packages/*/src`
- Cross-checked philosophy (`Higher-Level-Philosophy.md`), user docs, and reducer behavior
- Ran `npx vitest run` in `packages/core` — all green
- Did not run E2E or full monorepo build in this pass

*End of audit notebook.*
