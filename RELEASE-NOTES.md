# AethelOS v0.2.1 Release Notes

Welcome to **AethelOS v0.2.1**.

This release ships the onboarding UX polish from Phase 2, fixes CI Hugging Face deploy gating, and refreshes Windows installers so new users get the improved first-run flow.

## Highlights

### Onboarding (first-run)

- Progress pips on founder and join paths
- Age gate on create **and** restore
- Backup screen copy reorder; recovery phrase semantics
- After backup, go straight to **Start a community** (no redundant chooser)
- PWA install hint below primary actions
- Federation-off E2E covers welcome path + edge cases (20 specs)

### Distribution

- **Windows installer** — primary path for founders today ([GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest))
- **Browser demo** (`app.aethelos.org`) — depends on Hugging Face Space; currently **paused** (operator must unpause; see [PUBLISHER.md](./docs/PUBLISHER.md))
- **Self-host** — docker compose / VPS path unchanged ([PUBLISHER.md](./docs/PUBLISHER.md))

### Proof (Windows)

`pnpm proof:product -SkipAndroid` **PASS** (2026-07-11): dev + release desktop share URLs, mobile E2E.

| Step | Result |
|------|--------|
| Preflight, typecheck, unit, user docs | PASS |
| Desktop dev share URL + mobile E2E | PASS |
| Release build + share URL + mobile E2E | PASS |

CI on merge: tiers 1–3 green (including docker-founder publish path).

## Known limitations

See [PRODUCT.md](./docs/PRODUCT.md): SmartScreen on unsigned Windows builds, 50-member community limit, offline queueing, four-step guest admission.

---

[Full changelog](./CHANGELOG.md) · [Get started](./docs/GET_STARTED.md)
