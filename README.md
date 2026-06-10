# AethelOS

**Community life, owned by its people.** A local-first platform for trade,
governance, and mutual organisation that needs no bank, platform, or central
authority to function. Every participant holds their own keys and a full copy of
their community's history; the only shared infrastructure is a powerless message
relay anyone can run.

Built on the principles in [Higher-Level-Philosophy.md](./Higher-Level-Philosophy.md).

**Repository:** https://github.com/zaeemalimohsin-ux/aethelos (private — request access or clone if you have permission)

```bash
git clone https://github.com/zaeemalimohsin-ux/aethelos.git
cd aethelos
```

## Highlights

- **Local-first PWA** — installable on any desktop or mobile browser, no app
  store. Optional signed [desktop build](packages/client-tauri/) via Tauri.
- **You hold your identity** — Ed25519 keys encrypted on-device, with a 12-word
  recovery phrase and encrypted export.
- **Frictionless invites** — share a link or QR; the recipient joins with one tap.
- **Deterministic core** — identical event logs produce identical state on every
  device; an off-thread reducer with incremental snapshots keeps it fast.
- **Resilient sync** — connect to several relays at once, automatic failover, and
  a durable offline outbox.
- **Powerless relays** — no ledger, no keys, no authority; trivially self-hosted
  and swappable.

## Architecture

```
packages/
  core/          Pure deterministic engine (DAG, Reducer, economy, governance, wire validation)
  relay/         Powerless WebSocket relay (health, metrics, rate limiting, Docker)
  client/        Local-first React PWA (identity, multi-relay sync, full UI)
  client-tauri/  Optional signed desktop shell (same core + UI)
```

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install and build

```bash
pnpm install
pnpm build
```

### Run a relay and the client

```bash
pnpm dev:relay    # ws://localhost:8787  (+ /healthz, /metrics)
pnpm dev:client   # http://localhost:5173
```

Open the client, create an identity, and start a community. To add people, use
**Share invite link** and send them the link or QR.

**Manual multi-person testing (Windows):** double-click
[`Multi-Person-Test.bat`](./Multi-Person-Test.bat) in the repo root — it starts
the relay and client if needed, then opens six isolated browser windows (each
acts as a separate person). Or run `pnpm playground` / `pnpm playground -- 4`.

### Tests and quality

```bash
pnpm test         # unit + simulation + property + fuzz (core)
pnpm setup:e2e    # once: download Playwright Chromium (run before E2E)
pnpm test:e2e     # Playwright multi-instance UI (relay + 2-browser sync; packages/client/e2e/)
pnpm lint:eslint  # lint
pnpm format       # format
```

**E2E on Windows:** run `pnpm setup:e2e` and `pnpm test:e2e` as **separate** commands — do not chain
`playwright install` with tests in one line (install can hang after download). For a persistent browser
cache, set `PLAYWRIGHT_BROWSERS_PATH` to `%LOCALAPPDATA%\ms-playwright` before `pnpm setup:e2e`.

## Deploy

- **Full walkthrough:** [docs/DEPLOY.md](docs/DEPLOY.md) — relay, static client, env vars, genesis check.
- **Relay:** `docker compose up -d --build` — see
  [docs/RELAY_OPERATORS.md](docs/RELAY_OPERATORS.md) (TLS, federation, monitoring).
- **Client:** set `VITE_DEFAULT_RELAY_URL` (see `packages/client/.env.example`), then
  `pnpm --filter @aethelos/client build` and host `packages/client/dist` on any static
  host. Security headers ship in
  [packages/client/public/_headers](packages/client/public/_headers).

## Documentation

- [User Guide](docs/USER_GUIDE.md) — for community members.
- [Quick start — remote friends](docs/QUICKSTART_REMOTE.md) — founder abroad + joiner (desktop tunnel).
- [Genesis Bootstrap](docs/GENESIS.md) — starting the very first community.
- [Production Deploy](docs/DEPLOY.md) — relay + client + two-person genesis.
- [Relay Operators](docs/RELAY_OPERATORS.md) — running infrastructure.
- [Threat Model](docs/THREAT_MODEL.md) and [Security Policy](SECURITY.md).
- [Versioning & Wire Compatibility](docs/VERSIONING.md).

## Philosophy alignment

| Principle               | Implementation                                              |
| ----------------------- | ---------------------------------------------------------- |
| Powerless relays        | `packages/relay` — no ledger, no keys, swappable           |
| Deterministic state     | `packages/core` Reducer — identical logs to identical state |
| Integer economy         | `BigInt` Points throughout; Shares are a UI projection      |
| Identity = signature    | Ed25519; every event signed and verified                   |
| Sybil resistance        | Super-linear, decaying Vouch Bonds; live-soul redistribution |
| Exit = accountability   | Full Event Log portability; leave a superstructure anytime  |

## License

MIT
