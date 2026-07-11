---
title: Aethelos
emoji: ⚡
colorFrom: yellow
colorTo: gray
sdk: docker
pinned: false
app_port: 7860
---

# AethelOS

<p align="center">
  <img src="./packages/client/public/logo.svg" width="128" alt="AethelOS Logo" />
</p>

<h3 align="center">Community life, owned by its people.</h3>

<p align="center">
  A local-first platform for trade, governance, and mutual organisation. No central authority, no intermediary.
  <br />
  <br />
  <a href="https://aethelos.org"><strong>Website</strong></a> ·
  <a href="https://app.aethelos.org"><strong>Open in browser</strong></a> ·
  <a href="https://github.com/zaeemalimohsin-ux/aethelos/releases/latest"><strong>Windows download</strong></a> ·
  <a href="./docs/USER_GUIDE.md"><strong>User Guide</strong></a>
</p>

---

## Built differently

Every system built on trust has the same failure mode: over time, trust migrates toward those who control the infrastructure. AethelOS eliminates the center entirely.

1. **You hold your keys**: Your data and identity belong entirely to you, secured by cryptography, not terms of service.
2. **Mathematical governance**: Decisions are made transparently through community-voted proposals that execute automatically.
3. **Equal voices in redistribution**: Every live, vouched soul carries equal weight when commons are shared out. Day-to-day proposals use stake-weighted voting so influence is earned through participation, not hoarded forever.
4. **Unstoppable operation**: Even if the creators of AethelOS disappear tomorrow, your community keeps running exactly as it did yesterday.

Communities scale by **linked chapters** (50 members per chapter); federation is enabled in standard production builds. See [PRODUCT.md](docs/PRODUCT.md).

Read the full [Higher-Level Philosophy](./Higher-Level-Philosophy.md).

## Get Started

AethelOS is completely free and open source.

**Fastest path:** open the hosted app in your browser at [app.aethelos.org](https://app.aethelos.org) (or your operator's URL), create an identity, and start or join a community. Friends can join from any phone or desktop browser — no install required.

**Optional — Windows desktop:** [Download the latest installer](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (`.exe` or `.msi`) for local relay + share-link hosting from your PC.

See [Get Started guide](./docs/GET_STARTED.md) for step-by-step admission (vouch → vote → accept).

---

## For Developers

AethelOS is built as a local-first React PWA with an optional Tauri desktop shell. It uses Ed25519 cryptography, a deterministic DAG engine, and WebSocket relays.

### Architecture
```
packages/
  core/          Pure deterministic engine (DAG, Reducer, economy, governance)
  relay/         Powerless WebSocket relay (health, metrics, rate limiting)
  client/        Local-first React PWA (identity, multi-relay sync, full UI)
  client-tauri/  Desktop shell
```

### Quick start
Requires Node.js 20+ and pnpm 9+.
```bash
pnpm install
pnpm build
```

**Run local development:**
```bash
pnpm dev:relay    # ws://localhost:8787
pnpm dev:client   # http://localhost:5173
```

### Tests and quality
```bash
pnpm test         # unit + simulation + property + fuzz
pnpm setup:e2e    # download Playwright Chromium
pnpm test:e2e     # E2E test suite
```
*Note on Windows E2E: Run setup and test separately to avoid hanging.*

### Documentation
- [Product overview](docs/PRODUCT.md) — responsibilities and limitations
- [Support](docs/SUPPORT.md) · [Contributing](CONTRIBUTING.md)
- [Get Started](docs/GET_STARTED.md) · [User Guide](docs/USER_GUIDE.md)
- [Publisher Guide](docs/PUBLISHER.md) — Deploying AethelOS online
- [Genesis & operators](docs/GENESIS.md) · [Operations runbook](docs/OPERATIONS.md)
- [Testing & release](docs/TESTING_RELEASE.md)
- [Engineering sign-off](docs/ENGINEERING_SIGNOFF.md)
- [Relay Operators](docs/RELAY_OPERATORS.md) — Running your own relay
- [Threat Model](docs/THREAT_MODEL.md) & [Security Policy](SECURITY.md)
- [Versioning Policy](docs/VERSIONING.md)

## License
MIT
