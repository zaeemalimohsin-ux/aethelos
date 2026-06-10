# Quick start — you and a friend abroad

Plain steps to connect two people on different continents without copying relay URLs.

## What you need

| Who | What |
|-----|------|
| **You (founder)** | AethelOS **desktop app**, your PC awake, [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed |
| **Your friend** | Any device with a browser (or the desktop app) — no relay setup |

## One-time setup (founder)

1. Install [Rust](https://rustup.rs/) if you are building the desktop app yourself.
2. From the repo root:

```bash
pnpm install
pnpm --filter @aethelos/relay build
pnpm --filter @aethelos/client-tauri check:local-node
```

3. Install **cloudflared** and confirm it runs:

```bash
cloudflared --version
```

4. Start the desktop app:

```bash
pnpm --filter @aethelos/client-tauri desktop:dev
```

## Create and share (founder)

1. Create an identity and unlock it.
2. **Start a community** — enter a name and tap Create.
3. Open the **Connection** card. You should see:
   - **Ready for friends abroad** — tunnel worked; safe to share the invite link.
   - **Install cloudflared…** — tunnel failed; friends far away cannot connect until cloudflared is installed.
4. Go to **Invite someone** → **Share invite link**. The link includes public mailboxes only (not `127.0.0.1`).
5. Send the link (chat, email, QR).

## Join (friend)

1. Open the invite link.
2. Create an identity (or unlock an existing one).
3. Tap **Join this community**.
4. Send your join code back to the founder so they can vouch for you.

Both apps connect to the same community mailboxes automatically.

## Optional: also share from your PC

Friends with the desktop app can toggle **Sharing from this computer** under Connection. That publishes their mailbox to the community list too (more resilience).

## Honest limits

- **Your PC must stay on** while you are sharing — the mailbox runs on your machine.
- **Browser tabs cannot host** a mailbox; they can only connect.
- **Tunnel URLs can change** if you restart. Toggle sharing off and on to republish.
- **Without cloudflared**, only people on your local network can use your mailbox.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Connection says “install cloudflared” | Install cloudflared, restart desktop app, toggle sharing on |
| Friend cannot connect | Confirm Connection shows “Ready for friends abroad” before sharing link |
| `check:local-node` fails on relay | Run `pnpm --filter @aethelos/relay build` |
| `cargo check` fails | Install Rust via rustup |
| Browser-only founder | Use desktop app to share, or configure `VITE_BOOTSTRAP_RELAYS` when building the PWA (see [DEPLOY.md](./DEPLOY.md)) |

## Verify locally (developers)

```bash
pnpm desktop:proof
pnpm --filter @aethelos/client test
pnpm --filter @aethelos/core test
pnpm --filter @aethelos/client test:e2e -- onboarding community
```

`pnpm desktop:proof` runs tunnel-smoke, Tauri `local_node` tests, and the two-person E2E join spec.
