# Operations runbook

Consolidated triage for relay operators, publishers, and release maintainers.

## Relay outage

| Symptom | Likely cause | Action |
|---------|----------------|--------|
| Clients show **Offline** | Relay down, wrong URL, or firewall | Check `GET /healthz` and `GET /readyz` on the relay HTTP port |
| Partial sync | Relay buffer evicted old events (10k / 24h default) | Clients with local logs recover via `request_sync`; see [RELAY_OPERATORS.md](./RELAY_OPERATORS.md) |
| Rate limited | `429` from relay | Back off publishes; review `RELAY_RATE_LIMIT` in operator env |

See [RELAY_OPERATORS.md](./RELAY_OPERATORS.md) for metrics (`/metrics`), graceful shutdown, and load tests.

## Client recovery

| Scenario | Steps |
|----------|--------|
| New device, same identity | Recovery phrase → rejoin with **invite link** or **import event log** |
| Wrong / dead relay | Connection tab → add working endpoint → remove dead one (Charter D E2E: `recovery-relay-switch.spec.ts`) |
| Corrupt local log | Export from another device if available; otherwise rejoin from invite |
| **Queue full** sync indicator | Wait for relay connection; do not spam actions until outbox drains |

Diagnostics: Identity → export event log. Local analytics ring buffer: manual diagnostics export only.

## Release rollback

1. **Windows desktop:** uninstall current build; install previous `.msi` / `.exe` from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases).
2. **Hosted PWA:** redeploy prior container image or HF Space commit; users may need hard refresh / clear site data.
3. **Verify:** `node scripts/check-version-sync.mjs` before tagging; `pnpm verify:release` on maintainer machine.

Tagged releases run version sync, changelog, typecheck, and unit tests before `build-release.mjs` (see `.github/workflows/release.yml`).

## Product proof failures (Windows)

| Step fails | Fix |
|------------|-----|
| Share URL timeout | Ensure Vite on `127.0.0.1:5173`; run `node scripts/wait-share-url.mjs` |
| Tunnel HTTP 502 | cloudflared must target `127.0.0.1:5173` |
| Joiner pool empty | Relay bootstrap / same-origin `/ws` in dev tunnel |
| Android smoke | `scripts/start-android-emulator.ps1`; wipe `.android-avd/.adb-initialized` if stuck |
| Release path | Wait for `:8080` + sidecar relay; `AETHELOS_PROOF_MODE=release` |

Full orchestrator: `pnpm proof:product` (`scripts/proof-product.ps1`). Weekly CI: `.github/workflows/product-proof.yml`.

### CI product proof (GitHub Actions)

The `product-proof` workflow runs on `windows-latest` without Android by default so clean runners pass reliably:

| Mode | Command / trigger | Android |
|------|-------------------|---------|
| Scheduled weekly | `.github/workflows/product-proof.yml` cron | Skipped (`-SkipAndroid`) |
| Manual dispatch (default) | Actions → **product-proof** → Run workflow | Skipped |
| Manual dispatch + Android | Same workflow, enable **include_android** | Full `pnpm proof:product` after `scripts/bootstrap-android-ci.ps1` |

Local escape hatch (same as CI default):

```powershell
pnpm proof:product -- -SkipAndroid
```

Full Windows sign-off with Android still requires a maintainer machine or a manual workflow run with **include_android** checked.

## Incident template

1. Scope: relay only, hosted PWA, or desktop installer?
2. Collect: client sync indicator, relay `/healthz`, recent deploy tag.
3. Mitigate: switch relay (client Connection tab) or rollback release.
4. Post: update [CHANGELOG.md](../CHANGELOG.md) if user-visible.

## Hosted nightly preflight

Nightly **hosted-preflight** failure means check **`app.aethelos.org` deploy health** — it is **not** a merge blocker.

**Triage order:** `charter-a-preflight` → `publisher-preflight` → hosted-admission E2E (CI jobs / Playwright specs).

| Step | What to run |
|------|-------------|
| `charter-a-preflight` | `AETHELOS_URL=https://app.aethelos.org node scripts/charter-a-preflight.mjs` |
| `publisher-preflight` | Publisher / image preflight in CI (e.g. `docker-founder`) |
| Hosted-admission E2E | Playwright hosted admission specs in nightly / publish path |

**Product-proof CI** (weekly / manual, no Android on default runners):

```powershell
powershell -File scripts/proof-product.ps1 -SkipAndroid
```

See [TESTING_RELEASE.md](./TESTING_RELEASE.md) and nightly `hosted-preflight` in `.github/workflows/nightly-integration.yml`.