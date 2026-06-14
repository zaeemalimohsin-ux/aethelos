# Publisher guide (internal)

Technical deploy, CI, and permanent URLs. **Not for regular users** — see [GET_STARTED.md](./GET_STARTED.md).

Formerly split across DEPLOY.md; this is the single operator entry point.

## Architecture (same-origin relay)

When the PWA and relay share one host, a reverse proxy forwards WebSocket traffic:

```
https://your-host/          → static PWA
wss://your-host/ws          → relay (port 8787)
https://your-host/healthz   → app health
```

The client resolves `wss://{host}/ws` at runtime — no bootstrap placeholders required.

## Quick publisher deploy (Windows)

```powershell
powershell -File scripts\publisher-deploy.ps1
```

Starts the Docker stack on port 8080 (CI/publisher path only). Regular users use **Start-AethelOS.bat** instead.

## Permanent URL (~15 minutes)

### Option A — VPS + Docker Compose

1. Provision a small Linux VPS with Docker installed.
2. Clone the repo and copy [`docker-compose.env.example`](../docker-compose.env.example) to `.env.docker`.
3. Put TLS in front of port 8080 (Caddy or Traefik).
4. Run:

```bash
docker compose --env-file .env.docker up -d --build
```

5. Point DNS at the VPS. Users open `https://your-domain/`.

Helper: [`scripts/deploy-compose.sh`](../scripts/deploy-compose.sh)

Set `VITE_INVITE_BASE_URL` only when the public invite URL differs from where you serve the PWA.

### Option B — Named Cloudflare Tunnel

1. Run the Docker stack (`docker compose up -d`).
2. Create a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) with a **named hostname** (not quick tunnel).
3. Route `https://aethelos.yourdomain.com` → `http://localhost:8080`.

Quick `trycloudflare.com` URLs are dev fallbacks only — not the long-term product story.

## Docker stack (relay + client)

```bash
docker compose --env-file .env.docker up -d --build
```

Relay direct: `curl http://localhost:8787/healthz`  
Through nginx client: `curl http://localhost:8080/healthz`

See [RELAY_OPERATORS.md](./RELAY_OPERATORS.md) for relay-only hosting.

## Client build overrides

```bash
VITE_DEFAULT_RELAY_URL=wss://relay.yourdomain.org
VITE_BOOTSTRAP_RELAYS=wss://relay-a.example.org,...
VITE_INVITE_BASE_URL=https://app.yourdomain.org
```

```bash
pnpm install
pnpm --filter @aethelos/client build
```

Host `packages/client/dist` with [`nginx.conf`](../packages/client/nginx.conf) or use the provided Dockerfile.

## Release verification

```bash
pnpm verify:release
```

Runs typecheck, unit tests, user-doc grep, and E2E (including docker-founder). On Windows, also runs `pnpm proof:product` (desktop share URL, mobile E2E, Android smoke, release exe).

### Android emulator smoke

With an emulator running in Android Studio:

```powershell
pnpm android:smoke -- -Url https://your-share-url.trycloudflare.com -WaitSeconds 30 -Screenshot
```

Optional: `scripts/start-android-emulator.ps1` starts the first configured AVD.

Full sign-off on Windows: `pnpm proof:product`.

## Two-person genesis (test)

See [GENESIS.md](./GENESIS.md).

## Scaling, boundaries, failover

See [GENESIS.md](./GENESIS.md) for sub-Cells, honest boundaries, and relay failover.
