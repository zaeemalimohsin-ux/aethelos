# AethelOS Desktop (Tauri)

A signed desktop shell (Windows/macOS/Linux) wrapping the **same** `@aethelos/client`
PWA and `@aethelos/core` engine. One Reducer, zero drift. The desktop build is
opt-in and kept out of the default monorepo build so contributors do not need a
Rust toolchain.

## Why a desktop build at all?

The PWA already runs on any browser, including mobile — that is the primary path.
The desktop shell adds:

- On-device Event Log files and an always-available local node.
- **Optional peer mailbox** — host a community mailbox on your PC while it is awake.
- OS integration (signed installers via GitHub Releases).

It introduces no new gatekeeper — it is distributed directly, not via an app store.

## Quick install (Windows)

1. **Everyday users:** download the Windows installer from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) (v0.2.5).
2. **Developers:** [`Start-AethelOS.bat`](../../Start-AethelOS.bat) at repo root.
3. **Maintainers:** [`Build-Release.bat`](../../Build-Release.bat) to produce `dist/releases/*.exe`.

Release builds bundle relay + Node — recipients do not install Node separately. The app connects automatically; operators tune hosting on the **Connection** tab.

## Peer hosting (optional)

Before `desktop:dev`, prepare the relay sidecar (or use `Start-AethelOS.bat` which builds it):

```bash
pnpm install
pnpm --filter @aethelos/relay build
```

The desktop app can spawn a local relay and, when cloudflared is available, publish a
public reach URL automatically. Founders invite people from **Community → Invite people**.
See [GET_STARTED.md](../../docs/GET_STARTED.md).

The Connection card shows mailbox sharing status and guidance when a public URL is not
available.

## Prerequisites

- [Rust](https://rustup.rs/) (stable, >= 1.77)
- [Node.js](https://nodejs.org/) (>= 20) — used to spawn the relay sidecar
- Platform build tools (see the Tauri prerequisites for your OS)
- Tauri CLI: `pnpm --filter @aethelos/client-tauri add -D @tauri-apps/cli`

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
pnpm release:desktop
# or Build-Release.bat on Windows
```

Artifacts land in `dist/releases/` (and `src-tauri/target/release/bundle/`).

## Signing

Configure code-signing per platform (Authenticode on Windows, notarization on macOS) in
your CI release workflow. Auto-update is not enabled in v0.1.x.
