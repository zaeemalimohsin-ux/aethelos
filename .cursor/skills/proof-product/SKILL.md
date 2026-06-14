---
name: proof-product
description: >-
  Run and debug AethelOS product proof (pnpm proof:product): desktop share URL,
  mobile E2E, Android emulator, release exe. Use when proof fails, before release
  sign-off, or when asked to verify desktop+mobile professionally.
---
# AethelOS product proof

## When to use

- Before release sign-off or after relay/tunnel/proof script changes
- When `pnpm proof:product` fails or is flaky
- When validating share URL, mobile E2E, Android smoke, or release exe path

## Command

```powershell
cd D:\App2
pnpm proof:product
```

Escape hatches (internal only): `-SkipRelease`, `-SkipStaticGates`, `-SkipPreflight`, `-ForceRelease`

## Expected PASS summary

All steps required (no SKIP for Android):

- Preflight, typecheck, unit tests, user docs
- Desktop dev share URL, mobile E2E, Android smoke
- Release build, release exe share URL, mobile E2E, Android smoke
- `PRODUCT PROOF: PASS`

## Environment variables

| Variable | Purpose |
|----------|---------|
| `AETHELOS_SHARE_URL_FILE` | Path to write `.share-url` (repo root) |
| `AETHELOS_SHARE_URL` | Public URL for Playwright share-url-mobile project |
| `AETHELOS_PROOF_MODE` | `dev` (5173+CDP) or `release` (8080, no CDP) |
| `AETHELOS_CDP_URL` | Default `http://127.0.0.1:9222` |
| `PLAYWRIGHT_BROWSERS_PATH` | `%LOCALAPPDATA%\ms-playwright` |

## Before running

1. Kill stale processes: `aethelos-desktop`, `cloudflared`, `emulator`
2. Free ports: 5173, 5174, 5175, 8080, 8787, 9222
3. Android: SDK at `%LOCALAPPDATA%\Android\Sdk`; proof uses `D:\App2\.android-avd` for AVD home (needs free disk). Auto-starts `AethelosProof` AVD.
4. Release proof builds client with `VITE_E2E=1` via `AETHELOS_PROOF_BUILD=1` and stages sidecars beside `target/release/aethelos-desktop.exe`.
5. Do **not** use em-dashes in `.ps1` files (PowerShell parse errors on Windows)

## Failure triage

| Symptom | Fix |
|---------|-----|
| Timed out waiting for share URL | Wait for cargo build; check vite on 127.0.0.1:5173 (not IPv6 ::1); run `node scripts/wait-share-url.mjs` |
| Tunnel HTTP 502 | Vite must bind `host: "127.0.0.1"`; cloudflared targets 127.0.0.1:5173 |
| Joiner pool empty | Fix relay bootstrap (same-origin /ws in DEV on trycloudflare) |
| Android FAIL | Start emulator via `scripts/start-android-emulator.ps1`; check screenshot in `test-results/android-smoke.png` |
| Release path timeout | Set `AETHELOS_PROOF_MODE=release`; wait for :8080 + :8787 |

## Key files

- [`scripts/proof-product.ps1`](../../scripts/proof-product.ps1) - orchestrator
- [`scripts/proof-desktop-lib.mjs`](../../scripts/proof-desktop-lib.mjs) - CDP, DNS, tunnel helpers
- [`scripts/wait-share-url.mjs`](../../scripts/wait-share-url.mjs) - share URL wait
- [`scripts/proof-desktop-dev.ps1`](../../scripts/proof-desktop-dev.ps1) - desktop dev launcher
- [`packages/client/e2e/founder-share-url.spec.ts`](../../packages/client/e2e/founder-share-url.spec.ts)
- [`packages/client/e2e/joiner-share-url.spec.ts`](../../packages/client/e2e/joiner-share-url.spec.ts)

## Sign-off loop

Run `pnpm proof:product` **3 consecutive times** with PASS before declaring done. Use babysit skill for fix-until-green loop. Run Bugbot review on relay/bootstrap changes.
