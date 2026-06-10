# AethelOS Desktop (Tauri)

A signed desktop shell (Windows/macOS/Linux) wrapping the **same** `@aethelos/client`
PWA and `@aethelos/core` engine. One Reducer, zero drift. The desktop build is
opt-in and kept out of the default monorepo build so contributors do not need a
Rust toolchain.

## Why a desktop build at all?

The PWA already runs on any browser, including mobile. The desktop shell adds:

- On-device Event Log files and a always-available node.
- **Peer mailbox sharing** — founders can host a community mailbox on their PC and
  invite friends abroad without manual relay configuration.
- OS integration and a signed, auto-updating binary for less technical users.

It introduces no new gatekeeper — it is distributed directly, not via an app store.

## Peer mailbox prerequisites

Before `desktop:dev` or `desktop:build`, prepare the relay sidecar:

```bash
pnpm install
pnpm --filter @aethelos/relay build
```

For **friends far away** (cross-continent), install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) on the founder's machine. The desktop app runs:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

This opens a free public `https://` URL mapped to `wss://` for WebSocket sync. Without
cloudflared, the mailbox works on the local network only.

The Connection card shows **Ready for friends abroad** when the tunnel succeeds, or
guidance when `cloudflared` is missing.

## Prerequisites

- [Rust](https://rustup.rs/) (stable, >= 1.77)
- [Node.js](https://nodejs.org/) (>= 20) — used to spawn the relay sidecar
- Platform build tools (see the Tauri prerequisites for your OS)
- Tauri CLI: `pnpm --filter @aethelos/client-tauri add -D @tauri-apps/cli`
- Optional: **cloudflared** for public tunnels (see above)

## Generate icons (first time)

```bash
cd packages/client-tauri
pnpm exec tauri icon ../client/public/favicon.svg
```

## Develop

```bash
pnpm --filter @aethelos/relay build
pnpm --filter @aethelos/client-tauri desktop:dev
```

This runs the Vite dev server and opens the native window pointed at it.

## Verify local-node prerequisites

```bash
pnpm --filter @aethelos/client-tauri check:local-node
```

## Build a signed binary

```bash
pnpm --filter @aethelos/relay build
pnpm --filter @aethelos/client-tauri desktop:build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## Signing & auto-update

- Configure code-signing per platform (Authenticode on Windows, notarization on
  macOS) in your CI release workflow.
- The updater is configured in `src-tauri/tauri.conf.json`; point `endpoints` at
  your release host and sign updates with your Tauri updater key.
