# Genesis bootstrap (operator guide)

> **User-facing path:** see [GET_STARTED.md](./GET_STARTED.md) — **Windows installer** (recommended for founders worldwide) or self-hosted browser deploy. Canonical `app.aethelos.org` is not live yet; see [README.md](../README.md).

This guide is for **operators and developers** standing up a new cell from scratch.

## Recommended: Windows desktop founder

1. Install from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest).
2. Create identity → start community. Local relay + public share URL for remote joiners.
3. Same join flow as [GET_STARTED.md](./GET_STARTED.md).

## Self-hosted / operator browser founder

1. Deploy the publish stack (Docker / nginx same-origin `/ws`) — see [PUBLISHER.md](./PUBLISHER.md).
2. Open your hosted URL → **Create identity** → **Start a community**.
3. **Invite people** → send link or QR. Joiners open the link in any browser.

### Admission flow

Joiners follow [GET_STARTED.md](./GET_STARTED.md) § Join a community (vouch → stake-weighted vote → Accept invitation).

## Developer desktop (Windows)

Same as **Windows desktop founder** above; use `Start-AethelOS.bat` for a one-click local relay + client during development.

## Relay mailboxes on the ledger

Communities can publish connection points with `relay_contribute` events. Joiners merge ledger-published mailboxes with session relays — see [PUBLISHER.md](./PUBLISHER.md) and `recovery-relay-switch.spec.ts`.

Default client bootstrap list is empty (`DEFAULT_BOOTSTRAP_RELAYS: []`) by design: genesis must use same-origin publish, desktop sidecar, or operator-configured mailboxes.

## Developer local stack

```bash
pnpm install
pnpm --filter @aethelos/core build
pnpm dev:relay   # ws://localhost:8787
pnpm dev:client  # http://localhost:5173
```

Use `Start-AethelOS.bat` on Windows for a one-click local relay + client.

**Do not** use outdated “Person B accepts before vote” flows — admission is always vouch → stake-weighted vote → accept.
