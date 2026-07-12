# Publisher guide

Deploy AethelOS for operators: same-origin PWA + relay, TLS, and preflight. End users start at [GET_STARTED.md](./GET_STARTED.md).

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
3. Put TLS in front of port 8080 — copy [`deploy/Caddyfile.example`](../deploy/Caddyfile.example) and replace `your-domain.example`, or use Traefik with WebSocket upgrade to `/ws`.
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

## Managed demo (Hugging Face Spaces)

Optional public demo — **not** the canonical publisher path. Use `docker compose` for production-style deploys.

1. Root [`Dockerfile`](../Dockerfile) builds PWA + relay in one container (same-origin `/ws`).
2. Hugging Face injects `PORT=7860` at runtime; Render and other hosts use `PORT=10000` (see [`render.yaml`](../render.yaml)).
3. [`deploy-hf.yml`](../.github/workflows/deploy-hf.yml) syncs to the Space **after green CI on `main`**, restarts the Space if paused, then polls preflight on `https://thegritz-aethelos.hf.space` (custom `app.aethelos.org` needs DNS — see [`deploy/Caddyfile.example`](../deploy/Caddyfile.example)).
4. Space README front matter should set `app_port: 7860` (see root [`README.md`](../README.md)).



**HF Space paused (operator):** If deploy fails with PAUSED / flagged abusive, unpause [TheGritz/aethelos](https://huggingface.co/spaces/TheGritz/aethelos) in Space settings or contact Hugging Face support. Until then, distribute via [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest) or self-host with docker compose.
For a permanent URL you control, prefer **Option A** (VPS + compose) or **Option B** (named Cloudflare Tunnel) below.

## Publisher preflight (before sharing your URL)

Run these checks **after** your stack is live and **before** sending the link to users:

```bash
./scripts/publisher-preflight.sh https://your-domain
```

For local compose smoke:

```bash
./scripts/publisher-preflight.sh http://localhost:8080
```

**What it checks:**

| Check | Endpoint | Pass criteria |
|-------|----------|---------------|
| Relay direct | `http://localhost:8787/healthz` | HTTP 200 |
| App health via proxy | `https://your-domain/healthz` | HTTP 200 |
| PWA shell | `https://your-domain/` | HTML served |
| WebSocket | `wss://your-domain/ws` | `publish-ws-smoke.mjs` connects |

CI runs this against `http://localhost:8080` in the `docker-founder` job.

**Do not share** quick-tunnel or ephemeral URLs for long-term communities — use a permanent hostname (see Option A/B above).

## Ledger-published relay mailboxes

Communities can record connection points on-chain with `relay_contribute` events. Clients merge ledger-published mailboxes with session relays (`active-relays.ts`) so joiners discover operator-published endpoints without a global bootstrap fleet. Default `DEFAULT_BOOTSTRAP_RELAYS` stays empty — genesis uses same-origin `/ws`, desktop sidecar, or ledger/session mailboxes.

E2E: `recovery-relay-switch.spec.ts` (Charter D relay swap).

`Build-Release.bat` / `pnpm release:desktop` is the **maintainer** build path, not the friend install story (use GitHub Releases).

Internal Android proof setup: [TESTING_RELEASE.md](./TESTING_RELEASE.md#tier-4-android-prerequisites-windows).


## Release verification

```bash
pnpm verify:release
```

Runs typecheck, unit tests, user-doc grep, and local E2E. CI also runs `docker-founder` (same-origin publish stack). On Windows, `pnpm proof:product` exercises desktop share URL + mobile tunnel E2E + release installer.

Tag **v0.2.5** (or the current root `package.json` version) before distribution. Run [publisher preflight](#publisher-preflight-before-sharing-your-url) on the public URL.

Full sign-off on Windows: `pnpm proof:product`.
