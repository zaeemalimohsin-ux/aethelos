# Testing and release

Automated gate: `pnpm verify:release` (typecheck, unit tests, user-doc jargon check, E2E).

## Proof tiers

| Tier | Command / job | What it proves | Required for |
|------|----------------|----------------|--------------|
| **1 — CI core** | `pnpm typecheck`, `pnpm lint:eslint`, `pnpm test` | Kernel, relay, client units | Every merge |
| **2 — Local product E2E** | `pnpm test:e2e --project=chromium` | Vite dev + relay dev flows (federation on) | Every merge (CI `e2e` job) |
| **2b — Pilot-off E2E** | `pnpm test:e2e:pilot-off` | Admission edge, pilot cap, philosophy UX without federation | Every merge (CI `e2e` job) + nightly |
| **2d – Mesh chain admission** | `pnpm --filter @aethelos/client exec playwright test e2e/mesh-chain.spec.ts --project=chromium` | Three-peer sequential join chain converges on vite+relay | Every merge (CI `e2e` job, `chromium` project in `pnpm test:e2e`) |
| **2c — Sync mesh** | `pnpm --filter @aethelos/client test -- tests/sync-mesh.test.ts` | Headless multi-engine convergence | Every merge (CI `build-and-test`) |
| **3 — Publish path** | CI `docker-founder` → Playwright `founder-docker` | Same-origin `/ws` via nginx on port 8080 | Every merge |
| **4 — Windows product proof** | `pnpm proof:product` | Desktop installer, live tunnel share URL, `share-url-mobile` Playwright | Release sign-off (Windows) |

### Tier 4 Android prerequisites (Windows)

| Prerequisite | Notes |
|--------------|-------|
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` or `ANDROID_HOME` |
| AVD | `AethelosProof` — proof uses `.android-avd` as `ANDROID_AVD_HOME` |
| ADB auth | `start-android-emulator.ps1` sets `ADBKEY` / `ADB_VENDOR_KEYS` and `-skip-adb-auth` |
| First boot | `-wipe-data` once; `.android-avd/.adb-initialized` marker on success |
| Manual check | `scripts/start-android-emulator.ps1` then `pnpm android:smoke` |

| **5 — Deep desktop** | `pnpm desktop:proof`, `pnpm desktop:gui-walkthrough` | Tunnel smoke, two-person sync, Tauri `local_node` | Optional pre-tag desktop review |

`desktop-proof.mjs` is the scripted subset of tier 5 (tunnel + community E2E + Rust tests). Prefer `proof:product` for full Windows sign-off.

## Deploy-path honesty

| Gate | What it proves | Where |
|------|----------------|-------|
| `pnpm test:e2e --project=chromium` | Local vite + `dev:relay` product flows (federation on), including `mesh-chain.spec.ts` | Local + CI `e2e` job |
| `pnpm test:e2e:pilot-off` | Pilot-gate UX (no `VITE_ENABLE_FEDERATION`) | Nightly `pilot-off-e2e` job |
| Nightly `sync-mesh` + `sync-partition` | Headless mesh convergence + partition recovery (Vitest) | `.github/workflows/nightly-integration.yml` |
| Nightly `mesh-chain-e2e` | Re-runs `mesh-chain`, `governance-progressive`, `offline-outbox-ui` Playwright specs (also in CI `chromium`) | `.github/workflows/nightly-integration.yml` |
| Nightly `hosted-preflight` | Canonical `https://app.aethelos.org` health + WS | `nightly-integration` workflow |
| Weekly `product-proof` | Full Windows `pnpm proof:product` | `.github/workflows/product-proof.yml` |
| CI `docker-founder` | Same-origin `/ws` publish stack (nginx) + mobile founder/joiner admission | Ubuntu CI — **required** publish-path proof |
| Playwright `share-url-mobile` | Live public tunnel URLs | Env-gated (`AETHELOS_SHARE_URL`); `proof:product` on Windows |
| `pnpm desktop:proof` / `proof-product.ps1` | Windows desktop remote path | Windows only; skipped on Linux verify |

Empty operator bootstrap (`DEFAULT_BOOTSTRAP_RELAYS: []`) is intentional: genesis must use desktop sidecar, same-origin publish, or a configured pool. Failed probe to empty/dead mailboxes must not silently invent connectivity.

## Release sign-off checklist

Before tagging a release candidate, confirm:

- [ ] `pnpm verify:release` — full automated gate
- [ ] `pnpm typecheck` passes on all packages
- [ ] `pnpm lint:eslint` and `pnpm format:check` pass
- [ ] `pnpm --filter @aethelos/core build && pnpm test` — all core + relay + client unit tests green
- [ ] `pnpm test:e2e` — all Playwright specs green
- [ ] CI `docker-founder` job green (same-origin publish path)
- [ ] [Philosophy Traceability Matrix](./PHILOSOPHY_TRACEABILITY.md) — statuses accurate; residuals listed honestly
- [ ] No new conservation violations in `simulation.test.ts` / `adversarial.test.ts`
- [ ] Relay tests green if `@aethelos/relay` changed
- [ ] Manual smoke: identity → community → invite → transfer → proposal → (if federation) bridge
- [ ] **Windows:** `pnpm proof:product` (tiers 4–5)
- [ ] **Android (Windows proof):** emulator boots headless; `android:smoke` PASS inside `proof:product`

## Standard test commands

```bash
pnpm typecheck && pnpm lint:eslint && pnpm format:check
node scripts/check-script-encoding.mjs
pnpm --filter @aethelos/core build
pnpm test
pnpm --filter @aethelos/core test:coverage
pnpm --filter @aethelos/client exec playwright test --project=chromium
pnpm test:e2e:pilot-off
```

Use `--project=chromium` explicitly when running E2E locally. Bare `pnpm test:e2e` also attempts `founder-docker` and `share-url-mobile` projects, which need Docker or `AETHELOS_SHARE_URL` respectively.

## Exploratory testing charters (90 minutes each)

### Charter A — New member journey

**Scope:** Invite link → admission proposal → accept → first transfer → redistribution visibility.

**Oracles:** Points conserved; invitee cannot join before admission; share percentages sum sensibly.

**Automated:** `packages/client/e2e/community.spec.ts` — `Charter A — new member journey` (CI `e2e` job).

### Charter B — Governance stress

**Scope:** 6+ members; conflicting sliders; expel near threshold; head vouch shift.

**Oracles:** Stake-weighted thresholds; minority cannot pass expel; head changes only via vouch average.

### Charter C — Federation seam

**Scope:** Join parent; link child; bridge proposal; verify linked namespaces and governance relay.

**Oracles:** Bridge requires proposal; leave clears parent link; no unilateral cross-namespace moves.

### Charter D — Recovery

**Scope:** Passphrase restore; event log export/import; relay URL change.

**Oracles:** Imported log reproduces pool; switching relay catches up from local log.

**Automated:** `packages/client/e2e/recovery-relay-switch.spec.ts` (Connection tab relay swap preserves local log state).

## Defect logging template

| Field | Content |
|-------|---------|
| Steps | Numbered reproduction |
| Expected | Philosophy quote or invariant |
| Actual | Observed behavior |
| Severity | P0–P3 |
| Repro rate | Always / intermittent |

## CI artifacts

On E2E failure, CI uploads `packages/client/playwright-report/` for trace review.
