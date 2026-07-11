# AethelOS v0.2.2 Release Notes

Welcome to **AethelOS v0.2.2**.

This release enables **federation (linked chapters)** in production builds, closes P0 test gaps from the coverage audit, and adds a federation-on onboarding E2E tier in CI.

## Highlights

### Federation on by default

- Production and desktop builds ship with `VITE_ENABLE_FEDERATION=1`
- Community philosophy card and at-cap invite UX show **linked chapter** guidance
- **50 members per chapter** — scale by linking chapters, not one flat ceiling
- **Upgrade from v0.2.1** if you need linked-chapter UI in the installer

### P0 test coverage

- Expulsion fund-flow (no-parent split + commons edge)
- Superstructure guard rails and legacy direct-event rejection
- Lost-device recovery UI + `recoverCommunityFromEventLog` store branches
- Federation-on at-cap banner E2E

### CI

- New tier **2c-bis:** `pnpm test:e2e:federation-on` (onboarding/philosophy under production flag)
- Merge CI: federation-off → federation-on → chromium suite

### Distribution

- **Windows installer** — primary path ([GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest))
- **GHCR / docker** — client image inherits federation-on from `.env.production`
- **Browser demo** (`app.aethelos.org`) — still blocked (HF Space paused); see [PUBLISHER.md](./docs/PUBLISHER.md)

## Known limitations

See [PRODUCT.md](./docs/PRODUCT.md): SmartScreen on unsigned Windows builds, 50 members per chapter, offline queueing, four-step guest admission.

---

[Full changelog](./CHANGELOG.md) · [Get started](./docs/GET_STARTED.md)
