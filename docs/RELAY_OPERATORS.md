# Relay Operator Guide

A Relay is a **powerless** message relay. It holds no ledger, no keys, and no
authority — only a transient, bounded buffer so offline Nodes can catch up.
Running one is a public good, not a position of power. Anyone can run one; Nodes
can use several at once and switch freely.

## Run with Docker (recommended)

```bash
docker compose up -d --build
# Relay: ws://your-host:8787
# Health: http://your-host:8787/healthz
# Metrics: http://your-host:8787/metrics
```

## Run from source

```bash
pnpm install
pnpm --filter @aethelos/core build
pnpm --filter @aethelos/relay build
node packages/relay/dist/index.js
```

## Configuration (environment variables)

| Variable          | Default     | Purpose                                  |
| ----------------- | ----------- | ---------------------------------------- |
| `PORT`            | `8787`      | Listen port                              |
| `MAX_BUFFER`      | `10000`     | Max buffered messages per namespace      |
| `BUFFER_TTL_MS`   | `86400000`  | How long catch-up messages are retained  |
| `MAX_MSG_BYTES`   | `262144`    | Max inbound message size (DoS guard)     |
| `RATE_LIMIT`      | `100`       | Messages per window per connection       |
| `RATE_WINDOW_MS`  | `10000`     | Rate-limit window                        |
| `MAX_CONNECTIONS` | `5000`      | Max concurrent connections               |

## TLS (wss\://)

Browsers on `https://` pages can only open `wss://` sockets. Terminate TLS at a
reverse proxy in front of the relay.

### Caddy (automatic HTTPS)

```caddy
relay.example.org {
  reverse_proxy localhost:8787
}
```

### Nginx

```nginx
server {
  listen 443 ssl;
  server_name relay.example.org;
  ssl_certificate     /etc/letsencrypt/live/relay.example.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/relay.example.org/privkey.pem;

  location / {
    proxy_pass http://localhost:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

Nodes then use `wss://relay.example.org`.

## Desktop peer mailboxes (optional)

The desktop app can share a mailbox from a member's PC while it is awake. For founding
and invites, the primary path is **Start-AethelOS.bat** (one public URL for app + `/ws`
relay). Desktop mailboxes are an optional resilience layer:

1. Build the relay: `pnpm --filter @aethelos/relay build`
2. Run the desktop app — it spawns the relay on `127.0.0.1:8787` and may open a public tunnel when cloudflared is available
3. The public `wss://` URL is published on the community ledger via `relay_contribute`

Without a public tunnel, the mailbox works on the local network only. Toggle sharing off
in the Connection card to publish `relay_revoke` and stop the local relay.

See [packages/client-tauri/README.md](../packages/client-tauri/README.md).

## Listing your relay in the bootstrap fallback pool

Peer mailboxes (`relay_contribute` on the community ledger) are the primary model.
The bootstrap pool is a **silent fallback** for brand-new communities with no shared
mailboxes yet. Independent operators can still get listed by:

1. **Release build:** maintainers replace placeholder URLs in
   `packages/client/src/app/bootstrap-relays.default.ts`, or set
   `VITE_BOOTSTRAP_RELAYS` at build time with several `wss://` endpoints.
2. **Community ledger:** any member publishes their mailbox with `relay_contribute`
   (desktop app toggle, or troubleshooting relay add).
3. **Power users:** run a VPS relay per this guide and add it under **Connection → Troubleshooting**.

Each new community receives a **deterministic subset** of the pool (hash of its namespace ID).
That spreads load across operators without asking users to choose a relay.

Requirements to be a good bootstrap candidate:

- Public `wss://` endpoint with working `GET /healthz`
- Reasonable uptime; messages are ephemeral but catch-up depends on availability
- No authority over community state — you only buffer signed events

## Federation & resilience

There is no clustering protocol and none is needed — relays are stateless.

- Run **several independent relays** in different locations/providers.
- Communities list multiple relays; each Node connects to all of them at once
  and fails over automatically.
- A hostile or failed relay is simply dropped — switching costs nothing because
  the relay never held authority.

## Monitoring

- `GET /healthz`, `/livez`, `/readyz` for liveness/readiness probes.
- `GET /metrics` returns JSON counters (connections, messages, rejections,
  uptime, namespaces). Scrape with your monitoring of choice.

## What a relay can and cannot do

- It **can** drop, delay, or fail to deliver messages → mitigated by running
  several relays.
- It **cannot** forge, alter, or fabricate state → every Node verifies Ed25519
  signatures and re-derives state locally. A lying relay is detected and ignored.
