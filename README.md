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
  <a href="https://github.com/zaeemalimohsin-ux/aethelos/releases/latest"><strong>Download for Windows</strong></a> ·
  <a href="./docs/USER_GUIDE.md"><strong>User Guide</strong></a>
</p>

---

## Built differently

Every system built on trust has the same failure mode: over time, trust migrates toward those who control the infrastructure. AethelOS eliminates the center entirely.

1. **You hold your keys**: Your data and identity belong entirely to you, secured by cryptography, not terms of service.
2. **Mathematical governance**: Decisions are made transparently through community-voted proposals that execute automatically.
3. **Equal voices**: AethelOS is designed to resist wealth concentration. Value circulates naturally, and every human soul carries equal weight in the system.
4. **Unstoppable operation**: Even if the creators of AethelOS disappear tomorrow, your community keeps running exactly as it did yesterday.

Read the full [Higher-Level Philosophy](./Higher-Level-Philosophy.md).

## Get Started

AethelOS is completely free and open source. 

1. **Download the Windows App:** Go to the [Releases page](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) and download the installer (`.exe` or `.msi`).
2. **Create Identity:** Open the app and create your identity. 
3. **Start a Community:** Create a new community and send invite links to your friends. They can join directly from their browser or phone without downloading the app.

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
- [Publisher Guide](docs/PUBLISHER.md) — Deploying AethelOS online
- [Relay Operators](docs/RELAY_OPERATORS.md) — Running your own relay
- [Threat Model](docs/THREAT_MODEL.md) & [Security Policy](SECURITY.md)
- [Versioning Policy](docs/VERSIONING.md)

## License
MIT
