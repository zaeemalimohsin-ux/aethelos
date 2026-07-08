# Philosophy Traceability Matrix

Maps claims in [Higher-Level-Philosophy.md](../Higher-Level-Philosophy.md) to automated tests and manual charters.

Statuses: **Covered** (automated proof exists), **Partial** (happy path / subset), **Gap** (claim not yet honestly proven).

| ID | Philosophy claim | Automated test(s) | Status | Gap / charter |
|----|------------------|-------------------|--------|---------------|
| P1.1 | Stateless relay — no authoritative ledger | `packages/relay/tests/relay.test.ts` | Partial | Buffer + limits covered; **not** censorship resistance / anti-withhold protocol (accepted residual: multi-relay + `relay_contribute`) |
| P1.2 | DAG merge / deterministic ordering | `core.test.ts` (DAG causal), `adversarial.test.ts` (replay), `simulation.test.ts` | Covered | Orphans held aside; `filterCausalClosure` on import |
| P1.3 | Fracture on impossible state | `core.test.ts`, `adversarial.test.ts` (Charter A); E2E sibling fork + overspend in `community.spec.ts` | Covered | — |
| P1.4 | Cryptographic identity | `core.test.ts` (crypto) | Covered | Invite tamper: `client/tests/invite.test.ts`; relay filter: `core/tests/relay-url-utils.test.ts` |
| P1.5 | Vouch lien + admission gate | `adversarial.test.ts` (vouch lien), `governance-fixes.test.ts` | Covered | — |
| P1.6 | Relays invisible on happy path — swappable in Advanced | `active-relays.test.ts`, `ux-philosophy.spec.ts` | Partial | Happy-path UX covered; failure-mode relay visibility not fully E2E'd |
| P2.1 | Share-based relational wealth | `core.test.ts`, E2E transfers | Covered | — |
| P2.2 | Time-proportional accrual + redistribution interval | `circulation.test.ts` | Covered | Min floor: 15 minutes (`MIN_EPOCH_INTERVAL_MINUTES`) after Wave 3 |
| P2.3 | Equal-weight redistribution (live, vouched souls) | `adversarial.test.ts` (R1 Sybil) | Covered | Superstructure population E2E: `federation.spec.ts` |
| P2.4 | Commons holds undistributed decay | `circulation.test.ts` (P2.4 zero-eligible), `adversarial.test.ts` (R2) | Covered | — |
| P2.5 | Integer conservation | All core suites, E2E conservation tests | Covered | `simulation.test.ts` fuzz |
| P3.1 | Cell / Pool / Node model | E2E onboarding, genesis | Covered | — |
| P3.2 | Expulsion → highest Pool escrow | `superstructure.test.ts`, `federation.test.ts` (core) | Covered | — |
| P3.3 | Superstructure pools + population routing | `superstructure.test.ts` | Covered | Population is self-reported via `relay_cell_governance` |
| P3.4 | Bridge via proposal + dual-registered bridge | `superstructure.test.ts` (paired inbound), `client/tests/bridge-mirror.test.ts` | Covered | Unpaired linked inbound mint rejected |
| P3.5 | Join conformity to parent parameters | `superstructure.test.ts` | Covered | — |
| P3.6 | Leave superstructure (exit) | `superstructure.test.ts` / `federation.test.ts` | Covered | E2E: `federation.spec.ts` |
| P4.1 | Stake-weighted voting | `governance-fixes.test.ts`, E2E proposals | Covered | — |
| P4.2 | Liquid vouch / Head election | E2E `community-scale.spec.ts` head shift | Covered | — |
| P4.3 | Governance sliders (share-weighted) | E2E governance sliders | Covered | — |
| P4.4 | Superstructure slider relay | `superstructure.test.ts` (relay_cell_governance) | Covered | E2E governance relay |
| P4.5 | Head close; any member may initiate join/leave | `adversarial.test.ts` (Charter B close); `governance-fixes.test.ts` (non-head join create) | Covered | Close remains Head-only |
| P5.1 | Sovereignty — no fiat appropriation | `adversarial.test.ts` (R2) | Covered | Explicit rejection test in core |
| P5.2 | Head relay, not dictator | `adversarial.test.ts` (Charter C) | Partial | No fiat steal; Head still has summary `proposal_close` (documented in philosophy §5) |

## Manual exploratory charters

See [TESTING_RELEASE.md](./TESTING_RELEASE.md) for sign-off checklist and 90-minute charters.

## Known residuals (honest P0/P1 register)

- **Relay censorship:** no gossip anti-censor protocol beyond multi-relay + community mailboxes (threat-model accepted).
- **Deploy-path E2E:** default CI uses localhost vite+relay; docker-founder / share-URL specs are env-gated (Wave 3 documents honesty).
- **Empty bootstrap:** static PWA without same-origin `/ws` or mailbox must fail loudly (Wave 3 UX).
