# AethelOS v0.2.0 Release Notes

Welcome to **AethelOS v0.2.0** — the vouch-pilot beta milestone.

This release hardens the desktop + mobile product path, aligns pilot-facing language, and documents what is proven in CI versus what remains beta scope.

## Highlights

### 1. Deterministic core (Charters A–C)

The reducer engine is covered by adversarial unit tests for fracture isolation, head-only closures, and head non-dictatorship. **Full fracture → `resolve_fracture` UI E2E remains deferred** — see [CODEBASE_AUDIT_PASS4.md](./docs/CODEBASE_AUDIT_PASS4.md).

### 2. Network resilience (relay)

The stateless WebSocket relay has chaos/load tests: broadcast buffering, rate limits, and connection caps. Production traffic still depends on reachable connection points — relays cannot invent consensus.

### 3. Data portability

Event log export/import is tested (unit + E2E). **Dual-fork causal validation on import is still open.** Recovery phrase restores identity only; community history needs an invite link or event log from another device.

### 4. Pilot UX (Wave D)

- **Connection** tab for network/share settings (no relay UI on Community).
- Plain-language toasts: Points, connection point, stake.
- Admission: vouch → vote Approve in Proposals → Accept invitation.

### 5. Product proof (Windows)

`pnpm proof:product` exercises dev + release desktop paths, live tunnel share URLs, mobile E2E, and Android emulator smoke. See [TESTING_RELEASE.md](./docs/TESTING_RELEASE.md).

**Sign-off log (local):**

| Run | Date (UTC) | Result |
|-----|------------|--------|
| 1 | 2026-07-10 | PASS |
| 2 | 2026-07-10 | PASS |
| 3 | 2026-07-10 | PASS (release Android smoke retried once) |

CI automation: `.github/workflows/product-proof.yml` (weekly + manual dispatch).

- Distribution scorecard composite **77.5/100** (Charter A v1, 2026-07-11). See [DISTRIBUTION_SCORECARD.md](./docs/DISTRIBUTION_SCORECARD.md).

## Known limitations

See [BETA_README.md](./docs/BETA_README.md): SmartScreen on unsigned Windows builds, federation rough edges, offline queueing, four-step guest admission.

---

*Thank you to pilots and contributors helping shape AethelOS.*
