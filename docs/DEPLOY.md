# Production Deploy

This guide covers a minimal two-person genesis on real infrastructure. AethelOS is
local-first: the relay is a dumb bulletin board; your community state lives on
participants' devices.

## Overview

```
┌─────────────┐     WebSocket      ┌─────────────┐
│  Client PWA │ ◄───────────────► │    Relay    │
│  (static)   │                    │  (Docker)   │
└─────────────┘                    └─────────────┘
       ▲
       │ same relay URL
       ▼
┌─────────────┐
│  Client PWA │
│  (Person B) │
└─────────────┘
```

## 1. Relay

From the repo root:

```bash
docker compose up -d --build
```

Default listen: `ws://localhost:8787` with `/healthz` and `/metrics`.

For production, put the relay behind a reverse proxy with TLS so clients use
`wss://relay.yourdomain.org`. See [RELAY_OPERATORS.md](./RELAY_OPERATORS.md).

## 2. Client build

Peer mailboxes are the default story: desktop founders share a mailbox from their PC
(`relay_contribute` on the ledger). The **bootstrap relay pool** below is a silent
fallback only — used when nobody in the community has published a mailbox yet.

```bash
# packages/client/.env (or export before build)
# Optional: same-origin companion relay (prepended to the fallback pool)
VITE_DEFAULT_RELAY_URL=wss://relay.yourdomain.org

# Optional fallback for official hosted builds when no peer mailboxes exist yet
VITE_BOOTSTRAP_RELAYS=wss://relay-a.example.org,wss://relay-b.example.org,wss://relay-c.example.org
```

Alternatively, edit `packages/client/src/app/bootstrap-relays.default.ts` before
building (replace the `REPLACE` placeholder slots with real `wss://` URLs).

```bash
pnpm install
pnpm --filter @aethelos/client build
```

Host the `packages/client/dist` folder on any static host (Netlify, Cloudflare
Pages, S3 + CloudFront, nginx, etc.). Security headers ship in
`packages/client/public/_headers`.

## 3. Two-person genesis

Follow [GENESIS.md](./GENESIS.md):

1. **Person A** opens the desktop app, creates an identity, starts a community.
   Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) on their PC for friends abroad — the app opens a free public tunnel automatically.
2. **Person A** shares a signed invite link from the Community tab (includes all reachable mailboxes — localhost is excluded).
3. **Person B** opens the link, creates an identity, joins.
4. **Person A** sends the on-chain invite with a Vouch Bond; **Person B** accepts.

Both devices should converge on the same member list and balances within seconds
of relay sync.

## 4. Verify

- Relay health: `curl https://relay.yourdomain.org/healthz`
- Both clients show the same epoch, members, and share percentages
- `pnpm test` in `packages/core` validates deterministic reduction locally

## 5. Scaling past ~50 members

When a Cell approaches the soft cap, the Head spawns a **sub-Cell** (new
namespace) rather than widening the parent. Link parent and child via governance
proposals on both sides. See the **Sub-Cells** section in [GENESIS.md](./GENESIS.md).

## 6. Honest boundaries

What works today on a single Cell:

- Trade, governance, invites, proposals, epoch decay, multi-relay sync

What is proposal-scaffolded but not fully federated yet:

- Superstructure parent pools, cross-Cell bridging, escrow consumption upward

Plan federation only when you have real parent/child Cells to link.

## Relay failover

If a relay fails, add or switch to another URL under **Community → Connection → Troubleshooting**.
Nodes re-sync from local event logs plus the new relay cache. No authority is lost
because the relay never held state.
