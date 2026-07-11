# AethelOS v0.2.0 Release Notes

Welcome to **AethelOS v0.2.0**.

This release hardens the desktop + mobile product path, aligns user-facing language for general availability, and documents what is proven in CI.

## Highlights

### 1. Deterministic core (Charters A–C)

The reducer engine is covered by adversarial unit tests for fracture isolation, head-only closures, and head non-dictatorship. **Fracture recovery UI** is covered in `community.spec.ts` E2E (overspend, sibling fork, Charter A blocked/unfreeze paths).

### 2. Network resilience (relay)

The stateless WebSocket relay has chaos/load tests: broadcast buffering, rate limits, and connection caps. Production traffic still depends on reachable connection points — relays cannot invent consensus.

### 3. Data portability

Event log export/import is tested (unit + E2E). **Dual-fork causal validation on import is still open.** Recovery phrase restores identity only; community history needs an invite link or event log from another device.

### 4. Product UX

- **Connection** tab for network/share settings (no relay UI on Community).
- Plain-language toasts: Points, connection point, stake.
- Admission: vouch → vote Approve in Proposals → Accept invitation.
- **Onboarding:** progress pips, age gate on create/restore, backup → Start a community (no extra chooser), federation-off E2E covers welcome path.

### 5. Product proof (Windows)

`pnpm proof:product` exercises dev + release desktop paths, live tunnel share URLs, mobile E2E, and Android emulator smoke. See [TESTING_RELEASE.md](./docs/TESTING_RELEASE.md).

**Sign-off log (local):**

| Run | Date (UTC) | Result |
|-----|------------|--------|
| 1 | 2026-07-10 | PASS |
| 2 | 2026-07-10 | PASS |
| 3 | 2026-07-10 | PASS (release Android smoke retried once) |

CI automation: `.github/workflows/product-proof.yml` (weekly + manual dispatch).

- Distribution scorecard composite **77.5/100** (Charter A v1, 2026-07-11). See [ENGINEERING_SIGNOFF.md](./docs/ENGINEERING_SIGNOFF.md).
- **GA content phase (2026-07-11):** PRODUCT, PRIVACY, TERMS, SUPPORT docs; pilot copy retired in app and user docs.

## Known limitations

See [PRODUCT.md](./docs/PRODUCT.md): SmartScreen on unsigned Windows builds, 50-member community limit in standard builds, offline queueing, four-step guest admission.

---

*Thank you to contributors helping shape AethelOS.*
