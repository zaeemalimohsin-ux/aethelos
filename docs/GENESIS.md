# Genesis bootstrap (operator guide)

> **User-facing path:** see [GET_STARTED.md](./GET_STARTED.md) — browser-first at [app.aethelos.org](https://app.aethelos.org), or Windows installer for desktop share links.

This guide is for **operators and developers** standing up a new cell from scratch.

## Recommended: hosted browser founder

1. Deploy the publish stack (Docker / nginx same-origin `/ws`) — see [PUBLISHER.md](./PUBLISHER.md).
2. Open your hosted URL → **Create identity** → **Start a community**.
3. **Invite people** → send link or QR. Joiners open the link in any browser.

### Admission flow (current product)

1. Joiner opens invite link → creates identity → **Join this community**
2. Joiner copies **join code** to inviter
3. Inviter **vouches** (Community tab)
4. Community **votes** Approve on admission proposal (Proposals tab)
5. Joiner taps **Accept invitation** when step 4/4 shows complete

## Desktop founder (Windows)

1. Install from [GitHub Releases](https://github.com/zaeemalimohsin-ux/aethelos/releases/latest).
2. Create identity → start community. Local relay + optional tunnel share URL for remote joiners.
3. Same admission steps as above.

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
