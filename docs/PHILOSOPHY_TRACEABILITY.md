# Philosophy Traceability Matrix

Maps claims in [Higher-Level-Philosophy.md](../Higher-Level-Philosophy.md) to automated tests and manual charters.

| ID | Philosophy claim | Automated test(s) | Status | Gap / charter |
|----|------------------|-------------------|--------|---------------|
| P1.1 | Stateless relay — no authoritative ledger | `packages/relay/tests/relay.test.ts` | Covered | — |
| P1.2 | DAG merge / deterministic ordering | `core.test.ts` (DAG merge), `adversarial.test.ts` (replay), `simulation.test.ts` | Covered | Live WS: `client/tests/sync-relay.test.ts` |
| P1.3 | Fracture on impossible state | `core.test.ts`, `adversarial.test.ts` (Charter A) | Covered | — |
| P1.4 | Cryptographic identity | `core.test.ts` (crypto) | Covered | Invite tamper: `client/tests/invite.test.ts`; relay filter: `core/tests/relay-url-utils.test.ts` |
| P1.5 | Vouch lien + admission gate | `adversarial.test.ts` (vouch lien), `governance-fixes.test.ts` | Covered | — |
| P1.6 | Relays invisible on happy path — swappable in Advanced | `active-relays.test.ts` (connectionStatusMessage), UI audit | Covered | E2E uses **Invite people** flow |
| P2.1 | Share-based relational wealth | `core.test.ts`, E2E transfers | Covered | — |
| P2.2 | Time-proportional accrual + redistribution interval | `circulation.test.ts` | Covered | epoch_interval min 15: `circulation.test.ts` |
| P2.3 | Equal-weight redistribution (live, vouched souls) | `adversarial.test.ts` (R1 Sybil) | Covered | Superstructure population E2E: `federation.spec.ts` |
| P2.4 | Commons holds undistributed decay | `adversarial.test.ts` (R2), `circulation.test.ts` | Covered | — |
| P2.5 | Integer conservation | All core suites, E2E conservation tests | Covered | `simulation.test.ts` fuzz |
| P3.1 | Cell / Pool / Node model | E2E onboarding, genesis | Covered | — |
| P3.2 | Expulsion → highest Pool escrow | `superstructure.test.ts`, `federation.test.ts` (core) | Covered | — |
| P3.3 | Superstructure pools + population routing | `superstructure.test.ts` | Covered | E2E: `federation.spec.ts` |
| P3.4 | Bridge via proposal + dual-registered bridge | `superstructure.test.ts` (bridge_transfer) | Covered | E2E bridge gate: `federation.spec.ts` |
| P3.5 | Join conformity to parent parameters | `superstructure.test.ts` | Covered | — |
| P3.6 | Leave superstructure (exit) | `superstructure.test.ts` / `federation.test.ts` | Covered | E2E: `federation.spec.ts` |
| P4.1 | Stake-weighted voting | `governance-fixes.test.ts`, E2E proposals | Covered | — |
| P4.2 | Liquid vouch / Head election | E2E community-scale head shift | Covered | — |
| P4.3 | Governance sliders (share-weighted) | E2E governance sliders | Covered | — |
| P4.4 | Superstructure slider relay | `superstructure.test.ts` (relay_cell_governance) | Covered | E2E governance relay |
| P4.5 | Head-only superstructure proposals | `governance-fixes.test.ts`, `adversarial.test.ts` (Charter B) | Covered | — |
| P5.1 | Sovereignty — no fiat appropriation | `adversarial.test.ts` (R2) | Covered | Explicit rejection test in core |
| P5.2 | Head relay, not dictator | `adversarial.test.ts` (Charter C) | Covered | — |

## Manual exploratory charters

See [TESTING_RELEASE.md](./TESTING_RELEASE.md) for sign-off checklist and 90-minute charters.

## P0 gaps (must have automated test before release of feature)

- Event log import round-trip after clean reinstall (partial: `federation.spec.ts` export/import)
