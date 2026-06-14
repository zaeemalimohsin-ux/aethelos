# AethelOS Codebase Audit — Pass 2

> **Superseded for sign-off by [Pass 3](./CODEBASE_AUDIT_PASS3.md) (2026-06-11).** This document remains as historical audit detail.

> **Note (2026-06-09):** Client now has 9+ unit test files and 5 E2E specs (including `federation.spec.ts`). Items marked fixed in the resolutions table below remain accurate; stale "no client tests" claims in this doc are superseded.

**Date:** 2026-06-09  
**Scope:** Deeper pass on client UX/state, onboarding/session, sync ingestion, economy edge cases, CI/ops, threat-model alignment  
**Prior work:** [Pass 1](./CODEBASE_AUDIT.md) (governance authorization, superstructure gaps)

Pass 2 adds **runtime-verified** bugs where noted, plus client/ops issues Pass 1 did not cover.

---

## New critical findings

### N-C1. Re-inviting the same invitee destroys Points (conservation break)

**Location:** `packages/core/src/reducer/index.ts` — `invite` + `lockVouchBond`  
**Verified:** Yes — runtime script on built core:

```
req1 500, req2 950 → total pool 9500 (was 10000), bond 950, alice 8550
```

**Mechanism:** A second `invite` for the same `invitee` deducts a new bond from the inviter and **overwrites** `vouchBonds[invitee]` without releasing the previous locked amount. The first bond’s Points leave `balances` but are not credited anywhere.

**Impact:** Accidental double-invite (UI retry, sync duplicate, two admins) permanently destroys community wealth. Violates core invariant tests assume elsewhere.

**Pass 1 relation:** Separate from vote-stacking; economy layer.

---

## New high findings

### N-H1. Governance sliders are uncontrolled — UI diverges from synced state

**Location:** `packages/client/src/design/components/Slider.tsx`  
**Issue:** Uses `defaultValue={value}` instead of `value={value}`. After remote slider updates arrive via sync, the range input **does not update**; only the numeric `<span className="value">` is correct on first render.

**Impact:** Users act on stale slider positions; appears broken in multi-member communities.

### N-H2. Transfers to non-members silently succeed on the client, fail in reducer

**Location:** `packages/core/src/economy/index.ts` — `transferPoints`; client `store.ts` always toasts success  
**Verified:** Transaction to non-member leaves sender balance unchanged; client still shows “Transaction sent”.

**Impact:** User confusion; no on-chain effect; support burden.

### N-H3. “Use a different identity” does not clear persisted session

**Location:** `packages/client/src/features/Onboarding.tsx` — `UnlockScreen`  
**Issue:** Sets `session: null` in Zustand and calls `lock()`, but **never** `clearSession()` — `localStorage` still holds the old session.

**Impact:** Page reload returns to the previous identity’s lock screen; “different identity” flow is broken across refresh.

### N-H4. Invite links are not authenticated

**Location:** `packages/client/src/app/invite.ts`  
**Issue:** Invite payload is base64 JSON (namespace, relays, inviter pubkey, cell name). Anyone can forge a link pointing at a malicious relay or wrong namespace.

**Impact:** Phishing / griefing vector. Mitigation is social (verify out-of-band), not cryptographic. Threat model should state this explicitly.

### N-H5. `defaultRelay()` breaks hosted PWAs

**Location:** `packages/client/src/app/session.ts`  
**Issue:** `wss://${window.location.hostname}:8787` — a client hosted at `https://app.example.com` assumes relay on port 8787 of the **same host**, which is usually wrong.

**Impact:** Genesis/start-community fails for deploys unless user manually edits relay URL.

### N-H6. No way to cancel a pending invite / recover locked bond

**Location:** Reducer — `invite` locks bond; no `cancel_invite` event  
**Issue:** If invitee never accepts, bond remains locked indefinitely (decaying). Inviter cannot reclaim except via undocumented paths.

**Impact:** Capital stuck; bad UX for mistaken invites.

### N-H7. Proposal UI uses static `pool.parameters.approval_threshold` for progress bar

**Location:** `packages/client/src/features/ProposalsView.tsx`  
**Issue:** Display compares vote % against **genesis defaults** in `pool.parameters`, not `resolveGovernanceParameter(state, "approval_threshold")` which the reducer uses for execution.

**Impact:** Misleading pass/fail indicator when community has moved the approval slider.

---

## New medium findings

### N-M1. Epoch griefing via cheap event spam

**Location:** Reducer — `eventsSinceEpoch` increments on every successfully applied event  
**Issue:** Any member can emit unbounded `slider_update`, `proposal_create`, `proposal_vote` (even 0-weight votes) to **force epoch boundaries** and accelerate decay for the whole Cell.

**Pass 1 relation:** Complements governance auth gaps; even after vote-fix, spam remains.

**Mitigation ideas:** Rate limits per author per epoch, event fees, or exclude cosmetic events from epoch counter.

### N-M2. `sync_batch` does not filter events by `namespaceId` per event

**Location:** `packages/client/src/sync/engine.ts` — `ingestRemote`  
**Issue:** Batch is accepted when `msg.namespaceId` matches, but individual events inside are not filtered. A malicious relay could store cross-namespace garbage in IndexedDB.

**Impact:** Polluted local DB; reducer ignores on namespace mismatch, but export/backup includes junk.

### N-M3. `reduceEvents` silently drops failed events

**Location:** `packages/core/src/reducer/index.ts`  
**Issue:** Invalid/forbidden events are skipped with no log, flag, or fracture. Operators cannot distinguish “sync incomplete” from “attack filtered”.

**Impact:** Debugging and auditability; hidden partial application.

### N-M4. Slider / governance values unbounded in reducer

**Location:** `slider_update` handler  
**Issue:** UI clamps 0–100 (or 500 for epoch interval), but wire accepts any number. Attacker can set `decay_rate: 1000000` or `epoch_interval: 1`.

**Impact:** Governance parameter hijack without UI.

### N-M5. `totalSupply` is stale after genesis

**Location:** `mintPoints` only at genesis; transfers/decay don't update it  
**Issue:** Misleading field; unused in conservation tests (`totalPoolPoints` used instead).

**Impact:** Confusing for integrators; potential future bug if someone trusts `totalSupply`.

### N-M6. CI security audit never fails the build

**Location:** `.github/workflows/ci.yml` — `pnpm audit --audit-level high || true`  
**Issue:** High-severity dependency findings are swallowed.

**Impact:** Documented supply-chain control is weaker than `THREAT_MODEL.md` claims.

### N-M7. PWA update UX uses blocking `confirm()`

**Location:** `packages/client/src/main.tsx`  
**Issue:** Native confirm dialog for SW updates; no in-app pattern; poor on mobile.

**Impact:** Polish/accessibility, not security.

### N-M8. StrictMode double `init()` in development

**Location:** `App.tsx` + React StrictMode  
**Issue:** `init()` runs twice in dev; benign but can confuse debugging (duplicate IDB reads).

---

## New low / ops / docs findings

### N-L1. `collectDiagnostics` declares `storageEstimate` but never fills it

**Location:** `packages/client/src/app/diagnostics.ts`  
**Issue:** Interface suggests quota reporting; not implemented.

### N-L2. Threat model vs implementation gap on governance

**Location:** `docs/THREAT_MODEL.md`  
**Issue:** Table covers relay/crypto/Sybil but not **unauthorized governance events** (Pass 1 C1–C4). “Spam resolved socially” understates protocol-level expel/vote bugs.

### N-L3. Help URL may 404

**Location:** `IdentityView.tsx` — hardcoded `github.com/aethelos/aethelos` (Pass 1 L3, confirmed)

### N-L4. Client package has no unit tests

**Location:** `packages/client` — only Playwright e2e  
**Issue:** Sync, keystore, invite, slider bugs uncaught by CI unit layer.

### N-L5. `export * from economy` exposes dead `expelMember`

**Location:** `packages/core/src/index.ts` (Pass 1 M1, confirmed still exported)

---

## Runtime verification log (Pass 2)

| Test | Result |
|------|--------|
| Duplicate invite (500 then 600, second below required) | Second rejected; total conserved |
| Duplicate invite (500 then 950, both meet required) | **Total 9500 vs 10000 — 500 destroyed** |
| Double `accept_invite` | Second rejected; no duplicate members |
| Transfer to non-member | Reducer no-op; balance unchanged |

---

## Combined priority (Pass 1 + Pass 2)

| Priority | ID | Issue |
|----------|-----|--------|
| P0 | C1 (P1) | Proposal vote stacking |
| P0 | N-C1 (P2) | Re-invite same invitee destroys Points |
| P0 | C2–C3 (P1) | Unauthenticated `expel` / `freeze_resolve` |
| P1 | C4 / H1 (P1) | Superstructure incomplete + governance bypass |
| P1 | N-H1 | Slider UI stale after sync |
| P1 | N-H3 | Session not cleared on identity switch |
| P1 | N-H2 | Transfer success toast on silent failure |
| P2 | N-H4–H7 | Invite trust, default relay, cancel invite, proposal UI threshold |
| P2 | N-M1–M4 | Epoch spam, sync filter, silent reduce, unbounded sliders |
| P3 | Remaining M/L items from both passes |

---

## Methodology (Pass 2)

- Re-read all client feature modules, session/store, sync/outbox, worker, vite/PWA, CI
- Cross-checked `THREAT_MODEL.md` against actual reducer authorization
- Runtime Node scripts against `packages/core/dist` for invite/transfer edge cases
- Did not re-run full E2E or monorepo build in this pass

*End of Pass 2.*

---

## Resolutions implemented (2026-06-09)

| Audit ID | Fix |
|----------|-----|
| C1 / N-C1 (partial) | `proposal_vote` tracks `voters` — one weight per member, revotable; re-invite refunds prior bond via `refundVouchBondToInviter` |
| C2–C4 | Direct `expel`, `freeze_resolve`, `join/leave_superstructure` rejected (`use_proposal`); superstructure join/leave execute in `tryExecuteProposal`; Head-only superstructure proposals |
| N-H1 | Slider is controlled + syncs from props |
| N-H2 | Client rejects transfer to non-members before publish |
| N-H3 | `clearSession()` on “Use a different identity” |
| N-H7 | Proposal bar uses `resolveGovernanceParameter` |
| H3 (P1) | Head **Close** button wired via `closeProposal` |
| N-M2 / M4 / M5 (partial) | Sync filters by event namespace; slider values clamped in reducer; wire amounts non-negative |

Regression tests: `packages/core/tests/governance-fixes.test.ts` (27 core tests passing).

### Pass 3 (2026-06-09)

| Audit ID | Fix |
|----------|-----|
| N-H6 | `cancel_invite` event + Pending Invites UI to reclaim bonds |
| N-M1 | Governance-only events excluded from epoch counter (`countsTowardEpoch`) |
| N-H4 (partial) | Invite links signed by inviter Ed25519 key; invalid sig blocks join |
| N-H5 | `VITE_DEFAULT_RELAY_URL` for hosted PWAs; dev defaults to `ws://localhost:8787` |
| M2 / soft cap | `accept_invite` rejected when `members.length >= SOFT_CELL_CAP` (50) |
| H4 / import | `importEventLog` validates structure, signatures, optional namespace |
| CI | `pnpm audit --audit-level high` now fails the build |

30 core tests passing.
